/** D1 replay and cancellation memory, in one existing encrypted vault record.
 * Stored history can deny admission but never substitutes for signature verification or grants authority.
 *
 * Lifetime and capacity (replaces the candidate's permanent 64-term bound):
 * - Live entries (recorded statements, not tombstoned) carry the terms deadline their termsHash commits to
 *   (acceptBeforeSeconds), the advertisement, the counterparty key and the session end (advert expiry). They retire at
 *   acceptBeforeSeconds + PEER_REPLAY_RETIRE_SKEW_SECONDS, raising a high-water mark `retiredThroughSeconds` to that
 *   deadline. Every later admission or status for terms whose deadline is at or below the mark is refused / reported
 *   withdrawn, so a removed entry (tombstone or not) is never resurrected, even after a clock jump and rollback. The mark
 *   only ever rises to the deadline of an entry actually retired, never to the clock itself.
 * - A statement that was never accepted (no buyer binding) can no longer progress once its session ended (advert
 *   expiry). It is then compacted into a tombstone and stops counting against the live quotas.
 * - cancel/reject tombstones are compact (no bindings) and use their own budget (MAX_PEER_REPLAY_TOMBSTONES); they stay
 *   until their deadline passes the high-water mark. They never count against per-peer, per-advert or live quotas.
 * - New live entries are refused (LIMIT_EXCEEDED, never evicted) beyond MAX_PEER_REPLAY_TERMS in total. Non-priority
 *   entries (an unselected seller-side session) are also bounded per counterparty and per advertisement and cannot use the
 *   last PEER_REPLAY_PRIORITY_RESERVE live slots, which stay available for selected and buyer-side sessions.
 * - Legacy entries (schema version 1, the unscoped tombstone API) carry no deadline, never retire and count against the
 *   live total.
 * Freshness is local: a restored or other profile has only the history its backup contained (see docs).
 */
import { createCoreError, createOperationId } from '../../domain/index.ts';
import { decodeBase64url, encodeBase64url, intentData, parseStrictJsonBytes,
  type CoreErrorCode, type CoreResult, type PrivateRecordV1, type Result, type VaultService,
  type VaultSession, type VaultSessionAuthority, type VaultSessionLease } from '../../schemas/index.ts';
import { bytes32Word, keccak256, snapshotEvmTerms, type EvmDomainInput, type EvmTermsInput } from './evm-terms.ts';
import { snapshotPeerAcceptance, verifyEoaPeerAcceptance, type CandidateEoaPeerProof,
  type CandidateEoaPeerVerification, type EoaPeerContext, type PeerAcceptanceV1, type PeerRegistryView } from './evm-peer-acceptance.ts';
import { isPeerAcceptanceEvidence, type PeerAcceptanceEvidence } from './evm-peer-verifier.ts';

/** Live entries in total (recorded statements and deadline-less legacy entries). */
export const MAX_PEER_REPLAY_TERMS = 64;
export const MAX_PEER_REPLAY_TERMS_PER_PEER = 8;
export const MAX_PEER_REPLAY_TERMS_PER_AD = 16;
/** Live slots only priority (selected or buyer-side) sessions may use. */
export const PEER_REPLAY_PRIORITY_RESERVE = 16;
/** Compact scoped tombstones, separately from live entries (live + tombstones stay within the strict parser's 256-item array bound). */
export const MAX_PEER_REPLAY_TOMBSTONES = 192;
/** Local clock skew tolerated after a terms deadline before its entries retire. */
export const PEER_REPLAY_RETIRE_SKEW_SECONDS = 300;
/** Schema version 1 format string; the record ID derives from it and never changes. */
export const PEER_REPLAY_FORMAT = 'p2p-offramp/peer-replay/v1';
/** Schema version 2 (scoped entries and retirement high-water mark). Every write uses it. */
export const PEER_REPLAY_FORMAT_V2 = 'p2p-offramp/peer-replay/v2';
const MAX_BYTES = 131_072;
export const PEER_REPLAY_RECORD_ID = Array.from(keccak256(new TextEncoder().encode(PEER_REPLAY_FORMAT)).subarray(0, 16),
  byte => byte.toString(16).padStart(2, '0')).join('');
