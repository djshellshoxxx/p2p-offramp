// D1 version 2 carrier inside the exchange, with injected fake ports (the wallet composition is tested in
// packages/wallet/test/evm-peer-session.test.mjs). Real NIP-44/59 crypto; synthetic local scenario; no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { RegistryService } from '../../domain/src/registry.ts';
import { TERMS_REVIEW_FORMAT } from '../../domain/index.ts';
import { evmTermsHash } from '../../wallet/src/evm-terms.ts';
import { createUnsignedEvent, createSeal, createGiftWrap, createLocalNobleNostrProvider } from '../../nostr-crypto/index.ts';
import { createAdEvent, createOrderBook } from '../../relay/index.ts';
import {
  createRelayEventCrypto, createTermsExchange, adAddress, adBookKey, encodeEnvelope, envelopeTags, parseEnvelope, parseEnvelopeV2, encodeEnvelopeV2,
  parsePeerAcceptanceWire, BOTH_VERIFIED_LABEL, MAX_PEER_SIGNATURE_BYTES, MAX_OFFER_TERMS_BYTES, MAX_PEER_ACCEPT_HORIZON_SECONDS, MAX_ENVELOPE_BYTES,
} from '../index.ts';

const dir = new URL('../../domain/test/fixtures/local-evm-scenario/', import.meta.url);
const scenario = JSON.parse(await readFile(new URL('scenario.json', dir), 'utf8'));
const registry = new RegistryService(); assert.equal((await registry.load(new Uint8Array(await readFile(new URL('registry.json', dir))), scenario.registrySha256)).ok, true);
const provider = createLocalNobleNostrProvider(), NOW = 1_699_990_000, set = scenario.sets.native, ORDER = set.terms.orderId, ZERO = `0x${'0'.repeat(40)}`;
const utf8 = new TextEncoder();
const termsBytes = (terms = set.terms) => utf8.encode(JSON.stringify({ format: TERMS_REVIEW_FORMAT, terms, privateAgreement: set.privateAgreementInput }));
const hashTerms = r => evmTermsHash({ chainId: r.network.chainId, verifyingContract: r.deployment.address }, {
  orderId: r.orderId, revision: r.revision, networkId: r.network.id, deploymentId: r.deployment.id, seller: r.seller, buyer: r.buyer,
  assetKind: r.asset.kind, asset: r.asset.address ?? ZERO, amountBaseUnits: r.amountBaseUnits, privateAgreementHash: r.privateAgreementSha256,
  capabilitiesHash: r.capabilitiesSha256, sellerNonce: r.sellerNonce, acceptBeforeSeconds: r.acceptBeforeSeconds, escrowExpirySeconds: r.escrowExpirySeconds });
const nodeSha256 = async bytes => { const d = createHash('sha256').update(bytes).digest(); return d.buffer.slice(d.byteOffset, d.byteOffset + 32); };
const ok = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const fail = (result, code) => { assert.equal(result.ok, false, `expected ${code}, got ${JSON.stringify(result)}`); assert.equal(result.code, code); return result; };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const SIG = '0x' + 'ab'.repeat(65);

/** Fake verifier: accepts any request whose wire binding matches it; records every call. `refuse` / `hold` steer it. */
function fakePorts() {
  const calls = [], tombstones = new Set(), bindings = new Map();
  const ports = {
    calls, tombstones, bindings, refuse: null, scheme: 'eoa', hold: null, replayRefuse: null, tombstoneHold: null, tombstoneRefuse: null,
    verifier: { async verify(request) {
      calls.push({ port: 'verify', request });
      if (ports.hold) await ports.hold.promise;
      if (ports.refuse) return typeof ports.refuse === 'function' ? ports.refuse(request) : ports.refuse;
      const b = request.acceptance.binding, deadline = [BigInt(b.notAfterSeconds), BigInt(request.reviewed.acceptBeforeSeconds),
        ...(request.envelopeExpiresAtSeconds === null ? [] : [BigInt(request.envelopeExpiresAtSeconds)])].reduce((x, y) => x < y ? x : y);
      if (BigInt(request.nowSeconds) >= deadline) return { ok: false, code: 'EXPIRED' };
      return { ok: true, value: Object.freeze({ scheme: ports.scheme, binding: b, termsHash: request.termsHash, bindingHash: 'cd'.repeat(32),
        effectiveNotAfterSeconds: deadline.toString(), anchor: { height: '16', hash: '0x' + '12'.repeat(32), timestamp: String(request.nowSeconds) },
        finality: 'unfinalized', economicPreparationAllowed: false }) };
    } },
    replay: {
      async admit(evidence, scope) {
        calls.push({ port: 'admit', evidence, scope });
        if (ports.replayRefuse) return ports.replayRefuse;
        if (tombstones.has(evidence.termsHash)) return { ok: false, code: 'TOMBSTONED' };
        const key = `${evidence.termsHash}:${evidence.binding.role}`, previous = bindings.get(key);
        if (previous && JSON.stringify(previous) !== JSON.stringify(evidence.binding)) return { ok: false, code: 'CONFLICT' };
        bindings.set(key, evidence.binding); return { ok: true, value: { status: previous ? 'duplicate' : 'recorded' } };
      },
      async tombstone(termsHash, scope) {
        calls.push({ port: 'tombstone', termsHash, scope });
        if (ports.tombstoneHold) await ports.tombstoneHold.promise;
        if (ports.tombstoneRefuse) return ports.tombstoneRefuse;
        tombstones.add(termsHash); return { ok: true, value: undefined };
      },
      async status(termsHash) { calls.push({ port: 'status', termsHash }); return { ok: true, value: { tombstoned: tombstones.has(termsHash),
        sellerRecorded: bindings.has(`${termsHash}:seller`), buyerRecorded: bindings.has(`${termsHash}:buyer`) } }; },
    },
  };
  return ports;
}
async function party() { const k = await provider.generate(); return { secret: k.secretKey, pub: k.publicKey, crypto: await createRelayEventCrypto(provider, k.secretKey) }; }
async function world({ d1 = true, sellerD1 = d1, buyerD1 = d1, now = NOW } = {}) {
  const clock = { now }, seller = await party(), buyer = await party(), third = await party();
  const make = (who, enabled) => {
    const ports = enabled ? fakePorts() : null, book = createOrderBook({ nowSeconds: () => clock.now, verifier: who.crypto });
    const ex = createTermsExchange({ provider, selfPublicKey: who.pub, ads: book, registry, hashTerms, now: () => clock.now, sha256: nodeSha256,
      ...(ports ? { peerAcceptance: { verifier: ports.verifier, replay: ports.replay } } : {}) });
    return { book, ex, ports };
  };
  const s = make(seller, sellerD1), b = make(buyer, buyerD1);
  const ad = await createAdEvent(seller.crypto, { app: 'p2p-offramp', v: 1, orderId: ORDER, revision: 1, networkId: 'eip155:31337', assetId: 'native',
    amountMin: '1000000000000000000', amountMax: '2000000000000000000', currency: 'USD', railClass: 'bank-transfer', expiresAtSeconds: String(now + 1800), maker: seller.pub }, now);
  assert.equal(s.book.ingest(ad), 'accepted'); assert.equal(b.book.ingest(ad), 'accepted');
  return { clock, seller: { ...seller, ...s }, buyer: { ...buyer, ...b }, third, key: adBookKey(seller.pub, ORDER), address: adAddress(seller.pub, ORDER) };
}
const wire = (statement, signatures = {}) => ({ binding: { ...statement.binding }, termsSignature: signatures.terms ?? SIG, bindingSignature: signatures.binding ?? SIG });
async function toTaken(w) {
  const take = ok(await w.buyer.ex.take(w.key, set.terms.buyer, w.buyer.secret));
  ok(await w.seller.ex.receive(take.recipientWrap, w.seller.secret));
  return take.sessionId;
}
async function toOffered(w, { selected = false } = {}) {
  const id = await toTaken(w), bytes = termsBytes();
  if (selected) ok(w.seller.ex.select(id));
  const statement = ok(await w.seller.ex.acceptanceStatement(id, bytes, String(NOW + 5000)));
  const offer = ok(await w.seller.ex.offerWithAcceptance(id, bytes, wire(statement), w.seller.secret));
  const got = ok(await w.buyer.ex.receive(offer.recipientWrap, w.buyer.secret));
  return { id, offer, got, statement };
}
async function toAccepted(w, options) {
  const offered = await toOffered(w, options), bytes = termsBytes();
  const statement = ok(await w.buyer.ex.acceptanceStatement(offered.id, bytes, String(NOW + 5000)));
  const accept = ok(await w.buyer.ex.acceptWithAcceptance(offered.id, bytes, wire(statement), w.buyer.secret));
  const done = ok(await w.seller.ex.receive(accept.recipientWrap, w.seller.secret));
  return { ...offered, accept, done, buyerStatement: statement };
}
/** Hand-build a gift wrap of arbitrary content from any key. */
async function craft(from, to, content, tags) {
  const rumor = createUnsignedEvent(from.pub, { kind: 14, created_at: NOW, tags, content });
  return createGiftWrap(await createSeal(rumor, from.secret, to.pub, provider, NOW), to.pub, provider, NOW);
}
const v2Envelope = (w, from, to, type, termsHash, body, over = {}) => ({ v: 2, type, ad: w.address, orderId: ORDER, sender: from.pub, recipient: to.pub,
  nonce: 'ab'.repeat(32), expiresAtSeconds: String(NOW + 600), termsHash, body, ...over });

