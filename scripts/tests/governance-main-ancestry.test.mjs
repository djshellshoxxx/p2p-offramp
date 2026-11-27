/**
 * GOV-1 regressions: both maintained evidence entry points refuse a sourceCommit that is not on main.
 *
 * Each case runs the production CLIs (`check-all.mjs`, as `check:governance` does, and
 * `refresh-evidence-manifest.mjs --check`) as child processes inside their own temporary git repository. The
 * repository holds copies of the governance scripts, the real governance records and the files those records
 * reference. No port is injected, so the real git ancestry check runs. Only `refs/remotes/origin/main` counts as main.
 */
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { MANIFEST_PATH, checkEvidenceBinding } from '../governance/evidence.mjs';
import { resolveTool } from '../lib/tool-path.mjs';

const repo = await realpath(fileURLToPath(new URL('../../', import.meta.url)));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (cwd, ...args) => execFileSync(resolveTool('git'), ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const BOUND = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts', 'src/f.ts'];
const OWNED = 'docs/execution/fixture/owned.txt';
const SCRIPTS = [
  'scripts/governance/check-all.mjs', 'scripts/governance/check.mjs', 'scripts/governance/evidence.mjs',
  'scripts/governance/refresh-evidence-manifest.mjs', 'scripts/lib/is-main.mjs', 'scripts/lib/tool-path.mjs',
];
// check.mjs imports these packages (relative TypeScript imports only).
const PACKAGES = ['packages/governance', 'packages/schemas', 'packages/domain'];

/** Every file the real governance records point to, read with the same field names check.mjs uses. */
async function recordReferences() {
  const paths = new Set();
  for (const name of (await readdir(join(repo, 'docs/governance'))).filter(entry => entry.endsWith('.json'))) {
    const record = JSON.parse(await readFile(join(repo, 'docs/governance', name), 'utf8'));
    for (const key of ['evidencePaths', 'affectedSpecs', 'testEvidencePaths']) for (const path of record[key] ?? []) paths.add(path);
    for (const key of ['threatImpactPath', 'supersededBy']) if (typeof record[key] === 'string') paths.add(record[key]);
  }
  return [...paths];
}

/**
 * A repository whose `main` commit holds the six bound sources, with refs/remotes/origin/main at that commit.
 * `unmerged` is a child of main with the identical tree, so its bound bytes and hashes are the same, but it is
 * not an ancestor of main. The governance tooling is copied into the working tree, uncommitted.
 */
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'p2p-gov1-')));
  git(root, 'init', '-q');
  for (const path of BOUND) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), `source ${path}\n`); }
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'sources');
  const main = git(root, 'rev-parse', 'HEAD');
  git(root, 'update-ref', 'refs/remotes/origin/main', main);
  const unmerged = git(root, 'commit-tree', `${main}^{tree}`, '-p', main, '-m', 'unmerged, same bytes');
  const copy = async path => { await mkdir(dirname(join(root, path)), { recursive: true }); await cp(join(repo, path), join(root, path)); };
  for (const path of [...SCRIPTS, ...await recordReferences()]) await copy(path);
  await cp(join(repo, 'docs/governance'), join(root, 'docs/governance'), { recursive: true });
  for (const pkg of PACKAGES) {
    await copy(`${pkg}/index.ts`);
    await cp(join(repo, pkg, 'src'), join(root, pkg, 'src'), { recursive: true });
  }
  await mkdir(dirname(join(root, OWNED)), { recursive: true }); await writeFile(join(root, OWNED), 'owned\n');
  const writeManifest = sourceCommit => writeFile(join(root, MANIFEST_PATH), `${JSON.stringify({
    format: 'p2p-offramp/assurance-local-evidence/v2', scope: 'fixture', sourceCommit,
    files: [...BOUND, OWNED].map(path => ({ path, sha256: sha(path === OWNED ? 'owned\n' : `source ${path}\n`) })),
  }, null, 2)}\n`);
  await mkdir(dirname(join(root, MANIFEST_PATH)), { recursive: true });
  await writeManifest(main);
  return { root, main, unmerged, writeManifest, cleanup: () => rm(root, { recursive: true, force: true }) };
}

const node = (root, args) => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 60_000 });
/** `check:governance`'s first command, exactly as package.json runs it, against the fixture's copy. */
function checkAll(root, ...extra) {
  const run = node(root, ['--import', join(repo, 'scripts/test-support/register-tsx.mjs'), join(root, 'scripts/governance/check-all.mjs'), ...extra]);
  return { status: run.status, output: JSON.parse(run.stdout.trim().split('\n').at(-1)) };
}
const refresh = (root, ...args) => node(root, [join(root, 'scripts/governance/refresh-evidence-manifest.mjs'), ...args]);
const refusedBoth = (root, reason) => {
  const all = checkAll(root);
  assert.equal(all.status, 1);
  assert.deepEqual(all.output, { ok: false, code: 'GOVERNANCE_PACKET_CHECK_FAILED', reason });
  const checked = refresh(root, '--check');
  assert.equal(checked.status, 2);
  assert.match(checked.stderr, new RegExp(`^refused ${reason}: `, 'm'));
};

