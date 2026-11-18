/** Offline adversarial tests. Generated keys are synthetic, never npm trust evidence. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../check-npm-registry-signatures.mjs', import.meta.url));
const names = ['@noble/hashes', '@noble/curves'];
const version = '2.4.0';
const part = value => {
  const bytes = Buffer.from(value), size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  return Buffer.concat([size, bytes]);
};

function fixture() {
  const pairs = Array.from({ length: 2 }, () => generateKeyPairSync('ec', { namedCurve: 'prime256v1' }));
  const keys = pairs.map(({ publicKey }) => {
    const jwk = publicKey.export({ format: 'jwk' });
    const point = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
    const wire = Buffer.concat([part('ecdsa-sha2-nistp256'), part('nistp256'), part(point)]);
    return {
      keyid: `SHA256:${createHash('sha256').update(wire).digest('base64').replace(/=+$/, '')}`,
      key: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
      keytype: 'ecdsa-sha2-nistp256', scheme: 'ecdsa-sha2-nistp256', expires: null,
    };
  });
  const packages = names.map(name => {
    const integrity = `sha512-${createHash('sha512').update(`synthetic:${name}`).digest('base64')}`;
    return { name, version, integrity, signatures: [{
      keyid: keys[0].keyid,
      sig: sign('sha256', Buffer.from(`${name}@${version}:${integrity}`), pairs[0].privateKey).toString('base64'),
    }] };
  });
  const lock = { lockfileVersion: 3, packages: Object.fromEntries(packages.map(entry => [
    `node_modules/${entry.name}`, { version: entry.version, integrity: entry.integrity },
  ])) };
  return { keys, packages, lock };
}

function run(mutate = () => {}) {
  const data = fixture();
  mutate(data);
  const dir = mkdtempSync(join(tmpdir(), 'p2p-registry-evidence-'));
  try {
    mkdirSync(join(dir, 'docs', 'evidence'), { recursive: true });
    writeFileSync(join(dir, 'docs/evidence/npm-registry-keys-20261026.json'), JSON.stringify({ keys: data.keys }));
    writeFileSync(join(dir, 'docs/evidence/npm-signed-package-metadata-20261026.json'), JSON.stringify(data.packages));
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify(data.lock));
    const result = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', timeout: 10_000 });
    assert.equal(result.error, undefined, 'checker must execute, not fail at process startup');
    assert.equal(result.signal, null, 'checker must finish, not time out');
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function refuses(mutate, reason) {
  const result = run(mutate);
  assert.notEqual(result.status, 0, `invalid evidence was accepted: ${result.stdout}`);
  assert.equal(result.stdout.trim(), '', 'a rejected inventory must not emit a success report');
  if (reason) assert.match(result.stderr, reason);
}

test('admits the exact synthetic provider set and retains the scoped tamper controls', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.observedDate, '2026-10-26');
  assert.deepEqual(report.results.map(row => row.package), names);
  assert.match(report.scope, /does NOT sign gitHead or approve package safety/);
  for (const row of report.results) {
    assert.equal(row.registrySignatureVerified, true);
    assert.equal(row.tamperedMessageRejected, true);
    assert.equal(row.tamperedSignatureRejected, true);
    assert.equal(row.wrongKeyRejected, true);
  }
});

test('accepts the exact provider set in reverse order', () => {
  const result = run(data => data.packages.reverse());
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).results.map(row => row.package), [...names].reverse());
});

for (const name of names) {
  test(`refuses duplicate ${name} evidence instead of counting it twice`, () => {
    refuses(data => {
      const entry = data.packages.find(value => value.name === name);
      data.packages = [entry, entry];
    }, /Duplicate evidence package/);
  });
}

test('refuses a missing provider', () => refuses(data => data.packages.pop(), /Missing provider evidence/));
test('refuses an empty inventory', () => refuses(data => { data.packages = []; }, /Missing provider evidence/));
test('refuses an unexpected provider', () => refuses(data => { data.packages[0].name = 'unexpected'; }, /Unexpected evidence package/));

for (const [label, expiry] of [
  ['unparseable', 'not-a-date'], ['missing', undefined], ['numeric', 4070908800000],
  ['array', ['2099-01-01T00:00:00.000Z']], ['object', {}],
]) {
  test(`refuses ${label} key expiry rather than coercing it or comparing NaN`, () => {
    refuses(data => { data.keys[0].expires = expiry; }, /Invalid recorded key expiry/);
  });
}

test('retains historical observation-date semantics for a later expiration', () => {
  const result = run(data => { data.keys[0].expires = '2026-10-27T00:00:00.000Z'; });
  assert.equal(result.status, 0, result.stderr);
});

test('refuses a key expired at the recorded observation date', () => {
  refuses(data => { data.keys[0].expires = '2026-10-26T00:00:00.000Z'; }, /Recorded key expired/);
});

test('refuses lockfile version mismatch even when integrity matches', () => {
  refuses(data => { data.lock.packages['node_modules/@noble/hashes'].version = '9.9.9'; }, /Lock differs from signed package/);
});

test('refuses lockfile integrity mismatch', () => {
  refuses(data => { data.lock.packages['node_modules/@noble/curves'].integrity = 'sha512-wrong'; });
});

test('refuses a missing lockfile entry', () => {
  refuses(data => { delete data.lock.packages['node_modules/@noble/hashes']; });
});

test('refuses a corrupted signature', () => {
  refuses(data => {
    const signature = data.packages[0].signatures[0];
    const bytes = Buffer.from(signature.sig, 'base64');
    bytes[bytes.length - 1] ^= 1;
    signature.sig = bytes.toString('base64');
  }, /Registry signature failed/);
});
