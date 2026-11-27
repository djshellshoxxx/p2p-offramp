/** Execute the real draft-record generator against isolated Git references and immutable source bytes. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { resolveTool } from '../lib/tool-path.mjs';

const repo = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
const isolated = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const git = (root, ...args) => execFileSync(resolveTool('git'), [
  '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid',
  '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args,
], { cwd: root, env: isolated, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const copyPath = 'apps/web/src/ui/locale/en.ts';
const bound = [
  'packages/storage/src/vault-crypto.ts', 'packages/storage/test/vault-crypto.test.mjs',
  'packages/nostr-crypto/src/nip44.ts', 'packages/nostr-crypto/test/nip44.test.mjs',
  'packages/transport/src/policy.ts', 'packages/transport/test/policy.test.mjs',
];
const pages = ['Home', 'Getting-Started', 'Privacy-and-Recovery', 'Wallet-and-QR-Safety',
  'Architecture-and-Development', 'Codespaces-Test-Lab', 'Security-and-Release'];
const records = ['docs/wiki-source/claims-register.json', 'docs/wiki-source/docs-manifest.json'];
const sentinel = 'a refused generator must preserve this record\n';

async function populate(root) {
  const copy = async path => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await copyFile(join(repo, path), join(root, path));
  };
  for (const path of ['scripts/docs/generate.py', 'scripts/docs/copy-source.mjs',
    'scripts/test-support/register-tsx.mjs', 'scripts/test-support/tsx-hooks.mjs', copyPath]) await copy(path);
  for (const name of ['claims', 'schemas']) {
    await copy(`packages/${name}/index.ts`);
    await cp(join(repo, 'packages', name, 'src'), join(root, 'packages', name, 'src'), { recursive: true });
  }
  await writeFile(join(root, 'package.json'), '{"type":"module"}\n');
  await symlink(join(repo, 'node_modules'), join(root, 'node_modules'), 'junction');
  for (const path of bound) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), `bound fixture ${path}\n`);
  }
  await mkdir(join(root, 'docs/wiki-source'), { recursive: true });
  for (const name of pages) await writeFile(join(root, `docs/wiki-source/${name}.md`), `# Fixture ${name}\n`);
}

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'p2p-docs-generator-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await populate(root);
  git(root, 'init', '-q', '--template=', '-b', 'main');
  git(root, 'add', '--', copyPath, ...bound);
  git(root, 'commit', '-q', '-m', 'bound source fixture');
  const main = git(root, 'rev-parse', 'HEAD');
  git(root, 'update-ref', 'refs/remotes/origin/main', main);
  const unmerged = git(root, 'commit-tree', `${main}^{tree}`, '-p', main, '-m', 'unmerged identical bytes');
  return { root, main, unmerged };
}

const generate = (root, ...args) => spawnSync(resolveTool('python'), ['scripts/docs/generate.py', ...args], {
  cwd: root, env: isolated, encoding: 'utf8', timeout: 60_000,
});
async function unchangedRefusal(root, args, reason) {
  for (const path of records) await writeFile(join(root, path), sentinel);
  const result = generate(root, ...args);
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0, result.stderr);
  assert.match(result.stderr, reason);
  for (const path of records) assert.equal(await readFile(join(root, path), 'utf8'), sentinel);
}
async function generated(root, args, commit) {
  const result = generate(root, ...args);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const [register, manifest] = await Promise.all(records.map(async path => JSON.parse(await readFile(join(root, path), 'utf8'))));
  assert.equal(register.sourceCommit, commit);
  assert.equal(manifest.sourceCommit, commit);
  assert.deepEqual(register.reviewers, []);
  assert.deepEqual(manifest.reviewers, []);
  assert.equal(register.approvedRelease, null);
  assert.equal(manifest.approvedRelease, null);
  assert.equal(manifest.dirtyDraft, true);
  assert.ok(register.claims.every(claim => ['proposed', 'unsupported'].includes(claim.status) && claim.reviewedAt === null));
  return { result, register, manifest };
}

test('generator defaults to HEAD and accepts a genuine main ancestor without changing authored pages', async t => {
  const { root, main, unmerged } = await fixture(t);
  await generated(root, [], main);
  // A later main commit does not invalidate the explicitly selected older main baseline.
  git(root, 'update-ref', 'refs/remotes/origin/main', unmerged);
  await generated(root, [main], main);
  for (const name of pages) assert.equal(await readFile(join(root, `docs/wiki-source/${name}.md`), 'utf8'), `# Fixture ${name}\n`);
});

test('generator refuses unmerged identical bytes, whether selected explicitly or through HEAD', async t => {
  const { root, unmerged } = await fixture(t);
  await unchangedRefusal(root, [unmerged], /COMMIT_NOT_ON_MAIN|sourceCommit is not reachable/);
  git(root, 'update-ref', 'refs/heads/main', unmerged);
  await unchangedRefusal(root, [], /COMMIT_NOT_ON_MAIN|sourceCommit is not reachable/);
});

test('local origin/main branch and tag shadows cannot replace the actual remote tip', async t => {
  const { root, unmerged } = await fixture(t);
  for (const namespace of ['heads', 'tags']) {
    await t.test(namespace, async () => {
      const ref = `refs/${namespace}/origin/main`;
      git(root, 'update-ref', ref, unmerged);
      try {
        await unchangedRefusal(root, [unmerged], /COMMIT_NOT_ON_MAIN|sourceCommit is not reachable/);
        // The ambiguous revision may resolve to the local shadow, but its resolved commit still cannot pass.
        await unchangedRefusal(root, ['origin/main'], /COMMIT_NOT_ON_MAIN|sourceCommit is not reachable/);
      } finally { git(root, 'update-ref', '-d', ref); }
    });
  }
});

test('a missing actual remote ref is refused even with short or full-name shadow refs', async t => {
  const { root, unmerged } = await fixture(t);
  git(root, 'update-ref', '-d', 'refs/remotes/origin/main');
  await unchangedRefusal(root, [unmerged], /MAIN_REF_UNAVAILABLE|sourceCommit is not reachable/);
  for (const namespace of ['heads', 'tags']) for (const name of ['origin/main', 'refs/remotes/origin/main']) {
    await t.test(`${namespace}/${name}`, async () => {
      const ref = `refs/${namespace}/${name}`;
      git(root, 'update-ref', ref, unmerged);
      try { await unchangedRefusal(root, [unmerged], /MAIN_REF_UNAVAILABLE|sourceCommit is not reachable/); }
      finally { git(root, 'update-ref', '-d', ref); }
    });
  }
});

test('symbolic or non-commit main refs are refused before either output record changes', async t => {
  const { root, main, unmerged } = await fixture(t);
  git(root, 'update-ref', '-d', 'refs/remotes/origin/main');
  git(root, 'branch', 'side', unmerged);
  git(root, 'symbolic-ref', 'refs/remotes/origin/main', 'refs/heads/side');
  await unchangedRefusal(root, [unmerged], /MAIN_REF_UNAVAILABLE/);
  git(root, 'symbolic-ref', '--delete', 'refs/remotes/origin/main');
  git(root, 'update-ref', 'refs/remotes/origin/main', `${main}^{tree}`);
  await unchangedRefusal(root, [main], /MAIN_REF_UNAVAILABLE/);
});

test('revision normalization records the actual commit and refuses non-commits or extra arguments', async t => {
  const { root, main } = await fixture(t);
  git(root, 'tag', '-a', '-m', 'annotated fixture', 'annotated', main);
  await generated(root, ['annotated'], main);
  const tree = git(root, 'rev-parse', `${main}^{tree}`);
  const blob = git(root, 'rev-parse', `${main}:${bound[0]}`);
  for (const revision of [tree, blob, 'b'.repeat(40), 'missing-revision', 'HEAD..HEAD']) {
    await unchangedRefusal(root, ['--allow-local', revision], /INVALID_COMMIT/);
  }
  await unchangedRefusal(root, [main, main], /unrecognized arguments/);
  await unchangedRefusal(root, ['--unknown'], /unrecognized arguments/);
});

test('--allow-local explicitly admits an unmerged fixture without promoting its approval fields', async t => {
  const { root, unmerged } = await fixture(t);
  git(root, 'update-ref', '-d', 'refs/remotes/origin/main');
  const { result, register } = await generated(root, ['--allow-local', unmerged], unmerged);
  assert.match(result.stderr, /warning: --allow-local skips the .* ancestry check/);
  const before = await Promise.all(records.map(path => readFile(join(root, path))));
  const path = join(root, copyPath), original = await readFile(path, 'utf8');
  const changed = original.replace('Authenticated encryption observed', 'Later unapproved working-tree copy');
  assert.notEqual(changed, original);
  await writeFile(path, changed);
  await generated(root, ['--allow-local', unmerged], unmerged);
  for (let i = 0; i < records.length; i++) assert.deepEqual(await readFile(join(root, records[i])), before[i]);
  assert.equal(register.copySource.sha256, createHash('sha256').update(original).digest('hex'));
});

test('shallow history and a nested non-repository root cannot supply main ancestry', async t => {
  const { root, main } = await fixture(t);
  const gitDir = git(root, 'rev-parse', '--absolute-git-dir');
  await writeFile(join(gitDir, 'shallow'), `${main}\n`);
  await unchangedRefusal(root, [main], /SHALLOW_HISTORY/);
  await rm(join(gitDir, 'shallow'));
  // Populate every generator input so the ancestor repository would otherwise let this nested invocation pass.
  const nested = join(root, 'nested');
  await mkdir(nested);
  await populate(nested);
  await unchangedRefusal(nested, [main], /MAIN_ANCESTRY_UNAVAILABLE/);
});
