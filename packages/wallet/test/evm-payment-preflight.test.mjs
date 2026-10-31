import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RegistryService } from '../../domain/index.ts';
import { evmTermsHash, keccak256 } from '../src/evm-terms.ts';
import { createEvmPaymentPreflight } from '../src/evm-payment-preflight.ts';

const template = JSON.parse(await readFile(new URL('../../domain/test/fixtures/local-evm-scenario/registry.json', import.meta.url)));
const scenario = JSON.parse(await readFile(new URL('../../domain/test/fixtures/local-evm-scenario/scenario.json', import.meta.url)));
const HEX = bytes => Buffer.from(bytes).toString('hex');
const CODE = '0x6000', ANCHOR = `0x${'12'.repeat(32)}`, OTHER = `0x${'13'.repeat(32)}`;
const word = value => BigInt(value).toString(16).padStart(64, '0');
const uint = value => `0x${BigInt(value).toString(16)}`;
const good = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const refused = (result, code) => { assert.equal(result.ok, false, JSON.stringify(result)); assert.equal(result.error.code, code); };

async function fixture(overrides = {}) {
  const raw = structuredClone(template), network = raw.networks[0];
  network.deployments[0].runtime.keccak256 = HEX(keccak256(Buffer.from(CODE.slice(2), 'hex')));
  const registry = new RegistryService(), encoded = new TextEncoder().encode(JSON.stringify(raw));
  good(await registry.load(encoded, HEX(new Uint8Array(await crypto.subtle.digest('SHA-256', encoded)))));
  const terms = { ...scenario.sets.native.terms, acceptBeforeSeconds: '2000', escrowExpirySeconds: '2401' };
  const domain = { chainId: network.chainIdentity, verifyingContract: network.deployments[0].address };
  const binding = { chain: 'evm', networkId: terms.networkId, deploymentId: terms.deploymentId, tradeId: evmTermsHash(domain, terms) };
  const state = { clock: 50, timestamp: 1500, latestTimestamp: null, latestHeight: 17, latestHash: OTHER,
    phase: 'funded', readCount: 0, headers: 0, code: CODE, stored: { ...terms }, ...overrides };
  const calls = [];
  const encodedTrade = () => state.phase === 'absent' ? `0x${word(0).repeat(6)}` : `0x${[
    state.stored.seller, state.stored.escrowExpirySeconds, ['absent', 'funded', 'released', 'refunded'].indexOf(state.phase),
    state.stored.buyer, state.stored.asset, state.stored.amountBaseUnits,
  ].map(word).join('')}`;
  const request = async args => {
    calls.push(structuredClone(args)); state.readCount++;
    if (state.intercept) { const answer = await state.intercept(args, state); if (answer !== undefined) return answer; }
    switch (args.method) {
      case 'eth_chainId': return '0x7a69';
      case 'eth_getBlockByNumber': {
        const tag = args.params[0];
        if (tag === '0x0') return { number: '0x0', hash: network.genesisHash, timestamp: '0x0' };
        if (tag === 'latest' || tag === uint(state.latestHeight) && state.latestHeight !== 16) return {
          number: uint(state.latestHeight), hash: state.latestHash, timestamp: uint(state.latestTimestamp ?? state.timestamp),
        };
        if (tag !== 'finalized') state.headers++;
        return { number: '0x10', hash: ANCHOR, timestamp: uint(state.timestamp) };
      }
      case 'eth_getCode': return state.code;
      case 'eth_call': return args.params[0].data.startsWith(state.tradeIdSelector ?? '0x00') ? `0x${binding.tradeId}` : encodedTrade();
      default: assert.fail(`Unexpected read method ${args.method}`);
    }
  };
  // These selectors are derived independently from the committed ABI signatures by the production builder.
  const { buildTradeIdOf } = await import('../src/evm-escrow.ts');
  state.tradeIdSelector = buildTradeIdOf(domain, terms).data.slice(0, 10);
  const options = { registry, binding, terms, request, monotonicNow: () => state.clock };
  return { state, calls, options, terms, binding, domain, raw, reader: good(createEvmPaymentPreflight(options)) };
}

