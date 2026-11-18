import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createQrEnvelope, encodeQrText, decodeQrText, qrTextToBytes, attachInviteSignature, inviteSigningDigest, createReplayLedger,
  isQrImportReview, canonicalize, canonicalBytes, encodeBase45, encodeUtf8, groupForDisplay, groupDigits,
  QR_TEXT_PREFIX, MAX_QR_TEXT_LENGTH, MAX_ENVELOPE_BYTES, GENERATION_TARGET_BYTES, EXPIRY_SAFETY_MARGIN_SECONDS, MAX_FUTURE_SKEW_SECONDS,
} from '../index.ts';
import {
  INPUTS, NOW, CHAINS, EVM_CHAIN, OTHER_EVM_CHAIN, deps, context, sha256, hashHex, evmAddress, adAddress, encodeDeps,
  TEST_PROFILE, TEST_PUBLIC_KEY, TEST_BOUND_AUTHOR, testSign, testVerifier,
} from './helpers.mjs';

const plain = value => JSON.parse(canonicalize(value));
const rawText = bytes => QR_TEXT_PREFIX + encodeBase45(bytes);
const treeText = tree => rawText(canonicalBytes(tree));
async function make(type, label = type, change = {}) {
  const created = await createQrEnvelope({ ...INPUTS[type], ...change }, deps(`codec/${label}`));
  assert.equal(created.ok, true, `${label}: ${created.code}`);
  const encoded = await encodeQrText(created.envelope, encodeDeps());
  assert.equal(encoded.ok, true, `${label}: ${encoded.code}`);
  return { envelope: created.envelope, text: encoded.text, encoded };
}
async function signed(label = 'signed') {
  const { envelope } = await make('trade-invite', label);
  const digest = await inviteSigningDigest(envelope, sha256);
  const result = attachInviteSignature(envelope, { profile: TEST_PROFILE, publicKey: TEST_PUBLIC_KEY, value: testSign(digest.digest) });
  const encoded = await encodeQrText(result.envelope, encodeDeps());
  return { envelope: result.envelope, text: encoded.text, digest: digest.digest };
}
const decode = (text, extra) => decodeQrText(text, context(extra));
const refused = async (text, code, extra) => {
  const result = await decode(text, extra);
  assert.equal(result.ok, false, `expected ${code}, decoded ok`);
  assert.equal(result.code, code);
  assert.deepEqual(Object.keys(result).sort(), ['code', 'ok'], 'a refusal carries no scanned content');
  assert.equal(Object.isFrozen(result), true);
};

test('every type round-trips to a frozen review with full fields, warnings and no authority', async () => {
  for (const type of Object.keys(INPUTS)) {
    const { envelope, text, encoded } = await make(type);
    assert.equal(text.startsWith(QR_TEXT_PREFIX), true);
    assert.match(text, /^[0-9A-Z $%*+\-./:]+$/, 'whole text stays in the QR alphanumeric set');
    assert.equal(encoded.generationTargetBytes, GENERATION_TARGET_BYTES);
    assert.equal(encoded.withinGenerationTarget, true);
    const result = await decode(text);
    assert.equal(result.ok, true, `${type}: ${result.code}`);
    const { review } = result;
    assert.equal(isQrImportReview(review), true);
    assert.equal(Object.isFrozen(review) && Object.isFrozen(review.payload) && Object.isFrozen(review.warnings) && Object.isFrozen(review.display), true);
    assert.equal(review.authority, 'none');
    assert.equal(review.authenticated, false);
    assert.equal(review.signature, 'absent');
    assert.deepEqual({ type: review.type, requestId: review.requestId, chain: review.chain, expiresAt: review.expiresAt, payload: { ...review.payload } },
      { type, requestId: envelope.requestId, chain: envelope.chain, expiresAt: envelope.expiresAt, payload: { ...envelope.payload } });
    assert.equal(review.envelopeBytes, encoded.envelopeBytes);
    assert.ok(review.warnings.includes('unauthenticated'));
    assert.ok(review.warnings.includes('payload-hash-is-not-authentication'));
    if (envelope.expiresAt !== null) { assert.ok(review.warnings.includes('expiry-advisory')); assert.equal(review.expiryAuthenticated, false); }
    if (envelope.originHint !== null) assert.ok(review.warnings.includes('origin-hint-display-only'));
  }
});

