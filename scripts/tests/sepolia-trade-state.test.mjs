import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { runTrades, tradeStatePath } from '../sepolia/trade.mjs';
import { SEPOLIA, keccakHex } from '../sepolia/lib.mjs';
import { evmTermsHash } from '../../packages/wallet/src/evm-terms.ts';
import { buildGetTrade } from '../../packages/wallet/src/evm-escrow.ts';

// Native keypair/signature and terms-review checks run against a temporary fixture registry. Every RPC
// request is intercepted; the first observation after negotiation fails before any transaction is sent.
async function fixture() {
  const base = await mkdtemp(resolve(tmpdir(), 'p2p-trade-state-'));
  const root = resolve(base, 'root'), directory = resolve(root, 'docs/deployments/sepolia');
  const statePath = resolve(directory, 'trades/r.json'), escrow = `0x${'66'.repeat(20)}`;
  const runtime = keccakHex(new Uint8Array([0x60, 0x00]));
  const keys = [secp256k1.utils.randomSecretKey(), secp256k1.utils.randomSecretKey()];
  const address = key => `0x${keccakHex(secp256k1.getPublicKey(key, false).subarray(1)).slice(24)}`;
  const seller = address(keys[0]), buyer = address(keys[1]);
  const registry = { version: 1, releaseId: 'fixture-state', networks: [{ id: 'sepolia', chain: 'evm',
    chainIdentity: SEPOLIA.chainId.toString(), genesisHash: SEPOLIA.genesisHash, environment: 'testnet',
    endpoints: [{ id: 'public', url: 'https://public.invalid/' }], finality: { kind: 'evm-finalized-tag' },
    assets: [{ id: 'native', kind: 'native', address: null, decimals: 18, transferPolicy: 'exact-transfer' }],
    deployments: [{ id: 'escrow-sepolia-v1', address: escrow, protocolVersion: 1, artifactSha256: '0'.repeat(64),
      runtime: { kind: 'evm-code', keccak256: runtime, upgradeable: false }, supportedAssetIds: ['native'] }] }] };
  await mkdir(resolve(root, 'registry/testnet'), { recursive: true });
  await mkdir(resolve(statePath, '..'), { recursive: true });
  await writeFile(resolve(root, 'registry/testnet/sepolia.registry.json'), JSON.stringify(registry));
  await writeFile(resolve(directory, `BasicEscrow-${escrow}.json`), JSON.stringify({ contractAddress: escrow, codeDigest: { runtime }, deployBlock: '0' }));
  const state = { escrow, seller, buyer, genesisHash: SEPOLIA.genesisHash, amountWei: '100000000000000',
    trades: [{ label: 'release', status: 'planned', checks: [] }, { label: 'refund', status: 'planned', checks: [] }] };
  const env = { SEPOLIA_RPC_URL: 'http://127.0.0.1:9/', SEPOLIA_SELLER_PRIVATE_KEY: Buffer.from(keys[0]).toString('hex'),
    SEPOLIA_BUYER_PRIVATE_KEY: Buffer.from(keys[1]).toString('hex') };
  return { base, root, directory, statePath, state, escrow, env, async dispose() { keys.forEach(key => key.fill(0)); await rm(base, { recursive: true, force: true }); } };
}

function decodeTerms(data) {
  const tuple = data.slice(74), word = i => tuple.slice(i * 64, (i + 1) * 64);
  const number = i => BigInt(`0x${word(i)}`).toString(), address = i => `0x${word(i).slice(24)}`;
  const text = i => { const tail = tuple.slice(Number(BigInt(`0x${word(i)}`)) * 2), length = Number(BigInt(`0x${tail.slice(0, 64)}`)); return Buffer.from(tail.slice(64, 64 + length * 2), 'hex').toString('utf8'); };
  return { orderId: word(0), revision: number(1), networkId: text(2), deploymentId: text(3), seller: address(4), buyer: address(5),
    assetKind: 'native', asset: address(7), amountBaseUnits: number(8), privateAgreementHash: word(9), capabilitiesHash: word(10),
    sellerNonce: word(11), acceptBeforeSeconds: number(12), escrowExpirySeconds: number(13) };
}