test('canonical finalized funded state yields read-only guidance; every call is anchored and bounded', async () => {
  const f = await fixture(), value = good(await f.reader.read());
  assert.equal(value.evidence, 'native-rpc'); assert.equal(value.economicPreparationAllowed, false);
  assert.equal(value.decision, 'allow-guidance'); assert.equal(value.reason, 'ok'); assert.equal(value.remainingSeconds, '901');
  assert.equal(value.finalizedAnchor, ANCHOR); assert.deepEqual(value.binding, f.binding);
  assert.ok(Object.isFrozen(value)); assert.ok(Object.isFrozen(value.binding));
  const allowed = new Set(['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call']);
  assert.ok(f.calls.every(call => allowed.has(call.method)));
  assert.ok(f.calls.filter(call => ['eth_call', 'eth_getCode'].includes(call.method)).every(call => call.params[1] === '0x10'));
  assert.ok(f.calls.length <= 12); assert.deepEqual(good(f.reader.view()), value);
});

test('lagging finalized state cannot overstate the latest chain-time payment buffer', async () => {
  const f = await fixture({ timestamp: 100, latestTimestamp: 1501 });
  const near = good(await f.reader.read());
  assert.equal(near.reason, 'near-expiry'); assert.equal(near.decision, 'block'); assert.equal(near.remainingSeconds, '900');
  assert.equal(near.checkedChainTime, '1501'); assert.equal(near.finalizedAnchor, ANCHOR);
  assert.equal(near.chainTimeAnchor, OTHER);
  f.state.latestTimestamp = 1500;
  const far = good(await f.reader.read()); assert.equal(far.remainingSeconds, '901'); assert.equal(far.decision, 'allow-guidance');
});

test('latest chain clock must be at or beyond finalized height/time and both anchors must remain canonical', async () => {
  for (const patch of [{ latestHeight: 15 }, { latestTimestamp: 1499 }, { latestHeight: 16, latestHash: OTHER }]) {
    const f = await fixture(patch); refused(await f.reader.read(), 'INTEGRITY_FAILURE'); refused(f.reader.view(), 'UNAVAILABLE');
  }
  const same = await fixture({ latestHeight: 16, latestHash: ANCHOR }); assert.equal(good(await same.reader.read()).decision, 'allow-guidance');
  for (const field of ['hash', 'timestamp', 'number']) {
    const f = await fixture({ intercept: args => args.method === 'eth_getBlockByNumber' && args.params[0] === '0x11' ?
      { number: field === 'number' ? '0x12' : '0x11', hash: field === 'hash' ? ANCHOR : OTHER, timestamp: field === 'timestamp' ? '0x5dd' : '0x5dc' } : undefined });
    refused(await f.reader.read(), 'INTEGRITY_FAILURE'); refused(f.reader.view(), 'UNAVAILABLE');
  }
  for (const [answer, code] of [[null, 'UNAVAILABLE'], [{ number: '0x11', hash: OTHER, timestamp: '0x10000000000000000' }, 'INTEGRITY_FAILURE']]) {
    const f = await fixture({ intercept: args => args.method === 'eth_getBlockByNumber' && args.params[0] === 'latest' ? answer : undefined });
    refused(await f.reader.read(), code); refused(f.reader.view(), 'UNAVAILABLE');
  }
});

test('900 seconds blocks; unfinalized, absent and settled trades never allow payment guidance', async () => {
  const f = await fixture(); f.state.timestamp = 1501;
  assert.equal(good(await f.reader.read()).reason, 'near-expiry');
  for (const phase of ['absent', 'released', 'refunded']) {
    f.state.phase = phase; const value = good(await f.reader.read());
    assert.equal(value.decision, 'block'); assert.equal(value.reason, 'unfunded');
  }
  f.state.intercept = args => args.method === 'eth_getBlockByNumber' && args.params[0] === 'finalized' ? null : undefined;
  refused(await f.reader.read(), 'UNAVAILABLE'); refused(f.reader.view(), 'UNAVAILABLE');
});

