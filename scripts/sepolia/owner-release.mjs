#!/usr/bin/env node
/**
 * OWNER-SIDE tool for the Sepolia testnet trust root (G15 release manifest over the G11 registry). Run it on your own
 * machine, never in a shared or agent session: it handles the testnet release signing key.
 *
 *   keygen --out <dir>                 Create a P-256 testnet signing key. Writes <dir>/sepolia-release-key.private.jwk
 *                                      (mode 0600, refuses to overwrite) and prints ONLY the public JWK + keyId, which
 *                                      is what you hand over (commit it as security/testnet-trust/sepolia-release-key.pub.json).
 *   sign --key <private.jwk> --sequence <n> [--days 30]
 *                                      Sign a manifest over registry/testnet/sepolia.registry.json (1-30 days, the
 *                                      verifier's maximum). Refuses any registry that is not exactly Sepolia (chain id
 *                                      and genesis), and any deployment without a committed DeploymentRecord that
 *                                      matches it, was recorded from clean sources and after finality (G25 §4.2: run
 *                                      record-deployment again once the block is finalized). Writes
 *                                      registry/testnet/sepolia.release.json and sepolia.release.sig.json and prints
 *                                      the networks, endpoints and deployments that were signed: check them first.
 *
 * Format (identical to the G15 verifier, packages/security/src/release-manifest.ts): canonical JSON manifest, ES256
 * with IEEE-P1363 signature over "p2p-offramp/release/v1\n" + manifest bytes, keyId = sha256(canonical {crv,kty,x,y}).
 * The manifest names no deployments of its own (G15 keeps `deployments: []`); the escrow deployment is inside the
 * signed registry asset. Testnet only: this key is not a mainnet trust root.
 */
import { createHash, createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseRegistryBytes } from '../../packages/schemas/index.ts';
import { isSepoliaOnly } from '../../apps/web/src/testnet/sepolia-network.ts';
import { isMain } from './lib.mjs';

export const CHANNEL = 'sepolia-testnet';
export const REGISTRY_ASSET = 'registry/testnet/sepolia.registry.json';
/** packages/security/src/release-manifest.ts refuses a manifest valid for longer than 30 days. */
export const MAX_RELEASE_DAYS = 30;
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
export const publicJwk = jwk => ({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, key_ops: ['verify'], ext: true });
export const keyIdOf = jwk => sha(new TextEncoder().encode(canonical({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })));

export function keygen() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pub = publicJwk(publicKey.export({ format: 'jwk' }));
  return { privateJwk: privateKey.export({ format: 'jwk' }), publicKey: pub, keyId: keyIdOf(pub) };
}

/** The G15 manifest over `registry` (bytes of the registry asset). No checks: signRelease is the owner-facing entry. */
export async function buildManifest({ registry, sequence, days, now, root, sourceCommit }) {
  const registryId = JSON.parse(new TextDecoder().decode(registry)).releaseId;
  return {
    format: 'p2p-offramp-release', version: 1, channel: CHANNEL, sequence, releaseId: registryId,
    sourceCommit: sourceCommit ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    // Digest definitions: recipe = foundry.toml (pinned compiler/EVM settings); lockfile = package-lock.json;
    // sbom = THIRD_PARTY_NOTICES.md (dependency and licence inventory).
    buildRecipeDigest: sha(await readFile(resolve(root, 'contracts/evm/foundry.toml'))),
    lockfileDigest: sha(await readFile(resolve(root, 'package-lock.json'))),
    sbomDigest: sha(await readFile(resolve(root, 'THIRD_PARTY_NOTICES.md'))),
    createdAt: now, expiresAt: now + days * 86_400, minStorageSchema: 1, maxStorageSchema: 1,
    assets: [{ path: REGISTRY_ASSET, bytes: registry.length, sha256: sha(registry) }], deployments: [], predecessorDigest: null,
  };
}

