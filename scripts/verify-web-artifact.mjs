/** Check a finished static directory against an independently retained local build inventory. */
import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { scanBuild } from '../apps/web/scripts/build.mjs';
import { isMain } from './lib/is-main.mjs';

const inventoryName = 'local-build-evidence.json';

export async function verifyWebArtifact(directory, referenceFile) {
  const root = await realpath(directory);
  const referencePath = await realpath(referenceFile);
  const fromRoot = relative(root, referencePath);
  if (fromRoot !== '..' && !fromRoot.startsWith('..' + sep) && !isAbsolute(fromRoot)) {
    throw new Error('INDEPENDENT_EVIDENCE_REQUIRED');
  }
  const copiedInventory = await stat(join(root, inventoryName), { throwIfNoEntry: false });
  if (!copiedInventory?.isFile()) throw new Error('ARTIFACT_INTEGRITY_MISMATCH');
  const referenceStat = await stat(referencePath);
  if (referenceStat.dev === copiedInventory.dev && referenceStat.ino === copiedInventory.ino) {
    throw new Error('INDEPENDENT_EVIDENCE_REQUIRED');
  }
  const bytes = await readFile(referencePath);
  const expected = JSON.parse(bytes);
  if (expected?.version !== 1 || expected.ReleaseEnabled !== 0 || expected.signedRelease !== false ||
      expected.releaseAcceptance !== false || typeof expected.syntheticDemo !== 'boolean' ||
      typeof expected.testnet !== 'boolean' || (expected.syntheticDemo && expected.testnet) || !Array.isArray(expected.assets)) {
    throw new Error('INVALID_LOCAL_BUILD_EVIDENCE');
  }
  const actual = await scanBuild(root, { syntheticDemo: expected.syntheticDemo, testnet: expected.testnet });
  // buildWeb writes this inventory after hashing its payload. Check its bytes separately.
  const inventory = actual.assets.find(asset => asset.path === inventoryName);
  const referenceSha256 = createHash('sha256').update(bytes).digest('hex');
  const payload = actual.assets.filter(asset => asset.path !== inventoryName);
  if (inventory?.sha256 !== referenceSha256 || !isDeepStrictEqual(payload, expected.assets)) {
    throw new Error('ARTIFACT_INTEGRITY_MISMATCH');
  }
  return { verifiedAssets: payload.length, referenceSha256, syntheticDemo: actual.syntheticDemo, testnet: actual.testnet };
}

if (isMain(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node scripts/verify-web-artifact.mjs DIRECTORY RETAINED_EVIDENCE_FILE');
    console.log(JSON.stringify(await verifyWebArtifact(process.argv[2], process.argv[3])));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
