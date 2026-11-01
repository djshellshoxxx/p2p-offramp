/** Node-only entry detection shared by importable tools. No wallet, network or application imports. */
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Eval/print modes can put an imported module in argv[1]; that does not make it the entrypoint.
 * Ordinary script invocation can retain a symlink in argv while Node canonicalizes its module URL.
 */
export function isMain(moduleUrl) {
  if (process.execArgv.some(arg => /^(?:-(?:e|p|pe)$|--(?:eval|print)(?:=|$))/.test(arg))) return false;
  if (!process.argv[1]) return false;
  try {
    const source = new URL(moduleUrl);
    // Distinct preload module identities must not impersonate the plain file entry.
    // Literal filename '?' and '#' remain percent-encoded in the pathname.
    if (source.search || source.hash) return false;
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(source));
  }
  catch { return false; }
}
