/**
 * Durable replay and tombstone memory for Solana peer acceptances, kept in one encrypted vault record through
 * the injected vault port. Stored history can only refuse an admission; it never replaces signature checks.
 *
 * Bounded (review finding A-L3): at most MAX_ACCEPTANCE_ENTRIES live terms and a separate MAX_TOMBSTONES, so a
 * flood of acceptances cannot use the space cancellations need. An entry is evicted only once its terms'
 * `acceptBeforeSeconds` has passed, when no acceptance for it can verify any more; the eviction watermark keeps
 * that true if the clock later moves back. Terms whose deadline is more than MAX_TERMS_HORIZON_SECONDS ahead are
 * refused, so every slot frees within that horizon. No clear, delete, automatic retry or network call exists.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { createCoreError, createOperationId } from '../../domain/index.ts';
import {
  decodeBase64url, encodeBase64url, parseStrictJsonBytes, type CoreErrorCode, type CoreResult, type PrivateRecordV1,
  type Result, type VaultService, type VaultSession, type VaultSessionAuthority, type VaultSessionLease,
} from '../../schemas/index.ts';
import {
  checkSolanaPeerAcceptance, exactData, snapshotPeerAcceptance, type SolanaPeerAcceptanceV1, type SolanaPeerContext,
  type SolanaPeerProof, type SolanaPeerVerification, type SolanaRole,
} from './acceptance.ts';
import { isBoundSolanaTrade, type BoundSolanaTrade } from './bind.ts';
import { decimalU64, fail, failureCode, fromHex32, hex } from './codec.ts';
import { bytesOf } from './offchain.ts';

export const SOLANA_PEER_REPLAY_FORMAT = 'p2p-offramp/solana/peer-replay/v1';
export const SOLANA_PEER_REPLAY_RECORD_ID =
  hex(sha256(new TextEncoder().encode(SOLANA_PEER_REPLAY_FORMAT)).subarray(0, 16));
export const MAX_ACCEPTANCE_ENTRIES = 64;
export const MAX_TOMBSTONES = 64;
/** Same bound as the longest escrow (G16 MAX_ESCROW_SECONDS); an implementation bound for review. */
export const MAX_TERMS_HORIZON_SECONDS = 604_800;
const HORIZON = BigInt(MAX_TERMS_HORIZON_SECONDS);
const MAX_RECORD_BYTES = 131_072;

type VaultPort = Pick<VaultService, 'read' | 'commit'> & VaultSessionAuthority;
/** Injected local clock: canonical u64 decimal seconds. */
export interface SolanaLedgerClock { nowSeconds(): string }
export type SolanaLedgerContext = Omit<SolanaPeerContext, 'nowSeconds'>;
export interface SolanaAdmission extends SolanaPeerVerification { readonly status: 'recorded' | 'duplicate' }
export interface SolanaReplayStatus { readonly tombstoned: boolean; readonly seller: boolean; readonly buyer: boolean }

interface Party {
  readonly wallet: string; readonly ownMessagingKey: string; readonly counterpartyMessagingKey: string;
  readonly notAfterSeconds: string;
}
interface Entry {
  readonly termsHash: string; readonly acceptBeforeSeconds: string; readonly networkId: string;
  readonly deploymentId: string; readonly genesisHash: string; readonly programId: string;
  seller: Party | null; buyer: Party | null;
}
interface Tombstone { readonly termsHash: string; readonly acceptBeforeSeconds: string }
interface State { watermark: bigint; acceptances: Entry[]; tombstones: Tombstone[] }
const ENTRY_FIELDS = ['termsHash', 'acceptBeforeSeconds', 'networkId', 'deploymentId', 'genesisHash', 'programId',
  'seller', 'buyer'];
const PARTY_FIELDS = ['wallet', 'ownMessagingKey', 'counterpartyMessagingKey', 'notAfterSeconds'];

function own(input: unknown, fields: readonly string[]): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail('INTEGRITY_FAILURE');
  const keys = Object.keys(input);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key))) return fail('INTEGRITY_FAILURE');
  return input as Record<string, unknown>;
}
const statementOf = (entry: Entry, role: SolanaRole, party: Party): SolanaPeerAcceptanceV1 => snapshotPeerAcceptance({
  v: 1, role, ...party, networkId: entry.networkId, deploymentId: entry.deploymentId,
  genesisHash: entry.genesisHash, programId: entry.programId, termsHash: entry.termsHash });
const partyOf = (statement: SolanaPeerAcceptanceV1): Party => Object.freeze({ wallet: statement.wallet,
  ownMessagingKey: statement.ownMessagingKey, counterpartyMessagingKey: statement.counterpartyMessagingKey,
  notAfterSeconds: statement.notAfterSeconds });
