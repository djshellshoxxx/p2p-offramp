import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanBuild, SYNTHETIC_MARKERS } from '../../apps/web/scripts/build.mjs';
import { TESTNET_TRUST_FORMAT } from '../../apps/web/scripts/testnet-trust.mjs';
import { parseVerifyArgs, verifyWebArtifact } from '../verify-web-artifact.mjs';

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

test('a reference whose profile disagrees with the requested mode is refused before the scan', async t => {
  for (const claim of ['demo', 'testnet']) {
    const { directory, reference } = await artifact(t, 'default', claim);
    await assert.rejects(verifyWebArtifact(directory, reference), /BUILD_MODE_MISMATCH/);
    await assert.rejects(verifyWebArtifact(directory, reference, { mode: 'default' }), /BUILD_MODE_MISMATCH/);
  }
});

test('D-L4 regression: demo or testnet content with its matching lenient reference is refused unless the operator asks for that mode', async t => {
  for (const mode of ['demo', 'testnet']) {
    const { directory, reference } = await artifact(t, mode);
    await assert.rejects(verifyWebArtifact(directory, reference), /BUILD_MODE_MISMATCH/);
    await assert.rejects(verifyWebArtifact(directory, reference, { mode: mode === 'demo' ? 'testnet' : 'demo' }), /BUILD_MODE_MISMATCH/);
    // Honest reference for default mode but lenient content: the scan itself refuses.
    const honest = await artifact(t, mode, 'default');
    await assert.rejects(verifyWebArtifact(honest.directory, honest.reference), mode === 'demo' ? /SYNTHETIC_DATA_IN_DEFAULT_BUILD/ : /TESTNET_DATA_IN_NON_TESTNET_BUILD/);
  }
});

test('an unknown or non-string programmatic mode is refused', async t => {
  const { directory, reference } = await artifact(t, 'default');
  for (const options of [{ mode: 'lenient' }, { mode: ['demo'] }, { mode: { toString: () => 'demo' } }, { mode: 1 }, null, 'demo', ['demo']]) {
    await assert.rejects(verifyWebArtifact(directory, reference, options), /UNSUPPORTED_VERIFY_MODE/);
  }
});

test('parseVerifyArgs accepts exactly one known mode flag and two paths', () => {
  const d = 'pages', r = 'retained.json';
  assert.deepEqual(parseVerifyArgs([d, r]), { directory: d, referenceFile: r, mode: 'default' });
  for (const mode of ['default', 'demo', 'testnet']) {
    assert.deepEqual(parseVerifyArgs([`--${mode}`, d, r]), { directory: d, referenceFile: r, mode });
  }
  // A flag may follow the paths: every token starting with '-' is a flag, so the position is unambiguous.
  assert.equal(parseVerifyArgs([d, r, '--testnet']).mode, 'testnet');
  const bad = [[], [d], [d, r, 'extra'], ['--demo', d], ['--', d, r], ['-', d, r], ['-x', r], ['--demo', '--testnet', d, r],
    ['--demo', '--demo', d, r], ['--demo', '--default', d, r], ['--bogus', d, r], ['-demo', d, r], ['--demo=1', d, r],
    ['--Demo', d, r], ['--dem', d, r], ['--demo ', d, r], ['\u2013\u2013demo', d, r]];
  for (const argv of bad) {
    assert.throws(() => parseVerifyArgs(argv), error => error.code === 'USAGE' && /^Usage:/.test(error.message), JSON.stringify(argv));
  }
});

test('CLI takes the mode from flags; verification failures exit 1 and usage errors exit 2', async t => {
  const demo = await artifact(t, 'demo');
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  const ok = run('--demo', demo.directory, demo.reference);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).mode, 'demo');
  const strict = run(demo.directory, demo.reference);
  assert.equal(strict.status, 1);
  assert.match(strict.stderr, /BUILD_MODE_MISMATCH/);
  const usage = run('--demo=1', demo.directory, demo.reference);
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /Usage:/);
  assert.doesNotThrow(() => execFileSync(process.execPath, [cli, '--demo', demo.directory, demo.reference], { stdio: 'pipe' }));
});