test('freshness expires at 30 seconds, clock rollback and resume invalidate the cache', async () => {
  const f = await fixture(); good(await f.reader.read());
  f.state.clock += 29_999; assert.equal(good(f.reader.view()).decision, 'allow-guidance');
  f.state.clock += 1; assert.equal(good(f.reader.view()).reason, 'stale');
  f.state.clock = 50; assert.equal(good(f.reader.view()).reason, 'stale', 'staleness remains sticky');
  good(await f.reader.read()); f.state.clock = 49; assert.equal(good(f.reader.view()).reason, 'stale');
  good(await f.reader.read()); f.reader.invalidate(); refused(f.reader.view(), 'UNAVAILABLE');
  good(await f.reader.read()); f.reader.dispose(); refused(f.reader.view(), 'LOCKED'); refused(await f.reader.read(), 'LOCKED');
});

test('slow reads cannot refresh an observation that is already stale', async () => {
  const f = await fixture();
  f.state.intercept = args => { if (args.method === 'eth_call') f.state.clock = 30_050; };
  refused(await f.reader.read(), 'TIMEOUT'); refused(f.reader.view(), 'UNAVAILABLE');
});

test('different finalized recipients, principal, asset or expiry block guidance', async () => {
  for (const patch of [{ buyer: `0x${'21'.repeat(20)}` }, { seller: `0x${'22'.repeat(20)}` }, { amountBaseUnits: '1' },
    { asset: `0x${'23'.repeat(20)}` }, { escrowExpirySeconds: '2402' }]) {
    const f = await fixture(); f.state.stored = { ...f.terms, ...patch };
    const value = good(await f.reader.read()); assert.equal(value.reason, 'mismatch'); assert.equal(value.decision, 'block');
  }
});

test('wrong chain, genesis, runtime, on-chain digest and canonical anchor refuse native evidence', async () => {
  const cases = [
    [args => args.method === 'eth_chainId' ? '0x1' : undefined, 'WRONG_CHAIN'],
    [args => args.method === 'eth_getBlockByNumber' && args.params[0] === '0x0' ? { number: '0x0', hash: OTHER, timestamp: '0x0' } : undefined, 'WRONG_CHAIN'],
    [args => args.method === 'eth_getCode' ? '0x6001' : undefined, 'INTEGRITY_FAILURE'],
    [(args, state) => args.method === 'eth_call' && args.params[0].data.startsWith(state.tradeIdSelector) ? OTHER : undefined, 'INTEGRITY_FAILURE'],
    [(args, state) => args.method === 'eth_getBlockByNumber' && args.params[0] === '0x10' && state.headers >= 1 ? { number: '0x10', hash: OTHER, timestamp: '0x5dc' } : undefined, 'INTEGRITY_FAILURE'],
  ];
  for (const [intercept, code] of cases) {
    const f = await fixture({ intercept }); refused(await f.reader.read(), code); refused(f.reader.view(), 'UNAVAILABLE');
  }
});

test('snapshot validation refuses wrong bindings, unsupported assets and mutable deployment profiles before RPC', async () => {
  const f = await fixture();
  for (const patch of [{ binding: { ...f.binding, tradeId: 'ab'.repeat(32) } }, { terms: { ...f.terms, amountBaseUnits: '3' } }]) {
    refused(createEvmPaymentPreflight({ ...f.options, ...patch }), 'INVALID_INPUT');
  }
  const raw = f.raw.networks[0], deployed = raw.deployments[0];
  refused(createEvmPaymentPreflight({ ...f.options, registry: { network: () => raw, deployment: () => ({ ...deployed, runtime: { ...deployed.runtime, upgradeable: true } }) } }), 'UNSUPPORTED_PROVIDER');
  refused(createEvmPaymentPreflight({ ...f.options, registry: { network: () => ({ ...raw, assets: [] }), deployment: () => deployed } }), 'UNSUPPORTED_PROVIDER');
  assert.equal(f.calls.length, 0);
  f.terms.buyer = `0x${'33'.repeat(20)}`;
  assert.equal(good(await f.reader.read()).decision, 'allow-guidance', 'caller mutation cannot change the snapshot');
});

