import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { parseEvaluationPins, digestInstalledTree, verifyEvaluationInputs, runSemaphoreV4Evaluation } from './semaphore-v4-evaluation.mjs';

const bytes = value => new TextEncoder().encode(JSON.stringify(value));
const sha = value => createHash('sha256').update(value).digest('hex');
const pinsBytes = await readFile(new URL('./semaphore-v4.pins.json', import.meta.url));
const fixture = () => JSON.parse(pinsBytes);

test('retained pins distinguish SDK and artifact versions, exact local graph, licenses and unqualified application scope', () => {
  const pins = parseEvaluationPins(new Uint8Array(pinsBytes));
  assert.equal(pins.sdkVersion, '4.14.5'); assert.equal(pins.artifactVersion, '4.13.0'); assert.equal(pins.treeDepth, 2);
  assert.equal(pins.packages.length, 10); assert.equal(pins.sources.length, 10); assert.equal(pins.installedTree.entries, 4199);
  assert.equal(pins.dependencyProfile, 'semaphore-4.14.5-maintained-transitives-20261102');
  assert.equal(pins.dependencyOverrides.snarkjs, '0.7.6'); assert.equal(pins.dependencyAudit.vulnerabilities.total, 0);
  assert.equal(pins.artifact.selected['semaphore-2.wasm'].bytes, 1801079);
  assert.ok(pins.licenses.some(record => record.package === 'snarkjs' && record.declaredLicense === 'GPL-3.0'));
  for (const [key, value] of Object.entries(pins.qualification)) assert.equal(value, key === 'nodePublicFixtureOnly');
  assert.ok(Object.isFrozen(pins)); assert.ok(Object.isFrozen(pins.artifact.selected));
});
test('duplicate keys, changed profile/depth, weak budgets, fake authority and source traversal are refused', () => {
  const edits = [p => p.sdkVersion = '3', p => p.artifactVersion = '4.14.5', p => p.treeDepth = 3,
    p => p.limits.memoryBytes *= 2, p => p.limits.outputBytes = Infinity, p => p.qualification.providerActivated = true,
    p => p.qualification.reviewed = true, p => p.artifact.selected['../private'] = p.artifact.selected['semaphore-2.wasm'],
    p => p.artifact.tarballBytes = -1, p => p.installedTree.entries = 90000,
    p => p.sources[0].installedSourcePath = '../private', p => p.sources[0].url = p.sources[1].url,
    p => p.tools.proofImage = 'node:latest', p => p.packages[0].integrity = 'sha1-weak', p => p.approvedRelease = true,
    p => p.dependencyOverrides.snarkjs = '0.7.5', p => p.dependencyProfile = 'vendor-supported', p => p.dependencyAudit.vulnerabilities.high = 1,
    p => p.dependencyAudit.vulnerabilities = {}];
  for (const edit of edits) { const candidate = fixture(); edit(candidate); assert.throws(() => parseEvaluationPins(bytes(candidate))); }
  const duplicate = pinsBytes.toString().replace('"format":', '"format":"other","format":');
  assert.throws(() => parseEvaluationPins(new TextEncoder().encode(duplicate)));
});
test('all ten retained official package integrity assertions verify under recorded public registry keys with tamper controls', () => {
  const pins = parseEvaluationPins(new Uint8Array(pinsBytes)), evidence = pins.registryEvidence;
  assert.equal(sha(evidence.publicKeyDocumentUtf8), evidence.keyFileSha256);
  const keys = JSON.parse(evidence.publicKeyDocumentUtf8).keys;
  const expiredHistory = evidence.results.filter(record => record.keyExpires !== null);
  assert.equal(expiredHistory.length, 1); assert.equal(expiredHistory[0].name, '@zk-kit/artifacts');
  assert.equal(expiredHistory[0].keyExpires, '2025-01-29T00:00:00.000Z');
  const part = value => { const data = Buffer.from(value), size = Buffer.alloc(4); size.writeUInt32BE(data.length); return Buffer.concat([size, data]); };
  assert.equal(evidence.signedMetadata.length, 10);
  for (const item of evidence.signedMetadata) {
    const pinned = pins.packages.find(record => record.name === item.name && record.version === item.version); assert.equal(item.integrity, pinned.integrity);
    let accepted = false;
    for (const signature of item.signatures) {
      const record = keys.find(key => key.keyid === signature.keyid); if (!record) continue;
      const key = createPublicKey({ key: Buffer.from(record.key, 'base64'), format: 'der', type: 'spki' }), jwk = key.export({ format: 'jwk' }); assert.equal(jwk.crv, 'P-256');
      const wire = Buffer.concat([part('ecdsa-sha2-nistp256'), part('nistp256'), part(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]))]);
      assert.equal('SHA256:' + createHash('sha256').update(wire).digest('base64').replace(/=+$/, ''), record.keyid);
      const message = Buffer.from(`${item.name}@${item.version}:${item.integrity}`), signed = Buffer.from(signature.sig, 'base64');
      if (verify('sha256', message, key, signed)) {
        assert.equal(verify('sha256', Buffer.from('altered:' + message), key, signed), false);
        const corrupted = Buffer.from(signed); corrupted[corrupted.length - 1] ^= 1; assert.equal(verify('sha256', message, key, corrupted), false); accepted = true; break;
      }
    }
    assert.equal(accepted, true, item.name);
  }
});
test('original17-finding dependency project remains passive byte-exact history and is refused by the current input gate', async t => {
  const pins = parseEvaluationPins(new Uint8Array(pinsBytes));
  const raw = await readFile(new URL('../../docs/reputation/SEMAPHORE-V4-ORIGINAL-OBSERVATION.json', import.meta.url));
  assert.equal(sha(raw), pins.originalObservation.sha256); const history = JSON.parse(raw);
  assert.equal(history.status, 'BLOCKED_DEPENDENCY_FINDINGS'); assert.equal(history.executableDependencyProject, false);
  for (const entry of history.entries) { assert.equal(Buffer.byteLength(entry.utf8), entry.bytes); assert.equal(sha(entry.utf8), entry.sha256); }
  const oldLock = history.entries.find(entry => entry.name === 'package-lock.json'), audit = history.entries.find(entry => entry.name === 'dependency-audit.json');
  assert.equal(JSON.parse(audit.utf8).metadata.vulnerabilities.total, 17);
  assert.equal(JSON.parse(oldLock.utf8).packages['node_modules/snarkjs'].version, '0.7.5');
  const root = await mkdtemp(join(tmpdir(), 'p2p-semaphore-old-graph-')); t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), history.entries.find(entry => entry.name === 'package.json').utf8); await writeFile(join(root, 'package-lock.json'), oldLock.utf8);
  await assert.rejects(verifyEvaluationInputs(root, pins), /DIGEST/);
});
test('installed graph digest includes exact empty files and bounded internal executable links without executing them', async t => {
  const root = await mkdtemp(join(tmpdir(), 'p2p-semaphore-tree-')); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.bin')); await writeFile(join(root, 'entry.js'), 'abc'); await writeFile(join(root, 'empty'), ''); await symlink('../entry.js', join(root, '.bin', 'entry'));
  const report = await digestInstalledTree(root), rows = [{ path: '.bin/entry', link: '../entry.js' }, { path: 'empty', bytes: 0, sha256: sha('') }, { path: 'entry.js', bytes: 3, sha256: sha('abc') }];
  assert.deepEqual(report, { entries: 3, regularFiles: 2, symlinks: 1, bytes: 3, sha256: sha(JSON.stringify(rows)) });
  await writeFile(join(root, 'entry.js'), 'abd'); assert.notEqual((await digestInstalledTree(root)).sha256, report.sha256);
});
test('external links, directory aliases, FIFOs and excessive nesting refuse before execution or a blocking read', async t => {
  const parent = await mkdtemp(join(tmpdir(), 'p2p-semaphore-hostile-tree-')); t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, 'tree'); await mkdir(root); await mkdir(join(root, '.bin')); await writeFile(join(parent, 'outside'), 'public sentinel');
  await symlink('../../outside', join(root, '.bin', 'escape')); await assert.rejects(digestInstalledTree(root), /SYMLINK/); await rm(join(root, '.bin', 'escape'));
  await symlink(root, join(parent, 'alias')); await assert.rejects(digestInstalledTree(join(parent, 'alias')), /DIRECTORY/);
  execFileSync('mkfifo', [join(root, 'pipe')]); const start = Date.now(); await assert.rejects(digestInstalledTree(root), /FILE/); assert.ok(Date.now() - start < 1000); await rm(join(root, 'pipe'));
  let nested = root; for (let n = 0; n < 25; n++) { nested = join(nested, 'd'); await mkdir(nested); }
  await assert.rejects(digestInstalledTree(root), /LIMIT/);
});
test('input verification refuses changed lock, absent assets and extra artifacts without starting a Docker proof', async t => {
  const root = await mkdtemp(join(tmpdir(), 'p2p-semaphore-inputs-')); t.after(() => rm(root, { recursive: true, force: true }));
  const pins = parseEvaluationPins(new Uint8Array(pinsBytes)); await writeFile(join(root, 'package.json'), '{}'); await writeFile(join(root, 'package-lock.json'), '{}');
  await assert.rejects(verifyEvaluationInputs(root, pins), /DIGEST/);
  const tiny = { ...pins, packageSha256: sha('{}'), lockSha256: sha('{}') }; await mkdir(join(root, 'artifacts'));
  await writeFile(join(root, 'artifacts', 'unexpected'), 'public'); await assert.rejects(verifyEvaluationInputs(root, tiny), /ARTIFACT_SET/);
});
test('native cancellation, malformed signals, invalid mount paths and overlap retain/release the owned admission correctly', async () => {
  const aborted = new AbortController(); aborted.abort(); let getters = 0;
  Object.defineProperty(aborted.signal, 'aborted', { get() { getters++; throw Error('PRIVATE'); } });
  await assert.rejects(runSemaphoreV4Evaluation('/tmp/missing-public-fixture', aborted.signal), /CANCELLED/); assert.equal(getters, 0);
  await assert.rejects(runSemaphoreV4Evaluation('/tmp/missing-public-fixture', Object.create(AbortSignal.prototype)), /SIGNAL/);
  for (const input of ['/tmp/with,comma', '/tmp/with\nnewline', '/tmp/a/../b', resolve('.')]) await assert.rejects(runSemaphoreV4Evaluation(input), /DIRECTORY/);
  const first = runSemaphoreV4Evaluation('/tmp/missing-public-fixture');
  await assert.rejects(runSemaphoreV4Evaluation('/tmp/second-public-fixture'), /BUSY/); await assert.rejects(first, /SEMAPHORE_/);
  await assert.rejects(runSemaphoreV4Evaluation('/tmp/missing-public-fixture', aborted.signal), /CANCELLED/);
});
