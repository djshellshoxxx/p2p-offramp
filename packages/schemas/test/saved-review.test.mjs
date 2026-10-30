import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeSavedReviewPayload, parseSavedReviewPayload, MAX_SAVED_REVIEW_BYTES, MAX_SAVED_REVIEWS, SAVED_REVIEW_FORMAT, SAVED_REVIEW_SCHEMA_VERSION,
  encodeBase64url, parseRuntimeCommand, parseRuntimeMessage, RuntimeBoundaryError,
} from '../index.ts';
import { MAX_TERMS_REVIEW_BYTES } from '../../domain/index.ts';

const terms = new TextEncoder().encode('{"format":"p2p-offramp/local-terms-review/v1"}');
const PROFILE = 'a'.repeat(32), RECORD = 'b'.repeat(32);
const code = expected => error => { assert.ok(error instanceof RuntimeBoundaryError, String(error)); assert.equal(error.code, expected); return true; };
const command = (operation, fields) => ({ version: 1, requestId: 1, generation: 0, operation, ...fields });
const reply = (operation, value) => ({ version: 1, requestId: 1, generation: 0, operation, kind: 'response', result: { ok: true, value } });

test('saved-review bound equals the domain terms-review bound', () => {
  assert.equal(MAX_SAVED_REVIEW_BYTES, MAX_TERMS_REVIEW_BYTES);
  assert.equal(MAX_SAVED_REVIEWS, 8);
});

test('payload round-trips the exact bytes and source and nothing derived', () => {
  for (const source of ['file', 'synthetic-sample']) {
    const payload = encodeSavedReviewPayload(source, terms);
    const parsed = parseSavedReviewPayload(payload, SAVED_REVIEW_SCHEMA_VERSION);
    assert.deepEqual(parsed, { source, terms });
    assert.ok(Object.isFrozen(parsed));
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    assert.deepEqual(Object.keys(json), ['format', 'source', 'terms']);
    assert.equal(json.format, SAVED_REVIEW_FORMAT);
  }
  const max = new Uint8Array(MAX_SAVED_REVIEW_BYTES).fill(0x41);
  assert.equal(parseSavedReviewPayload(encodeSavedReviewPayload('file', max), 1).terms.byteLength, MAX_SAVED_REVIEW_BYTES);
});

test('encode refuses empty, oversized, non-byte input and unknown sources', () => {
  for (const [source, bytes] of [['file', new Uint8Array(0)], ['file', new Uint8Array(MAX_SAVED_REVIEW_BYTES + 1)], ['file', [1, 2]], ['relay', terms], [undefined, terms]]) {
    assert.throws(() => encodeSavedReviewPayload(source, bytes), RangeError);
  }
});

test('anything that is not exactly this format, version and canonical encoding is not a saved review', () => {
  const wrap = value => encodeBase64url(new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)));
  const good = { format: SAVED_REVIEW_FORMAT, source: 'file', terms: encodeBase64url(terms) };
  const cases = [
    [encodeSavedReviewPayload('file', terms), 2],                          // other schema version
    [wrap({ ...good, format: 'p2p-offramp/saved-terms-review/v2' }), 1],
    [wrap({ ...good, source: 'relay' }), 1],
    [wrap({ ...good, extra: 1 }), 1],
    [wrap({ format: good.format, source: good.source }), 1],
    [wrap({ ...good, terms: '' }), 1],                                      // empty terms
    [wrap({ source: good.source, format: good.format, terms: good.terms }), 1], // non-canonical key order
    [wrap(' ' + JSON.stringify(good)), 1],                                  // non-canonical whitespace
    [wrap('[]'), 1], [wrap('null'), 1], ['%%%', 1], [123, 1], ['', 1],
    [encodeBase64url(Uint8Array.of(0xff, 0xfe)), 1],                         // not UTF-8
    [wrap({ ...good, terms: encodeBase64url(new Uint8Array(MAX_SAVED_REVIEW_BYTES + 1)) }), 1],
  ];
  for (const [payload, version] of cases) assert.equal(parseSavedReviewPayload(payload, version), null, String(payload).slice(0, 40));
});