test('without ports: v2 is MALFORMED, v1 is byte-identical, and {revision} never yields "accepted by peer"', async () => {
  const w = await world({ d1: false }), id = await toTaken(w);
  const offer = ok(await w.seller.ex.offer(id, termsBytes(), w.seller.secret));
  const got = ok(await w.buyer.ex.receive(offer.recipientWrap, w.buyer.secret));
  assert.ok(!('acceptance' in got)); assert.ok(!('acceptance' in w.buyer.ex.session(id)));
  const accept = ok(await w.buyer.ex.accept(id, termsBytes(), w.buyer.secret));
  const done = ok(await w.seller.ex.receive(accept.recipientWrap, w.seller.secret));
  assert.equal(done.state, 'accepted'); assert.ok(!('acceptance' in done));
  assert.deepEqual(Object.keys(w.seller.ex.session(id)).sort(), ['ad', 'adExpiresAtSeconds', 'buyer', 'buyerAddress', 'id', 'orderId', 'role', 'selected', 'seller', 'state', 'terms']);
  for (const ex of [w.seller.ex, w.buyer.ex]) fail(await ex.acceptanceStatus(id, 'display'), 'ACCEPTANCE_DISABLED');
  fail(await w.seller.ex.offerWithAcceptance(id, termsBytes(), {}, w.seller.secret), 'ACCEPTANCE_DISABLED');
  fail(await w.seller.ex.acceptanceStatement(id, termsBytes(), String(NOW + 10)), 'ACCEPTANCE_DISABLED');
  // A v1-only peer refuses a v2 offer outright.
  const v = await world({ sellerD1: true, buyerD1: false }), vid = await toTaken(v), bytes = termsBytes();
  const statement = ok(await v.seller.ex.acceptanceStatement(vid, bytes, String(NOW + 5000)));
  const v2 = ok(await v.seller.ex.offerWithAcceptance(vid, bytes, wire(statement), v.seller.secret));
  fail(await v.buyer.ex.receive(v2.recipientWrap, v.buyer.secret), 'MALFORMED');
  assert.equal(v.buyer.ex.session(vid).state, 'taken');
  // The v1 encoder output for an accept is unchanged: exactly {revision}.
  const text = encodeEnvelope({ v: 1, type: 'terms-accept', ad: w.address, orderId: ORDER, sender: w.buyer.pub, recipient: w.seller.pub, nonce: 'ab'.repeat(32),
    expiresAtSeconds: '1', termsHash: 'cd'.repeat(32), body: { revision: '1' } });
  assert.equal(text, `{"v":1,"type":"terms-accept","ad":"${w.address}","orderId":"${ORDER}","sender":"${w.buyer.pub}","recipient":"${w.seller.pub}","nonce":"${'ab'.repeat(32)}","expiresAtSeconds":"1","termsHash":"${'cd'.repeat(32)}","body":{"revision":"1"}}`);
});
test('D1 flow: both statements are verified with session-derived context, admitted, and rechecked before accept and funding', async () => {
  const w = await world(), r = await toAccepted(w);
  // The seller's own statement was verified (envelope deadline included) and admitted before the offer was returned.
  const sellerCalls = w.seller.ports.calls;
  // Cheap local check first (tombstone), then the chain-reading verification, then durable admission.
  assert.deepEqual(sellerCalls.slice(0, 3).map(c => c.port), ['status', 'verify', 'admit']);
  const own = sellerCalls[1].request;
  assert.deepEqual([own.role, own.signerMessagingKey, own.counterpartyMessagingKey], ['seller', w.seller.pub, w.buyer.pub]);
  assert.equal(typeof own.envelopeExpiresAtSeconds, 'number');
  assert.deepEqual({ ...sellerCalls[2].scope }, { ad: w.address, peer: w.buyer.pub, acceptBeforeSeconds: set.terms.acceptBeforeSeconds, nowSeconds: NOW,
    closesAtSeconds: NOW + 1800, priority: false }, 'an unselected seller-side session has no priority capacity');
  // Buyer: verify(seller, authenticated sender key) -> admit -> (accept) status, recheck seller, verify(own), admit.
  assert.deepEqual(w.buyer.ports.calls.map(c => c.port), ['status', 'verify', 'admit', 'status', 'verify', 'verify', 'admit']);
  const arrival = w.buyer.ports.calls[1].request, recheck = w.buyer.ports.calls[4].request;
  assert.equal(w.buyer.ports.calls[2].scope.priority, true, 'buyer-side sessions are priority');
  assert.deepEqual([arrival.role, arrival.signerMessagingKey, arrival.counterpartyMessagingKey], ['seller', w.seller.pub, w.buyer.pub]);
  assert.equal(arrival.envelopeExpiresAtSeconds, NOW + 900, 'authenticated envelope deadline (default TTL) on arrival');
  assert.equal(recheck.envelopeExpiresAtSeconds, null, 'a recheck of a stored statement has no envelope deadline');
  assert.equal(r.got.acceptance.label, `seller: signed by wallet ${set.terms.seller}`);
  assert.equal(r.done.acceptance.role, 'buyer'); assert.equal(r.done.state, 'accepted');
  assert.deepEqual({ ...w.seller.ex.session(r.id).acceptance }, { sellerRecorded: true, buyerRecorded: true, recheckRequired: true });
  for (const ex of [w.seller.ex, w.buyer.ex]) {
    const status = ok(await ex.acceptanceStatus(r.id, 'fund'));
    assert.equal(status.state, 'both-verified'); assert.equal(status.label, BOTH_VERIFIED_LABEL);
    assert.equal(status.freshness, 'local-history'); assert.equal(status.economicPreparationAllowed, false); assert.ok(Object.isFrozen(status));
  }
  // Views and results never carry signature bytes.
  const shown = JSON.stringify([w.seller.ex.session(r.id), w.buyer.ex.session(r.id), r.got, r.done, ok(await w.buyer.ex.acceptanceStatus(r.id, 'display'))]);
  assert.doesNotMatch(shown, /abababab/); assert.doesNotMatch(shown, /Signature/);
  // Contract wallets are labelled as point-in-time unfinalized reads.
  w.seller.ports.scheme = 'erc1271';
  assert.equal(ok(await w.seller.ex.acceptanceStatus(r.id, 'display')).seller.label, 'seller: accepted by contract wallet at block 16 (unfinalized)');
});
test('no downgrade in D1 mode: v1 offers/accepts are refused both ways and v2 without its binding or a signature is MALFORMED', async () => {
  const w = await world(), id = await toTaken(w);
  fail(await w.seller.ex.offer(id, termsBytes(), w.seller.secret), 'ACCEPTANCE_REQUIRED');
  const hash = hashTerms(ok(await w.seller.ex.acceptanceStatement(id, termsBytes(), String(NOW + 5000))).reviewed);
  const v1 = env => craft(w.seller, w.buyer, encodeEnvelope(env), envelopeTags(env));
  const offerV1 = { v: 1, type: 'terms-offer', ad: w.address, orderId: ORDER, sender: w.seller.pub, recipient: w.buyer.pub, nonce: 'ab'.repeat(32),
    expiresAtSeconds: String(NOW + 600), termsHash: hash, body: { terms: new TextDecoder().decode(termsBytes()) } };
  fail(await w.buyer.ex.receive(await v1(offerV1), w.buyer.secret), 'DOWNGRADE');
  const statement = ok(await w.seller.ex.acceptanceStatement(id, termsBytes(), String(NOW + 5000)));
  const good = wire(statement), terms = new TextDecoder().decode(termsBytes());
  for (const body of [{ terms }, { terms, acceptance: { binding: good.binding, termsSignature: SIG } }, { terms, acceptance: { termsSignature: SIG, bindingSignature: SIG } },
    { terms, acceptance: { ...good, scheme: 'eoa' } }, { terms, acceptance: good, authority: true }]) {
    const envelope = v2Envelope(w, w.seller, w.buyer, 'terms-offer', hash, body);
    fail(await w.buyer.ex.receive(await craft(w.seller, w.buyer, JSON.stringify(envelope), envelopeTags(envelope)), w.buyer.secret), 'MALFORMED');
  }
  assert.equal(w.buyer.ports.calls.length, 0, 'nothing reached the ports');
  const v = await world(), r = await toOffered(v);
  fail(await v.buyer.ex.accept(r.id, termsBytes(), v.buyer.secret), 'ACCEPTANCE_REQUIRED');
  const acceptV1 = { v: 1, type: 'terms-accept', ad: v.address, orderId: ORDER, sender: v.buyer.pub, recipient: v.seller.pub, nonce: 'cd'.repeat(32),
    expiresAtSeconds: String(NOW + 600), termsHash: r.statement.termsHash, body: { revision: '1' } };
  const before = v.seller.ports.calls.length;
  fail(await v.seller.ex.receive(await craft(v.buyer, v.seller, encodeEnvelope(acceptV1), envelopeTags(acceptV1)), v.seller.secret), 'DOWNGRADE');
  assert.equal(v.seller.ex.session(r.id).state, 'offered'); assert.equal(v.seller.ports.calls.length, before);
});
test('admission only after authentication: forged, misaddressed, wrong-role or unknown-session messages never reach the ports', async () => {
  const w = await world(), id = await toTaken(w), statement = ok(await w.seller.ex.acceptanceStatement(id, termsBytes(), String(NOW + 5000)));
  const terms = new TextDecoder().decode(termsBytes()), body = { terms, acceptance: wire(statement) };
  const forged = v2Envelope(w, w.seller, w.buyer, 'terms-offer', statement.termsHash, body);
  // Sealed by a third key while claiming to be the seller.
  fail(await w.buyer.ex.receive(await craft(w.third, w.buyer, JSON.stringify(forged), envelopeTags(forged)), w.buyer.secret), 'MALFORMED');
  // Addressed to someone else.
  const elsewhere = v2Envelope(w, w.seller, w.third, 'terms-offer', statement.termsHash, { terms, acceptance: { ...wire(statement), binding: { ...statement.binding, counterpartyMessagingKey: w.third.pub } } });
  fail(await w.buyer.ex.receive(await craft(w.seller, w.buyer, JSON.stringify(elsewhere), envelopeTags(elsewhere)), w.buyer.secret), 'NOT_ADDRESSED');
  // Wrong tags.
  fail(await w.buyer.ex.receive(await craft(w.seller, w.buyer, JSON.stringify(forged), [['p', w.buyer.pub]]), w.buyer.secret), 'MALFORMED');
  // A buyer-role statement inside an offer, or an offer from the buyer.
  const wrongRole = v2Envelope(w, w.buyer, w.seller, 'terms-offer', statement.termsHash, body);
  fail(await w.seller.ex.receive(await craft(w.buyer, w.seller, JSON.stringify(wrongRole), envelopeTags(wrongRole)), w.seller.secret), 'MALFORMED');
  assert.equal(w.buyer.ports.calls.length + w.seller.ports.calls.length, 0);
  // Authenticated, well-formed, but the binding names another account than the reviewed terms: refused before the port.
  const otherAccount = v2Envelope(w, w.seller, w.buyer, 'terms-offer', statement.termsHash, { terms, acceptance: { ...wire(statement), binding: { ...statement.binding, account: set.terms.buyer } } });
  const refused = fail(await w.buyer.ex.receive(await craft(w.seller, w.buyer, JSON.stringify(otherAccount), envelopeTags(otherAccount)), w.buyer.secret), 'ACCEPTANCE_REFUSED');
  assert.equal(refused.acceptance, 'UNAUTHORIZED'); assert.equal(w.buyer.ports.calls.length, 0);
});
test('verifier and replay refusals keep the session unchanged and map to fixed codes', async () => {
  const cases = [[{ ok: false, code: 'UNSUPPORTED', reason: 'eip7702-delegated' }, 'UNSUPPORTED_ACCOUNT'], [{ ok: false, code: 'UNAUTHORIZED' }, 'ACCEPTANCE_REFUSED'],
    [{ ok: false, code: 'WRONG_CHAIN' }, 'ACCEPTANCE_REFUSED'], [{ ok: false, code: 'TIMEOUT' }, 'ACCEPTANCE_UNAVAILABLE'], [{ ok: false, code: 'EXPIRED' }, 'EXPIRED'],
    [{ ok: false, code: 'UNSUPPORTED', reason: 'Private provider text!' }, 'UNSUPPORTED_ACCOUNT'], [{ weird: true }, 'ACCEPTANCE_UNAVAILABLE'],
    [request => ({ ok: true, value: { scheme: 'eoa', binding: { ...request.acceptance.binding, role: 'buyer' }, termsHash: request.termsHash, effectiveNotAfterSeconds: '1699995000', economicPreparationAllowed: false } }), 'ACCEPTANCE_UNAVAILABLE'],
    [() => { throw Error('PRIVATE'); }, 'ACCEPTANCE_UNAVAILABLE']];
  for (const [refuse, code] of cases) {
    const w = await world(), id = await toTaken(w), statement = ok(await w.seller.ex.acceptanceStatement(id, termsBytes(), String(NOW + 5000)));
    w.seller.ports.refuse = refuse;
    const result = fail(await w.seller.ex.offerWithAcceptance(id, termsBytes(), wire(statement), w.seller.secret), code);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE|Private/);
    if (code === 'UNSUPPORTED_ACCOUNT' && refuse.reason === 'eip7702-delegated') assert.equal(result.reason, 'eip7702-delegated');
    assert.equal(w.seller.ex.session(id).state, 'taken'); assert.ok(!w.seller.ports.calls.some(c => c.port === 'admit'));
  }
  for (const [replayRefuse, code] of [[{ ok: false, code: 'TOMBSTONED' }, 'TOMBSTONED'], [{ ok: false, code: 'CONFLICT' }, 'ACCEPTANCE_CONFLICT'],
    [{ ok: false, code: 'LIMIT_EXCEEDED' }, 'LIMIT_EXCEEDED'], [{ ok: false, code: 'LOCKED' }, 'ACCEPTANCE_UNAVAILABLE']]) {
    const w = await world(), id = await toTaken(w), statement = ok(await w.seller.ex.acceptanceStatement(id, termsBytes(), String(NOW + 5000)));
    const offer = ok(await w.seller.ex.offerWithAcceptance(id, termsBytes(), wire(statement), w.seller.secret));
    w.buyer.ports.replayRefuse = replayRefuse;
    fail(await w.buyer.ex.receive(offer.recipientWrap, w.buyer.secret), code);
    assert.equal(w.buyer.ex.session(id).state, 'taken'); assert.equal(w.buyer.ex.session(id).terms, null);
    w.buyer.ports.replayRefuse = null; // the same wrap is processed once the store recovers (its rumor id was not remembered)
    assert.equal(ok(await w.buyer.ex.receive(offer.recipientWrap, w.buyer.secret)).state, 'offered');
  }
});
test('cancel and reject durably tombstone the termsHash before the state changes, on both sides', async () => {
  // Seller cancels an offer: its own ledger first, then the buyer's on authenticated receipt.
  const w = await world(), r = await toOffered(w);
  const cancel = ok(await w.seller.ex.cancel(r.id, 'withdrawn', w.seller.secret));
  assert.ok(w.seller.ports.tombstones.has(r.statement.termsHash));
  const tomb = w.seller.ports.calls.find(c => c.port === 'tombstone');
  assert.deepEqual({ ...tomb.scope }, { ad: w.address, peer: w.buyer.pub, acceptBeforeSeconds: set.terms.acceptBeforeSeconds, nowSeconds: NOW,
    closesAtSeconds: NOW + 1800, priority: false });
  assert.equal(ok(await w.buyer.ex.receive(cancel.recipientWrap, w.buyer.secret)).state, 'cancelled');
  assert.ok(w.buyer.ports.tombstones.has(r.statement.termsHash));
  assert.equal(ok(await w.buyer.ex.acceptanceStatus(r.id, 'display')).state, 'withdrawn');
  fail(await w.buyer.ex.acceptanceStatus(r.id, 'accept'), 'TOMBSTONED');
  // Buyer rejects: both ledgers tombstone.
  const v = await world(), q = await toOffered(v);
  const reject = ok(await v.buyer.ex.reject(q.id, 'declined', v.buyer.secret));
  assert.ok(v.buyer.ports.tombstones.has(q.statement.termsHash));
  ok(await v.seller.ex.receive(reject.recipientWrap, v.seller.secret)); assert.ok(v.seller.ports.tombstones.has(q.statement.termsHash));
  // A failed durable tombstone refuses the cancel and leaves the session offered; it can be retried.
  const x = await world(), p = await toOffered(x); x.seller.ports.tombstoneRefuse = { ok: false, code: 'UNAVAILABLE' };
  fail(await x.seller.ex.cancel(p.id, 'withdrawn', x.seller.secret), 'ACCEPTANCE_UNAVAILABLE');
  assert.equal(x.seller.ex.session(p.id).state, 'offered');
  x.seller.ports.tombstoneRefuse = null; assert.equal(ok(await x.seller.ex.cancel(p.id, 'withdrawn', x.seller.secret)).state, 'cancelled');
  // A cancel before any terms has nothing to tombstone.
  const y = await world(), tid = await toTaken(y); ok(await y.buyer.ex.cancel(tid, 'withdrawn', y.buyer.secret));
  assert.equal(y.buyer.ports.calls.length, 0);
});
test('cancellation races: a cancel and an acceptance in flight together never leave a valid-looking acceptance', async () => {
  // Order 1: the seller's tombstone lands first; the buyer's accept is then refused by the seller's ledger.
  {
    const w = await world(), r = await toOffered(w);
    const statement = ok(await w.buyer.ex.acceptanceStatement(r.id, termsBytes(), String(NOW + 5000)));
    const accept = ok(await w.buyer.ex.acceptWithAcceptance(r.id, termsBytes(), wire(statement), w.buyer.secret));
    ok(await w.seller.ex.cancel(r.id, 'withdrawn', w.seller.secret));
    fail(await w.seller.ex.receive(accept.recipientWrap, w.seller.secret), 'OUT_OF_ORDER');
    assert.equal(ok(await w.seller.ex.acceptanceStatus(r.id, 'display')).label, null);
  }
  // Order 2: the seller cancels while the buyer's accept is being verified; the tombstone holds the outcome.
  {
    const w = await world(), r = await toOffered(w);
    const statement = ok(await w.buyer.ex.acceptanceStatement(r.id, termsBytes(), String(NOW + 5000)));
    const accept = ok(await w.buyer.ex.acceptWithAcceptance(r.id, termsBytes(), wire(statement), w.buyer.secret));
    const held = deferred(); w.seller.ports.hold = held;
    const receiving = w.seller.ex.receive(accept.recipientWrap, w.seller.secret);
    while (!w.seller.ports.calls.some(c => c.port === 'verify' && c.request.role === 'buyer')) await new Promise(r2 => setImmediate(r2));
    w.seller.ports.hold = null;
    const cancelled = await w.seller.ex.cancel(r.id, 'withdrawn', w.seller.secret);
    held.resolve();
    const received = await receiving;
    assert.equal(cancelled.ok, true); assert.equal(received.ok, false); assert.ok(['TOMBSTONED', 'OUT_OF_ORDER'].includes(received.code));
    assert.equal(w.seller.ex.session(r.id).state, 'cancelled');
    fail(await w.seller.ex.acceptanceStatus(r.id, 'fund'), 'TOMBSTONED');
  }
  // Order 3 (review NIT): the buyer's acceptance is being verified when the seller's cancel starts, and its tombstone
  // is still being written when the verification finishes. The cancel wins: the acceptance is refused, never labelled.
  {
    const w = await world(), r = await toOffered(w);
    const statement = ok(await w.buyer.ex.acceptanceStatement(r.id, termsBytes(), String(NOW + 5000)));
    const accept = ok(await w.buyer.ex.acceptWithAcceptance(r.id, termsBytes(), wire(statement), w.buyer.secret));
    const verifyHeld = deferred(), tombHeld = deferred(); w.seller.ports.hold = verifyHeld;
    const receiving = w.seller.ex.receive(accept.recipientWrap, w.seller.secret);
    while (!w.seller.ports.calls.some(c => c.port === 'verify' && c.request.role === 'buyer')) await new Promise(r2 => setImmediate(r2));
    w.seller.ports.hold = null; w.seller.ports.tombstoneHold = tombHeld;
    const cancelling = w.seller.ex.cancel(r.id, 'withdrawn', w.seller.secret);
    while (!w.seller.ports.calls.some(c => c.port === 'tombstone')) await new Promise(r2 => setImmediate(r2));
    verifyHeld.resolve();
    const received = await receiving;
    fail(received, 'TOMBSTONED'); assert.ok(!('value' in received) && !JSON.stringify(received).includes('signed by'));
    tombHeld.resolve(); assert.equal(ok(await cancelling).state, 'cancelled');
    const display = ok(await w.seller.ex.acceptanceStatus(r.id, 'display'));
    assert.equal(display.state, 'withdrawn'); assert.equal(display.label, null);
    fail(await w.seller.ex.acceptanceStatus(r.id, 'fund'), 'TOMBSTONED');
  }
});
test('review LOW: copies of one wrap or a second statement in a session cannot occupy the verifier; other sessions proceed', async () => {
  const w = await world(), r = await toOffered(w);
  // A second buyer session on the same advert, with its own offer.
  const other = await party(), book = createOrderBook({ nowSeconds: () => w.clock.now, verifier: other.crypto }), ports = fakePorts();
  const otherEx = createTermsExchange({ provider, selfPublicKey: other.pub, ads: book, registry, hashTerms, now: () => w.clock.now, sha256: nodeSha256,
    peerAcceptance: { verifier: ports.verifier, replay: ports.replay } });
  const other2Terms = termsBytes({ ...set.terms, sellerNonce: 'cd'.repeat(32) }); // distinct termsHash
  const adEvent = await createAdEvent(w.seller.crypto, { app: 'p2p-offramp', v: 1, orderId: ORDER, revision: 1, networkId: 'eip155:31337', assetId: 'native',
    amountMin: '1000000000000000000', amountMax: '2000000000000000000', currency: 'USD', railClass: 'bank-transfer', expiresAtSeconds: String(NOW + 1800), maker: w.seller.pub }, NOW);
  assert.equal(book.ingest(adEvent), 'accepted');
  const take2 = ok(await otherEx.take(w.key, set.terms.buyer, other.secret)); ok(await w.seller.ex.receive(take2.recipientWrap, w.seller.secret));
  const st2 = ok(await w.seller.ex.acceptanceStatement(take2.sessionId, other2Terms, String(NOW + 5000)));
  ok(await otherEx.receive(ok(await w.seller.ex.offerWithAcceptance(take2.sessionId, other2Terms, wire(st2), w.seller.secret)).recipientWrap, other.secret));
  const bst2 = ok(await otherEx.acceptanceStatement(take2.sessionId, other2Terms, String(NOW + 5000)));
  const honest = ok(await otherEx.acceptWithAcceptance(take2.sessionId, other2Terms, wire(bst2), other.secret));
  // The verifier has four slots, like the real one's old global bound.
  let running = 0; const verify = w.seller.ports.verifier.verify, held = deferred();
  w.seller.ports.verifier.verify = async request => {
    if (running >= 4) return { ok: false, code: 'LIMIT_EXCEEDED' };
    running++; try { if (request.signerMessagingKey === w.buyer.pub) await held.promise; return await verify(request); } finally { running--; }
  };
  const statement = ok(await w.buyer.ex.acceptanceStatement(r.id, termsBytes(), String(NOW + 5000)));
  const accept = ok(await w.buyer.ex.acceptWithAcceptance(r.id, termsBytes(), wire(statement), w.buyer.secret));
  const copies = Array.from({ length: 6 }, () => w.seller.ex.receive(accept.recipientWrap, w.seller.secret));
  while (running === 0) await new Promise(r2 => setImmediate(r2));
  // A different rumor for the same session while one verification runs is BUSY (not remembered, retryable).
  const second = v2Envelope(w, w.buyer, w.seller, 'terms-accept', statement.termsHash, { revision: '1', acceptance: wire(statement) }, { nonce: 'ee'.repeat(32) });
  fail(await w.seller.ex.receive(await craft(w.buyer, w.seller, JSON.stringify(second), envelopeTags(second)), w.seller.secret), 'BUSY');
  assert.equal(running, 1, 'one verification for the session, whatever the number of copies');
  assert.equal(ok(await w.seller.ex.receive(honest.recipientWrap, w.seller.secret)).state, 'accepted', 'another session is not starved');
  held.resolve();
  const results = await Promise.all(copies);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.ok(results.filter(result => !result.ok).every(result => result.code === 'DUPLICATE'));
  otherEx.close();
});
test('review LOW: acceptanceStatus re-reads the session and tombstone after its slow re-verification', async () => {
  const w = await world(), r = await toOffered(w), held = deferred();
  w.buyer.ports.hold = held;
  const checking = w.buyer.ex.acceptanceStatus(r.id, 'display');
  while (!w.buyer.ports.calls.some(c => c.port === 'verify' && c.request.envelopeExpiresAtSeconds === null)) await new Promise(r2 => setImmediate(r2));
  fail(await w.buyer.ex.acceptanceStatus(r.id, 'display'), 'BUSY');
  // The seller cancels while the buyer's display check is still verifying; the buyer processes it at once.
  const cancel = ok(await w.seller.ex.cancel(r.id, 'withdrawn', w.seller.secret));
  w.buyer.ports.hold = null;
  assert.equal(ok(await w.buyer.ex.receive(cancel.recipientWrap, w.buyer.secret)).state, 'cancelled');
  held.resolve();
  const status = ok(await checking);
  assert.equal(status.state, 'withdrawn'); assert.equal(status.label, null); assert.equal(status.seller, null);
  // Same for a tombstone written elsewhere (another tab) during the check.
  const v = await world(), q = await toOffered(v), again = deferred();
  v.buyer.ports.hold = again;
  const pending = v.buyer.ex.acceptanceStatus(q.id, 'accept');
  while (!v.buyer.ports.calls.some(c => c.port === 'verify' && c.request.envelopeExpiresAtSeconds === null)) await new Promise(r2 => setImmediate(r2));
  v.buyer.ports.tombstones.add(q.statement.termsHash); v.buyer.ports.hold = null; again.resolve();
  fail(await pending, 'TOMBSTONED');
});
test('rechecks: expiry, a changed peer policy and the funding margin refuse new acceptance or funding but never rewrite history', async () => {
  const w = await world(), r = await toOffered(w);
  w.buyer.ports.refuse = { ok: false, code: 'UNAUTHORIZED' }; // e.g. the seller's contract wallet revoked its approval
  fail(await w.buyer.ex.acceptWithAcceptance(r.id, termsBytes(), wire(ok(await w.buyer.ex.acceptanceStatement(r.id, termsBytes(), String(NOW + 5000)))), w.buyer.secret), 'ACCEPTANCE_REFUSED');
  const display = ok(await w.buyer.ex.acceptanceStatus(r.id, 'display'));
  assert.equal(display.state, 'invalid'); assert.equal(display.label, null); assert.equal(display.refusal, 'UNAUTHORIZED');
  assert.equal(w.buyer.ex.session(r.id).state, 'offered');
  w.buyer.ports.refuse = null;
  const v = await world(), q = await toAccepted(v);
  v.clock.now = NOW + 5000 - 120; // within the funding safety margin of the earliest deadline
  fail(await v.seller.ex.acceptanceStatus(q.id, 'fund'), 'EXPIRED');
  v.clock.now = NOW + 5000;
  const expired = ok(await v.seller.ex.acceptanceStatus(q.id, 'display'));
  assert.equal(expired.state, 'expired'); assert.equal(expired.label, null);
  assert.equal(v.seller.ex.session(q.id).state, 'accepted', 'expiry never changes the negotiated state');
});
test('acceptance horizon, statement checks and the explicit carrier byte budget', async () => {
  // acceptBefore more than seven days ahead is refused before signing or sending.
  const far = 1_700_000_000 - MAX_PEER_ACCEPT_HORIZON_SECONDS - 10, w = await world({ now: far }), id = await toTaken(w);
  const refused = fail(await w.seller.ex.acceptanceStatement(id, termsBytes(), String(far + 100)), 'LIMIT_EXCEEDED'); assert.equal(refused.reason, 'accept-horizon');
  const v = await world(), vid = await toTaken(v);
  fail(await v.seller.ex.acceptanceStatement(vid, termsBytes(), String(NOW)), 'EXPIRED');
  fail(await v.seller.ex.acceptanceStatement(vid, termsBytes(), '01'), 'INVALID_INPUT');
  const statement = ok(await v.seller.ex.acceptanceStatement(vid, termsBytes(), String(NOW + 5000)));
  assert.deepEqual({ ...statement.binding }, { v: 1, termsHash: statement.termsHash, role: 'seller', account: set.terms.seller,
    ownMessagingKey: v.seller.pub, counterpartyMessagingKey: v.buyer.pub, notAfterSeconds: String(NOW + 5000) });
  assert.ok(Object.isFrozen(statement.binding));
  for (const binding of [{ ...statement.binding, role: 'buyer' }, { ...statement.binding, account: set.terms.buyer }, { ...statement.binding, ownMessagingKey: v.buyer.pub, counterpartyMessagingKey: v.seller.pub }]) {
    fail(await v.seller.ex.offerWithAcceptance(vid, termsBytes(), { ...wire(statement), binding }, v.seller.secret), 'ACCEPTANCE_REFUSED');
  }
  for (const signature of ['0x' + 'AB'.repeat(65), '0xabc', '0x', 'ab'.repeat(65), '0x' + 'ab'.repeat(MAX_PEER_SIGNATURE_BYTES + 1)])
    fail(await v.seller.ex.offerWithAcceptance(vid, termsBytes(), wire(statement, { terms: signature }), v.seller.secret), 'INVALID_INPUT');
  assert.equal(v.seller.ports.calls.length, 0);
  // Explicit budget: 16,384 bytes of terms plus two maximal contract signatures exceed the unchanged 24,576-byte
  // envelope and are refused; the same envelope with EOA-sized signatures fits.
  const big = '0x' + 'ab'.repeat(MAX_PEER_SIGNATURE_BYTES);
  const oversized = v2Envelope(v, v.seller, v.buyer, 'terms-offer', statement.termsHash, { terms: 'a'.repeat(MAX_OFFER_TERMS_BYTES), acceptance: wire(statement, { terms: big, binding: big }) });
  assert.ok(utf8.encode(JSON.stringify(oversized)).byteLength > MAX_ENVELOPE_BYTES); assert.equal(parseEnvelopeV2(JSON.stringify(oversized)), null);
  assert.ok(parseEnvelopeV2(JSON.stringify({ ...oversized, body: { ...oversized.body, acceptance: wire(statement) } })));
  // A real reviewed offer (instructions are capped at 4 KiB) always fits with maximal contract signatures.
  v.seller.ports.scheme = 'erc1271';
  ok(await v.seller.ex.offerWithAcceptance(vid, termsBytes(), wire(statement, { terms: big, binding: big }), v.seller.secret));
  // An accept carrying two maximal contract signatures fits the budget.
  const a = await world(), ar = await toOffered(a), buyerStatement = ok(await a.buyer.ex.acceptanceStatement(ar.id, termsBytes(), String(NOW + 5000)));
  a.buyer.ports.scheme = 'erc1271';
  ok(await a.buyer.ex.acceptWithAcceptance(ar.id, termsBytes(), wire(buyerStatement, { terms: big, binding: big }), a.buyer.secret));
});
test('strict v2 parsing: exact keys, canonical lowercase hex, signature budget, role/key direction and deep freezing', async () => {
  const w = await world(), id = await toTaken(w), statement = ok(await w.seller.ex.acceptanceStatement(id, termsBytes(), String(NOW + 5000)));
  const terms = new TextDecoder().decode(termsBytes()), base = v2Envelope(w, w.seller, w.buyer, 'terms-offer', statement.termsHash, { terms, acceptance: wire(statement) });
  const parsed = parseEnvelopeV2(JSON.stringify(base));
  assert.deepEqual(parsed, base); assert.equal(encodeEnvelopeV2(parsed), JSON.stringify(base));
  for (const node of [parsed, parsed.body, parsed.body.acceptance, parsed.body.acceptance.binding]) assert.ok(Object.isFrozen(node));
  assert.equal(parseEnvelope(JSON.stringify(base)), null, 'the v1 parser refuses v2');
  const mutations = [e => { e.v = 1; }, e => { e.v = 3; }, e => { e.extra = 1; }, e => { e.body.acceptance.binding.v = 2; },
    e => { e.body.acceptance.binding.role = 'buyer'; }, e => { e.body.acceptance.binding.ownMessagingKey = w.buyer.pub; },
    e => { e.body.acceptance.binding.termsHash = 'ef'.repeat(32); }, e => { e.body.acceptance.binding.notAfterSeconds = '0'; },
    e => { e.body.acceptance.binding.notAfterSeconds = '18446744073709551616'; }, e => { e.body.acceptance.binding.account = '0x' + '00'.repeat(20); },
    e => { e.body.acceptance.binding.account = set.terms.seller.toUpperCase().replace('0X', '0x'); }, e => { e.body.acceptance.termsSignature = '0x' + 'ab'.repeat(MAX_PEER_SIGNATURE_BYTES + 1); },
    e => { e.body.acceptance.bindingSignature = '0xab0'; }, e => { e.type = 'terms-reject'; }, e => { e.ad = adAddress(w.buyer.pub, ORDER); },
    e => { e.body.terms = ''; }, e => { e.body.terms = 'a'.repeat(MAX_OFFER_TERMS_BYTES + 1); }];
  for (const mutate of mutations) { const e = structuredClone(base); mutate(e); assert.equal(parseEnvelopeV2(JSON.stringify(e)), null, mutate.toString()); }
  assert.equal(parseEnvelopeV2(JSON.stringify(base).replace('"v":2', '"v":2,"v":2')), null, 'duplicate keys');
  assert.equal(parsePeerAcceptanceWire(Object.create({ binding: statement.binding })), null);
  let touched = 0; const hostile = wire(statement); Object.defineProperty(hostile, 'termsSignature', { enumerable: true, get() { touched++; return SIG; } });
  assert.equal(parsePeerAcceptanceWire(hostile), null); assert.equal(touched, 0);
  const accept = v2Envelope(w, w.buyer, w.seller, 'terms-accept', statement.termsHash, { revision: '1', acceptance: { ...wire(statement), binding: { ...statement.binding, role: 'buyer', ownMessagingKey: w.buyer.pub, counterpartyMessagingKey: w.seller.pub, account: set.terms.buyer } } });
  assert.ok(parseEnvelopeV2(JSON.stringify(accept)));
  for (const revision of ['0', '01', 1, '18446744073709551616']) assert.equal(parseEnvelopeV2(JSON.stringify({ ...accept, body: { ...accept.body, revision } })), null);
});
test('the exchange package never imports a wallet module', async () => {
  const root = new URL('../', import.meta.url), files = ['index.ts', ...(await readdir(new URL('src/', root))).map(name => `src/${name}`)];
  for (const file of files) {
    const text = await readFile(new URL(file, root), 'utf8');
    for (const [, specifier] of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) assert.doesNotMatch(specifier, /wallet|chain-evm|escrow/, `${file} imports ${specifier}`);
  }
});