function interceptRpc(t, s, observation, { nativeState, nowSeconds = 1700000000, onEstimate, failTermsCall = false, receipt } = {}) {
  const calls = [], receipts = [];
  const selector = buildGetTrade(s.escrow, '0'.repeat(64)).data.slice(0, 10);
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const request = JSON.parse(options.body); calls.push(request.method);
    const stored = nativeState === undefined ? undefined : JSON.parse(await readFile(s.statePath, 'utf8'));
    const trade = stored?.trades.find(item => item.tradeId === (request.params[0]?.data?.slice(10) ?? request.params[0]?.topics?.[1]?.slice(2)));
    const state = typeof nativeState === 'function' ? trade && nativeState(trade) : nativeState;
    const word = value => BigInt(value).toString(16).padStart(64, '0');
    const address = value => value.slice(2).padStart(64, '0');
    const event = (name, topics, data) => ({ address: s.escrow, topics: ['0x' + keccakHex(new TextEncoder().encode(name)), ...topics], data: '0x' + data,
      transactionHash: '0x' + trade.tradeId, blockNumber: '0x1', blockHash: '0x' + '22'.repeat(32) });
    let result, error;
    switch (request.method) {
      case 'eth_chainId': result = '0xaa36a7'; break;
      case 'eth_getBlockByNumber':
        result = { number: '0x1', hash: request.params[0] === '0x0' ? SEPOLIA.genesisHash : `0x${'22'.repeat(32)}`, timestamp: '0x' + nowSeconds.toString(16) };
        if (observation && request.params[0] === '0x1') result = observation(result);
        break;
      case 'eth_getCode': result = '0x6000'; break;
      case 'eth_call':
        if (request.params[0].data.startsWith(selector)) {
          result = !state || state === 'absent' ? `0x${'0'.repeat(384)}` : '0x' + address(trade.terms.seller) + word(trade.terms.escrowExpirySeconds) +
            word({ funded: 1, released: 2, refunded: 3 }[state]) + address(trade.terms.buyer) + word(0) + word(trade.terms.amountBaseUnits);
        } else if (onEstimate && Object.hasOwn(request.params[0], 'value')) {
          const long = request.params[0].data.length > 74;
          error = { code: 3, message: 'Public synthetic revert.', data: '0x' + keccakHex(new TextEncoder().encode(long ? 'IncorrectDeposit(uint256,uint256)' : 'DeadlinePassed(uint64)')).slice(0, 8) +
            (long ? word(stored.amountWei) + word(BigInt(stored.amountWei) - 1n) : word(trade.terms.escrowExpirySeconds)) };
        } else if (failTermsCall) error = { code: -32000, message: 'Public synthetic transient read failure.' };
        else result = `0x${evmTermsHash({ chainId: SEPOLIA.chainId.toString(), verifyingContract: s.escrow }, decodeTerms(request.params[0].data))}`;
        break;
      case 'eth_getLogs':
        if (state && state !== 'absent') {
          result = [event('Funded(bytes32,address,address,address,uint256,uint64)', ['0x' + trade.tradeId, '0x' + address(trade.terms.seller), '0x' + address(trade.terms.buyer)],
            word(0) + word(trade.terms.amountBaseUnits) + word(trade.terms.escrowExpirySeconds))];
          if (state === 'released') result.push(event('Released(bytes32,address,address,uint256)', ['0x' + trade.tradeId, '0x' + address(trade.terms.buyer)], word(0) + word(trade.terms.amountBaseUnits)));
          if (state === 'refunded') result.push(event('Refunded(bytes32,address,address,address,uint256)', ['0x' + trade.tradeId, '0x' + address(trade.terms.seller), '0x' + address(trade.terms.seller)], word(0) + word(trade.terms.amountBaseUnits)));
        } else if (observation) result = [];
        else error = { code: -32000, message: 'Synthetic stop before funding.' };
        break;
      case 'eth_estimateGas':
        await onEstimate(request);
        error = { code: -32000, message: 'Public synthetic stop before Forge.' }; break;
      case 'eth_getTransactionReceipt':
        receipts.push(request.params[0]);
        if (receipt && receipt(request.params[0]) !== undefined) { result = receipt(request.params[0]); break; }
        result = { transactionHash: request.params[0], status: '0x1', blockNumber: '0x1', blockHash: '0x' + '22'.repeat(32), from: s.state.seller, gasUsed: '0x1', effectiveGasPrice: '0x1' }; break;
      default: assert.fail(`Unexpected RPC method ${request.method}`);
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, ...(error ? { error } : { result }) }), { headers: { 'content-type': 'application/json' } });
  });
  return Object.assign(calls, { receipts });
}

