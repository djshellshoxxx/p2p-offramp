/** Actual G02 encrypted preference consumer; no deletion, wallet or network capability. */
import { decodeBase64url, encodeBase64url, parseStrictJsonBytes, type PrivateRecordV1, type VaultService, type VaultSession,
  type VaultSessionAuthority, type VaultSessionLease } from '../../schemas/index.ts';
import { data, integer, MAX_LOCAL_BYTES, stop, unwrap, type LocalJob } from './shared.ts';
export type LocalVault = Pick<VaultService, 'create' | 'unlock' | 'commit' | 'list' | 'lock' | 'lockAll'> & VaultSessionAuthority;
export interface StoredLocal { readonly revision: number; readonly row: PrivateRecordV1 | null; readonly value: unknown; }
export interface LocalWrite { readonly recordId: string; readonly revision: number; readonly persisted: true; readonly sessionCurrent: boolean; }
export class Preferences {
  private lease: VaultSessionLease | undefined;
  private readonly vault: LocalVault;
  constructor(vault: LocalVault, session: VaultSession, onRevoked: () => void) { this.vault = vault; this.lease = unwrap(vault.captureSession(session, onRevoked)); }
  current(): Readonly<VaultSession> | null {
    const lease = this.lease; if (!lease) return null;
    try { const current = lease.current(); return this.lease === lease ? current : null; }
    catch { this.dispose(); return null; }
  }
  dispose(): void {
    const lease = this.lease; this.lease = undefined;
    try { lease?.dispose(); } catch { /* Local ownership is already revoked; every later cleanup must still run. */ }
  }
  pin(job: LocalJob, revision: number): void {
    job.setRevisionGuard(() => { const s = this.current(); if (!s) return stop('LOCKED'); if (s.revision !== revision) return stop('CONFLICT'); });
  }
  async refresh(revision: number, job: LocalJob): Promise<void> {
    job.guard(); const s = this.current(); job.guard(); if (!s) return stop('LOCKED');
    if (s.revision !== revision) return stop('CONFLICT');
    const actual = unwrap(await this.vault.commit(s.sessionId, revision, [], job.signal, job.guard));
    if (actual !== revision) return stop('CONFLICT'); this.pin(job, revision); job.guard();
  }
  async read(id: string, job: LocalJob): Promise<StoredLocal> {
    job.guard(); const s = this.current(); job.guard(); if (!s) return stop('LOCKED');
    const revision = s.revision; await this.refresh(revision, job); job.guard();
    const rows = unwrap(await this.vault.list(s.sessionId)); job.guard();
    const row = rows.find(r => r.id === id) ?? null;
    if (!row) return Object.freeze({ revision, row: null, value: null });
    if (row.kind !== 'preference' || row.schemaVersion !== 1) return stop('INTEGRITY_FAILURE');
    const bytes = decodeBase64url(row.payload, 1, MAX_LOCAL_BYTES);
    try { const value = parseStrictJsonBytes(bytes, MAX_LOCAL_BYTES); job.guard(); return Object.freeze({ revision, row: Object.freeze({ ...row }), value }); }
    finally { bytes.fill(0); }
  }
  async put(id: string, expectedRevision: number, value: unknown, job: LocalJob): Promise<LocalWrite> {
    job.guard(); const s = this.current(); job.guard(); if (!s) return stop('LOCKED');
    if (s.revision !== expectedRevision) return stop('CONFLICT');
    const bytes = new TextEncoder().encode(JSON.stringify(value)); let payload: string;
    try { if (bytes.length > MAX_LOCAL_BYTES) return stop('LIMIT_EXCEEDED'); payload = encodeBase64url(bytes); } finally { bytes.fill(0); }
    job.guard(); const next = unwrap(await this.vault.commit(s.sessionId, expectedRevision, [{ op: 'put', record: { id, kind: 'preference', schemaVersion: 1, payload } }], job.signal, job.guard));
    if (integer(next) !== expectedRevision + 1) return stop('INTEGRITY_FAILURE');
    job.durable(); // Native durable result is discoverable after cancellation/lock; do not mask it.
    this.pin(job, next);
    let sessionCurrent = false;
    try { job.guard(); sessionCurrent = this.current() !== null; job.guard(); } catch { sessionCurrent = false; /* Persisted receipt survives local scope retirement. */ }
    return Object.freeze({ recordId: id, revision: next, persisted: true, sessionCurrent });
  }
}
export function requireVault(input: unknown): LocalVault {
  if (typeof input !== 'object' || input === null) return stop();
  const vault = input as LocalVault;
  for (const key of ['create', 'unlock', 'commit', 'list', 'lock', 'lockAll', 'captureSession'] as const) if (typeof vault[key] !== 'function') return stop();
  return vault;
}
export function consentOf(input: unknown): Readonly<{ explainedLimits: true; explicit: true }> {
  const d = data(input, ['explainedLimits', 'explicit']); if (d.explainedLimits !== true || d.explicit !== true) return stop('UNAUTHORIZED');
  return Object.freeze({ explainedLimits: true, explicit: true });
}
