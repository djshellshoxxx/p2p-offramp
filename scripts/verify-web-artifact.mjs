/** Check a finished static directory against an independently retained local build inventory. */
import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { scanBuild } from '../apps/web/scripts/build.mjs';
import { isMain } from './lib/is-main.mjs';

const inventoryName = 'local-build-evidence.json';

const MODES = { default: { syntheticDemo: false, testnet: false }, demo: { syntheticDemo: true, testnet: false }, testnet: { syntheticDemo: false, testnet: true } };
const USAGE = 'Usage: node scripts/verify-web-artifact.mjs [--default|--demo|--testnet] DIRECTORY RETAINED_EVIDENCE_FILE';

/** The scan mode is the operator's choice. A retained reference can only be checked against it, never select it. */
export async function verifyWebArtifact(directory, referenceFile, { mode = 'default' } = {}) {
  if (!Object.hasOwn(MODES, mode)) throw new Error('UNSUPPORTED_VERIFY_MODE');
  const flags = MODES[mode];
  const root = await realpath(directory);
  const referencePath = await realpath(referenceFile);
  const fromRoot = relative(root, referencePath);
  if (fromRoot !== '..' && !fromRoot.startsWith('..' + sep) && !isAbsolute(fromRoot)) {
    throw new Error('INDEPENDENT_EVIDENCE_REQUIRED');
  }
  const copiedInventory = await stat(join(root, inventoryName), { throwIfNoEntry: false });
  if (!copiedInventory?.isFile()) throw new Error('ARTIFACT_INTEGRITY_MISMATCH');
  const referenceStat = await stat(referencePath);
  if (!referenceStat.isFile()) throw new Error('INVALID_LOCAL_BUILD_EVIDENCE');
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
  if (expected.syntheticDemo !== flags.syntheticDemo || expected.testnet !== flags.testnet) throw new Error('BUILD_MODE_MISMATCH');
  const actual = await scanBuild(root, flags);
  // buildWeb writes this inventory after hashing its payload. Check its bytes separately.
  const inventory = actual.assets.find(asset => asset.path === inventoryName);
  const referenceSha256 = createHash('sha256').update(bytes).digest('hex');
  const payload = actual.assets.filter(asset => asset.path !== inventoryName);
  if (inventory?.sha256 !== referenceSha256 || !isDeepStrictEqual(payload, expected.assets)) {
    throw new Error('ARTIFACT_INTEGRITY_MISMATCH');
  }
  return { mode, verifiedAssets: payload.length, referenceSha256, syntheticDemo: actual.syntheticDemo, testnet: actual.testnet };
}

export function parseVerifyArgs(argv) {
  const flags = argv.filter(arg => arg.startsWith('-'));
  const positional = argv.filter(arg => !arg.startsWith('-'));
  const modes = flags.filter(flag => ['--default', '--demo', '--testnet'].includes(flag)).map(flag => flag.slice(2));
  if (flags.length > 1 || modes.length !== flags.length || positional.length !== 2) throw new Error(USAGE);
  return { directory: positional[0], referenceFile: positional[1], mode: modes[0] ?? 'default' };
}

if (isMain(import.meta.url)) {
  try {
    const { directory, referenceFile, mode } = parseVerifyArgs(process.argv.slice(2));
    console.log(JSON.stringify(await verifyWebArtifact(directory, referenceFile, { mode })));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
