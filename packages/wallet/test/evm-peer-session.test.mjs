// D1 composition end to end: real NIP-17 exchange in D1 mode + this package's ports (account-classifying verifier,
// encrypted replay ledger in a real vault) + real secp256k1 signatures by the public scenario keys. Fake EIP-1193
// read port; no network, wallet prompt or funds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { RegistryService, TERMS_REVIEW_FORMAT } from '../../domain/index.ts';
import { createLocalNobleNostrProvider } from '../../nostr-crypto/index.ts';
import { createAdEvent, createOrderBook } from '../../relay/index.ts';
import { createRelayEventCrypto, createTermsExchange, adBookKey, BOTH_VERIFIED_LABEL } from '../../exchange/index.ts';
import { EncryptedVaultService } from '../../storage/src/vault-service.ts';
import { EncryptedBackupService } from '../../storage/src/backup-service.ts';
import { VaultStorageError } from '../../storage/src/idb-vault-store.ts';
import { decodeBase64url } from '../../schemas/index.ts';
import { evmTermsHash, keccak256 } from '../src/evm-terms.ts';
import { peerAcceptanceHash, resolvePeerDomain } from '../src/evm-peer-acceptance.ts';
import { PEER_REPLAY_RECORD_ID } from '../src/evm-peer-replay.ts';
import { createEvmPeerAcceptancePorts, evmTermsFromReviewed } from '../src/evm-peer-port.ts';

