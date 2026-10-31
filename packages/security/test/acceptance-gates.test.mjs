import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGate, ACCEPTANCE_LIMITS } from '../src/acceptance-gates.ts';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { acceptanceReport } from '../../../scripts/acceptance-report.mjs';

const digest = digit => digit.repeat(64);
const candidate = () => ({
  format: 'p2p-offramp/acceptance-candidate/v1', sourceCommit: 'a'.repeat(40),
  specDigests: [{ id: 'G24', sha256: digest('1') }],
  artifactDigests: ['asset', 'compiler', 'dependencies', 'build-recipe', 'deployment'].map((kind, index) => ({ id: kind, kind, sha256: digest(String(index + 2)) })),
  contributors: { designers: ['designer'], implementers: ['implementer'] },
  requirements: [{ id: 'native-release', milestone: 'M2A', mandatory: true, advertised: true,
    targets: [{ id: 'desktop', kind: 'automated' }], reviewRole: 'independent-reviewer' }],
});
const evidence = (c = candidate()) => ({ id: 'run-1', milestone: 'M2A', requirementIds: ['native-release'],
  specDigests: structuredClone(c.specDigests), sourceCommit: c.sourceCommit, artifactDigests: structuredClone(c.artifactDigests),
  testCases: [{ id: 'native-positive', requirementId: 'native-release', targetId: 'desktop', result: 'pass', reportDigest: digest('9') }],
  targetMatrix: [{ id: 'desktop', kind: 'automated', environment: 'synthetic-local-node' }], reportDigests: [digest('9')],
  reviewer: { id: 'reviewer', role: 'independent-reviewer', scope: ['native-release'] }, decision: 'passed', decidedAt: 100, expiresOnChange: true,
});
const options = { nowSeconds: () => 200, verifyReview: () => true };
const result = async (records, c = candidate(), opts = options) => { const value = await evaluateGate(records, c, opts); assert.equal(value.ok, true); return value.value; };
const codes = report => report.findings.map(finding => finding.code);

test('imported passed decisions and reviewer names cannot qualify without a trusted verifier', async () => {
  const c = candidate(), r = evidence(c);
  const report = await result([r], c, { nowSeconds: () => 200 });
  assert.equal(report.decision, 'pending'); assert.ok(codes(report).includes('REVIEW_SCOPE_MISMATCH'));
  assert.equal(report.releaseEnabled, false); assert.equal(report.promotionAllowed, false); assert.equal(report.scopeOnly, true);
});

test('explicit synthetic trusted review qualifies matching evidence only and returns detached frozen snapshots', async () => {
  const c = candidate(), r = evidence(c);
  const report = await result([r], c, { ...options, verifyReview: (record, release) => {
    assert.ok(Object.isFrozen(record)); assert.ok(Object.isFrozen(record.testCases)); assert.ok(Object.isFrozen(release.requirements[0].targets));
    return record.reviewer.id === 'reviewer';
  } });
  assert.equal(report.decision, 'passed'); assert.deepEqual(report.findings, []); assert.equal(report.totals.pass, 1);
  assert.equal(report.promotionAllowed, false); r.testCases[0].result = 'fail'; c.requirements.length = 0;
  assert.equal(report.requirements[0].result, 'pass'); assert.ok(Object.isFrozen(report));
});

test('source, spec, asset, compiler, dependency, recipe and deployment changes invalidate evidence', async () => {
  for (const changed of ['source', 'spec', 'asset', 'compiler', 'dependencies', 'build-recipe', 'deployment']) {
    const c = candidate(), r = evidence(c);
    if (changed === 'source') c.sourceCommit = 'b'.repeat(40);
    else if (changed === 'spec') c.specDigests[0].sha256 = digest('a');
    else c.artifactDigests.find(item => item.kind === changed).sha256 = digest('a');
    let calls = 0; const report = await result([r], c, { ...options, verifyReview: () => { calls++; return true; } });
    assert.notEqual(report.decision, 'passed', changed); assert.ok(codes(report).includes('STALE_EVIDENCE'), changed); assert.equal(calls, 0);
  }
});

