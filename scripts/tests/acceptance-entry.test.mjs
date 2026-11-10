import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const entry = fileURLToPath(new URL('../acceptance-report.mjs', import.meta.url));
// Node 24.0–24.2 may warn for native TypeScript stripping. Suppress that category only;
// unexpected warnings/errors remain visible and every report assertion still requires empty stderr.
const childNode = (args, options = {}) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', ...args], {
  encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024, ...options,
});
const run = (path, args = []) => childNode([path, ...args]);
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
  return { dir, link, candidatePath, recordsPath };
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
    const result = childNode(['--input-type=module', '--eval', 'await import(process.env.P2P_ACCEPTANCE_TEST_IMPORT)'], {
      env: { ...process.env, P2P_ACCEPTANCE_TEST_IMPORT: pathToFileURL(path).href },
    });
    assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0);
    assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
  }
});

test('eval aliases and long forms keep imports inert when argv[1] names the imported CLI', async t => {
  const { link, candidatePath, recordsPath } = await fixture(t), source = 'await import(process.argv[1])';
  const forms = [['-e', source], ['--eval', source], [`--eval=${source}`]];
  for (const path of [entry, link]) for (const form of forms) {
    const result = childNode(['--input-type=module', ...form, path, candidatePath, recordsPath]);
    assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0, form[0]);
    assert.equal(result.stdout, '', 'an import must not emit an acceptance report or evaluate its files'); assert.equal(result.stderr, '');
  }
});

test('print aliases and long forms print only their expression when importing argv[1]', async t => {
  const { link, candidatePath, recordsPath } = await fixture(t), source = '(import(process.argv[1]), "IMPORT-ONLY")';
  const forms = [['-p', source], ['--print', source], ['-pe', source], ['-p', '-e', source], ['--print', '--eval', source]];
  for (const path of [entry, link]) for (const form of forms) {
    const result = childNode([...form, path, candidatePath, recordsPath]);
    assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0, form[0]);
    assert.equal(result.stdout, 'IMPORT-ONLY\n', 'the imported CLI must add no report or evaluation side effect'); assert.equal(result.stderr, '');
  }
});

test('child setup suppresses only ExperimentalWarning and retains unrelated warnings and failures', () => {
  const result = childNode(['--eval', "process.emitWarning('native-typescript-test', 'ExperimentalWarning'); process.emitWarning('unexpected-entry-test', 'AcceptanceEntryWarning');"]);
  assert.equal(result.error, undefined); assert.equal(result.status, 0); assert.equal(result.stdout, '');
  assert.match(result.stderr, /AcceptanceEntryWarning: unexpected-entry-test/); assert.doesNotMatch(result.stderr, /native-typescript-test/);
  const failed = childNode(['--eval', "throw Error('unexpected-entry-failure')"]);
  assert.equal(failed.error, undefined); assert.equal(failed.status, 1); assert.equal(failed.stdout, ''); assert.match(failed.stderr, /unexpected-entry-failure/);
});

const family = [
  { relative: '../sepolia/deploy.mjs', code: 'PUBLIC_ENDPOINT_INVALID', stream: 'stderr' },
  { relative: '../recovery/build-evm.mjs', code: 'INVALID_INPUT', stream: 'stdout' },
  { relative: '../recovery/evm-cli.mjs', code: 'TRUST_CONTEXT_REQUIRED', stream: 'stdout' },
];
const isolatedEnv = () => ({ PATH: process.env.PATH, TZ: process.env.TZ ?? 'UTC' });
async function familyPaths(t) {
  const { dir } = await fixture(t), paths = [];
  for (const [index, item] of family.entries()) {
    const path = fileURLToPath(new URL(item.relative, import.meta.url)), link = join(dir, `family ${index}.mjs`);
    await symlink(path, link); paths.push({ ...item, path, link });
  }
  return paths;
}

test('Sepolia deploy and both recovery tools remain inert under eval imports naming argv[1]', async t => {
  for (const item of await familyPaths(t)) for (const path of [item.path, item.link]) {
    const result = childNode(['--input-type=module', '-e', 'await import(process.argv[1])', path], { env: isolatedEnv() });
    assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0, item.relative);
    assert.equal(result.stdout, '', 'import must not enter deployment, recovery packaging or recovery execution'); assert.equal(result.stderr, '');
  }
});

test('Sepolia deploy and both recovery tools retain direct and symlink input refusals', async t => {
  for (const item of await familyPaths(t)) for (const path of [item.path, item.link]) {
    const result = childNode([path], { env: isolatedEnv() });
    assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 1, item.relative);
    const expected = item.stream === 'stderr' ? { ok: false, code: item.code } : { ok: false, error: { code: item.code } };
    assert.deepEqual(JSON.parse(result[item.stream]), expected);
    assert.equal(result[item.stream === 'stderr' ? 'stdout' : 'stderr'], '');
  }
});

