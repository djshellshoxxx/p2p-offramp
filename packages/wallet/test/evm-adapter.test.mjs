import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { RegistryService } from '../../domain/index.ts';
import { EvmWalletAdapter } from '../src/evm-adapter.ts';
import { keccak256, evmTermsHash } from '../src/evm-terms.ts';
// Synthetic only: local dev chain 31337, repeated-digit contracts, deterministic test-only keys.
const enc = text => new TextEncoder().encode(text);
const hex = bytes => Buffer.from(bytes).toString('hex');
const keyOf = label => keccak256(enc(`p2p-offramp-test-only-${label}`));
const addressOf = key => `0x${hex(keccak256(secp256k1.getPublicKey(key, false).subarray(1)).subarray(12))}`;
const sellerKey = keyOf('seller'), buyerKey = keyOf('buyer'), seller = addressOf(sellerKey), buyer = addressOf(buyerKey);
const TOKEN = `0x${'11'.repeat(20)}`, ESCROW = `0x${'22'.repeat(20)}`;
const registryJson = { version: 1, releaseId: 'fixture-0001', networks: [{ id: 'local-evm', chain: 'evm', chainIdentity: '31337', genesisHash: `0x${'ab'.repeat(32)}`,
  endpoints: [{ id: 'local', url: 'http://127.0.0.1:8545/' }], finality: { kind: 'evm-finalized-tag' },
  assets: [{ id: 'native', kind: 'native', address: null, decimals: 18, transferPolicy: 'exact-transfer' },
    { id: 'test-token', kind: 'erc20', address: TOKEN, decimals: 6, transferPolicy: 'exact-transfer' }],
  deployments: [{ id: 'escrow-v1', address: ESCROW, protocolVersion: 1, artifactSha256: 'a'.repeat(64),
    runtime: { kind: 'evm-code', keccak256: 'b'.repeat(64), upgradeable: false }, supportedAssetIds: ['native'] }], environment: 'local' }] };
async function registry() {
  const bytes = enc(JSON.stringify(registryJson)), service = new RegistryService();
  assert.equal((await service.load(bytes, createHash('sha256').update(bytes).digest('hex'))).ok, true); return service;
}
const domain = { chainId: '31337', verifyingContract: ESCROW };
const terms = { orderId: 'a'.repeat(64), revision: '1', networkId: 'local-evm', deploymentId: 'escrow-v1', seller, buyer, assetKind: 'native',
  asset: `0x${'0'.repeat(40)}`, amountBaseUnits: '1000000000000000000', privateAgreementHash: 'b'.repeat(64), capabilitiesHash: 'c'.repeat(64),
  sellerNonce: 'd'.repeat(64), acceptBeforeSeconds: '1700000000', escrowExpirySeconds: '1700086400' };
/** Fake EIP-1193 wallet: re-derives the digest from the typed-data JSON it is shown, then signs it. */
class FakeWallet {
  calls = []; listeners = new Map(); chainId = '0x7a69'; accounts = [seller]; key = sellerKey; behavior = 'sign';
  on(event, fn) { this.listeners.set(event, fn); } removeListener(event) { this.listeners.delete(event); }
  emit(event, value) { this.listeners.get(event)?.(value); }
  async request({ method, params }) {
    this.calls.push(method);
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return this.accounts.map(a => a.toUpperCase().replace('0X', '0x'));
    if (method === 'eth_chainId') return this.chainId;
    if (method === 'eth_signTypedData_v4') {
      if (this.behavior === 'reject') throw Object.assign(new Error('SECRET user denied'), { code: 4001 });
      if (this.behavior === 'unsupported') throw Object.assign(new Error('SECRET'), { code: 4200 });
      if (this.behavior === 'hook') { await this.hook?.(); }
      const data = JSON.parse(params[1]); const m = data.message;
      const digest = evmTermsHash({ chainId: String(data.domain.chainId), verifyingContract: data.domain.verifyingContract }, {
        orderId: m.orderId.slice(2), revision: m.revision, networkId: m.networkId, deploymentId: m.deploymentId, seller: m.seller, buyer: m.buyer,
        assetKind: m.assetKind === 0 ? 'native' : 'erc20', asset: m.asset, amountBaseUnits: m.amountBaseUnits, privateAgreementHash: m.privateAgreementHash.slice(2),
        capabilitiesHash: m.capabilitiesHash.slice(2), sellerNonce: m.sellerNonce.slice(2), acceptBeforeSeconds: m.acceptBeforeSeconds, escrowExpirySeconds: m.escrowExpirySeconds });
      const raw = secp256k1.sign(Buffer.from(digest, 'hex'), this.behavior === 'wrong-key' ? buyerKey : this.key, { prehash: false, format: 'recovered', lowS: true });
      return `0x${hex(raw.subarray(1))}${(raw[0] + 27).toString(16)}`;
    }
    throw Object.assign(new Error('SECRET'), { code: 4200 });
  }
}
const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.value; };
const code = (r, c) => { assert.equal(r.ok, false, 'expected failure'); assert.equal(r.error.code, c); assert.doesNotMatch(JSON.stringify(r), /SECRET|denied/); };