test('failed, pending, missing and mandatory unsupported/not-run targets never qualify', async () => {
  for (const outcome of ['fail', 'unsupported', 'not-run']) {
    const r = evidence(); r.testCases[0].result = outcome;
    const report = await result([r]); assert.notEqual(report.decision, 'passed'); assert.ok(codes(report).includes(outcome === 'fail' ? 'EVIDENCE_FAILED' : 'TARGET_UNTESTED'));
  }
  const pending = evidence(); pending.decision = 'pending'; assert.notEqual((await result([pending])).decision, 'passed');
  assert.ok(codes(await result([])).includes('GATE_INCOMPLETE'));
});

test('unsupported is permitted only for an optional explicitly unadvertised requirement', async () => {
  const c = candidate(); c.requirements[0].mandatory = false; c.requirements[0].advertised = false;
  const r = evidence(c); r.testCases[0].result = 'unsupported';
  const report = await result([r], c); assert.equal(report.decision, 'passed'); assert.equal(report.totals.unsupported, 1);
  assert.deepEqual(report.requirements[0].targets, [{ id: 'desktop', kind: 'automated', result: 'unsupported' }]);
  c.requirements[0].advertised = true; assert.notEqual((await result([r], c)).decision, 'passed');
});

test('physical targets reject emulator substitution and undeclared/missing target coverage', async () => {
  const c = candidate(); c.requirements[0].targets[0].kind = 'physical-device';
  const r = evidence(c); r.targetMatrix[0].kind = 'emulated-device';
  assert.ok(codes(await result([r], c)).includes('TARGET_UNTESTED'));
  assert.equal((await result([r], c)).requirements[0].targets[0].result, 'not-run');
  r.targetMatrix[0].id = 'another-device'; r.testCases[0].targetId = 'another-device';
  assert.ok(codes(await result([r], c)).includes('TARGET_UNTESTED'));
});

test('self-review, wrong role, incomplete review scope, future decisions and nonexpiring claims are rejected', async () => {
  for (const mutation of [r => { r.reviewer.id = 'implementer'; }, r => { r.reviewer.id = 'IMPLEMENTER'; }, r => { r.reviewer.role = 'implementer'; }, r => { r.reviewer.scope = ['another']; }]) {
    const r = evidence(); mutation(r); assert.ok(codes(await result([r])).includes('REVIEW_SCOPE_MISMATCH'));
  }
  for (const mutation of [r => { r.decidedAt = 201; }, r => { r.expiresOnChange = false; }]) {
    const r = evidence(); mutation(r); assert.ok(codes(await result([r])).includes('STALE_EVIDENCE'));
  }
});

test('unlinked failures remain blocking; trusted explicit supersession retains their identity', async () => {
  const old = evidence(); old.decision = 'failed'; old.testCases[0].result = 'fail';
  const repaired = evidence(); repaired.id = 'run-2'; repaired.decidedAt = 101;
  assert.equal((await result([old, repaired])).decision, 'failed');
  repaired.supersedes = ['run-1'];
  const report = await result([old, repaired]); assert.equal(report.decision, 'passed'); assert.deepEqual(report.supersededRecordIds, ['run-1']);
  const untrusted = await result([old, repaired], candidate(), { ...options, verifyReview: r => r.id !== 'run-2' }); assert.notEqual(untrusted.decision, 'passed');
});

test('supersession rejects absent links/cycles and cannot replace different requirement coverage', async () => {
  const r = evidence(); r.supersedes = ['absent']; assert.equal((await evaluateGate([r], candidate(), options)).ok, false);
  const a = evidence(), b = evidence(); b.id = 'run-2'; a.supersedes = ['run-2']; b.supersedes = ['run-1'];
  assert.equal((await evaluateGate([a, b], candidate(), options)).ok, false);
  delete a.supersedes; b.requirementIds = ['different'];
  assert.equal((await evaluateGate([a, b], candidate(), options)).ok, false);
});

