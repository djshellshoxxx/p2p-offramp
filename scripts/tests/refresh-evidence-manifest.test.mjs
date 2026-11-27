import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { MANIFEST_PATH, refreshEvidenceManifest } from '../governance/refresh-evidence-manifest.mjs';
import { checkEvidenceBinding, gitReadCommitted } from '../governance/evidence.mjs';
import { resolveTool } from '../lib/tool-path.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
// Owned paths bind the working tree; the non-owned (sourceCommit) behaviour is covered below.
const names = Array.from({ length: 7 }, (_, i) => `docs/execution/fixture/file-${i}.txt`);
const COMMIT = 'a'.repeat(40);
/** Injected committed-bytes port: the fixture's files as first written. */
const committed = (_commit, path) => Buffer.from(`bytes of ${path}\n`);

/** A temporary repository with seven bound files and a manifest in the repository's own layout. */
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'p2p-evidence-manifest-')));
  const files = [];
  for (const name of names) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), `bytes of ${name}\n`);
    files.push({ path: name, sha256: sha(`bytes of ${name}\n`) });
  }
  const manifest = { format: 'p2p-offramp/assurance-local-evidence/v2', scope: 'fixture', sourceCommit: COMMIT, files };
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  await mkdir(dirname(join(root, MANIFEST_PATH)), { recursive: true });
  await writeFile(join(root, MANIFEST_PATH), text);
  return { root, text, cleanup: () => rm(root, { recursive: true, force: true }) };
}
const manifestText = root => readFile(join(root, MANIFEST_PATH), 'utf8');

test('a no-op run on a temp copy of the real manifest and its files is byte-identical', async () => {
  const repo = await realpath(new URL('../../', import.meta.url));
  const real = await readFile(join(repo, MANIFEST_PATH), 'utf8');
  const root = await realpath(await mkdtemp(join(tmpdir(), 'p2p-evidence-copy-')));
  try {
    for (const path of [MANIFEST_PATH, ...JSON.parse(real).files.map(row => row.path)]) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      try { await copyFile(join(repo, path), join(root, path)); } catch { /* a non-owned file may be gone; its row binds sourceCommit */ }
    }
    // The copy has no git history, so its ancestry check is explicitly skipped; check:governance covers the real
    // sourceCommit. A first run settles any row made stale by uncommitted work; it may change hash strings only.
    const first = await refreshEvidenceManifest({ root, allowLocal: true, readCommitted: (commit, path) => gitReadCommitted(repo, commit, path) });
    let expected = real;
    // Anchor each expected replacement on its path: several rows can share a hash (for example of "[]").
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const change of first.changed) {
      const row = new RegExp(`("path":\\s*"${escape(change.path)}",\\s*"sha256":\\s*")${change.old}(")`, 'g');
      assert.equal((expected.match(row) ?? []).length, 1, `exactly one row for ${change.path}`);
      expected = expected.replace(row, (_match, head, tail) => `${head}${change.new}${tail}`);
    }
    assert.equal(await manifestText(root), expected);
    const settled = await manifestText(root);
    const second = await refreshEvidenceManifest({ root, allowLocal: true, readCommitted: (commit, path) => gitReadCommitted(repo, commit, path) });
    assert.deepEqual(second.changed, []);
    assert.equal(second.written, false);
    assert.equal(second.text, settled);
    assert.equal(await manifestText(root), settled, 'byte-identical after a no-op run');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a changed file updates only its row; --check reports it without writing', async () => {
  const { root, text, cleanup } = await fixture();
  try {
    await writeFile(join(root, names[3]), 'changed bytes\n');
    // No git repository: the main-ancestry check refuses unless a fixture opts out explicitly.
    await assert.rejects(refreshEvidenceManifest({ root, check: true }), { code: 'MAIN_ANCESTRY_UNAVAILABLE' });
    const checked = await refreshEvidenceManifest({ root, check: true, allowLocal: true });
    const row = { path: names[3], old: sha(`bytes of ${names[3]}\n`), new: sha('changed bytes\n') };
    assert.deepEqual(checked.changed, [row]);
    assert.equal(checked.written, false);
    assert.equal(await manifestText(root), text, 'check mode never writes');
    const result = await refreshEvidenceManifest({ root, allowLocal: true });
    assert.equal(result.written, true);
    const after = await manifestText(root);
    assert.equal(after, text.replace(row.old, row.new), 'only that hash changed');
    assert.deepEqual((await refreshEvidenceManifest({ root, check: true, allowLocal: true })).changed, []);
  } finally { await cleanup(); }
});

test('adding or removing a path is refused and leaves the manifest unchanged', async () => {
  const { root, text, cleanup } = await fixture();
  try {
    await mkdir(join(root, 'evidence'), { recursive: true }).then(() => writeFile(join(root, 'evidence/new.txt'), 'new\n'));
    await assert.rejects(refreshEvidenceManifest({ root, paths: ['evidence/new.txt'], allowLocal: true }), { code: 'NOT_IN_MANIFEST' });
    await unlink(join(root, names[2]));
    await assert.rejects(refreshEvidenceManifest({ root, allowLocal: true }), { code: 'MISSING_FILE' });
    assert.equal(await manifestText(root), text);
  } finally { await cleanup(); }
});

