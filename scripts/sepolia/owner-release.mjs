#!/usr/bin/env node
/**
 * OWNER-SIDE tool for the Sepolia testnet trust root (G15 release manifest over the G11 registry). Run it on your own
 * machine, never in a shared or agent session: it handles the testnet release signing key.
 *
 *   keygen --out <dir>                 Create a P-256 testnet signing key. Writes <dir>/sepolia-release-key.private.jwk
 *                                      (mode 0600, refuses to overwrite) and prints ONLY the public JWK + keyId, which
 *                                      is what you hand over (commit it as security/testnet-trust/sepolia-release-key.pub.json).
 *   sign --key <private.jwk> --sequence <n> [--days 30] [--previous-key <pub.json>]
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
 * keccak and artifactSha256 in every later release, and the ABI never changes while signed deployments exist. `sign`
 * refuses a registry that rebinds a signed id (DEPLOYMENT_ID_REBOUND) or drops one (DEPLOYMENT_ID_DROPPED), an ABI other
 * than the signed one (ABI_CHANGED), and a sequence that does not exceed the last signed one (SEQUENCE_NOT_INCREASING);
 * the G11 parser already refuses one address under two ids (REGISTRY_INVALID). The ledger is signed by the release key
 * (domain "p2p-offramp/signed-deployments/v1\n") and verified at signing against the signer's own key or an explicit
 * `--previous-key` (the first signing after a rotation): an edited ledger is SIGNED_DEPLOYMENTS_INVALID, one signed by
 * another key SIGNED_DEPLOYMENTS_UNTRUSTED. Once any release exists (a committed manifest, an accepted release, or a
 * sequence above 1) a ledger is required (SIGNED_DEPLOYMENTS_MISSING), it must belong to the committed manifest and must
 * not be older than the accepted release (SIGNED_DEPLOYMENTS_STALE). THIS IS A SIGNER-SIDE CHECK ONLY: manifests keep
 * `predecessorDigest: null`, so no verifier can enforce it, and a stolen key could still rebind an id. A restore of the
 * manifest, envelope, ledger AND accepted file to one older release is consistent and cannot be detected here: the
 * summary's `previousRelease` names the release the ledger continues, for the owner to compare with the last one signed.
 * Verifiers still accept only a Sepolia-only registry, and recovery packages already built keep their original pins.
 *
 * Format (identical to the G15 verifier, packages/security/src/release-manifest.ts): canonical JSON manifest, ES256
 * with IEEE-P1363 signature over "p2p-offramp/release/v1\n" + manifest bytes, keyId = sha256(canonical {crv,kty,x,y}).
 * The manifest names no deployments of its own (G15 keeps `deployments: []`); the escrow deployments are inside the
 * signed registry asset. Its asset list is exactly SEPOLIA_RELEASE_ASSETS, sorted by path, so the testnet build, the app
 * runtime, sepolia:verify, the trade tool and the maintained recovery builder all accept the same signed manifest.
 * Testnet only: this key is not a mainnet trust root.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRegistryBytes } from '../../packages/schemas/index.ts';
import { isSepoliaOnly, SEPOLIA_RELEASE_ASSETS, SEPOLIA_RELEASE_CHANNEL } from '../../apps/web/src/testnet/sepolia-network.ts';
import { isDeploymentId, isMain, parseSingleOptions } from './lib.mjs';

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
/** The accepted-release record written by `sepolia:verify -- --accept` (apps/web/scripts/testnet-trust.mjs). */
const ACCEPTED_FILE = 'registry/testnet/sepolia.accepted.json';
const LEDGER_DOMAIN = 'p2p-offramp/signed-deployments/v1\n';
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
/** Strict parse of the signed deployment ledger (structure only; signRelease also verifies its signature). */
export function parseSignedDeployments(text) {
  const invalid = () => { throw new Error('SIGNED_DEPLOYMENTS_INVALID'); };
  let value;
  try { value = JSON.parse(text); } catch { return invalid(); }
  if (!exactKeys(value, ['format', 'channel', 'lastSequence', 'lastManifestSha256', 'abiSha256', 'deployments', 'keyId', 'signature']) ||
      value.format !== SIGNED_DEPLOYMENTS_FORMAT || value.channel !== CHANNEL || !Number.isSafeInteger(value.lastSequence) || value.lastSequence < 1 ||
      !HEX64.test(value.lastManifestSha256 ?? '') || !HEX64.test(value.abiSha256 ?? '') || !HEX64.test(value.keyId ?? '') ||
      typeof value.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(value.signature) || !Array.isArray(value.deployments)) return invalid();
  const seen = new Set();
  for (const entry of value.deployments) {
    if (!exactKeys(entry, ['networkId', 'id', 'address', 'runtimeKeccak', 'artifactSha256', 'firstSequence']) || !isDeploymentId(entry.networkId) ||
        !isDeploymentId(entry.id) || !/^0x[0-9a-f]{40}$/.test(entry.address ?? '') || !HEX64.test(entry.runtimeKeccak ?? '') || !HEX64.test(entry.artifactSha256 ?? '') ||
        !Number.isSafeInteger(entry.firstSequence) || entry.firstSequence < 1 || entry.firstSequence > value.lastSequence || seen.has(`${entry.networkId}/${entry.id}`)) return invalid();
    seen.add(`${entry.networkId}/${entry.id}`);
  }
  return value;
}

