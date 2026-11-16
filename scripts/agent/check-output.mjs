/** Defense-in-depth output gate; never a sandbox or proof against encoded exfiltration. */
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 8 * 1024 * 1024;
const protectedPath = /(?:^|\/)(?:\.github|\.git|\.env[^/]*)(?:\/|$)|\.(?:pem|key)$|(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock)$|^scripts\/agent\//i;
const credentials = [
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/,
  /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
];
const refuse = () => { throw new Error('AGENT_OUTPUT_REFUSED'); };
const git = (cwd, args) => execFileSync('git', args, { cwd, maxBuffer: MAX_BYTES + 1024, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } });

export function checkBytes(bytes, knownSecrets = []) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_BYTES || bytes.includes(0)) refuse();
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (credentials.some(pattern => pattern.test(text))) refuse();
  for (const secret of knownSecrets) {
    if (typeof secret !== 'string' || secret.length < 8) refuse();
    const forms = [secret, Buffer.from(secret).toString('base64'), Buffer.from(secret).toString('hex'), encodeURIComponent(secret)];
    if (forms.some(value => text.includes(value))) refuse();
  }
}

/** Inspect index objects, not working-tree files; never follow output symlinks. */
export function checkIndex(cwd, knownSecrets = []) {
  const entries = git(cwd, ['diff', '--cached', '--raw', '--no-abbrev', '--no-renames', '-z']).toString('utf8').split('\0');
  let total = 0, count = 0;
  for (let i = 0; i < entries.length && entries[i]; i += 2) {
    const metadata = entries[i], path = entries[i + 1];
    const match = /^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]{40,64}) ([0-9a-f]{40,64}) ([AMD])$/.exec(metadata);
    if (!match || !path || /[\x00-\x1f\x7f]/.test(path) || protectedPath.test(path) || path.startsWith('/') || path.split('/').includes('..')) refuse();
    if (match[5] === 'D') { count++; continue; }
    if (!['100644', '100755'].includes(match[2])) refuse();
    const bytes = git(cwd, ['cat-file', 'blob', match[4]]);
    total += bytes.length;
    if (total > MAX_BYTES) refuse();
    checkBytes(bytes, knownSecrets); count++;
  }
  // Scan deleted/context lines too: the patch itself is an output channel.
  const patch = git(cwd, ['diff', '--cached', '--binary', '--no-ext-diff', '--no-textconv']);
  checkBytes(patch, knownSecrets);
  return { files: count, bytes: total };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) refuse();
    const secret = process.env.AGENT_OUTPUT_SECRET;
    checkIndex(process.argv[2], secret ? [secret] : []);
    process.stdout.write('Agent output check passed.\n');
  } catch {
    // Neither file names, patch content, git diagnostics nor secret values reach logs.
    process.stderr.write('AGENT_OUTPUT_REFUSED\n'); process.exitCode = 1;
  }
}
