/** Check maintained inert decision packets; this never grants release authority. */
import { opendir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { checkGovernanceRecord } from './check.mjs';
import { EvidenceRefusal, checkEvidenceBinding } from './evidence.mjs';
import { isMain } from '../lib/is-main.mjs';

export async function checkMaintainedGovernance(root = fileURLToPath(new URL('../../', import.meta.url))) {
  const directory = await opendir(resolve(root, 'docs/governance'));
  const names = []; let visited = 0;
  for await (const entry of directory) {
    if (++visited > 64) throw new Error('GOVERNANCE_PACKET_LIMIT');
    if (entry.name.endsWith('.json')) {
      if (names.length >= 32) throw new Error('GOVERNANCE_PACKET_LIMIT');
      if (!entry.isFile() || !/^[a-z0-9-]+\.(decision|proposal)\.json$/.test(entry.name)) throw new Error('GOVERNANCE_PACKET_INVALID');
      names.push(entry.name);
    }
  }
  if (!names.length) throw new Error('GOVERNANCE_PACKET_MISSING');
  names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  let historical = 0, pending = 0;
  for (const name of names) {
    const result = await checkGovernanceRecord(root, `docs/governance/${name}`);
    if (!result.ok) throw new Error('GOVERNANCE_PACKET_INVALID');
    if (result.historical) historical++;
    if (result.pending) pending++;
  }
  // Needs full git history and refs/remotes/origin/main (CI job with fetch-depth 0): a sourceCommit that is not on
  // main is refused. Drift of non-owned files is reported, never a failure.
  const evidence = await checkEvidenceBinding({ root });
  return { checked: names.length, historical, pending, evidence: { sourceCommit: evidence.sourceCommit, mainAncestry: evidence.mainAncestry, rows: evidence.rows, owned: evidence.owned, bound: evidence.bound, stale: evidence.stale }, economicPreparationAllowed: false, authority: 'inert-record-only' };
}
if (isMain(import.meta.url)) {
  try { console.log(JSON.stringify(await checkMaintainedGovernance())); }
  catch (error) {
    // Only the fixed refusal code is printed, never the detail (paths, commits).
    const reason = error instanceof EvidenceRefusal ? { reason: error.code } : {};
    console.log(JSON.stringify({ ok: false, code: 'GOVERNANCE_PACKET_CHECK_FAILED', ...reason }));
    process.exitCode = 1;
  }
}
