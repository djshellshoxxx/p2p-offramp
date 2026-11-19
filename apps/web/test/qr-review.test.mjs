import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createQrReviewController } from '../src/qr/review-controller.ts';
import { CandidateAttemptAdmission } from '../src/content-policy/local-policy.ts';
import { createQrEnvelope, encodeQrText, MAX_QR_TEXT_LENGTH } from '../../../packages/qr/index.ts';
import { INPUTS, NOW, CHAINS, deps, sha256, seededRandom } from '../../../packages/qr/test/helpers.mjs';

const backupFixture = JSON.parse(await readFile(new URL('../../../packages/storage/test/fixtures/vault-python-v1.json', import.meta.url), 'utf8'));
const backup = { format: 'p2p-offramp-backup', version: 1, envelope: backupFixture.envelope,
  checksum: createHash('sha256').update(JSON.stringify(backupFixture.envelope)).digest('hex') };
const backupBytes = new TextEncoder().encode(JSON.stringify(backup));
const file = bytes => ({ size: bytes.byteLength, arrayBuffer: async () => Uint8Array.from(bytes).buffer });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function textFor(type, label = type) {
  const created = await createQrEnvelope(INPUTS[type], deps(label));
  assert.equal(created.ok, true);
  const encoded = await encodeQrText(created.envelope, { sha256, nowSeconds: () => NOW });
  assert.equal(encoded.ok, true); return encoded.text;
}
function fixture(options = {}) {
  let scope = 'profile-0', chains = [...CHAINS], now = NOW + 5;
  const controller = createQrReviewController({ context: () => ({ scope, chains }), sha256,
    nowSeconds: () => now, randomBytes: seededRandom('app-qr'), admission: new CandidateAttemptAdmission(() => 0), ...options });
  return { controller, scope: value => { scope = value; }, chains: value => { chains = value; }, now: value => { now = value; } };
}

test('all five public QR types get complete unauthenticated review and explicit no-authority confirmation', async () => {
  const { controller } = fixture();
  for (const type of Object.keys(INPUTS)) {
    assert.deepEqual(await controller.reviewText(await textFor(type)), { ok: true });
    const before = controller.getSnapshot();
    assert.equal(before.phase, 'review'); assert.equal(before.review.type, type);
    assert.equal(before.review.authenticated, false); assert.equal(before.review.authority, 'none');
    assert.equal(before.comparison, null); assert.equal(before.confirmed, false);
    assert.deepEqual(await controller.confirm(), { ok: true });
    assert.equal(controller.getSnapshot().confirmed, true);
    assert.equal(controller.getSnapshot().review.authenticated, false);
    controller.cancel();
  }
  controller.dispose();
});

test('default context rejects chain-bound codes; unsupported inputs never produce a review', async () => {
  const f = fixture(); f.chains([]);
  assert.equal((await f.controller.reviewText(await textFor('payment-request'))).code, 'CHAIN_UNSUPPORTED');
  for (const [value, code] of [['https://example.test/', 'URL_REFUSED'], ['wc:session', 'WALLET_SESSION_REFUSED'],
    ['X'.repeat(MAX_QR_TEXT_LENGTH + 1), 'QR_TOO_LARGE']]) {
    assert.equal((await f.controller.reviewText(value)).code, code);
    assert.equal(f.controller.getSnapshot().review, null);
  }
  f.controller.dispose();
});

test('file admission precedes reads, exact text is never trimmed and all bytes are wiped after use', async () => {
  const { controller } = fixture(); let reads = 0;
  assert.equal((await controller.readEnvelopeFile({ size: 65537, async arrayBuffer() { reads++; return new ArrayBuffer(0); } })).code, 'FILE_TOO_LARGE');
  assert.equal(reads, 0);
  const text = await textFor('recovery-fingerprint', 'untrimmed');
  const bytes = new TextEncoder().encode(text + '\n');
  assert.equal((await controller.readEnvelopeFile({ size: bytes.length, async arrayBuffer() { reads++; return bytes.buffer; } })).code, 'INVALID_ENCODING');
  assert.ok(bytes.every(byte => byte === 0)); assert.equal(reads, 1);
  assert.equal((await controller.readEnvelopeFile(file(new TextEncoder().encode(text)))).ok, true);
  controller.dispose();
});