async function negotiatedState(t, s) {
  interceptRpc(t, s, block => block);
  await assert.rejects(runTrades({ ...s, run: 'r', requireSignedRegistry: false,
    beforeFund() { throw Object.assign(new Error('Public synthetic stop.'), { code: 'TEST_STOP' }); },
  }), error => error?.code === 'TEST_STOP');
  return JSON.parse(await readFile(s.statePath, 'utf8'));
}

test('edited trade labels, duplicate labels and missing trade slots fail before generating documents or sending', async t => {
  const s = await fixture(), calls = interceptRpc(t, s);
  try {
    const victim = resolve(s.directory, 'escaped.terms-review.json'); await writeFile(victim, 'SENTINEL');
    for (const labels of [['x/../../escaped', 'refund'], ['release', 'release'], ['release'], [], ['release', null]]) {
      const state = { ...s.state, trades: labels.map(label => ({ label, status: 'planned', checks: [] })) };
      const before = JSON.stringify(state); await writeFile(s.statePath, before);
      await assert.rejects(runTrades({ ...s, run: 'r', requireSignedRegistry: false }), error => error?.code === 'STATE_MISMATCH');
      assert.equal(await readFile(victim, 'utf8'), 'SENTINEL');
      assert.equal(await readFile(s.statePath, 'utf8'), before, 'the supplied state is not rewritten');
      assert.deepEqual(await readdir(resolve(s.statePath, '..')), ['r.json'], 'no terms-review output is written');
    }
    assert.equal(calls.includes('eth_call'), false, 'invalid labels stop before negotiation');
    assert.equal(calls.some(method => method.startsWith('eth_send') || method.startsWith('eth_sign')), false);
  } finally { await s.dispose(); }
});

test('valid saved labels still negotiate beside an explicitly selected operator state path', async t => {
  const s = await fixture(), calls = interceptRpc(t, s);
  try {
    const statePath = resolve(s.base, 'operator-selected/run.json'); await mkdir(resolve(statePath, '..'), { recursive: true });
    await writeFile(statePath, JSON.stringify(s.state));
    await assert.rejects(runTrades({ ...s, statePath, run: 'r', requireSignedRegistry: false }), error => error?.code === 'OBSERVATION_REJECTED');
    const generated = JSON.parse(await readFile(resolve(statePath, '..', 'r.release.terms-review.json'), 'utf8'));
    assert.equal(generated.format, 'p2p-offramp/local-terms-review/v1');
    assert.equal(calls.includes('eth_call'), true);
    assert.equal(calls.some(method => method.startsWith('eth_send') || method.startsWith('eth_sign')), false);
  } finally { await s.dispose(); }
});

