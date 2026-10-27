/** Shared synthetic Node test fixtures only. Existing Noble signing recipe; not independent qualification.
 * Never imported into browser fixture bundles or application code. Browser receives public synthetic signatures only.
 */
import { readFile } from 'node:fs/promises';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { encodePrivateAgreement, encodeCapabilities, sha256Hex } from '../../../domain/index.ts';
import { evmTermsHash } from '../../src/evm-terms.ts';
export const privateVectors = JSON.parse(await readFile(new URL('../../../domain/test/fixtures/g16-vectors.json', import.meta.url), 'utf8'));
const publicVectors = JSON.parse(await readFile(new URL('../fixtures/g16-evm-independent.json', import.meta.url), 'utf8'));
const hex = bytes => Buffer.from(bytes).toString('hex');
export function acceptances(domain, terms) {
  // Public deterministic test keys, using the existing Noble-family test pattern; NOT independent qualification.
  const keys = ['seller', 'buyer'].map(role => keccak_256(new TextEncoder().encode('p2p-offramp-test-only-' + role)));
  try {
    const termsHash = evmTermsHash(domain, terms);
    return keys.map((key, index) => {
      const raw = secp256k1.sign(Buffer.from(termsHash, 'hex'), key, { prehash: false, format: 'recovered', lowS: true });
      return { termsHash, role: index === 0 ? 'seller' : 'buyer', walletAccount: index === 0 ? terms.seller : terms.buyer,
        signature: Uint8Array.from([...raw.subarray(1), raw[0] + 27]) };
    });
  } finally { for (const key of keys) key.fill(0); }
}
export async function fixture(privateAgreement = structuredClone(privateVectors.privateAgreements[0].input)) {
  const base = publicVectors.vectors.find(vector => vector.id === 'native'), domain = structuredClone(base.domain);
  const addresses = ['seller', 'buyer'].map(role => {
    const key = keccak_256(new TextEncoder().encode('p2p-offramp-test-only-' + role));
    try { return '0x' + hex(keccak_256(secp256k1.getPublicKey(key, false).subarray(1)).subarray(12)); } finally { key.fill(0); }
  });
  const privateBytes = encodePrivateAgreement(privateAgreement), capBytes = encodeCapabilities(privateAgreement.capabilities);
  try {
    const terms = { ...base.terms, orderId: privateAgreement.orderId, revision: privateAgreement.revision,
      seller: addresses[0], buyer: addresses[1], privateAgreementHash: await sha256Hex(privateBytes), capabilitiesHash: await sha256Hex(capBytes) };
    return { privateAgreement, domain, terms, acceptances: acceptances(domain, terms) };
  } finally { privateBytes.fill(0); capBytes.fill(0); }
}
