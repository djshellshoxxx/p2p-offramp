/** Synthetic G15 fixtures only. Ephemeral signing keys stay in this Node process and are never exported. */
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const encode = text => new TextEncoder().encode(text);
export const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
    : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
export function fixture(edit = () => {}) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const exported = publicKey.export({ format: 'jwk' });
  const key = { kty: 'EC', crv: 'P-256', x: exported.x, y: exported.y, key_ops: ['verify'], ext: true };
  const keyId = sha(encode(canonical({ crv: key.crv, kty: key.kty, x: key.x, y: key.y })));
  const assets = [{ path: '__proto__', bytes: new Uint8Array([0xff, 0x80, 0, 0x41]) },
    { path: 'assets/main.js', bytes: encode('export const fixture = "café 日本語 🌍";\n') },
    { path: 'index.html', bytes: encode('<!doctype html><title>Owned fixture</title>') }];
  const manifest = { format: 'p2p-offramp-release', version: 1, channel: 'fixture-beta', sequence: 2,
    releaseId: 'fixture-café-🌍', sourceCommit: '1'.repeat(40), buildRecipeDigest: '2'.repeat(64), lockfileDigest: '3'.repeat(64), sbomDigest: '4'.repeat(64),
    createdAt: 1000, expiresAt: 2000, minStorageSchema: 1, maxStorageSchema: 1,
    assets: assets.map(({ path, bytes }) => ({ path, bytes: bytes.length, sha256: sha(bytes) })), deployments: [], predecessorDigest: null };
  edit(manifest);
  const bytes = encode(canonical(manifest));
  const makeEnvelope = (payload = bytes, prefix = 'p2p-offramp/release/v1\n', encoding = 'ieee-p1363') => ({
    v: 1, keyId, alg: 'ES256-P1363', manifestSha256: sha(payload),
    signature: sign('sha256', Buffer.concat([Buffer.from(prefix), Buffer.from(payload)]), { key: privateKey, dsaEncoding: encoding }).toString('base64url'),
  });
  return { manifest, bytes, key, keyId, assets, makeEnvelope, envelope: makeEnvelope(),
    options: { channel: 'fixture-beta', nowSeconds: () => 1500, assets } };
}