test('an observation whose numbered block changes or disappears is refused before funding', async t => {
  for (const [name, change] of [
    ['hash', block => ({ ...block, hash: `0x${'33'.repeat(32)}` })],
    ['height', block => ({ ...block, number: '0x2' })],
    ['time', block => ({ ...block, timestamp: '0x6553f101' })],
    ['missing', () => null],
  ]) await t.test(name, async t => {
    const s = await fixture(), calls = interceptRpc(t, s, change);
    let fundingDecisions = 0;
    try {
      await assert.rejects(runTrades({ ...s, run: 'r', requireSignedRegistry: false,
        beforeFund() { fundingDecisions++; throw Object.assign(new Error('Synthetic stop.'), { code: 'TEST_STOP' }); },
      }), error => error?.code === 'OBSERVATION_REJECTED');
      assert.equal(fundingDecisions, 0, 'no funding decision may use a torn state/header snapshot');
      assert.equal(calls.some(method => method.startsWith('eth_send') || method.startsWith('eth_sign')), false);
    } finally { await s.dispose(); }
  });
});

test('a stable anchored absence still reaches the explicit pre-funding hook without a send', async t => {
  const s = await fixture(), calls = interceptRpc(t, s, block => block);
  let fundingDecisions = 0;
  try {
    await assert.rejects(runTrades({ ...s, run: 'r', requireSignedRegistry: false,
      beforeFund() { fundingDecisions++; throw Object.assign(new Error('Synthetic stop.'), { code: 'TEST_STOP' }); },
    }), error => error?.code === 'TEST_STOP');
    assert.equal(fundingDecisions, 2, 'both planned trades accept the coherent native snapshot');
    assert.equal(calls.some(method => method.startsWith('eth_send') || method.startsWith('eth_sign')), false);
  } finally { await s.dispose(); }
});

test('saved funding or settlement attempts and hashes cannot permit another funding decision from current absence', async t => {
  const s = await fixture();
  try {
    const prepared = await negotiatedState(t, s);
    for (const history of [
      { fund: { requestedAt: '2026-11-02T00:00:00.000Z', tx: null } },
      { fund: { tx: '0x' + '33'.repeat(32) } },
      { settle: { kind: 'release', requestedAt: '2026-11-02T00:00:00.000Z', tx: null } },
      { attempts: { fund: { requestedAt: '2026-11-02T00:00:00.000Z', tx: null } } },
      { attempts: { release: { tx: '0x' + '44'.repeat(32) } } },
      { settle: { kind: 'unknown', tx: null } },
      { attempts: null },
      { attempts: [] },
      { attempts: { unknown: { tx: null } } },
      { failedSends: null },
      { failedSends: [{ kind: 'unknown', tx: null }] },
      { lastError: { code: 'BROADCAST_UNCERTAIN' } },
      { lastError: { code: 'RPC_ERROR_-32000' } },
    ]) {
      const state = JSON.parse(JSON.stringify(prepared));
      state.trades.forEach(trade => { delete trade.attempts; Object.assign(trade, history); });
      await writeFile(s.statePath, JSON.stringify(state));
      const calls = interceptRpc(t, s, block => block);
      let decisions = 0;
      await assert.rejects(runTrades({ ...s, run: 'r', requireSignedRegistry: false,
        beforeFund() { decisions++; throw Object.assign(new Error('Public synthetic stop.'), { code: 'TEST_STOP' }); },
      }), error => error?.code === 'BROADCAST_RECONCILIATION_REQUIRED');
      assert.equal(decisions, 0);
      assert.equal(calls.includes('eth_estimateGas'), false);
      await assert.rejects(runTrades({ ...s, run: 'r', requireSignedRegistry: false,
        beforeFund() { decisions++; throw Object.assign(new Error('Public synthetic stop.'), { code: 'TEST_STOP' }); },
      }), error => error?.code === 'BROADCAST_RECONCILIATION_REQUIRED');
      assert.equal(decisions, 0, 'reconciliation failure stays restrictive on repeated resume');
      const retained = JSON.parse(await readFile(s.statePath, 'utf8'));
      for (const [key, record] of Object.entries(history)) {
        if (key === 'lastError') {
          assert.equal(retained.trades[0].lastError.code, 'BROADCAST_RECONCILIATION_REQUIRED');
        } else if (record === null) {
          assert.equal(retained.trades[0][key], null);
        } else for (const [field, value] of Object.entries(record)) {
          assert.deepEqual(retained.trades[0][key][field], value, 'native summary enrichment cannot replace prior evidence');
        }
      }
    }
  } finally { await s.dispose(); }
});