const reciprocal = (seller: Party, buyer: Party): boolean => seller.wallet !== buyer.wallet &&
  seller.ownMessagingKey === buyer.counterpartyMessagingKey &&
  buyer.ownMessagingKey === seller.counterpartyMessagingKey;
const samePartyAs = (left: Party, right: Party): boolean => PARTY_FIELDS.every(field =>
  left[field as keyof Party] === right[field as keyof Party]);
const byHash = (a: { termsHash: string }, b: { termsHash: string }): number =>
  a.termsHash < b.termsHash ? -1 : a.termsHash > b.termsHash ? 1 : 0;

/** Strict decode of the persisted record; anything foreign or inconsistent is INTEGRITY_FAILURE, never overwritten. */
function decode(record: PrivateRecordV1 | null): State {
  if (record === null) return { watermark: 0n, acceptances: [], tombstones: [] };
  if (record.kind !== 'preference' || record.id !== SOLANA_PEER_REPLAY_RECORD_ID) return fail('INTEGRITY_FAILURE');
  if (record.schemaVersion !== 1) return fail('UNSUPPORTED_VERSION');
  let bytes: Uint8Array | undefined;
  try {
    bytes = decodeBase64url(record.payload, 1, MAX_RECORD_BYTES);
    const raw = own(parseStrictJsonBytes(bytes, MAX_RECORD_BYTES), ['format', 'watermarkSeconds', 'acceptances',
      'tombstones']);
    if (raw.format !== SOLANA_PEER_REPLAY_FORMAT) return fail('UNSUPPORTED_VERSION');
    const watermark = decimalU64(raw.watermarkSeconds, 'INTEGRITY_FAILURE');
    if (!Array.isArray(raw.acceptances) || raw.acceptances.length > MAX_ACCEPTANCE_ENTRIES ||
        !Array.isArray(raw.tombstones) || raw.tombstones.length > MAX_TOMBSTONES) return fail('INTEGRITY_FAILURE');
    const deadline = (value: unknown): string => {
      if (decimalU64(value, 'INTEGRITY_FAILURE') <= watermark) fail('INTEGRITY_FAILURE');
      return value as string;
    };
    const tombstones = raw.tombstones.map((input: unknown): Tombstone => {
      const row = own(input, ['termsHash', 'acceptBeforeSeconds']);
      fromHex32(row.termsHash, 'INTEGRITY_FAILURE');
      return Object.freeze({ termsHash: row.termsHash as string,
        acceptBeforeSeconds: deadline(row.acceptBeforeSeconds) });
    });
    const acceptances = raw.acceptances.map((input: unknown): Entry => {
      const row = own(input, ENTRY_FIELDS);
      const entry: Entry = { termsHash: row.termsHash as string, acceptBeforeSeconds: deadline(row.acceptBeforeSeconds),
        networkId: row.networkId as string, deploymentId: row.deploymentId as string,
        genesisHash: row.genesisHash as string, programId: row.programId as string, seller: null, buyer: null };
      for (const role of ['seller', 'buyer'] as const) {
        if (row[role] === null) continue;
        own(row[role], PARTY_FIELDS);
        entry[role] = partyOf(statementOf(entry, role, row[role] as Party));
      }
      if (!entry.seller && !entry.buyer) return fail('INTEGRITY_FAILURE');
      if (entry.seller && entry.buyer && !reciprocal(entry.seller, entry.buyer)) return fail('INTEGRITY_FAILURE');
      return entry;
    });
    const hashes = [...acceptances, ...tombstones].map(row => row.termsHash);
    const ordered = (rows: { termsHash: string }[]) => rows.every((row, index) => index === 0 ||
      byHash(rows[index - 1]!, row) < 0);
    if (new Set(hashes).size !== hashes.length || !ordered(acceptances) || !ordered(tombstones)) {
      return fail('INTEGRITY_FAILURE');
    }
    return { watermark, acceptances, tombstones };
  } catch (error) { return fail(failureCode(error, 'INTEGRITY_FAILURE')); }
  finally { bytes?.fill(0); }
}
function encode(state: State): PrivateRecordV1 {
  const bytes = new TextEncoder().encode(JSON.stringify({ format: SOLANA_PEER_REPLAY_FORMAT,
    watermarkSeconds: state.watermark.toString(), acceptances: [...state.acceptances].sort(byHash),
    tombstones: [...state.tombstones].sort(byHash) }));
  try {
    if (bytes.byteLength > MAX_RECORD_BYTES) return fail('LIMIT_EXCEEDED');
    return { id: SOLANA_PEER_REPLAY_RECORD_ID, kind: 'preference', schemaVersion: 1, payload: encodeBase64url(bytes) };
  } finally { bytes.fill(0); }
}

