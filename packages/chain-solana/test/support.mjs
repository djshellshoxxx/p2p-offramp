// Test-only fakes and byte builders. Oracles here (derive.mjs, node:crypto) are independent of src.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { encodeSolanaTerms } from '../../domain/index.ts';
import { base58Encode, decodeKey, findProgramAddress, findAta } from '../../../contracts/solana/vectors/derive.mjs';
import { SolanaChainReader } from '../src/reader.ts';

export const enc = new TextEncoder();
export const sha = bytes => new Uint8Array(createHash('sha256').update(bytes).digest());
export const shaHex = bytes => createHash('sha256').update(bytes).digest('hex');
export const b64 = bytes => Buffer.from(bytes).toString('base64');
export const fromHex = value => Uint8Array.from(Buffer.from(value, 'hex'));
export const key = label => base58Encode(sha(enc.encode(label)));
export const ascii = text => base58Encode(enc.encode(text));
export { base58Encode, decodeKey };

export const PROGRAM = '7q2EChqznfQea58ZfUvBzRd97Bc28kwHaey1tYy7ADjq';
export const COMPILED_GENESIS = ascii('genesis-hash:p2p-offramp:localv1');
export const MINT = ascii('mint-6dp-open:p2p-offramp:local1');
export const SYSTEM = '11111111111111111111111111111111';
export const TOKENKEG = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const LOADER = 'BPFLoaderUpgradeab1e11111111111111111111111';
export const SYSVAR = 'Sysvar1111111111111111111111111111111111111';
export const CLOCK = 'SysvarC1ock11111111111111111111111111111111';
export const RENT = 'SysvarRent111111111111111111111111111111111';
export const WSOL = 'So11111111111111111111111111111111111111112';
export const PROGRAM_DATA = base58Encode(findProgramAddress([decodeKey(PROGRAM)], decodeKey(LOADER)).address);
export const NETWORK_ID = 'solana-localnet';
export const DEPLOYMENT_ID = 'escrow-v1';
export const CHAIN_TIME = 1_793_782_800;
export const SLOT = 400;
export const RENT_MIN = 2_436_000;
export const ELF = enc.encode('\x7fELF synthetic sbpf v3 test program bytes');
export const PROGRAM_DATA_LENGTH = 45 + ELF.length + 7;

export const ok = result => {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
};
export function error(result, code) {
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.error.code, code);
  assert.doesNotMatch(JSON.stringify(result), /SECRET|rpc\.invalid/);
}
export const request = (signal = new AbortController().signal) => ({ generation: 2, requestSequence: 4, signal });

export function u64(value) {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value), true);
  return out;
}
export function i64(value) {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigInt64(0, BigInt(value), true);
  return out;
}
export function u32(value) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}
export const cat = (...parts) => Uint8Array.from(parts.flatMap(part => [...part]));

export function escrowPda(seller, nonceHex, program = PROGRAM) {
  const found = findProgramAddress(
    [enc.encode('p2p-offramp-escrow-v1'), decodeKey(seller), fromHex(nonceHex)],
    decodeKey(program),
  );
  return { address: base58Encode(found.address), bump: found.bump };
}
export function vaultPda(escrow, program = PROGRAM) {
  const found = findProgramAddress([enc.encode('p2p-offramp-vault-v1'), decodeKey(escrow)], decodeKey(program));
  return { address: base58Encode(found.address), bump: found.bump };
}
export const ata = (owner, mint) => base58Encode(findAta(decodeKey(owner), decodeKey(mint)).address);

export function makeTerms(kind = 'native', changes = {}) {
  const spl = kind === 'spl';
  return {
    genesisHash: COMPILED_GENESIS,
    programId: PROGRAM,
    orderId: shaHex(enc.encode(`order-${kind}`)),
    seller: key('seller'),
    buyer: key('buyer'),
    assetKind: kind,
    mint: spl ? MINT : null,
    tokenProgram: spl ? TOKENKEG : null,
    privateAgreementHash: shaHex(enc.encode('agreement')),
    capabilitiesHash: shaHex(new Uint8Array([0])),
    sellerNonce: shaHex(enc.encode(`nonce-${kind}`)),
    revision: '1',
    amountBaseUnits: spl ? '25000000' : '500000000',
    acceptBeforeSeconds: String(CHAIN_TIME + 600),
    escrowExpirySeconds: String(CHAIN_TIME + 3600),
    ...changes,
  };
}
export const tradeIdOf = terms => shaHex(encodeSolanaTerms(terms));
export const bindingOf = (terms, changes = {}) => ({
  chain: 'solana',
  networkId: NETWORK_ID,
  deploymentId: DEPLOYMENT_ID,
  tradeId: tradeIdOf(terms),
  ...changes,
});

