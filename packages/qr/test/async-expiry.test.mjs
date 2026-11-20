import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createQrEnvelope, encodeQrText, decodeQrText, attachInviteSignature, inviteSigningDigest,
  EXPIRY_SAFETY_MARGIN_SECONDS,
} from '../index.ts';
import {
  INPUTS, deps, encodeDeps, context, sha256, testSign, testVerifier,
  TEST_PROFILE, TEST_PUBLIC_KEY, NOW,
} from './helpers.mjs';

async function inviteText(label) {
  const created = await createQrEnvelope(INPUTS['trade-invite'], deps(label));
  assert.equal(created.ok, true);
  const encoded = await encodeQrText(created.envelope, encodeDeps());
  assert.equal(encoded.ok, true);
  return { envelope: created.envelope, text: encoded.text };
}

test('an expiring invite is refused when asynchronous payload hashing crosses the safety margin', async () => {
  const { envelope, text } = await inviteText('async-expiry/hash');
  let now = envelope.expiresAt - EXPIRY_SAFETY_MARGIN_SECONDS - 1;
  let calls = 0;
  const result = await decodeQrText(text, context({
    nowSeconds: () => now,
    sha256: async bytes => { calls++; now = envelope.expiresAt - EXPIRY_SAFETY_MARGIN_SECONDS; return sha256(bytes); },
  }));
  assert.equal(calls, 1);
  assert.deepEqual(result, { ok: false, code: 'EXPIRED' });
});

test('a fully verified invite is still refused when the verifier completes after expiry', async () => {
  const { envelope } = await inviteText('async-expiry/verifier');
  const digest = await inviteSigningDigest(envelope, sha256);
  assert.equal(digest.ok, true);
  const signed = attachInviteSignature(envelope, {
    profile: TEST_PROFILE, publicKey: TEST_PUBLIC_KEY, value: testSign(digest.digest),
  });
  assert.equal(signed.ok, true);
  const encoded = await encodeQrText(signed.envelope, encodeDeps());
  assert.equal(encoded.ok, true);
  let now = envelope.expiresAt - EXPIRY_SAFETY_MARGIN_SECONDS - 1;
  let verified = 0;
  const real = testVerifier();
  const result = await decodeQrText(encoded.text, context({
    nowSeconds: () => now,
    inviteVerifier: {
      ...real,
      async verify(input) {
        const verdict = await real.verify(input);
        verified++;
        now = envelope.expiresAt - EXPIRY_SAFETY_MARGIN_SECONDS;
        return verdict;
      },
    },
  }));
  assert.equal(verified, 1, 'the valid asynchronous signature was actually verified');
  assert.deepEqual(result, { ok: false, code: 'EXPIRED' });
});

test('late invalid and throwing clock samples fail closed without returning a review', async () => {
  const { text } = await inviteText('async-expiry/invalid-clock');
  for (const late of [NaN, Infinity, -1, 1.5]) {
    let now = NOW + 5;
    const result = await decodeQrText(text, context({
      nowSeconds: () => now,
      sha256: async bytes => { now = late; return sha256(bytes); },
    }));
    assert.deepEqual(result, { ok: false, code: 'UNAVAILABLE' });
  }
  let count = 0;
  const result = await decodeQrText(text, context({
    nowSeconds: () => { if (++count > 1) throw Error('clock disappeared'); return NOW + 5; },
  }));
  assert.deepEqual(result, { ok: false, code: 'UNAVAILABLE' });
});

test('steady clocks retain valid review timing; backward samples cannot inflate remaining lifetime', async () => {
  const { envelope, text } = await inviteText('async-expiry/steady');
  const steady = await decodeQrText(text, context({ nowSeconds: () => NOW + 100 }));
  assert.equal(steady.ok, true);
  assert.equal(steady.review.secondsUntilExpiry, envelope.expiresAt - (NOW + 100));
  let now = NOW + 100;
  const rollback = await decodeQrText(text, context({
    nowSeconds: () => now,
    sha256: async bytes => { now = NOW + 20; return sha256(bytes); },
  }));
  assert.equal(rollback.ok, true);
  assert.equal(rollback.review.secondsUntilExpiry, steady.review.secondsUntilExpiry);
});
