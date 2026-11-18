import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createQrEnvelope, parseQrEnvelope, attachInviteSignature, inviteSigningDigest, inviteSigningMessage, envelopeBytes, canonicalize,
  payloadDigestHex, parseAdReference, isSecretLike, isSecretLikeText, isSecretLikeHostname, isSecretKeyName, isUrlLike, QR_TYPES, INVITE_SIGNING_DOMAIN,
  DEFAULT_INVITE_LIFETIME_SECONDS, MAX_INVITE_LIFETIME_SECONDS, MIN_INVITE_LIFETIME_SECONDS, MAX_ENVELOPE_BYTES,
} from '../index.ts';
import { parseAdAddress } from '../../exchange/index.ts';
import { INPUTS, NOW, deps, sha256, hashHex, evmAddress, solanaKey, SOLANA_CHAIN, EVM_CHAIN, TEST_PROFILE, TEST_PUBLIC_KEY, testSign } from './helpers.mjs';

const create = (input, label = 'envelope-test') => createQrEnvelope(input, deps(label));
const plain = value => JSON.parse(canonicalize(value));

test('each allowed type builds a frozen exact-key envelope with the D6 field set', async () => {
  assert.deepEqual([...QR_TYPES].sort(), ['payment-request', 'public-address', 'recovery-fingerprint', 'release-fingerprint', 'trade-invite']);
  for (const [type, input] of Object.entries(INPUTS)) {
    const result = await create(input, type);
    assert.equal(result.ok, true, `${type}: ${result.code}`);
    const { envelope } = result;
    assert.deepEqual(Object.keys(envelope).sort(), ['chain', 'createdAt', 'expiresAt', 'originHint', 'payload', 'payloadSha256', 'protocol', 'requestId', 'type', 'v']);
    assert.equal(envelope.protocol, 'p2p-offramp-qr'); assert.equal(envelope.v, 1); assert.equal(envelope.type, type);
    assert.match(envelope.requestId, /^[0-9a-f]{32}$/);
    assert.equal(envelope.createdAt, NOW);
    assert.equal(envelope.payloadSha256, createHash('sha256').update(canonicalize(input.payload)).digest('hex'));
    assert.equal(Object.isFrozen(envelope), true); assert.equal(Object.isFrozen(envelope.payload), true);
    assert.equal(parseQrEnvelope(envelope).ok, true);
  }
});

test('requestId is 16 bytes from the injected random source; a short or failing source is refused', async () => {
  const fixed = Uint8Array.from({ length: 16 }, (_, index) => index);
  const result = await createQrEnvelope(INPUTS['public-address'], { sha256, nowSeconds: () => NOW, randomBytes: () => fixed });
  assert.equal(result.envelope.requestId, '000102030405060708090a0b0c0d0e0f');
  assert.equal((await createQrEnvelope(INPUTS['public-address'], { sha256, nowSeconds: () => NOW, randomBytes: () => new Uint8Array(15) })).code, 'UNAVAILABLE');
  assert.equal((await createQrEnvelope(INPUTS['public-address'], { sha256, nowSeconds: () => NOW })).code, 'INVALID_INPUT');
  assert.equal((await createQrEnvelope(INPUTS['public-address'], { ...deps(), sha256: async () => { throw new Error('down'); } })).code, 'UNAVAILABLE');
  assert.equal((await createQrEnvelope(INPUTS['public-address'], { ...deps(), sha256: async () => new Uint8Array(31) })).code, 'UNAVAILABLE');
});