test('the review shows full recipient, chain, amount and expiry, grouped for lookalike-resistant reading', async () => {
  const { review } = await decode((await make('payment-request')).text);
  const field = name => review.display.find(item => item.field === name);
  assert.equal(field('chain').value, EVM_CHAIN);
  assert.equal(field('recipient').value, INPUTS['payment-request'].payload.recipient);
  assert.equal(field('recipient').grouped.replaceAll(' ', ''), INPUTS['payment-request'].payload.recipient);
  assert.equal(field('amount-base-units').value, '1500000000000000000');
  assert.equal(field('amount-base-units').grouped, '1 500 000 000 000 000 000');
  assert.equal(review.secondsUntilExpiry, 900 - 5);
  assert.ok(review.warnings.includes('payment-request-is-not-escrow-funding'));
  const invite = (await decode((await make('trade-invite')).text)).review;
  assert.deepEqual(invite.display.map(item => item.field), ['chain', 'advertisement-author', 'order-id', 'terms-hash', 'expires-at']);
  assert.ok(invite.warnings.includes('invite-requires-terms-revalidation') && invite.warnings.includes('unsigned-invite'));
  assert.equal(groupForDisplay('0xabcdef0123'), '0x abcd ef01 23');
  assert.equal(groupDigits('1234567'), '1 234 567');
});

test('largest permitted envelope: exactly 2,048 canonical bytes decodes; one more byte pair is refused', async () => {
  const { envelope } = await make('trade-invite', 'largest');
  const sized = size => {
    for (let pad = 1; pad <= 2; pad++) {
      const probe = { ...plain(envelope), originHint: `${'a'.repeat(pad)}.example`, signature: { profile: 'size-probe', publicKey: hashHex('k'), value: '' } };
      const remaining = size - canonicalBytes(probe).length;
      if (remaining >= 2 && remaining % 2 === 0) { probe.signature.value = 'ab'.repeat(remaining / 2); return probe; }
    }
    throw new Error('unreachable');
  };
  const largest = sized(MAX_ENVELOPE_BYTES);
  assert.equal(canonicalBytes(largest).length, 2048);
  const encoded = await encodeQrText(largest, encodeDeps());
  assert.equal(encoded.ok, true); assert.equal(encoded.envelopeBytes, 2048); assert.equal(encoded.withinGenerationTarget, false);
  assert.equal(encoded.text.length, MAX_QR_TEXT_LENGTH);
  const result = await decode(encoded.text);
  assert.equal(result.ok, true); assert.equal(result.review.envelopeBytes, 2048);
  assert.equal(result.review.signature, 'unverified'); assert.ok(result.review.warnings.includes('no-invite-verifier'));
  const over = sized(MAX_ENVELOPE_BYTES + 2);
  assert.equal((await encodeQrText(over, encodeDeps())).code, 'QR_TOO_LARGE');
  await refused(treeText(over), 'QR_TOO_LARGE');
});

test('oversize content is refused before UTF-8 or JSON parsing', async () => {
  await refused(rawText(new Uint8Array(MAX_ENVELOPE_BYTES + 1).fill(0xff)), 'QR_TOO_LARGE');
  await refused(rawText(new Uint8Array(MAX_ENVELOPE_BYTES + 1).fill(0x7b)), 'QR_TOO_LARGE');
  await refused('X'.repeat(1_000_000), 'QR_TOO_LARGE');
  // At the cap the same garbage reaches the UTF-8 layer, proving the size gate ran first above.
  await refused(rawText(new Uint8Array(MAX_ENVELOPE_BYTES).fill(0xff)), 'INVALID_UNICODE');
  assert.equal(qrTextToBytes(rawText(new Uint8Array(MAX_ENVELOPE_BYTES))).bytes.length, 2048);
});

test('unknown version, protocol, type and field fail closed', async () => {
  const { envelope, text } = await make('public-address', 'unknowns');
  await refused(`P2POFFRAMP:2:${text.slice(QR_TEXT_PREFIX.length)}`, 'VERSION_UNSUPPORTED');
  await refused(`P2POFFRAMP:${text.slice(QR_TEXT_PREFIX.length)}`, 'VERSION_UNSUPPORTED');
  await refused(treeText({ ...plain(envelope), v: 2 }), 'VERSION_UNSUPPORTED');
  await refused(treeText({ ...plain(envelope), v: '1' }), 'VERSION_UNSUPPORTED');
  await refused(treeText({ ...plain(envelope), protocol: 'p2p-offramp-qr2' }), 'PROTOCOL_UNSUPPORTED');
  await refused(treeText({ ...plain(envelope), type: 'seed-backup' }), 'TYPE_UNSUPPORTED');
  await refused(treeText({ ...plain(envelope), type: 'wallet-pairing' }), 'TYPE_UNSUPPORTED');
  await refused(treeText({ ...plain(envelope), note: 'x' }), 'FIELD_UNSUPPORTED');
  await refused(treeText({ ...plain(envelope), payload: { ...envelope.payload, label: 'x' } }), 'FIELD_UNSUPPORTED');
  const { originHint: _drop, ...missing } = plain(envelope);
  await refused(treeText(missing), 'INVALID_ENVELOPE');
  await refused(treeText([plain(envelope)]), 'INVALID_ENVELOPE');
  await refused(treeText({ ...plain(envelope), payload: { ...envelope.payload, nested: { a: { b: { c: { d: { e: { f: {} } } } } } } } }), 'INVALID_JSON');
});