test('G10 nothing is requested before an explicit connect; connect binds registry network, chain and canonical account', async () => {
  const wallet = new FakeWallet(), adapter = new EvmWalletAdapter(wallet, 'fake', await registry());
  assert.deepEqual(wallet.calls, []); assert.equal(adapter.inspect(), null);
  const session = ok(await adapter.connect('local-evm'));
  assert.equal(session.account, seller); assert.equal(session.capabilities.sendTransaction, false);
  code(await new EvmWalletAdapter(wallet, 'fake', await registry()).connect('unknown-net'), 'UNSUPPORTED_PROVIDER');
  wallet.chainId = '0x1'; code(await new EvmWalletAdapter(wallet, 'fake', await registry()).connect('local-evm'), 'WRONG_CHAIN');
  wallet.chainId = '0x7a69'; wallet.accounts = []; code(await new EvmWalletAdapter(wallet, 'fake', await registry()).connect('local-evm'), 'UNAUTHORIZED');
});
test('G10 signs G16 terms once with typed data and returns only an offline-verified signature', async () => {
  const wallet = new FakeWallet(), adapter = new EvmWalletAdapter(wallet, 'fake', await registry());
  const session = ok(await adapter.connect('local-evm')); wallet.calls = [];
  const signature = ok(await adapter.signTerms(session, domain, terms, 'seller'));
  assert.equal(signature.byteLength, 65);
  assert.deepEqual(wallet.calls, ['eth_accounts', 'eth_chainId', 'eth_signTypedData_v4'], 'recheck then exactly one typed-data prompt');
  assert.equal(wallet.calls.some(m => m === 'personal_sign' || m === 'eth_sign'), false);
  wallet.behavior = 'wrong-key'; code(await adapter.signTerms(session, domain, terms, 'seller'), 'INTEGRITY_FAILURE');
  wallet.behavior = 'reject'; code(await adapter.signTerms(session, domain, terms, 'seller'), 'USER_REJECTED');
  wallet.behavior = 'unsupported'; wallet.calls = []; code(await adapter.signTerms(session, domain, terms, 'seller'), 'UNSUPPORTED_PROVIDER');
  assert.deepEqual(wallet.calls, ['eth_accounts', 'eth_chainId', 'eth_signTypedData_v4'], 'no downgrade to another signing method');
});
test('G10 preflight refuses terms not bound to the registry, session account or role', async () => {
  const wallet = new FakeWallet(), adapter = new EvmWalletAdapter(wallet, 'fake', await registry());
  const session = ok(await adapter.connect('local-evm')); wallet.calls = [];
  code(await adapter.signTerms(session, domain, terms, 'buyer'), 'UNAUTHORIZED');
  code(await adapter.signTerms(session, { ...domain, verifyingContract: `0x${'33'.repeat(20)}` }, terms, 'seller'), 'WRONG_CHAIN');
  code(await adapter.signTerms(session, { ...domain, chainId: '1' }, terms, 'seller'), 'WRONG_CHAIN');
  code(await adapter.signTerms(session, domain, { ...terms, deploymentId: 'escrow-v9' }, 'seller'), 'UNSUPPORTED_PROVIDER');
  code(await adapter.signTerms(session, domain, { ...terms, assetKind: 'erc20', asset: TOKEN }, 'seller'), 'UNSUPPORTED_PROVIDER', 'token not supported by deployment');
  code(await adapter.signTerms(session, domain, { ...terms, amountBaseUnits: '0' }, 'seller'), 'INVALID_INPUT');
  assert.deepEqual(wallet.calls, [], 'no wallet request before preflight passes');
});
test('G10 account/chain changes invalidate the session; late results after cancel or change are discarded', async () => {
  const wallet = new FakeWallet(), adapter = new EvmWalletAdapter(wallet, 'fake', await registry());
  const events = []; adapter.subscribe(event => events.push(event.reason));
  let session = ok(await adapter.connect('local-evm'));
  wallet.emit('accountsChanged', [buyer]); assert.equal(adapter.inspect(), null);
  code(await adapter.signTerms(session, domain, terms, 'seller'), 'LOCKED');
  session = ok(await adapter.connect('local-evm'));
  wallet.behavior = 'hook'; wallet.hook = async () => { wallet.emit('chainChanged', '0x1'); };
  code(await adapter.signTerms(session, domain, terms, 'seller'), 'LOCKED');
  session = ok(await adapter.connect('local-evm')); const controller = new AbortController();
  wallet.hook = async () => { controller.abort(); };
  code(await adapter.signTerms(session, domain, terms, 'seller', controller.signal), 'CANCELLED');
  wallet.behavior = 'sign'; session = ok(await adapter.connect('local-evm'));
  wallet.accounts = [buyer]; code(await adapter.signTerms(session, domain, terms, 'seller'), 'LOCKED');
  assert.deepEqual(events, ['accounts-changed', 'chain-changed', 'accounts-changed']);
  wallet.accounts = [seller]; session = ok(await adapter.connect('local-evm'));
  adapter.dispose(); assert.equal(wallet.listeners.size, 0); code(await adapter.signTerms(session, domain, terms, 'seller'), 'LOCKED');
  code(await adapter.connect('local-evm'), 'LOCKED');
});

test('G10 reconnecting never stacks duplicate provider listeners', async () => {
  const wallet = new FakeWallet(); const counts = new Map();
  // EventEmitter semantics: adding the same function twice registers it twice; removal removes one.
  wallet.on = (event, fn) => { const list = counts.get(event) ?? []; list.push(fn); counts.set(event, list); wallet.listeners.set(event, fn); };
  wallet.removeListener = (event, fn) => { const list = counts.get(event) ?? []; const at = list.indexOf(fn); if (at >= 0) list.splice(at, 1); };
  const adapter = new EvmWalletAdapter(wallet, 'fake', await registry());
  for (let n = 0; n < 3; n++) ok(await adapter.connect('local-evm'));
  for (const list of counts.values()) assert.equal(list.length, 1);
  adapter.dispose(); for (const list of counts.values()) assert.equal(list.length, 0);
});
