import test from 'node:test';
import assert from 'node:assert/strict';
import * as facade from '../index.ts';
import { REF, SDK, CONTEXT, SPEND, val as assertValue, fail as assertFailure, nativeFill } from './fixtures/helpers.mjs';
const make = (profileId = REF, isCurrent = () => true) => assertValue(facade.createOfflineStealth({ profileId, context: CONTEXT, isCurrent }));
for (const profile of [REF, SDK]) test(`fresh native view/send/receive ${profile} exports public diagnostics only`, t => {
  const service = make(profile); t.after(() => service.close());
  const view = assertValue(service.createViewingKey()), other = assertValue(service.createViewingKey());
  assert.notEqual(view.viewingPublicKeyHex, other.viewingPublicKeyHex); assert.equal(view.purpose, 'view-only'); assert.equal(Object.isFrozen(view), true);
  const uri = assertValue(service.recipientMetaAddress(view, SPEND)).uri, first = assertValue(service.generateAnnouncement(uri, 'abcd')), second = assertValue(service.generateAnnouncement(uri));
  assert.notEqual(first.ephemeralPublicKeyHex, second.ephemeralPublicKeyHex); assert.notEqual(first.stealthAddress, second.stealthAddress); assert.equal(first.metadataHex.length, 6);
  assert.equal(assertValue(service.matchAnnouncement(view, SPEND, first)).match, true); assert.equal(assertValue(service.matchAnnouncement(view, SPEND, second)).match, true);
  assert.equal(assertValue(service.matchAnnouncement(other, SPEND, first)).match, false); assert.equal(first.economicAuthority, false); assert.equal(Object.isFrozen(service), true);
  assert.deepEqual(new Set(Object.keys(facade)), new Set(['ANNOUNCEMENT_TOPIC0', 'createEncryptedComparisonStore', 'createOfflineStealth', 'decodeAnnouncement', 'parseMetadataHex']));
  assert.doesNotMatch(JSON.stringify([view, first, second]), /secret|scalar|seed|preimage|digest|balance|signature/i);
  for (const name of ['importKey', 'importSeed', 'privateKey', 'derivePrivateKey', 'spend', 'fund', 'send', 'sign', 'fetch', 'network']) assert.equal(name in service, false);
});
test('explicit profile/context and no RNG/secret inputs; copied or foreign handles cannot confer viewing purpose', t => {
  for (const profileId of [undefined, null, 1, 'scheme1', 'auto']) assertFailure(facade.createOfflineStealth({ profileId, context: CONTEXT, isCurrent: () => true }), 'UNSUPPORTED_PROFILE');
  assertFailure(facade.createOfflineStealth({ profileId: REF, context: CONTEXT, isCurrent: () => true, randomFill() {} }));
  assertFailure(facade.createOfflineStealth({ profileId: REF, context: CONTEXT, isCurrent: () => true, seed: 'secret error' }));
  const s = make(), other = make(); t.after(() => { s.close(); other.close(); }); const handle = assertValue(s.createViewingKey());
  assertFailure(s.recipientMetaAddress({ ...handle }, SPEND), 'INVALID_HANDLE'); assertFailure(other.recipientMetaAddress(handle, SPEND), 'INVALID_HANDLE');
  assertFailure(s.recipientMetaAddress(handle, handle.viewingPublicKeyHex), 'KEY_PURPOSE_CONFLICT');
  assertFailure(s.generateAnnouncement('st:eth:0x' + SPEND), 'SINGLE_KEY_UNSUPPORTED');
  assertFailure(s.generateAnnouncement('st:eth:0x' + SPEND + SPEND), 'KEY_PURPOSE_CONFLICT');
});
test('wrong tag/address do not match; wrong profile/context is refused without fallback', t => {
  const s = make(); t.after(() => s.close()); const view = assertValue(s.createViewingKey()), claim = assertValue(s.generateAnnouncement(assertValue(s.recipientMetaAddress(view, SPEND)).uri));
  assert.equal(assertValue(s.matchAnnouncement(view, SPEND, { ...claim, metadataHex: (claim.metadataHex === '00' ? '01' : '00') })).match, false);
  assert.equal(assertValue(s.matchAnnouncement(view, SPEND, { ...claim, stealthAddress: '0x' + '00'.repeat(20) })).match, false);
  assertFailure(s.matchAnnouncement(view, SPEND, { ...claim, profileId: SDK }), 'PROFILE_MISMATCH');
  assertFailure(s.matchAnnouncement(view, SPEND, { ...claim, context: { ...CONTEXT, id: 'other' } }), 'CONTEXT_MISMATCH');
  assertFailure(s.matchAnnouncement(view, SPEND, { ...claim, economicAuthority: true }));
});
test('native scalar rejection is bounded to128 attempts, never reduced modulo order, all owned buffers wiped', () => {
  for (const fillByte of [0, 255]) {
    const s = make(), buffers = []; let calls = 0;
    const result = nativeFill(bytes => { calls++; bytes.fill(fillByte); buffers.push(bytes); return bytes; }, () => s.createViewingKey());
    assertFailure(result, 'ENTROPY_EXHAUSTED'); assert.equal(calls, 128); assert.equal(buffers.every(bytes => bytes.every(b => b === 0)), true); s.close();
  }
  const s = make(); assertFailure(nativeFill(() => { throw Error('secret error https://private'); }, () => s.createViewingKey()), 'RNG_UNAVAILABLE'); s.close();
});
test('valid native viewing secret stays opaque and is synchronously wiped on close; sender entropy wiped after output', () => {
  const s = make(), captured = [];
  const view = nativeFill(bytes => { bytes.fill(0); bytes[31] = 2; captured.push(bytes); return bytes; }, () => assertValue(s.createViewingKey()));
  assert.equal(captured[0][31], 2); assert.equal('secret' in view, false);
  const uri = assertValue(s.recipientMetaAddress(view, SPEND)), senderIndex = captured.length;
  nativeFill(bytes => { bytes.fill(0); bytes[31] = 4; captured.push(bytes); return bytes; }, () => assertValue(s.generateAnnouncement(uri.uri)));
  assert.equal(captured[senderIndex].every(b => b === 0), true); view.close(); assert.equal(captured[0].every(b => b === 0), true);
  assertFailure(s.recipientMetaAddress(view, SPEND), 'LOCKED'); s.close();
});
test('one admission slot is reserved before owner, parsing and entropy callbacks; reentry cannot mint another job', () => {
  let s, armed = false, nested; s = make(REF, () => { if (armed) { armed = false; nested = s.createViewingKey(); } return true; });
  armed = true; assertValue(s.createViewingKey()); assertFailure(nested, 'CONFLICT');
  let rngNested; nativeFill(bytes => { rngNested = s.createViewingKey(); bytes.fill(0); bytes[31] = 7; return bytes; }, () => assertValue(s.createViewingKey())); assertFailure(rngNested, 'CONFLICT');
  const hostile = new Proxy({}, { getPrototypeOf() { nested = s.createViewingKey(); return Object.prototype; } });
  assertFailure(s.matchAnnouncement(assertValue(s.createViewingKey()), SPEND, hostile)); assertFailure(nested, 'CONFLICT'); s.close();
});
test('entropy callback retirement immediately wipes owned buffer and refuses later fill publication', () => {
  const s = make(); let captured;
  const r = nativeFill(bytes => { captured = bytes; bytes[0] = 42; s.close(); assert.equal(bytes.every(b => b === 0), true); bytes[31] = 5; return bytes; }, () => s.createViewingKey());
  assertFailure(r, 'LOCKED'); assert.equal(captured.every(b => b === 0), true);
});
test('final owner callback retirement cannot publish a newly generated announcement', () => {
  let service, count = 0, retireAt = Infinity;
  service = make(REF, () => { count++; if (count === retireAt) service.close(); return true; });
  const view = assertValue(service.createViewingKey()), uri = assertValue(service.recipientMetaAddress(view, SPEND)).uri;
  count = 0; assertValue(service.generateAnnouncement(uri)); retireAt = count; count = 0;
  assertFailure(service.generateAnnouncement(uri), 'LOCKED'); assertFailure(service.createViewingKey(), 'LOCKED');
});
test('local view capacity is bounded without increasing entropy consumption; revocation frees only its own slot', () => {
  const s = make(), views = Array.from({ length: 16 }, () => assertValue(s.createViewingKey())); let calls = 0;
  assertFailure(nativeFill(bytes => { calls++; return bytes; }, () => s.createViewingKey()), 'CAPACITY_EXCEEDED'); assert.equal(calls, 0);
  views[0].close(); assertValue(s.createViewingKey()); s.close();
});
