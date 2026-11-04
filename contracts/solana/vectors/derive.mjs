// Independent Solana PDA / Anchor reference generator (second implementation, no Solana SDK).
// Usage: node derive.mjs --write | --check
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ed25519 } from '@noble/curves/ed25519.js';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const enc = new TextEncoder();
export const FORMAT = 'p2p-offramp/solana-independent-vectors/v1';
export const FIXTURE_PATH = fileURLToPath(new URL('./solana-independent.json', import.meta.url));

export const sha256 = (...parts) => {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return new Uint8Array(h.digest());
};
export const toHex = (b) => Buffer.from(b).toString('hex');
const concat = (...a) => Uint8Array.from(a.flatMap((x) => [...x]));

// ---- base58 (Bitcoin alphabet) ----
export function base58Encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  return '1'.repeat(zeros) + out;
}

// Rejects invalid chars, non-canonical encodings (re-encode must match) and wrong length.
export function base58Decode(str, expectedLength = null) {
  if (typeof str !== 'string' || str.length === 0) throw new Error('base58: empty input');
  let n = 0n;
  for (const ch of str) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error(`base58: invalid character ${JSON.stringify(ch)}`);
    n = n * 58n + BigInt(i);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  let body = n === 0n ? [] : [...Buffer.from(hex, 'hex')];
  let zeros = 0;
  while (zeros < str.length && str[zeros] === '1') zeros++;
  const bytes = Uint8Array.from([...new Array(zeros).fill(0), ...body]);
  if (base58Encode(bytes) !== str) throw new Error('base58: non-canonical encoding');
  if (expectedLength !== null && bytes.length !== expectedLength) {
    throw new Error(`base58: expected ${expectedLength} bytes, got ${bytes.length}`);
  }
  return bytes;
}
export const decodeKey = (s) => base58Decode(s, 32);

// ---- PDA ----
// Valid ed25519 point <=> compressed encoding decompresses. (Strict decoder; non-canonical y
// encodings that dalek might accept occur with probability ~2^-250 for a sha256 output.)
export function isOnCurve(bytes32) {
  try {
    ed25519.Point.fromBytes(bytes32);
    return true;
  } catch {
    return false;
  }
}

export function createProgramAddress(seeds, programId) {
  if (seeds.length > 16) throw new Error('PDA: max 16 seeds');
  for (const s of seeds) if (s.length > 32) throw new Error('PDA: seed longer than 32 bytes');
  if (programId.length !== 32) throw new Error('PDA: program id must be 32 bytes');
  const hash = sha256(...seeds, programId, enc.encode('ProgramDerivedAddress'));
  if (isOnCurve(hash)) throw new Error('PDA: derived address is on curve');
  return hash;
}

// Canonical bump = highest bump (255 downward) giving an off-curve address.
// Note: seeds + bump counts toward the 16-seed limit, so 16 user seeds fail on every bump.
export function findProgramAddress(seeds, programId) {
  for (let bump = 255; bump >= 0; bump--) {
    try {
      return { address: createProgramAddress([...seeds, Uint8Array.of(bump)], programId), bump };
    } catch (e) {
      if (!/on curve/.test(e.message)) throw e;
    }
  }
  throw new Error('PDA: no viable bump');
}

// ---- constants ----
export const ATA_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const PROGRAM_ID_ASCII = 'escrow-program:p2p-offramp:local';
export const PROGRAM_ID = base58Encode(enc.encode(PROGRAM_ID_ASCII));
export const MINT_ASCII = ['mint-6dp-open:p2p-offramp:local1', 'freezable-mint-6dp:p2p-offramp:1'];
export const MINTS = MINT_ASCII.map((m) => base58Encode(enc.encode(m)));
if (PROGRAM_ID !== '7q2EChqznfQea58ZfUvBzRd97Bc28kwHaey1tYy7ADjq') throw new Error('PROGRAM_ID mismatch');

export function findAta(owner, mint) {
  return findProgramAddress([owner, decodeKey(TOKEN_PROGRAM_ID), mint], decodeKey(ATA_PROGRAM_ID));
}
const pda = (r) => ({ address: base58Encode(r.address), bump: r.bump });

export function discriminator(ns, name) {
  return toHex(sha256(enc.encode(`${ns}:${name}`)).slice(0, 8));
}

function escrowCase(i, seller, nonce, nonceLabel) {
  const programId = decodeKey(PROGRAM_ID);
  const escrow = findProgramAddress([enc.encode('p2p-offramp-escrow-v1'), seller, nonce], programId);
  const vault = findProgramAddress([enc.encode('p2p-offramp-vault-v1'), escrow.address], programId);
  const buyer = sha256(enc.encode(`vector-buyer-${i}`));
  return {
    index: i,
    seller: base58Encode(seller),
    sellerHex: toHex(seller),
    nonce: base58Encode(nonce),
    nonceHex: toHex(nonce),
    nonceLabel,
    escrow: pda(escrow),
    vault: pda(vault),
    buyer: base58Encode(buyer),
    buyerAtas: MINTS.map((m) => ({ mint: m, ata: pda(findAta(buyer, decodeKey(m))) })),
  };
}