test('invalid Unicode is refused: bad UTF-8, encoded surrogates, overlong forms and lone surrogate escapes', async () => {
  const { envelope } = await make('public-address', 'unicode');
  const withHint = { ...plain(envelope), originHint: 'xx.example' };
  const splice = replacement => {
    const canonical = canonicalize(withHint), at = canonical.indexOf('xx.example');
    return rawText(Uint8Array.from([...encodeUtf8(canonical.slice(0, at)), ...replacement, ...encodeUtf8(canonical.slice(at + 2))]));
  };
  await refused(splice([0xed, 0xa0, 0x80]), 'INVALID_UNICODE');
  await refused(splice([0xc0, 0xaf]), 'INVALID_UNICODE');
  await refused(splice([0xff]), 'INVALID_UNICODE');
  await refused(splice([0xe2, 0x82]), 'INVALID_UNICODE');
  await refused(splice(encodeUtf8('\\ud800')), 'INVALID_UNICODE');
  await refused(splice(encodeUtf8('\\udfff\\ud800')), 'INVALID_UNICODE');
  await refused(splice(encodeUtf8('é')), 'INVALID_ENVELOPE', undefined);
});

test('non-canonical, duplicate-key and non-integer encodings are refused', async () => {
  const { envelope } = await make('public-address', 'canonical');
  await refused(rawText(encodeUtf8(JSON.stringify(plain(envelope), null, 2))), 'NON_CANONICAL');
  await refused(rawText(encodeUtf8(JSON.stringify({ v: 1, ...plain(envelope) }))), 'NON_CANONICAL');
  const canonical = canonicalize(envelope);
  await refused(rawText(encodeUtf8(canonical.replace('"chain":', `"chain":"${OTHER_EVM_CHAIN}","chain":`))), 'INVALID_JSON');
  await refused(rawText(encodeUtf8(canonical.replace(`"createdAt":${NOW}`, `"createdAt":${NOW}.0`))), 'INVALID_JSON');
  await refused(rawText(encodeUtf8(canonical.replace(`"createdAt":${NOW}`, '"createdAt":1.8e9'))), 'INVALID_JSON');
  await refused(rawText(encodeUtf8(`${canonical} `)), 'NON_CANONICAL');
  await refused(rawText(encodeUtf8(`${canonical}x`)), 'INVALID_JSON');
});

test('wrong chain and unknown chains fail closed', async () => {
  const { envelope, text } = await make('public-address', 'chain');
  await refused(text, 'CHAIN_MISMATCH', { expectedChain: OTHER_EVM_CHAIN });
  assert.equal((await decode(text, { expectedChain: EVM_CHAIN })).ok, true);
  await refused(text, 'CHAIN_UNSUPPORTED', { chains: [OTHER_EVM_CHAIN] });
  await refused(text, 'CHAIN_UNSUPPORTED', { chains: [] });
  await refused(treeText({ ...plain(envelope), chain: 'evm:999' }), 'CHAIN_UNSUPPORTED');
  await refused(treeText({ ...plain(envelope), chain: 'tron:1' }), 'INVALID_ENVELOPE');
  const fingerprint = (await make('release-fingerprint', 'chainless')).text;
  assert.equal((await decode(fingerprint, { chains: [], expectedChain: undefined })).ok, true, 'chain-free types need no chain allowlist');
  await refused(text, 'INVALID_INPUT', { expectedChain: 'evm:999' });
});

test('hash mismatch: a changed payload is detected; a matching hash still authenticates nobody', async () => {
  const { envelope } = await make('payment-request', 'hash');
  await refused(treeText({ ...plain(envelope), payload: { ...envelope.payload, amount: '1500000000000000001' } }), 'HASH_MISMATCH');
  await refused(treeText({ ...plain(envelope), payload: { ...envelope.payload, recipient: evmAddress('attacker') } }), 'HASH_MISMATCH');
  // An attacker who also rewrites payloadSha256 produces a valid-looking but unauthenticated code.
  const forged = { ...plain(envelope), payload: { ...envelope.payload, recipient: evmAddress('attacker') } };
  forged.payloadSha256 = Buffer.from(await sha256(canonicalBytes(forged.payload))).toString('hex');
  const result = await decode(treeText(forged));
  assert.equal(result.ok, true); assert.equal(result.review.authenticated, false); assert.ok(result.review.warnings.includes('unauthenticated'));
});

