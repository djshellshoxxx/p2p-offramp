import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { registryFixture } from '../../packages/security/test/lib/release-registry-fixture.mjs';
import { sha } from '../../packages/security/test/lib/release-fixture.mjs';
import { verifyRelease } from '../../packages/security/src/release-manifest.ts';
import { buildEvmRecoveryPackage } from '../recovery/build-evm.mjs';

test('recovery commands reject repeated singleton options before choosing a provider or reading a reference', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'recovery-endpoint-options-'));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const abiPath = 'contracts/evm/abi/BasicEscrow.json';
  const abiBytes = new Uint8Array(await readFile(new URL('../../' + abiPath, import.meta.url)));
  const fixture = registryFixture({
    editManifest(manifest) {
      manifest.assets.push({ path: abiPath, bytes: abiBytes.length, sha256: sha(abiBytes) });
      manifest.assets.sort((a, b) => a.path.localeCompare(b.path));
    }
  });
  fixture.assets.push({ path: abiPath, bytes: abiBytes });
  const proof = await verifyRelease(fixture.bytes, fixture.envelope, [fixture.key], 0, fixture.options);
  assert.equal(proof.ok, true, JSON.stringify(proof));
  const { executable } = await buildEvmRecoveryPackage({
    verifiedRelease: proof.value, registryPath: fixture.registryPath, registryBytes: fixture.registryBytes,
    abiPath, abiBytes, networkId: 'local-evm', deploymentId: 'escrow-fixture', outDir: join(directory, 'package')
  });

  function invoke(args) {
    const result = spawnSync(process.execPath, [
      executable, ...args
    ], { encoding: 'utf8', timeout: 5000 });
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stderr);
    return JSON.parse(result.stdout);
  }

  const trade = ['--trade-id', 'ab'.repeat(32)];
  const endpoint = ['--endpoint', 'missing-b'];
  const invalid = { ok: false, error: { code: 'INVALID_INPUT' } };
  assert.deepEqual(invoke(['inspect', ...trade, ...endpoint]), { ok: false, error: { code: 'UNSUPPORTED_PROVIDER' } });
  for (const [command, args] of [
    ['inspect', [...trade, '--endpoint', 'missing-a', '--endpoint=missing-b']],
    ['inspect', [...trade, ...endpoint, ...trade]],
    ['inspect', [...endpoint, '--reference=a', '--item=0', '--reference=b']],
    ['inspect', [...endpoint, '--reference=a', '--item=0', '--item=1']],
    ['prepare-release', [...trade, ...endpoint, '--from=a', '--from=b']],
  ]) {
    assert.deepEqual(invoke([command, ...args]), invalid, args.join(' '));
  }
});
