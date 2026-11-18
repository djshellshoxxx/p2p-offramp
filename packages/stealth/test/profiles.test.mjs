import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { derivePublic, compressedPoint, scalarOf, publicOf, publicFromDigest, parseRecipientUri } from '../src/math.ts';
import { codeOf, bytesOf, hexOf } from '../src/shared.ts';
import { FIELD_PRIME, SCALAR_ORDER } from '../src/profiles.ts';
import { decodeAnnouncement, parseMetadataHex, ANNOUNCEMENT_TOPIC0 } from '../index.ts';
import { REF, SDK, CONTEXT, SPEND, ANNOUNCER, val, fail, logFor, word } from './fixtures/helpers.mjs';
const vectorBytes = readFileSync(new URL('./fixtures/comparison-vectors.json', import.meta.url)), vectors = JSON.parse(vectorBytes);
const rejects = (work, code) => assert.throws(work, error => codeOf(error) === code);
for (const profile of vectors.profiles) test(`public independent fixture: ${profile.id} exact preimage/hash/tag/address and recipient equality`, () => {
  const sender = derivePublic(profile.id, bytesOf(vectors.ephemeralScalarPublicFixtureHex), vectors.viewingPublicKeyHex, SPEND);
  const receiver = derivePublic(profile.id, bytesOf(vectors.viewingScalarPublicFixtureHex), vectors.ephemeralPublicKeyHex, SPEND);
  assert.equal(publicOf(bytesOf(vectors.ephemeralScalarPublicFixtureHex)), vectors.ephemeralPublicKeyHex);
  assert.equal(hexOf(sender.preimage), profile.sharedSecretPreimageHex); assert.equal(hexOf(sender.digest), profile.hashedSharedSecretHex);
  assert.equal(sender.preimage.byteLength, profile.sharedSecretPreimageBytes); assert.equal(sender.address, profile.address); assert.equal(sender.viewTagHex, profile.viewTagHex);
  assert.deepEqual(receiver, sender); sender.preimage.fill(0); sender.digest.fill(0); receiver.preimage.fill(0); receiver.digest.fill(0);
});
test('approved vector bytes/provenance are pinned and the two scheme1 calculations disagree', () => {
  assert.equal(createHash('sha256').update(vectorBytes).digest('hex'), 'a56fd329e6dfcce3077d7c0e9f557e3b48b5fb53591b3123deaeec6111770276');
  assert.equal(vectors.probe.upstreamSDKExecuted, false); assert.equal(vectors.probe.professionalReview, false);
  assert.notEqual(vectors.profiles[0].address, vectors.profiles[1].address); assert.equal(vectors.announcementTopic0, ANNOUNCEMENT_TOPIC0);
});
test('point/scalar/hash bounds refuse zero, n, p, noncanonical encodings, off-curve points and infinity without reduction', () => {
  for (const scalar of [0n, SCALAR_ORDER, (1n << 256n) - 1n]) rejects(() => scalarOf(bytesOf(word(scalar))), 'INVALID_SCALAR');
  assert.equal(scalarOf(bytesOf(word(SCALAR_ORDER - 1n))), SCALAR_ORDER - 1n);
  for (const point of ['04' + SPEND.slice(2), '02' + word(FIELD_PRIME), '02' + '00'.repeat(32), '03' + 'ff'.repeat(32)]) rejects(() => compressedPoint(point), 'INVALID_POINT');
  for (const digest of [0n, SCALAR_ORDER, (1n << 256n) - 1n]) rejects(() => publicFromDigest(SPEND, bytesOf(word(digest))), 'HASH_SCALAR_EXCEPTION');
  rejects(() => publicFromDigest(SPEND, bytesOf(word(SCALAR_ORDER - 3n))), 'POINT_INFINITY');
  rejects(() => derivePublic('unknown', bytesOf(word(2)), SPEND, SPEND), 'UNSUPPORTED_PROFILE');
});
test('recipient URI uses two distinct canonical points; single/equal/mixed/unicode/escaped inputs refused', () => {
  const uri = 'st:eth:0x' + SPEND + vectors.viewingPublicKeyHex;
  assert.equal(parseRecipientUri(uri).uri, uri);
  rejects(() => parseRecipientUri('st:eth:0x' + SPEND), 'SINGLE_KEY_UNSUPPORTED'); rejects(() => parseRecipientUri('st:eth:0x' + SPEND + SPEND), 'KEY_PURPOSE_CONFLICT');
  for (const bad of [uri + ' ', uri.toUpperCase(), uri.replace('st:', 'st%3a'), uri.replace('eth', 'еth'), uri.slice(0, -1)]) assert.throws(() => parseRecipientUri(bad));
});
const claim = { profileId: REF, context: CONTEXT, schemeId: 1, stealthAddress: vectors.profiles[0].address, ephemeralPublicKeyHex: vectors.ephemeralPublicKeyHex, metadataHex: '56', diagnosticOnly: true, economicAuthority: false };
const decode = log => decodeAnnouncement({ profileId: REF, context: CONTEXT, expectedAnnouncer: ANNOUNCER, log });
test('canonical Announcer decoder accepts exact ABI including maximum opaque metadata but grants no payment authority', () => {
  const result = val(decode(logFor(claim))); assert.equal(result.ephemeralPublicKeyHex, claim.ephemeralPublicKeyHex); assert.equal(result.metadataHex, '56'); assert.equal(result.economicAuthority, false);
  assert.equal(val(decode(logFor({ ...claim, metadataHex: '56' + 'ab'.repeat(255) }))).metadataHex.length, 512);
  assert.deepEqual(val(parseMetadataHex('56abcd')), { metadataHex: '56abcd', viewTagHex: '56', opaqueSuffixHex: 'abcd', diagnosticOnly: true, economicAuthority: false });
  fail(parseMetadataHex('')); fail(parseMetadataHex('00'.repeat(257))); fail(parseMetadataHex('AB'));
});
test('Announcer refuses altered offsets, length, padding, topic/address/scheme, point or trailing bytes', () => {
  const good = logFor(claim), mutateWord = (offset, value) => ({ ...good, data: good.data.slice(0, 2 + offset * 2) + word(value) + good.data.slice(2 + (offset + 32) * 2) });
  for (const bad of [mutateWord(0, 32), mutateWord(32, 192), mutateWord(64, 32), mutateWord(160, 0), mutateWord(160, 257), { ...good, data: good.data + '00' }, { ...good, data: good.data.slice(0, -2) },
    { ...good, data: good.data.slice(0, 2 + 129 * 2) + '01' + good.data.slice(2 + 130 * 2) }, { ...good, data: good.data.slice(0, -2) + '01' },
    { ...good, address: '0x' + '44'.repeat(20) }, { ...good, topics: good.topics.slice(0, 3) }, { ...good, topics: ['0x' + word(0), ...good.topics.slice(1)] },
    { ...good, topics: [good.topics[0], '0x' + word(2), ...good.topics.slice(2)] }, { ...good, topics: [good.topics[0], good.topics[1], '0x01' + good.topics[2].slice(4), good.topics[3]] },
    { ...good, data: good.data.slice(0, 2 + 96 * 2) + '04' + good.data.slice(2 + 97 * 2) }]) fail(decode(bad));
});
test('decoder exact-data parser refuses accessors, sparse arrays and unrelated profiles without invoking getters', () => {
  let called = 0; const log = { ...logFor(claim) }; Object.defineProperty(log, 'data', { enumerable: true, get() { called++; throw Error('secret error'); } });
  fail(decode(log)); assert.equal(called, 0);
  const sparse = [...logFor(claim).topics]; Reflect.deleteProperty(sparse, 1); // deliberate array hole fail(decode({ ...logFor(claim), topics: sparse }));
  fail(decodeAnnouncement({ profileId: undefined, context: CONTEXT, expectedAnnouncer: ANNOUNCER, log: logFor(claim) }), 'UNSUPPORTED_PROFILE');
});
