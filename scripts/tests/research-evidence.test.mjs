import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { admitReceipt, canonicalize, makeLog, signingBytes } from '../research/receipts/receipt.mjs';

// RFC 8032 §7.1 TEST 1, PUBLIC test material. Never a production trust root.
// https://www.rfc-editor.org/rfc/rfc8032#section-7.1 (IETF Trust / BCP 78).
// Imported published seed, not generated key material. Signatures here attest synthetic claims only.
const testKey = createPrivateKey({ format: 'der', type: 'pkcs8', key: Buffer.from(
  '302e020100300506032b657004220420' +
  '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex') });
const publicKeyPem = '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=\n-----END PUBLIC KEY-----\n';
const repository = 'https://github.com/example/synthetic-evidence';
const sha = text => createHash('sha256').update(text).digest('hex');
const source = 'Synthetic test fixture. No application behavior is exercised.\n';
let root, commit;
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();

before(() => {
  root = mkdtempSync(join(tmpdir(), 'p2p-rq00-'));
  git('init', '-q');
  writeFileSync(join(root, 'fixture.txt'), source);
  git('add', 'fixture.txt');
  git('-c', 'user.name=RQ00 synthetic fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'synthetic fixture');
  commit = git('rev-parse', 'HEAD');
});
after(() => rmSync(root, { recursive: true, force: true }));

function fixture() {
  return {
    format: 'p2p-offramp/research-evidence/v1', id: 'P2P-RQ00-synthetic',
    repository, commit, createdAt: '2026-11-09T00:00:00.000Z',
    sources: [{ path: 'fixture.txt', sha256: sha(source) }],
    commands: [{ argv: ['node', '--test', 'fixture.test.mjs'], cwd: '.', execution: 'EXECUTED',
      exitCode: 0, signal: null, tests: { passed: 1, failed: 0, skipped: 0, todo: 0, cancelled: 0 } }],
    tools: [{ name: 'node', version: process.version, origin: 'https://nodejs.org/', license: 'MIT',
      sourceCommit: null, binarySha256: null }],
    buildConfiguration: [{ name: 'profile', value: 'synthetic-test-only' }],
    fixtures: [{ path: 'fixture.txt', sha256: sha(source), origin: 'Locally authored synthetic text',
      license: 'CC0-1.0', rights: 'Test author dedicates this synthetic text to CC0-1.0.', synthetic: true }],
    fixtureNote: 'Only synthetic metadata is tested; no real command execution is claimed by these fixtures.',
    result: 'PASS', logs: [makeLog(0, 'Synthetic receipt signature test.\n')],
    limitations: ['Synthetic attestation fixture; a trusted signature is attribution, not proof of execution.'],
    reproducibility: ['Run node --test scripts/tests/research-evidence.test.mjs in the repository.'],
    attestation: null,
  };
}
function attest(receipt) {
  receipt.attestation = { algorithm: 'Ed25519', signer: 'rfc8032-public-test-key', signature: '0'.repeat(128) };
  receipt.attestation.signature = sign(null, signingBytes(receipt), testKey).toString('hex');
  return receipt;
}
function options(extra = {}) {
  return { root, repository, commit, policy: { format: 'p2p-offramp/research-trust/v1', repository,
    commit, requireSigner: true, trustedSigners: [{ id: 'rfc8032-public-test-key', publicKeyPem }] }, ...extra };
}
const admit = (receipt, extra) => admitReceipt(canonicalize(receipt), options(extra));
const reject = (receipt, code, extra) => assert.throws(() => admit(receipt, extra), { message: code });

test('synthetic signed PASS admits attribution only; RFC public key is external to receipt', () => {
  const result = admit(attest(fixture()));
  assert.deepEqual(result, { result: 'PASS', admission: 'TRUSTED_ATTESTATION',
    signer: 'rfc8032-public-test-key', executionVerified: false, releaseAuthorized: false });
});

test('unsigned observations remain UNKNOWN and cannot self-promote to PASS', () => {
  const r = fixture();
  r.result = 'UNKNOWN';
  assert.deepEqual(admit(r, { policy: undefined }), { result: 'UNKNOWN', admission: 'UNAUTHENTICATED_RECORD',
    signer: null, executionVerified: false, releaseAuthorized: false });
  r.result = 'PASS';
  reject(r, 'EVIDENCE_SIGNER_REQUIRED', { policy: undefined });
  reject(r, 'EVIDENCE_SIGNER_REQUIRED');
});

test('non-success states are retained without becoming execution evidence', () => {
  for (const state of ['FAIL', 'BLOCKED', 'UNKNOWN']) {
    const r = fixture(); r.result = state;
    if (state === 'FAIL') { r.commands[0].exitCode = 1; r.commands[0].tests.failed = 1; }
    if (state === 'BLOCKED') { r.commands[0].execution = 'UNAVAILABLE'; r.commands[0].exitCode = null; r.commands[0].tests = null; }
    const result = admit(r, { policy: undefined });
    assert.equal(result.result, state); assert.equal(result.executionVerified, false);
  }
});

test('source admission binds expected repository, commit and committed/current bytes', () => {
  let r = fixture(); r.sources[0].sha256 = 'a'.repeat(64); r.fixtures[0].sha256 = 'a'.repeat(64);
  reject(attest(r), 'EVIDENCE_SOURCE_MISMATCH');
  reject(attest(fixture()), 'EVIDENCE_SOURCE_MISMATCH', { commit: 'a'.repeat(40) });
  reject(attest(fixture()), 'EVIDENCE_SOURCE_MISMATCH', { repository: 'https://github.com/example/other' });
  writeFileSync(join(root, 'fixture.txt'), 'changed locally');
  try {
    reject(attest(fixture()), 'EVIDENCE_SOURCE_MISMATCH');
    r = fixture(); r.sources[0].sha256 = sha('changed locally'); r.fixtures[0].sha256 = r.sources[0].sha256;
    reject(attest(r), 'EVIDENCE_SOURCE_MISMATCH');
  } finally { writeFileSync(join(root, 'fixture.txt'), source); }
});

test('untracked sources, traversal and symlinks cannot impersonate committed sources', () => {
  const r = fixture();
  writeFileSync(join(root, 'untracked.txt'), source);
  r.sources[0].path = r.fixtures[0].path = 'untracked.txt';
  reject(attest(r), 'EVIDENCE_SOURCE_MISMATCH');
  r.sources[0].path = r.fixtures[0].path = '../fixture.txt';
  reject(attest(r), 'EVIDENCE_SCHEMA');
  rmSync(join(root, 'fixture.txt'));
  symlinkSync(join(root, 'untracked.txt'), join(root, 'fixture.txt'));
  try { reject(attest(fixture()), 'EVIDENCE_SOURCE_MISMATCH'); }
  finally { rmSync(join(root, 'fixture.txt')); writeFileSync(join(root, 'fixture.txt'), source); }
});

test('required signer identity, externally trusted key and exact signature are enforced', () => {
  const r = attest(fixture());
  reject(r, 'EVIDENCE_UNTRUSTED_SIGNER', { policy: undefined });
  reject(r, 'EVIDENCE_UNTRUSTED_SIGNER', { policy: { ...options().policy, trustedSigners: [] } });
  r.attestation.signer = 'untrusted';
  reject(r, 'EVIDENCE_UNTRUSTED_SIGNER');
  delete r.attestation.signer;
  reject(r, 'EVIDENCE_SCHEMA');
  const tampered = attest(fixture()); tampered.limitations.push('Tampered after signature.');
  reject(tampered, 'EVIDENCE_BAD_SIGNATURE');
  const bad = attest(fixture()); bad.attestation.signature = '0'.repeat(128);
  reject(bad, 'EVIDENCE_BAD_SIGNATURE');
});

test('signature binds algorithm, signer identity and domain as well as all claims', () => {
  const r = attest(fixture());
  const otherPolicy = { ...options().policy, trustedSigners: [{ id: 'other', publicKeyPem }] };
  r.attestation.signer = 'other';
  reject(r, 'EVIDENCE_BAD_SIGNATURE', { policy: otherPolicy });
  r.attestation.signer = 'rfc8032-public-test-key';
  r.attestation.signature = sign(null, Buffer.from(canonicalize({ ...r, attestation: null })), testKey).toString('hex');
  reject(r, 'EVIDENCE_BAD_SIGNATURE');
});

test('skipped, mocked, unavailable, unverified, failed and empty checks never PASS, even signed', () => {
  for (const execution of ['SKIPPED', 'MOCKED', 'UNAVAILABLE', 'UNVERIFIED']) {
    const r = fixture(); r.commands[0].execution = execution;
    r.commands[0].exitCode = null; r.commands[0].tests = null;
    reject(attest(r), 'EVIDENCE_RESULT_CONTRADICTION');
  }
  for (const field of ['failed', 'skipped', 'todo', 'cancelled']) {
    const r = fixture(); r.commands[0].tests[field] = 1;
    reject(attest(r), 'EVIDENCE_RESULT_CONTRADICTION');
  }
  for (const change of [r => { r.commands[0].exitCode = 1; }, r => { r.commands[0].signal = 'SIGTERM'; },
    r => { r.commands[0].tests.passed = 0; }, r => { r.commands[0].tests = null; }]) {
    const r = fixture(); change(r); reject(attest(r), 'EVIDENCE_RESULT_CONTRADICTION');
  }
});

test('strict canonical JSON rejects duplicate, unknown, missing and malformed fields', () => {
  const r = attest(fixture());
  for (const mutate of [x => { x.extra = true; }, x => { x.tools[0].extra = true; },
    x => { delete x.limitations; }, x => { x.commands[0].exitCode = '0'; },
    x => { x.format = 'p2p-offramp/research-evidence/v2'; }, x => { x.result = 'SUCCESS'; },
    x => { x.createdAt = '2026-02-31T00:00:00.000Z'; }, x => { x.sources.push(x.sources[0]); },
    x => { x.fixtures[0].sha256 = 'a'.repeat(64); }, x => { x.tools[0].version = 'latest'; }]) {
    const changed = structuredClone(r); mutate(changed); reject(changed, 'EVIDENCE_SCHEMA');
  }
  const wire = canonicalize(r);
  for (const malformed of [wire + '\n', '{"result":"FAIL",' + wire.slice(1), wire.replace('"result"', '"resu\\u006ct"'),
    '{', '[]', 'null', ' '.repeat(262145), Buffer.from([0xff]), '\ufeff' + wire,
    Buffer.concat([Buffer.from('efbbbf', 'hex'), Buffer.from(wire)])]) {
    assert.throws(() => admitReceipt(malformed, options()), { message: 'EVIDENCE_SCHEMA' });
  }
});

test('bounded logs redact known literals and credential patterns before hashing', () => {
  const secret = 'SYNTHETIC_LITERAL_CREDENTIAL';
  const raw = 'token=synthetic-token-value\nAuthorization: Bearer synthetic-value\n' + secret + '\n' + '🙂'.repeat(5000);
  const log = makeLog(0, raw, { secrets: [secret] });
  assert.ok(Buffer.byteLength(log.text) <= 8192); assert.equal(log.truncated, true);
  assert.equal(log.sha256, sha(log.text)); assert.equal(log.redacted, true);
  assert.ok(!log.text.includes(secret)); assert.ok(!log.text.includes('synthetic-token-value'));
  assert.ok(!log.text.includes('\ufffd'));
  const r = fixture(); r.logs = [log]; assert.equal(admit(attest(r), { secrets: [secret] }).result, 'PASS');
});

test('secret leakage is rejected across logs, commands, metadata and reproduction instructions', () => {
  for (const leak of ['api_key=synthetic-secret', 'https://person:synthetic-secret@example.invalid',
    '-----BEGIN PRIVATE KEY-----\nsynthetic\n-----END PRIVATE KEY-----', 'SYNTHETIC_LITERAL_CREDENTIAL']) {
    for (const field of ['log', 'command', 'metadata', 'repro']) {
      const r = fixture();
      if (field === 'log') { r.logs[0].text = leak; r.logs[0].sha256 = sha(leak); }
      if (field === 'command') r.commands[0].argv.push(leak);
      if (field === 'metadata') r.fixtureNote = leak;
      if (field === 'repro') r.reproducibility.push(leak);
      reject(attest(r), 'EVIDENCE_SECRET', { secrets: ['SYNTHETIC_LITERAL_CREDENTIAL'] });
    }
  }
});

test('quoted JSON credentials and contextual configuration/argv secrets fail closed', () => {
  for (const text of ['{"api_key":"SYNTHETIC_JSON_SECRET"}', "'Client-Secret': 'SYNTHETIC_JSON_SECRET'",
    'https://example.invalid/?X-Amz-Signature=SYNTHETIC_JSON_SECRET']) {
    const log = makeLog(0, text);
    assert.equal(log.redacted, true); assert.ok(!log.text.includes('SYNTHETIC_JSON_SECRET'));
    const r = fixture(); r.logs[0].text = text; r.logs[0].sha256 = sha(text);
    reject(attest(r), 'EVIDENCE_SECRET');
  }
  for (const name of ['api_key', 'API-KEY', 'Client_Secret', 'private-key', 'authorization']) {
    const r = fixture(); r.buildConfiguration.push({ name, value: 'SYNTHETIC_CONTEXTUAL_SECRET' });
    reject(attest(r), 'EVIDENCE_SECRET');
    r.buildConfiguration.pop(); r.commands[0].argv.push('--' + name, 'SYNTHETIC_CONTEXTUAL_SECRET');
    reject(attest(r), 'EVIDENCE_SECRET');
  }
});

test('quoted credential redaction consumes escaped quotes and backslashes without leaking suffixes', () => {
  const sensitive = 'SYNTHETIC_ESCAPED_SUFFIX';
  for (const text of [JSON.stringify({ api_key: 'prefix"' + sensitive }),
    JSON.stringify({ api_key: 'prefix\\"' + sensitive }),
    JSON.stringify({ api_key: 'prefix\\\\' + sensitive }),
    "'client_secret': 'prefix\\'" + sensitive + "'", 'api_key="prefix\\\\' + sensitive + '"']) {
    const log = makeLog(0, text);
    assert.equal(log.redacted, true); assert.ok(!log.text.includes(sensitive));
    const r = fixture(); r.logs = [log]; assert.equal(admit(attest(r)).result, 'PASS');
    r.logs[0] = { ...log, text, sha256: sha(text) }; reject(attest(r), 'EVIDENCE_SECRET');
  }
});

test('tool provenance and exact pins are required; unknown source/binary identity stays explicit', () => {
  for (const edit of [r => { delete r.tools[0].origin; }, r => { delete r.tools[0].license; },
    r => { delete r.tools[0].sourceCommit; }, r => { delete r.tools[0].binarySha256; },
    r => { r.tools[0].version = '^24.0.0'; }, r => { r.tools[0].version = '24.x'; },
    r => { r.tools[0].binarySha256 = 'unknown'; }]) {
    const r = fixture(); edit(r); reject(attest(r), 'EVIDENCE_SCHEMA');
  }
  const r = fixture(); r.tools[0].binarySha256 = 'b'.repeat(64);
  assert.equal(admit(attest(r)).admission, 'TRUSTED_ATTESTATION');
});

test('log hashes, bounds, command associations and provenance are checked', () => {
  for (const mutate of [r => { r.logs[0].sha256 = 'a'.repeat(64); },
    r => { r.logs[0].commandIndex = 1; }, r => { r.logs = []; },
    r => { r.logs[0].text = 'x'.repeat(8193); }, r => { r.fixtures[0].license = ''; },
    r => { r.fixtures[0].rights = ''; }]) {
    const r = fixture(); mutate(r); reject(attest(r), 'EVIDENCE_SCHEMA');
  }
});

test('external policy is strict, source-bound and cannot be supplied by the receipt', () => {
  for (const edit of [p => { p.extra = true; }, p => { p.commit = 'b'.repeat(40); },
    p => { p.trustedSigners.push(p.trustedSigners[0]); }, p => { p.requireSigner = 'false'; },
    p => { p.trustedSigners[0].publicKeyPem = 'not a key'; }]) {
    const policy = structuredClone(options().policy); edit(policy);
    reject(attest(fixture()), 'EVIDENCE_POLICY', { policy });
  }
  const r = fixture(); r.policy = options().policy; reject(attest(r), 'EVIDENCE_SCHEMA');
});

test('CLI emits fixed errors without leaking rejected input and never executes argv', () => {
  const cli = fileURLToPath(new URL('../research/receipts/cli.mjs', import.meta.url));
  const r = fixture(); r.result = 'UNKNOWN';
  r.commands[0].argv = ['node', '-e', 'throw new Error("DO_NOT_EXECUTE_RECEIPT")'];
  const input = join(root, 'receipt.json'); writeFileSync(input, canonicalize(r));
  const args = [cli, 'verify', '--receipt', input, '--root', root, '--repository', repository, '--commit', commit];
  let run = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr); assert.equal(JSON.parse(run.stdout).result, 'UNKNOWN');
  r.fixtureNote = 'token=NEVER_PRINT_SYNTHETIC_SECRET'; writeFileSync(input, canonicalize(r));
  run = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(run.status, 1); assert.equal(run.stderr.trim(), 'EVIDENCE_SECRET');
  assert.equal(run.stdout, ''); assert.ok(!run.stderr.includes('NEVER_PRINT'));
});
