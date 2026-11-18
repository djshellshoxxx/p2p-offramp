import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicClient, custom } from 'viem';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { EvmChainReader } from '../../packages/chain-evm/src/reader.ts';
import { createViemReadRpc, READ_METHOD_ALLOWLIST } from '../test-support/viem-read-rpc.mjs';

const hx = n => '0x' + n.repeat(64);
const seller = '0x' + '11'.repeat(20), buyer = '0x' + '22'.repeat(20), contract = '0x' + '33'.repeat(20), zero = '0x' + '00'.repeat(20);
const code = '0x60006000', codehash = Buffer.from(keccak_256(Buffer.from(code.slice(2), 'hex'))).toString('hex');
const genesis = { number: '0x0', hash: hx('a'), timestamp: '0x1' }, finalized = { number: '0xa', hash: hx('b'), timestamp: '0x64' };
const wanted = { seller, buyer, asset: zero, amountBaseUnits: '1000', expirySeconds: '2000' };
const binding = { chain: 'evm', networkId: 'local', deploymentId: 'escrow', tradeId: '55'.repeat(32) };
const network = { id: 'local', chain: 'evm', chainIdentity: '31337', genesisHash: genesis.hash, finality: { kind: 'evm-finalized-tag' }, assets: [{ id: 'native', kind: 'native', address: null }] };
const deployment = { id: 'escrow', address: contract, runtime: { kind: 'evm-code', keccak256: codehash, upgradeable: false }, supportedAssetIds: ['native'] };
const word = v => BigInt(v).toString(16).padStart(64, '0');
const escrowWords = '0x' + [seller, buyer, zero, '1000', '2000', 1].map(word).join('');
const registry = { network: id => id === 'local' ? network : null, deployment: (_n, id) => id === 'escrow' ? deployment : null };
const request = () => ({ generation: 1, requestSequence: 1, signal: new AbortController().signal });

/** viem client over an injected fake EIP-1193 provider; retries off. */
function clientFor(handler, calls = []) {
  const provider = { request: async args => { calls.push(args); return handler(args); } };
  return createPublicClient({ transport: custom(provider, { retryCount: 0 }) });
}
const happy = overrides => ({ method, params }) => {
  if (overrides?.[method]) return overrides[method](params);
  switch (method) {
    case 'eth_chainId': return '0x7a69';
    case 'eth_getBlockByNumber': return params[0] === '0x0' ? genesis : finalized;
    case 'eth_getCode': return code;
    case 'eth_call': return escrowWords;
    case 'eth_getTransactionReceipt': return null;
    default: throw new Error('unexpected ' + method);
  }
};

test('allowlist is exactly the seven read methods', () => {
  assert.deepEqual([...READ_METHOD_ALLOWLIST].sort(), ['eth_blockNumber', 'eth_call', 'eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_getTransactionByHash', 'eth_getTransactionReceipt']);
});

test('forwards method and params unchanged', async () => {
  const calls = [], rpc = createViemReadRpc(clientFor(happy(), calls));
  const params = [{ to: contract, data: '0x1234abcd' }, '0xa'];
  assert.equal(await rpc.request({ method: 'eth_call', params }), escrowWords);
  assert.equal(await rpc.request({ method: 'eth_chainId' }), '0x7a69');
  assert.deepEqual(calls.map(c => [c.method, c.params ?? []]), [['eth_call', params], ['eth_chainId', []]]);
});

test('non-allowlisted methods are rejected before reaching the provider', async () => {
  const calls = [], rpc = createViemReadRpc(clientFor(happy(), calls));
  for (const method of ['eth_sendTransaction', 'eth_sign', 'personal_sign', 'eth_accounts', 'eth_sendRawTransaction', 'ETH_CALL', '']) {
    await assert.rejects(rpc.request({ method, params: [] }), /method not allowed/);
  }
  assert.equal(calls.length, 0);
});

test('abort before the call never reaches the provider', async () => {
  const calls = [], rpc = createViemReadRpc(clientFor(happy(), calls)), controller = new AbortController();
  controller.abort();
  await assert.rejects(rpc.request({ method: 'eth_chainId', signal: controller.signal }), /aborted/);
  assert.equal(calls.length, 0);
});

test('abort mid-call rejects promptly; late result is discarded', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const rpc = createViemReadRpc(clientFor(happy({ eth_chainId: () => gate }))), controller = new AbortController();
  const pending = rpc.request({ method: 'eth_chainId', signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending, /aborted/);
  release('0x7a69');
});

test('provider errors surface as plain rejections without leaking details', async () => {
  const rpc = createViemReadRpc(clientFor(happy({ eth_chainId: () => { throw Object.assign(new Error('SECRET https://rpc.invalid/key'), { code: -32000 }); } })));
  await assert.rejects(rpc.request({ method: 'eth_chainId' }), error => {
    assert.ok(error instanceof Error); assert.equal(error.name, 'ViemReadRpcError');
    assert.doesNotMatch(error.message + JSON.stringify(error) + String(error.stack ?? '').split('\n')[0], /SECRET|rpc\.invalid/);
    return true;
  });
});

test('well-formed state flows through EvmChainReader over the viem adapter', async () => {
  const reader = new EvmChainReader({ rpc: createViemReadRpc(clientFor(happy())), registry, now: () => 1 });
  try {
    const result = await reader.read(binding, request(), wanted);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.value.escrow.state, 'funded');
    assert.equal((await reader.validateLive('local', 'escrow')).ok, true);
  } finally { reader.dispose(); }
});

test('malformed results pass through and the reader fails closed', async () => {
  const cases = [
    ['uppercase chain id hex', { eth_chainId: () => '0X7A69' }, 'validateLive'],
    ['uppercase block hash', { eth_getBlockByNumber: p => ({ ...(p[0] === '0x0' ? genesis : finalized), hash: '0x' + 'B'.repeat(64) }) }, 'validateLive'],
    ['number chain id', { eth_chainId: () => 31337 }, 'validateLive'],
    ['uppercase code', { eth_getCode: () => '0x6000600A' }, 'validateLive'],
    ['uppercase escrow hex', { eth_call: () => escrowWords.slice(0, 2) + escrowWords.slice(2).toUpperCase() }, 'read'],
    ['numeric escrow', { eth_call: () => 1 }, 'read'],
  ];
  for (const [label, overrides, op] of cases) {
    const reader = new EvmChainReader({ rpc: createViemReadRpc(clientFor(happy(overrides))), registry });
    try {
      const result = op === 'read' ? await reader.read(binding, request(), wanted) : await reader.validateLive('local', 'escrow');
      assert.equal(result.ok, false, label);
      assert.equal(result.error.code, 'INTEGRITY_FAILURE', `${label}: ${result.error.code}`);
    } finally { reader.dispose(); }
  }
});

test('provider error under the reader maps to UNAVAILABLE with no leak', async () => {
  const reader = new EvmChainReader({ rpc: createViemReadRpc(clientFor(happy({ eth_getCode: () => { throw new Error('SECRET https://rpc.invalid'); } }))), registry });
  try {
    const result = await reader.read(binding, request(), wanted);
    assert.equal(result.ok, false); assert.equal(result.error.code, 'UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(result), /SECRET|rpc\.invalid/);
  } finally { reader.dispose(); }
});
