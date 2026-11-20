import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCourierRecord, decodeCourierRecord, encodeCourierRecord} from '../src/records.ts';
import {authorizeRouteFields} from '../src/custody.ts';
import {fixture, H, profile, signs} from './support/fixtures.mjs';

test('unsupported record kinds refuse consistently at every public record boundary', () => {
  const bytes = new TextEncoder().encode('{}');
  const observed = [];
  for (const kind of ['__proto__', 'constructor', 'toString', 'valueOf', 'future-record']) {
    for (const [boundary, result] of [
      ['parse', parseCourierRecord(kind, {}, profile)],
      ['decode', decodeCourierRecord(kind, bytes, profile)],
      ['encode', encodeCourierRecord(kind, {}, profile)],
    ]) {
      observed.push({kind, boundary, result});
    }
  }
  assert.deepEqual(
    observed.map(({kind, boundary, result}) => ({kind, boundary, result})),
    observed.map(({kind, boundary}) => ({
      kind, boundary, result: {ok: false, code: 'UNSUPPORTED_PROFILE', retryable: false},
    })),
    JSON.stringify(observed),
  );
});

test('route-field projection requires every signer in the terms-bound disclosure policy', async (t) => {
  const f = fixture({requiredSigners: () => ['key-seller', 'key-buyer']});
  t.after(() => f.verifier.close());
  const body = {
    grantId: H('a'), shipmentAlias: H('b'), legId: H('4'), recipient: 'key-courier',
    fields: ['pickup', 'dropoff'], purpose: 'assignment', expiresAt: 200, consentRevision: 4,
  };
  const one = await f.verifier.verify('disclosure', body, signs('key-seller'));
  const both = await f.verifier.verify('disclosure', body, signs('key-seller', 'key-buyer'));
  assert.equal(one.ok, true);
  assert.equal(both.ok, true);
  assert.equal(one.value.classification, 'one-sided-claim');
  assert.equal(both.value.classification, 'attributed-mutual-claim');
  const options = {
    verifier: f.verifier, recipient: 'key-courier', legId: H('4'), purpose: 'assignment',
    consentRevision: 4, accepted: true, requested: ['pickup', 'dropoff'], nowSeconds: 100,
  };
  const incomplete = authorizeRouteFields({...options, grant: one.value});
  const complete = authorizeRouteFields({...options, grant: both.value});
  assert.equal(complete.ok, true);
  assert.deepEqual(complete.value.fields, ['pickup', 'dropoff']);
  assert.equal(complete.value.economicAuthority, false);
  assert.equal(complete.value.physicalContentsVerified, false);
  assert.deepEqual(incomplete, {ok: false, code: 'UNAUTHORIZED', retryable: false},
    JSON.stringify({classification: one.value.classification, incomplete, complete}));
});