test('hostile native values and thrown objects normalize without reading getters or copying diagnostics', async () => {
  let getters = 0;
  const hostile = { get number() { getters++; throw Error('SECRET'); }, hash: ANCHOR, timestamp: '0x5dc' };
  const f = await fixture({ intercept: args => args.method === 'eth_getBlockByNumber' && args.params[0] === 'finalized' ? hostile : undefined });
  refused(await f.reader.read(), 'INTEGRITY_FAILURE'); assert.equal(getters, 0);
  const revoked = Proxy.revocable({}, {}); revoked.revoke();
  for (const thrown of [new Error('SECRET rpc credential'), revoked.proxy]) {
    f.state.intercept = () => { throw thrown; };
    const result = await f.reader.read(); refused(result, 'UNAVAILABLE'); assert.doesNotMatch(JSON.stringify(result), /SECRET|credential/);
  }
  f.state.intercept = args => args.method === 'eth_call' ? `0x${'00'.repeat(1_000_000)}` : undefined;
  refused(await f.reader.read(), 'INTEGRITY_FAILURE');
  f.state.intercept = args => args.method === 'eth_getBlockByNumber' && args.params[0] === 'finalized' ?
    { number: '0x10', timestamp: '0x5dc', hash: `0x${'AB'.repeat(1_000_000)}` } : undefined;
  refused(await f.reader.read(), 'INTEGRITY_FAILURE');
});

test('full uint256 native chain IDs remain compatible with the canonical EIP-712 domain', async () => {
  const f = await fixture(), network = structuredClone(f.raw.networks[0]);
  network.chainIdentity = (1n << 200n).toString();
  const domain = { ...f.domain, chainId: network.chainIdentity }, binding = { ...f.binding, tradeId: evmTermsHash(domain, f.terms) };
  f.state.intercept = args => args.method === 'eth_chainId' ? uint(network.chainIdentity) :
    args.method === 'eth_call' && args.params[0].data.startsWith(f.state.tradeIdSelector) ? `0x${binding.tradeId}` : undefined;
  const reader = good(createEvmPaymentPreflight({ ...f.options, binding,
    registry: { network: () => network, deployment: () => network.deployments[0] } }));
  assert.equal(good(await reader.read()).decision, 'allow-guidance');
});

test('local timing uncertainty blocks native publication without raw clock errors', async () => {
  for (const monotonicNow of [() => NaN, () => Infinity, () => -1, () => { throw Error('SECRET clock'); }]) {
    const f = await fixture(), reader = good(createEvmPaymentPreflight({ ...f.options, monotonicNow }));
    const result = await reader.read(); refused(result, 'UNAVAILABLE'); assert.doesNotMatch(JSON.stringify(result), /SECRET/);
    assert.equal(f.calls.length, 0);
  }
});

test('external abort and generation invalidation publish no late result or additional reads', async () => {
  for (const mode of ['abort', 'invalidate', 'dispose']) {
    let release;
    const f = await fixture({ intercept: args => args.method === 'eth_chainId' ? new Promise(resolve => { release = resolve; }) : undefined });
    const controller = new AbortController(), pending = f.reader.read(controller.signal);
    while (!release) await new Promise(resolve => setImmediate(resolve));
    if (mode === 'abort') controller.abort(); else f.reader[mode]();
    refused(await pending, mode === 'dispose' ? 'LOCKED' : 'CANCELLED');
    if (mode !== 'dispose') refused(await f.reader.read(), 'CONFLICT');
    release('0x7a69'); await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.length, 1); refused(f.reader.view(), mode === 'dispose' ? 'LOCKED' : 'UNAVAILABLE');
  }
});

test('timed-out reads hold the physical slot until drain, then permit a new explicit read', async () => {
  let release;
  const f = await fixture({ intercept: args => args.method === 'eth_chainId' ? new Promise(resolve => { release = resolve; }) : undefined });
  const reader = good(createEvmPaymentPreflight({ ...f.options, readTimeoutMs: 10 }));
  refused(await reader.read(), 'TIMEOUT'); refused(await reader.read(), 'CONFLICT');
  release('0x7a69'); await new Promise(resolve => setImmediate(resolve)); f.state.intercept = undefined;
  assert.equal(good(await reader.read()).decision, 'allow-guidance');
});