test('each funding attempt is durable before the send boundary and resume never invokes that boundary a second time', async t => {
  const s = await fixture();
  try {
    await negotiatedState(t, s);
    let estimates = 0; const markers = [];
    const calls = interceptRpc(t, s, block => block, { nativeState: 'absent', onEstimate: async request => {
      estimates++;
      const state = JSON.parse(await readFile(s.statePath, 'utf8'));
      const id = evmTermsHash({ chainId: SEPOLIA.chainId.toString(), verifyingContract: s.escrow }, decodeTerms(request.params[0].data));
      markers.push(state.trades.find(trade => trade.tradeId === id).attempts?.fund);
    } });
    await assert.rejects(runTrades({ ...s, run: 'r', requireSignedRegistry: false }), error => error?.code === 'RPC_ERROR_-32000');
    assert.equal(estimates, 2);
    for (const marker of markers) { assert.equal(typeof marker?.requestedAt, 'string'); assert.equal(marker.tx, null); }
    const before = JSON.parse(await readFile(s.statePath, 'utf8')).trades.map(trade => trade.attempts);
    await assert.rejects(runTrades({ ...s, run: 'r', requireSignedRegistry: false }), error => error?.code === 'BROADCAST_RECONCILIATION_REQUIRED');
    assert.equal(estimates, 2, 'second invocation reaches zero additional send boundaries');
    assert.deepEqual(JSON.parse(await readFile(s.statePath, 'utf8')).trades.map(trade => trade.attempts), before);
    assert.equal(calls.some(method => method.startsWith('eth_send') || method.startsWith('eth_sign')), false);
  } finally { await s.dispose(); }
});

test('proven funding allows the first distinct exit, preserves each kind, and never repeats a prior release or refund', async t => {
  const s = await fixture();
  try {
    const state = await negotiatedState(t, s);
    for (const trade of state.trades) {
      delete trade.attempts;
      trade.fund = { tx: '0x' + trade.tradeId };
      trade.checks.push('replay: funding the same terms again: reverts TradeIdUsed');
    }
    await writeFile(s.statePath, JSON.stringify(state));
    let estimates = 0; const markers = [];
    const onEstimate = async request => {
      estimates++;
      const current = JSON.parse(await readFile(s.statePath, 'utf8'));
      const trade = current.trades.find(item => item.tradeId === request.params[0].data.slice(10));
      const kind = request.params[0].data.slice(0, 10) === '0x' + keccakHex(new TextEncoder().encode('release(bytes32)')).slice(0, 8) ? 'release' : 'refund';
      markers.push({ kind, marker: trade.attempts?.[kind] });
    };
    const calls = interceptRpc(t, s, block => block, { nativeState: 'funded', nowSeconds: 1700004000, onEstimate });
    await assert.rejects(runTrades({ ...s, run: 'r', requireSignedRegistry: false }), error => error?.code === 'RPC_ERROR_-32000');
    assert.equal(estimates, 2, 'proven funding still permits each first current exit');
    assert.deepEqual(markers.map(item => item.kind), ['release', 'refund']);
    for (const { marker } of markers) { assert.equal(typeof marker?.requestedAt, 'string'); assert.equal(marker.tx, null); }
    const first = JSON.parse(await readFile(s.statePath, 'utf8')).trades[0].attempts.release;
    await assert.rejects(runTrades({ ...s, run: 'r', requireSignedRegistry: false }), error => error?.code === 'BROADCAST_RECONCILIATION_REQUIRED');
    assert.equal(estimates, 2, 'same release/refund is never submitted again');
    interceptRpc(t, s, block => block, { nativeState: 'funded', nowSeconds: 1700008000, onEstimate });
    await assert.rejects(runTrades({ ...s, run: 'r', requireSignedRegistry: false }), error => error?.code === 'RPC_ERROR_-32000');
    assert.equal(estimates, 3, 'only the first distinct timeout refund reaches a send boundary');
    const final = JSON.parse(await readFile(s.statePath, 'utf8')).trades[0].attempts;
    assert.deepEqual(final.release, first, 'unknown prior release evidence is not overwritten by a refund');
    assert.deepEqual(new Set(Object.keys(final)), new Set(['fund', 'refund', 'release']));
    assert.equal(calls.some(method => method.startsWith('eth_send') || method.startsWith('eth_sign')), false);
  } finally { await s.dispose(); }
});