type VaultPort = Pick<VaultService, 'read' | 'commit'> & VaultSessionAuthority;
interface Entry {
  termsHash: string; acceptBeforeSeconds: string | null; ad: string | null; peer: string | null; closesAtSeconds: string | null;
  tombstoned: boolean; seller: PeerAcceptanceV1 | null; buyer: PeerAcceptanceV1 | null;
}
interface State { retiredThroughSeconds: bigint; entries: Entry[] }
interface Admission extends CandidateEoaPeerVerification { readonly status: 'recorded' | 'duplicate'; }
export interface PeerReplayScope {
  /** Advertisement address of the live session and the counterparty's messaging key (local perspective). */
  readonly ad: string; readonly peer: string;
  /** The terms deadline that the termsHash commits to. */
  readonly acceptBeforeSeconds: string;
  /** Trusted local clock, canonical decimal seconds. */
  readonly nowSeconds: string;
  /** When the session can no longer progress (advert expiry), canonical decimal seconds. */
  readonly closesAtSeconds: string;
  /** A selected seller-side or any buyer-side session: exempt from per-peer/per-advert quotas, may use the reserve. */
  readonly priority: boolean;
}
export interface ScopedAdmission {
  readonly status: 'recorded' | 'duplicate'; readonly termsHash: string; readonly role: 'seller' | 'buyer';
  /** This profile's history only; never a claim that no other device or backup recorded a later tombstone. */
  readonly freshness: 'local-history';
}
export interface ReplayStatus {
  /** Tombstoned, or (when the deadline is given) at or below the retirement high-water mark: never shown as live. */
  readonly tombstoned: boolean; readonly retired: boolean;
  readonly seller: boolean; readonly buyer: boolean; readonly freshness: 'local-history';
}
const failures = new WeakMap<object, CoreErrorCode>();
function fail(code: CoreErrorCode): never { const error = new Error('Peer replay operation unavailable.'); failures.set(error, code); throw error; }
function value<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  const code = result.error.code;
  if (code === 'LOCKED' || code === 'CONFLICT' || code === 'CANCELLED' || code === 'LIMIT_EXCEEDED' || code === 'UNSUPPORTED_VERSION') return fail(code);
  if (code === 'QUOTA_EXCEEDED' || code === 'REKEY_REQUIRED') return fail('LIMIT_EXCEEDED');
  return fail('UNAVAILABLE');
}
function termsHash(input: unknown): string { try { bytes32Word(input); return input as string; } catch { return fail('INVALID_INPUT'); } }
const DECIMAL = /^(?:0|[1-9][0-9]{0,19})$/, HEX64 = /^[0-9a-f]{64}$/, U64 = (1n << 64n) - 1n;
function decimal(input: unknown, code: CoreErrorCode = 'INTEGRITY_FAILURE'): bigint {
  if (typeof input !== 'string' || !DECIMAL.test(input) || BigInt(input) > U64) return fail(code);
  return BigInt(input);
}
const nullableHex = (input: unknown): string | null => input === null ? null : typeof input === 'string' && HEX64.test(input) ? input : fail('INTEGRITY_FAILURE');
/** Advert addresses are stored as their keccak256, which is enough for the per-advert quota. */
const adKey = (ad: unknown): string => {
  if (typeof ad !== 'string' || ad.length === 0 || ad.length > 256) return fail('INVALID_INPUT');
  return Array.from(keccak256(new TextEncoder().encode(ad)), byte => byte.toString(16).padStart(2, '0')).join('');
};
/** Live budget: recorded statements, and legacy entries without a deadline (which never retire). */
const isLive = (entry: Entry): boolean => !entry.tombstoned || entry.acceptBeforeSeconds === null;
const isScopedTombstone = (entry: Entry): boolean => entry.tombstoned && entry.acceptBeforeSeconds !== null;
/** Tombstone in place: bindings and scope are irrelevant once every later statement is refused. */
function compact(entry: Entry): void {
  entry.tombstoned = true;
  if (entry.acceptBeforeSeconds !== null) { entry.seller = null; entry.buyer = null; entry.ad = null; entry.peer = null; entry.closesAtSeconds = null; }
}
function decodeRow(input: unknown, version: 1 | 2): Entry {
  const row = intentData(input, version === 1 ? ['termsHash', 'tombstoned', 'seller', 'buyer']
    : ['termsHash', 'acceptBeforeSeconds', 'ad', 'peer', 'closesAtSeconds', 'tombstoned', 'seller', 'buyer']);
  const hash = termsHash(row.termsHash);
  if (typeof row.tombstoned !== 'boolean') return fail('INTEGRITY_FAILURE');
  const binding = (value: unknown, role: 'seller' | 'buyer') => {
    if (value === null) return null;
    const copy = snapshotPeerAcceptance(value);
    if (copy.termsHash !== hash || copy.role !== role) return fail('INTEGRITY_FAILURE');
    return copy;
  };
  const seller = binding(row.seller, 'seller'), buyer = binding(row.buyer, 'buyer');
  if (!row.tombstoned && !seller && !buyer) return fail('INTEGRITY_FAILURE');
  if (seller && buyer && (seller.account === buyer.account || seller.ownMessagingKey !== buyer.counterpartyMessagingKey ||
      buyer.ownMessagingKey !== seller.counterpartyMessagingKey)) return fail('INTEGRITY_FAILURE');
  if (version === 1) return { termsHash: hash, acceptBeforeSeconds: null, ad: null, peer: null, closesAtSeconds: null, tombstoned: row.tombstoned, seller, buyer };
  const acceptBeforeSeconds = row.acceptBeforeSeconds === null ? null : decimal(row.acceptBeforeSeconds).toString();
  const closesAtSeconds = row.closesAtSeconds === null ? null : decimal(row.closesAtSeconds).toString();
  const ad = nullableHex(row.ad), peer = nullableHex(row.peer);
  if ((ad === null) !== (peer === null) || (ad === null) !== (closesAtSeconds === null)) return fail('INTEGRITY_FAILURE');
  // A scoped tombstone is compact.
  if (row.tombstoned && acceptBeforeSeconds !== null && (seller || buyer || ad !== null)) return fail('INTEGRITY_FAILURE');
  return { termsHash: hash, acceptBeforeSeconds, ad, peer, closesAtSeconds, tombstoned: row.tombstoned, seller, buyer };
}
function decode(record: PrivateRecordV1 | null): State {
  if (record === null) return { retiredThroughSeconds: 0n, entries: [] };
  if (record.kind !== 'preference' || record.id !== PEER_REPLAY_RECORD_ID) return fail('INTEGRITY_FAILURE');
  if (record.schemaVersion !== 1 && record.schemaVersion !== 2) return fail('UNSUPPORTED_VERSION');
  const version = record.schemaVersion;
  let bytes: Uint8Array | undefined;
  try {
    bytes = decodeBase64url(record.payload, 1, MAX_BYTES);
    const raw = intentData(parseStrictJsonBytes(bytes, MAX_BYTES), version === 1 ? ['format', 'entries'] : ['format', 'retiredThroughSeconds', 'entries']);
    if (raw.format !== (version === 1 ? PEER_REPLAY_FORMAT : PEER_REPLAY_FORMAT_V2)) return fail('UNSUPPORTED_VERSION');
    const limit = version === 1 ? MAX_PEER_REPLAY_TERMS : MAX_PEER_REPLAY_TERMS + MAX_PEER_REPLAY_TOMBSTONES;
    if (!Array.isArray(raw.entries) || raw.entries.length > limit) return fail('INTEGRITY_FAILURE');
    const seen = new Set<string>();
    const entries = raw.entries.map(input => {
      const entry = decodeRow(input, version);
      if (seen.has(entry.termsHash)) return fail('INTEGRITY_FAILURE');
      seen.add(entry.termsHash); return entry;
    });
    if (entries.filter(isLive).length > MAX_PEER_REPLAY_TERMS || entries.filter(isScopedTombstone).length > MAX_PEER_REPLAY_TOMBSTONES) return fail('INTEGRITY_FAILURE');
    return { retiredThroughSeconds: version === 1 ? 0n : decimal(raw.retiredThroughSeconds), entries };
  } catch (error) { return fail(failures.get(error as object) ?? 'INTEGRITY_FAILURE'); }
  finally { bytes?.fill(0); }
}
function encode(state: State): PrivateRecordV1 {
  const entries = [...state.entries].sort((a, b) => a.termsHash < b.termsHash ? -1 : a.termsHash > b.termsHash ? 1 : 0)
    .map(entry => ({ termsHash: entry.termsHash, acceptBeforeSeconds: entry.acceptBeforeSeconds, ad: entry.ad, peer: entry.peer,
      closesAtSeconds: entry.closesAtSeconds, tombstoned: entry.tombstoned, seller: entry.seller, buyer: entry.buyer }));
  const bytes = new TextEncoder().encode(JSON.stringify({ format: PEER_REPLAY_FORMAT_V2, retiredThroughSeconds: state.retiredThroughSeconds.toString(), entries }));
  try {
    if (bytes.byteLength > MAX_BYTES) return fail('LIMIT_EXCEEDED');
    return { id: PEER_REPLAY_RECORD_ID, kind: 'preference', schemaVersion: 2, payload: encodeBase64url(bytes) };
  } finally { bytes.fill(0); }
}
const same = (left: PeerAcceptanceV1, right: PeerAcceptanceV1): boolean =>
  left.v === right.v && left.termsHash === right.termsHash && left.role === right.role && left.account === right.account &&
  left.ownMessagingKey === right.ownMessagingKey && left.counterpartyMessagingKey === right.counterpartyMessagingKey && left.notAfterSeconds === right.notAfterSeconds;
