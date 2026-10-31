import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { runTrades } from '../sepolia/trade.mjs';
import { SEPOLIA, keccakHex } from '../sepolia/lib.mjs';
import { evmTermsHash } from '../../packages/wallet/src/evm-terms.ts';

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

function interceptRpc(t, s) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const request = JSON.parse(options.body); calls.push(request.method);
    let result, error;
    switch (request.method) {
      case 'eth_chainId': result = '0xaa36a7'; break;
      case 'eth_getBlockByNumber': result = { number: '0x1', hash: request.params[0] === '0x0' ? SEPOLIA.genesisHash : `0x${'22'.repeat(32)}`, timestamp: '0x6553f100' }; break;
      case 'eth_getCode': result = '0x6000'; break;
      case 'eth_call': result = `0x${evmTermsHash({ chainId: SEPOLIA.chainId.toString(), verifyingContract: s.escrow }, decodeTerms(request.params[0].data))}`; break;
      case 'eth_getLogs': error = { code: -32000, message: 'Synthetic stop before funding.' }; break;
      default: assert.fail(`Unexpected RPC method ${request.method}`);
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id, ...(error ? { error } : { result }) }), { headers: { 'content-type': 'application/json' } });
  });
  return calls;
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