test('expired invite (with safety margin), future-dated codes, and commit-time expiry re-check', async () => {
  const { envelope, text } = await make('trade-invite', 'expiry');
  const at = now => decodeQrText(text, context({ nowSeconds: () => now }));
  assert.equal((await at(envelope.expiresAt - EXPIRY_SAFETY_MARGIN_SECONDS - 1)).ok, true);
  assert.equal((await at(envelope.expiresAt - EXPIRY_SAFETY_MARGIN_SECONDS)).code, 'EXPIRED');
  assert.equal((await at(envelope.expiresAt + 3600)).code, 'EXPIRED');
  assert.equal((await at(envelope.createdAt - MAX_FUTURE_SKEW_SECONDS)).ok, true);
  assert.equal((await at(envelope.createdAt - MAX_FUTURE_SKEW_SECONDS - 1)).code, 'NOT_YET_VALID');
  assert.equal((await decodeQrText(text, context({ nowSeconds: () => { throw new Error('clock'); } }))).code, 'UNAVAILABLE');
  assert.equal((await decodeQrText(text, context({ nowSeconds: () => 1.5 }))).code, 'UNAVAILABLE');
  let now = envelope.createdAt + 10;
  const ledger = createReplayLedger({ nowSeconds: () => now });
  const { review } = await decodeQrText(text, context({ nowSeconds: () => now }));
  now = envelope.expiresAt - EXPIRY_SAFETY_MARGIN_SECONDS;
  assert.equal(ledger.admit(review).code, 'EXPIRED', 'expiry is re-checked when the import is committed');
});

test('replayed invite is refused by the local ledger; memory is bounded', async () => {
  const { text } = await make('trade-invite', 'replay');
  let now = NOW + 5;
  const ledger = createReplayLedger({ nowSeconds: () => now, maxEntries: 2 });
  const first = await decode(text), second = await decode(text);
  assert.equal(first.ok && second.ok, true, 'decoding itself is stateless');
  assert.equal(ledger.seen(first.review.requestId), false);
  assert.deepEqual(ledger.admit(first.review), { ok: true });
  assert.equal(ledger.seen(first.review.requestId), true);
  assert.equal(ledger.admit(second.review).code, 'REPLAYED');
  const other = (await decode((await make('trade-invite', 'replay-2')).text)).review;
  const third = (await decode((await make('trade-invite', 'replay-3')).text)).review;
  assert.equal(ledger.admit(other).ok, true);
  assert.equal(ledger.admit(third).ok, true, 'unauthenticated entries are evicted oldest-first when full');
  assert.equal(ledger.size, 2);
  assert.equal(ledger.seen(first.review.requestId), false);
  now = third.expiresAt + MAX_FUTURE_SKEW_SECONDS;
  assert.equal(ledger.size, 2);
  assert.equal(ledger.seen(third.requestId), false, 'entries retire after expiry plus skew');
  assert.equal(ledger.size, 0);
  assert.equal(ledger.admit({ ...first.review }).code, 'INVALID_INPUT', 'only reviews issued by the decoder are admitted');
  const broken = createReplayLedger({ nowSeconds: () => { throw new Error('clock'); } });
  assert.equal(broken.seen(first.review.requestId), true, 'an unusable clock fails closed');
  assert.equal(broken.admit(first.review).code, 'UNAVAILABLE');
  assert.throws(() => createReplayLedger({ nowSeconds: () => now, maxEntries: 0 }));
  assert.throws(() => createReplayLedger({ nowSeconds: () => now, retentionSeconds: 86_401 }), RangeError, 'retention is capped at 24 h');
  assert.throws(() => createReplayLedger({}));
});

test('an unsigned code reusing a public invite requestId cannot pre-poison the verified invite', async () => {
  const now = NOW + 5;
  const invite = await signed('pre-poison');
  const { signature: _removed, ...unsignedCopy } = plain(invite.envelope);
  const poison = (await decode(treeText(unsignedCopy))).review;
  const verified = (await decode(invite.text, { inviteVerifier: testVerifier() })).review;
  assert.equal(poison.requestId, verified.requestId); assert.equal(poison.authenticated, false); assert.equal(verified.authenticated, true);
  const ledger = createReplayLedger({ nowSeconds: () => now });
  assert.equal(ledger.admit(poison).ok, true);
  assert.deepEqual(ledger.admit(verified), { ok: true }, 'the verified invite replaces the unverified entry');
  assert.equal(ledger.size, 1);
  assert.equal(ledger.admit((await decode(invite.text, { inviteVerifier: testVerifier() })).review).code, 'REPLAYED', 'an authenticated replay is still refused');
  assert.equal(ledger.admit((await decode(treeText(unsignedCopy))).review).code, 'REPLAYED', 'an unsigned copy cannot displace it');
  // Two unauthenticated codes with one requestId stay a replay, and a verified entry first blocks later copies.
  const plainLedger = createReplayLedger({ nowSeconds: () => now });
  assert.equal(plainLedger.admit(poison).ok, true);
  assert.equal(plainLedger.admit((await decode(treeText(unsignedCopy))).review).code, 'REPLAYED');
  const firstLedger = createReplayLedger({ nowSeconds: () => now });
  assert.equal(firstLedger.admit(verified).ok, true);
  assert.equal(firstLedger.admit(poison).code, 'REPLAYED');
  // A verified review that has expired by commit time leaves the unverified entry in place.
  let later = NOW + 5;
  const expiring = createReplayLedger({ nowSeconds: () => later });
  assert.equal(expiring.admit(poison).ok, true);
  later = verified.expiresAt;
  assert.equal(expiring.admit(verified).code, 'EXPIRED');
  assert.equal(expiring.seen(poison.requestId), true);
});

