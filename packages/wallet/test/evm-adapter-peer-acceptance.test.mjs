import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { hashTypedData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { schnorr } from '@noble/curves/secp256k1.js';
import { RegistryService } from '../../domain/index.ts';
import { EvmWalletAdapter } from '../src/evm-adapter.ts';
import { evmTermsHash } from '../src/evm-terms.ts';
import { peerAcceptanceHash, peerAcceptanceTypedData, verifyEoaPeerAcceptance } from '../src/evm-peer-acceptance.ts';

// Synthetic only: Anvil's public, well-known dev keys 0 (seller) and 1 (buyer), local chain 31337,
// repeated-digit contracts. These confer no production approval and never touch real funds.
const sellerAccount = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const buyerAccount = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const otherAccount = privateKeyToAccount(`0x${'42'.repeat(32)}`);
const seller = sellerAccount.address.toLowerCase(), buyer = buyerAccount.address.toLowerCase();
const enc = text => new TextEncoder().encode(text);
const TOKEN = `0x${'11'.repeat(20)}`, ESCROW = `0x${'22'.repeat(20)}`, ESCROW_B = `0x${'44'.repeat(20)}`;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const sellerKey = Buffer.from(schnorr.getPublicKey(new Uint8Array(32).fill(1))).toString('hex');
const buyerKey = Buffer.from(schnorr.getPublicKey(new Uint8Array(32).fill(2))).toString('hex');
const registryJson = { version: 1, releaseId: 'fixture-0001', networks: [{ id: 'local-evm', chain: 'evm', chainIdentity: '31337', genesisHash: `0x${'ab'.repeat(32)}`,
  endpoints: [{ id: 'local', url: 'http://127.0.0.1:8545/' }], finality: { kind: 'evm-finalized-tag' },
  assets: [{ id: 'native', kind: 'native', address: null, decimals: 18, transferPolicy: 'exact-transfer' },
    { id: 'test-token', kind: 'erc20', address: TOKEN, decimals: 6, transferPolicy: 'exact-transfer' }],
  deployments: [{ id: 'escrow-v1', address: ESCROW, protocolVersion: 1, artifactSha256: 'a'.repeat(64),
    runtime: { kind: 'evm-code', keccak256: 'b'.repeat(64), upgradeable: false }, supportedAssetIds: ['native'] }], environment: 'local' },
  // A second, fully valid EVM network: terms naming it must be refused for a session connected to local-evm.
  { id: 'local-evm-2', chain: 'evm', chainIdentity: '31338', genesisHash: `0x${'cd'.repeat(32)}`,
    endpoints: [{ id: 'local-2', url: 'http://127.0.0.1:8546/' }], finality: { kind: 'evm-finalized-tag' },
    assets: [{ id: 'native', kind: 'native', address: null, decimals: 18, transferPolicy: 'exact-transfer' }],
    deployments: [{ id: 'escrow-v1-b', address: ESCROW_B, protocolVersion: 1, artifactSha256: 'a'.repeat(64),
      runtime: { kind: 'evm-code', keccak256: 'b'.repeat(64), upgradeable: false }, supportedAssetIds: ['native'] }], environment: 'local' }] };
async function registry() {
  const bytes = enc(JSON.stringify(registryJson)), service = new RegistryService();
  assert.equal((await service.load(bytes, createHash('sha256').update(bytes).digest('hex'))).ok, true); return service;
}
const domain = Object.freeze({ chainId: '31337', verifyingContract: ESCROW });
const terms = Object.freeze({ orderId: 'a'.repeat(64), revision: '1', networkId: 'local-evm', deploymentId: 'escrow-v1', seller, buyer, assetKind: 'native',
  asset: `0x${'0'.repeat(40)}`, amountBaseUnits: '1000000000000000000', privateAgreementHash: 'b'.repeat(64), capabilitiesHash: 'c'.repeat(64),
  sellerNonce: 'd'.repeat(64), acceptBeforeSeconds: '1700000000', escrowExpirySeconds: '1700086400' });
const termsHash = evmTermsHash(domain, terms);
const request = role => ({ role, ownMessagingKey: role === 'seller' ? sellerKey : buyerKey, counterpartyMessagingKey: role === 'seller' ? buyerKey : sellerKey,
  notAfterSeconds: '1699995000', nowSeconds: '1699990000' });
const context = role => ({ role, ownMessagingKey: role === 'seller' ? sellerKey : buyerKey, counterpartyMessagingKey: role === 'seller' ? buyerKey : sellerKey,
  nowSeconds: '1699990000', envelopeExpiresAtSeconds: '1699996000' });

/** viem needs bigint for uint fields; a real wallet accepts the decimal strings/numbers the adapter sends. */
function forViem(data) {
  const fields = data.types[data.primaryType], message = { ...data.message };
  for (const { name, type } of fields) if (type.startsWith('uint')) message[name] = BigInt(message[name]);
  return { ...data, domain: { ...data.domain, chainId: BigInt(data.domain.chainId) }, message };
}
function highS(signature) {
  const raw = Buffer.from(signature.slice(2), 'hex'), s = BigInt(`0x${raw.subarray(32, 64).toString('hex')}`);
  raw.set(Buffer.from((N - s).toString(16).padStart(64, '0'), 'hex'), 32); raw[64] = raw[64] === 27 ? 28 : 27;
  return `0x${raw.toString('hex')}`;
}
/** Fake EIP-1193 wallet: signs exactly the typed-data JSON it is shown, independently via viem. */
class FakeWallet {
  calls = []; listeners = new Map(); chainId = '0x7a69'; behavior = 'sign'; beforeRequest = new Map(); typedData = []; rawTypedData = []; params = [];
  constructor(signer) { this.signer = signer; this.accounts = [signer.address]; }
  on(event, fn) { this.listeners.set(event, fn); }
  removeListener(event, fn) { if (this.listeners.get(event) === fn) this.listeners.delete(event); }
  emit(event, value) { this.listeners.get(event)?.(value); }
  async request({ method, params }) {
    this.calls.push(method);
    await this.beforeRequest.get(method)?.();
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [...this.accounts];
    if (method === 'eth_chainId') return this.chainId;
    if (method === 'eth_signTypedData_v4') {
      this.params.push(params);
      if (this.behavior === 'reject') throw Object.assign(new Error('SECRET user denied'), { code: 4001 });
      if (this.behavior === 'unsupported') throw Object.assign(new Error('SECRET'), { code: 4200 });
      if (this.behavior === 'unauthorized') throw Object.assign(new Error('SECRET'), { code: 4100 });
      if (this.behavior === 'hook') await this.hook?.();
      this.rawTypedData.push(params[1]);
      const data = JSON.parse(params[1]); this.typedData.push(data);
      const signer = this.behavior === 'wrong-key' ? otherAccount : this.signer;
      const signature = await signer.signTypedData(forViem(data));
      if (this.behavior === 'high-s') return highS(signature);
      if (this.behavior === 'short') return signature.slice(0, -2);
      if (this.behavior === 'bad-v') return `${signature.slice(0, -2)}01`;
      return signature;
    }
    throw Object.assign(new Error('SECRET'), { code: 4200 });
  }
}
const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.value; };
const code = (r, c, message) => { assert.equal(r.ok, false, message ?? 'expected failure'); assert.equal(r.error.code, c, message); assert.doesNotMatch(JSON.stringify(r), /SECRET|denied/); };
async function connected(role = 'seller') {
  const wallet = new FakeWallet(role === 'seller' ? sellerAccount : buyerAccount), adapter = new EvmWalletAdapter(wallet, 'fake', await registry());
  const session = ok(await adapter.connect('local-evm')); wallet.calls = [];
  return { wallet, adapter, session };
}