function buildEscrowCases() {
  const cases = [];
  for (let i = 0; i < 6; i++) {
    const seller = sha256(enc.encode(`vector-seller-${i}`));
    let nonce = sha256(enc.encode(`vector-nonce-${i}`));
    let label = 'sha256';
    if (i === 2) [nonce, label] = [new Uint8Array(32), 'all-zero'];
    if (i === 4) [nonce, label] = [new Uint8Array(32).fill(0xff), 'all-0xff'];
    cases.push(escrowCase(i, seller, nonce, label));
  }
  // Ensure at least one canonical bump < 255 (search further indices if needed).
  const low = (c) => [c.escrow, c.vault, ...c.buyerAtas.map((a) => a.ata)].some((p) => p.bump < 255);
  for (let i = 6; !cases.some(low) && i < 200; i++) {
    const seller = sha256(enc.encode(`vector-seller-${i}`));
    cases.push(escrowCase(i, seller, sha256(enc.encode(`vector-nonce-${i}`)), 'sha256'));
  }
  return cases;
}

function negativeCases() {
  const attempt = (fn) => { try { fn(); return false; } catch { return true; } };
  const pid = decodeKey(PROGRAM_ID);
  const k = (n) => base58Encode(new Uint8Array(n).fill(1));
  const seeds = (n) => Array.from({ length: n }, () => Uint8Array.of(1));
  const rows = [
    ['createProgramAddress with 17 one-byte seeds', () => createProgramAddress(seeds(17), pid)],
    ['createProgramAddress with one 33-byte seed', () => createProgramAddress([new Uint8Array(33)], pid)],
    ['findProgramAddress with 16 user seeds (bump makes 17)', () => findProgramAddress(seeds(16), pid)],
    ['base58 decode of "0OIl" (excluded characters)', () => base58Decode('0OIl')],
    ['base58 decode of 31-byte key', () => decodeKey(k(31))],
    ['base58 decode of 33-byte key', () => decodeKey(k(33))],
  ];
  return rows.map(([description, fn]) => ({ description, expectError: attempt(fn) }));
}

export function buildFixture() {
  const req = createRequire(import.meta.url);
  // package.json is not in the exports map; locate it relative to a resolved entry file.
  const ver = (p) => {
    const entry = req.resolve(`${p}/utils.js`);
    const root = entry.slice(0, entry.lastIndexOf(`node_modules/${p}/`) + `node_modules/${p}/`.length);
    return JSON.parse(readFileSync(root + 'package.json', 'utf8')).version;
  };
  const names = ['fund_native', 'fund_spl', 'release', 'refund', 'payout_native', 'payout_spl'];
  const disc = (ns, list) => Object.fromEntries(list.map((n) => [n, discriminator(ns, n)]));
  return {
    format: FORMAT,
    generator: {
      file: 'contracts/solana/vectors/derive.mjs',
      nodeMajor: process.versions.node.split('.')[0],
      nobleCurves: ver('@noble/curves'),
      nobleHashes: ver('@noble/hashes'),
    },
    constants: {
      programId: PROGRAM_ID,
      programIdAscii: PROGRAM_ID_ASCII,
      ataProgramId: ATA_PROGRAM_ID,
      tokenProgramId: TOKEN_PROGRAM_ID,
      idsSource: 'known-constant-unverified-on-disk',
      escrowSeedPrefix: 'p2p-offramp-escrow-v1',
      vaultSeedPrefix: 'p2p-offramp-vault-v1',
      mints: MINT_ASCII.map((a, i) => ({ ascii: a, address: MINTS[i] })),
    },
    discriminators: {
      accounts: disc('account', ['EscrowV1']),
      instructions: disc('global', names),
      events: disc('event', ['Funded', 'Released', 'Refunded', 'PaidOut']),
    },
    escrowCases: buildEscrowCases(),
    negativeCases: negativeCases(),
  };
}

export const render = () => JSON.stringify(buildFixture(), null, 2) + '\n';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = render();
  if (process.argv.includes('--write')) writeFileSync(FIXTURE_PATH, out);
  else if (process.argv.includes('--check')) {
    let cur = '';
    try { cur = readFileSync(FIXTURE_PATH, 'utf8'); } catch {}
    if (cur !== out) { console.error('fixture differs from regenerated output'); process.exit(1); }
  } else { console.error('usage: derive.mjs --write | --check'); process.exit(2); }
}