const ledgerPayload = ({ signature, ...signedPart }) => Buffer.concat([Buffer.from(LEDGER_DOMAIN), Buffer.from(canonical(signedPart))]);
/** Signs a ledger body with the release key. The keyId is inside the signed part, so it cannot be swapped. */
export function signLedger(privateJwk, body) {
  const unsigned = { ...body, keyId: keyIdOf(publicJwk(privateJwk)) };
  const signature = sign('sha256', ledgerPayload(unsigned), { key: createPrivateKey({ key: privateJwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return { ...unsigned, signature };
}
/** The ledger's signature must verify under one of `publicKeys` (P-256 JWKs): unknown key UNTRUSTED, bad signature INVALID. */
function verifyLedger(ledger, publicKeys) {
  const key = publicKeys.find(candidate => keyIdOf(candidate) === ledger.keyId);
  if (!key) throw new Error('SIGNED_DEPLOYMENTS_UNTRUSTED');
  let valid = false;
  try {
    valid = verify('sha256', ledgerPayload(ledger), { key: createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: key.x, y: key.y }, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
      Buffer.from(ledger.signature, 'base64url'));
  } catch { valid = false; }
  if (!valid) throw new Error('SIGNED_DEPLOYMENTS_INVALID');
}

async function readOptional(path) {
  try { return await readFile(path); } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}
async function readAccepted(root) {
  const bytes = await readOptional(resolve(root, ACCEPTED_FILE));
  if (bytes === null) return null;
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('ACCEPTED_INVALID'); }
  if (!exactKeys(value, ['sequence', 'manifestSha256']) || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || !HEX64.test(value.manifestSha256 ?? '')) throw new Error('ACCEPTED_INVALID');
  return value;
}
/** The ids the ledger under `root` lists, for the deploy and record tools' early refusal (structure only, no signature check). */
export async function signedDeploymentIdentities(root) {
  const text = await readOptional(resolve(root, SIGNED_DEPLOYMENTS_FILE));
  return text === null ? [] : parseSignedDeployments(text.toString('utf8')).deployments;
}
/**
 * The signed deployment ledger under `root`, verified for signing release `sequence`. It is null only before the first
 * release: once a manifest is committed, a release was accepted, or the sequence is above 1, a missing ledger is
 * SIGNED_DEPLOYMENTS_MISSING. Its signature must verify under `trustedKeys` (the signer's key and any explicit previous
 * key). It must belong to the committed manifest and not be older than the accepted release (SIGNED_DEPLOYMENTS_STALE),
 * so deleting, emptying or rolling back the ledger, or restoring an older release's files, cannot reopen a signed id.
 */
export async function readSignedDeployments(root, { trustedKeys, sequence }) {
  const text = await readOptional(resolve(root, SIGNED_DEPLOYMENTS_FILE));
  const committed = await readOptional(resolve(root, RELEASE_MANIFEST_FILE));
  const accepted = await readAccepted(root);
  if (text === null) {
    if (committed !== null || accepted !== null || sequence > 1) throw new Error('SIGNED_DEPLOYMENTS_MISSING');
    return null;
  }
  const ledger = parseSignedDeployments(text.toString('utf8'));
  verifyLedger(ledger, trustedKeys);
  if (committed !== null && sha(committed) !== ledger.lastManifestSha256) throw new Error('SIGNED_DEPLOYMENTS_STALE');
  if (accepted !== null && (ledger.lastSequence < accepted.sequence || ledger.lastSequence === accepted.sequence && ledger.lastManifestSha256 !== accepted.manifestSha256)) {
    throw new Error('SIGNED_DEPLOYMENTS_STALE');
  }
  return ledger;
}

const refuse = (code, deploymentId) => Object.assign(new Error(code), { deploymentId });
/**
 * D3 continuity rule over a parsed registry: every previously signed id must still be listed with the same address,
 * runtime keccak and artifactSha256, the ABI must be the signed one, and the sequence must increase. (A signed address
 * cannot reappear under a new id: its signed id must stay listed, and G11 refuses one address under two ids.)
 * Signer-side only (predecessorDigest is null): no verifier enforces this.
 */
export function checkSignedDeployments(ledger, registry, sequence, abiSha256) {
  if (ledger === null) return;
  if (sequence <= ledger.lastSequence) throw new Error('SEQUENCE_NOT_INCREASING');
  if (ledger.deployments.length > 0 && abiSha256 !== ledger.abiSha256) throw new Error('ABI_CHANGED');
  for (const signed of ledger.deployments) {
    const deployment = registry.networks.find(network => network.id === signed.networkId)?.deployments.find(item => item.id === signed.id);
    if (!deployment) throw refuse('DEPLOYMENT_ID_DROPPED', signed.id);
    if (deployment.address !== signed.address || deployment.runtime.keccak256 !== signed.runtimeKeccak || deployment.artifactSha256 !== signed.artifactSha256) throw refuse('DEPLOYMENT_ID_REBOUND', signed.id);
  }
}

/** The unsigned ledger body after signing `registry` as `sequence`: earlier entries unchanged, new ids appended. */
export function nextSignedDeployments(ledger, registry, { sequence, manifestSha256, abiSha256 }) {
  const deployments = [...(ledger?.deployments ?? [])];
  for (const network of registry.networks) for (const deployment of network.deployments) {
    if (!deployments.some(entry => entry.networkId === network.id && entry.id === deployment.id)) deployments.push({ networkId: network.id, id: deployment.id,
      address: deployment.address, runtimeKeccak: deployment.runtime.keccak256, artifactSha256: deployment.artifactSha256, firstSequence: sequence });
  }
  return { format: SIGNED_DEPLOYMENTS_FORMAT, channel: CHANNEL, lastSequence: sequence, lastManifestSha256: manifestSha256, abiSha256, deployments };
}

/** A `{ keyId, publicKey }` file (what keygen printed for an earlier key); its keyId must name its key. */
export function previousPublicKey(record) {
  const key = record?.publicKey;
  if (typeof key?.x !== 'string' || typeof key?.y !== 'string' || key.kty !== 'EC' || key.crv !== 'P-256' || record.keyId !== keyIdOf(key)) throw new Error('PREVIOUS_KEY_INVALID');
  return publicJwk(key);
}

/**
 * Builds and signs the manifest over the registry and ABI assets of `root` (the repository checkout). The registry must
 * be exactly Sepolia and the ABI byte-identical to the canonical committed ABI (D3: an ABI change needs per-deployment ABI
 * digests first, or packages for older escrows could no longer be built). `expectGenesis` exists only for local proofs
 * on a node started with Sepolia's chain id. `previousPublicKeys` (public JWKs) lets the first signing after a key rotation
 * verify the ledger signed by the earlier key. Returns the signed bytes, the signed ledger and a summary of what was
 * signed, for the owner to check.
 */
export async function signRelease({ privateJwk, sequence, days = MAX_RELEASE_DAYS, now = Math.floor(Date.now() / 1000), root = ROOT, sourceCommit, expectGenesis, previousPublicKeys = [] }) {
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
  // Signer-side continuity (D3): previously signed deployment ids keep their identity and stay listed, and the ABI stays.
  const ledger = await readSignedDeployments(root, { trustedKeys: [publicJwk(privateJwk), ...previousPublicKeys], sequence });
  const abiSha256 = sha(abi);
  checkSignedDeployments(ledger, parsed, sequence, abiSha256);
  const manifest = await buildManifest({ registry, abi, sequence, days, now, root, sourceCommit });
  const signed = signManifest(privateJwk, manifest);
  const previouslySigned = (networkId, id) => Boolean(ledger?.deployments.some(entry => entry.networkId === networkId && entry.id === id));
  const previousRelease = ledger === null ? null : { sequence: ledger.lastSequence, manifestSha256: ledger.lastManifestSha256, ledgerKeyId: ledger.keyId };
  const summary = { releaseId: parsed.releaseId, sequence, previousRelease, assets: manifest.assets, networks: parsed.networks.map(network => ({ id: network.id, chainIdentity: network.chainIdentity,
    genesisHash: network.genesisHash, environment: network.environment, endpoints: network.endpoints.map(endpoint => endpoint.url),
    deployments: network.deployments.map(deployment => ({ id: deployment.id, address: deployment.address, runtimeKeccak: deployment.runtime.keccak256 ?? null,
      previouslySigned: previouslySigned(network.id, deployment.id) })) })) };
  const signedDeployments = signLedger(privateJwk, nextSignedDeployments(ledger, parsed, { sequence, manifestSha256: signed.envelope.manifestSha256, abiSha256 }));
  return { ...signed, summary, signedDeployments };
}

/** Writes a signed release under `root`: manifest, envelope, then the ledger (when given). Commit all three together. */
export async function writeSignedRelease(root, { manifestBytes, envelope, signedDeployments }) {
  await writeFile(resolve(root, RELEASE_MANIFEST_FILE), manifestBytes);
  await writeFile(resolve(root, RELEASE_ENVELOPE_FILE), JSON.stringify(envelope, null, 2) + '\n');
  if (signedDeployments !== undefined) await writeFile(resolve(root, SIGNED_DEPLOYMENTS_FILE), JSON.stringify(signedDeployments, null, 2) + '\n');
}

if (isMain(import.meta.url)) {
  const [command] = process.argv.slice(2);
  const { values, repeated } = parseSingleOptions({ args: process.argv.slice(3), options: { out: { type: 'string' }, key: { type: 'string' }, sequence: { type: 'string' },
    days: { type: 'string' }, 'previous-key': { type: 'string' } } });
  if (repeated) throw new Error(`OPTION_REPEATED: --${repeated}`);
  if (command === 'keygen') {
    if (!values.out) throw new Error('--out <dir> is required');
    await mkdir(values.out, { recursive: true, mode: 0o700 });
    const generated = keygen();
    await writeFile(resolve(values.out, 'sepolia-release-key.private.jwk'), JSON.stringify(generated.privateJwk), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ keyId: generated.keyId, publicKey: generated.publicKey }, null, 2));
  } else if (command === 'sign') {
    if (!values.key || !values.sequence) throw new Error('--key and --sequence are required');
    const previousPublicKeys = values['previous-key'] ? [previousPublicKey(JSON.parse(await readFile(values['previous-key'], 'utf8')))] : [];
    const signed = await signRelease({ privateJwk: JSON.parse(await readFile(values.key, 'utf8')), sequence: Number(values.sequence), days: Number(values.days ?? 30), previousPublicKeys });
    await writeSignedRelease(ROOT, signed);
    console.log(JSON.stringify({ ok: true, manifestSha256: signed.envelope.manifestSha256, keyId: signed.envelope.keyId, signed: signed.summary }, null, 2));
  } else { console.error('usage: owner-release.mjs keygen --out <dir> | sign --key <private.jwk> --sequence <n> [--days 30] [--previous-key <old pub.json>]'); process.exitCode = 2; }
}