test('peer acceptance: both roles round-trip with signTerms through verifyEoaPeerAcceptance', async () => {
  for (const role of ['seller', 'buyer']) {
    const { wallet, adapter, session } = await connected(role);
    const termsSignature = ok(await adapter.signTerms(session, domain, terms, role));
    wallet.calls = [];
    const signed = ok(await adapter.signPeerAcceptance(session, terms, request(role)));
    assert.deepEqual(wallet.calls, ['eth_accounts', 'eth_chainId', 'eth_signTypedData_v4'], 'recheck then exactly one typed-data prompt');
    assert.equal(wallet.params.at(-1)[0], session.account, 'prompt is addressed to the session account');
    assert.equal(Object.isFrozen(signed), true); assert.equal(Object.isFrozen(signed.binding), true); assert.equal(Object.isFrozen(signed.domain), true);
    assert.deepEqual({ ...signed.domain }, domain, 'domain comes from the registry deployment');
    assert.equal(signed.termsHash, termsHash);
    assert.deepEqual(signed.binding, { v: 1, termsHash, role, account: terms[role], ownMessagingKey: request(role).ownMessagingKey,
      counterpartyMessagingKey: request(role).counterpartyMessagingKey, notAfterSeconds: '1699995000' });
    assert.equal(signed.bindingHash, peerAcceptanceHash(domain, signed.binding));
    assert.equal(signed.bindingHash, hashTypedData(forViem(wallet.typedData.at(-1))).slice(2), 'viem agrees with the shown typed data');
    assert.equal(signed.bindingSignature instanceof Uint8Array && signed.bindingSignature.byteLength, 65);
    const proof = { binding: signed.binding, termsSignature, bindingSignature: signed.bindingSignature };
    assert.deepEqual(verifyEoaPeerAcceptance(signed.domain, terms, context(role), proof), { candidateOnly: true, economicPreparationAllowed: false,
      termsHash, bindingHash: signed.bindingHash, effectiveNotAfterSeconds: '1699995000' }, role);
    // The counterparty-side context (swapped role) must not accept this proof.
    assert.equal(verifyEoaPeerAcceptance(signed.domain, terms, context(role === 'seller' ? 'buyer' : 'seller'), proof), null);
    assert.equal(wallet.calls.some(m => m === 'personal_sign' || m === 'eth_sign'), false);
  }
});