test('invite expiry is mandatory: default 10 minutes, at most 24 hours; other types default to no expiry', async () => {
  const invite = (await create(INPUTS['trade-invite'])).envelope;
  assert.equal(invite.expiresAt - invite.createdAt, DEFAULT_INVITE_LIFETIME_SECONDS);
  assert.equal(DEFAULT_INVITE_LIFETIME_SECONDS, 600); assert.equal(MAX_INVITE_LIFETIME_SECONDS, 86_400);
  assert.equal((await create({ ...INPUTS['trade-invite'], lifetimeSeconds: MAX_INVITE_LIFETIME_SECONDS })).ok, true);
  assert.equal((await create({ ...INPUTS['trade-invite'], lifetimeSeconds: MAX_INVITE_LIFETIME_SECONDS + 1 })).code, 'LIFETIME_EXCEEDED');
  assert.equal((await create({ ...INPUTS['trade-invite'], lifetimeSeconds: MIN_INVITE_LIFETIME_SECONDS - 1 })).code, 'INVALID_INPUT');
  assert.equal((await create({ ...INPUTS['trade-invite'], lifetimeSeconds: null })).envelope.expiresAt, NOW + 600, 'null means the invite default');
  assert.equal((await create(INPUTS['public-address'])).envelope.expiresAt, null);
  assert.equal(parseQrEnvelope({ ...plain(invite), expiresAt: null }).code, 'INVALID_ENVELOPE');
  assert.equal(parseQrEnvelope({ ...plain(invite), expiresAt: invite.createdAt + 86_401 }).code, 'LIFETIME_EXCEEDED');
  assert.equal(parseQrEnvelope({ ...plain(invite), expiresAt: invite.createdAt }).code, 'INVALID_ENVELOPE');
});

test('a trade invite points to the advertisement and terms hash only; the ad format matches packages/exchange', async () => {
  const invite = (await create(INPUTS['trade-invite'])).envelope;
  assert.deepEqual(Object.keys(invite.payload).sort(), ['ad', 'termsHash']);
  const ours = parseAdReference(invite.payload.ad), theirs = parseAdAddress(invite.payload.ad);
  assert.deepEqual({ ...ours }, { ...theirs });
  for (const ad of [`30078:${'A'.repeat(64)}:p2p-offramp:v1:${hashHex('o')}`, `30078:${hashHex('a')}:p2p-offramp:v2:${hashHex('o')}`, `30079:${hashHex('a')}:p2p-offramp:v1:${hashHex('o')}`]) {
    assert.equal(parseAdReference(ad), null); assert.equal(parseAdAddress(ad), null);
    assert.equal((await create({ ...INPUTS['trade-invite'], payload: { ...INPUTS['trade-invite'].payload, ad } })).code, 'INVALID_PAYLOAD');
  }
  for (const extra of [{ terms: 'price=1' }, { price: '1' }, { paymentInstructions: 'IBAN' }])
    assert.equal((await create({ ...INPUTS['trade-invite'], payload: { ...INPUTS['trade-invite'].payload, ...extra } })).code, 'FIELD_UNSUPPORTED');
});

