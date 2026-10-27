/** Local development artifact, never a signed release or deployment attestation. */
import { build } from 'vite';
import { readdir, readFile, lstat, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inspectArtifactFiles, safeArtifactPath } from './artifact-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
/** Strings that only the synthetic demo module contains (registry release ID and pinned registry digest). */
export const SYNTHETIC_MARKERS = Object.freeze(['test-local-only', '14e7ecfb5aff74253affe0d2e8560728763f01db405bcc7efdca964ef103ca6a']);
export async function scanBuild(directory, { syntheticDemo = false } = {}) {
  const files = {};
  async function walk(path) {
    for (const item of await readdir(path, { withFileTypes: true })) {
      const target = resolve(path, item.name), stat = await lstat(target);
      if (stat.isSymbolicLink()) throw new Error('ARTIFACT_SYMLINK');
      if (stat.isDirectory()) await walk(target);
      else if (stat.isFile()) files[safeArtifactPath(relative(directory, target).replaceAll('\\', '/'))] = await readFile(target, 'utf8');
      else throw new Error('ARTIFACT_TYPE');
    }
  }
  await walk(directory);
  const inspection = inspectArtifactFiles(files);
  const assets = Object.keys(files).sort().map(path => ({ path, bytes: Buffer.byteLength(files[path]), sha256: createHash('sha256').update(files[path]).digest('hex') }));
  if (!assets.some(item => /^assets\/vault\.worker-[A-Za-z0-9_-]+\.js$/.test(item.path))) throw new Error('NATIVE_WORKER_ASSET_MISSING');
  const licenses = JSON.parse(files['third-party-licenses.json'] ?? 'null');
  if (!Array.isArray(licenses) || ['react', 'react-dom', 'scheduler'].some(name => !licenses.some(item => item.name === name && item.identifier === 'MIT' && typeof item.text === 'string' && item.text.includes('Permission is hereby granted')))) throw new Error('LICENSE_ATTRIBUTION_MISSING');
  for (const graph of ['core-graph-document.json', 'core-graph-worker.json']) if (!files[graph]) throw new Error('CORE_GRAPH_MISSING');
  const demoModules = ['core-graph-document.json', 'core-graph-worker.json']
    .some(graph => JSON.parse(files[graph]).modules?.some(module => typeof module.path === 'string' && module.path.startsWith('apps/web/src/demo/')));
  const containsSynthetic = demoModules || Object.values(files).some(text => SYNTHETIC_MARKERS.some(marker => text.includes(marker)));
  if (containsSynthetic !== syntheticDemo) throw new Error(syntheticDemo ? 'SYNTHETIC_DEMO_DATA_MISSING' : 'SYNTHETIC_DATA_IN_DEFAULT_BUILD');
  return { version: 1, ReleaseEnabled: 0, syntheticDemo, signedRelease: false, releaseAcceptance: false, framingAttestation: false, inspection, assets };
}
/** `demo` is a meta-delivery build that additionally includes the synthetic local registry and samples. */
export async function buildWeb({ delivery = 'meta', outDir } = {}) {
  if (!['meta', 'header', 'demo'].includes(delivery)) throw new Error('UNSUPPORTED_BUILD_PROFILE');
  const syntheticDemo = delivery === 'demo';
  outDir ??= resolve(root, syntheticDemo ? 'dist-demo' : 'dist');
  await build({ configFile: resolve(root, 'vite.config.ts'), mode: delivery, build: { outDir } });
  const evidence = await scanBuild(outDir, { syntheticDemo });
  await writeFile(resolve(outDir, 'local-build-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  return evidence;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3) throw new Error('BUILD_ARGUMENTS');
  const evidence = await buildWeb({ delivery: process.argv[2] ?? 'meta' });
  console.log(JSON.stringify({ localStaticBuild: true, syntheticDemo: evidence.syntheticDemo, ...evidence.inspection, signedRelease: false, releaseAcceptance: false }));
}
