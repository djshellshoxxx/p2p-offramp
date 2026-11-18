// Dependency-free Solana localnet driver: keypairs, legacy transactions, JSON-RPC and the basic_escrow
// instruction builders. Uses only node: built-ins, @noble/curves (ed25519) and ../vectors/derive.mjs.
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { ed25519 } from '@noble/curves/ed25519.js';
import {
  ATA_PROGRAM_ID, MINTS, PROGRAM_ID, SPL_PROGRAM_ID,
  base58Encode, decodeKey, discriminator, findAta, findProgramAddress, sha256, toHex,
} from '../vectors/derive.mjs';

export { ATA_PROGRAM_ID, MINTS, PROGRAM_ID, SPL_PROGRAM_ID, base58Encode, decodeKey, sha256, toHex };
export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
export const LOADER_V3_ID = 'BPFLoaderUpgradeab1e11111111111111111111111';
export const SYSVAR_CLOCK_ID = 'SysvarC1ock11111111111111111111111111111111';
export const SYSVAR_RENT_ID = 'SysvarRent111111111111111111111111111111111';
export const OPEN_MINT = MINTS[0];
export const FREEZABLE_MINT = MINTS[1];
export const GENESIS_HASH_ASCII = 'genesis-hash:p2p-offramp:localv1';
export const ESCROW_ACCOUNT_LEN = 8 + 6 + 4 * 32 + 2 * 8 + 2 * 32;
export const PROGRAMDATA_HEADER_LEN = 45;
export const MAX_TX_BYTES = 1232;
const TERMS_PREFIX = 'p2p-offramp/solana/basic/v1';
const enc = new TextEncoder();

// ---- bytes ----
export const concat = (...parts) => new Uint8Array(Buffer.concat(parts.map((p) => Uint8Array.from(p))));
export const equalBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
export const utf8 = (s) => enc.encode(s);

export function compactU16(n) {
  if (!Number.isInteger(n) || n < 0 || n > 0xffff) throw new Error(`compact-u16 out of range: ${n}`);
  const out = [];
  for (let v = n; ; v >>= 7) {
    if (v < 0x80) return Uint8Array.from([...out, v]);
    out.push((v & 0x7f) | 0x80);
  }
}

export function u64le(value) {
  const n = BigInt(value);
  if (n < 0n || n > 0xffffffffffffffffn) throw new Error(`u64 out of range: ${value}`);
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}

const u32le = (n) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
};

function bytes32(value, name) {
  const b = typeof value === 'string' ? decodeKey(value) : Uint8Array.from(value ?? []);
  if (b.length !== 32) throw new Error(`${name}: expected 32 bytes, got ${b.length}`);
  return b;
}

const view = (data) => new DataView(data.buffer, data.byteOffset, data.byteLength);
const readU64 = (data, off) => view(data).getBigUint64(off, true);
const readI64 = (data, off) => view(data).getBigInt64(off, true);
const readKey = (data, off) => base58Encode(data.slice(off, off + 32));

// ---- keypairs (the seed is non-enumerable so JSON.stringify never emits it) ----
export function keypairFromSeed(seed) {
  if (seed.length !== 32) throw new Error('keypair: seed must be 32 bytes');
  const publicKey = ed25519.getPublicKey(Uint8Array.from(seed));
  const kp = { address: base58Encode(publicKey), publicKey };
  Object.defineProperty(kp, 'seed', { value: Uint8Array.from(seed), enumerable: false });
  kp.toJSON = () => kp.address;
  return kp;
}

export const generateKeypair = () => keypairFromSeed(randomBytes(32));

export function loadKeypairFile(path) {
  const arr = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(arr) || arr.length !== 64) throw new Error(`keypair file ${path}: expected a 64-byte array`);
  const bytes = Uint8Array.from(arr);
  const kp = keypairFromSeed(bytes.slice(0, 32));
  if (!equalBytes(kp.publicKey, bytes.slice(32))) throw new Error(`keypair file ${path}: public key mismatch`);
  return kp;
}

export function writeKeypairFile(path, kp) {
  writeFileSync(path, JSON.stringify([...kp.seed, ...kp.publicKey]), { mode: 0o600 });
}

