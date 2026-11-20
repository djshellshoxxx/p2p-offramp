import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const base = '477777dc152cd3148ba7f25a75ce8f00dc1b03b5';
assert.equal(execFileSync('git', ['diff', '--name-only', base, 'HEAD', '--', 'apps/web', 'packages', 'contracts', 'package-lock.json'], { encoding: 'utf8' }), '');
const { buildWeb } = await import(pathToFileURL(resolve(root, 'apps/web/scripts/build.mjs')).href);
const directory = await mkdtemp(resolve(tmpdir(), 'p2p-g24-demo-'));
try {
  const evidence = await buildWeb({ delivery: 'demo', outDir: directory });
  assert.equal(evidence.ReleaseEnabled, 0); assert.equal(evidence.syntheticDemo, true);
  assert.equal(evidence.testnet, false); assert.equal(evidence.signedRelease, false); assert.equal(evidence.releaseAcceptance, false);
  const graphs = [];
  for (const name of ['core-graph-document.json', 'core-graph-worker.json', 'qr-graph-worker.json']) {
    const bytes = await readFile(resolve(directory, name));
    const graph = JSON.parse(bytes);
    assert.equal(graph.modules.some(item => /packages\/security\/src\/release-update(?:-http|-store)?\.ts$/.test(item.path)), false);
    graphs.push({ path: name, sha256: createHash('sha256').update(bytes).digest('hex'), modules: graph.modules.length });
  }
  console.log(JSON.stringify({ qualification: 'unchanged-demo-build-isolation', productionSourceDiff: [], ReleaseEnabled: 0, syntheticDemo: true,
    testnet: false, defaultUpdaterIncluded: false, nativeExecuted: false, graphs, assets: evidence.assets }));
} finally { await rm(directory, { recursive: true, force: true }); }
