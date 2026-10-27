/** G01 local messaging identity lifecycle. This service exposes no signing, decryption or spending interface. */
import { decodeBase64url, encodeBase64url, type PrivateRecordV1 } from '../../schemas/index.ts';
import type { VaultService, VaultSession, VaultSessionAuthority, VaultSessionLease, Result } from '../../schemas/index.ts';
import { decodeIdentityPayload, encodeIdentityPayload, identityPublicKey, identityRecordId, IDENTITY_PROVIDER_ID, IdentityError, parseIdentityHandle, type CreatedIdentity, type IdentityErrorCode, type IdentityHandle, type IdentityReference, type IdentityResult, type PrivateIdentityRecordV1 } from '../../schemas/index.ts';
import type { MessagingIdentityProvider } from './noble-provider.ts';

type IdentityVault = VaultService & VaultSessionAuthority;
interface Job { epoch: number; lease: VaultSessionLease; controller: AbortController; buffers: Set<Uint8Array>; kept: boolean; committed: boolean; revision?: number; reference?: IdentityReference; handle?: HandleState; }
interface HandleState { handle: IdentityHandle; session: Readonly<VaultSession>; lease: VaultSessionLease; profileId: string; recordId: string; publicKey: string; active: boolean; }
export interface IdentityServiceOptions { readonly provider?: MessagingIdentityProvider; readonly lifecycle?: boolean; }
function failure(code: IdentityErrorCode): IdentityResult<never> { return { ok: false, error: Object.freeze({ code, messageKey: `identity.error.${code.toLowerCase()}` }) }; }
function fromVault<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  const code = result.error.code;
  throw new IdentityError(code === 'LOCKED' || code === 'CANCELLED' || code === 'CONFLICT' || code === 'LIMIT_EXCEEDED' ? code : code === 'INVALID_INPUT' || code === 'NOT_FOUND' ? 'INVALID_IDENTITY' : 'STORAGE_UNAVAILABLE');
}
export class MessagingIdentityService {
  readonly #vault: IdentityVault;
  readonly #provider: MessagingIdentityProvider | undefined;
  #handles = new Map<IdentityHandle, HandleState>();
  #jobs = new Set<Job>();
  #tails = new Map<string, Promise<void>>();
  #epoch = 0; #generation = 0; #disposed = false;
  #lifecycle: boolean;
  #idleTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(vault: IdentityVault, options: IdentityServiceOptions = {}) {
    this.#vault = vault; this.#provider = options.provider;
    this.#lifecycle = options.lifecycle !== false && typeof document !== 'undefined' && typeof window !== 'undefined';
    if (this.#lifecycle) { window.addEventListener('pagehide', this.#pagehide); document.addEventListener('keydown', this.#activity, { capture: true }); document.addEventListener('pointerdown', this.#activity, { capture: true }); }
  }
  #pagehide = (): void => this.lockAll();
  #activity = (event: Event): void => { if (event.isTrusted) this.#resetIdle(true); };
  #resetIdle(trustedActivity = false): void {
    if (!this.#lifecycle) return;
    if (this.#handles.size && this.#idleTimer !== undefined && !trustedActivity) return;
    if (this.#idleTimer !== undefined) clearTimeout(this.#idleTimer);
    this.#idleTimer = this.#handles.size ? setTimeout(() => this.lockAll(), 5 * 60_000) : undefined;
  }
  #wipe(job: Job): void { for (const bytes of job.buffers) bytes.fill(0); }
  #revoke(state: HandleState): void { if (!state.active) return; state.active = false; this.#handles.delete(state.handle); state.lease.dispose(); this.#resetIdle(); }
  #guard(job: Job): Readonly<VaultSession> {
    const session = job.lease.current();
    if (this.#disposed || job.epoch !== this.#epoch || session === null) throw new IdentityError('LOCKED');
    if (job.controller.signal.aborted) throw new IdentityError('CANCELLED');
    if (job.revision !== undefined && session.revision !== job.revision) throw new IdentityError('CONFLICT');
    return session;
  }
  #protocol(): MessagingIdentityProvider { if (this.#provider?.id !== IDENTITY_PROVIDER_ID) throw new IdentityError('UNSUPPORTED_PROVIDER'); return this.#provider; }
  #random(bytes: number): string { try { return encodeBase64url(crypto.getRandomValues(new Uint8Array(bytes))); } catch { throw new IdentityError('UNSUPPORTED_PROVIDER'); } }
  #recordId(): string { try { return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''); } catch { throw new IdentityError('UNSUPPORTED_PROVIDER'); } }
  async #run<T>(session: VaultSession, signal: AbortSignal | undefined, work: (job: Job) => Promise<T>, committedFallback?: (job: Job) => T): Promise<IdentityResult<T>> {
    if (this.#disposed) return failure('LOCKED');
    let job: Job | undefined; let remove = (): void => undefined; let release = (): void => undefined; let tail: Promise<void> | undefined; let profileId: string | undefined;
    try {
      const controller = new AbortController();
      const lease = fromVault(this.#vault.captureSession(session, () => {
        controller.abort(); if (job) { this.#wipe(job); if (job.handle) this.#revoke(job.handle); }
      }));
      job = { epoch: this.#epoch, lease, controller, buffers: new Set(), kept: false, committed: false };
      const abort = (): void => { controller.abort(); if (job) this.#wipe(job); };
      signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
      remove = () => signal?.removeEventListener('abort', abort);
      profileId = this.#guard(job).profileId;
      this.#jobs.add(job);
      const previous = this.#tails.get(profileId) ?? Promise.resolve();
      tail = new Promise(resolve => { release = resolve; }); this.#tails.set(profileId, tail);
      await previous; this.#guard(job);
      const value = await work(job); this.#guard(job);
      return { ok: true, value };
    } catch (input) {
      if (job?.committed && committedFallback) return { ok: true, value: committedFallback(job) };
      if (job?.handle) this.#revoke(job.handle);
      if (job) { try { this.#guard(job); } catch (guardError) { return failure(guardError instanceof IdentityError ? guardError.code : 'LOCKED'); } }
      const code = input instanceof IdentityError ? input.code : 'STORAGE_UNAVAILABLE';
      return failure(code);
    } finally {
      if (job) { this.#wipe(job); job.buffers.clear(); this.#jobs.delete(job); if (!job.kept) job.lease.dispose(); }
      remove(); release(); if (profileId && this.#tails.get(profileId) === tail) this.#tails.delete(profileId);
    }
  }
  async #synchronize(job: Job): Promise<Readonly<VaultSession>> {
    const session = this.#guard(job);
    fromVault(await this.#vault.commit(session.sessionId, session.revision, [], job.controller.signal));
    const current = this.#guard(job); if (current.revision !== session.revision) throw new IdentityError('CONFLICT');
    // Bind all subsequent reads, derivation awaits and output publication to this
    // authenticated snapshot. A newer live session revision is not authority for it.
    job.revision = current.revision; return current;
  }
  async #load(job: Job, recordId: string): Promise<PrivateIdentityRecordV1> {
    const session = await this.#synchronize(job);
    const record = fromVault(await this.#vault.read(session.sessionId, recordId));
    const current = this.#guard(job); if (current.revision !== session.revision) throw new IdentityError('CONFLICT');
    if (record === null || record.kind !== 'identity' || record.schemaVersion !== 1) throw new IdentityError();
    const identity = decodeIdentityPayload(record.payload);
    if (identity.profileId !== session.profileId || identity.identityRecordId !== recordId) throw new IdentityError();
    return identity;
  }
  #select(job: Job, recordId: string, publicKey: string): IdentityHandle {
    const session = this.#guard(job);
    if (this.#generation >= Number.MAX_SAFE_INTEGER - 1) throw new IdentityError('LIMIT_EXCEEDED');
    const handle = Object.freeze({ id: this.#random(32), generation: ++this.#generation, purpose: 'messaging' as const });
    for (const state of this.#handles.values()) if (state.profileId === session.profileId) this.#revoke(state);
    const state: HandleState = { handle, session, lease: job.lease, profileId: session.profileId, recordId, publicKey, active: true };
    this.#handles.set(handle, state); job.handle = state; job.kept = true; this.#resetIdle(); return handle;
  }
  #state(handle: IdentityHandle): HandleState {
    parseIdentityHandle(handle);
    const state = this.#handles.get(handle);
    if (this.#disposed || !state?.active || state.lease.current() === null) throw new IdentityError('LOCKED');
    return state;
  }
  async create(session: VaultSession, signal?: AbortSignal): Promise<IdentityResult<CreatedIdentity>> {
    return this.#run<CreatedIdentity>(session, signal, async job => {
      const provider = this.#protocol(); const current = await this.#synchronize(job);
      const records = fromVault(await this.#vault.list(current.sessionId, 'identity'));
      if (this.#guard(job).revision !== current.revision) throw new IdentityError('CONFLICT');
      for (const record of records) {
        if (record.schemaVersion !== 1) throw new IdentityError();
        const parsed = decodeIdentityPayload(record.payload);
        if (parsed.profileId !== current.profileId || parsed.identityRecordId !== record.id) throw new IdentityError();
        if (parsed.state === 'active') throw new IdentityError('CONFLICT');
      }
      const pair = await provider.generate();
      if (pair.secretKey instanceof Uint8Array) job.buffers.add(pair.secretKey);
      this.#guard(job);
      if (!(pair.secretKey instanceof Uint8Array) || pair.secretKey.byteLength !== 32) throw new IdentityError();
      const publicKey = identityPublicKey(await provider.publicKey(pair.secretKey)); this.#guard(job);
      if (publicKey !== pair.publicKey) throw new IdentityError();
      const recordId = this.#recordId();
      const collision = fromVault(await this.#vault.read(current.sessionId, recordId)); this.#guard(job);
      if (collision !== null || this.#guard(job).revision !== current.revision) throw new IdentityError('CONFLICT');
      const payload = encodeIdentityPayload({ format: 'p2p-offramp-messaging-identity', version: 1, profileId: current.profileId, identityRecordId: recordId, purpose: 'messaging', providerId: IDENTITY_PROVIDER_ID, publicKey, secretKey: encodeBase64url(pair.secretKey), state: 'active' });
      if (this.#guard(job).revision !== current.revision) throw new IdentityError('CONFLICT');
      const revision = fromVault(await this.#vault.commit(current.sessionId, current.revision, [{ op: 'put', record: { id: recordId, kind: 'identity', schemaVersion: 1, payload } }], job.controller.signal));
      job.committed = true; job.revision = revision; job.reference = Object.freeze({ profileId: current.profileId, identityRecordId: recordId });
      this.#guard(job);
      return Object.freeze({ ...job.reference, state: 'unlocked' as const, handle: this.#select(job, recordId, publicKey) });
    }, job => { if (job.handle) this.#revoke(job.handle); return Object.freeze({ ...job.reference!, state: 'locked', handle: null }); });
  }
  async unlock(session: VaultSession, identityRecord: string, signal?: AbortSignal): Promise<IdentityResult<IdentityHandle>> {
    return this.#run(session, signal, async job => {
      const provider = this.#protocol(); const recordId = identityRecordId(identityRecord); const record = await this.#load(job, recordId);
      if (record.state !== 'active') throw new IdentityError();
      const secret = decodeBase64url(record.secretKey, 32, 32); job.buffers.add(secret);
      const publicKey = identityPublicKey(await provider.publicKey(secret)); this.#guard(job);
      if (publicKey !== record.publicKey) throw new IdentityError();
      return this.#select(job, recordId, publicKey);
    });
  }
  async publicIdentity(handle: IdentityHandle): Promise<IdentityResult<string>> {
    let state: HandleState;
    try { state = this.#state(handle); } catch (error) { return failure(error instanceof IdentityError ? error.code : 'INVALID_IDENTITY'); }
    return this.#run(state.session, undefined, async job => {
      const identity = await this.#load(job, state.recordId); this.#state(handle); this.#guard(job);
      if (identity.state !== 'active' || identity.publicKey !== state.publicKey) throw new IdentityError();
      return state.publicKey;
    });
  }
  async retire(handle: IdentityHandle): Promise<IdentityResult<void>> {
    let state: HandleState;
    try { state = this.#state(handle); } catch (error) { return failure(error instanceof IdentityError ? error.code : 'INVALID_IDENTITY'); }
    return this.#run(state.session, undefined, async job => {
      const record = await this.#load(job, state.recordId); this.#state(handle);
      if (record.state !== 'active' || record.publicKey !== state.publicKey) throw new IdentityError();
      const current = this.#guard(job);
      const replacement: PrivateRecordV1 = { id: state.recordId, kind: 'identity', schemaVersion: 1, payload: encodeIdentityPayload({ ...record, state: 'retired' }) };
      const revision = fromVault(await this.#vault.commit(current.sessionId, current.revision, [{ op: 'put', record: replacement }], job.controller.signal));
      job.committed = true; job.revision = revision;
      for (const entry of this.#handles.values()) if (entry.profileId === state.profileId && entry.recordId === state.recordId) this.#revoke(entry);
    }, () => undefined);
  }
  lockAll(): void {
    this.#epoch++;
    for (const job of this.#jobs) { job.controller.abort(); this.#wipe(job); job.lease.dispose(); }
    for (const state of this.#handles.values()) this.#revoke(state);
    this.#resetIdle();
  }
  dispose(): void {
    if (this.#disposed) return; this.#disposed = true; this.lockAll();
    if (this.#lifecycle) { window.removeEventListener('pagehide', this.#pagehide); document.removeEventListener('keydown', this.#activity, { capture: true }); document.removeEventListener('pointerdown', this.#activity, { capture: true }); }
  }
}