test('cancel retains the physical file slot across remounts and suppresses every late result', async () => {
  const first = fixture().controller, second = fixture().controller, read = deferred();
  const text = await textFor('recovery-fingerprint', 'late-file');
  const bytes = new TextEncoder().encode(text);
  const pending = first.readEnvelopeFile({ size: bytes.length, arrayBuffer: () => read.promise });
  first.dispose();
  assert.equal((await second.readEnvelopeFile(file(bytes))).code, 'BUSY');
  read.resolve(bytes.buffer);
  assert.equal((await pending).code, 'CANCELLED'); assert.ok(bytes.every(byte => byte === 0));
  assert.equal(first.getSnapshot().review, null);
  assert.equal((await second.readEnvelopeFile(file(new TextEncoder().encode(text)))).ok, true);
  second.dispose();
});

test('late hash, context change, expiry and local replay cannot revive a reviewed selection', async () => {
  const hashing = deferred(); let hold = false;
  const f = fixture({ sha256: bytes => hold ? hashing.promise : sha256(bytes) });
  const text = await textFor('payment-request', 'revalidation');
  assert.equal((await f.controller.reviewText(text)).ok, true);
  f.now(NOW + 850);
  assert.equal((await f.controller.confirm()).code, 'EXPIRED');
  f.now(NOW + 5);
  assert.equal((await f.controller.reviewText(text)).ok, true);
  f.scope('profile-1');
  assert.equal((await f.controller.confirm()).code, 'CONTEXT_CHANGED');
  assert.equal(f.controller.getSnapshot().review, null);
  assert.equal((await f.controller.reviewText(text)).ok, true);
  assert.equal((await f.controller.confirm()).ok, true);
  assert.equal((await f.controller.reviewText(text)).code, 'REPLAYED');
  hold = true;
  const pending = f.controller.reviewText(await textFor('release-fingerprint'));
  f.controller.cancel(); hashing.resolve(new Uint8Array(32));
  assert.equal((await pending).code, 'CANCELLED'); assert.equal(f.controller.getSnapshot().review, null);
  f.controller.dispose();
});

test('backup fingerprint is exact opaque bytes, compares only after review, never decrypts or restores', async () => {
  assert.ok(backupBytes.length > 50, 'use the independently derived backup fixture');
  const { controller } = fixture();
  assert.equal((await controller.createFingerprint(file(backupBytes), 'p2p-offramp-backup/v1')).ok, true);
  const review = controller.getSnapshot().review;
  assert.equal(review.type, 'recovery-fingerprint');
  assert.equal(review.payload.byteLength, backupBytes.length);
  assert.equal(review.payload.sha256, createHash('sha256').update(backupBytes).digest('hex'));
  assert.equal(JSON.stringify(review).includes('fixture only password'), false);
  assert.equal((await controller.compareFingerprint(file(backupBytes))).code, 'REVIEW_REQUIRED');
  assert.equal((await controller.confirm()).ok, true);
  assert.equal((await controller.compareFingerprint(file(backupBytes))).ok, true);
  assert.equal(controller.getSnapshot().comparison, 'match');
  const reformatted = new TextEncoder().encode(JSON.stringify(backup, null, 2));
  assert.equal((await controller.compareFingerprint(file(reformatted))).ok, true);
  assert.equal(controller.getSnapshot().comparison, 'different');
  assert.equal((await controller.createFingerprint(file(new TextEncoder().encode('{"privateKey":"secret"}')), 'p2p-offramp-backup/v1')).code, 'FILE_FORMAT');
  assert.equal(controller.getSnapshot().review, null);
  controller.dispose();
});
