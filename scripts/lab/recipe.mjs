import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { lstat, open, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { checkToolchain } from '../sepolia/lib.mjs';

const exec = promisify(execFile);
export const IMAGE_DIGEST = 'sha256:107ceb6ad85808049dccef12414bf17b08eceb299eaf755c0339dc5fc8958d6b';
export const NODE_VERSION = 'v24.19.0';
export const NPM_VERSION = '11.17.0';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export class LabError extends Error { constructor(code) { super(code); this.code = code; } }

// This is a local developer recipe, never a release, signing or device attestation.
export async function createLabRecipe(root, env = process.env) {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.version !== NODE_VERSION) throw new LabError('LAB_UNSUPPORTED');
  const sourceCommit = (await exec('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new LabError('LAB_SOURCE_INVALID');
  const sourceDirty = (await exec('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root })).stdout.trim() !== '';
  const config = JSON.parse(await readFile(resolve(root, '.devcontainer/devcontainer.json'), 'utf8'));
  validatePortPolicy(config);
  const recipeFiles = ['.devcontainer/Dockerfile', '.devcontainer/devcontainer.json', 'scripts/lab/recipe.mjs', 'scripts/lab/run.mjs', 'scripts/lab/command.mjs'];
  const devcontainerDigest = await digestFiles(root, recipeFiles);
  const lockfileDigest = await digestFiles(root, ['package-lock.json']);
  const fixtureFiles = await collectFiles(root, 'packages/domain/test/fixtures/local-evm-scenario');
  const fixturesDigest = await digestFiles(root, fixtureFiles);
  const foundry = await checkToolchain(env);
  const npm = (await exec('npm', ['--version'], { env: cleanLabEnvironment(env) })).stdout.trim();
  if (npm !== NPM_VERSION) throw new LabError('TOOLCHAIN_MISMATCH');
  return {
    sourceCommit, sourceDirty, devcontainerDigest, imageDigest: IMAGE_DIGEST,
    toolVersions: { node: process.version, npm, ...foundry }, lockfileDigest,
    ports: [{ port: 3000, privateRequirement: true, actualVisibility: 'unknown', hostVisibilityVerified: false, purpose: 'static-preview-only' }], fixturesDigest,
    fixtureFiles, chainIds: ['31337'], supportedTargets: ['linux-amd64-evm-local'],
    unsupportedTargets: ['solana-local-validator', 'physical-wallet', 'production'],
  };
}

export function validatePortPolicy(config) {
  if (JSON.stringify(config.forwardPorts) !== '[3000]' ||
      !config.portsAttributes?.['3000'] || Object.hasOwn(config.portsAttributes['3000'], 'visibility') ||
      config.otherPortsAttributes?.onAutoForward !== 'ignore') throw new LabError('PORT_EXPOSURE');
}

export function cleanLabEnvironment(env) {
  const safe = {};
  for (const name of ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'FOUNDRY_BIN', 'FOUNDRY_SOLC']) {
    if (typeof env[name] === 'string') safe[name] = env[name];
  }
  return { ...safe, FOUNDRY_OFFLINE: 'true' };
}

export async function digestFiles(root, paths) {
  const rows = [];
  for (const path of [...paths].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)) {
    if (!/^[A-Za-z0-9_./-]+$/.test(path) || path.split('/').some(part => part === '..' || part === '') || path.startsWith('/')) throw new LabError('LAB_PATH_INVALID');
    // Reject symlinks at every component, not just at the final file.
    let current = root;
    for (const part of path.split('/')) {
      current = resolve(current, part);
      if ((await lstat(current)).isSymbolicLink()) throw new LabError('LAB_PATH_INVALID');
    }
    const info = await lstat(current, { bigint: true });
    if (!info.isFile() || info.size > 16 * 1024 * 1024) throw new LabError('LAB_PATH_INVALID');
    const file = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = await file.stat({ bigint: true });
      if (!before.isFile() || before.ino !== info.ino || before.dev !== info.dev || before.size !== info.size) throw new LabError('LAB_PATH_INVALID');
      const buffer = Buffer.alloc(Number(before.size) + 1); let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
        if (!bytesRead) break;
        length += bytesRead;
      }
      const after = await file.stat({ bigint: true });
      if (BigInt(length) !== before.size || after.size !== before.size || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs) throw new LabError('LAB_PATH_INVALID');
      rows.push({ path, sha256: sha256(buffer.subarray(0, length)) });
    } finally { await file.close(); }
  }
  return sha256(JSON.stringify(rows));
}

async function collectFiles(root, path, state = { count: 0 }, depth = 0) {
  if (depth > 16 || ++state.count > 256) throw new LabError('LAB_PATH_INVALID');
  const info = await lstat(resolve(root, path));
  if (!info.isDirectory() || info.isSymbolicLink()) throw new LabError('LAB_PATH_INVALID');
  const output = [];
  const entries = await readdir(resolve(root, path), { withFileTypes: true });
  if (entries.length > 256) throw new LabError('LAB_PATH_INVALID');
  for (const entry of entries) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) output.push(...await collectFiles(root, child, state, depth + 1));
    else if (entry.isFile() && ++state.count <= 256) output.push(child);
    else throw new LabError('LAB_PATH_INVALID');
  }
  return output.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}
