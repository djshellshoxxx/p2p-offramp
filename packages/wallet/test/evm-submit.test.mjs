import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createEip1193ChainReader, escrowCallFor } from '../src/evm-submit.ts';
import { buildFundNative, buildGetTrade, buildRelease, buildRefund } from '../src/evm-escrow.ts';

const scenario = JSON.parse(await readFile(new URL('../../domain/test/fixtures/local-evm-scenario/scenario.json', import.meta.url), 'utf8'));
const { domain, sets } = scenario, ESCROW = domain.verifyingContract, tradeId = sets.native.expectedEvmTermsHash;
const binding = { chain: 'evm', networkId: sets.native.terms.networkId, deploymentId: sets.native.terms.deploymentId, tradeId };
const word = value => BigInt(value).toString(16).padStart(64, '0');
const signal = new AbortController().signal;
const H = `0x${'12'.repeat(32)}`, A = `0x${'34'.repeat(20)}`;

function provider(overrides = {}) {
  const calls = [];
  const answers = {
    eth_chainId: '0x7a69',
    eth_getBlockByNumber: ([tag]) => ({ number: tag === 'latest' ? '0x10' : tag === 'finalized' ? '0x8' : tag, hash: H, extra: 'ignored' }),
    eth_getTransactionCount: '0x5',
    eth_getTransactionByHash: { hash: H, from: A.toUpperCase().replace('0X', '0x'), to: ESCROW, nonce: '0x5', input: '0xABCD', value: '0x3e8', blockNumber: null },
    eth_getTransactionReceipt: { transactionHash: H, blockNumber: '0xf', blockHash: H, status: '0x1' },
    eth_call: `0x${word(0).repeat(6)}`,
    ...overrides,
  };
  return { calls, request: async ({ method, params }) => {
    calls.push(method);
    const answer = answers[method];
    if (answer instanceof Error) throw answer;
    return typeof answer === 'function' ? answer(params) : answer;
  } };
}

test('reader maps EIP-1193 reads to the lifecycle port and never calls a send/sign method', async () => {
  const p = provider(), reader = createEip1193ChainReader({ request: p.request, escrow: ESCROW, now: () => 7 });
  assert.deepEqual(await reader.chainId(signal), { ok: true, value: '31337' });
  assert.deepEqual((await reader.head('latest', signal)).value, { number: '16', hash: H });
  assert.deepEqual((await reader.head('finalized', signal)).value, { number: '8', hash: H });
  assert.equal((await reader.blockHashAt('15', signal)).value, H);
  assert.equal((await reader.transactionCount(A, 'pending', signal)).value, '5');
  assert.deepEqual((await reader.transaction(H, signal)).value, { hash: H, from: A, to: ESCROW, nonce: '5', input: '0xabcd', value: '1000', blockNumber: null });
  assert.deepEqual((await reader.receipt(H, signal)).value, { transactionHash: H, blockNumber: '15', blockHash: H, status: 'success' });
  assert.equal((await reader.escrowState(binding, '15', signal)).value, 'absent');
  const observation = (await reader.escrowObservation(binding, { signal, generation: 2, requestSequence: 3 })).value;
  assert.deepEqual([observation.state, observation.anchor.height, observation.finality, observation.generation, observation.requestSequence, observation.observedAt], ['absent', '16', 'pending', 2, 3, 7]);
  assert.ok(p.calls.every(method => !/send|sign/i.test(method)));
});

test('hostile or failing provider output becomes fixed typed errors with no copied message', async () => {
  const cases = [
    [{ eth_chainId: '0x07' }, reader => reader.chainId(signal), 'INTEGRITY_FAILURE'],
    [{ eth_getTransactionReceipt: { transactionHash: H, blockNumber: '0x1', blockHash: H, status: '0x2' } }, reader => reader.receipt(H, signal), 'INTEGRITY_FAILURE'],
    [{ eth_call: `0x${word(1)}${word(0).repeat(5)}` }, reader => reader.escrowState(binding, '1', signal), 'INTEGRITY_FAILURE'],
    [{ eth_getBlockByNumber: () => ({ number: '0x1', get hash() { throw new Error('SECRET'); } }) }, reader => reader.head('latest', signal), 'INTEGRITY_FAILURE'],
    [{ eth_chainId: Object.assign(new Error('SECRET https://rpc.invalid'), { code: -32000 }) }, reader => reader.chainId(signal), 'UNAVAILABLE'],
  ];
  for (const [override, run, code] of cases) {
    const result = await run(createEip1193ChainReader({ request: provider(override).request, escrow: ESCROW }));
    assert.equal(result.ok, false); assert.equal(result.error.code, code); assert.doesNotMatch(JSON.stringify(result), /SECRET|https/);
  }
  const aborted = new AbortController(); aborted.abort();
  assert.equal((await createEip1193ChainReader({ request: provider().request, escrow: ESCROW }).chainId(aborted.signal)).error.code, 'CANCELLED');
});

test('escrowCallFor builds each action from evm-escrow with its required prior escrow state', () => {
  const fund = escrowCallFor({ action: 'fund', domain, terms: sets.native.terms }), built = buildFundNative(domain, sets.native.terms);
  assert.deepEqual(fund, { call: { to: built.to, data: built.data, value: built.value }, expectedEscrowState: 'absent' });
  assert.deepEqual(escrowCallFor({ action: 'release', escrow: ESCROW, tradeId }), { call: buildRelease(ESCROW, tradeId), expectedEscrowState: 'funded' });
  assert.deepEqual(escrowCallFor({ action: 'refund', escrow: ESCROW, tradeId }), { call: buildRefund(ESCROW, tradeId), expectedEscrowState: 'funded' });
  assert.notEqual(buildGetTrade(ESCROW, tradeId).data, fund.call.data);
});