// ---- account bytes ----
export function escrowBytes(terms, o = {}) {
  const spl = terms.assetKind === 'spl';
  const pda = escrowPda(terms.seller, terms.sellerNonce);
  const out = new Uint8Array(222);
  out.set(fromHex('1a5ac1dabcfb8bd3'), 0);
  out[8] = o.layout ?? 1;
  out[9] = o.escrowBump ?? pda.bump;
  out[10] = o.vaultBump ?? (spl ? vaultPda(pda.address).bump : 0);
  out[11] = o.state ?? 0;
  out[12] = o.paid ?? 0;
  out[13] = o.kind ?? (spl ? 2 : 0);
  out.set(decodeKey(o.seller ?? terms.seller), 14);
  out.set(decodeKey(o.buyer ?? terms.buyer), 46);
  const mint = o.mint !== undefined ? o.mint : terms.mint,
    tokenProgram = o.tokenProgram !== undefined ? o.tokenProgram : terms.tokenProgram;
  if (mint) out.set(decodeKey(mint), 78);
  if (tokenProgram) out.set(decodeKey(tokenProgram), 110);
  out.set(u64(o.amount ?? terms.amountBaseUnits), 142);
  out.set(u64(o.deadline ?? terms.escrowExpirySeconds), 150);
  out.set(fromHex(o.termsHash ?? tradeIdOf(terms)), 158);
  out.set(fromHex(o.sellerNonce ?? terms.sellerNonce), 190);
  return out;
}
export function tokenBytes({
  mint = MINT,
  owner,
  amount = 0,
  delegate = 0,
  state = 1,
  isNative = 0,
  delegated = 0,
  close = 0,
}) {
  const out = new Uint8Array(165);
  out.set(decodeKey(mint), 0);
  out.set(decodeKey(owner), 32);
  out.set(u64(amount), 64);
  out.set(u32(delegate), 72);
  out[108] = state;
  out.set(u32(isNative), 109);
  out.set(u64(delegated), 121);
  out.set(u32(close), 129);
  return out;
}
export function mintBytes({ decimals = 6, initialized = 1, freeze = null } = {}) {
  const out = new Uint8Array(82);
  out.set(u32(1), 0);
  out.set(decodeKey(key('mint-authority')), 4);
  out.set(u64(1_000_000_000), 36);
  out[44] = decimals;
  out[45] = initialized;
  if (freeze) {
    out.set(u32(1), 46);
    out.set(decodeKey(freeze), 50);
  }
  return out;
}
export const clockBytes = (slot, ts = CHAIN_TIME) => cat(u64(slot), u64(0), u64(1), u64(1), i64(ts));
export const rentBytes = (lpb = 6960, threshold = '000000000000f03f') => cat(u64(lpb), fromHex(threshold), [50]);
export const programBytes = (pointer = PROGRAM_DATA, tag = 2) => cat(u32(tag), decodeKey(pointer));
export function programDataBytes({
  elf = ELF,
  length = PROGRAM_DATA_LENGTH,
  slot = 10,
  option = 0,
  tag = 3,
  header,
} = {}) {
  const out = new Uint8Array(length);
  if (header) out.set(header, 0);
  else {
    out.set(u32(tag), 0);
    out.set(u64(slot), 4);
    out[12] = option;
    out.set(decodeKey(key('stale-authority')), 13);
  }
  out.set(elf, 45);
  return out;
}
export const PIN = shaHex(programDataBytes().subarray(45));

export function account(data, owner, o = {}) {
  return {
    data: [b64(data), 'base64'],
    executable: o.executable ?? false,
    lamports: o.lamports ?? 1_000_000,
    owner,
    rentEpoch: 18446744073709551615,
    space: data.length,
    ...o.extra,
  };
}