const dir = new URL('../../domain/test/fixtures/local-evm-scenario/', import.meta.url);
const scenario = JSON.parse(await readFile(new URL('scenario.json', dir), 'utf8'));
const registryJSON = JSON.parse(await readFile(new URL('registry.json', dir), 'utf8'));
const provider = createLocalNobleNostrProvider(), NOW = 1_699_990_000, set = scenario.sets.native, ORDER = set.terms.orderId;
const W = '0x' + '88'.repeat(20), DELEGATED = '0xef0100' + '77'.repeat(20), MAGIC = '0x1626ba7e' + '0'.repeat(56), PASS = 'synthetic D1 session passphrase';
const utf8 = new TextEncoder(), hex = bytes => Buffer.from(bytes).toString('hex');
const ok = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const fail = (result, code) => { assert.equal(result.ok, false, `expected ${code}, got ${JSON.stringify(result)}`); assert.equal(result.code, code); return result; };
async function loadRegistry(patch = () => {}) {
  const raw = structuredClone(registryJSON);
  raw.networks[0].deployments[0].runtime.keccak256 = hex(keccak256(Buffer.from('6000', 'hex'))); patch(raw);
  const bytes = utf8.encode(JSON.stringify(raw)), registry = new RegistryService();
  assert.equal((await registry.load(bytes, createHash('sha256').update(bytes).digest('hex'))).ok, true);
  return { registry, raw };
}
const { registry, raw } = await loadRegistry();
const hashTerms = reviewed => evmTermsHash(resolvePeerDomain(registry, evmTermsFromReviewed(reviewed)), evmTermsFromReviewed(reviewed));
const nodeSha256 = async bytes => { const d = createHash('sha256').update(bytes).digest(); return d.buffer.slice(d.byteOffset, d.byteOffset + 32); };
const termsBytes = (terms = set.terms) => utf8.encode(JSON.stringify({ format: TERMS_REVIEW_FORMAT, terms, privateAgreement: set.privateAgreementInput }));
class Store {
  rows = new Map();
  subscribeInvalidation() { return () => {}; }
  async get(id) { return structuredClone(this.rows.get(id)); }
  async add(row) { this.rows.set(row.profileId, structuredClone(row)); }
  async compareAndSwap(expected, next, options) {
    options?.assertCurrent?.();
    if (JSON.stringify(this.rows.get(expected.profileId)) !== JSON.stringify(expected)) throw new VaultStorageError('CONFLICT');
    this.rows.set(next.profileId, structuredClone(next));
  }
}
/** Shared fake chain: account code and ERC-1271 approvals; every request is recorded. */
function fakeChain() {
  const chain = { escrowCode: '0x6000', codes: new Map(), approved: new Set(), calls: [], anchor: { number: '0x10', hash: '0x' + '12'.repeat(32), timestamp: '0x' + NOW.toString(16) } };
  chain.request = async ({ method, params = [] }) => {
    chain.calls.push(method);
    if (method === 'eth_chainId') return '0x7a69';
    if (method === 'eth_getBlockByNumber') return params[0] === '0x0' ? { number: '0x0', hash: raw.networks[0].genesisHash, timestamp: '0x0' } : { ...chain.anchor };
    if (method === 'eth_getCode') return params[0] === raw.networks[0].deployments[0].address ? chain.escrowCode : chain.codes.get(params[0]) ?? '0x';
    if (method === 'eth_call') { const data = params[0].data; return chain.approved.has(`${params[0].to}:${data.slice(10, 74)}`) ? MAGIC : '0xffffffff' + '0'.repeat(56); }
    throw Error('unexpected ' + method);
  };
  return chain;
}
const sign = (role, digest) => {
  const signature = secp256k1.sign(Buffer.from(digest, 'hex'), Buffer.from(scenario.testOnlyKeys[role].privateKeyHex, 'hex'), { prehash: false, format: 'recovered', lowS: true });
  return '0x' + hex(Uint8Array.from([...signature.subarray(1), signature[0] + 27]));
};
/** What the external wallet returns for the two prompts: TradeTerms digest and PeerAcceptance binding digest. */
function signStatement(statement, role, { as = role } = {}) {
  const domain = resolvePeerDomain(registry, evmTermsFromReviewed(statement.reviewed));
  return { binding: { ...statement.binding }, termsSignature: sign(as, statement.termsHash), bindingSignature: sign(as, peerAcceptanceHash(domain, statement.binding)) };
}
/** Contract wallet W "signs" by approving both digests on chain. */
function contractStatement(chain, statement) {
  const domain = resolvePeerDomain(registry, evmTermsFromReviewed(statement.reviewed));
  chain.approved.add(`${W}:${statement.termsHash}`); chain.approved.add(`${W}:${peerAcceptanceHash(domain, statement.binding)}`);
  return { binding: { ...statement.binding }, termsSignature: '0x' + '07'.repeat(97), bindingSignature: '0x' + '09'.repeat(150) };
}
async function party(chain, clock, { store = new Store(), verifierRegistry = registry, keys } = {}) {
  const k = keys ?? await provider.generate(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false });
  const session = ok(await vault.create(PASS)), ports = createEvmPeerAcceptancePorts({ registry: verifierRegistry, request: chain.request, vault, session });
  const book = createOrderBook({ nowSeconds: () => clock.now, verifier: await createRelayEventCrypto(provider, k.secretKey) });
  const ex = createTermsExchange({ provider, selfPublicKey: k.publicKey, ads: book, registry, hashTerms, now: () => clock.now, sha256: nodeSha256,
    peerAcceptance: { verifier: ports.verifier, replay: ports.replay } });
  return { secret: k.secretKey, pub: k.publicKey, keys: k, store, vault, session, ports, book, ex, close() { ex.close(); ports.dispose(); vault.dispose(); } };
}
async function world(t, options = {}) {
  const chain = options.chain ?? fakeChain(), clock = { now: NOW };
  const seller = await party(chain, clock, options.seller), buyer = await party(chain, clock, options.buyer);
  const ad = await createAdEvent(await createRelayEventCrypto(provider, seller.secret), { app: 'p2p-offramp', v: 1, orderId: ORDER, revision: 1, networkId: 'eip155:31337',
    assetId: 'native', amountMin: '1000000000000000000', amountMax: '2000000000000000000', currency: 'USD', railClass: 'bank-transfer', expiresAtSeconds: String(NOW + 1800), maker: seller.pub }, NOW);
  assert.equal(seller.book.ingest(ad), 'accepted'); assert.equal(buyer.book.ingest(ad), 'accepted');
  t.after(() => { seller.close(); buyer.close(); });
  return { chain, clock, seller, buyer, ad, key: adBookKey(seller.pub, ORDER) };
}
async function offered(w, { terms = set.terms, sellerSigns = statement => signStatement(statement, 'seller') } = {}) {
  const take = ok(await w.buyer.ex.take(w.key, terms.buyer, w.buyer.secret)); ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  const statement = ok(await w.seller.ex.acceptanceStatement(take.sessionId, termsBytes(terms), String(NOW + 5000)));
  const offer = ok(await w.seller.ex.offerWithAcceptance(take.sessionId, termsBytes(terms), sellerSigns(statement), w.seller.secret));
  return { id: take.sessionId, offer, statement, got: await w.buyer.ex.receive(offer.recipientWrap, w.buyer.secret) };
}
async function accepted(w, options = {}) {
  const r = await offered(w, options); ok(r.got);
  const terms = options.terms ?? set.terms, statement = ok(await w.buyer.ex.acceptanceStatement(r.id, termsBytes(terms), String(NOW + 5000)));
  const accept = ok(await w.buyer.ex.acceptWithAcceptance(r.id, termsBytes(terms), signStatement(statement, 'buyer'), w.buyer.secret));
  return { ...r, accept, done: await w.seller.ex.receive(accept.recipientWrap, w.seller.secret) };
}
const ledgerJson = async who => {
  const record = ok(await who.vault.read(who.session.sessionId, PEER_REPLAY_RECORD_ID));
  return record === null ? null : JSON.parse(new TextDecoder().decode(decodeBase64url(record.payload, 1, 131072)));
};