test('payload schemas are exact and chain-aware', async () => {
  const ok = async input => (await create(input)).ok;
  const code = async input => (await create(input)).code;
  assert.equal(await ok({ type: 'public-address', chain: SOLANA_CHAIN, payload: { address: solanaKey('sol') } }), true);
  assert.equal(await code({ type: 'public-address', chain: SOLANA_CHAIN, payload: { address: evmAddress('x') } }), 'INVALID_PAYLOAD');
  assert.equal(await code({ type: 'public-address', chain: EVM_CHAIN, payload: { address: solanaKey('sol') } }), 'INVALID_PAYLOAD');
  assert.equal(await code({ type: 'public-address', chain: EVM_CHAIN, payload: { address: `0x${'0'.repeat(40)}` } }), 'INVALID_PAYLOAD');
  assert.equal(await code({ type: 'public-address', chain: SOLANA_CHAIN, payload: { address: '1'.repeat(32) } }), 'INVALID_PAYLOAD');
  assert.equal(await code({ type: 'public-address', chain: EVM_CHAIN, payload: { address: evmAddress('x').toUpperCase().replace('0X', '0x') } }), 'INVALID_PAYLOAD');
  assert.equal(await code({ type: 'public-address', chain: null, payload: { address: evmAddress('x') } }), 'INVALID_ENVELOPE');
  assert.equal(await code({ type: 'public-address', chain: 'evm:01', payload: { address: evmAddress('x') } }), 'INVALID_ENVELOPE');
  assert.equal(await code({ type: 'public-address', chain: 'bitcoin:mainnet', payload: { address: evmAddress('x') } }), 'INVALID_ENVELOPE');
  const pay = INPUTS['payment-request'];
  for (const amount of ['0', '01', '-1', '1.5', '1e18', ' 1', (2n ** 256n).toString()]) assert.equal(await code({ ...pay, payload: { ...pay.payload, amount } }), 'INVALID_PAYLOAD', amount);
  assert.equal(await code({ ...pay, payload: { ...pay.payload, amount: 1 } }), 'INVALID_PAYLOAD');
  assert.equal(await ok({ ...pay, payload: { ...pay.payload, amount: (2n ** 256n - 1n).toString() } }), true);
  assert.equal(await code({ type: 'payment-request', chain: SOLANA_CHAIN, payload: { recipient: solanaKey('r'), asset: 'native', amount: (2n ** 64n).toString() } }), 'INVALID_PAYLOAD');
  assert.equal(await ok({ type: 'payment-request', chain: SOLANA_CHAIN, payload: { recipient: solanaKey('r'), asset: solanaKey('mint'), amount: (2n ** 64n - 1n).toString() } }), true);
  assert.equal(await code({ ...pay, payload: { recipient: pay.payload.recipient, amount: '1' } }), 'INVALID_PAYLOAD');
  const release = INPUTS['release-fingerprint'];
  assert.equal(await code({ ...release, chain: EVM_CHAIN }), 'INVALID_ENVELOPE');
  for (const change of [{ sequence: 0 }, { sequence: '7' }, { channel: 'Test Net' }, { releaseId: '../x' }, { manifestSha256: hashHex('m').toUpperCase() }])
    assert.equal(await code({ ...release, payload: { ...release.payload, ...change } }), 'INVALID_PAYLOAD', JSON.stringify(change));
  assert.equal(await code({ ...release, payload: { ...release.payload, sequence: 1.5 } }), 'INVALID_INPUT', 'floats are outside the canonical domain');
  const recovery = INPUTS['recovery-fingerprint'];
  assert.equal(await code({ ...recovery, payload: { ...recovery.payload, format: 'p2p-offramp-backup/v2' } }), 'INVALID_PAYLOAD');
  assert.equal(await code({ ...recovery, payload: { ...recovery.payload, byteLength: 12 * 1024 * 1024 + 1 } }), 'INVALID_PAYLOAD');
  assert.equal(await code({ ...recovery, payload: { format: 'p2p-offramp/offline-recovery-references/v1', byteLength: 128 * 1024 + 1, sha256: hashHex('r') } }), 'INVALID_PAYLOAD');
  assert.equal(await code({ ...recovery, payload: { ...recovery.payload, ciphertext: 'AAAA' } }), 'FIELD_UNSUPPORTED');
  assert.equal(await code({ ...INPUTS['public-address'], originHint: 'Offramp.Example' }), 'INVALID_ENVELOPE');
  assert.equal(await code({ ...INPUTS['public-address'], originHint: 'offramp.example/path' }), 'INVALID_ENVELOPE');
  assert.equal(await code({ ...INPUTS['public-address'], extra: 1 }), 'FIELD_UNSUPPORTED');
});