// ---- legacy transactions ----
export const meta = (pubkey, isSigner, isWritable) => ({ pubkey, isSigner, isWritable });

function collectAccounts(feePayer, instructions) {
  const metas = new Map([[feePayer, { signer: true, writable: true }]]);
  const add = (pubkey, signer, writable) => {
    const m = metas.get(pubkey) ?? { signer: false, writable: false };
    metas.set(pubkey, { signer: m.signer || signer, writable: m.writable || writable });
  };
  for (const ix of instructions) {
    for (const k of ix.keys) add(k.pubkey, k.isSigner, k.isWritable);
    add(ix.programId, false, false);
  }
  const rank = ([addr, m]) => (addr === feePayer ? -1 : (m.signer ? 0 : 2) + (m.writable ? 0 : 1));
  return [...metas.entries()].sort((a, b) => rank(a) - rank(b));
}

export function compileLegacyMessage(feePayer, instructions, recentBlockhash) {
  if (instructions.length === 0) throw new Error('transaction: no instructions');
  const accounts = collectAccounts(feePayer, instructions);
  if (accounts.length > 255) throw new Error('transaction: too many accounts');
  const index = new Map(accounts.map(([a], i) => [a, i]));
  const signers = accounts.filter(([, m]) => m.signer).map(([a]) => a);
  const roSigned = accounts.filter(([, m]) => m.signer && !m.writable).length;
  const roUnsigned = accounts.filter(([, m]) => !m.signer && !m.writable).length;
  const ixBytes = instructions.map((ix) => concat(
    [index.get(ix.programId)],
    compactU16(ix.keys.length), ix.keys.map((k) => index.get(k.pubkey)),
    compactU16(ix.data.length), ix.data,
  ));
  const message = concat(
    [signers.length, roSigned, roUnsigned],
    compactU16(accounts.length), ...accounts.map(([a]) => decodeKey(a)),
    bytes32(recentBlockhash, 'recentBlockhash'),
    compactU16(instructions.length), ...ixBytes,
  );
  return { message, signers };
}

export function signTransaction(compiled, keypairs) {
  const byAddress = new Map(keypairs.map((k) => [k.address, k]));
  for (const k of keypairs) {
    if (!compiled.signers.includes(k.address)) throw new Error(`transaction: unexpected signer ${k.address}`);
  }
  const sigs = compiled.signers.map((addr) => {
    const kp = byAddress.get(addr);
    if (!kp) throw new Error(`transaction: missing signer ${addr}`);
    return ed25519.sign(compiled.message, kp.seed);
  });
  const wire = concat(compactU16(sigs.length), ...sigs, compiled.message);
  if (wire.length > MAX_TX_BYTES) throw new Error(`transaction: ${wire.length} bytes exceeds ${MAX_TX_BYTES}`);
  return { wire, signature: base58Encode(sigs[0]) };
}

// ---- JSON-RPC ----
export class RpcError extends Error {
  constructor(method, error) {
    super(`rpc ${method}: ${error.code} ${error.message}`);
    this.code = error.code;
    this.data = error.data;
  }
}

export class Rpc {
  constructor(url, timeoutMs = 15_000) {
    this.url = url;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
  }