// ---- registry, RPC world and reader ----
export function makeRegistry(changes = {}) {
  const network = {
    id: NETWORK_ID,
    chain: 'solana',
    chainIdentity: COMPILED_GENESIS,
    genesisHash: COMPILED_GENESIS,
    endpoints: [],
    finality: { kind: 'solana-commitment', commitment: 'finalized' },
    assets: [
      { id: 'sol', kind: 'native', address: null, decimals: 9, transferPolicy: 'exact-transfer' },
      { id: 'usd6', kind: 'spl', address: MINT, decimals: 6, transferPolicy: 'exact-transfer' },
    ],
    deployments: [],
    environment: 'local',
    ...changes.network,
  };
  const deployment = {
    id: DEPLOYMENT_ID,
    address: PROGRAM,
    protocolVersion: 1,
    artifactSha256: '0'.repeat(64),
    runtime: { kind: 'solana-program', programDataSha256: PIN, upgradeAuthority: null },
    supportedAssetIds: ['sol', 'usd6'],
    ...changes.deployment,
  };
  return {
    network: id => (id === NETWORK_ID ? network : null),
    deployment: (networkId, id) => (networkId === NETWORK_ID && id === DEPLOYMENT_ID ? deployment : null),
  };
}

/** World for one trade: identity accounts plus a funded escrow (state/paid/lamports configurable). */
export function makeWorld(terms, o = {}) {
  const pda = escrowPda(terms.seller, terms.sellerNonce);
  const accounts = new Map([
    [PROGRAM, account(programBytes(), LOADER, { executable: true })],
    [PROGRAM_DATA, account(programDataBytes(), LOADER)],
    [CLOCK, account(clockBytes(o.slot ?? SLOT), SYSVAR)],
    [RENT, account(rentBytes(), SYSVAR)],
  ]);
  const escrow = escrowBytes(terms, o.escrow);
  const amount = Number(terms.amountBaseUnits);
  if (terms.assetKind === 'native') {
    const lamports = o.lamports ?? ((o.escrow?.paid ?? 0) ? RENT_MIN : amount + RENT_MIN);
    accounts.set(pda.address, account(escrow, PROGRAM, { lamports }));
  } else {
    const vault = vaultPda(pda.address);
    accounts.set(pda.address, account(escrow, PROGRAM, { lamports: RENT_MIN }));
    const vaultAmount = o.vaultAmount ?? ((o.escrow?.paid ?? 0) ? 0 : amount);
    accounts.set(vault.address, account(tokenBytes({ owner: pda.address, amount: vaultAmount, ...o.vault }), TOKENKEG));
    accounts.set(MINT, account(mintBytes(o.mint), TOKENKEG));
  }
  return {
    genesis: COMPILED_GENESIS,
    slot: o.slot ?? SLOT,
    accounts,
    escrow: pda,
    block: {
      blockhash: key('blockhash'),
      blockHeight: (o.slot ?? SLOT) - 10,
      parentSlot: (o.slot ?? SLOT) - 1,
      blockTime: CHAIN_TIME,
    },
  };
}

export function makeRpc(world, handle) {
  const calls = [];
  const rpc = {
    async request(input) {
      calls.push(input);
      if (handle) {
        const value = await handle(input, calls);
        if (value !== undefined) return value;
      }
      switch (input.method) {
        case 'getGenesisHash':
          return world.genesis;
        case 'getMultipleAccounts': {
          const value = input.params[0].map(address =>
            world.accounts.has(address) ? structuredClone(world.accounts.get(address)) : null,
          );
          return { context: { apiVersion: '4.1.2', slot: world.slot }, value };
        }
        case 'getBlock':
          return { ...world.block };
        default:
          throw Error('SECRET provider diagnostics https://rpc.invalid');
      }
    },
  };
  return { rpc, calls };
}

export function setup(kind = 'native', o = {}) {
  const terms = o.terms ?? makeTerms(kind, o.termsChanges);
  const world = makeWorld(terms, o.world);
  o.mutate?.(world, terms);
  const { rpc, calls } = makeRpc(world, o.handle);
  const registry = o.registry ?? makeRegistry(o.registryChanges);
  const reader = new SolanaChainReader({ rpc, registry, now: () => 123, ...o.options });
  return { terms, binding: bindingOf(terms), world, rpc, calls, registry, reader };
}
/** Replace one account's entry in the world (null = absent). */
export function setAccount(world, address, entry) {
  world.accounts.set(address, entry);
}
