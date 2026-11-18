/** Actual G02 preference consumer. One atomic commit adds matched LOCAL claims and the completed cursor together. */
import { decodeBase64url, encodeBase64url, MAX_PAYLOAD_BYTES, type PrivateRecordV1, type Result, type VaultService,
  type VaultSession, type VaultSessionAuthority, type VaultSessionLease } from '../../schemas/index.ts';
import { bindingOf, bindingText, candidateIdOf, cursorIdOf, decodeStoredObserved, storedObserved, scopeHashOf, CURSOR_FORMAT, CANDIDATE_FORMAT, MAX_CANDIDATES,
  type ComparisonBinding, type ObservedAnnouncement, type ClaimedCursor } from './records.ts';
import { codeOf, data, failure, hash, integer, stop, success, uint, type StealthResult } from './shared.ts';
type Vault = Pick<VaultService, 'commit' | 'list'> & VaultSessionAuthority;
export interface EncryptedComparisonStore { readonly kind: 'offline-encrypted-stealth-store'; close(): void; }
export interface ComparisonStoreOptions extends ComparisonBinding { readonly vault: Vault; readonly session: VaultSession; readonly isCurrent: () => boolean; }
export interface ComparisonSnapshot { readonly revision: number; readonly cursor: ClaimedCursor | null; readonly candidates: readonly ObservedAnnouncement[]; readonly existingIds: ReadonlySet<string>; }
export interface StoreLease {
  readonly signal: AbortSignal; readonly binding: ComparisonBinding;
  guard(): void; read(): Promise<ComparisonSnapshot>; commit(snapshot: ComparisonSnapshot, additions: readonly ObservedAnnouncement[], cursor: ClaimedCursor): Promise<void>; release(): void;
}
const stores = new WeakMap<object, { readonly binding: ComparisonBinding; begin(onRevoked: () => void): StoreLease }>();
function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.value; const code = result.error.code;
  return stop(code === 'LOCKED' || code === 'CONFLICT' || code === 'CANCELLED' ? code : code === 'LIMIT_EXCEEDED' || code === 'QUOTA_EXCEEDED' || code === 'REKEY_REQUIRED' ? 'CAPACITY_EXCEEDED' : 'COMMIT_UNKNOWN');
}
function encode(value: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value)); try { if (bytes.length > MAX_PAYLOAD_BYTES) return stop('CAPACITY_EXCEEDED'); return encodeBase64url(bytes); }
  finally { bytes.fill(0); }
}
function decode(record: PrivateRecordV1): { text: string; value: Record<string, unknown> } | null {
  let bytes: Uint8Array | undefined;
  try { bytes = decodeBase64url(record.payload, 1, MAX_PAYLOAD_BYTES); const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes), value = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null; return { text, value }; }
  catch { return null; } finally { bytes?.fill(0); }
}
function storedCursor(cursor: ClaimedCursor | null) { return cursor === null ? null : { blockNumber: cursor.blockNumber.toString(), blockHash: cursor.blockHash }; }
export function createEncryptedComparisonStore(input: ComparisonStoreOptions): StealthResult<EncryptedComparisonStore> {
  let lease: VaultSessionLease | undefined;
  try {
    const raw = data(input, ['profileId', 'context', 'viewingPublicKeyHex', 'spendingPublicKeyHex', 'vault', 'session', 'isCurrent']);
    const binding = bindingOf({ profileId: raw.profileId, context: raw.context, viewingPublicKeyHex: raw.viewingPublicKeyHex, spendingPublicKeyHex: raw.spendingPublicKeyHex });
    const vault = raw.vault as Vault;
    const current = raw.isCurrent as (() => boolean);
    if (!vault || typeof vault.captureSession !== 'function' || typeof vault.commit !== 'function' || typeof vault.list !== 'function' || typeof current !== 'function') return failure('INVALID_INPUT');
    const commit = vault.commit.bind(vault), list = vault.list.bind(vault), scopeHash = scopeHashOf(binding), cursorId = cursorIdOf(scopeHash);
    const lifetime = new AbortController();
    let closed = false, active: { readonly revoked: () => void; readonly controller: AbortController } | undefined;
    const close = (): void => { if (closed) return; closed = true; lifetime.abort(); active?.controller.abort(); try { active?.revoked(); } catch { /* Already revoked. */ } lease?.dispose(); };
    lease = unwrap(vault.captureSession(raw.session as VaultSession, close)); const captured = lease;
    const facade = Object.freeze({ kind: 'offline-encrypted-stealth-store' as const, close });
    stores.set(facade, { binding, begin(onRevoked) {
      if (active) return stop('CONFLICT'); if (closed) return stop('LOCKED');
      const admission = { revoked: onRevoked, controller: new AbortController() }; active = admission; let revision = -1;
      function guard(): void {
        if (closed || active !== admission || admission.controller.signal.aborted) return stop('LOCKED');
        const session = captured.current();
        let live = false; try { live = current() === true; } catch { /* Fixed refusal. */ }
        const finalSession = captured.current();
        if (closed || active !== admission || admission.controller.signal.aborted || !session || !live || !finalSession) { close(); return stop('LOCKED'); }
        if (revision >= 0 && (session.revision !== revision || finalSession.revision !== revision)) return stop('CONFLICT');
      }
      const release = (): void => { if (active === admission) active = undefined; };
      try { guard(); } catch (error) { release(); throw error; }
      return Object.freeze({ signal: lifetime.signal, binding, guard, release,
        async read() {
          guard(); const session = captured.current(); guard(); if (!session) return stop('LOCKED'); revision = session.revision;
          const actual = unwrap(await commit(session.sessionId, revision, [], admission.controller.signal, guard)); guard(); if (actual !== revision) return stop('CONFLICT');
          const records = unwrap(await list(session.sessionId, 'preference')); guard();
          let cursor: ClaimedCursor | null = null, hasCursor = false; const candidates: ObservedAnnouncement[] = [], ids = new Set<string>();
          for (const record of records) {
            guard(); const parsed = decode(record); guard();
            if (!parsed || ![CURSOR_FORMAT, CANDIDATE_FORMAT].includes(parsed.value.format as string) || parsed.value.scopeHash !== scopeHash) {
              if (record.id === cursorId) return stop('INTEGRITY_FAILURE'); continue; // Preserve every other consumer/future scope untouched.
            }
            if (record.schemaVersion !== 1 || parsed.value.version !== 1) return stop('UNSUPPORTED_PROFILE');
            if (parsed.value.format === CURSOR_FORMAT) {
              const row = data(parsed.value, ['format', 'version', 'scopeHash', 'binding', 'cursor']);
              if (record.id !== cursorId || hasCursor || JSON.stringify(row.binding) !== bindingText(binding)) return stop('INTEGRITY_FAILURE');
              const c = row.cursor === null ? null : data(row.cursor, ['blockNumber', 'blockHash']);
              if (c && (typeof c.blockNumber !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(c.blockNumber))) return stop('INTEGRITY_FAILURE');
              cursor = c ? Object.freeze({ blockNumber: uint(BigInt(c.blockNumber as string)), blockHash: hash(c.blockHash) }) : null;
              const canonical = { format: CURSOR_FORMAT, version: 1, scopeHash, binding, cursor: storedCursor(cursor) };
              if (JSON.stringify(canonical) !== parsed.text) return stop('INTEGRITY_FAILURE'); hasCursor = true;
            } else {
              const row = data(parsed.value, ['format', 'version', 'scopeHash', 'observed']), event = decodeStoredObserved(row.observed);
              if (record.id !== candidateIdOf(scopeHash, event) || ids.has(record.id)) return stop('INTEGRITY_FAILURE');
              if (JSON.stringify({ format: CANDIDATE_FORMAT, version: 1, scopeHash, observed: storedObserved(event) }) !== parsed.text) return stop('INTEGRITY_FAILURE');
              if (candidates.length >= MAX_CANDIDATES) return stop('CAPACITY_EXCEEDED'); ids.add(record.id); candidates.push(event);
            }
          }
          if (candidates.length && (!hasCursor || !cursor) || cursor && candidates.some(event => event.blockNumber > cursor!.blockNumber || event.blockNumber === cursor!.blockNumber && event.blockHash !== cursor!.blockHash)) return stop('INTEGRITY_FAILURE');
          // Reserve every authenticated record id, including foreign/future consumers. A deterministic
          // candidate id must never turn an unrelated preference into an overwrite target.
          const occupied = new Set(records.map(record => record.id)); guard();
          return Object.freeze({ revision, cursor, candidates: Object.freeze(candidates), existingIds: occupied });
        },
        async commit(snapshot: ComparisonSnapshot, additions: readonly ObservedAnnouncement[], cursor: ClaimedCursor) {
          guard(); if (snapshot.revision !== revision || snapshot.candidates.length + additions.length > MAX_CANDIDATES) return stop('CONFLICT');
          const mutations = additions.map(event => {
            const id = candidateIdOf(scopeHash, event); if (snapshot.existingIds.has(id)) return stop('CONFLICT');
            return { op: 'put' as const, record: { id, kind: 'preference' as const, schemaVersion: 1,
              payload: encode({ format: CANDIDATE_FORMAT, version: 1, scopeHash, observed: storedObserved(event) }) } };
          });
          mutations.push({ op: 'put', record: { id: cursorId, kind: 'preference', schemaVersion: 1,
            payload: encode({ format: CURSOR_FORMAT, version: 1, scopeHash, binding, cursor: storedCursor(cursor) }) } });
          guard(); const session = captured.current(); guard(); if (!session) return stop('LOCKED');
          const next = unwrap(await commit(session.sessionId, revision, mutations, admission.controller.signal, guard));
          if (integer(next) !== revision + 1) return stop('INTEGRITY_FAILURE'); revision = next; guard();
        },
      });
    } }); return success(facade);
  } catch (error) { lease?.dispose(); return failure(codeOf(error)); }
}
export function beginStore(input: unknown, expected: ComparisonBinding, onRevoked: () => void): StoreLease {
  if (typeof input !== 'object' || input === null) return stop('INVALID_HANDLE'); const store = stores.get(input);
  if (!store) return stop('INVALID_HANDLE'); if (bindingText(store.binding) !== bindingText(expected)) return stop('CONTEXT_MISMATCH'); return store.begin(onRevoked);
}
