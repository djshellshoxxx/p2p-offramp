/** Offline evidence check over retained public registry metadata/keys. Never changes app trust or enables crypto. */
import { readFileSync } from 'node:fs';
import { createHash, createPublicKey, verify } from 'node:crypto';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const keyPath = 'docs/evidence/npm-registry-keys-20261026.json';
const metadataPath = 'docs/evidence/npm-signed-package-metadata-20261026.json';
const keys = read(keyPath).keys, packages = read(metadataPath), lock = read('package-lock.json');
// RFC5656 SSH public-key wire encoding, used for npm's key ID (not the SPKI DER hash).
const part = bytes => { bytes = Buffer.from(bytes); const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length); return Buffer.concat([size, bytes]); };
const publicKey = record => {
  if (record.keytype !== 'ecdsa-sha2-nistp256' || record.scheme !== 'ecdsa-sha2-nistp256') throw new Error('Unsupported recorded key scheme');
  if (record.expires !== null && Date.parse(record.expires) <= Date.parse('2026-10-26T00:00:00Z')) throw new Error('Recorded key expired at observation date');
  const key = createPublicKey({ key: Buffer.from(record.key, 'base64'), format: 'der', type: 'spki' });
  const jwk = key.export({ format: 'jwk' });
  if (jwk.crv !== 'P-256') throw new Error('Unexpected registry curve');
  const point = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  const wire = Buffer.concat([part('ecdsa-sha2-nistp256'), part('nistp256'), part(point)]);
  const id = `SHA256:${createHash('sha256').update(wire).digest('base64').replace(/=+$/, '')}`;
  if (id !== record.keyid) throw new Error('Registry key ID mismatch');
  return key;
};
const results = [];
for (const entry of packages) {
  if (!['@noble/hashes', '@noble/curves'].includes(entry.name) || entry.version !== '2.4.0') throw new Error('Unexpected evidence package');
  if (lock.packages[`node_modules/${entry.name}`].integrity !== entry.integrity) throw new Error('Lock differs from signed integrity');
  if (entry.signatures.length !== 1) throw new Error('Unexpected signature set');
  const signature = entry.signatures[0], record = keys.find(key => key.keyid === signature.keyid);
  if (!record) throw new Error('No authoritative recorded key');
  const key = publicKey(record), message = Buffer.from(`${entry.name}@${entry.version}:${entry.integrity}`), bytes = Buffer.from(signature.sig, 'base64');
  if (!verify('sha256', message, key, bytes)) throw new Error('Registry signature failed');
  const wrongMessage = Buffer.from(message); wrongMessage[0] ^= 1;
  const wrongSignature = Buffer.from(bytes); wrongSignature[wrongSignature.length - 1] ^= 1;
  const other = keys.find(value => value.keyid !== record.keyid);
  const otherKey = createPublicKey({ key: Buffer.from(other.key, 'base64'), format: 'der', type: 'spki' });
  const negatives = [verify('sha256', wrongMessage, key, bytes), verify('sha256', message, key, wrongSignature), verify('sha256', message, otherKey, bytes)];
  if (negatives.some(Boolean)) throw new Error('Tamper control was accepted');
  results.push({ package: entry.name, version: entry.version, integrity: entry.integrity, keyid: record.keyid,
    keyExpires: record.expires, registrySignatureVerified: true, tamperedMessageRejected: true, tamperedSignatureRejected: true, wrongKeyRejected: true });
}
if (results.length !== 2) throw new Error('Missing provider evidence');
console.log(JSON.stringify({ observedDate: '2026-10-26', keySource: 'https://registry.npmjs.org/-/npm/v1/keys',
  messageContract: 'https://docs.npmjs.com/about-registry-signatures/', node: process.version,
  scope: 'Authenticates registry assertion over name@version:integrity; does NOT sign gitHead or approve package safety',
  keyEvidenceSha256: createHash('sha256').update(readFileSync(keyPath)).digest('hex'),
  signedMetadataSha256: createHash('sha256').update(readFileSync(metadataPath)).digest('hex'), results }, null, 2));