/**
 * Lifetime step for a trusted clock reading:
 * 1. a never-accepted statement whose session ended is compacted into a tombstone (while tombstone budget remains);
 * 2. every entry with a deadline whose deadline + skew has passed is removed, raising the high-water mark to it.
 * Removal is safe because admission and status treat every deadline at or below the mark as withdrawn.
 */
function retire(state: State, now: bigint | null): boolean {
  if (now === null) return false;
  let changed = false;
  for (const entry of state.entries) {
    if (!entry.tombstoned && entry.buyer === null && entry.closesAtSeconds !== null && BigInt(entry.closesAtSeconds) <= now &&
        state.entries.filter(isScopedTombstone).length < MAX_PEER_REPLAY_TOMBSTONES) { compact(entry); changed = true; }
  }
  const kept = state.entries.filter(entry => entry.acceptBeforeSeconds === null || BigInt(entry.acceptBeforeSeconds) + BigInt(PEER_REPLAY_RETIRE_SKEW_SECONDS) > now);
  if (kept.length === state.entries.length) return changed;
  for (const entry of state.entries) if (!kept.includes(entry)) {
    const deadline = BigInt(entry.acceptBeforeSeconds!);
    if (deadline > state.retiredThroughSeconds) state.retiredThroughSeconds = deadline;
  }
  state.entries = kept; return true;
}
interface StableScope { ad: string; peer: string; closesAt: string; priority: boolean }
/** Shared (termsHash, role) admission. `scope` null: legacy entry with only the live total bound. */
function record(state: State, binding: Readonly<PeerAcceptanceV1>, acceptBefore: string, scope: StableScope | null):
  { result: 'recorded' | 'duplicate'; changed: boolean } {
  if (BigInt(acceptBefore) <= state.retiredThroughSeconds) return fail('EXPIRED');
  let entry = state.entries.find(row => row.termsHash === binding.termsHash);
  if (entry?.tombstoned) return fail('CONFLICT');
  const previous = entry?.[binding.role];
  if (previous) {
    if (!same(previous, binding)) return fail('CONFLICT');
    return { result: 'duplicate', changed: false };
  }
  if (!entry) {
    const live = state.entries.filter(isLive);
    const limit = scope === null || scope.priority ? MAX_PEER_REPLAY_TERMS : MAX_PEER_REPLAY_TERMS - PEER_REPLAY_PRIORITY_RESERVE;
    if (live.length >= limit) return fail('LIMIT_EXCEEDED');
    if (scope !== null && !scope.priority && (live.filter(row => row.peer === scope.peer).length >= MAX_PEER_REPLAY_TERMS_PER_PEER ||
        live.filter(row => row.ad === scope.ad).length >= MAX_PEER_REPLAY_TERMS_PER_AD)) return fail('LIMIT_EXCEEDED');
    entry = { termsHash: binding.termsHash, acceptBeforeSeconds: acceptBefore, ad: scope?.ad ?? null, peer: scope?.peer ?? null,
      closesAtSeconds: scope?.closesAt ?? null, tombstoned: false, seller: null, buyer: null };
    state.entries.push(entry);
  }
  const other = entry[binding.role === 'seller' ? 'buyer' : 'seller'];
  if (other && (other.account === binding.account || other.ownMessagingKey !== binding.counterpartyMessagingKey ||
      other.counterpartyMessagingKey !== binding.ownMessagingKey)) return fail('CONFLICT');
  entry[binding.role] = binding;
  return { result: 'recorded', changed: true };
}
/** Tombstone `hash` (existing entry in place, or a new entry). `acceptBefore` null: legacy deadline-less tombstone. */
function bury(state: State, hash: string, acceptBefore: string | null): { result: undefined; changed: boolean } {
  // At or below the high-water mark every admission is already refused; nothing to add.
  if (acceptBefore !== null && BigInt(acceptBefore) <= state.retiredThroughSeconds) return { changed: false, result: undefined };
  const entry = state.entries.find(row => row.termsHash === hash);
  if (entry?.tombstoned) return { changed: false, result: undefined };
  const scopedTombstones = state.entries.filter(isScopedTombstone).length;
  if (entry) {
    if (entry.acceptBeforeSeconds !== null && scopedTombstones >= MAX_PEER_REPLAY_TOMBSTONES) return fail('LIMIT_EXCEEDED');
    compact(entry);
  } else if (acceptBefore === null) {
    if (state.entries.filter(isLive).length >= MAX_PEER_REPLAY_TERMS) return fail('LIMIT_EXCEEDED');
    state.entries.push({ termsHash: hash, acceptBeforeSeconds: null, ad: null, peer: null, closesAtSeconds: null, tombstoned: true, seller: null, buyer: null });
  } else {
    if (scopedTombstones >= MAX_PEER_REPLAY_TOMBSTONES) return fail('LIMIT_EXCEEDED');
    state.entries.push({ termsHash: hash, acceptBeforeSeconds: acceptBefore, ad: null, peer: null, closesAtSeconds: null, tombstoned: true, seller: null, buyer: null });
  }
  return { changed: true, result: undefined };
}
function stableScope(input: unknown): { scope: StableScope; acceptBefore: string; now: bigint } | null {
  try {
    const raw = intentData(input, ['ad', 'peer', 'acceptBeforeSeconds', 'nowSeconds', 'closesAtSeconds', 'priority']);
    if (typeof raw.peer !== 'string' || !HEX64.test(raw.peer) || typeof raw.priority !== 'boolean') return null;
    return { scope: { ad: adKey(raw.ad), peer: raw.peer, closesAt: decimal(raw.closesAtSeconds, 'INVALID_INPUT').toString(), priority: raw.priority },
      acceptBefore: decimal(raw.acceptBeforeSeconds, 'INVALID_INPUT').toString(), now: decimal(raw.nowSeconds, 'INVALID_INPUT') };
  } catch { return null; }
}

