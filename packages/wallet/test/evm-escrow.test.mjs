import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { evmTermsHash } from '../src/evm-terms.ts';
import * as escrowApi from '../src/evm-escrow.ts';
import {
  EvmEscrowError, EVENT_SIGNATURES, ERROR_SIGNATURES, FUNCTION_SIGNATURES, approveAmountFor, buildChainObservation, buildErc20Approve, buildFundNative,
  buildFundToken, buildGetTrade, buildRefund, buildRelease, buildTradeIdOf, buildWithdraw, decodeEscrowLog, decodeEscrowRevert, decodeTrade,
  selectorOf, stateFromLogs, topicOf, tradeMatchesTerms,
} from '../src/evm-escrow.ts';
import { parseChainObservation } from '../../schemas/index.ts';

const scenario = JSON.parse(await readFile(new URL('../../domain/test/fixtures/local-evm-scenario/scenario.json', import.meta.url), 'utf8'));
const abi = JSON.parse(await readFile(new URL('../../../contracts/evm/abi/BasicEscrow.json', import.meta.url), 'utf8'));
const { domain, sets } = scenario;
const native = sets.native.terms, erc20 = sets.erc20.terms;
const ESCROW = domain.verifyingContract;
const tradeIdNative = sets.native.expectedEvmTermsHash;
const hex = text => Buffer.from(text).toString('hex');
const word = value => BigInt(value).toString(16).padStart(64, '0');
const addr = a => `0x${'0'.repeat(24)}${a.slice(2)}`;
const ZERO = `0x${'0'.repeat(40)}`;
const throwsCode = (fn, code = 'INVALID_INPUT') => assert.throws(fn, error => error instanceof EvmEscrowError && error.code === code);

/** Canonical ABI signature of an ABI JSON item, expanding tuples. */
const typeOf = input => input.type === 'tuple' ? `(${input.components.map(typeOf).join(',')})` : input.type;
const signatureOf = item => `${item.name}(${item.inputs.map(typeOf).join(',')})`;