test('report digests must bind every case and duplicate IDs cannot hide contradictory evidence', async () => {
  const r = evidence(); r.testCases[0].reportDigest = digest('8'); assert.equal((await evaluateGate([r], candidate(), options)).ok, false);
  assert.equal((await evaluateGate([evidence(), evidence()], candidate(), options)).ok, false);
});

test('empty scopes, missing tool pins, getters, sparse arrays, oversized collections and hostile proxies fail without invoking accessors', async () => {
  const c = candidate(); c.requirements = []; assert.equal((await evaluateGate([], c)).ok, false);
  const noCompiler = candidate(); noCompiler.artifactDigests = noCompiler.artifactDigests.filter(d => d.kind !== 'compiler'); assert.equal((await evaluateGate([], noCompiler)).ok, false);
  const noContributors = candidate(); noContributors.contributors.implementers = []; assert.equal((await evaluateGate([], noContributors)).ok, false);
  let reads = 0; const evil = evidence(); Object.defineProperty(evil, 'sourceCommit', { enumerable: true, get() { reads++; return 'a'.repeat(40); } });
  assert.equal((await evaluateGate([evil], candidate())).ok, false); assert.equal(reads, 0);
  const sparse = new Array(2); sparse[0] = evidence(); assert.equal((await evaluateGate(sparse, candidate())).ok, false);
  assert.equal((await evaluateGate(Array.from({ length: ACCEPTANCE_LIMITS.records + 1 }, evidence), candidate())).ok, false);
  const revoked = Proxy.revocable({}, {}); revoked.revoke(); const value = await evaluateGate([revoked.proxy], candidate()); assert.equal(value.ok, false);
});

test('throwing/hostile verification and clock hooks return fixed failures with no foreign secret text', async () => {
  const hostile = Proxy.revocable({}, {}); hostile.revoke();
  const report = await result([evidence()], candidate(), { ...options, verifyReview: () => { throw hostile.proxy; } });
  assert.ok(codes(report).includes('REVIEW_SCOPE_MISMATCH'));
  const clock = await evaluateGate([evidence()], candidate(), { nowSeconds: () => { throw Error('FAKE_SECRET'); } });
  assert.equal(clock.ok, false); assert.equal(JSON.stringify(clock).includes('FAKE_SECRET'), false);
});

test('cancellation while a verifier is pending yields no later passing report or unhandled rejection', async () => {
  const abort = new AbortController(); let rejectReview, started;
  const entered = new Promise(resolve => { started = resolve; });
  const checking = evaluateGate([evidence()], candidate(), { ...options, signal: abort.signal, verifyReview: () => { started(); return new Promise((_resolve, reject) => { rejectReview = reject; }); } });
  await entered; abort.abort(); const report = await checking; assert.equal(report.ok, false); assert.equal(report.error.code, 'CANCELLED');
  rejectReview(Error('FAKE_SECRET')); await new Promise(resolve => setImmediate(resolve));
});

test('partial target evidence combines, but an incomplete successor cannot erase an earlier failure', async () => {
  const c = candidate(); c.requirements[0].targets.push({ id: 'second', kind: 'automated' });
  const a = evidence(c), b = evidence(c); b.id = 'run-2'; b.testCases[0].targetId = 'second'; b.targetMatrix[0].id = 'second';
  assert.equal((await result([a, b], c)).decision, 'passed');
  const failed = evidence(c); failed.id = 'failure'; failed.decision = 'failed'; failed.testCases[0].result = 'fail';
  a.supersedes = ['failure']; a.decidedAt = 101;
  assert.equal((await result([failed, a, b], c)).decision, 'failed');
});

test('trusted explicit supersession retains an old source identity without accepting stale evidence', async () => {
  const c = candidate(), old = evidence(c), fresh = evidence(c); old.sourceCommit = 'f'.repeat(40);
  fresh.id = 'run-2'; fresh.decidedAt = 101; fresh.supersedes = ['run-1'];
  const report = await result([old, fresh], c); assert.equal(report.decision, 'passed'); assert.deepEqual(report.supersededRecordIds, ['run-1']);
});