test('peer acceptance: typed-data JSON shown to the wallet has the exact shape', async () => {
  const { wallet, adapter, session } = await connected('buyer');
  ok(await adapter.signPeerAcceptance(session, terms, request('buyer')));
  const expected = '{"types":{"EIP712Domain":[{"name":"name","type":"string"},{"name":"version","type":"string"},'
    + '{"name":"chainId","type":"uint256"},{"name":"verifyingContract","type":"address"}],'
    + '"PeerAcceptance":[{"name":"v","type":"uint8"},{"name":"termsHash","type":"bytes32"},{"name":"role","type":"uint8"},'
    + '{"name":"account","type":"address"},{"name":"ownMessagingKey","type":"bytes32"},'
    + '{"name":"counterpartyMessagingKey","type":"bytes32"},{"name":"notAfterSeconds","type":"uint64"}]},'
    + '"primaryType":"PeerAcceptance",'
    + `"domain":{"name":"P2POfframp","version":"1","chainId":"31337","verifyingContract":"${ESCROW}"},`
    + `"message":{"v":1,"termsHash":"0x${termsHash}","role":1,"account":"${buyer}","ownMessagingKey":"0x${buyerKey}",`
    + `"counterpartyMessagingKey":"0x${sellerKey}","notAfterSeconds":"1699995000"}}`;
  assert.equal(wallet.rawTypedData.at(-1), expected);
  assert.equal(peerAcceptanceTypedData(domain, ok(await adapter.signPeerAcceptance(session, terms, request('buyer'))).binding), expected);
  const seller = await connected('seller');
  ok(await seller.adapter.signPeerAcceptance(seller.session, terms, request('seller')));
  assert.equal(seller.wallet.typedData.at(-1).message.role, 0);
});

test('peer acceptance: signatures that are not a strict low-s EOA signature by the account are refused', async () => {
  const { wallet, adapter, session } = await connected('seller');
  for (const behavior of ['wrong-key', 'high-s', 'short', 'bad-v']) {
    wallet.behavior = behavior; wallet.calls = [];
    code(await adapter.signPeerAcceptance(session, terms, request('seller')), 'INTEGRITY_FAILURE', behavior);
    assert.deepEqual(wallet.calls, ['eth_accounts', 'eth_chainId', 'eth_signTypedData_v4'], behavior);
  }
  assert.notEqual(adapter.inspect(), null, 'a bad signature does not by itself invalidate the session');
});

test('peer acceptance: provider errors map like signTerms and never downgrade', async () => {
  const { wallet, adapter, session } = await connected('seller');
  for (const [behavior, expected] of [['reject', 'USER_REJECTED'], ['unsupported', 'UNSUPPORTED_PROVIDER'], ['unauthorized', 'UNAUTHORIZED']]) {
    wallet.behavior = behavior; wallet.calls = [];
    code(await adapter.signPeerAcceptance(session, terms, request('seller')), expected, behavior);
    assert.deepEqual(wallet.calls, ['eth_accounts', 'eth_chainId', 'eth_signTypedData_v4'], 'no other signing method is tried');
  }
});

