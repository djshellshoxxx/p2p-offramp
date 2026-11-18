#!/usr/bin/env node
/**
 * OWNER-SIDE tool for the Sepolia testnet trust root (G15 release manifest over the G11 registry). Run it on your own
 * machine, never in a shared or agent session: it handles the testnet release signing key.
 *
 *   keygen --out <dir>                 Create a P-256 testnet signing key. Writes <dir>/sepolia-release-key.private.jwk
 *                                      (mode 0600, refuses to overwrite) and prints ONLY the public JWK + keyId, which
 *                                      is what you hand over (commit it as security/testnet-trust/sepolia-release-key.pub.json).
 *   sign --key <private.jwk> --sequence <n> [--days 30]
 *                                      Sign one manifest over BOTH release assets, registry/testnet/sepolia.registry.json
 *                                      and the canonical escrow ABI contracts/evm/abi/BasicEscrow.json (D3 Option A,
 *                                      PROPOSED), valid 1-30 days (the verifier's maximum). Refuses any registry that is
 *                                      not exactly Sepolia (chain id and genesis), an ABI that differs from the committed
 *                                      canonical file, and any deployment without a committed DeploymentRecord that
 *                                      matches it, was recorded from clean sources and after finality (G25 §4.2: run
 *                                      record-deployment again once the block is finalized). Writes
 *                                      registry/testnet/sepolia.release.json, sepolia.release.sig.json and the signed
 *                                      deployment ledger sepolia.signed-deployments.json, and prints the assets, networks,
 *                                      endpoints and deployments that were signed: check them first, then commit all three.
 *
 * Deployment continuity (D3, PROPOSED): a deployment id, once signed on this channel, names the same address, runtime
 * keccak and artifactSha256 in every later release. `sign` refuses a registry that rebinds a signed id
 * (DEPLOYMENT_ID_REBOUND) or drops one (DEPLOYMENT_ID_DROPPED), and a sequence that does not exceed the last signed one
 * (SEQUENCE_NOT_INCREASING); the G11 parser already refuses one address under two ids (REGISTRY_INVALID). The
 * ledger it checks against must describe the release currently committed beside it (SIGNED_DEPLOYMENTS_MISSING or
 * SIGNED_DEPLOYMENTS_STALE otherwise). THIS IS A SIGNER-SIDE CHECK ONLY: manifests keep `predecessorDigest: null`, so no
 * verifier can enforce it, and a stolen key (or a signer run without the ledger) could still rebind an id. Verifiers
 * still accept only a Sepolia-only registry, and recovery packages already built keep their original pins.
 *
 * Format (identical to the G15 verifier, packages/security/src/release-manifest.ts): canonical JSON manifest, ES256
 * with IEEE-P1363 signature over "p2p-offramp/release/v1\n" + manifest bytes, keyId = sha256(canonical {crv,kty,x,y}).
 * The manifest names no deployments of its own (G15 keeps `deployments: []`); the escrow deployments are inside the
 * signed registry asset. Its asset list is exactly SEPOLIA_RELEASE_ASSETS, sorted by path, so the testnet build, the app
 * runtime, sepolia:verify, the trade tool and the maintained recovery builder all accept the same signed manifest.
 * Testnet only: this key is not a mainnet trust root.
 */
import { createHash, createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseRegistryBytes } from '../../packages/schemas/index.ts';
import { isSepoliaOnly, SEPOLIA_RELEASE_ASSETS, SEPOLIA_RELEASE_CHANNEL } from '../../apps/web/src/testnet/sepolia-network.ts';
import { isDeploymentId, isMain } from './lib.mjs';

export const CHANNEL = SEPOLIA_RELEASE_CHANNEL;
export const REGISTRY_ASSET = SEPOLIA_RELEASE_ASSETS.registry;
export const ABI_ASSET = SEPOLIA_RELEASE_ASSETS.abi;
/** The canonical ABI committed in this checkout; the maintained recovery builder compares the signed ABI to it byte for byte. */
const CANONICAL_ABI = new URL('../../contracts/evm/abi/BasicEscrow.json', import.meta.url);
/** packages/security/src/release-manifest.ts refuses a manifest valid for longer than 30 days. */
export const MAX_RELEASE_DAYS = 30;
export const RELEASE_MANIFEST_FILE = 'registry/testnet/sepolia.release.json';
export const RELEASE_ENVELOPE_FILE = 'registry/testnet/sepolia.release.sig.json';
/** Signer-side record of every deployment ever signed on this channel; read by `sign`, never by any verifier. */
export const SIGNED_DEPLOYMENTS_FILE = 'registry/testnet/sepolia.signed-deployments.json';
export const SIGNED_DEPLOYMENTS_FORMAT = 'p2p-offramp/testnet-signed-deployments/v1';
const HEX64 = /^[0-9a-f]{64}$/;
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