test('the actual CLI emits a blocked JSON report and cannot authenticate imported approval metadata', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'p2p-acceptance-cli-'));
  try {
    const candidatePath = join(directory, 'candidate.json'), recordsPath = join(directory, 'records.json');
    await writeFile(candidatePath, JSON.stringify(candidate())); await writeFile(recordsPath, JSON.stringify([evidence()]));
    const child = spawnSync(process.execPath, ['scripts/acceptance-report.mjs', candidatePath, recordsPath], { cwd: new URL('../../../', import.meta.url), encoding: 'utf8', timeout: 10000 });
    assert.equal(child.status, 1, child.stderr); const report = JSON.parse(child.stdout);
    assert.equal(report.ok, true); assert.equal(report.value.decision, 'pending'); assert.equal(report.value.promotionAllowed, false);
    assert.ok(codes(report.value).includes('REVIEW_SCOPE_MISMATCH'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('report input handling refuses oversized/deep/duplicate/symlink/malformed data and prints no raw secret', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'p2p-acceptance-bad-'));
  try {
    const c = join(directory, 'candidate.json'), r = join(directory, 'records.json'); await writeFile(r, '[]');
    for (const source of ['{"secret":"FAKE_SECRET"', '['.repeat(17) + ']'.repeat(17), '{"id":"one","id":"two"}', '{"id":"one","\\u0069d":"two"}', ' '.repeat(4 * 1024 * 1024 + 1)]) {
      await writeFile(c, source); const report = await acceptanceReport(c, r);
      assert.equal(report.exitCode, 2); assert.equal(report.report.ok, false); assert.equal(JSON.stringify(report).includes('FAKE_SECRET'), false);
    }
    await writeFile(c, JSON.stringify(candidate())); const link = join(directory, 'linked.json'); await symlink(c, link);
    assert.equal((await acceptanceReport(link, r)).exitCode, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('clock rollback and clock-triggered cancellation never publish a passing evaluation', async () => {
  let tick = 201;
  const rollback = await evaluateGate([evidence()], candidate(), { ...options, nowSeconds: () => --tick });
  assert.equal(rollback.ok, false); assert.equal(rollback.error.code, 'UNAVAILABLE');
  const abort = new AbortController();
  const cancelled = await evaluateGate([], candidate(), { signal: abort.signal, nowSeconds: () => { abort.abort(); return 200; } });
  assert.equal(cancelled.ok, false); assert.equal(cancelled.error.code, 'CANCELLED');
});

test('native signal branding and listener intrinsics do not read overridden signal properties', async () => {
  const abort = new AbortController(); let reads = 0;
  for (const key of ['aborted', 'addEventListener', 'removeEventListener']) Object.defineProperty(abort.signal, key, { get() { reads++; throw Error('FAKE_SECRET'); } });
  assert.equal((await result([evidence()], candidate(), { ...options, signal: abort.signal })).decision, 'passed'); assert.equal(reads, 0);
});

test('a contradictory failed case cannot be hidden by another passing case for the same target', async () => {
  const r = evidence(); r.testCases.push({ ...r.testCases[0], id: 'negative', result: 'fail' });
  const report = await result([r]); assert.equal(report.decision, 'failed'); assert.equal(report.requirements[0].targets[0].result, 'fail');
});

test('out-of-scope or undeclared data is refused and invalid reviewer scope never reaches the verifier', async () => {
  const r = evidence(); r.reviewer.scope = ['other']; let calls = 0;
  const report = await result([r], candidate(), { ...options, verifyReview: () => { calls++; return true; } });
  assert.ok(codes(report).includes('REVIEW_SCOPE_MISMATCH')); assert.equal(calls, 0);
  const extra = evidence(); extra.approved = true; assert.equal((await evaluateGate([extra], candidate(), options)).ok, false);
});