/** Drops entries whose acceptance deadline has passed and raises the watermark to the latest dropped deadline. */
function evict(state: State, now: bigint): boolean {
  const expired = (row: { acceptBeforeSeconds: string }) => BigInt(row.acceptBeforeSeconds) <= now;
  const dropped = [...state.acceptances, ...state.tombstones].filter(expired);
  if (dropped.length === 0) return false;
  for (const row of dropped) {
    const value = BigInt(row.acceptBeforeSeconds);
    if (value > state.watermark) state.watermark = value;
  }
  state.acceptances = state.acceptances.filter(row => !expired(row));
  state.tombstones = state.tombstones.filter(row => !expired(row));
  return true;
}
function vaultValue<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  const code = result.error.code;
  if (code === 'LOCKED' || code === 'CONFLICT' || code === 'CANCELLED' || code === 'LIMIT_EXCEEDED' ||
      code === 'UNSUPPORTED_VERSION') return fail(code);
  if (code === 'QUOTA_EXCEEDED' || code === 'REKEY_REQUIRED') return fail('LIMIT_EXCEEDED');
  return fail('UNAVAILABLE');
}
interface Snapshot {
  readonly context: SolanaLedgerContext; readonly proof: SolanaPeerProof; readonly owned: Uint8Array[];
}
/** Copies every caller-owned value before the first await; accessors are never invoked. */
function snapshot(contextInput: unknown, proofInput: unknown): Snapshot {
  const context = exactData(contextInput, ['role', 'ownMessagingKey', 'counterpartyMessagingKey',
    'envelopeExpiresAtSeconds']);
  const proof = exactData(proofInput, ['statement', 'termsSignature', 'acceptanceSignature']);
  const termsSignature = bytesOf(proof.termsSignature, 64, 64);
  const acceptanceSignature = bytesOf(proof.acceptanceSignature, 64, 64);
  return { context: Object.freeze({ role: context.role, ownMessagingKey: context.ownMessagingKey,
    counterpartyMessagingKey: context.counterpartyMessagingKey,
    envelopeExpiresAtSeconds: context.envelopeExpiresAtSeconds }) as SolanaLedgerContext,
  proof: { statement: snapshotPeerAcceptance(proof.statement), termsSignature, acceptanceSignature },
  owned: [termsSignature, acceptanceSignature] };
}