test('static build, parser fuzz and import-boundary libraries remain inert under matching eval imports', async t => {
  const { dir } = await fixture(t);
  const libraries = ['../../apps/web/scripts/build.mjs', '../fuzz-evm-agreement-input.mjs', '../check-import-boundaries.mjs'];
  for (const [index, relative] of libraries.entries()) {
    const path = fileURLToPath(new URL(relative, import.meta.url)), link = join(dir, `library ${index}.mjs`);
    await symlink(path, link);
    for (const imported of [path, link]) {
      // Two dummy arguments force BUILD_ARGUMENTS before any artifact write if the old build guard regresses.
      // Fuzz rejects them; the boundary check sees an empty temporary tree, never the source checkout.
      const result = childNode(['--input-type=module', '-e', 'await import(process.argv[1])', imported, dir, 'unused'], { env: isolatedEnv() });
      assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0, relative);
      assert.equal(result.stdout, '', 'a library import must not build artifacts, fuzz or run boundary checks'); assert.equal(result.stderr, '');
    }
  }
});

test('query and fragment preloads cannot impersonate the real acceptance, deploy or recovery entry', async t => {
  const { link } = await fixture(t);
  const targets = [{ path: entry, link, status: 2, stream: 'stdout', expected: { ok: false, error: { code: 'INVALID_INPUT' } } },
    ...(await familyPaths(t)).map(item => ({ ...item, status: 1, expected: item.stream === 'stderr' ? { ok: false, code: item.code } : { ok: false, error: { code: item.code } } }))];
  for (const item of targets) for (const path of [item.path, item.link]) for (const part of ['search', 'hash']) {
    const preload = pathToFileURL(path); preload[part] = 'entry-test-preload';
    const result = childNode(['--import', preload.href, path], { env: isolatedEnv() });
    assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, item.status);
    assert.equal(result[item.stream].trim().split('\n').length, 1, 'only the real entry may emit its report');
    assert.deepEqual(JSON.parse(result[item.stream]), item.expected);
    assert.equal(result[item.stream === 'stderr' ? 'stdout' : 'stderr'], '');
  }
});

test('encoded literal question/hash filenames remain valid entries without duplicate execution for empty URL suffixes', async t => {
  const { dir } = await fixture(t), path = join(dir, 'literal ?#.mjs'), link = join(dir, 'linked ?#.mjs');
  const helper = new URL('../lib/is-main.mjs', import.meta.url).href;
  await writeFile(path, `import { isMain } from ${JSON.stringify(helper)}; if (isMain(import.meta.url)) console.log('LITERAL-MAIN');\n`);
  await symlink(path, link);
  for (const entryPath of [path, link]) for (const suffix of ['', '?', '#']) {
    const args = suffix ? ['--import', pathToFileURL(entryPath).href + suffix, entryPath] : [entryPath];
    const result = childNode(args, { env: isolatedEnv() });
    assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0);
    assert.equal(result.stdout, 'LITERAL-MAIN\n'); assert.equal(result.stderr, '');
  }
});


test('offline acceptance CLI rejects nonregular and adversarial evidence inputs with fixed JSON errors', async t => {
  const { dir, candidatePath, recordsPath } = await fixture(t);
  const linkedCandidate = join(dir, 'linked-candidate.json');
  await symlink(candidatePath, linkedCandidate);
  for (const path of [linkedCandidate, dir]) {
    assert.deepEqual(report(run(entry, [path, recordsPath]), 2), { ok: false, error: { code: 'INVALID_INPUT' } });
  }

  const oversized = join(dir, 'oversized-candidate.json');
  await writeFile(oversized, Buffer.alloc(4 * 1024 * 1024 + 1, 0x20));
  assert.deepEqual(report(run(entry, [oversized, recordsPath]), 2), { ok: false, error: { code: 'LIMIT_EXCEEDED' } });

  const duplicateKey = join(dir, 'duplicate-key-candidate.json');
  const candidate = await readFile(candidatePath, 'utf8');
  assert.ok(candidate.includes('"format":'));
  await writeFile(duplicateKey, candidate.replace('"format":', '"format":"unexpected","format":'));
  assert.deepEqual(report(run(entry, [duplicateKey, recordsPath]), 2), { ok: false, error: { code: 'INVALID_INPUT' } });

  const deep = join(dir, 'deeply-nested-records.json');
  await writeFile(deep, '['.repeat(17) + '0' + ']'.repeat(17));
  assert.deepEqual(report(run(entry, [candidatePath, deep]), 2), { ok: false, error: { code: 'LIMIT_EXCEEDED' } });

  const invalidUtf8 = join(dir, 'invalid-utf8-records.json');
  await writeFile(invalidUtf8, Buffer.from([0xc3, 0x28]));
  assert.deepEqual(report(run(entry, [candidatePath, invalidUtf8]), 2), { ok: false, error: { code: 'INVALID_INPUT' } });
});