/** Both release assets, sorted by path as the G15 verifier requires. A registry-only manifest is never produced. */
export function releaseAssets({ registry, abi }) {
  if (!(registry instanceof Uint8Array) || !(abi instanceof Uint8Array)) throw new Error('RELEASE_ASSETS_REQUIRED');
  return [{ path: REGISTRY_ASSET, bytes: registry }, { path: ABI_ASSET, bytes: abi }]
    .sort((a, b) => a.path < b.path ? -1 : 1).map(({ path, bytes }) => ({ path, bytes: bytes.length, sha256: sha(bytes) }));
}

/** The G15 manifest over the registry and ABI asset bytes. No checks: signRelease is the owner-facing entry. */
export async function buildManifest({ registry, abi, sequence, days, now, root, sourceCommit }) {
  const assets = releaseAssets({ registry, abi });
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
    assets, deployments: [], predecessorDigest: null,
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

const exactKeys = (value, keys) => typeof value === 'object' && value !== null && !Array.isArray(value) &&
  Object.keys(value).sort().join() === [...keys].sort().join();
/** Strict parse of the signed deployment ledger; anything unexpected is SIGNED_DEPLOYMENTS_INVALID. */
export function parseSignedDeployments(text) {
  const invalid = () => { throw new Error('SIGNED_DEPLOYMENTS_INVALID'); };
  let value;
  try { value = JSON.parse(text); } catch { return invalid(); }
  if (!exactKeys(value, ['format', 'channel', 'lastSequence', 'lastManifestSha256', 'deployments']) || value.format !== SIGNED_DEPLOYMENTS_FORMAT ||
      value.channel !== CHANNEL || !Number.isSafeInteger(value.lastSequence) || value.lastSequence < 1 || !HEX64.test(value.lastManifestSha256 ?? '') ||
      !Array.isArray(value.deployments)) return invalid();
  const seen = new Set();
  for (const entry of value.deployments) {
    if (!exactKeys(entry, ['networkId', 'id', 'address', 'runtimeKeccak', 'artifactSha256', 'firstSequence']) || !isDeploymentId(entry.networkId) ||
        !isDeploymentId(entry.id) || !/^0x[0-9a-f]{40}$/.test(entry.address ?? '') || !HEX64.test(entry.runtimeKeccak ?? '') || !HEX64.test(entry.artifactSha256 ?? '') ||
        !Number.isSafeInteger(entry.firstSequence) || entry.firstSequence < 1 || entry.firstSequence > value.lastSequence || seen.has(`${entry.networkId}/${entry.id}`)) return invalid();
    seen.add(`${entry.networkId}/${entry.id}`);
  }
  return value;
}

async function readOptional(path) {
  try { return await readFile(path); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}
/**
 * The signed deployment ledger under `root` (null before the first release). It must describe the release currently
 * committed beside it: a committed manifest without a ledger is SIGNED_DEPLOYMENTS_MISSING, and a ledger written for
 * another manifest is SIGNED_DEPLOYMENTS_STALE, so deleting or rolling back the ledger alone cannot reopen a signed id.
 */
export async function readSignedDeployments(root) {
  const text = await readOptional(resolve(root, SIGNED_DEPLOYMENTS_FILE));
  const ledger = text === null ? null : parseSignedDeployments(text.toString('utf8'));
  const committed = await readOptional(resolve(root, RELEASE_MANIFEST_FILE));
  if (committed !== null) {
    if (ledger === null) throw new Error('SIGNED_DEPLOYMENTS_MISSING');
    if (sha(committed) !== ledger.lastManifestSha256) throw new Error('SIGNED_DEPLOYMENTS_STALE');
  }
  return ledger;
}

const refuse = (code, deploymentId) => Object.assign(new Error(code), { deploymentId });
/**
 * D3 continuity rule over a parsed registry: every previously signed id must still be listed with the same address,
 * runtime keccak and artifactSha256, and the sequence must increase. (A signed address cannot reappear under a new id:
 * its signed id must stay listed, and G11 refuses one address under two ids.) Signer-side only (predecessorDigest is
 * null): no verifier enforces this.
 */
export function checkSignedDeployments(ledger, registry, sequence) {
  if (ledger === null) return;
  if (sequence <= ledger.lastSequence) throw new Error('SEQUENCE_NOT_INCREASING');
  for (const signed of ledger.deployments) {
    const deployment = registry.networks.find(network => network.id === signed.networkId)?.deployments.find(item => item.id === signed.id);
    if (!deployment) throw refuse('DEPLOYMENT_ID_DROPPED', signed.id);
    if (deployment.address !== signed.address || deployment.runtime.keccak256 !== signed.runtimeKeccak || deployment.artifactSha256 !== signed.artifactSha256) throw refuse('DEPLOYMENT_ID_REBOUND', signed.id);
  }
}

/** The ledger after signing `registry` as `sequence`: earlier entries unchanged, new ids appended with their first sequence. */
export function nextSignedDeployments(ledger, registry, { sequence, manifestSha256 }) {
  const deployments = [...(ledger?.deployments ?? [])];
  for (const network of registry.networks) for (const deployment of network.deployments) {
    if (!deployments.some(entry => entry.networkId === network.id && entry.id === deployment.id)) deployments.push({ networkId: network.id, id: deployment.id,
      address: deployment.address, runtimeKeccak: deployment.runtime.keccak256, artifactSha256: deployment.artifactSha256, firstSequence: sequence });
  }
  return { format: SIGNED_DEPLOYMENTS_FORMAT, channel: CHANNEL, lastSequence: sequence, lastManifestSha256: manifestSha256, deployments };
}

/**
 * Builds and signs the manifest over the registry and ABI assets of `root` (the repository checkout). The registry must
 * be exactly Sepolia and the ABI byte-identical to the canonical committed ABI (D3: an ABI change needs per-deployment ABI
 * digests first, or packages for older escrows could no longer be built). `expectGenesis` exists only for local proofs
 * on a node started with Sepolia's chain id. Returns the signed bytes plus a summary of what was signed, for the owner to check.
 */
export async function signRelease({ privateJwk, sequence, days = MAX_RELEASE_DAYS, now = Math.floor(Date.now() / 1000), root = ROOT, sourceCommit, expectGenesis }) {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('SEQUENCE_INVALID');
  if (!Number.isSafeInteger(days) || days < 1 || days > MAX_RELEASE_DAYS) throw new Error('DAYS_INVALID');
  const registry = await readFile(resolve(root, REGISTRY_ASSET));
  let abi;
  try { abi = await readFile(resolve(root, ABI_ASSET)); } catch { throw new Error('ABI_MISSING'); }
  if (!abi.equals(await readFile(CANONICAL_ABI))) throw new Error('ABI_NOT_CANONICAL');
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
  // Signer-side continuity (D3): previously signed deployment ids keep their identity and stay listed.
  const ledger = await readSignedDeployments(root);
  checkSignedDeployments(ledger, parsed, sequence);
  const manifest = await buildManifest({ registry, abi, sequence, days, now, root, sourceCommit });
  const signed = signManifest(privateJwk, manifest);
  const previouslySigned = (networkId, id) => Boolean(ledger?.deployments.some(entry => entry.networkId === networkId && entry.id === id));
  const summary = { releaseId: parsed.releaseId, sequence, assets: manifest.assets, networks: parsed.networks.map(network => ({ id: network.id, chainIdentity: network.chainIdentity,
    genesisHash: network.genesisHash, environment: network.environment, endpoints: network.endpoints.map(endpoint => endpoint.url),
    deployments: network.deployments.map(deployment => ({ id: deployment.id, address: deployment.address, runtimeKeccak: deployment.runtime.keccak256 ?? null,
      previouslySigned: previouslySigned(network.id, deployment.id) })) })) };
  return { ...signed, summary, signedDeployments: nextSignedDeployments(ledger, parsed, { sequence, manifestSha256: signed.envelope.manifestSha256 }) };
}

/** Writes a signed release under `root`: manifest, envelope, then the ledger (when given). Commit all three together. */
export async function writeSignedRelease(root, { manifestBytes, envelope, signedDeployments }) {
  await writeFile(resolve(root, RELEASE_MANIFEST_FILE), manifestBytes);
  await writeFile(resolve(root, RELEASE_ENVELOPE_FILE), JSON.stringify(envelope, null, 2) + '\n');
  if (signedDeployments !== undefined) await writeFile(resolve(root, SIGNED_DEPLOYMENTS_FILE), JSON.stringify(signedDeployments, null, 2) + '\n');
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
    await writeSignedRelease(ROOT, signed);
    console.log(JSON.stringify({ ok: true, manifestSha256: signed.envelope.manifestSha256, keyId: signed.envelope.keyId, signed: signed.summary }, null, 2));
  } else { console.error('usage: owner-release.mjs keygen --out <dir> | sign --key <private.jwk> --sequence <n> [--days 30]'); process.exitCode = 2; }
}