test('far-future unsigned codes cannot lock a valid signed invite out of the ledger', async () => {
  let now = NOW + 5;
  const ledger = createReplayLedger({ nowSeconds: () => now, maxEntries: 2 });
  const flood = async label => (await decode((await make('public-address', label, { lifetimeSeconds: 10 * 365 * 86_400 })).text)).review;
  const a = await flood('flood-a'), b = await flood('flood-b');
  assert.ok(a.expiresAt - now > 300 * 86_400, 'sender-chosen far-future expiry');
  assert.equal(ledger.admit(a).ok, true); assert.equal(ledger.admit(b).ok, true);
  const invite = await signed('protected');
  const verified = (await decode(invite.text, { inviteVerifier: testVerifier() })).review;
  assert.equal(verified.authenticated, true);
  assert.deepEqual(ledger.admit(verified), { ok: true }, 'a full ledger of unsigned codes does not block a verified invite');
  for (let index = 0; index < 5; index++) assert.equal(ledger.admit(await flood(`flood-more-${index}`)).ok, true);
  assert.equal(ledger.admit((await decode(invite.text, { inviteVerifier: testVerifier() })).review).code, 'REPLAYED', 'the verified invite was never evicted');
  // Unsigned far-future entries are forgotten after the retention cap, not at their sender-chosen expiry.
  const solo = createReplayLedger({ nowSeconds: () => now });
  assert.equal(solo.admit(a).ok, true);
  now += 86_400 + MAX_FUTURE_SKEW_SECONDS - 1;
  assert.equal(solo.seen(a.requestId), true);
  now += 1;
  assert.equal(solo.seen(a.requestId), false);
  // When every entry is a live verified invite, admission refuses instead of evicting one.
  now = NOW + 5;
  const tight = createReplayLedger({ nowSeconds: () => now, maxEntries: 1 });
  assert.equal(tight.admit(verified).ok, true);
  assert.equal(tight.admit(await flood('flood-tight')).code, 'REPLAY_LEDGER_FULL');
});

test('codes without expiry are remembered for the retention window', async () => {
  const { text } = await make('public-address', 'retention');
  let now = NOW + 5;
  const ledger = createReplayLedger({ nowSeconds: () => now, retentionSeconds: 100 });
  const { review } = await decode(text);
  assert.equal(ledger.admit(review).ok, true);
  now += 100 + MAX_FUTURE_SKEW_SECONDS - 1;
  assert.equal(ledger.admit(review).code, 'REPLAYED');
  now += 1;
  assert.equal(ledger.admit(review).ok, true);
});

