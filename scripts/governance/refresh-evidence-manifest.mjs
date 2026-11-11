/**
 * Refresh SHA-256 rows of docs/execution/assurance/evidence-manifest.json from current file bytes.
 *
 * Packet integrity only: a refreshed row says the manifest binds the current bytes, never that the file was
 * reviewed, reproduced or verified. The path list is fixed: rows are never added, removed or reordered, and a
 * missing or escaping file is refused rather than dropped. Only stale hash strings are rewritten in place, so
 * every other byte of the JSON (key order, indentation, trailing newline) is preserved.
 *
 * Usage: node scripts/governance/refresh-evidence-manifest.mjs [--check] [repo-relative-path ...]
 *   --check  report stale rows and exit 1 if any; never writes.
 *   paths    restrict the refresh to these existing rows; a path that is not already a row is refused.
 */
import { createHash } from 'node:crypto';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../lib/is-main.mjs';

export const MANIFEST_PATH = 'docs/execution/assurance/evidence-manifest.json';
const FORMAT = 'p2p-offramp/assurance-local-evidence/v1';
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const PATH_PATTERN = /^[A-Za-z0-9_./-]+$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

export class ManifestRefusal extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}
const refuse = (code, detail) => { throw new ManifestRefusal(code, detail); };
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

/** Mirrors the containment checks of packages/governance/test/assurance.test.mjs. */
async function rowTarget(root, path) {
  if (typeof path !== 'string' || !PATH_PATTERN.test(path)) refuse('INVALID_PATH', String(path));
  if (path.split('/').includes('..')) refuse('INVALID_PATH', path);
  let target;
  try { target = await realpath(resolve(root, path)); }
  catch { refuse('MISSING_FILE', path); }
  // realpath resolves symlinks, so a link pointing outside the repository fails this containment check.
  if (!target.startsWith(root + sep)) refuse('ESCAPES_REPOSITORY', path);
  const info = await stat(target);
  if (!info.isFile()) refuse('NOT_A_FILE', path);
  if (info.size > MAX_FILE_BYTES) refuse('FILE_TOO_LARGE', path);
  return target;
}

/**
 * Computes (and unless `check`, writes) the refreshed manifest.
 * Returns { changed: [{ path, old, new }], text, written }. Throws ManifestRefusal on any refused input.
 */
export async function refreshEvidenceManifest({ root, paths = null, check = false } = {}) {
  const canonicalRoot = await realpath(root);
  const manifestFile = await rowTarget(canonicalRoot, MANIFEST_PATH);
  const original = await readFile(manifestFile, 'utf8');
  let manifest;
  try { manifest = JSON.parse(original); }
  catch { refuse('INVALID_MANIFEST', 'not JSON'); }
  if (manifest?.format !== FORMAT || !Array.isArray(manifest.files)) refuse('INVALID_MANIFEST', 'format');
  if (manifest.files.length <= 5 || manifest.files.length > 64) refuse('INVALID_MANIFEST', 'row count');
  const listed = new Set();
  for (const row of manifest.files) {
    const keys = row !== null && typeof row === 'object' ? Object.keys(row) : [];
    if (keys.length !== 2 || keys[0] !== 'path' || keys[1] !== 'sha256') refuse('INVALID_MANIFEST', 'row shape');
    if (typeof row.sha256 !== 'string' || !HASH_PATTERN.test(row.sha256)) refuse('INVALID_MANIFEST', 'row hash');
    if (listed.has(row.path)) refuse('DUPLICATE_PATH', row.path);
    listed.add(row.path);
  }
  // The tool never adds rows: a requested path must already be listed.
  const selected = paths === null ? null : new Set(paths);
  for (const path of selected ?? []) if (!listed.has(path)) refuse('NOT_IN_MANIFEST', path);

  const changed = [];
  let text = original;
  for (const row of manifest.files) {
    // Every row is contained and present even when not selected: a missing file is refused, never dropped.
    const target = await rowTarget(canonicalRoot, row.path);
    if (selected !== null && !selected.has(row.path)) continue;
    const digest = createHash('sha256').update(await readFile(target)).digest('hex');
    if (digest === row.sha256) continue;
    const pattern = new RegExp(`("path":\\s*"${escapeRegExp(row.path)}",\\s*"sha256":\\s*")${row.sha256}(")`, 'g');
    const matches = text.match(pattern);
    if (matches === null || matches.length !== 1) refuse('INVALID_MANIFEST', `unlocatable row ${row.path}`);
    text = text.replace(pattern, (_match, head, tail) => `${head}${digest}${tail}`);
    changed.push({ path: row.path, old: row.sha256, new: digest });
  }

  // Invariant: the output differs from the input only in the changed hash strings, same rows in the same order.
  const expected = structuredClone(manifest);
  for (const change of changed) expected.files.find(row => row.path === change.path).sha256 = change.new;
  const produced = JSON.parse(text);
  if (JSON.stringify(produced) !== JSON.stringify(expected)) refuse('INTERNAL_INVARIANT', 'unexpected rewrite');
  const written = !check && changed.length > 0;
  if (written) await writeFile(manifestFile, text);
  return { changed, text, written };
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const paths = args.filter(arg => arg !== '--check');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  try {
    const result = await refreshEvidenceManifest({ root, paths: paths.length ? paths : null, check });
    for (const change of result.changed) {
      console.log(`${check ? 'stale' : 'refreshed'} ${change.path} ${change.old} -> ${change.new}`);
    }
    if (result.changed.length === 0) console.log('evidence manifest current');
    if (check && result.changed.length > 0) process.exitCode = 1;
  } catch (error) {
    const code = error instanceof ManifestRefusal ? error.message : 'REFRESH_FAILED';
    console.error(`refused ${code}`);
    process.exitCode = 2;
  }
}