test('native terminal observations remain read-only even with unresolved or unknown legacy attempt evidence', async t => {
  const s = await fixture();
  try {
    const state = await negotiatedState(t, s);
    for (const trade of state.trades) {
      trade.status = trade.label === 'release' ? 'released' : 'refunded';
      trade.settle = { kind: 'unknown', requestedAt: '2026-11-02T00:00:00.000Z', tx: null };
    }
    await writeFile(s.statePath, JSON.stringify(state));
    let estimates = 0;
    const calls = interceptRpc(t, s, block => block, { nativeState: trade => trade.status, onEstimate: () => { estimates++; } });
    const result = await runTrades({ ...s, run: 'r', requireSignedRegistry: false });
    assert.deepEqual(result.state.trades.map(trade => trade.status), ['released', 'refunded']);
    assert.equal(estimates, 0);
    assert.equal(calls.some(method => method.startsWith('eth_send') || method.startsWith('eth_sign')), false);
    assert.ok(result.state.trades.every(trade => trade.settle.kind === 'unknown'), 'read-only reconciliation retains unresolved evidence');
  } finally { await s.dispose(); }
});

const stop = () => { throw Object.assign(new Error('Public synthetic stop.'), { code: 'TEST_STOP' }); };

test('a transient RPC read failure before any send never locks a new or planned trade behind broadcast reconciliation', async t => {
  for (const name of ['fresh state file', 'saved planned state']) await t.test(name, async t => {
    const s = await fixture();
    try {
      if (name === 'saved planned state') await writeFile(s.statePath, JSON.stringify({ ...s.state,
        trades: s.state.trades.map(trade => ({ ...trade, lastError: { code: 'RPC_ERROR_-32000', at: '2026-11-02T00:00:00.000Z' } })) }));
      const failing = interceptRpc(t, s, block => block, { failTermsCall: true });
      await assert.rejects(runTrades({ ...s, run: 'r', requireSignedRegistry: false, beforeFund: stop }), error => error?.code === 'RPC_ERROR_-32000');
      assert.equal(failing.includes('eth_estimateGas'), false, 'the failure is a read, before any send boundary');
      const failed = JSON.parse(await readFile(s.statePath, 'utf8'));
      assert.deepEqual(failed.trades.map(trade => trade.lastError?.code), ['RPC_ERROR_-32000', 'RPC_ERROR_-32000']);
      assert.ok(failed.trades.every(trade => trade.lastError.origin === undefined), 'a read failure is not attributed to a send');
      let decisions = 0;
      const calls = interceptRpc(t, s, block => block);
      await assert.rejects(runTrades({ ...s, run: 'r', requireSignedRegistry: false, beforeFund() { decisions++; stop(); } }), error => error?.code === 'TEST_STOP');
      assert.equal(decisions, 2, 'both trades reach the funding decision after the transient read failure');
      assert.ok(JSON.parse(await readFile(s.statePath, 'utf8')).trades.every(trade => JSON.stringify(trade.attempts) === '{}'));
      assert.equal(calls.some(method => method.startsWith('eth_send') || method.startsWith('eth_sign')), false);
    } finally { await s.dispose(); }
  });
});

