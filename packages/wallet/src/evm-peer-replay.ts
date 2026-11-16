/** Private D1 candidate replay memory, in an existing encrypted vault record.
 * Stored history can deny admission but never substitutes for signature verification. */
import { createCoreError, createOperationId } from '../../domain/index.ts';
import { decodeBase64url, encodeBase64url, intentData, parseStrictJsonBytes,
  type CoreErrorCode, type CoreResult, type PrivateRecordV1, type Result, type VaultService,
  type VaultSession, type VaultSessionAuthority, type VaultSessionLease } from '../../schemas/index.ts';
import { bytes32Word, keccak256, type EvmDomainInput, type EvmTermsInput } from './evm-terms.ts';
import { snapshotPeerAcceptance, verifyEoaPeerAcceptance, type CandidateEoaPeerProof,
  type CandidateEoaPeerVerification, type EoaPeerContext, type PeerAcceptanceV1 } from './evm-peer-acceptance.ts';

export const MAX_PEER_REPLAY_TERMS = 64;
export const PEER_REPLAY_FORMAT = 'p2p-offramp/peer-replay/v1';
const MAX_BYTES = 131_072;
export const PEER_REPLAY_RECORD_ID = Array.from(keccak256(new TextEncoder().encode(PEER_REPLAY_FORMAT)).subarray(0, 16),
  byte => byte.toString(16).padStart(2, '0')).join('');
type VaultPort = Pick<VaultService, 'read' | 'commit'> & VaultSessionAuthority;
interface Entry { termsHash: string; tombstoned: boolean; seller: PeerAcceptanceV1 | null; buyer: PeerAcceptanceV1 | null; }
interface Admission extends CandidateEoaPeerVerification { readonly status: 'recorded' | 'duplicate'; }
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
function decode(record: PrivateRecordV1 | null): Entry[] {
  if (record === null) return [];
  if (record.kind !== 'preference' || record.id !== PEER_REPLAY_RECORD_ID) return fail('INTEGRITY_FAILURE');
  if (record.schemaVersion !== 1) return fail('UNSUPPORTED_VERSION');
  let bytes: Uint8Array | undefined;
  try {
    bytes = decodeBase64url(record.payload, 1, MAX_BYTES);
    const raw = intentData(parseStrictJsonBytes(bytes, MAX_BYTES), ['format', 'entries']);
    if (raw.format !== PEER_REPLAY_FORMAT) return fail('UNSUPPORTED_VERSION');
    if (!Array.isArray(raw.entries) || raw.entries.length > MAX_PEER_REPLAY_TERMS) return fail('INTEGRITY_FAILURE');
    const seen = new Set<string>();
    return raw.entries.map(input => {
      const row = intentData(input, ['termsHash', 'tombstoned', 'seller', 'buyer']), hash = termsHash(row.termsHash);
      if (seen.has(hash) || typeof row.tombstoned !== 'boolean') return fail('INTEGRITY_FAILURE');
      seen.add(hash);
      const binding = (input: unknown, role: 'seller' | 'buyer') => {
        if (input === null) return null;
        const copy = snapshotPeerAcceptance(input);
        if (copy.termsHash !== hash || copy.role !== role) return fail('INTEGRITY_FAILURE');
        return copy;
      };
      const seller = binding(row.seller, 'seller'), buyer = binding(row.buyer, 'buyer');
      if (!row.tombstoned && !seller && !buyer) return fail('INTEGRITY_FAILURE');
      if (seller && buyer && (seller.account === buyer.account || seller.ownMessagingKey !== buyer.counterpartyMessagingKey ||
          buyer.ownMessagingKey !== seller.counterpartyMessagingKey)) return fail('INTEGRITY_FAILURE');
      return { termsHash: hash, tombstoned: row.tombstoned, seller, buyer };
    });
  } catch (error) { return fail(failures.get(error as object) ?? 'INTEGRITY_FAILURE'); }
  finally { bytes?.fill(0); }
}
function encode(entries: Entry[]): PrivateRecordV1 {
  const bytes = new TextEncoder().encode(JSON.stringify({ format: PEER_REPLAY_FORMAT,
    entries: [...entries].sort((a, b) => a.termsHash < b.termsHash ? -1 : a.termsHash > b.termsHash ? 1 : 0) }));
  try {
    if (bytes.byteLength > MAX_BYTES) return fail('LIMIT_EXCEEDED');
    return { id: PEER_REPLAY_RECORD_ID, kind: 'preference', schemaVersion: 1, payload: encodeBase64url(bytes) };
  } finally { bytes.fill(0); }
}
const same = (left: PeerAcceptanceV1, right: PeerAcceptanceV1): boolean =>
  left.v === right.v && left.termsHash === right.termsHash && left.role === right.role && left.account === right.account &&
  left.ownMessagingKey === right.ownMessagingKey && left.counterpartyMessagingKey === right.counterpartyMessagingKey && left.notAfterSeconds === right.notAfterSeconds;

