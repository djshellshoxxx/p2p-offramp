// Test-only fakes for the lifecycle: a Wallet Standard keypair wallet, a CAS journal and a scripted cluster RPC.
// Keypairs are synthetic, derived from labels at runtime; no key material is committed.
import { ed25519 } from '@noble/curves/ed25519.js';
import { createSolanaEscrowClient } from '../src/compose.ts';
import {
  account,
  base58Encode,
  bindingOf,
  CHAIN_TIME,
  CLOCK,
  clockBytes,
  enc,
  escrowBytes,
  escrowPda,
  key,
  makeRegistry,
  makeTerms,
  makeWorld,
  ok,
  PROGRAM,
  sha,
  SLOT,
  SYSVAR,
  vaultPda,
} from './support.mjs';

export const CHAIN = 'solana:localnet';
export const MARGINS = Object.freeze({ submitMarginSeconds: '60', releaseMarginSeconds: '300' });
export const HEIGHT_OFFSET = 200;

/** Synthetic Ed25519 keypair from a label (test only). The seed is non-enumerable. */
export function keypair(label) {
  const seed = sha(enc.encode(`lifecycle-keypair:${label}`));
  const publicKey = ed25519.getPublicKey(seed);
  const pair = { address: base58Encode(publicKey), publicKey };
  Object.defineProperty(pair, 'seed', { value: seed, enumerable: false });
  return pair;
}
export const SELLER = keypair('seller');
export const BUYER = keypair('buyer');

/** Splits an unsigned or signed single-signature wire transaction. */
export function splitWire(wire) {
  const count = wire[0];
  return { count, signatures: wire.slice(1, 1 + 64 * count), message: wire.slice(1 + 64 * count) };
}

/**
 * Wallet Standard wallet over keypairs. Options: rejectConnect, rejectSign, accounts (override), chains, features,
 * mutate(message) -> bytes the wallet signs instead, signWith (other keypair), output(wire, input) -> raw output.
 */
export function makeWallet(pairs = [SELLER, BUYER], o = {}) {
  const calls = { connect: 0, sign: [] };
  const accounts =
    o.accounts ??
    pairs.map(pair => ({
      address: pair.address,
      publicKey: pair.publicKey,
      chains: o.chains ?? [CHAIN],
      features: o.features ?? ['standard:connect', 'solana:signTransaction'],
    }));
  const wallet = {
    features: {
      'standard:connect': {
        version: '1.0.0',
        async connect(input) {
          calls.connect++;
          if (o.rejectConnect) throw Object.assign(new Error('declined'), { code: 4001 });
          return { accounts, input };
        },
      },
      'solana:signTransaction': {
        version: '1.0.0',
        supportedTransactionVersions: ['legacy', 0],
        async signTransaction(...inputs) {
          calls.sign.push(inputs);
          if (o.rejectSign) throw Object.assign(new Error('declined'), { code: 4001 });
          if (o.hang) return new Promise(() => {});
          const [input] = inputs;
          const { message } = splitWire(input.transaction);
          const signed = o.mutate ? o.mutate(message) : message;
          const signer = o.signWith ?? pairs.find(pair => pair.address === input.account.address);
          const signature = ed25519.sign(signed, signer.seed);
          const wire = Uint8Array.from([1, ...signature, ...signed]);
          return o.output ? o.output(wire, input) : [{ signedTransaction: wire }];
        },
      },
    },
  };
  return { wallet, calls };
}

const keyOf = binding => `${binding.networkId}|${binding.deploymentId}|${binding.tradeId}`;
const failure = code => ({
  ok: false,
  error: { code, retryable: false, action: 'none', correlationId: '0', messageKey: '' },
});

/**
 * In-memory CAS journal. `hooks.before(record, n)` may return 'throw' | 'unavailable' | 'conflict' (nothing written);
 * `hooks.after(record, n)` may return 'throw' (written, then the caller sees a failure: a crash after commit).
 */