  async call(method, params = []) {
    const body = JSON.stringify({ jsonrpc: '2.0', id: this.nextId++, method, params });
    const res = await fetch(this.url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`rpc ${method}: HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new RpcError(method, json.error);
    return json.result;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LEVELS = { processed: 0, confirmed: 1, finalized: 2 };

export async function getAccount(rpc, address, commitment = 'confirmed') {
  const res = await rpc.call('getAccountInfo', [address, { encoding: 'base64', commitment }]);
  const v = res.value;
  if (!v) return null;
  const data = new Uint8Array(Buffer.from(v.data[0], 'base64'));
  return { lamports: v.lamports, owner: v.owner, executable: v.executable, data, slot: res.context.slot };
}

export async function getBalance(rpc, address, commitment = 'finalized') {
  return (await rpc.call('getBalance', [address, { commitment }])).value;
}

export async function readClock(rpc, commitment = 'confirmed') {
  const acc = await getAccount(rpc, SYSVAR_CLOCK_ID, commitment);
  if (!acc || acc.data.length < 40) throw new Error('clock sysvar: missing or short');
  return {
    slot: Number(readU64(acc.data, 0)),
    epochStartTimestamp: Number(readI64(acc.data, 8)),
    epoch: Number(readU64(acc.data, 16)),
    unixTimestamp: Number(readI64(acc.data, 32)),
  };
}

export async function waitForSignature(rpc, signature, commitment, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await rpc.call('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
    const st = res.value[0];
    if (st && LEVELS[st.confirmationStatus] >= LEVELS[commitment]) return st;
    if (Date.now() > deadline) {
      throw new Error(`signature ${signature}: not ${commitment} within ${timeoutMs} ms (last ${JSON.stringify(st)})`);
    }
    await sleep(500);
  }
}

function preflightFailure(err) {
  if (!(err instanceof RpcError)) return err;
  const logs = err.data?.logs?.slice(-8).join(' | ') ?? '';
  return new Error(`${err.message}; err=${JSON.stringify(err.data?.err ?? null)}; logs: ${logs}`);
}

/// Builds, signs, sends and confirms one legacy transaction. Returns { signature, slot, err, status }.
export async function sendTx(rpc, { feePayer, instructions, signers, skipPreflight = false, commitment }) {
  const { value } = await rpc.call('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const compiled = compileLegacyMessage(feePayer.address, instructions, value.blockhash);
  const { wire, signature } = signTransaction(compiled, signers);
  const opts = { encoding: 'base64', skipPreflight, preflightCommitment: 'confirmed' };
  let sent;
  try {
    sent = await rpc.call('sendTransaction', [Buffer.from(wire).toString('base64'), opts]);
  } catch (e) {
    throw preflightFailure(e);
  }
  if (sent !== signature) throw new Error(`sendTransaction returned ${sent}, expected ${signature}`);
  const status = await waitForSignature(rpc, signature, commitment ?? 'confirmed', 60_000);
  return { signature, slot: status.slot, err: status.err, status };
}

export async function getTransactionLogs(rpc, signature, commitment = 'finalized') {
  const opts = { commitment, encoding: 'json', maxSupportedTransactionVersion: 0 };
  const tx = await rpc.call('getTransaction', [signature, opts]);
  if (!tx) throw new Error(`getTransaction ${signature}: not found at ${commitment}`);
  return { slot: tx.slot, blockTime: tx.blockTime, fee: tx.meta.fee, err: tx.meta.err, logs: tx.meta.logMessages };
}

// ---- addresses ----
export function escrowAddress(seller, nonce) {
  const seeds = [utf8('p2p-offramp-escrow-v1'), decodeKey(seller), bytes32(nonce, 'seller_nonce')];
  const r = findProgramAddress(seeds, decodeKey(PROGRAM_ID));
  return { address: base58Encode(r.address), bump: r.bump };
}

export function vaultAddress(escrow) {
  const r = findProgramAddress([utf8('p2p-offramp-vault-v1'), decodeKey(escrow)], decodeKey(PROGRAM_ID));
  return { address: base58Encode(r.address), bump: r.bump };
}

export const ataAddress = (owner, mint) => base58Encode(findAta(decodeKey(owner), decodeKey(mint)).address);

export function programDataAddress(programId) {
  return base58Encode(findProgramAddress([decodeKey(programId)], decodeKey(LOADER_V3_ID)).address);
}

// ---- basic_escrow instructions (account order mirrors the IDL; see ACCOUNT_ORDER) ----
export const ACCOUNT_ORDER = {
  fund_native: ['seller', 'escrow', 'buyer', 'system_program'],
  fund_spl: ['seller', 'escrow', 'mint', 'seller_token', 'vault', 'token_program', 'system_program'],
  release: ['seller', 'escrow'],
  refund: ['escrow'],
  payout_native: ['escrow', 'recipient'],
  payout_spl: ['escrow', 'vault', 'mint', 'destination', 'token_program'],
};

export const ixDiscriminator = (name) => Uint8Array.from(Buffer.from(discriminator('global', name), 'hex'));
const escrowIx = (name, keys, args = new Uint8Array(0)) => {
  if (keys.length !== ACCOUNT_ORDER[name].length) throw new Error(`${name}: wrong account count`);
  return { programId: PROGRAM_ID, keys, data: concat(ixDiscriminator(name), args) };
};

/// Borsh FundArgs: order_id[32], buyer, private_agreement_hash[32], capabilities_hash[32], seller_nonce[32],
/// revision u64, amount u64, accept_before u64, expiry u64 (192 bytes).
export function encodeFundArgs(a) {
  const out = concat(
    bytes32(a.orderId, 'order_id'), bytes32(a.buyer, 'buyer'),
    bytes32(a.privateAgreementHash, 'private_agreement_hash'), bytes32(a.capabilitiesHash, 'capabilities_hash'),
    bytes32(a.sellerNonce, 'seller_nonce'),
    u64le(a.revision), u64le(a.amount), u64le(a.acceptBefore), u64le(a.expiry),
  );
  if (out.length !== 192) throw new Error(`FundArgs: encoded ${out.length} bytes, expected 192`);
  return out;
}

/// The buyer is passed writable: newer program builds declare it `mut` (payout must credit it); older
/// builds ignore the extra writability, so one client works with both.
export function fundNativeIx({ seller, escrow, args }) {
  const keys = [meta(seller, true, true), meta(escrow, false, true), meta(args.buyer, false, true),
    meta(SYSTEM_PROGRAM_ID, false, false)];
  return escrowIx('fund_native', keys, encodeFundArgs(args));
}

export function fundSplIx({ seller, escrow, mint, sellerToken, vault, args }) {
  const keys = [meta(seller, true, true), meta(escrow, false, true), meta(mint, false, false),
    meta(sellerToken, false, true), meta(vault, false, true), meta(SPL_PROGRAM_ID, false, false),
    meta(SYSTEM_PROGRAM_ID, false, false)];
  return escrowIx('fund_spl', keys, encodeFundArgs(args));
}

export const releaseIx = (seller, escrow) =>
  escrowIx('release', [meta(seller, true, false), meta(escrow, false, true)]);
export const refundIx = (escrow) => escrowIx('refund', [meta(escrow, false, true)]);
export const payoutNativeIx = (escrow, recipient) =>
  escrowIx('payout_native', [meta(escrow, false, true), meta(recipient, false, true)]);

export function payoutSplIx({ escrow, vault, mint, destination }) {
  const keys = [meta(escrow, false, true), meta(vault, false, true), meta(mint, false, false),
    meta(destination, false, true), meta(SPL_PROGRAM_ID, false, false)];
  return escrowIx('payout_spl', keys);
}

// ---- system / SPL Token / ATA / loader-v3 instructions ----
export function transferIx(from, to, lamports) {
  return { programId: SYSTEM_PROGRAM_ID, keys: [meta(from, true, true), meta(to, false, true)],
    data: concat(u32le(2), u64le(lamports)) };
}

export function createAtaIdempotentIx(payer, owner, mint) {
  const ata = ataAddress(owner, mint);
  const keys = [meta(payer, true, true), meta(ata, false, true), meta(owner, false, false), meta(mint, false, false),
    meta(SYSTEM_PROGRAM_ID, false, false), meta(SPL_PROGRAM_ID, false, false)];
  return { ata, ix: { programId: ATA_PROGRAM_ID, keys, data: Uint8Array.of(1) } };
}

export function mintToIx(mint, destination, authority, amount) {
  const keys = [meta(mint, false, true), meta(destination, false, true), meta(authority, true, false)];
  return { programId: SPL_PROGRAM_ID, keys, data: concat([7], u64le(amount)) };
}

/// Loader-v3 Upgrade (enum index 3): programdata, program, buffer, spill, rent, clock, authority.
export function loaderUpgradeIx({ programId, programData, buffer, spill, authority }) {
  const keys = [meta(programData, false, true), meta(programId, false, true), meta(buffer, false, true),
    meta(spill, false, true), meta(SYSVAR_RENT_ID, false, false), meta(SYSVAR_CLOCK_ID, false, false),
    meta(authority, true, false)];
  return { programId: LOADER_V3_ID, keys, data: u32le(3) };
}

// ---- account decoding ----
const ESCROW_STATES = ['Funded', 'Released', 'Refunded'];

export function decodeEscrow(data) {
  const disc = sha256(utf8('account:EscrowV1')).slice(0, 8);
  if (data.length !== ESCROW_ACCOUNT_LEN) throw new Error(`EscrowV1: length ${data.length}`);
  if (!equalBytes(data.slice(0, 8), disc)) throw new Error('EscrowV1: discriminator mismatch');
  const state = ESCROW_STATES[data[11]];
  if (!state || data[12] > 1) throw new Error('EscrowV1: invalid state or paid_out byte');
  return {
    layoutVersion: data[8], escrowBump: data[9], vaultBump: data[10], state, paidOut: data[12] === 1,
    assetKind: data[13], seller: readKey(data, 14), buyer: readKey(data, 46), mint: readKey(data, 78),
    tokenProgram: readKey(data, 110), amount: readU64(data, 142).toString(), deadline: Number(readU64(data, 150)),
    termsHash: toHex(data.slice(158, 190)), sellerNonce: toHex(data.slice(190, 222)),
  };
}

export function decodeTokenAccount(data) {
  if (data.length !== 165) throw new Error(`token account: length ${data.length}`);
  return { mint: readKey(data, 0), owner: readKey(data, 32), amount: readU64(data, 64).toString(), state: data[108] };
}

export function decodeProgramAccount(data) {
  if (data.length !== 36 || view(data).getUint32(0, true) !== 2) throw new Error('loader-v3 Program: bad layout');
  return { programData: readKey(data, 4) };
}

export function decodeProgramDataHeader(data) {
  if (data.length < PROGRAMDATA_HEADER_LEN || view(data).getUint32(0, true) !== 3) {
    throw new Error('loader-v3 ProgramData: bad header');
  }
  const tag = data[12];
  if (tag > 1) throw new Error('loader-v3 ProgramData: bad authority option tag');
  return { slot: Number(readU64(data, 4)), upgradeAuthority: tag === 1 ? readKey(data, 13) : null };
}

// ---- fixtures ----
/// SPL Token Mint (82 bytes) for `solana-test-validator --account - <file>`.
export function mintAccountFile(address, { mintAuthority, freezeAuthority = null, decimals, lamports }) {
  const data = new Uint8Array(82);
  data.set(u32le(1), 0);
  data.set(decodeKey(mintAuthority), 4);
  data[44] = decimals;
  data[45] = 1;
  if (freezeAuthority) {
    data.set(u32le(1), 46);
    data.set(decodeKey(freezeAuthority), 50);
  }
  const b64 = Buffer.from(data).toString('base64');
  return { pubkey: address, account: { lamports, data: [b64, 'base64'], owner: SPL_PROGRAM_ID,
    executable: false, rentEpoch: 0, space: 82 } };
}

/// Off-chain rebuild of the G16 terms hash (programs/basic-escrow/src/terms.rs); mint/tokenProgram null => zero.
export function termsHash({ seller, mint = null, tokenProgram = null, assetKind, args }) {
  const zero = new Uint8Array(32);
  const key = (k) => (k ? decodeKey(k) : zero);
  const bytes = concat(
    utf8(TERMS_PREFIX), [0], utf8(GENESIS_HASH_ASCII), decodeKey(PROGRAM_ID), bytes32(args.orderId, 'order_id'),
    decodeKey(seller), decodeKey(args.buyer), key(mint), key(tokenProgram),
    args.privateAgreementHash, args.capabilitiesHash, args.sellerNonce,
    [1], u64le(args.revision), [assetKind], u64le(args.amount), u64le(args.acceptBefore), u64le(args.expiry), [0],
  );
  if (bytes.length !== 383) throw new Error(`terms: ${bytes.length} bytes, expected 383`);
  return toHex(sha256(bytes));
}
