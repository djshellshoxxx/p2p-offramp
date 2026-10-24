/** Local development artifact, never a signed release or deployment attestation. */
import { build } from 'vite';
import { readdir, readFile, lstat, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inspectArtifactFiles, safeArtifactPath } from './artifact-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function scanBuild(directory) {
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
  return { version: 1, ReleaseEnabled: 0, signedRelease: false, releaseAcceptance: false, framingAttestation: false, inspection, assets };
}
export async function buildWeb({ delivery = 'meta', outDir = resolve(root, 'dist') } = {}) {
  if (!['meta', 'header'].includes(delivery)) throw new Error('UNSUPPORTED_BUILD_PROFILE');
  await build({ configFile: resolve(root, 'vite.config.ts'), mode: delivery, build: { outDir } });
  const evidence = await scanBuild(outDir);
  await writeFile(resolve(outDir, 'local-build-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  return evidence;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3) throw new Error('BUILD_ARGUMENTS');
  const evidence = await buildWeb({ delivery: process.argv[2] ?? 'meta' });
  console.log(JSON.stringify({ localStaticBuild: true, ...evidence.inspection, signedRelease: false, releaseAcceptance: false }));
}
