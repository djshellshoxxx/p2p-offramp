// Adapted from scripts/lib/tool-path.mjs on branch claude/loving-einstein-xgzvdy (same repository and owner,
// commit 45edcf9), so this harness spawns absolute, non-world-writable tool paths until that module lands on main.
import { accessSync, constants, existsSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/**
 * Resolve a developer tool (solana, solana-test-validator, solana-keygen) to an absolute executable path.
 * Only absolute PATH entries are searched, and a world-writable entry or candidate is skipped, so a planted
 * binary in a shared directory or a relative "." entry is never selected.
 */
export function resolveTool(name, searchPath = process.env.PATH ?? '') {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) throw new Error('TOOL_NAME_INVALID');
  for (const directory of String(searchPath).split(delimiter)) {
    if (!isAbsolute(directory) || worldWritable(directory, true)) continue;
    const candidate = join(directory, name);
    if (worldWritable(candidate, false)) continue;
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not executable here; keep searching the remaining fixed entries.
    }
  }
  throw new Error(`TOOL_NOT_FOUND: ${name}`);
}

/** True when the path is missing, has the wrong kind, or grants write access to every user. */
function worldWritable(path, directory) {
  try {
    const info = statSync(path);
    if (directory ? !info.isDirectory() : !info.isFile()) return true;
    return (info.mode & 0o002) !== 0;
  } catch {
    return true;
  }
}

/**
 * Resolve an operator-supplied path and require that it stays inside one of `roots`. Symlinks are resolved on
 * the nearest existing ancestor, so a link inside a root cannot point the harness outside it.
 */
export function confinedPath(input, roots = [tmpdir()]) {
  const target = resolve(String(input));
  let ancestor = target;
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error('PATH_OUTSIDE_ALLOWED_ROOTS');
    ancestor = parent;
  }
  const real = join(realpathSync(ancestor), relative(ancestor, target));
  for (const root of roots) {
    const rel = relative(realpathSync(root), real);
    if (rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))) return real;
  }
  throw new Error('PATH_OUTSIDE_ALLOWED_ROOTS');
}
