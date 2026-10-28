#!/usr/bin/env node
/**
 * OWNER-SIDE tool for the Sepolia testnet trust root (G15 release manifest over the G11 registry). Run it on your own
 * machine, never in a shared or agent session: it handles the testnet release signing key.
 *
 *   keygen --out <dir>                 Create a P-256 testnet signing key. Writes <dir>/sepolia-release-key.private.jwk
 *                                      (mode 0600, refuses to overwrite) and prints ONLY the public JWK + keyId, which
 *                                      is what you hand over (commit it as security/testnet-trust/sepolia-release-key.pub.json).
 *   sign --key <private.jwk> --sequence <n> [--days 30]
 *                                      Sign a manifest over registry/testnet/sepolia.registry.json. Writes
 *                                      registry/testnet/sepolia.release.json and sepolia.release.sig.json.
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

export const CHANNEL = 'sepolia-testnet';
export const REGISTRY_ASSET = 'registry/testnet/sepolia.registry.json';
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

/** Builds and signs the manifest. `root` is the repository checkout whose registry asset is signed. */
export async function signRelease({ privateJwk, sequence, days = 30, now = Math.floor(Date.now() / 1000), root = ROOT, sourceCommit }) {
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('SEQUENCE_INVALID');
  if (!Number.isSafeInteger(days) || days < 1 || days > 90) throw new Error('DAYS_INVALID');
  const registry = await readFile(resolve(root, REGISTRY_ASSET));
  const registryId = JSON.parse(new TextDecoder().decode(registry)).releaseId;
  const pub = publicJwk(privateJwk);
  const manifest = {
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
  const bytes = new TextEncoder().encode(canonical(manifest));
  const key = createPrivateKey({ key: privateJwk, format: 'jwk' });
  const envelope = { v: 1, keyId: keyIdOf(pub), alg: 'ES256-P1363', manifestSha256: sha(bytes),
    signature: sign('sha256', Buffer.concat([Buffer.from('p2p-offramp/release/v1\n'), Buffer.from(bytes)]), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url') };
  return { manifestBytes: bytes, envelope };
}

if (import.meta.url === `file://${process.argv[1]}`) {
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
    console.log(JSON.stringify({ ok: true, manifestSha256: signed.envelope.manifestSha256, keyId: signed.envelope.keyId }));
  } else { console.error('usage: owner-release.mjs keygen --out <dir> | sign --key <private.jwk> --sequence <n> [--days 30]'); process.exitCode = 2; }
}