test('both entry points accept a sourceCommit on main, and working-tree drift is still reported as stale', async () => {
  const { root, main, cleanup } = await fixture();
  try {
    const clean = checkAll(root);
    assert.equal(clean.status, 0);
    assert.deepEqual(clean.output.evidence, { sourceCommit: main, mainAncestry: 'checked', rows: 7, owned: 1, bound: 6, stale: [] });
    assert.equal(clean.output.authority, 'inert-record-only');
    const checked = refresh(root, '--check');
    assert.equal(checked.status, 0);
    assert.equal(checked.stdout, 'evidence manifest current\n');
    // Another owner edits a bound file: still a pass, listed stale, never current.
    await writeFile(join(root, BOUND[2]), 'edited later\n');
    const drifted = checkAll(root);
    assert.equal(drifted.status, 0);
    assert.deepEqual(drifted.output.evidence.stale, [BOUND[2]]);
    assert.equal(refresh(root, '--check').status, 0);
  } finally { await cleanup(); }
});

test('an unmerged commit with identical bound bytes is refused by both entry points, before any row', async () => {
  const { root, unmerged, writeManifest, cleanup } = await fixture();
  try {
    await writeManifest(unmerged);
    // Every recorded hash matches the bytes at the unmerged commit, so only the ancestry check can refuse it.
    for (const path of BOUND) assert.equal(sha(git(root, 'show', `${unmerged}:${path}`) + '\n'), sha(`source ${path}\n`));
    const before = await readFile(join(root, MANIFEST_PATH), 'utf8');
    refusedBoth(root, 'COMMIT_NOT_ON_MAIN');
    const rewrite = refresh(root);
    assert.equal(rewrite.status, 2);
    assert.equal(await readFile(join(root, MANIFEST_PATH), 'utf8'), before, 'a refused refresh never writes');
    // Ancestry is decided before any committed bytes are read, so no row can mask it.
    let reads = 0;
    await assert.rejects(checkEvidenceBinding({ root, readCommitted: () => { reads++; return Buffer.alloc(0); } }), { code: 'COMMIT_NOT_ON_MAIN' });
    assert.equal(reads, 0);
  } finally { await cleanup(); }
});

test('a missing refs/remotes/origin/main is refused; a local branch or tag named origin/main does not stand in', async () => {
  const { root, main, unmerged, writeManifest, cleanup } = await fixture();
  try {
    git(root, 'update-ref', '-d', 'refs/remotes/origin/main');
    refusedBoth(root, 'MAIN_REF_UNAVAILABLE');
    // Decoys that a short `origin/main` would resolve to (refs/heads/origin/main wins over refs/remotes/...).
    await writeManifest(unmerged);
    git(root, 'branch', 'origin/main', unmerged);
    git(root, 'tag', 'origin/main', unmerged);
    refusedBoth(root, 'MAIN_REF_UNAVAILABLE');
    git(root, 'update-ref', 'refs/remotes/origin/main', main);
    refusedBoth(root, 'COMMIT_NOT_ON_MAIN');
    // Moving to `--commit origin/main` resolves the decoy branch, which is still refused against the full ref.
    const moved = refresh(root, '--commit', 'origin/main');
    assert.equal(moved.status, 2);
    assert.match(moved.stderr, /^refused COMMIT_NOT_ON_MAIN: /m);
  } finally { await cleanup(); }
});

test('a shallow history is refused rather than answered', async () => {
  const { root, main, cleanup } = await fixture();
  try {
    await writeFile(join(root, '.git/shallow'), `${main}\n`);
    assert.equal(git(root, 'rev-parse', '--is-shallow-repository'), 'true');
    refusedBoth(root, 'SHALLOW_HISTORY');
  } finally { await cleanup(); }
});

test('--allow-local is the only bypass: explicit, refresh-only and announced', async () => {
  const { root, unmerged, writeManifest, cleanup } = await fixture();
  try {
    await writeManifest(unmerged);
    const local = refresh(root, '--check', '--allow-local');
    assert.equal(local.status, 0);
    assert.match(local.stderr, /^warning: --allow-local skips the origin\/main ancestry check/m);
    // check-all has no bypass: an extra argument changes nothing.
    assert.equal(checkAll(root, '--allow-local').output.reason, 'COMMIT_NOT_ON_MAIN');
    // In the library only the literal `true` skips the check, and the result says that it was skipped.
    await assert.rejects(checkEvidenceBinding({ root, allowLocal: 'yes' }), { code: 'COMMIT_NOT_ON_MAIN' });
    assert.equal((await checkEvidenceBinding({ root, allowLocal: true })).mainAncestry, 'skipped-allow-local');
  } finally { await cleanup(); }
});