test('only a trade invite is authenticated, and only through an injected verifier', async () => {
  const invite = await signed();
  const none = await decode(invite.text);
  assert.equal(none.ok, true);
  assert.equal(none.review.authenticated, false, 'without a verifier a signed invite is unauthenticated');
  assert.equal(none.review.signature, 'unverified');
  assert.ok(none.review.warnings.includes('no-invite-verifier') && none.review.warnings.includes('unauthenticated'));
  const calls = [];
  const verified = await decode(invite.text, { inviteVerifier: testVerifier(calls) });
  assert.equal(verified.review.authenticated, true);
  assert.equal(verified.review.signature, 'verified');
  assert.equal(verified.review.expiryAuthenticated, true);
  assert.equal(verified.review.signatureProfile, TEST_PROFILE);
  assert.equal(verified.review.warnings.includes('unauthenticated') || verified.review.warnings.includes('expiry-advisory'), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].digest, Buffer.from(invite.digest).toString('hex'));
  assert.deepEqual({ ...calls[0].binding }, {
    ad: invite.envelope.payload.ad, author: TEST_BOUND_AUTHOR, orderId: hashHex('qr-order'), termsHash: invite.envelope.payload.termsHash,
    chain: EVM_CHAIN, requestId: invite.envelope.requestId, createdAt: invite.envelope.createdAt, expiresAt: invite.envelope.expiresAt,
    originHint: invite.envelope.originHint,
  });
  assert.equal(Object.isFrozen(calls[0].binding), true);
  const sized = verify => ({ profile: TEST_PROFILE, publicKeyBytes: 32, signatureBytes: 32, verify });
  await refused(invite.text, 'SIGNATURE_INVALID', { inviteVerifier: sized(async () => ({ ok: false })) });
  await refused(invite.text, 'SIGNATURE_INVALID', { inviteVerifier: sized(async () => 1) });
  await refused(invite.text, 'UNAVAILABLE', { inviteVerifier: sized(async () => { throw new Error('x'); }) });
  for (const bad of [{ verify: async () => true }, { profile: TEST_PROFILE, verify: async () => true }, { ...sized(async () => true), signatureBytes: 0 }, { ...sized(async () => true), publicKeyBytes: 129 }])
    await refused(invite.text, 'INVALID_INPUT', { inviteVerifier: bad });
  await refused(invite.text, 'INVALID_INPUT', { requireInviteSignature: true });
  await refused(invite.text, 'INVALID_INPUT', { inviteVerifier: testVerifier(), requireInviteSignature: 'yes' });
});

test('with a verifier, a stripped or relabelled invite signature is refused, not downgraded', async () => {
  const invite = await signed('strip');
  const { signature: _removed, ...stripped } = plain(invite.envelope);
  await refused(treeText(stripped), 'SIGNATURE_REQUIRED', { inviteVerifier: testVerifier() });
  await refused((await make('trade-invite', 'unsigned')).text, 'SIGNATURE_REQUIRED', { inviteVerifier: testVerifier() });
  const relabelled = { ...plain(invite.envelope), signature: { ...plain(invite.envelope.signature), profile: 'other-profile' } };
  await refused(treeText(relabelled), 'PROFILE_UNSUPPORTED', { inviteVerifier: testVerifier() });
  // Opting out keeps the review-only behaviour; without a verifier nothing changes.
  const reviewOnly = await decode(treeText(stripped), { inviteVerifier: testVerifier(), requireInviteSignature: false });
  assert.equal(reviewOnly.review.authenticated, false); assert.ok(reviewOnly.review.warnings.includes('unsigned-invite'));
  const unknown = await decode(treeText(relabelled), { inviteVerifier: testVerifier(), requireInviteSignature: false });
  assert.equal(unknown.review.authenticated, false); assert.ok(unknown.review.warnings.includes('signature-profile-unknown'));
  assert.equal((await decode(treeText(stripped))).review.authenticated, false);
  assert.equal((await decode(treeText(relabelled))).review.signature, 'unverified');
  // Non-invite types are unaffected by the requirement.
  assert.equal((await decode((await make('public-address', 'not-invite')).text, { inviteVerifier: testVerifier() })).ok, true);
});

test('the verifier must attest the key-to-author binding, and signature sizes are fixed per profile', async () => {
  const invite = await signed('binding');
  const sized = verify => ({ profile: TEST_PROFILE, publicKeyBytes: 32, signatureBytes: 32, verify });
  await refused(invite.text, 'SIGNATURE_INVALID', { inviteVerifier: sized(async () => true) });
  await refused(invite.text, 'SIGNATURE_INVALID', { inviteVerifier: sized(async () => ({ ok: true })) });
  await refused(invite.text, 'SIGNATURE_INVALID', { inviteVerifier: sized(async () => ({ ok: true, publicKey: TEST_PUBLIC_KEY, boundTo: hashHex('someone-else') })) });
  // The verifier must report the key it verified with; a missing or different key is refused.
  await refused(invite.text, 'SIGNATURE_INVALID', { inviteVerifier: sized(async () => ({ ok: true, boundTo: TEST_BOUND_AUTHOR })) });
  await refused(invite.text, 'SIGNATURE_INVALID', { inviteVerifier: sized(async () => ({ ok: true, publicKey: hashHex('other-key'), boundTo: TEST_BOUND_AUTHOR })) });
  await refused(invite.text, 'SIGNATURE_INVALID', { inviteVerifier: testVerifier([], { boundAuthor: hashHex('someone-else') }) });
  // UNSAFE, documented limit: a verifier that merely echoes its input passes, because the codec cannot see the
  // verifier's key registry. Until the invite key profile is decided, the key-to-author binding is the verifier's job.
  const echoing = sized(async ({ signature, binding }) => ({ ok: true, publicKey: signature.publicKey, boundTo: binding.author }));
  assert.equal((await decode(invite.text, { inviteVerifier: echoing })).review.authenticated, true, 'echoing verifier is not detectable by the codec');
  // A valid MAC under the test key over an invite for another author still fails: the key is not bound to that author.
  const foreign = (await createQrEnvelope({ ...INPUTS['trade-invite'], payload: { ...INPUTS['trade-invite'].payload, ad: adAddress(hashHex('qr-other-seller'), hashHex('qr-order')) } }, deps('codec/foreign'))).envelope;
  const digest = (await inviteSigningDigest(foreign, sha256)).digest;
  const signedForeign = attachInviteSignature(foreign, { profile: TEST_PROFILE, publicKey: TEST_PUBLIC_KEY, value: testSign(digest) }).envelope;
  await refused(treeText(plain(signedForeign)), 'SIGNATURE_INVALID', { inviteVerifier: testVerifier() });
  // Wrong sizes for the profile are refused before the verifier runs.
  const calls = [];
  for (const signature of [{ ...plain(invite.envelope.signature), value: `${invite.envelope.signature.value}00` }, { ...plain(invite.envelope.signature), publicKey: 'ab' }]) {
    await refused(treeText({ ...plain(invite.envelope), signature }), 'SIGNATURE_INVALID', { inviteVerifier: testVerifier(calls) });
  }
  assert.equal(calls.length, 0);
});

