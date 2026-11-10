import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { runTrades } from '../sepolia/trade.mjs';
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

function interceptRpc(t, s, observation, { nativeState, nowSeconds = 1700000000, onEstimate } = {}) {
  const calls = [];
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
        } else result = `0x${evmTermsHash({ chainId: SEPOLIA.chainId.toString(), verifyingContract: s.escrow }, decodeTerms(request.params[0].data))}`;
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
        result = { transactionHash: request.params[0], status: '0x1', blockNumber: '0x1', blockHash: '0x' + '22'.repeat(32), from: s.state.seller, gasUsed: '0x1', effectiveGasPrice: '0x1' }; break;
      default: assert.fail(`Unexpected RPC method ${request.method}`);
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, ...(error ? { error } : { result }) }), { headers: { 'content-type': 'application/json' } });
  });
  return calls;
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