test('runtime commands: exact keys, profile and record ids, sources and byte bounds are enforced and bytes are copied', () => {
  const bytes = terms.slice();
  const save = parseRuntimeCommand(command('saveTermsReview', { profileId: PROFILE, source: 'file', bytes }));
  assert.equal(save.profileId, PROFILE); assert.equal(save.source, 'file'); assert.deepEqual(save.bytes, terms); assert.notEqual(save.bytes, bytes);
  bytes.fill(0); assert.deepEqual(save.bytes, terms, 'the parser owns a copy');
  assert.equal(parseRuntimeCommand(command('listTermsReviews', { profileId: PROFILE })).profileId, PROFILE);
  assert.equal(parseRuntimeCommand(command('deleteTermsReview', { profileId: PROFILE, recordId: RECORD })).recordId, RECORD);
  const bad = [
    command('saveTermsReview', { profileId: PROFILE, source: 'file' }),
    command('saveTermsReview', { profileId: PROFILE, source: 'relay', bytes: terms }),
    command('saveTermsReview', { profileId: PROFILE, source: 'file', bytes: new Uint8Array(0) }),
    command('saveTermsReview', { profileId: PROFILE, source: 'file', bytes: [1] }),
    command('saveTermsReview', { profileId: 'A'.repeat(32), source: 'file', bytes: terms }),
    command('saveTermsReview', { profileId: PROFILE, source: 'file', bytes: terms, recordId: RECORD }),
    command('listTermsReviews', {}),
    command('deleteTermsReview', { profileId: PROFILE, recordId: 'B'.repeat(32) }),
    command('deleteTermsReview', { profileId: PROFILE, recordId: RECORD + '0' }),
  ];
  for (const input of bad) assert.throws(() => parseRuntimeCommand(input), code('INVALID_INPUT'));
  assert.throws(() => parseRuntimeCommand(command('saveTermsReview', { profileId: PROFILE, source: 'file', bytes: new Uint8Array(MAX_SAVED_REVIEW_BYTES + 1) })), code('LIMIT_EXCEEDED'));
});

test('runtime replies: bounded unique items with copied bytes; refs carry only a record id', () => {
  const item = recordId => ({ recordId, source: 'synthetic-sample', bytes: terms });
  const listed = parseRuntimeMessage(reply('listTermsReviews', { items: [item(RECORD), item('c'.repeat(32))], skipped: 2 }));
  assert.equal(listed.result.value.items.length, 2); assert.equal(listed.result.value.skipped, 2);
  assert.deepEqual(parseRuntimeMessage(reply('saveTermsReview', { recordId: RECORD })).result.value, { recordId: RECORD });
  assert.deepEqual(parseRuntimeMessage(reply('deleteTermsReview', { recordId: RECORD })).result.value, { recordId: RECORD });
  const many = Array.from({ length: MAX_SAVED_REVIEWS + 1 }, (_, i) => item(i.toString(16).padStart(32, '0')));
  const bad = [
    reply('listTermsReviews', { items: many, skipped: 0 }),
    reply('listTermsReviews', { items: [item(RECORD), item(RECORD)], skipped: 0 }),
    reply('listTermsReviews', { items: [{ ...item(RECORD), bytes: new Uint8Array(0) }], skipped: 0 }),
    reply('listTermsReviews', { items: [{ ...item(RECORD), extra: 1 }], skipped: 0 }),
    reply('listTermsReviews', { items: [], skipped: -1 }),
    reply('listTermsReviews', { items: [] }),
    reply('saveTermsReview', { recordId: RECORD, bytes: terms }),
    reply('saveTermsReview', { state: 'locked', handle: null }),
    reply('deleteTermsReview', { recordId: 'z'.repeat(32) }),
  ];
  for (const input of bad) assert.throws(() => parseRuntimeMessage(input), RuntimeBoundaryError);
  assert.throws(() => parseRuntimeMessage(reply('listTermsReviews', { items: [{ ...item(RECORD), bytes: new Uint8Array(MAX_SAVED_REVIEW_BYTES + 1) }], skipped: 0 })), code('LIMIT_EXCEEDED'));
});