// A checkpoint is encrypted, previously admitted history, not a new acceptance or a renewed deadline.
function reopening(w, who, overrides = {}) {
  return createTermsExchange({ provider, selfPublicKey: who.pub, ads: { revalidate() { throw Error('history must not reopen an advert'); } },
    registry, hashTerms, now: () => w.clock.now, sha256: nodeSha256,
    peerAcceptance: { verifier: who.ports.verifier, replay: who.ports.replay }, ...overrides });
}
test('checkpoint: only complete accepted history is exported, with encrypted own and incoming wrappers', async () => {
  const w = await world(), id = await toTaken(w);
  fail(w.seller.ex.checkpoint(id), 'OUT_OF_ORDER');
  const bytes = termsBytes(), statement = ok(await w.seller.ex.acceptanceStatement(id, bytes, String(NOW + 5000)));
  const offer = ok(await w.seller.ex.offerWithAcceptance(id, bytes, wire(statement), w.seller.secret));
  ok(await w.buyer.ex.receive(offer.recipientWrap, w.buyer.secret));
  fail(w.seller.ex.checkpoint(id), 'OUT_OF_ORDER');
  const buyer = ok(await w.buyer.ex.acceptanceStatement(id, bytes, String(NOW + 5000)));
  const accept = ok(await w.buyer.ex.acceptWithAcceptance(id, bytes, wire(buyer), w.buyer.secret));
  ok(await w.seller.ex.receive(accept.recipientWrap, w.seller.secret));
  const seller = ok(w.seller.ex.checkpoint(id)), buyerCopy = ok(w.buyer.ex.checkpoint(id));
  assert.equal(seller.format, 'p2p-offramp/exchange-checkpoint/v1');
  assert.deepEqual(seller.history.map(item => item.type), ['terms-offer', 'terms-accept']);
  assert.deepEqual(seller.history.map(item => item.wrap.id), [offer.selfWrap.id, accept.recipientWrap.id]);
  assert.deepEqual(buyerCopy.history.map(item => item.wrap.id), [offer.recipientWrap.id, accept.selfWrap.id]);
  assert.equal(seller.session.id, id); assert.equal(seller.session.role, 'seller');
  assert.doesNotMatch(JSON.stringify(seller), /termsSignature|bindingSignature|abababab|paymentInstructions/);
  assert.ok(Object.isFrozen(seller) && Object.isFrozen(seller.session) && Object.isFrozen(seller.history));
  assert.ok(seller.history.every(item => Object.isFrozen(item) && Object.isFrozen(item.wrap)));
  fail(w.seller.ex.checkpoint('missing'), 'UNKNOWN_SESSION');
  const v1 = await world({ d1: false }); fail(v1.seller.ex.checkpoint('missing'), 'ACCEPTANCE_DISABLED');
});
test('checkpoint: both roles restore unchanged accepted history after envelope and advert expiry, seller first', async () => {
  const w = await world(), r = await toAccepted(w);
  for (const who of [w.seller, w.buyer]) {
    const checkpoint = ok(who.ex.checkpoint(r.id)); who.ex.close();
    w.clock.now = NOW + 1900;
    const ex = reopening(w, who), before = who.ports.calls.length;
    const restored = ok(await ex.restoreCheckpoint(checkpoint, who.secret));
    assert.equal(restored.id, r.id); assert.equal(restored.state, 'accepted');
    assert.equal(restored.terms.hash, r.statement.termsHash); assert.deepEqual(restored.terms.bytes, termsBytes());
    const checks = who.ports.calls.slice(before).filter(call => call.port === 'verify').map(call => call.request);
    assert.deepEqual(checks.map(request => request.role), ['seller', 'buyer']);
    assert.ok(checks.every(request => request.envelopeExpiresAtSeconds === null && request.nowSeconds === w.clock.now));
    assert.equal(ok(await ex.acceptanceStatus(r.id, 'fund')).state, 'both-verified');
    assert.equal(ok(await ex.restoreCheckpoint(checkpoint, who.secret)).id, r.id, 'repeat restoration is idempotent');
    assert.equal(ex.sessionCount, 1);
    assert.equal((await ex.receive(r.accept.selfWrap, who.secret)).ok, who === w.buyer, 'own history is decrypted explicitly by restoration');
    ex.close();
  }
});
test('checkpoint: unordered history restores deterministically; repeated or missing messages are refused', async () => {
  const w = await world(), r = await toAccepted(w), checkpoint = ok(w.seller.ex.checkpoint(r.id));
  const reordered = structuredClone(checkpoint); reordered.history.reverse();
  const ex = reopening(w, w.seller);
  assert.equal(ok(await ex.restoreCheckpoint(reordered, w.seller.secret)).state, 'accepted');
  for (const history of [[checkpoint.history[0]], [checkpoint.history[0], checkpoint.history[0]], [...checkpoint.history, checkpoint.history[0]]]) {
    const fresh = reopening(w, w.seller); fail(await fresh.restoreCheckpoint({ ...checkpoint, history }, w.seller.secret), 'INVALID_INPUT');
    assert.equal(fresh.sessionCount, 0); fresh.close();
  }
  ex.close();
});
test('checkpoint: restoration requires both durable bindings and never reconstructs acceptance from wire alone', async () => {
  const w = await world(), r = await toAccepted(w), checkpoint = ok(w.seller.ex.checkpoint(r.id));
  w.seller.ports.bindings.delete(`${r.statement.termsHash}:buyer`);
  const ex = reopening(w, w.seller), before = w.seller.ports.calls.filter(call => call.port === 'verify').length;
  fail(await ex.restoreCheckpoint(checkpoint, w.seller.secret), 'ACCEPTANCE_REQUIRED');
  assert.equal(w.seller.ports.calls.filter(call => call.port === 'verify').length, before);
  assert.equal(ex.sessionCount, 0); assert.equal(w.seller.ports.bindings.has(`${r.statement.termsHash}:buyer`), false);
  ex.close();
});
test('checkpoint: malformed context, chronology, wrappers, wrong identity and accessors fail without hydration', async () => {
  const w = await world(), r = await toAccepted(w), checkpoint = ok(w.seller.ex.checkpoint(r.id));
  const mutations = [
    copy => { copy.session.id += 'x'; }, copy => { copy.session.buyerAddress = set.terms.seller; },
    copy => { copy.history[0].admittedAtSeconds = NOW + 901; }, copy => { copy.history[0].admittedAtSeconds = NOW + 1; },
    copy => { copy.history[0].wrap.content = 'corrupt'; }, copy => { copy.history[1].wrap = r.accept.selfWrap; },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(checkpoint); mutate(copy); const ex = reopening(w, w.seller);
    assert.equal((await ex.restoreCheckpoint(copy, w.seller.secret)).ok, false, mutate.toString()); assert.equal(ex.sessionCount, 0); ex.close();
  }
  const ex = reopening(w, w.seller); fail(await ex.restoreCheckpoint(checkpoint, w.buyer.secret), 'WRONG_SIGNER');
  let touched = 0; const hostile = { ...checkpoint };
  Object.defineProperty(hostile, 'session', { enumerable: true, get() { touched++; return checkpoint.session; } });
  fail(await ex.restoreCheckpoint(hostile, w.seller.secret), 'INVALID_INPUT'); assert.equal(touched, 0); ex.close();
});
test('checkpoint: binding expiry and current verifier policy apply; the existing funding margin still refuses funding', async () => {
  const w = await world(), r = await toAccepted(w), checkpoint = ok(w.seller.ex.checkpoint(r.id));
  w.clock.now = NOW + 5000 - 120;
  let ex = reopening(w, w.seller); ok(await ex.restoreCheckpoint(checkpoint, w.seller.secret));
  fail(await ex.acceptanceStatus(r.id, 'fund'), 'EXPIRED'); ex.close();
  w.clock.now = NOW + 5000; ex = reopening(w, w.seller);
  fail(await ex.restoreCheckpoint(checkpoint, w.seller.secret), 'EXPIRED'); assert.equal(ex.sessionCount, 0); ex.close();
  w.clock.now = NOW; w.seller.ports.refuse = { ok: false, code: 'WRONG_CHAIN' }; ex = reopening(w, w.seller);
  fail(await ex.restoreCheckpoint(checkpoint, w.seller.secret), 'ACCEPTANCE_REFUSED'); assert.equal(ex.sessionCount, 0); ex.close();
});
test('checkpoint: conflicting existing sessions are preserved and restored history reserves bounded session capacity', async () => {
  const w = await world(), r = await toAccepted(w), checkpoint = ok(w.seller.ex.checkpoint(r.id));
  const ex = createTermsExchange({ provider, selfPublicKey: w.seller.pub, ads: w.seller.book, registry, hashTerms,
    now: () => w.clock.now, sha256: nodeSha256, peerAcceptance: { verifier: w.seller.ports.verifier, replay: w.seller.ports.replay } });
  const buyer = createTermsExchange({ provider, selfPublicKey: w.buyer.pub, ads: w.buyer.book, registry, hashTerms,
    now: () => w.clock.now, sha256: nodeSha256, peerAcceptance: { verifier: w.buyer.ports.verifier, replay: w.buyer.ports.replay } });
  const take = ok(await buyer.take(w.key, set.terms.seller, w.buyer.secret)); ok(await ex.receive(take.recipientWrap, w.seller.secret));
  fail(await ex.restoreCheckpoint(checkpoint, w.seller.secret), 'OUT_OF_ORDER'); assert.equal(ex.session(r.id).state, 'taken');
  ex.close(); buyer.close();
  const full = reopening(w, w.seller, { ads: w.seller.book, maxSessions: 1, maxSessionsPerAd: 1 });
  const other = createTermsExchange({ provider, selfPublicKey: w.third.pub, ads: w.buyer.book, registry, hashTerms, now: () => w.clock.now, sha256: nodeSha256 });
  const otherTake = ok(await other.take(w.key, set.terms.buyer, w.third.secret)); ok(await full.receive(otherTake.recipientWrap, w.seller.secret));
  fail(await full.restoreCheckpoint(checkpoint, w.seller.secret), 'LIMIT_EXCEEDED');
  assert.equal(full.sessionCount, 1); assert.equal(full.session(otherTake.sessionId).state, 'taken'); full.close(); other.close();
});
test('checkpoint: one restoration per session; close, abort and a racing tombstone cannot install an acceptance', async () => {
  for (const action of ['abort', 'close', 'tombstone']) {
    const w = await world(), r = await toAccepted(w), checkpoint = ok(w.seller.ex.checkpoint(r.id));
    const ex = reopening(w, w.seller), gate = deferred(), controller = new AbortController(); w.seller.ports.hold = gate;
    const before = w.seller.ports.calls.length, restoring = ex.restoreCheckpoint(checkpoint, w.seller.secret, controller.signal);
    while (!w.seller.ports.calls.slice(before).some(call => call.port === 'verify')) await new Promise(resolve => setTimeout(resolve, 0));
    fail(await ex.restoreCheckpoint(checkpoint, w.seller.secret), 'BUSY');
    if (action === 'abort') controller.abort();
    if (action === 'close') ex.close();
    if (action === 'tombstone') w.seller.ports.tombstones.add(r.statement.termsHash);
    gate.resolve(); assert.equal((await restoring).ok, false, action); assert.equal(ex.sessionCount, 0); ex.close();
  }
});
test('checkpoint: a re-signed changed binding or revision cannot renew previously admitted terms', async () => {
  const w = await world(), r = await toAccepted(w), checkpoint = ok(w.seller.ex.checkpoint(r.id));
  const changed = structuredClone(checkpoint), acceptance = wire(r.statement);
  acceptance.binding.notAfterSeconds = String(NOW + 5001);
  const envelope = v2Envelope(w, w.seller, w.buyer, 'terms-offer', r.statement.termsHash, { terms: new TextDecoder().decode(termsBytes()), acceptance });
  changed.history[0].wrap = await craft(w.seller, w.seller, encodeEnvelopeV2(envelope), envelopeTags(envelope));
  let ex = reopening(w, w.seller); fail(await ex.restoreCheckpoint(changed, w.seller.secret), 'ACCEPTANCE_CONFLICT');
  assert.equal(ex.sessionCount, 0); ex.close();
  const badRevision = structuredClone(checkpoint), accept = v2Envelope(w, w.buyer, w.seller, 'terms-accept', r.statement.termsHash,
    { revision: '2', acceptance: wire(r.buyerStatement) });
  badRevision.history[1].wrap = await craft(w.buyer, w.seller, encodeEnvelopeV2(accept), envelopeTags(accept));
  ex = reopening(w, w.seller); fail(await ex.restoreCheckpoint(badRevision, w.seller.secret), 'REVISION_MISMATCH');
  assert.equal(ex.sessionCount, 0); ex.close();
});
test('checkpoint: legacy replay ports without complete-history flags cannot restore', async () => {
  const w = await world(), r = await toAccepted(w), checkpoint = ok(w.seller.ex.checkpoint(r.id));
  const ex = reopening(w, w.seller, { peerAcceptance: { verifier: w.seller.ports.verifier,
    replay: { ...w.seller.ports.replay, async status() { return { ok: true, value: { tombstoned: false } }; } } } });
  fail(await ex.restoreCheckpoint(checkpoint, w.seller.secret), 'ACCEPTANCE_REQUIRED');
  assert.equal(ex.sessionCount, 0); ex.close();
});
test('checkpoint: an ordinary peer session admitted during restoration is not replaced', async () => {
  const w = await world(), r = await toAccepted(w), checkpoint = ok(w.seller.ex.checkpoint(r.id));
  const ex = reopening(w, w.seller, { ads: w.seller.book }), gate = deferred(); w.seller.ports.hold = gate;
  const before = w.seller.ports.calls.length, restoring = ex.restoreCheckpoint(checkpoint, w.seller.secret);
  while (!w.seller.ports.calls.slice(before).some(call => call.port === 'verify')) await new Promise(resolve => setTimeout(resolve, 0));
  const buyer = createTermsExchange({ provider, selfPublicKey: w.buyer.pub, ads: w.buyer.book, registry, hashTerms, now: () => w.clock.now, sha256: nodeSha256 });
  const take = ok(await buyer.take(w.key, set.terms.buyer, w.buyer.secret)); ok(await ex.receive(take.recipientWrap, w.seller.secret));
  gate.resolve(); fail(await restoring, 'OUT_OF_ORDER'); assert.equal(ex.session(r.id).state, 'taken');
  ex.close(); buyer.close();
});
test('checkpoint: compatible take redelivery restores complete proof without selecting the placeholder', async () => {
  const w = await world(), r = await toAccepted(w, { selected: true }), checkpoint = ok(w.seller.ex.checkpoint(r.id));
  const ex = reopening(w, w.seller, { ads: w.seller.book });
  const buyer = createTermsExchange({ provider, selfPublicKey: w.buyer.pub, ads: w.buyer.book, registry, hashTerms, now: () => w.clock.now, sha256: nodeSha256 });
  const take = ok(await buyer.take(w.key, set.terms.buyer, w.buyer.secret)); ok(await ex.receive(take.recipientWrap, w.seller.secret));
  assert.equal(ex.session(r.id).state, 'taken'); assert.equal(ex.session(r.id).selected, false);
  assert.equal(checkpoint.session.selected, true);
  const restored = ok(await ex.restoreCheckpoint(checkpoint, w.seller.secret));
  assert.equal(restored.state, 'accepted'); assert.equal(restored.selected, true); assert.equal(ex.sessionCount, 1);
  assert.equal(ok(await ex.acceptanceStatus(r.id, 'fund')).state, 'both-verified');
  ex.close(); buyer.close();
});