test('EOA seller and buyer: both wallet statements verified with pinned classification, durably admitted, signatures nowhere shown or stored', async t => {
  const w = await world(t), r = await accepted(w);
  assert.equal(ok(r.got).acceptance.label, `seller: signed by wallet ${set.terms.seller}`);
  assert.equal(ok(r.done).state, 'accepted'); assert.equal(ok(r.done).acceptance.scheme, 'eoa');
  for (const who of [w.seller, w.buyer]) {
    const status = ok(await who.ex.acceptanceStatus(r.id, 'fund'));
    assert.equal(status.state, 'both-verified'); assert.equal(status.label, BOTH_VERIFIED_LABEL); assert.equal(status.freshness, 'local-history');
    const stored = await ledgerJson(who);
    assert.equal(stored.entries.length, 1); assert.ok(stored.entries[0].seller && stored.entries[0].buyer);
    const text = JSON.stringify([stored, who.ex.session(r.id), status]);
    assert.doesNotMatch(text, /[0-9a-f]{130}/, 'no 65-byte signature hex in views or the decrypted ledger');
    assert.doesNotMatch(text, /Signature/);
  }
  assert.ok(w.chain.calls.every(method => ['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call'].includes(method)));
  assert.equal(w.chain.calls.includes('eth_call'), false, 'EOAs never take the ERC-1271 path');
});
test('contract-wallet seller: ERC-1271 for both statements, shown as an unfinalized point-in-time read; revocation blocks new acceptance', async t => {
  const chain = fakeChain(); chain.codes.set(W, '0x60016000');
  const w = await world(t, { chain }), terms = { ...set.terms, seller: W };
  const r = await offered(w, { terms, sellerSigns: statement => contractStatement(chain, statement) });
  assert.equal(ok(r.got).acceptance.label, 'seller: accepted by contract wallet at block 16 (unfinalized)');
  assert.equal(ok(await w.buyer.ex.acceptanceStatus(r.id, 'display')).seller.label, 'seller: accepted by contract wallet at block 16 (unfinalized)');
  chain.approved.clear(); // the wallet's signing policy changed before the buyer accepted
  const statement = ok(await w.buyer.ex.acceptanceStatement(r.id, termsBytes(terms), String(NOW + 5000)));
  const refused = fail(await w.buyer.ex.acceptWithAcceptance(r.id, termsBytes(terms), signStatement(statement, 'buyer'), w.buyer.secret), 'ACCEPTANCE_REFUSED');
  assert.equal(refused.acceptance, 'UNAUTHORIZED');
  const display = ok(await w.buyer.ex.acceptanceStatus(r.id, 'display'));
  assert.equal(display.state, 'invalid'); assert.equal(display.label, null);
});
test('EIP-7702 delegated accounts are refused, before sending and on a later funding recheck', async t => {
  const chain = fakeChain(), w = await world(t, { chain }), r = await offered(w);
  chain.codes.set(set.terms.buyer, DELEGATED);
  const statement = ok(await w.buyer.ex.acceptanceStatement(r.id, termsBytes(), String(NOW + 5000)));
  const refused = fail(await w.buyer.ex.acceptWithAcceptance(r.id, termsBytes(), signStatement(statement, 'buyer'), w.buyer.secret), 'UNSUPPORTED_ACCOUNT');
  assert.equal(refused.reason, 'eip7702-delegated');
  chain.codes.delete(set.terms.buyer);
  const v = await world(t), q = await accepted(v); ok(q.done);
  v.chain.codes.set(set.terms.seller, DELEGATED); // the seller EOA delegated after acceptance
  const recheck = fail(await v.buyer.ex.acceptanceStatus(q.id, 'fund'), 'UNSUPPORTED_ACCOUNT'); assert.equal(recheck.reason, 'eip7702-delegated');
});
test('wrong signer, terms-only signature reuse, network and deployment mismatches are refused without state change', async t => {
  const w = await world(t), take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret)); ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  const statement = ok(await w.seller.ex.acceptanceStatement(take.sessionId, termsBytes(), String(NOW + 5000)));
  const good = signStatement(statement, 'seller');
  for (const acceptance of [signStatement(statement, 'seller', { as: 'buyer' }), { ...good, bindingSignature: good.termsSignature }, { ...good, termsSignature: good.bindingSignature }]) {
    const result = fail(await w.seller.ex.offerWithAcceptance(take.sessionId, termsBytes(), acceptance, w.seller.secret), 'ACCEPTANCE_REFUSED');
    assert.equal(result.acceptance, 'UNAUTHORIZED'); assert.equal(w.seller.ex.session(take.sessionId).state, 'taken');
  }
  // The verifier's own registry names another chain: the exchange-reviewed terms do not match it.
  const { registry: other } = await loadRegistry(rawCopy => { rawCopy.networks[0].chainIdentity = '1'; });
  const x = await world(t, { buyer: { verifierRegistry: other } }), xr = await offered(x);
  assert.equal(fail(xr.got, 'ACCEPTANCE_REFUSED').acceptance, 'WRONG_CHAIN');
  // The chain's escrow code no longer matches the registry runtime hash.
  const chain = fakeChain(), y = await world(t, { chain }), yt = ok(await y.buyer.ex.take(y.key, set.terms.buyer, y.buyer.secret));
  ok(await y.seller.ex.receive(yt.recipientWrap, y.seller.secret));
  const ys = ok(await y.seller.ex.acceptanceStatement(yt.sessionId, termsBytes(), String(NOW + 5000)));
  chain.escrowCode = '0x6001';
  assert.equal(fail(await y.seller.ex.offerWithAcceptance(yt.sessionId, termsBytes(), signStatement(ys, 'seller'), y.seller.secret), 'ACCEPTANCE_UNAVAILABLE').acceptance, 'INTEGRITY_FAILURE');
});
test('a tombstoned termsHash is refused in a new session, after reload, and from a fresh-key restore of the latest backup', async t => {
  const w = await world(t), r = await offered(w); ok(r.got);
  const cancel = ok(await w.seller.ex.cancel(r.id, 'withdrawn', w.seller.secret)); ok(await w.buyer.ex.receive(cancel.recipientWrap, w.buyer.secret));
  // Same pair, new session over the same advert: the seller's own ledger refuses re-offering the cancelled terms.
  w.clock.now = NOW + 901; // the cancelled session's replay ids have expired
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret)); ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  const again = ok(await w.seller.ex.acceptanceStatement(take.sessionId, termsBytes(), String(NOW + 5000)));
  assert.equal(again.termsHash, r.statement.termsHash);
  fail(await w.seller.ex.offerWithAcceptance(take.sessionId, termsBytes(), signStatement(again, 'seller'), w.seller.secret), 'TOMBSTONED');
  // A seller device without that history re-sends the same statement: the buyer's ledger refuses it.
  const clock = { now: w.clock.now }, twin = await party(w.chain, clock, { keys: w.seller.keys });
  t.after(() => twin.close()); assert.equal(twin.book.ingest(w.ad), 'accepted');
  ok(await twin.ex.receive(take.recipientWrap, twin.secret));
  const resent = ok(await twin.ex.offerWithAcceptance(take.sessionId, termsBytes(), signStatement(again, 'seller'), twin.secret));
  fail(await w.buyer.ex.receive(resent.recipientWrap, w.buyer.secret), 'TOMBSTONED');
  // Reload: a new exchange and ledger over the same encrypted vault still refuses.
  const reopened = ok(await w.buyer.vault.unlock(w.buyer.session.profileId, PASS));
  const ports = createEvmPeerAcceptancePorts({ registry, request: w.chain.request, vault: w.buyer.vault, session: reopened }); t.after(() => ports.dispose());
  assert.equal(ok(await ports.replay.status(r.statement.termsHash, w.clock.now)).tombstoned, true);
  // Fresh-key restore of the latest backup keeps the tombstone (conservative); restore uses a new key and profile.
  const backup = new EncryptedBackupService(w.buyer.store, crypto), bytes = await backup.export(w.buyer.session.profileId);
  const receipt = await backup.restore(bytes, PASS, 'fresh key after device loss');
  const restoredVault = new EncryptedVaultService(w.buyer.store, crypto, { lifecycle: false }); t.after(() => restoredVault.dispose());
  const restored = ok(await restoredVault.unlock(receipt.newProfileId, 'fresh key after device loss'));
  const restoredPorts = createEvmPeerAcceptancePorts({ registry, request: w.chain.request, vault: restoredVault, session: restored }); t.after(() => restoredPorts.dispose());
  assert.equal(ok(await restoredPorts.replay.status(r.statement.termsHash, w.clock.now)).tombstoned, true);
});
test('an older backup cannot see later tombstones: its exchange never claims global freshness', async t => {
  const w = await world(t), r = await offered(w); ok(r.got);
  const backup = new EncryptedBackupService(w.buyer.store, crypto), older = await backup.export(w.buyer.session.profileId);
  const cancel = ok(await w.seller.ex.cancel(r.id, 'withdrawn', w.seller.secret)); ok(await w.buyer.ex.receive(cancel.recipientWrap, w.buyer.secret));
  const receipt = await backup.restore(older, PASS, 'older backup passphrase');
  const vault = new EncryptedVaultService(w.buyer.store, crypto, { lifecycle: false }); t.after(() => vault.dispose());
  const session = ok(await vault.unlock(receipt.newProfileId, 'older backup passphrase'));
  const ports = createEvmPeerAcceptancePorts({ registry, request: w.chain.request, vault, session }); t.after(() => ports.dispose());
  assert.equal(ok(await ports.replay.status(r.statement.termsHash, NOW)).tombstoned, false, 'documented limitation');
  // Even a both-verified status from such a profile carries only local freshness.
  const v = await world(t), q = await accepted(v); ok(q.done);
  assert.equal(ok(await v.seller.ex.acceptanceStatus(q.id, 'display')).freshness, 'local-history');
});
test('lock refuses admission and status; concurrent cancel and accept on one real ledger leave no valid acceptance behind a tombstone', async t => {
  const w = await world(t), r = await offered(w); ok(r.got);
  const statement = ok(await w.buyer.ex.acceptanceStatement(r.id, termsBytes(), String(NOW + 5000)));
  const accept = ok(await w.buyer.ex.acceptWithAcceptance(r.id, termsBytes(), signStatement(statement, 'buyer'), w.buyer.secret));
  const [cancelled, received] = await Promise.all([w.seller.ex.cancel(r.id, 'withdrawn', w.seller.secret), w.seller.ex.receive(accept.recipientWrap, w.seller.secret)]);
  assert.equal([cancelled.ok, received.ok].filter(Boolean).length >= 1, true);
  const tombstoned = ok(await w.seller.ports.replay.status(r.statement.termsHash, NOW)).tombstoned;
  const display = ok(await w.seller.ex.acceptanceStatus(r.id, 'display'));
  if (tombstoned) { assert.equal(display.label, null); fail(await w.seller.ex.acceptanceStatus(r.id, 'fund'), 'TOMBSTONED'); }
  else { assert.equal(received.ok, true); assert.equal(display.label, BOTH_VERIFIED_LABEL); }
  const v = await world(t), q = await offered(v); ok(q.got);
  v.buyer.vault.lockAll();
  const buyerStatement = ok(await v.buyer.ex.acceptanceStatement(q.id, termsBytes(), String(NOW + 5000)));
  const locked = fail(await v.buyer.ex.acceptWithAcceptance(q.id, termsBytes(), signStatement(buyerStatement, 'buyer'), v.buyer.secret), 'ACCEPTANCE_UNAVAILABLE');
  assert.equal(locked.acceptance, 'LOCKED'); assert.equal(v.buyer.ex.session(q.id).state, 'offered');
});
test('public adverts never carry acceptance signatures: the advert encoder refuses them in any field', async () => {
  const k = await provider.generate(), signer = await createRelayEventCrypto(provider, k.secretKey), signature = '0x' + 'ab'.repeat(65);
  const ad = { app: 'p2p-offramp', v: 1, orderId: ORDER, revision: 1, networkId: 'eip155:31337', assetId: 'native', amountMin: '1', amountMax: '2',
    currency: 'USD', railClass: 'bank-transfer', expiresAtSeconds: String(NOW + 600), maker: k.publicKey };
  assert.ok(await createAdEvent(signer, ad, NOW));
  for (const extra of [{ termsSignature: signature }, { bindingSignature: signature }, { acceptance: { termsSignature: signature } }])
    await assert.rejects(createAdEvent(signer, { ...ad, ...extra }, NOW), /INVALID_AD/);
  for (const field of ['assetId', 'networkId', 'railClass', 'currency', 'orderId', 'maker'])
    await assert.rejects(createAdEvent(signer, { ...ad, [field]: signature }, NOW), /INVALID_AD/, field);
  signer.dispose();
});

