/**
 * Evidence-manifest binding for the assurance packet.
 *
 * Rows owned by this tooling (docs/execution, packages/governance, ...) are checked strictly against the
 * working tree. Every other row belongs to another owner and is bound to the bytes at the recorded
 * `sourceCommit`: sha256(git show <sourceCommit>:<path>) must equal the recorded hash. Later edits to such a
 * file are reported as `stale`, never as a failure, and a stale row is never evidence that the bytes are current.
 * `sourceCommit` itself must be on main (see `gitAssertOnMain`): bytes bound to an unmerged commit prove nothing,
 * however well their hashes match.
 * Importing this module needs no git; only the default ports run git, always with an argument array.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
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

/**
 * The only ref that counts as main. It is read by its exact full name (`show-ref --verify`, no short-name lookup), so no
 * branch or tag called `origin/main` or `refs/remotes/origin/main` can stand in for it, and a symbolic ref is refused.
 * Locally it is whatever was last fetched; in CI it is the fetched GitHub branch (checkout with fetch-depth 0).
 */
export const MAIN_REF = 'refs/remotes/origin/main';

/**
 * Refuse unless `commit` names a commit object that is `MAIN_REF` or one of its ancestors, in the repository whose top
 * level is `root`. Fail-closed: another repository found above `root`, a shallow history, a missing or symbolic ref, an
 * object that is absent or not a commit, and any other git error are refusals, never a pass.
 */
export function gitAssertOnMain(root, commit) {
  if (typeof commit !== 'string' || !COMMIT_PATTERN.test(commit)) refuse('INVALID_COMMIT', String(commit));
  const git = args => execFileSync(resolveTool('git'), args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const answer = (args, code, detail) => { try { return git(args); } catch { return refuse(code, detail); } };
  // Git would otherwise answer from any repository found by walking up from a directory without its own .git.
  const top = answer(['rev-parse', '--show-toplevel'], 'MAIN_ANCESTRY_UNAVAILABLE', 'no git repository');
  if (realpathSync(top) !== realpathSync(root)) refuse('MAIN_ANCESTRY_UNAVAILABLE', 'root is not the repository top level');
  // A shallow history can hide the path from a merged commit to main; refuse it instead of a misleading answer.
  const shallow = answer(['rev-parse', '--is-shallow-repository'], 'MAIN_ANCESTRY_UNAVAILABLE', 'shallow state unknown');
  if (shallow !== 'false') refuse('SHALLOW_HISTORY', 'full history is required (fetch-depth 0)');
  let symbolic = true;
  try { git(['symbolic-ref', '--quiet', MAIN_REF]); } catch { symbolic = false; }
  if (symbolic) refuse('MAIN_REF_UNAVAILABLE', `${MAIN_REF} is a symbolic ref`);
  const main = answer(['show-ref', '--verify', '--hash', MAIN_REF], 'MAIN_REF_UNAVAILABLE', MAIN_REF);
  if (!COMMIT_PATTERN.test(main) || answer(['cat-file', '-t', main], 'MAIN_REF_UNAVAILABLE', MAIN_REF) !== 'commit') refuse('MAIN_REF_UNAVAILABLE', MAIN_REF);
  // The id must be a commit itself: `git show <tree or tag id>:<path>` would read bytes no main commit binds.
  if (answer(['cat-file', '-t', commit], 'MAIN_ANCESTRY_UNAVAILABLE', commit) !== 'commit') refuse('INVALID_COMMIT', commit);
  // Exit status 1 means "not an ancestor". Once both ids are known commits no other failure is expected; any that
  // happens is still not an answer.
  try { git(['merge-base', '--is-ancestor', commit, main]); }
  catch (error) { return refuse(error?.status === 1 ? 'COMMIT_NOT_ON_MAIN' : 'MAIN_ANCESTRY_UNAVAILABLE', commit); }
  return commit;
}

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
 * Verify the manifest. Throws EvidenceRefusal on a structural problem, a sourceCommit that is not on main, an owned
 * row that no longer matches the working tree, or a recorded hash that does not match the bytes at sourceCommit.
 * Returns the stale rows. Only `allowLocal: true` skips the main-ancestry check; it exists for fixtures, and the
 * maintained entry points never pass it.
 */
export async function checkEvidenceBinding({
  root, allowLocal = false, readCommitted = (commit, path) => gitReadCommitted(root, commit, path),
} = {}) {
  const base = await realpath(root);
  const manifest = parseManifest(await readFile(await rowTarget(base, MANIFEST_PATH), 'utf8'));
  // Ancestry comes before any row: matching hashes at an unmerged commit are not evidence.
  const mainAncestry = allowLocal === true ? 'skipped-allow-local' : (gitAssertOnMain(base, manifest.sourceCommit), 'checked');
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
  return { sourceCommit: manifest.sourceCommit, mainAncestry, rows: manifest.files.length, owned, bound, stale: stale.sort() };
}
