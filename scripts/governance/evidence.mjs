/**
 * Evidence-manifest binding for the assurance packet.
 *
 * Rows owned by this tooling (docs/execution, packages/governance, ...) are checked strictly against the
 * working tree. Every other row belongs to another owner and is bound to the bytes at the recorded
 * `sourceCommit`: sha256(git show <sourceCommit>:<path>) must equal the recorded hash. Later edits to such a
 * file are reported as `stale`, never as a failure, and a stale row is never evidence that the bytes are current.
 * Importing this module needs no git; only the default `readCommitted` runs git, with an argument array.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { resolveTool } from '../lib/tool-path.mjs';

export const MANIFEST_PATH = 'docs/execution/assurance/evidence-manifest.json';
export const MANIFEST_FORMAT = 'p2p-offramp/assurance-local-evidence/v2';
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const PATH_PATTERN = /^[A-Za-z0-9_./-]+$/;
export const HASH_PATTERN = /^[0-9a-f]{64}$/;
export const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
/** Paths this tooling owns; they are not necessarily present at sourceCommit. */
export const OWNED_PREFIXES = Object.freeze([
  'docs/execution/', 'docs/governance/', 'docs/wiki-source/', 'packages/governance/', 'packages/claims/',
  'scripts/governance/', 'scripts/docs/', 'scripts/lab/', 'scripts/lib/tool-path.mjs',
]);
export const isOwned = path => OWNED_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix));
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export class EvidenceRefusal extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.code = code; }
}
export const refuse = (code, detail) => { throw new EvidenceRefusal(code, detail); };

/** Bytes of `path` at `commit`, via git with an argument array and a bounded buffer. */
export function gitReadCommitted(root, commit, path) {
  if (!COMMIT_PATTERN.test(commit) || !PATH_PATTERN.test(path)) refuse('INVALID_PATH', path);
  try {
    return execFileSync(resolveTool('git'), ['show', `${commit}:${path}`], {
      cwd: root, maxBuffer: MAX_FILE_BYTES + 1, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch { return refuse('COMMITTED_BYTES_UNAVAILABLE', `${commit}:${path}`); }
}

export function validPath(path) {
  if (typeof path !== 'string' || !PATH_PATTERN.test(path) || path.split('/').includes('..') || path.startsWith('/')) refuse('INVALID_PATH', String(path));
}

/** Resolve a row to a contained regular file; returns null when missing and `optional`. */
export async function rowTarget(root, path, optional = false) {
  validPath(path);
  let target;
  try { target = await realpath(resolve(root, path)); }
  catch { return optional ? null : refuse('MISSING_FILE', path); }
  // realpath resolves symlinks, so a link pointing outside the repository fails this containment check.
  if (!target.startsWith(root + sep)) refuse('ESCAPES_REPOSITORY', path);
  const info = await stat(target);
  if (!info.isFile()) refuse('NOT_A_FILE', path);
  if (info.size > MAX_FILE_BYTES) refuse('FILE_TOO_LARGE', path);
  return target;
}

/** Shape check shared by the checker and the refresh tool. Returns the parsed manifest. */
export function parseManifest(original) {
  let manifest;
  try { manifest = JSON.parse(original); } catch { return refuse('INVALID_MANIFEST', 'not JSON'); }
  const keys = manifest !== null && typeof manifest === 'object' ? Object.keys(manifest).sort().join() : '';
  if (keys !== 'files,format,scope,sourceCommit') refuse('INVALID_MANIFEST', 'keys');
  if (manifest.format !== MANIFEST_FORMAT || !Array.isArray(manifest.files)) refuse('INVALID_MANIFEST', 'format');
  if (typeof manifest.sourceCommit !== 'string' || !COMMIT_PATTERN.test(manifest.sourceCommit)) refuse('INVALID_MANIFEST', 'sourceCommit');
  if (manifest.files.length <= 5 || manifest.files.length > 64) refuse('INVALID_MANIFEST', 'row count');
  const listed = new Set();
  for (const row of manifest.files) {
    const rowKeys = row !== null && typeof row === 'object' ? Object.keys(row) : [];
    if (rowKeys.length !== 2 || rowKeys[0] !== 'path' || rowKeys[1] !== 'sha256') refuse('INVALID_MANIFEST', 'row shape');
    if (typeof row.sha256 !== 'string' || !HASH_PATTERN.test(row.sha256)) refuse('INVALID_MANIFEST', 'row hash');
    validPath(row.path);
    if (listed.has(row.path)) refuse('DUPLICATE_PATH', row.path);
    listed.add(row.path);
  }
  return manifest;
}

/**
 * Verify the manifest. Throws EvidenceRefusal on a structural problem, an owned row that no longer matches the
 * working tree, or a recorded hash that does not match the bytes at sourceCommit. Returns the stale rows.
 */
export async function checkEvidenceBinding({ root, readCommitted = (commit, path) => gitReadCommitted(root, commit, path) } = {}) {
  const base = await realpath(root);
  const manifest = parseManifest(await readFile(await rowTarget(base, MANIFEST_PATH), 'utf8'));
  const stale = [];
  let owned = 0, bound = 0;
  for (const row of manifest.files) {
    if (isOwned(row.path)) {
      owned++;
      const target = await rowTarget(base, row.path);
      if (sha256(await readFile(target)) !== row.sha256) refuse('OWNED_ROW_MISMATCH', row.path);
      continue;
    }
    bound++;
    const committed = readCommitted(manifest.sourceCommit, row.path);
    if (committed.length > MAX_FILE_BYTES || sha256(committed) !== row.sha256) refuse('RECORDED_HASH_MISMATCH', row.path);
    const target = await rowTarget(base, row.path, true);
    if (target === null || sha256(await readFile(target)) !== row.sha256) stale.push(row.path);
  }
  return { sourceCommit: manifest.sourceCommit, rows: manifest.files.length, owned, bound, stale: stale.sort() };
}