test('every selector, topic and error selector is pinned to the forge ABI', () => {
  const byType = type => abi.filter(item => item.type === type);
  for (const [name, signature] of Object.entries(FUNCTION_SIGNATURES)) {
    const item = byType('function').find(entry => entry.name === name);
    if (item) assert.equal(signatureOf(item), signature, name);
  }
  for (const name of ['fundNative', 'fundToken', 'release', 'refund', 'withdraw', 'tradeIdOf', 'getTrade']) assert.ok(name in FUNCTION_SIGNATURES, name);
  assert.deepEqual(Object.keys(EVENT_SIGNATURES).sort(), byType('event').map(item => item.name).sort(), 'all events covered, none extra');
  for (const item of byType('event')) assert.equal(signatureOf(item), EVENT_SIGNATURES[item.name]);
  assert.deepEqual(Object.keys(ERROR_SIGNATURES).sort(), byType('error').map(item => item.name).sort(), 'all custom errors covered');
  for (const item of byType('error')) assert.equal(signatureOf(item), ERROR_SIGNATURES[item.name]);
  // Known-answer: ERC-20 approve and a Solidity-documented event topic.
  assert.equal(selectorOf('approve(address,uint256)'), '095ea7b3');
  assert.equal(topicOf('Transfer(address,address,uint256)'), 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef');
});

test('tuple calldata layout: selector, offset, 14 head words, two string tails', () => {
  const call = buildFundNative(domain, native);
  assert.equal(call.to, ESCROW); assert.equal(call.value, native.amountBaseUnits); assert.equal(call.tradeId, tradeIdNative);
  const data = call.data.slice(2);
  assert.equal(data.slice(0, 8), selectorOf(FUNCTION_SIGNATURES.fundNative));
  assert.equal(data.slice(8, 72), word(32), 'single dynamic tuple argument at offset 0x20');
  const tuple = data.slice(72), w = i => tuple.slice(i * 64, i * 64 + 64);
  assert.equal(w(0), native.orderId); assert.equal(w(1), word(1)); assert.equal(w(2), word(14 * 32));
  assert.equal(w(3), word(14 * 32 + 64), 'one length word plus one padded data word precede the second string');
  assert.equal(w(4), addr(native.seller).slice(2)); assert.equal(w(5), addr(native.buyer).slice(2)); assert.equal(w(6), word(0)); assert.equal(w(7), word(0));
  assert.equal(w(8), word(native.amountBaseUnits)); assert.equal(w(9), native.privateAgreementHash); assert.equal(w(10), native.capabilitiesHash); assert.equal(w(11), native.sellerNonce);
  assert.equal(w(12), word(native.acceptBeforeSeconds)); assert.equal(w(13), word(native.escrowExpirySeconds));
  assert.equal(w(14), word('local-evm'.length)); assert.equal(w(15), hex('local-evm').padEnd(64, '0'));
  assert.equal(w(16), word('escrow-local-v1'.length)); assert.equal(w(17), hex('escrow-local-v1').padEnd(64, '0'));
  assert.equal(tuple.length, 18 * 64);
  const token = buildFundToken(domain, erc20);
  assert.equal(token.value, '0'); assert.equal(token.tradeId, sets.erc20.expectedEvmTermsHash);
  assert.equal(token.data.slice(2, 10), selectorOf(FUNCTION_SIGNATURES.fundToken));
  assert.equal(token.data.slice(10 + 64 + 6 * 64, 10 + 64 + 7 * 64), word(1), 'assetKind 1');
  assert.equal(buildTradeIdOf(domain, native).data.slice(10), call.data.slice(10));
});

test('simple calls round-trip and reject malformed arguments', () => {
  assert.equal(buildRelease(ESCROW, tradeIdNative).data, `0x${selectorOf('release(bytes32)')}${tradeIdNative}`);
  assert.equal(buildRefund(ESCROW, tradeIdNative).data, `0x${selectorOf('refund(bytes32)')}${tradeIdNative}`);
  assert.equal(buildGetTrade(ESCROW, tradeIdNative).data, `0x${selectorOf('getTrade(bytes32)')}${tradeIdNative}`);
  assert.equal(buildWithdraw(ESCROW, native.buyer, ZERO).data, `0x${selectorOf('withdraw(address,address)')}${addr(native.buyer).slice(2)}${'0'.repeat(64)}`);
  assert.equal(approveAmountFor(erc20), erc20.amountBaseUnits);
  assert.equal(buildErc20Approve(erc20.asset, ESCROW, approveAmountFor(erc20)).data, `0x095ea7b3${addr(ESCROW).slice(2)}${word(erc20.amountBaseUnits)}`);
  assert.equal(buildErc20Approve(erc20.asset, ESCROW, '0').data.endsWith('0'.repeat(64)), true, 'allowance reset is allowed');
});

const castPath = [`${homedir()}/.foundry/bin/cast`].find(existsSync);
test('calldata equals `cast calldata` for the same ABI signature (skipped without foundry)', { skip: castPath === undefined }, () => {
  const cast = (...args) => execFileSync(castPath, ['calldata', ...args], { encoding: 'utf8' }).trim();
  assert.equal(buildRelease(ESCROW, tradeIdNative).data, cast('release(bytes32)', `0x${tradeIdNative}`));
  assert.equal(buildWithdraw(ESCROW, native.buyer, ZERO).data, cast('withdraw(address,address)', native.buyer, ZERO));
  assert.equal(buildErc20Approve(erc20.asset, ESCROW, '12345').data, cast('approve(address,uint256)', ESCROW, '12345'));
  const tupleArg = t => `(0x${t.orderId},${t.revision},"${t.networkId}","${t.deploymentId}",${t.seller},${t.buyer},${t.assetKind === 'native' ? 0 : 1},${t.asset},${t.amountBaseUnits},0x${t.privateAgreementHash},0x${t.capabilitiesHash},0x${t.sellerNonce},${t.acceptBeforeSeconds},${t.escrowExpirySeconds})`;
  assert.equal(buildFundNative(domain, native).data, cast(FUNCTION_SIGNATURES.fundNative, tupleArg(native)));
  assert.equal(buildFundToken(domain, erc20).data, cast(FUNCTION_SIGNATURES.fundToken, tupleArg(erc20)));
  assert.equal(buildTradeIdOf(domain, native).data, cast(FUNCTION_SIGNATURES.tradeIdOf, tupleArg(native)));
  // Different-length strings exercise padding and offsets.
  const longer = { ...native, networkId: 'n'.repeat(33), deploymentId: 'd'.repeat(64) };
  assert.equal(buildFundNative(domain, longer).data, cast(FUNCTION_SIGNATURES.fundNative, tupleArg(longer)));
});

test('hostile inputs are rejected with typed INVALID_INPUT', () => {
  const mutate = patch => ({ ...native, ...patch });
  for (const patch of [{ amountBaseUnits: '0' }, { amountBaseUnits: '01' }, { amountBaseUnits: '-1' }, { amountBaseUnits: `${2n ** 256n}` }, { amountBaseUnits: 1 },
    { revision: '0' }, { acceptBeforeSeconds: `${2n ** 64n}` }, { seller: native.buyer }, { buyer: native.buyer.toUpperCase().replace('0X', '0x') },
    { buyer: ZERO }, { buyer: ESCROW }, { seller: ESCROW }, { orderId: `0x${native.orderId}` }, { networkId: 'a/b' }, { networkId: '' }, { deploymentId: 'x'.repeat(65) },
    { asset: erc20.asset }, { assetKind: 'bogus' }]) {
    throwsCode(() => buildFundNative(domain, mutate(patch)));
  }
  throwsCode(() => buildFundNative(domain, { ...native, extra: '1' }), 'INVALID_INPUT');
  const { orderId: _orderId, ...missing } = native; throwsCode(() => buildFundNative(domain, missing));
  throwsCode(() => buildFundNative(domain, null)); throwsCode(() => buildFundNative(null, native));
  throwsCode(() => buildFundNative({ chainId: '0', verifyingContract: ESCROW }, native));
  throwsCode(() => buildFundNative({ chainId: '31337', verifyingContract: ESCROW.toUpperCase() }, native));
  // kind/function mismatch can never reach the contract's InvalidTerms path
  throwsCode(() => buildFundNative(domain, erc20)); throwsCode(() => buildFundToken(domain, native));
  throwsCode(() => buildFundToken(domain, { ...erc20, asset: ZERO }));
  throwsCode(() => approveAmountFor(native)); throwsCode(() => approveAmountFor({ ...erc20, amountBaseUnits: '0' }));
  for (const id of ['', '0x' + 'a'.repeat(64), 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 7, null]) {
    throwsCode(() => buildRelease(ESCROW, id)); throwsCode(() => buildRefund(ESCROW, id)); throwsCode(() => buildGetTrade(ESCROW, id));
  }
  throwsCode(() => buildRelease('0x1234', tradeIdNative));
  throwsCode(() => buildWithdraw(ESCROW, ZERO, ZERO)); throwsCode(() => buildWithdraw(ESCROW, native.buyer, 'native'));
  throwsCode(() => buildErc20Approve(erc20.asset, ESCROW, '-1')); throwsCode(() => buildErc20Approve(erc20.asset, ESCROW, `${2n ** 256n}`)); throwsCode(() => buildErc20Approve(ZERO, ESCROW, '1'));
  assert.equal(Object.isFrozen(buildRelease(ESCROW, tradeIdNative)), true);
  assert.equal(Object.keys(escrowApi).some(name => /^(sign|send|fetch|request|rpc)/i.test(name)), false, 'no signing/transport surface');
});

// ---- event decoding ----
const t = value => `0x${value}`;
const idTopic = id => t(id);
const log = (name, topics, data) => ({ address: ESCROW, topics: [t(topicOf(EVENT_SIGNATURES[name])), ...topics], data: `0x${data}` });
const funded = log('Funded', [idTopic(tradeIdNative), addr(native.seller), addr(native.buyer)], word(0) + word(native.amountBaseUnits) + word(native.escrowExpirySeconds));
const released = log('Released', [idTopic(tradeIdNative), addr(native.buyer)], word(0) + word(native.amountBaseUnits));
const refunded = log('Refunded', [idTopic(tradeIdNative), addr(native.seller), addr('0x' + '99'.repeat(20))], word(0) + word(native.amountBaseUnits));

test('decodes every escrow event', () => {
  assert.deepEqual({ ...decodeEscrowLog(ESCROW, funded) }, { kind: 'Funded', tradeId: tradeIdNative, seller: native.seller, buyer: native.buyer, token: ZERO, amount: native.amountBaseUnits, deadline: native.escrowExpirySeconds });
  assert.deepEqual({ ...decodeEscrowLog(ESCROW, released) }, { kind: 'Released', tradeId: tradeIdNative, buyer: native.buyer, token: ZERO, amount: native.amountBaseUnits });
  assert.deepEqual({ ...decodeEscrowLog(ESCROW, refunded) }, { kind: 'Refunded', tradeId: tradeIdNative, seller: native.seller, caller: `0x${'99'.repeat(20)}`, token: ZERO, amount: native.amountBaseUnits });
  const deferred = log('PayoutDeferred', [idTopic(tradeIdNative), addr(native.buyer)], word(erc20.asset) + word(5));
  assert.equal(decodeEscrowLog(ESCROW, deferred).kind, 'PayoutDeferred'); assert.equal(decodeEscrowLog(ESCROW, deferred).token, erc20.asset);
  const withdrawn = log('Withdrawn', [addr(native.buyer), addr(native.buyer)], word(0) + word(5));
  assert.deepEqual({ ...decodeEscrowLog(ESCROW, withdrawn) }, { kind: 'Withdrawn', recipient: native.buyer, caller: native.buyer, token: ZERO, amount: '5' });
  assert.equal(decodeEscrowLog(ESCROW, { ...funded, address: ESCROW.toUpperCase().replace('0X', '0x') }).kind, 'Funded', 'node casing is normalized');
});

test('hostile or foreign logs are INTEGRITY_FAILURE', () => {
  const corrupt = value => throwsCode(() => decodeEscrowLog(ESCROW, value), 'INTEGRITY_FAILURE');
  corrupt({ ...funded, address: `0x${'ee'.repeat(20)}` });
  corrupt({ ...funded, topics: [] }); corrupt({ ...funded, topics: funded.topics.slice(0, 3) });
  corrupt({ ...funded, topics: [t('00'.repeat(32)), ...funded.topics.slice(1)] });
  corrupt({ ...funded, topics: [funded.topics[0], 'zz', ...funded.topics.slice(2)] });
  corrupt({ ...funded, data: funded.data.slice(0, -64) }); corrupt({ ...funded, data: `${funded.data}00` }); corrupt({ ...funded, data: '0x1' });
  corrupt({ ...funded, topics: [funded.topics[0], funded.topics[1], t('ff'.repeat(32)), funded.topics[3]] });
  corrupt({ ...funded, data: `0x${word(0)}${word(1)}${word(2n ** 64n)}` });
  corrupt({ ...funded, data: `0x${word(2n ** 160n)}${word(1)}${word(1)}` });
  corrupt(null); corrupt({ address: ESCROW, topics: 'x', data: '0x' }); corrupt({ address: ESCROW, topics: funded.topics });
  throwsCode(() => decodeEscrowLog('0xABC', funded));
});

test('state from logs accepts only the legal lifecycle and ignores other trades', () => {
  assert.equal(stateFromLogs(ESCROW, tradeIdNative, []), 'absent');
  assert.equal(stateFromLogs(ESCROW, tradeIdNative, [funded]), 'funded');
  assert.equal(stateFromLogs(ESCROW, tradeIdNative, [funded, released]), 'released');
  assert.equal(stateFromLogs(ESCROW, tradeIdNative, [funded, refunded]), 'refunded');
  const other = { ...funded, topics: [funded.topics[0], t('12'.repeat(32)), ...funded.topics.slice(2)] };
  assert.equal(stateFromLogs(ESCROW, tradeIdNative, [other]), 'absent');
  const deferred = log('PayoutDeferred', [idTopic(tradeIdNative), addr(native.buyer)], word(0) + word(5));
  assert.equal(stateFromLogs(ESCROW, tradeIdNative, [funded, released, deferred]), 'released');
  for (const bad of [[released], [funded, funded], [funded, released, refunded], [funded, refunded, released], [released, funded], [deferred], [funded, deferred]]) {
    throwsCode(() => stateFromLogs(ESCROW, tradeIdNative, bad), 'INTEGRITY_FAILURE');
  }
});

// ---- getTrade + observation ----
const tradeData = (state, over = {}) => `0x${[over.seller ?? native.seller, over.deadline ?? native.escrowExpirySeconds, state, over.buyer ?? native.buyer, over.token ?? ZERO, over.amount ?? native.amountBaseUnits]
  .map((value, index) => index === 1 || index === 2 || index === 5 ? word(value) : addr(value).slice(2)).join('')}`;
const binding = { chain: 'evm', networkId: 'local-evm', deploymentId: 'escrow-local-v1', tradeId: tradeIdNative };
const anchor = { height: '12', hash: `0x${'ab'.repeat(32)}` };
const observe = (state, extra = {}) => buildChainObservation(ESCROW, { binding, generation: 3, requestSequence: 7, getTradeReturn: state, anchor, finality: 'confirmed', observedAt: 1000, ...extra });

test('decodes getTrade and matches it to terms', () => {
  const trade = decodeTrade(tradeData(1));
  assert.deepEqual({ ...trade }, { state: 'funded', seller: native.seller, buyer: native.buyer, token: ZERO, amount: native.amountBaseUnits, deadline: native.escrowExpirySeconds });
  assert.equal(tradeMatchesTerms(trade, native), true);
  assert.equal(tradeMatchesTerms({ ...trade, buyer: `0x${'77'.repeat(20)}` }, native), false, 'substituted buyer');
  assert.equal(tradeMatchesTerms({ ...trade, amount: '1' }, native), false);
  assert.equal(decodeTrade(`0x${'00'.repeat(192)}`).state, 'absent');
  const badData = value => throwsCode(() => decodeTrade(value), 'INTEGRITY_FAILURE');
  badData(tradeData(4)); badData(`0x${'00'.repeat(191)}`); badData(`0x${'00'.repeat(224)}`); badData('0x'); badData('nope');
  badData(tradeData(0)); // absent must be all zero
  badData(`0x${'00'.repeat(192 - 32)}${word(1)}`); // absent with amount
  badData(tradeData(1, { amount: '0' })); badData(tradeData(1, { buyer: ZERO }));
  badData(`0x${'ff'.repeat(12)}${'00'.repeat(20)}${tradeData(1).slice(2 + 64)}`); // dirty address padding
});

test('observations feed the domain schema and agree with logs', () => {
  for (const [index, state] of ['absent', 'funded', 'released', 'refunded'].entries()) {
    const data = index === 0 ? `0x${'00'.repeat(192)}` : tradeData(index);
    const observation = observe(data);
    assert.equal(observation.state, state);
    assert.deepEqual(parseChainObservation(observation), observation);
    assert.equal(observation.requestSequence, 7); assert.equal(observation.generation, 3); assert.equal(Object.isFrozen(observation), true);
  }
  assert.equal(observe(tradeData(2), { logs: [funded, released] }).state, 'released');
  throwsCode(() => observe(tradeData(2), { logs: [funded] }), 'INTEGRITY_FAILURE');
  throwsCode(() => observe(tradeData(1), { logs: [] }), 'INTEGRITY_FAILURE');
  throwsCode(() => observe(tradeData(1), { binding: { ...binding, chain: 'solana' } }));
  throwsCode(() => observe(tradeData(1), { binding: { ...binding, tradeId: `0x${tradeIdNative}` } }));
  throwsCode(() => observe(tradeData(1), { anchor: { height: '-1', hash: anchor.hash } }));
  throwsCode(() => observe(tradeData(1), { anchor: { height: '1', hash: 'ab' } }));
  throwsCode(() => observe(tradeData(1), { generation: -1 })); throwsCode(() => observe(tradeData(1), { finality: 'safe' }));
  throwsCode(() => observe(tradeData(1), { observedAt: 1.5 }));
});

test('decodes escrow revert data', () => {
  const stateErr = `0x${selectorOf(ERROR_SIGNATURES.InvalidState)}${tradeIdNative}${word(2)}`;
  assert.deepEqual({ ...decodeEscrowRevert(stateErr), args: [...decodeEscrowRevert(stateErr).args] }, { name: 'InvalidState', args: [tradeIdNative, '2'] });
  assert.equal(decodeEscrowRevert(`0x${selectorOf(ERROR_SIGNATURES.DeadlinePassed)}${word(1700086400)}`).name, 'DeadlinePassed');
  assert.equal(decodeEscrowRevert(`0x${selectorOf(ERROR_SIGNATURES.NothingToWithdraw)}`).name, 'NothingToWithdraw');
  assert.deepEqual([...decodeEscrowRevert(`0x${selectorOf(ERROR_SIGNATURES.Unauthorized)}${addr(native.buyer).slice(2)}`).args], [native.buyer]);
  for (const bad of ['0x', '0x1234', '0xdeadbeef', `0x${selectorOf(ERROR_SIGNATURES.InvalidState)}`, `0x${stateErr.slice(2)}00`, `0x${selectorOf(ERROR_SIGNATURES.InvalidState)}${tradeIdNative}${word(256)}`,
    `0x${selectorOf(ERROR_SIGNATURES.Unauthorized)}${'ff'.repeat(32)}`, `0x${selectorOf(ERROR_SIGNATURES.DeadlinePassed)}${word(2n ** 64n)}`]) {
    throwsCode(() => decodeEscrowRevert(bad), 'INTEGRITY_FAILURE');
  }
});

test('a substituted buyer changes the tradeId, so a release for the original id cannot name it', () => {
  const swapped = { ...native, buyer: `0x${'77'.repeat(20)}` };
  const swappedId = evmTermsHash(domain, swapped);
  assert.notEqual(swappedId, tradeIdNative);
  assert.equal(buildFundNative(domain, swapped).tradeId, swappedId);
  assert.notEqual(buildRelease(ESCROW, swappedId).data, buildRelease(ESCROW, tradeIdNative).data);
});