test('a send failure is attributed to its action in the recorded error', async t => {
  const s = await fixture();
  try {
    await negotiatedState(t, s);
    interceptRpc(t, s, block => block, { nativeState: 'absent', onEstimate: async () => {} });
    await assert.rejects(runTrades({ ...s, run: 'r', requireSignedRegistry: false }), error => error?.code === 'RPC_ERROR_-32000');
    for (const trade of JSON.parse(await readFile(s.statePath, 'utf8')).trades) {
      assert.equal(trade.lastError.code, 'RPC_ERROR_-32000');
      assert.equal(trade.lastError.origin, 'send');
      assert.equal(trade.lastError.action, 'fund');
    }
  } finally { await s.dispose(); }
});

test('a legacy uncertain error not tied to an accounted-for action blocks a different exit; a matching hash-bearing failed send does not', async t => {
  const failedHash = '0x' + '55'.repeat(32);
  for (const [name, history, permitted] of [
    ['settle record beside an unattributed uncertain error', { settle: { kind: 'release', requestedAt: '2026-11-02T00:00:00.000Z', tx: '0x' + '44'.repeat(32) }, lastError: { code: 'BROADCAST_UNCERTAIN' } }, false],
    ['failed send whose outcome differs from the uncertain error', { failedSends: [{ kind: 'release', tx: failedHash, outcome: 'TX_REVERTED' }], lastError: { code: 'BROADCAST_UNCERTAIN' } }, false],
    ['hashless failed send', { failedSends: [{ kind: 'release', tx: null, outcome: 'BROADCAST_UNCERTAIN' }], lastError: { code: 'BROADCAST_UNCERTAIN' } }, false],
    ['unfinished fund record beside an unattributed RPC error', { fund: { requestedAt: '2026-11-02T00:00:00.000Z', tx: null }, lastError: { code: 'RPC_UNREACHABLE' } }, false],
    ['error matching a hash-bearing failed send', { failedSends: [{ kind: 'release', tx: failedHash, outcome: 'TX_REVERTED' }], lastError: { code: 'TX_REVERTED' } }, true],
  ]) await t.test(name, async t => {
    const s = await fixture();
    try {
      const state = await negotiatedState(t, s);
      for (const trade of state.trades) {
        delete trade.attempts; delete trade.lastError;
        Object.assign(trade, JSON.parse(JSON.stringify(history)));
        trade.fund = { ...(trade.fund ?? {}), ...(trade.fund?.requestedAt ? {} : { tx: '0x' + trade.tradeId }) };
        trade.checks.push('replay: funding the same terms again: reverts TradeIdUsed');
      }
      await writeFile(s.statePath, JSON.stringify(state));
      let estimates = 0;
      const onEstimate = async () => { estimates++; };
      const calls = interceptRpc(t, s, block => block, { nativeState: 'funded', nowSeconds: 1700008000, onEstimate });
      const expected = permitted ? 'RPC_ERROR_-32000' : 'BROADCAST_RECONCILIATION_REQUIRED';
      await assert.rejects(runTrades({ ...s, run: 'r', requireSignedRegistry: false }), error => error?.code === expected);
      assert.equal(estimates, permitted ? 2 : 0, permitted ? 'the first distinct refund is still permitted' : 'no exit reaches a send boundary');
      await assert.rejects(runTrades({ ...s, run: 'r', requireSignedRegistry: false }), error => error?.code === 'BROADCAST_RECONCILIATION_REQUIRED');
      assert.equal(estimates, permitted ? 2 : 0, 'no second broadcast of any recorded action');
      assert.equal(calls.some(method => method.startsWith('eth_send') || method.startsWith('eth_sign')), false);
    } finally { await s.dispose(); }
  });
});