/** Session-scoped. A CONFLICT from the vault means another session wrote first: reopen and retry by hand. */
export class SolanaPeerReplayLedger {
  readonly #vault: VaultPort;
  readonly #lease: VaultSessionLease;
  readonly #clock: SolanaLedgerClock;
  #closed = false;
  #busy = false;
  constructor(vault: VaultPort, session: VaultSession, clock: SolanaLedgerClock) {
    this.#vault = vault;
    this.#clock = clock;
    this.#lease = vaultValue(vault.captureSession(session, () => { this.#closed = true; }));
  }
  #current(): Readonly<VaultSession> {
    const current = this.#lease.current();
    if (this.#closed || !current) return fail('LOCKED');
    return current;
  }
  /** Effective time never runs below the watermark, so an evicted entry cannot become admissible again. */
  #now(state: State): bigint {
    let clock: bigint;
    try { clock = decimalU64(this.#clock.nowSeconds()); } catch { return fail('UNAVAILABLE'); }
    return clock > state.watermark ? clock : state.watermark;
  }
  async #run<T>(work: (state: State, now: bigint) => { result: T; changed: boolean }): Promise<CoreResult<T>> {
    const operationId = createOperationId();
    const refused = (code: CoreErrorCode): CoreResult<never> =>
      ({ ok: false, error: createCoreError(code, { operationId, readOnly: false }) });
    if (this.#busy) return refused('CONFLICT');
    this.#busy = true;
    try {
      const session = this.#current();
      const record = vaultValue(await this.#vault.read(session.sessionId, SOLANA_PEER_REPLAY_RECORD_ID));
      const guard = () => { if (this.#current().revision !== session.revision) fail('CONFLICT'); };
      guard();
      const state = decode(record), now = this.#now(state);
      const evicted = evict(state, now), { result, changed } = work(state, now);
      // Even an unchanged result runs the vault's empty-commit freshness check against persisted state.
      vaultValue(await this.#vault.commit(session.sessionId, session.revision,
        changed || evicted ? [{ op: 'put', record: encode(state) }] : [], undefined, guard));
      this.#current();
      return { ok: true, value: result };
    } catch (error) { return refused(failureCode(error, 'UNAVAILABLE')); }
    finally { this.#busy = false; }
  }

  /** Verifies the proof at the ledger's effective time, then records it by (termsHash, role). */
  admit(
    trade: BoundSolanaTrade, context: SolanaLedgerContext, proof: SolanaPeerProof,
  ): Promise<CoreResult<SolanaAdmission>> {
    let copy: Snapshot;
    try {
      if (!isBoundSolanaTrade(trade)) return this.#run(() => fail('INVALID_INPUT'));
      copy = snapshot(context, proof);
    } catch { return this.#run(() => fail('INVALID_INPUT')); }
    const owned = copy.owned;
    return this.#run<SolanaAdmission>((state, now) => {
      const verified = checkSolanaPeerAcceptance(trade, { ...copy.context, nowSeconds: now.toString() }, copy.proof);
      const statement = verified.statement, acceptBefore = trade.terms.acceptBeforeSeconds;
      if (BigInt(acceptBefore) - now > HORIZON) return fail('LIMIT_EXCEEDED');
      if (state.tombstones.some(row => row.termsHash === statement.termsHash)) return fail('CONFLICT');
      const party = partyOf(statement), other = statement.role === 'seller' ? 'buyer' : 'seller';
      let entry = state.acceptances.find(row => row.termsHash === statement.termsHash);
      if (entry && (entry.networkId !== statement.networkId || entry.deploymentId !== statement.deploymentId ||
          entry.genesisHash !== statement.genesisHash || entry.programId !== statement.programId)) {
        return fail('CONFLICT');
      }
      const previous = entry?.[statement.role];
      if (previous) {
        if (!samePartyAs(previous, party)) return fail('CONFLICT');
        return { changed: false, result: Object.freeze({ ...verified, status: 'duplicate' as const }) };
      }
      if (entry) {
        const counterpart = entry[other]!;
        const [seller, buyer] = statement.role === 'seller' ? [party, counterpart] : [counterpart, party];
        if (!reciprocal(seller, buyer)) return fail('CONFLICT');
      } else {
        if (state.acceptances.length >= MAX_ACCEPTANCE_ENTRIES) return fail('LIMIT_EXCEEDED');
        entry = { termsHash: statement.termsHash, acceptBeforeSeconds: acceptBefore, networkId: statement.networkId,
          deploymentId: statement.deploymentId, genesisHash: statement.genesisHash, programId: statement.programId,
          seller: null, buyer: null };
        state.acceptances.push(entry);
      }
      entry[statement.role] = party;
      return { changed: true, result: Object.freeze({ ...verified, status: 'recorded' as const }) };
    }).finally(() => { for (const bytes of owned) bytes.fill(0); });
  }

  /** Only a locally authenticated cancel/reject handler may call this. Irreversible until the terms expire. */
  tombstone(trade: BoundSolanaTrade): Promise<CoreResult<void>> {
    if (!isBoundSolanaTrade(trade)) return this.#run(() => fail('INVALID_INPUT'));
    const termsHash = trade.termsHash, acceptBefore = BigInt(trade.terms.acceptBeforeSeconds);
    return this.#run((state, now) => {
      if (acceptBefore <= now) {
        // Already unverifiable; the watermark records that no acceptance for it may ever be admitted.
        if (acceptBefore <= state.watermark) return { changed: false, result: undefined };
        state.watermark = acceptBefore;
        return { changed: true, result: undefined };
      }
      if (state.tombstones.some(row => row.termsHash === termsHash)) return { changed: false, result: undefined };
      if (acceptBefore - now > HORIZON || state.tombstones.length >= MAX_TOMBSTONES) {
        return fail('LIMIT_EXCEEDED');
      }
      state.acceptances = state.acceptances.filter(row => row.termsHash !== termsHash);
      state.tombstones.push(Object.freeze({ termsHash, acceptBeforeSeconds: acceptBefore.toString() }));
      return { changed: true, result: undefined };
    });
  }

  /** Read-only view for display; it grants nothing. */
  status(trade: BoundSolanaTrade): Promise<CoreResult<SolanaReplayStatus>> {
    if (!isBoundSolanaTrade(trade)) return this.#run(() => fail('INVALID_INPUT'));
    return this.#run(state => {
      const entry = state.acceptances.find(row => row.termsHash === trade.termsHash);
      return { changed: false, result: Object.freeze({
        tombstoned: state.tombstones.some(row => row.termsHash === trade.termsHash),
        seller: entry?.seller != null, buyer: entry?.buyer != null }) };
    });
  }
  dispose(): void { this.#closed = true; this.#lease.dispose(); }
}