test('secret-bearing fields and values are refused before hashing, including wallet-session URIs and auth tokens', async () => {
  let hashed = 0;
  const counting = { ...deps(), sha256: async bytes => { hashed++; return sha256(bytes); } };
  const address = INPUTS['public-address'];
  const fields = ['seed', 'mnemonic', 'seedPhrase', 'privateKey', 'private_key', 'secretKey', 'nsec', 'xprv', 'wif', 'password', 'passphrase',
    'authToken', 'accessToken', 'apiKey', 'sessionUri', 'walletConnectUri', 'bearer', 'cookie', 'jwt', 'credentials', 'keystore', 'entropy', 'symKey'];
  for (const name of fields) {
    assert.equal(isSecretKeyName(name), true, name);
    assert.equal((await createQrEnvelope({ ...address, payload: { ...address.payload, [name]: 'x' } }, counting)).code, 'SECRET_REFUSED', name);
  }
  const values = [
    `wc:${hashHex('topic')}@2?relay-protocol=irn&symKey=${hashHex('key')}`, `WC:${hashHex('topic')}@1?bridge=x&key=y`, `see wc:${hashHex('t')}@2`,
    `nsec1${'q'.repeat(58)}`, `xprv9s21ZrQH143K${'a'.repeat(95)}`, `see xprv9s21ZrQH143K${'a'.repeat(95)}`, '-----BEGIN EC PRIVATE KEY-----',
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from('{"sub":"1"}').toString('base64url')}.c2ln`, `Bearer ${hashHex('t')}`,
    'access_token=abc', '?token=abc', 'api_key: abc', `0x${hashHex('k')}`, `5${'H'.repeat(50)}`, `${solanaKey('a')}${solanaKey('b')}`,
    'abandon ability able about above absent absorb abstract absurd abuse access accident',
  ];
  for (const value of values) {
    assert.equal(isSecretLike(value), true, value);
    assert.equal((await createQrEnvelope({ ...address, payload: { address: value } }, counting)).code, 'SECRET_REFUSED', value);
  }
  assert.equal(hashed, 0, 'no secret reached the hash provider');
  // Public values never trip the heuristics, even a Solana key that happens to contain a secret-key prefix.
  for (const value of [evmAddress('a'), solanaKey('a'), hashHex('a'), 'native', INPUTS['trade-invite'].payload.ad, 'p2p-offramp-backup/v1', 'v0.12.4-rc.1', 'offramp.example',
    `xprv${solanaKey('a').slice(4)}`, `nsec1${'q'.repeat(39)}`])
    assert.equal(isSecretLike(value), false, value);
  for (let index = 0; index < 2000; index++) assert.equal(isSecretLike(solanaKey(`random-${index}`)), false);
  for (const name of ['address', 'recipient', 'asset', 'amount', 'ad', 'termsHash', 'channel', 'releaseId', 'sequence', 'manifestSha256', 'format', 'byteLength', 'sha256',
    'protocol', 'v', 'type', 'requestId', 'createdAt', 'expiresAt', 'chain', 'originHint', 'payload', 'payloadSha256', 'signature', 'profile', 'publicKey', 'value'])
    assert.equal(isSecretKeyName(name), false, name);
});

test('secrets split by separators in text slots, and mnemonics in any case or separator, are refused', async () => {
  const release = INPUTS['release-fingerprint'];
  const base58 = solanaKey('wif-like') + solanaKey('wif-like-2');
  const bech32 = Array.from(Buffer.from(hashHex('nsec-data') + hashHex('nsec-data-2'), 'hex'), byte => 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'[byte & 31]).join('').slice(0, 58);
  assert.match(bech32, /[0l]/, 'contains characters outside base58');
  const hex = hashHex('raw-key');
  for (const releaseId of [`5${base58.slice(0, 25)}-${base58.slice(25, 50)}`, bech32.slice(0, 29) + '-' + bech32.slice(29), hex, `${hex.slice(0, 32)}.${hex.slice(32)}`, `k-${hex.slice(0, 20)}-${hex.slice(20, 40)}`]) {
    assert.equal(isSecretLikeText(releaseId), true, releaseId);
    assert.equal((await create({ ...release, payload: { ...release.payload, releaseId } })).code, 'SECRET_REFUSED', releaseId);
  }
  assert.equal((await create({ ...release, payload: { ...release.payload, channel: hex } })).code, 'SECRET_REFUSED');
  assert.equal((await create({ ...INPUTS['public-address'], originHint: `${hex.slice(0, 32)}.example` })).code, 'SECRET_REFUSED');
  for (const releaseId of ['v0.12.4-rc.1', 'build-2026.11.18', 'rc1_abcdef1', `v${'x'.repeat(39)}`])
    assert.equal((await create({ ...release, payload: { ...release.payload, releaseId } })).ok, true, releaseId);
  assert.equal((await create({ ...release, payload: { ...release.payload, releaseId: `v${'x'.repeat(40)}` } })).code, 'INVALID_PAYLOAD', 'releaseId is at most 40 characters');
  const words = 'abandon ability able about above absent absorb abstract absurd abuse access accident'.split(' ');
  for (const phrase of [words.join(' ').toUpperCase(), words.join(','), words.join(', '), words.map(word => word[0].toUpperCase() + word.slice(1)).join('-'), words.join('.')]) {
    assert.equal(isSecretLike(phrase), true, phrase);
    assert.equal((await create({ ...INPUTS['public-address'], payload: { address: phrase } })).code, 'SECRET_REFUSED', phrase);
  }
  for (const value of ['offramp.example', 'www.offramp.example', 'v0.12.4-rc.1', 'testnet', 'a.b.c.d.example']) assert.equal(isSecretLikeText(value), false, value);
});

test('originHint keeps strict hostname syntax but skips base58/mnemonic heuristics; a git SHA-1 releaseId is allowed', async () => {
  // A v3 onion name: 56 base32 characters. This one avoids `l`, so its compacted form is a 61-character base58 run
  // that the generic text-slot heuristic would have refused.
  const onion = `${Array.from(Buffer.from(hashHex('onion-1') + hashHex('onion-2'), 'hex'), byte => 'abcdefghijkmnopqrstuvwxyz234567'[byte % 31]).join('').slice(0, 56)}.onion`;
  assert.equal(isSecretLikeText(onion), true, 'the generic text-slot heuristic misfires on this onion name');
  const long = ['x'.repeat(60), 'y'.repeat(60), 'z'.repeat(60), 'example'].join('.');
  const dotted = 'abandon.ability.able.about.above.absent.absorb.abstract.absurd.abuse.access.accident.example';
  for (const originHint of [onion, long, dotted]) {
    assert.equal(isSecretLikeHostname(originHint), false, originHint);
    assert.equal((await create({ ...INPUTS['public-address'], originHint })).ok, true, originHint);
  }
  const hex = hashHex('hint-key');
  for (const originHint of [`${hex.slice(0, 32)}.${hex.slice(32)}.example`, `nsec1${'q'.repeat(58)}.example`])
    assert.equal((await create({ ...INPUTS['public-address'], originHint })).code, 'SECRET_REFUSED', originHint);
  // Release ids: the manifest keeps the commit in sourceCommit, but a release may be named by its git SHA-1.
  const release = INPUTS['release-fingerprint'];
  const sha1 = hashHex('commit').slice(0, 40);
  assert.equal((await create({ ...release, payload: { ...release.payload, releaseId: sha1 } })).ok, true, 'a 40-hex git SHA-1 releaseId is allowed');
  assert.equal((await create({ ...release, payload: { ...release.payload, releaseId: `${sha1}0` } })).code, 'SECRET_REFUSED', '41 hex is not a commit id');
  assert.equal((await create({ ...release, payload: { ...release.payload, releaseId: sha1.toUpperCase() } })).code, 'SECRET_REFUSED', 'only the lowercase form');
  assert.equal((await create({ ...release, payload: { ...release.payload, releaseId: hashHex('commit') } })).code, 'SECRET_REFUSED', 'a 64-hex id is indistinguishable from a raw key');
});

test('URL payloads are refused, not carried', async () => {
  const address = INPUTS['public-address'];
  for (const value of ['https://offramp.example', 'http://x', 'javascript:alert(1)', 'data:text/html,x', 'ethereum:0xabc', '//offramp.example', 'www.offramp.example', 'ipfs://cid'])
    assert.equal(isUrlLike(value), true, value);
  assert.equal((await create({ ...address, payload: { address: 'https://offramp.example/a' } })).code, 'URL_REFUSED');
  assert.equal((await create({ ...address, originHint: 'https://offramp.example' })).code, 'INVALID_ENVELOPE', 'originHint has strict hostname syntax');
  assert.equal((await create({ ...address, originHint: 'www.offramp.example' })).ok, true, 'a www. hostname is not refused as a URL');
  assert.equal((await create({ ...address, chain: 'https://evil' })).code, 'INVALID_ENVELOPE', 'the chain slot has its own strict syntax');
  assert.equal(isUrlLike(EVM_CHAIN), true, 'chain ids are scheme-like, so only the chain slot is exempt from the URL check');
  assert.equal((await create({ ...address, chain: `wc:${hashHex('t')}@2` })).code, 'SECRET_REFUSED', 'the chain slot is still secret-scanned');
  assert.equal((await create(address)).ok, true);
});

test('the invite signing digest is domain separated, omits the signature and binds every wrapper field', async () => {
  const invite = (await create(INPUTS['trade-invite'], 'digest')).envelope;
  const message = inviteSigningMessage(invite), domain = Buffer.from(INVITE_SIGNING_DOMAIN);
  assert.equal(INVITE_SIGNING_DOMAIN, 'p2p-offramp-qr/v1/trade-invite/signing-digest');
  assert.deepEqual(Buffer.from(message.subarray(0, domain.length)), domain);
  assert.equal(message[domain.length], 0);
  assert.equal(Buffer.from(message.subarray(domain.length + 1)).toString(), canonicalize(invite));
  const digest = await inviteSigningDigest(invite, sha256);
  assert.equal(Buffer.from(digest.digest).toString('hex'), createHash('sha256').update(message).digest('hex'));
  const signed = attachInviteSignature(invite, { profile: TEST_PROFILE, publicKey: TEST_PUBLIC_KEY, value: testSign(digest.digest) });
  assert.equal(signed.ok, true);
  assert.deepEqual((await inviteSigningDigest(signed.envelope, sha256)).digest, digest.digest, 'signature is omitted from the digest');
  for (const change of [{ requestId: hashHex('other').slice(0, 32) }, { expiresAt: invite.expiresAt + 1 }, { createdAt: invite.createdAt - 1 }, { chain: 'evm:1' }, { originHint: 'other.example' }, { originHint: null }]) {
    const other = await inviteSigningDigest({ ...plain(invite), ...change }, sha256);
    assert.equal(other.ok, true);
    assert.notDeepEqual(other.digest, digest.digest, JSON.stringify(change));
  }
  for (const type of QR_TYPES.filter(type => type !== 'trade-invite')) {
    const envelope = (await create(INPUTS[type], type)).envelope;
    assert.equal((await inviteSigningDigest(envelope, sha256)).code, 'SIGNATURE_UNSUPPORTED', type);
    assert.equal(attachInviteSignature(envelope, signed.envelope.signature).code, 'SIGNATURE_UNSUPPORTED', type);
    assert.equal(parseQrEnvelope({ ...plain(envelope), signature: plain(signed.envelope.signature) }).code, 'SIGNATURE_UNSUPPORTED', type);
    assert.throws(() => inviteSigningMessage(envelope));
  }
  assert.equal((await inviteSigningDigest({ ...plain(invite), payloadSha256: hashHex('x') }, sha256)).code, 'HASH_MISMATCH');
});

test('signature structure is opaque but bounded; no key type is chosen here', async () => {
  const invite = (await create(INPUTS['trade-invite'], 'sig-shape')).envelope;
  const attach = signature => attachInviteSignature(invite, signature);
  assert.equal(attach({ profile: 'any-future-profile', publicKey: 'ab', value: 'cd' }).ok, true);
  for (const signature of [{ profile: 'Upper', publicKey: 'ab', value: 'cd' }, { profile: 'p', publicKey: 'AB', value: 'cd' }, { profile: 'p', publicKey: 'abc', value: 'cd' },
    { profile: 'p', publicKey: 'ab'.repeat(129), value: 'cd' }, { profile: 'p', publicKey: 'ab', value: 'cd'.repeat(1025) }, { profile: 'p', publicKey: 'ab', value: '' }])
    assert.equal(attach(signature).code, 'INVALID_ENVELOPE', JSON.stringify(signature).slice(0, 60));
  assert.equal(attach({ profile: 'p', publicKey: 'ab', value: 'cd', keyUrl: 'x' }).code, 'FIELD_UNSUPPORTED');
  assert.equal(attach({ profile: 'p', publicKey: 'ab', value: 'cd', privateKey: 'x' }).code, 'SECRET_REFUSED');
});

test('envelopes over 2,048 canonical bytes cannot be created', async () => {
  const invite = (await create(INPUTS['trade-invite'], 'big')).envelope;
  const base = envelopeBytes(attachInviteSignature(invite, { profile: 'p', publicKey: 'ab', value: 'cd' }).envelope).length;
  const value = 'cd'.repeat(Math.floor((MAX_ENVELOPE_BYTES - base) / 2) + 2);
  const big = attachInviteSignature(invite, { profile: 'p', publicKey: 'ab', value });
  assert.equal(big.ok, true);
  assert.ok(envelopeBytes(big.envelope).length > MAX_ENVELOPE_BYTES);
  assert.equal(await payloadDigestHex(sha256, invite.payload), invite.payloadSha256);
});

test('caller objects with accessors, proxies or non-plain prototypes are refused without invoking getters', async () => {
  let invoked = 0;
  const payload = Object.defineProperty({}, 'address', { enumerable: true, get() { invoked++; return evmAddress('x'); } });
  assert.equal((await create({ type: 'public-address', chain: EVM_CHAIN, payload })).code, 'INVALID_INPUT');
  class Payload { constructor() { this.address = evmAddress('x'); } }
  assert.equal((await create({ type: 'public-address', chain: EVM_CHAIN, payload: new Payload() })).code, 'INVALID_INPUT');
  assert.equal((await create({ type: 'public-address', chain: EVM_CHAIN, payload: { address: evmAddress('x') }, originHint: undefined })).code, 'INVALID_INPUT');
  assert.equal(invoked, 0);
});