test('a second trade process cannot take a held state lock, a leftover lock is never stolen, and the lock is released in finally', async t => {
  const s = await fixture();
  try {
    await writeFile(s.statePath, JSON.stringify(s.state));
    const otherTemp = `${s.statePath}.tmp`; await writeFile(otherTemp, 'OTHER PROCESS TEMP');
    const calls = interceptRpc(t, s, block => block);
    let concurrent;
    await assert.rejects(runTrades({ ...s, run: 'r', requireSignedRegistry: false, async beforeFund() {
      if (!concurrent) concurrent = await runTrades({ ...s, run: 'r', requireSignedRegistry: false, beforeFund: stop }).then(() => 'ran', error => error);
      stop();
    } }), error => error?.code === 'TEST_STOP');
    assert.equal(concurrent?.code, 'STATE_LOCKED', 'the concurrent run fails closed on the held lock');
    assert.equal(concurrent.lockPath, `${s.statePath}.lock`);
    assert.equal(await readFile(otherTemp, 'utf8'), 'OTHER PROCESS TEMP', 'atomic writes use a per-process temporary path');
    assert.deepEqual((await readdir(resolve(s.statePath, '..'))).filter(name => !name.endsWith('.terms-review.json')).sort(), ['r.json', 'r.json.tmp'], 'the lock is released after a failed run');

    const lock = `${s.statePath}.lock`, stale = JSON.stringify({ pid: 999999, startedAt: '2026-11-02T00:00:00.000Z' });
    await writeFile(lock, stale);
    const before = await readFile(s.statePath, 'utf8'), callsBefore = calls.length;
    await assert.rejects(runTrades({ ...s, run: 'r', requireSignedRegistry: false, beforeFund: stop }), error => error?.code === 'STATE_LOCKED');
    assert.equal(await readFile(lock, 'utf8'), stale, 'an existing lock is left for the operator to verify and remove');
    assert.equal(await readFile(s.statePath, 'utf8'), before);
    assert.equal(calls.length, callsBefore, 'nothing is read or sent while the state is locked');
    await rm(lock);
    await assert.rejects(runTrades({ ...s, run: 'r', requireSignedRegistry: false, beforeFund: stop }), error => error?.code === 'TEST_STOP');
    assert.equal(calls.some(method => method.startsWith('eth_send') || method.startsWith('eth_sign')), false);
  } finally { await s.dispose(); }
});

test('finality covers every recorded transaction, including hash-bearing failed sends', async t => {
  const s = await fixture();
  try {
    const state = await negotiatedState(t, s), failedHash = '0x' + '55'.repeat(32);
    for (const trade of state.trades) {
      trade.status = trade.label === 'release' ? 'released' : 'refunded';
      trade.fund = { tx: '0x' + trade.tradeId }; trade.settle = { kind: trade.label, tx: '0x' + trade.tradeId };
    }
    state.trades[0].failedSends = [{ kind: 'release', tx: failedHash, outcome: 'TX_REVERTED' }, { kind: 'release', tx: null, outcome: 'BROADCAST_UNCERTAIN' }];
    await writeFile(s.statePath, JSON.stringify(state));
    const included = interceptRpc(t, s, block => block, { nativeState: trade => trade.status });
    assert.equal((await runTrades({ ...s, run: 'r', requireSignedRegistry: false })).state.finality.allFinalized, true);
    assert.ok(included.receipts.includes(failedHash), 'the failed send is checked');
    interceptRpc(t, s, block => block, { nativeState: trade => trade.status, receipt: hash => hash === failedHash ? null : undefined });
    const result = await runTrades({ ...s, run: 'r', requireSignedRegistry: false });
    assert.equal(result.state.finality.allFinalized, false, 'an unfinalized failed send keeps the run unfinalized');
  } finally { await s.dispose(); }
});

test('the CLI state path is derived only from a valid run id and stays inside the trades directory', async () => {
  const root = resolve(tmpdir(), 'p2p-root');
  assert.equal(tradeStatePath(root, 'exercise-1'), resolve(root, 'docs/deployments/sepolia/trades/exercise-1.json'));
  for (const run of ['../escape', '..', 'a/b', 'a\\b', '/abs', '.hidden', 'UPPER', '', 'x'.repeat(65), undefined, null, 7, 'a\0b', 'ok\n'])
    assert.throws(() => tradeStatePath(root, run), { code: 'RUN_ID_INVALID' }, String(run));
  await assert.rejects(runTrades({ root, run: '../escape' }), { code: 'RUN_ID_INVALID' }, 'refused before any lock or state file is touched');
});
