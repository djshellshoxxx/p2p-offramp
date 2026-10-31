/** Local development artifact, never a signed release or deployment attestation. */
import { build } from 'vite';
import { readdir, readFile, lstat, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inspectArtifactFiles, safeArtifactPath } from './artifact-policy.mjs';
import { loadTestnetTrust, TESTNET_TRUST_FORMAT } from './testnet-trust.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
/** Strings that only the synthetic demo module contains (registry release ID and pinned registry digest). */
export const SYNTHETIC_MARKERS = Object.freeze(['test-local-only', '14e7ecfb5aff74253affe0d2e8560728763f01db405bcc7efdca964ef103ca6a']);
export async function scanBuild(directory, { syntheticDemo = false, testnet = false } = {}) {
  const files = Object.create(null), identities = Object.create(null);
  async function walk(path) {
    for (const item of await readdir(path, { withFileTypes: true })) {
      const target = resolve(path, item.name), stat = await lstat(target);
      if (stat.isSymbolicLink()) throw new Error('ARTIFACT_SYMLINK');
      if (stat.isDirectory()) await walk(target);
      else if (stat.isFile()) {
        const path = safeArtifactPath(relative(directory, target).replaceAll('\\', '/'));
        const bytes = await readFile(target);
        // Identity binds the file on disk, independently of its text-policy decoding.
        identities[path] = { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
        files[path] = bytes.toString('utf8');
      }
      else throw new Error('ARTIFACT_TYPE');
    }
  }
  await walk(directory);
  const assets = Object.keys(files).sort().map(path => identities[path]);
  const inspection = { ...inspectArtifactFiles(files), bytes: assets.reduce((total, asset) => total + asset.bytes, 0) };
  if (!assets.some(item => /^assets\/vault\.worker-[A-Za-z0-9_-]+\.js$/.test(item.path))) throw new Error('NATIVE_WORKER_ASSET_MISSING');
  const licenses = JSON.parse(files['third-party-licenses.json'] ?? 'null');
  if (!Array.isArray(licenses) || ['react', 'react-dom', 'scheduler'].some(name => !licenses.some(item => item.name === name && item.identifier === 'MIT' && typeof item.text === 'string' && item.text.includes('Permission is hereby granted')))) throw new Error('LICENSE_ATTRIBUTION_MISSING');
  for (const graph of ['core-graph-document.json', 'core-graph-worker.json']) if (!files[graph]) throw new Error('CORE_GRAPH_MISSING');
  const demoModules = ['core-graph-document.json', 'core-graph-worker.json']
    .some(graph => JSON.parse(files[graph]).modules?.some(module => typeof module.path === 'string' && module.path.startsWith('apps/web/src/demo/')));
  const containsSynthetic = demoModules || Object.values(files).some(text => SYNTHETIC_MARKERS.some(marker => text.includes(marker)));
  if (containsSynthetic !== syntheticDemo) throw new Error(syntheticDemo ? 'SYNTHETIC_DEMO_DATA_MISSING' : 'SYNTHETIC_DATA_IN_DEFAULT_BUILD');
  // The testnet registry source and its embedded trust bundle belong to the testnet build only, and must be there.
  const testnetModules = ['core-graph-document.json', 'core-graph-worker.json']
    .some(graph => JSON.parse(files[graph]).modules?.some(module => typeof module.path === 'string' && module.path.startsWith('apps/web/src/testnet/')));
  const containsTestnet = testnetModules || Object.values(files).some(text => text.includes(TESTNET_TRUST_FORMAT));
  if (containsTestnet !== testnet) throw new Error(testnet ? 'TESTNET_TRUST_DATA_MISSING' : 'TESTNET_DATA_IN_NON_TESTNET_BUILD');
  return { version: 1, ReleaseEnabled: 0, syntheticDemo, testnet, signedRelease: false, releaseAcceptance: false, framingAttestation: false, inspection, assets };
}
/**
 * `demo` is a meta-delivery build that additionally includes the synthetic local registry and samples. `testnet` is a
 * meta-delivery build that embeds the owner-signed Sepolia registry, verified here first (fail closed) and again at
 * runtime. `trustRoot` (testnet only) is the directory holding the trust files; it defaults to the repository root.
 */
export async function buildWeb({ delivery = 'meta', outDir, trustRoot, nowSeconds } = {}) {
  if (!['meta', 'header', 'demo', 'testnet'].includes(delivery)) throw new Error('UNSUPPORTED_BUILD_PROFILE');
  const syntheticDemo = delivery === 'demo', testnet = delivery === 'testnet';
  const trust = testnet ? await loadTestnetTrust(trustRoot ?? resolve(root, '../..'), nowSeconds ? { nowSeconds } : {}) : null;
  outDir ??= resolve(root, syntheticDemo ? 'dist-demo' : testnet ? 'dist-testnet' : 'dist');
  await build({ configFile: resolve(root, 'vite.config.ts'), mode: delivery, build: { outDir },
    ...(trust ? { define: { __P2P_TESTNET_TRUST__: JSON.stringify(trust.bundle) } } : {}) });
  const evidence = { ...await scanBuild(outDir, { syntheticDemo, testnet }), ...(trust ? { testnetTrust: trust.summary } : {}) };
  await writeFile(resolve(outDir, 'local-build-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  return evidence;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3) throw new Error('BUILD_ARGUMENTS');
  const evidence = await buildWeb({ delivery: process.argv[2] ?? 'meta' });
  console.log(JSON.stringify({ localStaticBuild: true, syntheticDemo: evidence.syntheticDemo, ...evidence.inspection, signedRelease: false, releaseAcceptance: false }));
}
