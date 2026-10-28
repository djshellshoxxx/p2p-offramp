import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanBuild, SYNTHETIC_MARKERS } from './build.mjs';

const MIT = 'Permission is hereby granted, free of charge';
async function fixture({ js = 'export const app = 1;\n', graphModules = [] } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'p2p-scan-build-'));
  await mkdir(join(dir, 'assets'));
  const files = {
    'index.html': '<!doctype html><html><head><script type="module" src="./assets/index-a.js"></script></head><body></body></html>',
    'assets/index-a.js': js,
    'assets/vault.worker-a.js': 'export {};\n',
    'third-party-licenses.json': JSON.stringify(['react', 'react-dom', 'scheduler'].map(name => ({ name, identifier: 'MIT', text: MIT }))),
    'core-graph-document.json': JSON.stringify({ version: 1, modules: graphModules }),
    'core-graph-worker.json': JSON.stringify({ version: 1, modules: [] }),
  };
  for (const [path, contents] of Object.entries(files)) await writeFile(join(dir, path), contents);
  return dir;
}

test('scanBuild: the default artifact refuses synthetic markers or demo modules; the demo artifact requires them', async t => {
  const clean = await fixture();
  const marked = await fixture({ js: `export const id = ${JSON.stringify(SYNTHETIC_MARKERS[0])};\n` });
  const digest = await fixture({ js: `export const d = ${JSON.stringify(SYNTHETIC_MARKERS[1])};\n` });
  const graphOnly = await fixture({ graphModules: [{ path: 'apps/web/src/demo/synthetic-local.ts', sha256: '0'.repeat(64) }] });
  t.after(() => Promise.all([clean, marked, digest, graphOnly].map(dir => rm(dir, { recursive: true, force: true }))));
  assert.equal((await scanBuild(clean)).syntheticDemo, false);
  for (const dir of [marked, digest, graphOnly]) await assert.rejects(scanBuild(dir), /SYNTHETIC_DATA_IN_DEFAULT_BUILD/);
  await assert.rejects(scanBuild(clean, { syntheticDemo: true }), /SYNTHETIC_DEMO_DATA_MISSING/);
  assert.equal((await scanBuild(marked, { syntheticDemo: true })).syntheticDemo, true);
});

test('scanBuild: only the testnet artifact may carry the testnet trust bundle or testnet modules, and it must', async t => {
  const { TESTNET_TRUST_FORMAT } = await import('./testnet-trust.mjs');
  const clean = await fixture();
  const bundled = await fixture({ js: `export const trust = ${JSON.stringify({ format: TESTNET_TRUST_FORMAT })};\n` });
  const graphOnly = await fixture({ graphModules: [{ path: 'apps/web/src/testnet/sepolia-source.ts', sha256: '0'.repeat(64) }] });
  t.after(() => Promise.all([clean, bundled, graphOnly].map(dir => rm(dir, { recursive: true, force: true }))));
  assert.equal((await scanBuild(clean)).testnet, false);
  for (const dir of [bundled, graphOnly]) {
    await assert.rejects(scanBuild(dir), /TESTNET_DATA_IN_NON_TESTNET_BUILD/);
    await assert.rejects(scanBuild(dir, { syntheticDemo: false }), /TESTNET_DATA_IN_NON_TESTNET_BUILD/);
  }
  await assert.rejects(scanBuild(clean, { testnet: true }), /TESTNET_TRUST_DATA_MISSING/);
  assert.equal((await scanBuild(bundled, { testnet: true })).testnet, true);
});