export function makeJournal(o = {}) {
  let profile = o.profileId ?? 'a'.repeat(32);
  let store = o.store ?? new Map();
  const writes = [];
  const hooks = o.hooks ?? {};
  const entry = binding => store.get(keyOf(binding)) ?? { revision: 0, records: new Map() };
  const journal = {
    profileId: () => profile,
    async read(binding) {
      const current = entry(binding);
      return {
        ok: true,
        value: { revision: current.revision, records: [...current.records.values()].map(r => structuredClone(r)) },
      };
    },
    async write(binding, expected, record) {
      writes.push(record.state);
      const before = hooks.before?.(record, writes.length);
      if (before === 'throw') throw new Error('disk failure');
      if (before === 'unavailable') return failure('UNAVAILABLE');
      if (before === 'conflict') return failure('CONFLICT');
      const current = entry(binding);
      if (current.revision !== expected) return failure('CONFLICT');
      current.records.set(record.intentId, structuredClone(record));
      current.revision++;
      store.set(keyOf(binding), current);
      if (hooks.after?.(record, writes.length) === 'throw') throw new Error('crash after commit');
      return { ok: true, value: current.revision };
    },
  };
  return {
    journal,
    writes,
    hooks,
    records: binding => [...entry(binding).records.values()],
    /** Deep copy of the whole store, as a vault backup would hold it. */
    backup: () => structuredClone(store),
    /** Replace the store (e.g. with a backup) and the profile id (a restore creates a new profile). */
    restore(snapshot, profileId) {
      store = structuredClone(snapshot);
      profile = profileId;
    },
    setProfile(profileId) {
      profile = profileId;
    },
  };
}