// ---------- After funding: acceptance state never vetoes release, refund or payout ----------
const LIFE_ESCROW = `0x${'ee'.repeat(20)}`, LIFE_ACCOUNT = set.terms.seller, LIFE_BLOCK = '0x' + 'bb'.repeat(32);
const lifeBinding = { chain: 'evm', networkId: 'local-evm', deploymentId: 'escrow-local-v1', tradeId: 'ab'.repeat(32) };
/** Funded escrow seen by the canonical G12 lifecycle's reader port; nothing here reads acceptance state. */
const fundedReader = () => ({
  chainId: async () => ({ ok: true, value: '31337' }), head: async () => ({ ok: true, value: { number: '5', hash: LIFE_BLOCK } }),
  blockHashAt: async () => ({ ok: true, value: LIFE_BLOCK }), transactionCount: async () => ({ ok: true, value: '0' }),
  transaction: async () => ({ ok: true, value: null }), receipt: async () => ({ ok: true, value: null }), escrowState: async () => ({ ok: true, value: 'funded' }),
  escrowObservation: async (target, request) => ({ ok: true, value: { binding: target, generation: request.generation, requestSequence: request.requestSequence,
    anchor: { height: '5', hash: LIFE_BLOCK }, state: 'funded', finality: 'pending', observedAt: 1000 } }),
});
test('after funding: expired acceptance, a later tombstone or a changed peer policy never veto release or refund preparation', async t => {
  const { createLifecycleJournal } = await import('../../domain/src/intent-journal.ts');
  const { createEvmTxLifecycle, evmFinalityPolicy } = await import('../../domain/src/tx-lifecycle.ts');
  const { createReadRetrier } = await import('../../domain/src/read-retry.ts');
  const retry = createReadRetrier({ now: () => performance.now(), random: () => 0, schedule(callback, delay) { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); } });
  const policy = evmFinalityPolicy({ chain: 'evm', finality: { kind: 'evm-finalized-tag' } }, 2, 5);
  for (const change of ['expired', 'tombstoned', 'policy-changed']) {
    const w = await world(t), r = await accepted(w); ok(r.done);
    assert.equal(ok(await w.seller.ex.acceptanceStatus(r.id, 'fund')).state, 'both-verified', 'acceptance valid before funding');
    // Funding happened (chain observation); now the acceptance stops being current in one of three ways.
    if (change === 'expired') w.clock.now = Number(set.terms.acceptBeforeSeconds) + 1;
    if (change === 'tombstoned') ok(await w.seller.ports.replay.tombstone(r.statement.termsHash, { ad: w.seller.ex.session(r.id).ad, peer: w.buyer.pub,
      acceptBeforeSeconds: set.terms.acceptBeforeSeconds, nowSeconds: NOW }));
    if (change === 'policy-changed') w.chain.codes.set(set.terms.buyer, DELEGATED);
    const gate = await w.seller.ex.acceptanceStatus(r.id, 'fund');
    assert.equal(gate.ok, false, `${change}: a new funding preparation is refused`);
    // The lifecycle (its own vault journal, reader and wallet) prepares release and refund regardless. One lifecycle per
    // action: a prepared intent reserves the account nonce.
    for (const action of ['release', 'refund']) {
      const store = new Store(), vault = new EncryptedVaultService(store, crypto, { lifecycle: false }), session = ok(await vault.create(PASS));
      let sends = 0;
      const wallet = async ({ method }) => { if (method === 'eth_accounts') return [LIFE_ACCOUNT]; if (method === 'eth_chainId') return '0x7a69'; sends++; throw Object.assign(Error('no'), { code: 4200 }); };
      const journal = createLifecycleJournal({ vault, session, validateCanonical: () => ({ ok: true, value: undefined }) });
      const life = createEvmTxLifecycle({ journal, reader: fundedReader(), wallet, policy, retry });
      t.after(() => { life.dispose(); journal.dispose(); vault.dispose(); });
      await life.walletChanged({ account: LIFE_ACCOUNT, chainId: '31337', generation: 1 });
      const prepared = ok(await life.prepare({ binding: lifeBinding, action, expectedEscrowState: 'funded', call: { to: LIFE_ESCROW, data: '0x01', value: '0' } }));
      assert.equal(prepared.request.from, LIFE_ACCOUNT, `${change}: ${action} prepared`);
      assert.equal(sends, 0, 'preparation never sends');
    }
  }
  // Structural guarantee: the lifecycle, execution and escrow builders have no path to acceptance state.
  for (const file of ['../../domain/src/tx-lifecycle.ts', '../../domain/src/intent-journal.ts', '../src/evm-submit.ts', '../src/evm-execution.ts', '../src/evm-escrow.ts']) {
    const text = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /exchange\/|evm-peer-|peer-acceptance|acceptanceStatus/, file);
  }
});