test('encodeQrText refuses an envelope that is already expired, inside the margin, or future-dated', async () => {
  const { envelope } = await make('trade-invite', 'encode-expiry');
  assert.equal((await encodeQrText(envelope, encodeDeps(envelope.expiresAt - EXPIRY_SAFETY_MARGIN_SECONDS - 1))).ok, true);
  assert.equal((await encodeQrText(envelope, encodeDeps(envelope.expiresAt - EXPIRY_SAFETY_MARGIN_SECONDS))).code, 'EXPIRED');
  assert.equal((await encodeQrText(envelope, encodeDeps(envelope.expiresAt + 1))).code, 'EXPIRED');
  assert.equal((await encodeQrText(envelope, encodeDeps(envelope.createdAt - MAX_FUTURE_SKEW_SECONDS - 1))).code, 'NOT_YET_VALID');
  assert.equal((await encodeQrText(envelope, { sha256 })).code, 'INVALID_INPUT', 'a clock is required');
  assert.equal((await encodeQrText(envelope, { sha256, nowSeconds: () => { throw new Error('clock'); } })).code, 'UNAVAILABLE');
  const address = (await make('public-address', 'encode-no-expiry')).envelope;
  assert.equal((await encodeQrText(address, encodeDeps(NOW + 10 * 365 * 86_400))).ok, true, 'codes without expiry stay encodable');
});

test('an originHint starting with www. is a hostname, not a URL', async () => {
  const { text } = await make('public-address', 'www', { originHint: 'www.offramp.example' });
  const result = await decode(text);
  assert.equal(result.ok, true); assert.equal(result.review.originHint, 'www.offramp.example');
  assert.ok(result.review.warnings.includes('origin-hint-display-only'));
});

test('a signature copied to another type, another invite or an altered invite fails', async () => {
  const invite = await signed('copy-source');
  const signature = plain(invite.envelope.signature);
  for (const type of ['public-address', 'payment-request', 'release-fingerprint', 'recovery-fingerprint']) {
    const { envelope } = await make(type, `copy-${type}`);
    await refused(treeText({ ...plain(envelope), signature }), 'SIGNATURE_UNSUPPORTED');
  }
  const otherInvite = (await make('trade-invite', 'copy-target')).envelope;
  await refused(treeText({ ...plain(otherInvite), signature }), 'SIGNATURE_INVALID', { inviteVerifier: testVerifier() });
  const altered = plain(invite.envelope);
  await refused(treeText({ ...altered, expiresAt: altered.expiresAt + 60 }), 'SIGNATURE_INVALID', { inviteVerifier: testVerifier() });
  await refused(treeText({ ...altered, chain: OTHER_EVM_CHAIN }), 'SIGNATURE_INVALID', { inviteVerifier: testVerifier() });
  await refused(treeText({ ...altered, originHint: null }), 'SIGNATURE_INVALID', { inviteVerifier: testVerifier() });
});

