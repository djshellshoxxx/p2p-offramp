import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkMaintainedGovernance } from '../governance/check-all.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));

test('maintained governance check requires every inventoried decision/proposal pair', async t => {
  const root = await mkdtemp(join(tmpdir(), 'p2p-governance-check-all-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const copy = async (from, to = from) => {
    await mkdir(dirname(join(root, to)), { recursive: true });
    await copyFile(join(repo, from), join(root, to));
  };
  const packets = (await readdir(join(repo, 'docs/governance'))).filter(name => name.endsWith('.json')).sort();
  const referenced = new Set();
  for (const name of packets) {
    const record = JSON.parse(await readFile(join(repo, 'docs/governance', name), 'utf8'));
    const paths = [...(record.evidencePaths ?? []), ...(record.affectedSpecs ?? []), record.threatImpactPath,
      ...(record.testEvidencePaths ?? [])];
    for (const path of paths) if (typeof path === 'string') referenced.add(path);
    await copy(`docs/governance/${name}`);
  }
  for (const path of referenced) await copy(path);
  const governance = name => `docs/governance/${name}`;
  const remove = names => Promise.all(names.map(name => rm(join(root, governance(name)))));
  const restore = names => Promise.all(names.map(name => copy(governance(name))));

  assert.deepEqual(await checkMaintainedGovernance(root),
    { checked: 12, economicPreparationAllowed: false, authority: 'inert-record-only' });

  const halfPair = ['qr-profile.proposal.json'];
  await remove(halfPair);
  await assert.rejects(checkMaintainedGovernance(root), /GOVERNANCE_PACKET_MISSING/);
  await restore(halfPair);

  const wholePair = ['solana-profile.decision.json', 'solana-profile.proposal.json'];
  await remove(wholePair);
  await assert.rejects(checkMaintainedGovernance(root), /GOVERNANCE_PACKET_MISSING/);
  await restore(wholePair);

  await copy(governance('qr-profile.decision.json'), governance('extra-x.decision.json'));
  await assert.rejects(checkMaintainedGovernance(root), /GOVERNANCE_PACKET_INVALID/);
  await rm(join(root, governance('extra-x.decision.json')));

  assert.equal((await checkMaintainedGovernance(root)).checked, 12);
});