test('peer acceptance: account switch before or during the prompt is refused', async () => {
  {
    const { wallet, adapter, session } = await connected('seller');
    wallet.accounts = [buyerAccount.address];
    code(await adapter.signPeerAcceptance(session, terms, request('seller')), 'LOCKED');
    assert.deepEqual(wallet.calls, ['eth_accounts'], 'a changed account never reaches the prompt');
    assert.equal(adapter.inspect(), null);
  }
  {
    const { wallet, adapter, session } = await connected('seller');
    wallet.behavior = 'hook'; wallet.hook = async () => { wallet.emit('accountsChanged', [buyerAccount.address]); };
    code(await adapter.signPeerAcceptance(session, terms, request('seller')), 'LOCKED');
    assert.equal(wallet.typedData.length, 1, 'the wallet did sign, but the late signature is discarded');
    code(await adapter.signPeerAcceptance(session, terms, request('seller')), 'LOCKED', 'the invalidated session stays unusable');
  }
});

test('peer acceptance: chain switch before or during the prompt is refused', async () => {
  {
    const { wallet, adapter, session } = await connected('buyer');
    wallet.chainId = '0x1';
    code(await adapter.signPeerAcceptance(session, terms, request('buyer')), 'WRONG_CHAIN');
    assert.deepEqual(wallet.calls, ['eth_accounts', 'eth_chainId']);
    assert.equal(adapter.inspect(), null);
  }
  {
    const { wallet, adapter, session } = await connected('buyer');
    wallet.behavior = 'hook'; wallet.hook = async () => { wallet.emit('chainChanged', '0x1'); };
    code(await adapter.signPeerAcceptance(session, terms, request('buyer')), 'LOCKED');
  }
});

test('peer acceptance: preflight refusals never reach the wallet', async () => {
  const { wallet, adapter, session } = await connected('seller');
  const base = request('seller');
  code(await adapter.signPeerAcceptance(session, terms, { ...base, role: 'buyer' }), 'UNAUTHORIZED', 'account must equal terms[role]');
  code(await adapter.signPeerAcceptance(session, { ...terms, seller: `0x${'77'.repeat(20)}` }, base), 'UNAUTHORIZED', 'terms seller is not the session');
  code(await adapter.signPeerAcceptance(session, terms, { ...base, counterpartyMessagingKey: base.ownMessagingKey }), 'INVALID_INPUT', 'equal messaging keys');
  code(await adapter.signPeerAcceptance(session, terms, { ...base, ownMessagingKey: '00'.repeat(32) }), 'INVALID_INPUT', 'not a curve point');
  code(await adapter.signPeerAcceptance(session, terms, { ...base, ownMessagingKey: base.ownMessagingKey.toUpperCase() }), 'INVALID_INPUT', 'non-canonical key');
  code(await adapter.signPeerAcceptance(session, terms, { ...base, nowSeconds: '1699995000' }), 'EXPIRED', 'now == notAfter');
  code(await adapter.signPeerAcceptance(session, terms, { ...base, nowSeconds: '1700000000', notAfterSeconds: '1800000000' }), 'EXPIRED', 'acceptBefore also bounds');
  for (const [field, value] of [['notAfterSeconds', '0'], ['notAfterSeconds', '18446744073709551616'], ['notAfterSeconds', 1699995000],
    ['nowSeconds', '01'], ['nowSeconds', -1], ['role', 'arbiter']])
    code(await adapter.signPeerAcceptance(session, terms, { ...base, [field]: value }), 'INVALID_INPUT', `${field}=${value}`);
  code(await adapter.signPeerAcceptance(session, terms, { ...base, chainId: '1' }), 'INVALID_INPUT', 'caller cannot supply domain fields');
  code(await adapter.signPeerAcceptance(session, terms, { ...base, verifyingContract: `0x${'33'.repeat(20)}` }), 'INVALID_INPUT');
  const { nowSeconds: _omitted, ...missing } = base;
  code(await adapter.signPeerAcceptance(session, terms, missing), 'INVALID_INPUT', 'missing field');
  code(await adapter.signPeerAcceptance(session, terms, Object.defineProperty({ ...base }, 'role', { get() { throw new Error('SECRET'); }, enumerable: true })), 'INVALID_INPUT', 'accessor');
  code(await adapter.signPeerAcceptance(session, { ...terms, deploymentId: 'escrow-v9' }, base), 'UNSUPPORTED_PROVIDER');
  code(await adapter.signPeerAcceptance(session, { ...terms, networkId: 'other-evm' }, base), 'UNSUPPORTED_PROVIDER');
  code(await adapter.signPeerAcceptance(session, { ...terms, assetKind: 'erc20', asset: TOKEN }, base), 'UNSUPPORTED_PROVIDER', 'token not supported by deployment');
  code(await adapter.signPeerAcceptance(session, { ...terms, amountBaseUnits: '0' }, base), 'INVALID_INPUT');
  code(await adapter.signPeerAcceptance({ ...session }, terms, base), 'LOCKED', 'a copied session object is not the live session');
  const controller = new AbortController(); controller.abort();
  code(await adapter.signPeerAcceptance(session, terms, base, controller.signal), 'CANCELLED');
  assert.deepEqual(wallet.calls, [], 'no wallet request before preflight passes');
  // Control: the same session still signs once inputs are valid.
  ok(await adapter.signPeerAcceptance(session, terms, base));
});

