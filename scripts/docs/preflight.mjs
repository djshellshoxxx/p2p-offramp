import { parseArgs } from 'node:util';
import { inspectDocs } from './validate.mjs';
import { isMain } from '../lib/is-main.mjs';

/** Inspect only. Draft regeneration and semantic review are separate actions. */
export async function preflight(root, {pullRequest = false} = {}) {
  const report = await inspectDocs(root);
  if (!report.stale.length) {
    return {exitCode: 0, message: `Unsigned staging documentation bindings match ${report.sourceCommit}.`};
  }

  const {changedCopyKeys, unreadable} = report.bindingDrift;
  const lines = [
    `Unsigned staging blocked by stale documentation bindings at ${report.sourceCommit}.`,
    `Changed or unavailable files: ${report.stale.join(', ')}.`,
    `Claims with stale evidence: ${report.staleClaims.join(', ')}.`,
  ];
  if (unreadable.length) lines.push(`Restore readable, regular bound files: ${unreadable.join(', ')}.`);
  if (changedCopyKeys === null) {
    lines.push('Cannot compare monitored wording. Restore a readable English catalog with all monitored literal definitions.');
  } else if (changedCopyKeys.length) {
    const changed = report.copyKeys.filter(row => changedCopyKeys.includes(row.key));
    lines.push(`Review changed wording and evidence: ${changed.map(row => `${row.key} (${row.claimId})`).join(', ')}.`);
  } else if (report.stale.includes(report.copySource.path)) {
    lines.push('The full English catalog changed. All monitored strings match their bound text.');
  }
  const invalid = unreadable.length > 0 || changedCopyKeys === null;
  if (!invalid) {
    lines.push('After reviewing the changes, run python scripts/docs/generate.py <reviewed-main-commit> once the source is on origin/main. Review both draft records and rerun npm run check:docs:bindings.');
  }
  // A PR-only source cannot yet serve as the generator's immutable main baseline.
  // Invalid inputs and inconsistent records still fail on pull requests.
  const advisory = pullRequest && !invalid;
  return {exitCode: advisory ? 0 : 1, message: (advisory ? '::warning::' : '') + lines.join(' ')};
}

if (isMain(import.meta.url)) {
  try {
    const {values} = parseArgs({options: {'pull-request': {type: 'boolean'}}});
    const result = await preflight(undefined, {pullRequest: values['pull-request']});
    console.log(result.message);
    process.exitCode = result.exitCode;
  } catch {
    console.error('Documentation binding preflight failed. Check the command arguments, Git history for the recorded sourceCommit, immutable hashes, and wiki page and link bindings. See scripts/docs/README.md.');
    process.exitCode = 1;
  }
}