/** Session-scoped, no clear/delete/send API. Conflicts require reopening a fresh vault session; there is no automatic
 * retry. Calls on one instance must not overlap (CONFLICT); evm-peer-port.ts serializes them. */
export class CandidatePeerReplayLedger {
  readonly #vault: VaultPort;
  readonly #lease: VaultSessionLease;
  #closed = false;
  #busy = false;
  constructor(vault: VaultPort, session: VaultSession) {
    this.#vault = vault;
    this.#lease = value(vault.captureSession(session, () => { this.#closed = true; }));
  }
  #current(): Readonly<VaultSession> {
    const current = this.#lease.current();
    if (this.#closed || !current) return fail('LOCKED');
    return current;
  }
  async #run<T>(now: bigint | null, work: (state: State) => { result: T; changed: boolean }): Promise<CoreResult<T>> {
    const operationId = createOperationId();
    const refused = (code: CoreErrorCode): CoreResult<never> => ({ ok: false, error: createCoreError(code, { operationId, readOnly: false }) });
    if (this.#busy) return refused('CONFLICT');
    this.#busy = true;
    try {
      const session = this.#current();
      const stored = value(await this.#vault.read(session.sessionId, PEER_REPLAY_RECORD_ID));
      const guard = () => { const current = this.#current(); if (current.revision !== session.revision) return fail('CONFLICT'); };
      guard();
      const state = decode(stored), retired = retire(state, now), { result, changed } = work(state);
      // Even a duplicate must synchronize the cached snapshot against persisted
      // state. Empty commit performs the vault's freshness check without a write.
      value(await this.#vault.commit(session.sessionId, session.revision,
        changed || retired ? [{ op: 'put', record: encode(state) }] : [], undefined, guard));
      this.#current();
      return { ok: true, value: result };
    } catch (error) { return refused(failures.get(error as object) ?? 'UNAVAILABLE'); }
    finally { this.#busy = false; }
  }
  /** Offline EOA path (no account classification): verifies with the local registry, then records an unscoped entry. */
  admitEoa(registry: PeerRegistryView, domain: EvmDomainInput, terms: EvmTermsInput, context: EoaPeerContext,
    proof: CandidateEoaPeerProof): Promise<CoreResult<Readonly<Admission>>> {
    // No signature, caller object or cryptographic input remains live across await.
    let verified: Readonly<CandidateEoaPeerVerification> | null, binding: Readonly<PeerAcceptanceV1>, acceptBefore: string, now: bigint;
    try {
      const raw = intentData(proof, ['binding', 'termsSignature', 'bindingSignature']);
      binding = snapshotPeerAcceptance(raw.binding);
      // One snapshot of each caller object: the recorded deadline is the one that was verified.
      const stableContext = intentData(context, ['role', 'ownMessagingKey', 'counterpartyMessagingKey', 'nowSeconds', 'envelopeExpiresAtSeconds']);
      const stableTerms = snapshotEvmTerms(terms);
      verified = verifyEoaPeerAcceptance(registry, domain, stableTerms, stableContext as unknown as EoaPeerContext, { binding,
        termsSignature: raw.termsSignature as Uint8Array, bindingSignature: raw.bindingSignature as Uint8Array });
      acceptBefore = decimal(stableTerms.acceptBeforeSeconds, 'INVALID_INPUT').toString(); now = decimal(stableContext.nowSeconds, 'INVALID_INPUT');
    }
    catch { return this.#run(null, () => fail('INVALID_INPUT')); }
    if (!verified) return this.#run(null, () => fail('UNAUTHORIZED'));
    const accepted = verified;
    return this.#run<Readonly<Admission>>(now, state => {
      const { result, changed } = record(state, binding, acceptBefore, null);
      return { changed, result: Object.freeze({ ...accepted, status: result }) };
    });
  }
  /**
   * Composed path: record a statement that a verifier from evm-peer-verifier.ts returned (classified account, both
   * signatures, registry domain). Only that verifier's own evidence objects are accepted, never a look-alike shape.
   */
  admitVerified(evidence: PeerAcceptanceEvidence, scope: PeerReplayScope): Promise<CoreResult<Readonly<ScopedAdmission>>> {
    if (!isPeerAcceptanceEvidence(evidence)) return this.#run(null, () => fail('INVALID_INPUT'));
    const binding = evidence.binding, stable = stableScope(scope);
    // The counterparty is the signer (received statement) or the binding's counterparty (own statement). The termsHash
    // commits to the deadline; a scope naming an earlier one is a composition error.
    if (stable === null || (stable.scope.peer !== binding.ownMessagingKey && stable.scope.peer !== binding.counterpartyMessagingKey) ||
        BigInt(evidence.effectiveNotAfterSeconds) > BigInt(stable.acceptBefore)) return this.#run(null, () => fail('INVALID_INPUT'));
    return this.#run<Readonly<ScopedAdmission>>(stable.now, state => {
      const { result, changed } = record(state, binding, stable.acceptBefore, stable.scope);
      return { changed, result: Object.freeze({ status: result, termsHash: binding.termsHash, role: binding.role, freshness: 'local-history' as const }) };
    });
  }
  /** Legacy tombstone without a known deadline: never retires. Only a locally authenticated cancel/reject handler may
   * call this private API. */
  tombstone(input: string): Promise<CoreResult<void>> {
    let hash: string;
    try { hash = termsHash(input); } catch { return this.#run(null, () => fail('INVALID_INPUT')); }
    return this.#run(null, state => {
      const entry = state.entries.find(row => row.termsHash === hash);
      return bury(state, hash, entry?.acceptBeforeSeconds ?? null);
    });
  }
  /** Scoped tombstone for an authenticated cancel/reject of reviewed terms. Every later statement for termsHash is refused
   * until, and through the high-water mark after, its deadline. Uses the separate tombstone budget. */
  tombstoneScoped(input: string, scope: PeerReplayScope): Promise<CoreResult<void>> {
    let hash: string;
    try { hash = termsHash(input); } catch { return this.#run(null, () => fail('INVALID_INPUT')); }
    const stable = stableScope(scope);
    if (stable === null) return this.#run(null, () => fail('INVALID_INPUT'));
    return this.#run(stable.now, state => bury(state, hash, stable.acceptBefore));
  }
  /** Persisted-fresh read (empty-commit freshness check). With the terms deadline, a termsHash at or below the high-water
   * mark is reported withdrawn even though its entry was removed: retirement never resurrects. */
  status(input: string, nowSeconds: string, acceptBeforeSeconds?: string): Promise<CoreResult<Readonly<ReplayStatus>>> {
    let hash: string, now: bigint, deadline: bigint | null;
    try {
      hash = termsHash(input); now = decimal(nowSeconds, 'INVALID_INPUT');
      deadline = acceptBeforeSeconds === undefined ? null : decimal(acceptBeforeSeconds, 'INVALID_INPUT');
    } catch { return this.#run(null, () => fail('INVALID_INPUT')); }
    return this.#run(now, state => {
      const entry = state.entries.find(row => row.termsHash === hash);
      const retired = deadline !== null && deadline <= state.retiredThroughSeconds;
      return { changed: false, result: Object.freeze({ tombstoned: (entry?.tombstoned ?? false) || retired, retired,
        seller: entry?.seller != null, buyer: entry?.buyer != null, freshness: 'local-history' as const }) };
    });
  }
  dispose(): void { this.#closed = true; this.#lease.dispose(); }
}