test('secret-bearing codes are refused, including wallet-session URIs and auth tokens', async () => {
  const { envelope } = await make('public-address', 'secrets');
  const base = plain(envelope);
  await refused(`wc:${hashHex('topic')}@2?relay-protocol=irn&symKey=${hashHex('key')}`, 'WALLET_SESSION_REFUSED');
  await refused('abandon ability able about above absent absorb abstract absurd abuse access accident', 'SECRET_REFUSED');
  await refused(`nsec1${'q'.repeat(58)}`, 'SECRET_REFUSED');
  await refused(`0x${hashHex('raw-key')}`, 'SECRET_REFUSED');
  for (const tree of [
    { ...base, payload: { ...base.payload, mnemonic: 'x' } }, { ...base, seed: 'x' }, { ...base, privateKey: 'x' },
    { ...base, payload: { ...base.payload, authToken: 'x' } }, { ...base, session: 'x' },
    { ...base, payload: { address: `wc:${hashHex('topic')}@2?relay-protocol=irn&symKey=${hashHex('key')}` } },
    { ...base, originHint: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from('{"sub":"1"}').toString('base64url')}.c2ln` },
    { ...base, originHint: `Bearer ${hashHex('t')}` }, { ...base, payload: { address: 'access_token=abc' } },
  ]) await refused(treeText(tree), 'SECRET_REFUSED');
});

test('URL codes and URL payloads are refused, never opened', async () => {
  const { envelope } = await make('public-address', 'urls');
  for (const value of ['https://offramp.example/invite?id=1', 'HTTP://OFFRAMP.EXAMPLE', 'ethereum:0x0000000000000000000000000000000000000001@1?value=1', 'bitcoin:bc1qxyz', 'javascript:alert(1)'])
    await refused(value, 'URL_REFUSED');
  await refused(treeText({ ...plain(envelope), payload: { address: 'https://offramp.example' } }), 'URL_REFUSED');
  await refused(treeText({ ...plain(envelope), originHint: 'https://offramp.example' }), 'INVALID_ENVELOPE', 'originHint has strict hostname syntax');
  await refused('HELLO WORLD', 'FORMAT_UNSUPPORTED');
  await refused('', 'FORMAT_UNSUPPORTED');
});

test('truncated and damaged text is refused', async () => {
  const { envelope, text } = await make('payment-request', 'damage');
  await refused(text.slice(0, -1), 'INVALID_ENCODING');
  await refused(text.slice(0, -3), 'INVALID_JSON');
  await refused(text.slice(0, QR_TEXT_PREFIX.length + 30), 'INVALID_JSON');
  await refused(QR_TEXT_PREFIX, 'INVALID_JSON');
  await refused(`${text.slice(0, -1)}a`, 'INVALID_ENCODING');
  await refused(`${text} `, 'INVALID_ENCODING');
  await refused(`${text}\n`, 'INVALID_ENCODING');
  // Single-character damage anywhere in the payload or its hash never yields a valid code.
  const canonical = canonicalize(envelope);
  const start = canonical.indexOf('"payload":'), end = canonical.indexOf(',"protocol":');
  const body = text.slice(QR_TEXT_PREFIX.length), A = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  let tried = 0;
  for (let at = Math.floor(start / 2) * 3; at < Math.ceil(end / 2) * 3 && at < body.length; at++) {
    for (const replacement of [A[(A.indexOf(body[at]) + 1) % 45], A[(A.indexOf(body[at]) + 17) % 45]]) {
      const damaged = QR_TEXT_PREFIX + body.slice(0, at) + replacement + body.slice(at + 1);
      const result = await decode(damaged);
      assert.equal(result.ok, false, `damage at ${at} decoded`);
      tried++;
    }
  }
  assert.ok(tried > 300);
});

test('decoding never navigates, signs, stores or touches the network', async () => {
  const touched = [];
  const names = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'open', 'location', 'navigator', 'localStorage', 'indexedDB'];
  const saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, get() { touched.push(name); throw new Error(`${name} touched`); } });
  try {
    const invite = await signed('no-side-effects');
    for (const text of [invite.text, (await make('payment-request', 'no-side-effects')).text, 'https://offramp.example', `wc:${hashHex('t')}@2`]) {
      await decode(text);
      await decode(text, { inviteVerifier: testVerifier() });
    }
  } finally {
    for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
  assert.deepEqual(touched, []);
});

test('context is validated and every refusal leaves inputs untouched', async () => {
  const { text } = await make('public-address', 'context');
  for (const bad of [null, {}, { ...context(), sha256: null }, { ...context(), chains: 'evm:1' }, { ...context(), chains: ['https://x'] }, { ...context(), nowSeconds: 1 }])
    assert.equal((await decodeQrText(text, bad)).code, 'INVALID_INPUT');
  assert.equal((await decodeQrText(42, context())).code, 'INVALID_INPUT');
  assert.equal((await decodeQrText(text, { ...context(), sha256: async () => { throw new Error('x'); } })).code, 'UNAVAILABLE');
  const chains = [...CHAINS];
  await decodeQrText(text, context({ chains }));
  assert.deepEqual(chains, [...CHAINS]);
});