/** Canonical manifest bytes and their ES256 envelope. */
export function signManifest(privateJwk, manifest) {
  const pub = publicJwk(privateJwk);
  const bytes = new TextEncoder().encode(canonical(manifest));
  const key = createPrivateKey({ key: privateJwk, format: 'jwk' });
  const envelope = { v: 1, keyId: keyIdOf(pub), alg: 'ES256-P1363', manifestSha256: sha(bytes),
    signature: sign('sha256', Buffer.concat([Buffer.from('p2p-offramp/release/v1\n'), Buffer.from(bytes)]), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url') };
  return { manifestBytes: bytes, envelope };
}

/**
 * Builds and signs the manifest over the registry asset of `root` (the repository checkout). The registry must be
 * exactly Sepolia; `expectGenesis` exists only for local proofs on a node started with Sepolia's chain id.
 * Returns the signed bytes plus a summary of what was signed, for the owner to check.
 */
export async function signRelease({ privateJwk, sequence, days = MAX_RELEASE_DAYS, now = Math.floor(Date.now() / 1000), root = ROOT, sourceCommit, expectGenesis }) {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('SEQUENCE_INVALID');
  if (!Number.isSafeInteger(days) || days < 1 || days > MAX_RELEASE_DAYS) throw new Error('DAYS_INVALID');
  const registry = await readFile(resolve(root, REGISTRY_ASSET));
  let parsed;
  try { parsed = parseRegistryBytes(new Uint8Array(registry)); } catch { throw new Error('REGISTRY_INVALID'); }
  if (!isSepoliaOnly(parsed, expectGenesis)) throw new Error('REGISTRY_NOT_SEPOLIA');
  // Every deployment must match its committed record, made from clean sources after the deployment block was finalized.
  for (const network of parsed.networks) for (const deployment of network.deployments) {
    let record;
    try { record = JSON.parse(await readFile(resolve(root, 'docs/deployments/sepolia', `BasicEscrow-${deployment.address}.json`), 'utf8')); }
    catch { throw new Error('DEPLOYMENT_RECORD_MISSING'); }
    if (record.contractAddress !== deployment.address || record.codeDigest?.runtime !== deployment.runtime.keccak256 || record.artifactSha256 !== deployment.artifactSha256 ||
        record.chainId !== network.chainIdentity || record.genesisIdentity !== network.genesisHash || record.sourceTreeClean !== true) throw new Error('DEPLOYMENT_RECORD_MISMATCH');
    if (record.finalizedAtRecording !== true) throw new Error('DEPLOYMENT_NOT_FINALIZED');
  }
  const signed = signManifest(privateJwk, await buildManifest({ registry, sequence, days, now, root, sourceCommit }));
  const summary = { releaseId: parsed.releaseId, networks: parsed.networks.map(network => ({ id: network.id, chainIdentity: network.chainIdentity,
    genesisHash: network.genesisHash, environment: network.environment, endpoints: network.endpoints.map(endpoint => endpoint.url),
    deployments: network.deployments.map(deployment => ({ id: deployment.id, address: deployment.address, runtimeKeccak: deployment.runtime.keccak256 ?? null })) })) };
  return { ...signed, summary };
}

if (isMain(import.meta.url)) {
  const [command] = process.argv.slice(2);
  const { values } = parseArgs({ args: process.argv.slice(3), options: { out: { type: 'string' }, key: { type: 'string' }, sequence: { type: 'string' }, days: { type: 'string' } } });
  if (command === 'keygen') {
    if (!values.out) throw new Error('--out <dir> is required');
    await mkdir(values.out, { recursive: true, mode: 0o700 });
    const generated = keygen();
    await writeFile(resolve(values.out, 'sepolia-release-key.private.jwk'), JSON.stringify(generated.privateJwk), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ keyId: generated.keyId, publicKey: generated.publicKey }, null, 2));
  } else if (command === 'sign') {
    if (!values.key || !values.sequence) throw new Error('--key and --sequence are required');
    const signed = await signRelease({ privateJwk: JSON.parse(await readFile(values.key, 'utf8')), sequence: Number(values.sequence), days: Number(values.days ?? 30) });
    await writeFile(resolve(ROOT, 'registry/testnet/sepolia.release.json'), signed.manifestBytes);
    await writeFile(resolve(ROOT, 'registry/testnet/sepolia.release.sig.json'), JSON.stringify(signed.envelope, null, 2) + '\n');
    console.log(JSON.stringify({ ok: true, manifestSha256: signed.envelope.manifestSha256, keyId: signed.envelope.keyId, signed: signed.summary }, null, 2));
  } else { console.error('usage: owner-release.mjs keygen --out <dir> | sign --key <private.jwk> --sequence <n> [--days 30]'); process.exitCode = 2; }
}
