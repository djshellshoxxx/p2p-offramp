/** MEET01/03 optional local consumer. No sensor, transport, proof, spending or publication surface. */
import type { Mutation, PrivateRecordV1, Result, VaultService, VaultSession, VaultSessionAuthority, VaultSessionLease } from '../../schemas/index.ts';
import { readConsent, type LocationConsent, type ConsentScope } from './consent.ts';
import { assessClaim, parseClaim, type LocationClaim } from './location-claim.ts';
import { blurMarker } from './blur.ts';
import type { BlurredMarker } from './geohash.ts';
import { DAY_MS, EPOCH_MS, bool, checkSignal, codeOf, data, failure, hex, integer, randomId, stop, success, webCryptoFill,
  type MeetupErrorCode, type MeetupResult, type RandomFill } from './shared.ts';
import { decodeLedger, decodeMarkerRecord, LEDGER_RECORD_ID, MARKER_RECORD_ID, MAX_BUDGET_ENTRIES, MAX_LIFETIME_TRADES, payloadOf,
  type BudgetEntry, type Ledger, type MarkerRecord } from './budget-record.ts';
export { LEDGER_RECORD_ID, MARKER_RECORD_ID, MAX_BUDGET_ENTRIES, MAX_LIFETIME_TRADES } from './budget-record.ts';
export const BUDGET_LOCK_NAME = 'p2p-offramp/location-disclosure-budget/v1';
export const BUDGET_OPERATION_MS = 5000;
export const DISTANCE_THRESHOLD_CM = 5000;
type BudgetVault = Pick<VaultService, 'read' | 'list' | 'commit'> & VaultSessionAuthority;
export interface ExclusiveBudgetLock { readonly isCurrent: () => boolean; }
export interface OriginBudgetCoordinator {
  /** Trusted composition designates exactly one persistent ledger profile for this origin. */
  isLedgerProfile(profileId: string): boolean;
  /** Native exclusive cross-tab lock. Absent/unavailable coordination refuses; never fall back to local-only locking. */
  withExclusive<T>(name: typeof BUDGET_LOCK_NAME, signal: AbortSignal, work: (lock: ExclusiveBudgetLock) => Promise<T>): Promise<T>;
  /** Separate fresh-install capability, never a reset: additionally requires an empty revision-zero G02 profile. */
  mayProvisionFresh(profileId: string): boolean;
}
export interface DisclosureBudgetOptions {
  readonly vault: BudgetVault; readonly session: VaultSession; readonly coordinator: OriginBudgetCoordinator;
  readonly isOwnerCurrent: () => boolean; readonly isUserGesture: () => boolean;
  readonly wallNowMs?: () => number; readonly monotonicNowMs?: () => number; readonly randomFill?: RandomFill;
}
/** Opaque local work reservation, never a send permit, proof result or network authority. */
export interface DisclosureReservation {
  readonly id: string; readonly kind: 'distance'; readonly epoch: string; readonly tradeHash: string;
  readonly state: 'reserved' | 'consumed'; readonly createdAtMs: number; readonly cachedResult: boolean | null; readonly reused: boolean;
}
export interface BudgetCounts { readonly regionsHour: number; readonly regionsDay: number; readonly distanceDay: number; readonly trackedTrades: number; }
export interface DisclosureBudget {
  provisionFreshLedger(signal?: AbortSignal): Promise<MeetupResult<void>>;
  marker(consent: LocationConsent, claim: unknown, options?: Readonly<{ newEpoch: boolean }>, signal?: AbortSignal): Promise<MeetupResult<BlurredMarker>>;
  reserveDistance(consent: LocationConsent, challengeDigest: string, signal?: AbortSignal): Promise<MeetupResult<DisclosureReservation>>;
  consume(reservation: DisclosureReservation, answer: boolean, signal?: AbortSignal): Promise<MeetupResult<DisclosureReservation>>;
  cancelBeforeSend(reservation: DisclosureReservation, signal?: AbortSignal): Promise<MeetupResult<void>>;
  clearCachedMarker(signal?: AbortSignal): Promise<MeetupResult<void>>;
  inspect(signal?: AbortSignal): Promise<MeetupResult<BudgetCounts>>;
  close(): void;
}
interface Job {
  readonly controller: AbortController; readonly buffers: readonly Uint8Array[]; readonly consent: LocationConsent | undefined;
  startedMono: number; revision: number; lastWall: number; lock: ExclusiveBudgetLock | undefined;
}
interface Handle {
  readonly consent: LocationConsent; readonly id: string; readonly epoch: string; readonly tradeHash: string;
  readonly challengeId: string; readonly createdAtMs: number; readonly mayComplete: boolean;
}
function vaultValue<T>(input: Result<T>): T {
  if (input.ok) return input.value;
  const code = input.error.code;
  return stop(code === 'LOCKED' || code === 'CANCELLED' || code === 'CONFLICT' ? code : 'LEDGER_UNAVAILABLE');
}
function record(input: unknown, id: string): PrivateRecordV1 {
  const raw = data(input, ['id', 'kind', 'schemaVersion', 'payload']);
  if (raw.id !== id || raw.kind !== 'preference' || typeof raw.payload !== 'string') return stop('INTEGRITY_FAILURE');
  if (raw.schemaVersion !== 1) return stop('UNSUPPORTED_VERSION');
  return { id, kind: 'preference', schemaVersion: 1, payload: raw.payload };
}
function counts(ledger: Ledger, now: number): BudgetCounts {
  const active = ledger.entries.filter(entry => entry.state !== 'cancelled');
  return Object.freeze({ regionsHour: active.filter(entry => entry.kind === 'region' && entry.createdAtMs > now - 3_600_000).length,
    regionsDay: active.filter(entry => entry.kind === 'region' && entry.createdAtMs > now - DAY_MS).length,
    distanceDay: active.filter(entry => entry.kind === 'distance' && entry.createdAtMs > now - DAY_MS).length,
    trackedTrades: ledger.trades.length });
}
function ownedClaim(input: unknown): Float64Array<ArrayBuffer> {
  const claim = parseClaim(input);
  return Float64Array.from([claim.lat, claim.lon, claim.accuracyM, claim.sampledAtMs, claim.receivedMonotonicMs, claim.provenance === 'manual' ? 1 : 0, claim.consentGeneration]);
}
function restoredClaim(memory: Float64Array): LocationClaim {
  return { v: 1, lat: memory[0]!, lon: memory[1]!, accuracyM: memory[2]!, sampledAtMs: memory[3]!, receivedMonotonicMs: memory[4]!,
    provenance: memory[5] === 1 ? 'manual' : 'browser-reported', consentGeneration: memory[6]! };
}
export function createDisclosureBudget(options: DisclosureBudgetOptions): MeetupResult<DisclosureBudget> {
  let lease: VaultSessionLease | undefined;
  try {
    const raw = data(options, ['vault', 'session', 'coordinator', 'isOwnerCurrent', 'isUserGesture'], ['wallNowMs', 'monotonicNowMs', 'randomFill']);
    const vault = raw.vault as BudgetVault, coordinator = raw.coordinator as OriginBudgetCoordinator;
    if (!vault || !coordinator || typeof vault.captureSession !== 'function' || typeof vault.read !== 'function' || typeof vault.list !== 'function' || typeof vault.commit !== 'function' ||
      typeof coordinator.isLedgerProfile !== 'function' || typeof coordinator.withExclusive !== 'function' || typeof coordinator.mayProvisionFresh !== 'function' ||
      typeof raw.isOwnerCurrent !== 'function' || typeof raw.isUserGesture !== 'function') return failure('INVALID_INPUT');
    for (const name of ['wallNowMs', 'monotonicNowMs', 'randomFill']) if (raw[name] !== undefined && typeof raw[name] !== 'function') return failure('INVALID_INPUT');
    const wall = raw.wallNowMs as (() => number) | undefined ?? Date.now;
    const mono = raw.monotonicNowMs as (() => number) | undefined ?? (() => Math.floor(performance.now()));
    const fill = raw.randomFill as RandomFill | undefined ?? webCryptoFill;
    const owner = raw.isOwnerCurrent as () => boolean, gesture = raw.isUserGesture as () => boolean;
    const isProfile = coordinator.isLedgerProfile.bind(coordinator), exclusive = coordinator.withExclusive.bind(coordinator), mayProvision = coordinator.mayProvisionFresh.bind(coordinator);
    const read = vault.read.bind(vault), list = vault.list.bind(vault), commit = vault.commit.bind(vault);
    let closed = false, active: Job | undefined;
    const handles = new WeakMap<object, Handle>(), ownedReservations = new Set<string>();
    function close(): void { if (!closed) { closed = true; active?.buffers.forEach(buffer => buffer.fill(0)); active?.controller.abort(); lease?.dispose(); ownedReservations.clear(); } }
    lease = vaultValue(vault.captureSession(raw.session as VaultSession, close)); const captured = lease;
    function guard(job: Job, requireLock = true): Readonly<VaultSession> {
      const session = captured.current(); if (closed || !session) return stop('LOCKED');
      checkSignal(job.controller.signal);
      let current = false; try { current = owner() === true && isProfile(session.profileId) === true && (!requireLock || job.lock?.isCurrent() === true); } catch { /* Fixed refusal. */ }
      if (!current || closed || !captured.current()) return stop('LEDGER_UNAVAILABLE');
      if (job.consent) readConsent(job.consent, 'shareCoarse');
      if (session.revision !== job.revision) return stop('CONFLICT');
      const wallTime = integer(wall()); if (wallTime < job.lastWall) return stop('CLOCK_ROLLBACK'); job.lastWall = wallTime;
      const currentMono = integer(mono()); if (currentMono < job.startedMono) return stop('CLOCK_ROLLBACK');
      if (currentMono - job.startedMono >= BUDGET_OPERATION_MS) return stop('TIMEOUT');
      checkSignal(job.controller.signal);
      if (closed || !captured.current()) return stop('LOCKED');
      return session;
    }
    async function run<T>(consent: LocationConsent | undefined, signal: AbortSignal | undefined, buffers: readonly Uint8Array[], work: (job: Job) => Promise<T>, validateOutput?: (value: T) => void): Promise<MeetupResult<T>> {
      const wipe = () => buffers.forEach(buffer => buffer.fill(0));
      // Own buffers and cancellation synchronously, before lease, consent or clock callbacks can revoke/reenter.
      if (active) { wipe(); return failure('CONFLICT'); }
      if (closed) { wipe(); return failure('LOCKED'); }
      const job: Job = { controller: new AbortController(), buffers, consent, startedMono: 0, revision: 0, lastWall: 0, lock: undefined };
      active = job; let physicalStarted = false;
      const admitted = (): void => {
        if (closed || active !== job) return stop('LOCKED');
        checkSignal(job.controller.signal); checkSignal(signal);
      };
      try {
        admitted(); const first = captured.current(); admitted(); if (!first) return stop('LOCKED');
        const initialConsent = consent ? readConsent(consent, 'shareCoarse') : undefined;
        admitted(); const session = captured.current(); admitted(); if (!session) return stop('LOCKED');
        job.startedMono = integer(mono()); admitted(); job.lastWall = integer(wall()); admitted(); job.revision = session.revision;
        let reason: MeetupErrorCode = 'CANCELLED', finishAbort!: () => void;
        const aborted = new Promise<MeetupResult<T>>(resolve => { finishAbort = () => { wipe(); resolve(failure(closed ? 'LOCKED' : reason)); }; });
        const onExternal = () => { reason = 'CANCELLED'; job.controller.abort(); };
        const onConsent = () => { reason = 'CONSENT_REVOKED'; job.controller.abort(); };
        const onTimeout = () => { reason = 'TIMEOUT'; job.controller.abort(); };
        job.controller.signal.addEventListener('abort', finishAbort, { once: true });
        signal?.addEventListener('abort', onExternal, { once: true }); initialConsent?.signal.addEventListener('abort', onConsent, { once: true });
        if (signal?.aborted) onExternal(); if (initialConsent?.signal.aborted) onConsent();
        const timer = setTimeout(onTimeout, BUDGET_OPERATION_MS); let entered = false, completed = false, output: T;
        const physical = Promise.resolve().then(() => {
          guard(job, false);
          return exclusive(BUDGET_LOCK_NAME, job.controller.signal, async lock => {
          if (entered) return stop('INTEGRITY_FAILURE'); entered = true; job.lock = lock; guard(job);
          const value = await work(job); guard(job); output = value; completed = true; return value;
          });
        }).then(() => {
          if (!entered || !completed) return stop('LEDGER_UNAVAILABLE');
          guard(job, false); validateOutput?.(output); guard(job, false); return success(output);
        })
          .catch(error => failure<T>(codeOf(error, 'LEDGER_UNAVAILABLE'))).finally(() => {
            wipe(); clearTimeout(timer); signal?.removeEventListener('abort', onExternal); initialConsent?.signal.removeEventListener('abort', onConsent);
            job.controller.signal.removeEventListener('abort', finishAbort); if (active === job) active = undefined;
          });
        physicalStarted = true;
        // Cancellation resolves promptly, but ignored native work retains the one physical slot until it drains.
        return await Promise.race([physical, aborted]);
      } catch (error) { wipe(); return failure(codeOf(error)); }
      finally { if (!physicalStarted && active === job) active = undefined; }
    }
    async function synchronize(job: Job): Promise<void> {
      const session = guard(job), revision = vaultValue(await commit(session.sessionId, job.revision, [], job.controller.signal, () => { guard(job); }));
      guard(job); if (revision !== job.revision) return stop('CONFLICT');
    }
    async function readRecords(job: Job): Promise<{ ledger: Ledger; marker: MarkerRecord | null; now: number }> {
      await synchronize(job); guard(job); const session = guard(job);
      const stored = vaultValue(await read(session.sessionId, LEDGER_RECORD_ID)); guard(job);
      if (stored === null) return stop('LEDGER_UNAVAILABLE');
      let ledger: Ledger;
      try { ledger = decodeLedger(record(stored, LEDGER_RECORD_ID).payload); }
      catch (error) { return stop(codeOf(error) === 'UNSUPPORTED_VERSION' ? 'UNSUPPORTED_VERSION' : 'LEDGER_UNAVAILABLE'); }
      const now = integer(wall()); if (now < ledger.lastNowMs) return stop('CLOCK_ROLLBACK');
      const markerRaw = vaultValue(await read(session.sessionId, MARKER_RECORD_ID)); guard(job);
      let marker: MarkerRecord | null = null;
      if (markerRaw !== null) try { marker = decodeMarkerRecord(record(markerRaw, MARKER_RECORD_ID).payload); }
      catch (error) { return stop(codeOf(error) === 'UNSUPPORTED_VERSION' ? 'UNSUPPORTED_VERSION' : 'LEDGER_UNAVAILABLE'); }
      ledger.entries = ledger.entries.filter(entry => entry.createdAtMs > now - DAY_MS - EPOCH_MS);
      const liveIds = new Set(ledger.entries.map(entry => entry.id));
      for (const id of ownedReservations) if (!liveIds.has(id)) ownedReservations.delete(id);
      // A persisted reservation not owned by this live instance has an uncertain disclosure outcome.
      for (const entry of ledger.entries) if (entry.state === 'reserved' && !ownedReservations.has(entry.id)) entry.state = 'consumed';
      return { ledger, marker, now };
    }
    async function write(job: Job, ledger: Ledger, marker?: MarkerRecord | 'delete'): Promise<void> {
      const now = integer(wall()); if (now < ledger.lastNowMs) return stop('CLOCK_ROLLBACK'); ledger.lastNowMs = now;
      const mutations: Mutation[] = [{ op: 'put', record: { id: LEDGER_RECORD_ID, kind: 'preference', schemaVersion: 1, payload: payloadOf(ledger) } }];
      if (marker === 'delete') mutations.push({ op: 'delete', id: MARKER_RECORD_ID });
      else if (marker) mutations.push({ op: 'put', record: { id: MARKER_RECORD_ID, kind: 'preference', schemaVersion: 1, payload: payloadOf(marker) } });
      const session = guard(job), revision = vaultValue(await commit(session.sessionId, job.revision, mutations, job.controller.signal, () => { guard(job); }));
      if (!Number.isSafeInteger(revision) || revision !== job.revision + 1) return stop('INTEGRITY_FAILURE'); job.revision = revision; guard(job);
    }
    function idFor(ledger: Ledger): string {
      const id = randomId(fill); if (ledger.entries.some(entry => entry.id === id)) return stop('RNG_UNAVAILABLE'); return id;
    }
    function view(entry: BudgetEntry, consent: LocationConsent, reused: boolean, mayComplete: boolean): DisclosureReservation {
      if (entry.kind !== 'distance' || entry.tradeHash === null || entry.challengeId === null || entry.state === 'cancelled') return stop('CONFLICT');
      const handle = Object.freeze({ id: entry.id, kind: 'distance' as const, epoch: entry.epoch, tradeHash: entry.tradeHash,
        state: entry.state, createdAtMs: entry.createdAtMs, cachedResult: entry.cachedResult, reused });
      handles.set(handle, { consent, id: entry.id, epoch: entry.epoch, tradeHash: entry.tradeHash, challengeId: entry.challengeId,
        createdAtMs: entry.createdAtMs, mayComplete }); return handle;
    }
    function boundEntry(entry: BudgetEntry | undefined, handle: Handle): BudgetEntry {
      const scope = readConsent(handle.consent, 'shareCoarse');
      if (!entry || entry.kind !== 'distance' || entry.epoch !== handle.epoch || entry.tradeHash !== handle.tradeHash ||
        entry.tradeHash !== scope.tradeHash || entry.challengeId !== handle.challengeId || entry.createdAtMs !== handle.createdAtMs) return stop('INTEGRITY_FAILURE');
      return entry;
    }
    const facade: DisclosureBudget = {
      provisionFreshLedger(signal) {
        let confirmed = false; try { confirmed = gesture() === true; } catch { /* No authority from imported booleans. */ }
        if (!confirmed) return Promise.resolve(failure('CONSENT_REVOKED'));
        return run(undefined, signal, [], async job => {
          await synchronize(job); const session = guard(job);
          if (job.revision !== 0 || mayProvision(session.profileId) !== true) return stop('LEDGER_UNAVAILABLE');
          const records = vaultValue(await list(session.sessionId)); guard(job);
          if (records.length !== 0) return stop('LEDGER_UNAVAILABLE');
          await write(job, { format: 'p2p-offramp-location-budget', version: 1, lastNowMs: integer(wall()), entries: [], trades: [] });
        });
      },
      marker(consent, input, options, signal) {
        let memory: Float64Array<ArrayBuffer> | undefined, fresh = false;
        try {
          memory = ownedClaim(input); if (options !== undefined) fresh = bool(data(options, ['newEpoch']).newEpoch);
          if (fresh && gesture() !== true) { memory.fill(0); return Promise.resolve(failure('CONSENT_REVOKED')); }
        } catch (error) { memory?.fill(0); return Promise.resolve(failure(codeOf(error))); }
        const claimMemory = memory;
        const owned = new Uint8Array(memory.buffer);
        return run(consent, signal, [owned], async job => {
          const scope = readConsent(consent, 'shareCoarse'), stored = await readRecords(job); guard(job);
          const { ledger, now } = stored;
          if (stored.marker && !fresh && stored.marker.marker.expiresAtMs > now) {
            const cached = stored.marker.marker, entry = ledger.entries.find(item => item.id === cached.epoch && item.kind === 'region' && item.state === 'consumed');
            if (!entry || cached.expiresAtMs > entry.createdAtMs + EPOCH_MS) return stop('LEDGER_UNAVAILABLE');
            if (cached.radiusM !== scope.radiusM) return stop('CONFLICT');
            return cached;
          }
          // A live epoch with no authenticated cached output is not permission to sample new noise after restart/deletion.
          if (!fresh && ledger.entries.some(entry => entry.kind === 'region' && entry.state !== 'cancelled' && entry.createdAtMs + EPOCH_MS > now)) return stop('LEDGER_UNAVAILABLE');
          const usage = counts(ledger, now); if (usage.regionsHour >= 4 || usage.regionsDay >= 12) return stop('EXHAUSTED');
          if (ledger.entries.length >= MAX_BUDGET_ENTRIES) return stop('CAPACITY_EXCEEDED');
          if (claimMemory[6] !== scope.generation) return stop('STALE_GENERATION');
          if (claimMemory[5] === 0) readConsent(consent, 'collect');
          const assessment = assessClaim(restoredClaim(claimMemory), now, integer(mono()), scope.generation);
          if (!assessment.ok || assessment.value.status === 'rejected') return stop('INVALID_INPUT');
          const id = idFor(ledger), entry: BudgetEntry = { id, kind: 'region', epoch: id, tradeHash: null, challengeId: null, state: 'reserved', createdAtMs: now, cachedResult: null };
          ledger.entries.push(entry); ownedReservations.add(id); await write(job, ledger); guard(job);
          const freshAssessment = assessClaim(restoredClaim(claimMemory), integer(wall()), integer(mono()), scope.generation);
          if (!freshAssessment.ok || freshAssessment.value.status === 'rejected') return stop('INVALID_INPUT');
          // No caller input/randomness is persisted; raw owned bytes are erased before the marker write awaits storage.
          const marker = blurMarker(restoredClaim(claimMemory), scope.radiusM, id, now, Math.min(scope.expiresAtMs, now + EPOCH_MS), fill); owned.fill(0);
          readConsent(consent, 'shareCoarse'); entry.state = 'consumed';
          await write(job, ledger, { format: 'p2p-offramp-sticky-marker', version: 1, consentGeneration: scope.generation, marker }); guard(job);
          const completedAt = integer(wall()); if (marker.expiresAtMs <= completedAt) return stop('EXPIRED');
          return marker;
        }, marker => { if (marker.expiresAtMs <= integer(wall())) return stop('EXPIRED'); });
      },
      reserveDistance(consent, challengeDigest, signal) {
        let challengeId: string;
        try { challengeId = hex(challengeDigest, 64); } catch (error) { return Promise.resolve(failure(codeOf(error))); }
        return run(consent, signal, [], async job => {
          const scope = readConsent(consent, 'shareCoarse'), { ledger, now } = await readRecords(job); guard(job);
          const prior = ledger.entries.find(entry => entry.tradeHash === scope.tradeHash && entry.challengeId === challengeId);
          if (prior) {
            if (prior.state === 'cancelled') return stop('CONFLICT');
            await write(job, ledger); return view(prior, consent, true, ownedReservations.has(prior.id));
          }
          const usage = counts(ledger, now), trade = ledger.trades.find(item => item.tradeHash === scope.tradeHash);
          if (usage.distanceDay >= 12 || (trade?.count ?? 0) >= 3) return stop('EXHAUSTED');
          if (ledger.entries.length >= MAX_BUDGET_ENTRIES || !trade && ledger.trades.length >= MAX_LIFETIME_TRADES) return stop('CAPACITY_EXCEEDED');
          const id = idFor(ledger), entry: BudgetEntry = { id, kind: 'distance', epoch: id, tradeHash: scope.tradeHash, challengeId,
            state: 'reserved', createdAtMs: now, cachedResult: null };
          ledger.entries.push(entry); if (trade) trade.count++; else ledger.trades.push({ tradeHash: scope.tradeHash, count: 1 });
          ownedReservations.add(id); await write(job, ledger); return view(entry, consent, false, true);
        });
      },
      consume(reservation, answer, signal) {
        let handle: Handle;
        try { if (typeof reservation !== 'object' || reservation === null || !handles.has(reservation)) return Promise.resolve(failure('CONFLICT'));
          handle = handles.get(reservation)!; bool(answer); } catch (error) { return Promise.resolve(failure(codeOf(error))); }
        return run(handle.consent, signal, [], async job => {
          const { ledger } = await readRecords(job); guard(job); const entry = boundEntry(ledger.entries.find(item => item.id === handle.id), handle);
          if (entry.state === 'cancelled' || !handle.mayComplete && entry.cachedResult === null) return stop('LEDGER_UNAVAILABLE');
          if (entry.cachedResult !== null && entry.cachedResult !== answer) return stop('CONFLICT');
          entry.state = 'consumed'; entry.cachedResult = answer; await write(job, ledger);
          return view(entry, handle.consent, true, handle.mayComplete);
        });
      },
      cancelBeforeSend(reservation, signal) {
        const handle = typeof reservation === 'object' && reservation !== null ? handles.get(reservation) : undefined;
        if (!handle?.mayComplete) return Promise.resolve(failure('CONFLICT'));
        return run(handle.consent, signal, [], async job => {
          const { ledger } = await readRecords(job); guard(job); const entry = boundEntry(ledger.entries.find(item => item.id === handle.id), handle);
          if (!ownedReservations.has(entry.id)) return stop('CONFLICT');
          if (entry.state === 'cancelled') return;
          if (entry.state !== 'reserved') return stop('CONFLICT');
          const trade = ledger.trades.find(item => item.tradeHash === entry.tradeHash); if (!trade || trade.count <= 0) return stop('INTEGRITY_FAILURE');
          entry.state = 'cancelled'; trade.count--; await write(job, ledger);
        });
      },
      clearCachedMarker(signal) {
        let confirmed = false; try { confirmed = gesture() === true; } catch { /* Refuse. */ }
        if (!confirmed) return Promise.resolve(failure('CONSENT_REVOKED'));
        return run(undefined, signal, [], async job => { const { ledger } = await readRecords(job); await write(job, ledger, 'delete'); });
      },
      inspect(signal) { return run(undefined, signal, [], async job => { const { ledger, now } = await readRecords(job); return counts(ledger, now); }); },
      close,
    };
    return success(Object.freeze(facade));
  } catch (error) { lease?.dispose(); return failure(codeOf(error)); }
}
