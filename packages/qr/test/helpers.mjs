// Synthetic test fixtures only: no real address, key, order or account. Node crypto is test-side only.
import { createHash, createHmac } from 'node:crypto';

export const sha256 = async bytes => createHash('sha256').update(bytes).digest();
export const hashHex = label => createHash('sha256').update(label).digest('hex');
export const NOW = 1_800_000_000;

/** Deterministic "random" bytes for reproducible fixtures (never for real codes). */
export function seededRandom(label) {
  let counter = 0;
  return length => {
    const out = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += 32) {
      const block = createHash('sha256').update(`${label}/${counter++}`).digest();
      out.set(block.subarray(0, Math.min(32, length - offset)), offset);
    }
    return out;
  };
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes) {
  let n = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`), out = '';
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; out = `1${out}`; }
  return out;
}

export const EVM_CHAIN = 'evm:11155111';
export const OTHER_EVM_CHAIN = 'evm:1';
export const SOLANA_CHAIN = `solana:${base58(createHash('sha256').update('qr-test-genesis').digest())}`;
export const CHAINS = Object.freeze([EVM_CHAIN, OTHER_EVM_CHAIN, SOLANA_CHAIN]);
export const evmAddress = label => `0x${hashHex(label).slice(0, 40)}`;
export const solanaKey = label => base58(createHash('sha256').update(label).digest());
export const adAddress = (author, orderId) => `30078:${author}:p2p-offramp:v1:${orderId}`;

export const INPUTS = Object.freeze({
  'public-address': { type: 'public-address', chain: EVM_CHAIN, payload: { address: evmAddress('qr-address') }, originHint: 'offramp.example' },
  'payment-request': { type: 'payment-request', chain: EVM_CHAIN, payload: { recipient: evmAddress('qr-recipient'), asset: 'native', amount: '1500000000000000000' }, lifetimeSeconds: 900 },
  'trade-invite': { type: 'trade-invite', chain: EVM_CHAIN, payload: { ad: adAddress(hashHex('qr-seller'), hashHex('qr-order')), termsHash: hashHex('qr-terms') }, originHint: 'offramp.example' },
  'release-fingerprint': { type: 'release-fingerprint', chain: null, payload: { channel: 'testnet', releaseId: 'v0.12.4-rc.1', sequence: 7, manifestSha256: hashHex('qr-manifest') } },
  'recovery-fingerprint': { type: 'recovery-fingerprint', chain: null, payload: { format: 'p2p-offramp-backup/v1', byteLength: 48_213, sha256: hashHex('qr-backup') } },
});

export const deps = (label = 'qr-test', now = NOW) => ({ sha256, randomBytes: seededRandom(label), nowSeconds: () => now });
export const context = (extra = {}) => ({ sha256, nowSeconds: () => NOW + 5, chains: CHAINS, ...extra });

/**
 * Test-only invite verifier. HMAC-SHA-256 over the digest stands in for a real signature scheme so the injected
 * verifier interface can be exercised; it is NOT a proposal for the open invite signing-key profile.
 */
export const TEST_PROFILE = 'test-hmac-sha256';
const TEST_KEY = Buffer.from(hashHex('qr-test-only-hmac-key'), 'hex');
export const TEST_PUBLIC_KEY = hashHex('qr-test-only-key-id');
export const testSign = digest => createHmac('sha256', TEST_KEY).update(digest).digest('hex');
export function testVerifier(calls = []) {
  return {
    profile: TEST_PROFILE,
    async verify({ digest, signature, invite, chain }) {
      calls.push({ digest: Buffer.from(digest).toString('hex'), invite, chain });
      return signature.publicKey === TEST_PUBLIC_KEY && signature.value === testSign(digest);
    },
  };
}