test('peer acceptance: terms on another registry EVM network are refused before any wallet request', async () => {
  const { wallet, adapter, session } = await connected('seller');
  assert.equal(session.networkId, 'local-evm');
  const foreign = { ...terms, networkId: 'local-evm-2', deploymentId: 'escrow-v1-b' };
  code(await adapter.signPeerAcceptance(session, foreign, request('seller')), 'UNSUPPORTED_PROVIDER', 'terms network differs from the session network');
  assert.deepEqual(wallet.calls, [], 'no wallet request for a foreign-network preflight refusal');
  assert.notEqual(adapter.inspect(), null, 'the live session is not invalidated');
  // Control: the same session still signs its own network's terms.
  ok(await adapter.signPeerAcceptance(session, terms, request('seller')));
});

test('peer acceptance: domain is rebuilt from the registry and inputs are snapshotted before the first await', async () => {
  const { wallet, adapter, session } = await connected('seller');
  let begin, release;
  const waiting = new Promise(resolve => { begin = resolve; }), gate = new Promise(resolve => { release = resolve; });
  wallet.beforeRequest.set('eth_accounts', async () => { begin(); await gate; });
  const mutableTerms = { ...terms }, mutableRequest = request('seller');
  const pending = adapter.signPeerAcceptance(session, mutableTerms, mutableRequest);
  await waiting;
  mutableTerms.amountBaseUnits = '2'; mutableRequest.notAfterSeconds = '1699999999'; mutableRequest.ownMessagingKey = buyerKey;
  release();
  const signed = ok(await pending);
  assert.deepEqual(wallet.typedData.at(-1).domain, { name: 'P2POfframp', version: '1', chainId: '31337', verifyingContract: ESCROW });
  assert.equal(signed.binding.termsHash, termsHash); assert.equal(signed.binding.notAfterSeconds, '1699995000');
  assert.equal(signed.binding.ownMessagingKey, sellerKey);
});

test('peer acceptance: cancellation and late results are discarded', async () => {
  {
    const { wallet, adapter, session } = await connected('seller'), controller = new AbortController();
    let begin, release;
    const waiting = new Promise(resolve => { begin = resolve; }), gate = new Promise(resolve => { release = resolve; });
    wallet.beforeRequest.set('eth_accounts', async () => { begin(); await gate; });
    const pending = adapter.signPeerAcceptance(session, terms, request('seller'), controller.signal);
    await waiting; controller.abort(); release();
    code(await pending, 'CANCELLED'); assert.deepEqual(wallet.calls, ['eth_accounts']);
  }
  {
    const { wallet, adapter, session } = await connected('seller'), controller = new AbortController();
    wallet.behavior = 'hook'; wallet.hook = async () => { controller.abort(); };
    code(await adapter.signPeerAcceptance(session, terms, request('seller'), controller.signal), 'CANCELLED');
  }
  {
    const { wallet, adapter, session } = await connected('seller');
    wallet.behavior = 'hook'; wallet.hook = async () => { adapter.dispose(); };
    code(await adapter.signPeerAcceptance(session, terms, request('seller')), 'LOCKED');
  }
});
