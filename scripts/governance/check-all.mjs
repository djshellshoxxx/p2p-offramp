/** Check maintained inert decision packets; this never grants release authority. */
import { opendir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { checkGovernanceRecord } from './check.mjs';
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
  for (const name of names) {
    const result = await checkGovernanceRecord(root, `docs/governance/${name}`);
    if (!result.ok) throw new Error('GOVERNANCE_PACKET_INVALID');
  }
  return { checked: names.length, economicPreparationAllowed: false, authority: 'inert-record-only' };
}
if (isMain(import.meta.url)) {
  try { console.log(JSON.stringify(await checkMaintainedGovernance())); }
  catch { console.log(JSON.stringify({ ok: false, code: 'GOVERNANCE_PACKET_CHECK_FAILED' })); process.exitCode = 1; }
}
