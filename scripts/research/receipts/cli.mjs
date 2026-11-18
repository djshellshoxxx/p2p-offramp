import { readFileSync, statSync } from 'node:fs';
import { admitReceipt, parseCanonical, MAX_RECEIPT_BYTES } from './receipt.mjs';
import { isMain } from '../../lib/is-main.mjs';

function readBounded(path) {
  const metadata = statSync(path);
  if (!metadata.isFile() || metadata.size > MAX_RECEIPT_BYTES) throw new Error('EVIDENCE_SCHEMA');
  return readFileSync(path);
}
export function main(argv = process.argv.slice(2)) {
  try {
    if (argv[0] !== 'verify') throw new Error('EVIDENCE_ARGUMENTS');
    const flags = new Map(), allowed = ['--receipt', '--root', '--repository', '--commit', '--policy', '--secret-env'];
    for (let i = 1; i < argv.length; i += 2) {
      if (!allowed.includes(argv[i]) || flags.has(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('EVIDENCE_ARGUMENTS');
      flags.set(argv[i], argv[i + 1]);
    }
    if (['--receipt', '--root', '--repository', '--commit'].some(flag => !flags.has(flag))) throw new Error('EVIDENCE_ARGUMENTS');
    const secrets = [];
    if (flags.has('--secret-env')) {
      for (const name of flags.get('--secret-env').split(',')) {
        if (!/^[A-Z_][A-Z0-9_]*$/.test(name) || !process.env[name]) throw new Error('EVIDENCE_SECRET_CONFIGURATION');
        secrets.push(process.env[name]);
      }
    }
    const policy = flags.has('--policy') ? parseCanonical(readBounded(flags.get('--policy'))) : undefined;
    const result = admitReceipt(readBounded(flags.get('--receipt')), { root: flags.get('--root'), repository: flags.get('--repository'),
      commit: flags.get('--commit'), policy, secrets });
    process.stdout.write(JSON.stringify(result) + '\n');
    return 0;
  } catch (error) {
    // Do not echo untrusted receipt values, file paths, process diagnostics or secrets.
    process.stderr.write((/^EVIDENCE_[A-Z_]+$/.test(error.message) ? error.message : 'EVIDENCE_INPUT') + '\n');
    return 1;
  }
}
if (isMain(import.meta.url)) process.exitCode = main();
