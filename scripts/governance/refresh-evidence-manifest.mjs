/**
 * Refresh SHA-256 rows of docs/execution/assurance/evidence-manifest.json.
 *
 * Packet integrity only: a refreshed row says the manifest binds specific bytes, never that the file was
 * reviewed, reproduced or verified. Rows are never added, removed or reordered, and a missing or escaping file
 * is refused rather than dropped. Only hash strings (and, with --commit, `sourceCommit`) are rewritten in
 * place, so every other byte of the JSON is preserved.
 *
 *  - Owned rows (see evidence.mjs) bind the current working-tree bytes.
 *  - All other rows bind the bytes at `sourceCommit`. Without --commit they must already match it; with
 *    --commit <rev> the manifest is moved to that commit, which must be reachable from origin/main so CI can
 *    resolve it (pass --allow-local only for fixtures).
 *
 * Usage: node scripts/governance/refresh-evidence-manifest.mjs [--check] [--commit <rev>] [--allow-local] [path ...]
 */
import { execFileSync } from 'node:child_process';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isMain } from '../lib/is-main.mjs';
import { resolveTool } from '../lib/tool-path.mjs';
import {
  COMMIT_PATTERN, EvidenceRefusal, MANIFEST_PATH, gitReadCommitted, isOwned, parseManifest, refuse, rowTarget, sha256,
} from './evidence.mjs';

export { MANIFEST_PATH, EvidenceRefusal as ManifestRefusal } from './evidence.mjs';
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
const git = (root, ...args) => execFileSync(resolveTool('git'), args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function resolveCommit(root, revision, allowLocal) {
  if (typeof revision !== 'string' || !/^[A-Za-z0-9_./~^-]{1,128}$/.test(revision) || revision.startsWith('-')) refuse('INVALID_COMMIT', String(revision));
  let commit;
  try { commit = git(root, 'rev-parse', '--verify', `${revision}^{commit}`); } catch { return refuse('INVALID_COMMIT', revision); }
  if (!COMMIT_PATTERN.test(commit)) refuse('INVALID_COMMIT', revision);
  if (!allowLocal) {
    let reachable = true;
    try { git(root, 'merge-base', '--is-ancestor', commit, 'origin/main'); } catch { reachable = false; }
    if (!reachable) refuse('COMMIT_NOT_ON_MAIN', commit);
  }
  return commit;
}

/**
 * Computes (and unless `check`, writes) the refreshed manifest.
 * Returns { changed: [{ path, old, new }], text, written }. Throws EvidenceRefusal on any refused input.
 * `readCommitted(commit, path)` is injectable for tests; it defaults to `git show`.
 */
export async function refreshEvidenceManifest({
  root, paths = null, check = false, commit = null, allowLocal = false,
  readCommitted = (sha, path) => gitReadCommitted(root, sha, path),
} = {}) {
  const canonicalRoot = await realpath(root);
  const manifestFile = await rowTarget(canonicalRoot, MANIFEST_PATH);
  const original = await readFile(manifestFile, 'utf8');
  const manifest = parseManifest(original);
  const listed = new Set(manifest.files.map(row => row.path));
  // The tool never adds rows: a requested path must already be listed.
  const selected = paths === null ? null : new Set(paths);
  for (const path of selected ?? []) if (!listed.has(path)) refuse('NOT_IN_MANIFEST', path);

  const target = commit === null ? manifest.sourceCommit : resolveCommit(canonicalRoot, commit, allowLocal);
  const changed = [];
  let text = original;
  if (target !== manifest.sourceCommit) {
    text = text.replace(`"sourceCommit": "${manifest.sourceCommit}"`, `"sourceCommit": "${target}"`);
    if (text === original) refuse('INVALID_MANIFEST', 'unlocatable sourceCommit');
    changed.push({ path: 'sourceCommit', old: manifest.sourceCommit, new: target });
  }
  for (const row of manifest.files) {
    // Every row is contained and present even when not selected: a missing file is refused, never dropped.
    const owned = isOwned(row.path);
    const file = await rowTarget(canonicalRoot, row.path, !owned);
    if (selected !== null && !selected.has(row.path)) continue;
    // Non-owned rows record the committed bytes; moving to a new commit rewrites them, staying never does.
    const bytes = owned ? await readFile(file) : readCommitted(target, row.path);
    const digest = sha256(bytes);
    if (digest === row.sha256) continue;
    if (!owned && target === manifest.sourceCommit) refuse('RECORDED_HASH_MISMATCH', row.path);
    const pattern = new RegExp(`("path":\\s*"${escapeRegExp(row.path)}",\\s*"sha256":\\s*")${row.sha256}(")`, 'g');
    const matches = text.match(pattern);
    if (matches === null || matches.length !== 1) refuse('INVALID_MANIFEST', `unlocatable row ${row.path}`);
    text = text.replace(pattern, (_match, head, tail) => `${head}${digest}${tail}`);
    changed.push({ path: row.path, old: row.sha256, new: digest });
  }

  // Invariant: the output differs from the input only in sourceCommit and changed hash strings, same rows in order.
  const expected = structuredClone(manifest);
  for (const change of changed) {
    if (change.path === 'sourceCommit') expected.sourceCommit = change.new;
    else expected.files.find(row => row.path === change.path).sha256 = change.new;
  }
  if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(expected)) refuse('INTERNAL_INVARIANT', 'unexpected rewrite');
  const written = !check && changed.length > 0;
  if (written) await writeFile(manifestFile, text);
  return { changed, text, written };
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const allowLocal = args.includes('--allow-local');
  const at = args.indexOf('--commit');
  const commit = at >= 0 ? args[at + 1] ?? '' : null;
  const paths = args.filter((arg, index) => !['--check', '--allow-local', '--commit'].includes(arg) && !(at >= 0 && index === at + 1));
  const root = fileURLToPath(new URL('../../', import.meta.url));
  try {
    const result = await refreshEvidenceManifest({ root, paths: paths.length ? paths : null, check, commit, allowLocal });
    for (const change of result.changed) console.log(`${check ? 'stale' : 'refreshed'} ${change.path} ${change.old} -> ${change.new}`);
    if (result.changed.length === 0) console.log('evidence manifest current');
    if (check && result.changed.length > 0) process.exitCode = 1;
  } catch (error) {
    console.error(`refused ${error instanceof EvidenceRefusal ? error.message : 'REFRESH_FAILED'}`);
    process.exitCode = 2;
  }
}