/** Session-scoped, no clear/delete/send API. Conflicts require reopening a fresh
 * vault session; there is no automatic retry or eviction of tombstone history. */
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
  async #run<T>(work: (entries: Entry[]) => { result: T; changed: boolean }): Promise<CoreResult<T>> {
    const operationId = createOperationId();
    const refused = (code: CoreErrorCode): CoreResult<never> => ({ ok: false, error: createCoreError(code, { operationId, readOnly: false }) });
    if (this.#busy) return refused('CONFLICT');
    this.#busy = true;
    try {
      const session = this.#current();
      const record = value(await this.#vault.read(session.sessionId, PEER_REPLAY_RECORD_ID));
      const guard = () => { const current = this.#current(); if (current.revision !== session.revision) return fail('CONFLICT'); };
      guard();
      const entries = decode(record), { result, changed } = work(entries);
      // Even a duplicate must synchronize the cached snapshot against persisted
      // state. Empty commit performs the vault's freshness check without a write.
      value(await this.#vault.commit(session.sessionId, session.revision,
        changed ? [{ op: 'put', record: encode(entries) }] : [], undefined, guard));
      this.#current();
      return { ok: true, value: result };
    } catch (error) { return refused(failures.get(error as object) ?? 'UNAVAILABLE'); }
    finally { this.#busy = false; }
  }
  admitEoa(domain: EvmDomainInput, terms: EvmTermsInput, context: EoaPeerContext, proof: CandidateEoaPeerProof): Promise<CoreResult<Readonly<Admission>>> {
    // No signature, caller object or cryptographic input remains live across await.
    let verified: Readonly<CandidateEoaPeerVerification> | null, binding: Readonly<PeerAcceptanceV1>;
    try {
      const raw = intentData(proof, ['binding', 'termsSignature', 'bindingSignature']);
      binding = snapshotPeerAcceptance(raw.binding);
      verified = verifyEoaPeerAcceptance(domain, terms, context, { binding,
        termsSignature: raw.termsSignature as Uint8Array, bindingSignature: raw.bindingSignature as Uint8Array });
    }
    catch { return this.#run(() => fail('INVALID_INPUT')); }
    if (!verified) return this.#run(() => fail('UNAUTHORIZED'));
    const accepted = verified;
    return this.#run<Readonly<Admission>>(entries => {
      let entry = entries.find(row => row.termsHash === binding.termsHash);
      if (entry?.tombstoned) return fail('CONFLICT');
      const previous = entry?.[binding.role];
      if (previous) {
        if (!same(previous, binding)) return fail('CONFLICT');
        return { changed: false, result: Object.freeze({ ...accepted, status: 'duplicate' as const }) };
      }
      if (!entry) {
        if (entries.length >= MAX_PEER_REPLAY_TERMS) return fail('LIMIT_EXCEEDED');
        entry = { termsHash: binding.termsHash, tombstoned: false, seller: null, buyer: null }; entries.push(entry);
      }
      const other = entry[binding.role === 'seller' ? 'buyer' : 'seller'];
      if (other && (other.account === binding.account || other.ownMessagingKey !== binding.counterpartyMessagingKey ||
          other.counterpartyMessagingKey !== binding.ownMessagingKey)) return fail('CONFLICT');
      entry[binding.role] = binding;
      return { changed: true, result: Object.freeze({ ...accepted, status: 'recorded' as const }) };
    });
  }
  /** Only a locally authenticated cancel/reject handler may call this private API. */
  tombstone(input: string): Promise<CoreResult<void>> {
    let hash: string;
    try { hash = termsHash(input); } catch { return this.#run(() => fail('INVALID_INPUT')); }
    return this.#run(entries => {
      const entry = entries.find(row => row.termsHash === hash);
      if (entry?.tombstoned) return { changed: false, result: undefined };
      if (entry) entry.tombstoned = true;
      else {
        if (entries.length >= MAX_PEER_REPLAY_TERMS) return fail('LIMIT_EXCEEDED');
        entries.push({ termsHash: hash, tombstoned: true, seller: null, buyer: null });
      }
      return { changed: true, result: undefined };
    });
  }
  dispose(): void { this.#closed = true; this.#lease.dispose(); }
}
