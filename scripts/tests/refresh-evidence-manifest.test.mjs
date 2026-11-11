import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { MANIFEST_PATH, refreshEvidenceManifest } from '../governance/refresh-evidence-manifest.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const names = Array.from({ length: 7 }, (_, i) => `evidence/file-${i}.txt`);

/** A temporary repository with seven bound files and a manifest in the repository's own layout. */
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'p2p-evidence-manifest-')));
  const files = [];
  for (const name of names) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), `bytes of ${name}\n`);
    files.push({ path: name, sha256: sha(`bytes of ${name}\n`) });
  }
  const manifest = { format: 'p2p-offramp/assurance-local-evidence/v1', scope: 'fixture', files };
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
      await copyFile(join(repo, path), join(root, path));
    }
    // A first run settles any row made stale by uncommitted work; it may change hash strings only.
    const first = await refreshEvidenceManifest({ root });
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
    const second = await refreshEvidenceManifest({ root });
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
    const checked = await refreshEvidenceManifest({ root, check: true });
    const row = { path: names[3], old: sha(`bytes of ${names[3]}\n`), new: sha('changed bytes\n') };
    assert.deepEqual(checked.changed, [row]);
    assert.equal(checked.written, false);
    assert.equal(await manifestText(root), text, 'check mode never writes');
    const result = await refreshEvidenceManifest({ root });
    assert.equal(result.written, true);
    const after = await manifestText(root);
    assert.equal(after, text.replace(row.old, row.new), 'only that hash changed');
    assert.deepEqual((await refreshEvidenceManifest({ root, check: true })).changed, []);
  } finally { await cleanup(); }
});

test('adding or removing a path is refused and leaves the manifest unchanged', async () => {
  const { root, text, cleanup } = await fixture();
  try {
    await writeFile(join(root, 'evidence/new.txt'), 'new\n');
    await assert.rejects(refreshEvidenceManifest({ root, paths: ['evidence/new.txt'] }), { code: 'NOT_IN_MANIFEST' });
    await unlink(join(root, names[2]));
    await assert.rejects(refreshEvidenceManifest({ root }), { code: 'MISSING_FILE' });
    assert.equal(await manifestText(root), text);
  } finally { await cleanup(); }
});

test('a path or symlink escaping the repository is refused', async () => {
  const { root, text, cleanup } = await fixture();
  const outside = await realpath(await mkdtemp(join(tmpdir(), 'p2p-evidence-outside-')));
  try {
    const escaping = text.replace(`"${names[1]}"`, '"evidence/../../outside.txt"');
    await writeFile(join(root, MANIFEST_PATH), escaping);
    await assert.rejects(refreshEvidenceManifest({ root }), { code: 'INVALID_PATH' });
    await writeFile(join(root, MANIFEST_PATH), text);
    await writeFile(join(outside, 'secret.txt'), 'outside\n');
    await unlink(join(root, names[5]));
    await symlink(join(outside, 'secret.txt'), join(root, names[5]));
    await assert.rejects(refreshEvidenceManifest({ root }), { code: 'ESCAPES_REPOSITORY' });
    assert.equal(await manifestText(root), text);
  } finally {
    await cleanup();
    await rm(outside, { recursive: true, force: true });
  }
});
