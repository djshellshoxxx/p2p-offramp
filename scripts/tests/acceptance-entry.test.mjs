import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const entry = fileURLToPath(new URL('../acceptance-report.mjs', import.meta.url));
const run = (path, args = []) => spawnSync(process.execPath, [path, ...args], { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
const report = (result, exitCode) => {
  assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, exitCode);
  assert.equal(result.stderr, ''); assert.equal(result.stdout.trim().split('\n').length, 1);
  return JSON.parse(result.stdout);
};
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'p2p-acceptance-entry-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const link = join(dir, 'acceptance-link.mjs'); await symlink(entry, link);
  const digest = digit => digit.repeat(64), candidate = {
    format: 'p2p-offramp/acceptance-candidate/v1', sourceCommit: 'a'.repeat(40),
    specDigests: [{ id: 'G24', sha256: digest('1') }],
    artifactDigests: ['asset', 'compiler', 'dependencies', 'build-recipe'].map((kind, index) => ({ id: kind, kind, sha256: digest(String(index + 2)) })),
    contributors: { designers: ['designer'], implementers: ['implementer'] },
    requirements: [{ id: 'native-release', milestone: 'M2A', mandatory: true, advertised: true,
      targets: [{ id: 'desktop', kind: 'automated' }], reviewRole: 'independent-reviewer' }],
  };
  const evidence = { id: 'run-1', milestone: 'M2A', requirementIds: ['native-release'], specDigests: candidate.specDigests,
    sourceCommit: candidate.sourceCommit, artifactDigests: candidate.artifactDigests,
    testCases: [{ id: 'native-positive', requirementId: 'native-release', targetId: 'desktop', result: 'pass', reportDigest: digest('9') }],
    targetMatrix: [{ id: 'desktop', kind: 'automated', environment: 'synthetic-local-node' }], reportDigests: [digest('9')],
    reviewer: { id: 'reviewer', role: 'independent-reviewer', scope: ['native-release'] }, decision: 'passed', decidedAt: 100, expiresOnChange: true,
  };
  const candidatePath = join(dir, 'candidate.json'), recordsPath = join(dir, 'records.json');
  await writeFile(candidatePath, JSON.stringify(candidate)); await writeFile(recordsPath, JSON.stringify([evidence]));
  return { link, candidatePath, recordsPath };
}

test('direct and symlink CLI entries both emit invalid-input JSON and exit 2 for invalid invocation', async t => {
  const { link } = await fixture(t);
  for (const path of [entry, link]) for (const args of [[], ['--invalid']]) {
    assert.deepEqual(report(run(path, args), 2), { ok: false, error: { code: 'INVALID_INPUT' } });
  }
});

test('direct and symlink CLI entries evaluate real matching evidence and stay blocked without trusted review', async t => {
  const { link, candidatePath, recordsPath } = await fixture(t);
  const direct = report(run(entry, [candidatePath, recordsPath]), 1), linked = report(run(link, [candidatePath, recordsPath]), 1);
  assert.deepEqual(linked, direct); assert.equal(linked.ok, true); assert.equal(linked.value.decision, 'pending');
  assert.ok(linked.value.findings.some(finding => finding.code === 'REVIEW_SCOPE_MISMATCH'));
  assert.equal(linked.value.releaseEnabled, false); assert.equal(linked.value.promotionAllowed, false);
});

test('importing the CLI through direct or symlink module URLs is inert', async t => {
  const { link } = await fixture(t);
  for (const path of [entry, link]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', 'await import(process.env.P2P_ACCEPTANCE_TEST_IMPORT)'], {
      encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024,
      env: { ...process.env, P2P_ACCEPTANCE_TEST_IMPORT: pathToFileURL(path).href },
    });
    assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0);
    assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
  }
});