test('a path or symlink escaping the repository is refused', async () => {
  const { root, text, cleanup } = await fixture();
  const outside = await realpath(await mkdtemp(join(tmpdir(), 'p2p-evidence-outside-')));
  try {
    const escaping = text.replace(`"${names[1]}"`, '"evidence/../../outside.txt"');
    await writeFile(join(root, MANIFEST_PATH), escaping);
    await assert.rejects(refreshEvidenceManifest({ root, allowLocal: true }), { code: 'INVALID_PATH' });
    await writeFile(join(root, MANIFEST_PATH), text);
    await writeFile(join(outside, 'secret.txt'), 'outside\n');
    await unlink(join(root, names[5]));
    await symlink(join(outside, 'secret.txt'), join(root, names[5]));
    await assert.rejects(refreshEvidenceManifest({ root, allowLocal: true }), { code: 'ESCAPES_REPOSITORY' });
    assert.equal(await manifestText(root), text);
  } finally {
    await cleanup();
    await rm(outside, { recursive: true, force: true });
  }
});

const git = (cwd, ...args) => execFileSync(resolveTool('git'), ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).trim();
const BOUND = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts', 'src/f.ts'];

/**
 * Own temporary git repository: non-owned sources committed first, then an owned manifest binds that commit.
 * refs/remotes/origin/main points at the sources commit, as if it were merged.
 */
async function gitFixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'p2p-evidence-git-')));
  git(root, 'init', '-q');
  for (const name of [...BOUND]) { await mkdir(dirname(join(root, name)), { recursive: true }); await writeFile(join(root, name), `source ${name}\n`); }
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'sources');
  const commit = git(root, 'rev-parse', 'HEAD');
  git(root, 'update-ref', 'refs/remotes/origin/main', commit);
  const owned = 'docs/execution/fixture/owned.txt';
  await mkdir(dirname(join(root, owned)), { recursive: true }); await writeFile(join(root, owned), 'owned\n');
  const files = [...BOUND, owned].map(path => ({ path, sha256: sha(path === owned ? 'owned\n' : `source ${path}\n`) }));
  await mkdir(dirname(join(root, MANIFEST_PATH)), { recursive: true });
  await writeFile(join(root, MANIFEST_PATH), `${JSON.stringify({ format: 'p2p-offramp/assurance-local-evidence/v2', scope: 'fixture', sourceCommit: commit, files }, null, 2)}\n`);
  return { root, commit, cleanup: () => rm(root, { recursive: true, force: true }) };
}
const rewriteHash = async (root, path, hash) => {
  const text = await manifestText(root); const manifest = JSON.parse(text);
  manifest.files.find(row => row.path === path).sha256 = hash;
  await writeFile(join(root, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
};

test('a later edit to a bound non-owned file is stale, not a failure; a wrong recorded hash or owned drift fails', async () => {
  const { root, commit, cleanup } = await gitFixture();
  try {
    const clean = await checkEvidenceBinding({ root });
    assert.deepEqual(clean.stale, []); assert.equal(clean.sourceCommit, commit); assert.equal(clean.owned, 1); assert.equal(clean.bound, 6);
    assert.equal(clean.mainAncestry, 'checked');
    // Another owner edits a bound file in a later commit: still passes, listed stale, never current.
    await writeFile(join(root, BOUND[2]), 'edited later\n'); git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'later edit');
    const drifted = await checkEvidenceBinding({ root });
    assert.deepEqual(drifted.stale, [BOUND[2]]);
    // A deleted bound file is also stale rather than a failure.
    await rm(join(root, BOUND[4]));
    assert.deepEqual((await checkEvidenceBinding({ root })).stale, [BOUND[2], BOUND[4]].sort());
    // Refresh without --commit never rewrites a non-owned row to match drifted bytes.
    const before = await manifestText(root);
    assert.equal((await refreshEvidenceManifest({ root })).changed.length, 0);
    assert.equal(await manifestText(root), before);
    // Tampered record: the hash no longer matches the bytes at sourceCommit.
    await rewriteHash(root, BOUND[0], sha('something else\n'));
    await assert.rejects(checkEvidenceBinding({ root }), { code: 'RECORDED_HASH_MISMATCH' });
    await assert.rejects(refreshEvidenceManifest({ root }), { code: 'RECORDED_HASH_MISMATCH' });
    await rewriteHash(root, BOUND[0], sha(`source ${BOUND[0]}\n`));
    // Owned rows stay strict against the working tree.
    await writeFile(join(root, 'docs/execution/fixture/owned.txt'), 'changed\n');
    await assert.rejects(checkEvidenceBinding({ root }), { code: 'OWNED_ROW_MISMATCH' });
  } finally { await cleanup(); }
});

test('moving to a new commit rewrites bound rows to its bytes; a commit not on origin/main is refused', async () => {
  const { root, commit, cleanup } = await gitFixture();
  try {
    await writeFile(join(root, BOUND[1]), 'edited later\n'); git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'later edit');
    const next = git(root, 'rev-parse', 'HEAD');
    await assert.rejects(refreshEvidenceManifest({ root, commit: next }), { code: 'COMMIT_NOT_ON_MAIN' });
    await assert.rejects(refreshEvidenceManifest({ root, commit: '--output=x', allowLocal: true }), { code: 'INVALID_COMMIT' });
    const result = await refreshEvidenceManifest({ root, commit: next, allowLocal: true });
    assert.deepEqual(result.changed.map(change => change.path), ['sourceCommit', BOUND[1]]);
    // A manifest moved to an unmerged commit is refused by the checker and by --check until that commit is merged.
    await assert.rejects(checkEvidenceBinding({ root }), { code: 'COMMIT_NOT_ON_MAIN' });
    await assert.rejects(refreshEvidenceManifest({ root, check: true }), { code: 'COMMIT_NOT_ON_MAIN' });
    git(root, 'update-ref', 'refs/remotes/origin/main', next);
    const checked = await checkEvidenceBinding({ root });
    assert.equal(checked.sourceCommit, next); assert.notEqual(next, commit); assert.deepEqual(checked.stale, []);
    assert.deepEqual((await refreshEvidenceManifest({ root, check: true })).changed, []);
  } finally { await cleanup(); }
});
