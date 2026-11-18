import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanBuild, SYNTHETIC_MARKERS } from '../../apps/web/scripts/build.mjs';
import { TESTNET_TRUST_FORMAT } from '../../apps/web/scripts/testnet-trust.mjs';
import { verifyWebArtifact } from '../verify-web-artifact.mjs';

const cli = fileURLToPath(new URL('../verify-web-artifact.mjs', import.meta.url));
const MIT = 'Permission is hereby granted, free of charge';
const FLAGS = { default: {}, demo: { syntheticDemo: true }, testnet: { testnet: true } };

/** Build a directory for `contentMode`, plus an independently retained reference whose flags are rewritten by `claim`. */
async function artifact(t, contentMode, claim = contentMode) {
  const js = contentMode === 'demo' ? `export const id = ${JSON.stringify(SYNTHETIC_MARKERS[0])};\n`
    : contentMode === 'testnet' ? `export const trust = ${JSON.stringify({ format: TESTNET_TRUST_FORMAT })};\n` : 'export const app = 1;\n';
  const base = await mkdtemp(join(tmpdir(), 'p2p-verify-mode-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const source = join(base, 'source'), directory = join(base, 'pages'), reference = join(base, 'retained.json');
  await mkdir(join(source, 'assets'), { recursive: true });
  const files = {
    'index.html': '<!doctype html><html><head><script type="module" src="./assets/index-a.js"></script></head><body></body></html>',
    'assets/index-a.js': js,
    'assets/vault.worker-a.js': 'export {};\n',
    'third-party-licenses.json': JSON.stringify(['react', 'react-dom', 'scheduler'].map(name => ({ name, identifier: 'MIT', text: MIT }))),
    'core-graph-document.json': JSON.stringify({ version: 1, modules: [] }),
    'core-graph-worker.json': JSON.stringify({ version: 1, modules: [] }),
  };
  for (const [path, contents] of Object.entries(files)) await writeFile(join(source, path), contents);
  const evidence = await scanBuild(source, FLAGS[contentMode]);
  // A forged reference claims other flags; the asset hashes stay consistent so only the mode differs.
  const text = JSON.stringify({ ...evidence, syntheticDemo: claim === 'demo', testnet: claim === 'testnet' }, null, 2) + '\n';
  await writeFile(join(source, 'local-build-evidence.json'), text);
  await cp(source, directory, { recursive: true });
  await writeFile(reference, text);
  return { directory, reference };
}

test('each mode verifies an artifact whose content and retained reference both match it', async t => {
  for (const mode of ['default', 'demo', 'testnet']) {
    const { directory, reference } = await artifact(t, mode);
    const result = await verifyWebArtifact(directory, reference, { mode });
    assert.equal(result.mode, mode);
    assert.equal(result.syntheticDemo, mode === 'demo');
    assert.equal(result.testnet, mode === 'testnet');
  }
});

test('the default mode is strict when none is given', async t => {
  const { directory, reference } = await artifact(t, 'default');
  assert.equal((await verifyWebArtifact(directory, reference)).mode, 'default');
  const demo = await artifact(t, 'demo');
  await assert.rejects(verifyWebArtifact(demo.directory, demo.reference), /BUILD_MODE_MISMATCH/);
});

test('a forged lenient reference cannot relax the scan of a default-mode artifact', async t => {
  for (const claim of ['demo', 'testnet']) {
    const { directory, reference } = await artifact(t, 'default', claim);
    await assert.rejects(verifyWebArtifact(directory, reference), /BUILD_MODE_MISMATCH/);
    await assert.rejects(verifyWebArtifact(directory, reference, { mode: 'default' }), /BUILD_MODE_MISMATCH/);
  }
});

test('demo-only or testnet-only content is refused in default mode even when the reference claims it legal', async t => {
  for (const mode of ['demo', 'testnet']) {
    const { directory, reference } = await artifact(t, mode);
    await assert.rejects(verifyWebArtifact(directory, reference), /BUILD_MODE_MISMATCH/);
    await assert.rejects(verifyWebArtifact(directory, reference, { mode: mode === 'demo' ? 'testnet' : 'demo' }), /BUILD_MODE_MISMATCH/);
    // Honest reference for default mode but lenient content: the scan itself refuses.
    const honest = await artifact(t, mode, 'default');
    await assert.rejects(verifyWebArtifact(honest.directory, honest.reference), mode === 'demo' ? /SYNTHETIC_DATA_IN_DEFAULT_BUILD/ : /TESTNET_DATA_IN_NON_TESTNET_BUILD/);
  }
});

test('an unknown programmatic mode is refused', async t => {
  const { directory, reference } = await artifact(t, 'default');
  await assert.rejects(verifyWebArtifact(directory, reference, { mode: 'lenient' }), /UNSUPPORTED_VERIFY_MODE/);
});

test('CLI takes the mode from flags and rejects malformed command lines with exit 1', async t => {
  const demo = await artifact(t, 'demo');
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  const ok = run('--demo', demo.directory, demo.reference);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).mode, 'demo');
  assert.equal(run(demo.directory, demo.reference).status, 1);
  assert.match(run(demo.directory, demo.reference).stderr, /BUILD_MODE_MISMATCH/);
  assert.equal(run('--default', demo.directory, demo.reference).status, 1);
  const forged = await artifact(t, 'default', 'testnet');
  assert.match(run(forged.directory, forged.reference).stderr, /BUILD_MODE_MISMATCH/);
  const usage = [['--demo', '--testnet'], ['--demo', '--demo'], ['--demo', '--default'], ['--bogus'], ['-demo'], ['--demo=1']];
  for (const flags of usage) {
    const r = run(...flags, demo.directory, demo.reference);
    assert.equal(r.status, 1, flags.join(' '));
    assert.match(r.stderr, /Usage:/);
  }
  for (const args of [[], [demo.directory], ['--demo', demo.directory], [demo.directory, demo.reference, 'extra']]) {
    const r = run(...args);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Usage:/);
  }
  assert.doesNotThrow(() => execFileSync(process.execPath, [cli, '--demo', demo.directory, demo.reference], { stdio: 'pipe' }));
});
