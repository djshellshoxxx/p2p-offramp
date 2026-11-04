import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';

/**
 * Resolve a developer tool (git, openssl, anvil) to an absolute executable path for child_process calls.
 * Only absolute PATH entries are searched, and an entry that is world-writable, or a candidate file that is
 * world-writable, is skipped, so a planted binary in /tmp or a relative "." entry is never selected.
 * Throws TOOL_NAME_INVALID for anything but a plain file name and TOOL_NOT_FOUND when no entry qualifies.
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
  throw new Error('TOOL_NOT_FOUND');
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