/** Scripted finalized cluster for one trade. Slot S has block height S - 200 and blockhash key(`block-S`). */
export function makeCluster(terms, o = {}) {
  const world = makeWorld(terms, o.world);
  const escrow = escrowPda(terms.seller, terms.sellerNonce);
  const spl = terms.assetKind === 'spl';
  const vault = spl ? vaultPda(escrow.address).address : null;
  if (o.absent) {
    world.accounts.delete(escrow.address);
    if (vault) world.accounts.delete(vault);
  }
  const hashSlots = new Map();
  const cluster = {
    world,
    escrow,
    vault,
    slot: o.slot ?? SLOT,
    time: CHAIN_TIME,
    statuses: new Map(),
    firstAvailableBlock: 0,
    sent: [],
    calls: [],
    handle: o.handle,
    sendBehavior: o.sendBehavior,
    heightOf: slot => slot - HEIGHT_OFFSET,
    hashOf(slot) {
      const hash = key(`block-${slot}`);
      hashSlots.set(hash, slot);
      return hash;
    },
    get height() {
      return cluster.heightOf(cluster.slot);
    },
    sync() {
      world.slot = cluster.slot;
      world.accounts.set(CLOCK, account(clockBytes(cluster.slot, cluster.time), SYSVAR));
      world.block = {
        blockhash: cluster.hashOf(cluster.slot),
        blockHeight: cluster.heightOf(cluster.slot),
        parentSlot: cluster.slot - 1,
      };
    },
    advance(slots = 1, seconds = 0) {
      cluster.slot += slots;
      cluster.time += seconds;
      cluster.sync();
    },
    /** Escrow account bytes with overrides (state 0/1/2, paid 0/1) and native lamports. */
    setEscrow(changes = {}, lamports) {
      const bytes = escrowBytes(terms, changes);
      const amount = Number(terms.amountBaseUnits);
      const paid = changes.paid ?? 0;
      const native = lamports ?? (spl ? 2_436_000 : paid ? 2_436_000 : amount + 2_436_000);
      world.accounts.set(escrow.address, account(bytes, PROGRAM, { lamports: native }));
      if (spl && paid) {
        const entry = world.accounts.get(vault);
        const data = Uint8Array.from(Buffer.from(entry.data[0], 'base64'));
        data.fill(0, 64, 72);
        world.accounts.set(vault, { ...entry, data: [Buffer.from(data).toString('base64'), 'base64'] });
      }
    },
    land(signature, { err = null, level = 'finalized', slot } = {}) {
      cluster.statuses.set(signature, {
        slot: slot ?? cluster.slot,
        confirmations: level === 'finalized' ? null : 1,
        err,
        status: err === null ? { Ok: null } : { Err: err },
        confirmationStatus: level,
      });
    },
    lastSentSignature() {
      const wire = Uint8Array.from(Buffer.from(cluster.sent.at(-1)[0], 'base64'));
      return base58Encode(wire.slice(1, 65));
    },
    rpc: {
      async request(input) {
        cluster.calls.push(input);
        if (cluster.handle) {
          const value = await cluster.handle(input, cluster);
          if (value !== undefined) return value;
        }
        const { method, params = [] } = input;
        switch (method) {
          case 'getGenesisHash':
            return world.genesis;
          case 'getMultipleAccounts': {
            const value = params[0].map(address =>
              world.accounts.has(address) ? structuredClone(world.accounts.get(address)) : null,
            );
            return { context: { apiVersion: '4.1.2', slot: world.slot }, value };
          }
          case 'getBlock': {
            const slot = params[0];
            return { blockhash: cluster.hashOf(slot), blockHeight: cluster.heightOf(slot), parentSlot: slot - 1 };
          }
          case 'getLatestBlockhash':
            return {
              context: { slot: cluster.slot },
              value: { blockhash: cluster.hashOf(cluster.slot), lastValidBlockHeight: cluster.height + 150 },
            };
          case 'sendTransaction': {
            cluster.sent.push(params);
            if (cluster.sendBehavior) return cluster.sendBehavior(params, cluster);
            return cluster.lastSentSignature();
          }
          case 'getSignatureStatuses':
            return {
              context: { slot: cluster.slot },
              value: params[0].map(signature => structuredClone(cluster.statuses.get(signature) ?? null)),
            };
          case 'getBlockHeight':
            return cluster.height;
          case 'getFirstAvailableBlock':
            return cluster.firstAvailableBlock;
          case 'isBlockhashValid': {
            const slot = hashSlots.get(params[0]);
            return {
              context: { slot: cluster.slot },
              value: slot !== undefined && cluster.heightOf(slot) + 150 >= cluster.height,
            };
          }
          default:
            throw new Error(`unexpected ${method}`);
        }
      },
    },
  };
  cluster.sync();
  return cluster;
}

/** Client, trade, wallet, journal and cluster for one scenario. */
export function setupClient(kind = 'native', o = {}) {
  const terms = o.terms ?? makeTerms(kind, { seller: SELLER.address, buyer: BUYER.address, ...o.termsChanges });
  const cluster = o.cluster ?? makeCluster(terms, o.clusterOptions);
  const journalFake = o.journalFake ?? makeJournal(o.journal);
  const walletFake = o.walletFake ?? makeWallet([SELLER, BUYER], o.wallet);
  let now = o.now ?? 1_000;
  let ids = 0;
  const client = createSolanaEscrowClient({
    rpc: cluster.rpc,
    wallet: walletFake.wallet,
    journal: journalFake.journal,
    registry: o.registry ?? makeRegistry(),
    clock: { now: () => now++ },
    margins: o.margins ?? MARGINS,
    walletChain: CHAIN,
    random: n => sha(enc.encode(`intent-${o.seed ?? 'x'}-${ids++}`)).slice(0, n),
    timeoutMs: o.timeoutMs ?? 2_000,
  });
  const trade = ok(client.bind(bindingOf(terms), terms));
  return { terms, cluster, journalFake, walletFake, client, trade, binding: bindingOf(terms) };
}

/** Sends one action and returns its submission; asserts success. */
export async function connected(env, role) {
  return ok(await env.client.connect(env.trade, role));
}
