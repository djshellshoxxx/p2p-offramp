/** LOCAL EVM plan/reminder only. No transfer, authorization, journal or wallet API. */
import type { CoreResult, VaultSession } from '../../schemas/index.ts';
import { Preferences, consentOf, requireVault, type LocalVault, type LocalWrite } from './preferences.ts';
import { codeOf, data, failed, hex, integer, list, LocalGate, ok, stop, text, type LocalJob } from './shared.ts';
const PLAN_FORMAT = 'p2p-offramp-local-sweep-plan', FORMAT = 'p2p-offramp-local-sweep-reminder', RECORD_ID = '59e00000000000000000000000000001';
const U256 = (1n << 256n) - 1n;
function amount(input: unknown, positive = false): string {
  if (typeof input !== 'string' || input.length > 78 || !/^(0|[1-9][0-9]*)$/.test(input)) return stop();
  const n = BigInt(input); if (n > U256 || positive && n === 0n) return stop(); return input;
}
function address(input: unknown): string { if (typeof input !== 'string' || !/^0x[0-9a-f]{40}$/.test(input) || /^0x0{40}$/.test(input)) return stop(); return input; }
export interface SweepAsset { readonly id: string; readonly amountCap: string; }
export interface LocalSweepPlan {
  readonly format: typeof PLAN_FORMAT; readonly version: 1; readonly chain: 'evm'; readonly networkId: string;
  readonly account: string; readonly accountGeneration: number; readonly destination: string; readonly assets: readonly SweepAsset[];
  readonly feeCap: string; readonly expiresAt: number; readonly nonce: string; readonly policyRevision: number;
}
function parsePlan(input: unknown): LocalSweepPlan {
  const p = data(input, ['format', 'version', 'chain', 'networkId', 'account', 'accountGeneration', 'destination', 'assets', 'feeCap', 'expiresAt', 'nonce', 'policyRevision']);
  if (p.version !== 1) return stop('UNSUPPORTED_VERSION'); if (p.format !== PLAN_FORMAT) return stop();
  if (p.chain !== 'evm') return stop('UNSUPPORTED_PROVIDER');
  const assets = list(p.assets, 16).map(item => { const a = data(item, ['id', 'amountCap']); return Object.freeze({ id: text(a.id, 64), amountCap: amount(a.amountCap, true) }); });
  if (!assets.length || assets.some((asset, i) => i > 0 && asset.id <= assets[i - 1]!.id)) return stop();
  return Object.freeze({ format: PLAN_FORMAT, version: 1, chain: 'evm', networkId: text(p.networkId), account: address(p.account),
    accountGeneration: integer(p.accountGeneration), destination: address(p.destination), assets: Object.freeze(assets), feeCap: amount(p.feeCap),
    expiresAt: integer(p.expiresAt, 1), nonce: hex(p.nonce, 32), policyRevision: integer(p.policyRevision, 1) });
}
export function validateLocalSweepPlan(input: unknown): CoreResult<LocalSweepPlan> { try { return ok(parsePlan(input)); } catch (error) { return failed(codeOf(error)); } }
export interface SweepScope { readonly chain: 'evm'; readonly networkId: string; readonly account: string; readonly accountGeneration: number; readonly policyRevision: number; }
export interface SweepReminderOptions { readonly vault: LocalVault; readonly session: VaultSession; readonly scope: SweepScope; readonly isCurrent: () => boolean; readonly clock: { readonly wall: () => number; readonly monotonic: () => number }; }
export interface ReminderHandle { readonly kind: 'local-sweep-reminder'; }
export type ReminderState = 'draft' | 'scheduled' | 'ready' | 'cancelled' | 'expired';
export interface ReminderView { readonly state: ReminderState; readonly generation: number; readonly notBefore: number | null; readonly expiry: number; readonly requiresFreshReview: true; readonly clockUncertain: boolean; readonly executionSupported: false; }
interface StoredReminder { readonly format: typeof FORMAT; readonly version: 1; readonly plan: LocalSweepPlan; readonly planHash: string; readonly generation: number; readonly state: 'draft' | 'scheduled' | 'cancelled'; readonly notBefore: number | null; readonly expiry: number; }
export interface SweepReminders {
  createPlan(policy: Omit<LocalSweepPlan, 'format' | 'version' | 'nonce'>, consent: unknown, signal?: AbortSignal): Promise<CoreResult<LocalWrite & { readonly handle: ReminderHandle }>>;
  load(signal?: AbortSignal): Promise<CoreResult<ReminderHandle | null>>;
  schedule(handle: ReminderHandle, notBefore: number, expiry: number, signal?: AbortSignal): Promise<CoreResult<LocalWrite & { readonly handle: ReminderHandle }>>;
  cancel(handle: ReminderHandle, signal?: AbortSignal): Promise<CoreResult<LocalWrite & { readonly handle: ReminderHandle }>>;
  inspect(handle: ReminderHandle, signal?: AbortSignal): Promise<CoreResult<ReminderView>>;
  prepareReady(handle: ReminderHandle, signal?: AbortSignal): Promise<CoreResult<Readonly<{ plan: LocalSweepPlan; requiresFreshWalletConsent: true; executionSupported: false }>>>;
  dispose(): void;
}
function parseReminder(input: unknown): StoredReminder {
  const r = data(input, ['format', 'version', 'plan', 'planHash', 'generation', 'state', 'notBefore', 'expiry']);
  if (r.version !== 1) return stop('UNSUPPORTED_VERSION');
  if (r.format !== FORMAT || !['draft', 'scheduled', 'cancelled'].includes(r.state as string)) return stop('INTEGRITY_FAILURE');
  const plan = parsePlan(r.plan), expiry = integer(r.expiry, 1), notBefore = r.notBefore === null ? null : integer(r.notBefore);
  if (expiry > plan.expiresAt || notBefore !== null && notBefore >= expiry || r.state === 'scheduled' && notBefore === null || r.state === 'draft' && notBefore !== null) return stop('INTEGRITY_FAILURE');
  return Object.freeze({ format: FORMAT, version: 1, plan, planHash: hex(r.planHash, 32), generation: integer(r.generation), state: r.state as StoredReminder['state'], notBefore, expiry });
}
async function planHash(plan: LocalSweepPlan, job: LocalJob): Promise<string> {
  job.guard(); const bytes = new TextEncoder().encode(JSON.stringify(plan));
  try { const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)); try { job.guard(); return Array.from(digest, x => x.toString(16).padStart(2, '0')).join(''); } finally { digest.fill(0); } }
  finally { bytes.fill(0); }
}
export function createSweepReminders(input: SweepReminderOptions): CoreResult<SweepReminders> {
  let prefs: Preferences | undefined;
  try {
    const o = data(input, ['vault', 'session', 'scope', 'isCurrent', 'clock']), vault = requireVault(o.vault), s = data(o.scope, ['chain', 'networkId', 'account', 'accountGeneration', 'policyRevision']);
    if (s.chain !== 'evm') return failed('UNSUPPORTED_PROVIDER');
    const scope: SweepScope = Object.freeze({ chain: 'evm', networkId: text(s.networkId), account: address(s.account), accountGeneration: integer(s.accountGeneration), policyRevision: integer(s.policyRevision, 1) });
    const clock = data(o.clock, ['wall', 'monotonic']);
    if (typeof o.isCurrent !== 'function' || typeof clock.wall !== 'function' || typeof clock.monotonic !== 'function') return failed('INVALID_INPUT');
    const wall = clock.wall as () => number, mono = clock.monotonic as () => number, current = o.isCurrent as () => boolean;
    const gate = new LocalGate(() => current() === true && prefs !== undefined && prefs.current() !== null, () => prefs?.dispose()), handles = new WeakMap<object, { hash: string; generation: number }>();
    let previousWall: number | undefined, previousMono: number | undefined, clockUncertain = false;
    const dispose = (): void => { gate.close(); prefs?.dispose(); };
    prefs = new Preferences(vault, o.session as VaultSession, dispose); const store = prefs;
    if (!store.current()) { dispose(); return failed('LOCKED'); }
    function now(job: LocalJob): number {
      job.guard(); const w = integer(wall()), m = mono(); job.guard();
      if (!Number.isFinite(m) || m < 0) return stop('UNAVAILABLE');
      if (previousWall !== undefined && previousMono !== undefined && (w < previousWall || m < previousMono || Math.abs((w - previousWall) - (m - previousMono)) > 1000)) clockUncertain = true;
      previousWall = w; previousMono = m; return w;
    }
    const sameScope = (plan: LocalSweepPlan): void => { if (plan.chain !== scope.chain || plan.networkId !== scope.networkId || plan.account !== scope.account || plan.accountGeneration !== scope.accountGeneration || plan.policyRevision !== scope.policyRevision) return stop('CONFLICT'); };
    function issue(record: StoredReminder): ReminderHandle { const handle: ReminderHandle = Object.freeze({ kind: 'local-sweep-reminder' }); handles.set(handle, { hash: record.planHash, generation: record.generation }); return handle; }
    async function read(job: LocalJob, handle?: ReminderHandle) {
      const found = await store.read(RECORD_ID, job); if (!found.row) { if (handle) return stop('CONFLICT'); return { record: null, revision: found.revision }; }
      const record = parseReminder(found.value); sameScope(record.plan); if (await planHash(record.plan, job) !== record.planHash) return stop('INTEGRITY_FAILURE');
      // Hashing yields: validate the actual encrypted row again and retain its
      // revision through the final gate, including concurrent native consumers.
      await store.refresh(found.revision, job);
      if (handle) { const owned = typeof handle === 'object' && handle !== null ? handles.get(handle) : undefined;
        if (!owned || owned.hash !== record.planHash || owned.generation !== record.generation) return stop('CONFLICT'); }
      job.guard(); return { record, revision: found.revision };
    }
    function project(record: StoredReminder, at: number): ReminderView {
      const state: ReminderState = record.state === 'cancelled' ? 'cancelled' : at >= record.expiry ? 'expired' : record.state === 'scheduled' && !clockUncertain && at >= record.notBefore! ? 'ready' : record.state;
      return Object.freeze({ state, generation: record.generation, notBefore: record.notBefore, expiry: record.expiry, requiresFreshReview: true, clockUncertain, executionSupported: false });
    }
    function beforeExpiry(job: LocalJob, expiry: number): LocalJob {
      return Object.freeze({ signal: job.signal, durable: job.durable, setRevisionGuard: job.setRevisionGuard, guard() { job.guard(); const at = now(job); job.guard(); if (clockUncertain || at >= expiry) return stop('EXPIRED'); } });
    }
    return ok(Object.freeze({
      createPlan(policy, consent, signal) {
        return gate.run(async job => {
          consentOf(consent); const p = data(policy, ['chain', 'networkId', 'account', 'accountGeneration', 'destination', 'assets', 'feeCap', 'expiresAt', 'policyRevision']);
          const nonceBytes = new Uint8Array(32); let nonce: string;
          try { job.guard(); crypto.getRandomValues(nonceBytes); job.guard(); nonce = Array.from(nonceBytes, x => x.toString(16).padStart(2, '0')).join(''); } finally { nonceBytes.fill(0); }
          const plan = parsePlan({ format: PLAN_FORMAT, version: 1, ...p, nonce }); sameScope(plan); const at = now(job); if (at >= plan.expiresAt) return stop('EXPIRED');
          const found = await read(job), hash = await planHash(plan, job); job.guard();
          const next: StoredReminder = Object.freeze({ format: FORMAT, version: 1, plan, planHash: hash, generation: integer((found.record?.generation ?? -1) + 1), state: 'draft', notBefore: null, expiry: plan.expiresAt });
          const receipt = await store.put(RECORD_ID, found.revision, next, beforeExpiry(job, plan.expiresAt)); return Object.freeze({ ...receipt, handle: issue(next) });
        }, signal);
      },
      load(signal) { return gate.run(async job => { const found = await read(job); return found.record ? issue(found.record) : null; }, signal); },
      schedule(handle, notBefore, expiry, signal) {
        return gate.run(async job => {
          const before = integer(notBefore), end = integer(expiry, 1), found = await read(job, handle), record = found.record!;
          const at = now(job); if (clockUncertain || record.state === 'cancelled' || at >= record.expiry || before < at || before >= end || end > record.plan.expiresAt) return stop('EXPIRED');
          job.guard(); const next: StoredReminder = Object.freeze({ ...record, generation: integer(record.generation + 1), state: 'scheduled', notBefore: before, expiry: end });
          const receipt = await store.put(RECORD_ID, found.revision, next, beforeExpiry(job, end)); return Object.freeze({ ...receipt, handle: issue(next) });
        }, signal);
      },
      cancel(handle, signal) {
        return gate.run(async job => {
          const found = await read(job, handle), record = found.record!;
          if (record.state === 'cancelled') return Object.freeze({ recordId: RECORD_ID, revision: found.revision, persisted: true, sessionCurrent: true, handle: issue(record) });
          const next: StoredReminder = Object.freeze({ ...record, generation: integer(record.generation + 1), state: 'cancelled' });
          const receipt = await store.put(RECORD_ID, found.revision, next, job); return Object.freeze({ ...receipt, handle: issue(next) });
        }, signal);
      },
      inspect(handle, signal) { return gate.run(async job => { const record = (await read(job, handle)).record!, at = now(job); job.guard(); return project(record, at); }, signal); },
      prepareReady(handle, signal) {
        return gate.run(async job => {
          const record = (await read(job, handle)).record!, at = now(job), view = project(record, at); job.guard();
          if (view.state !== 'ready' || clockUncertain) return stop('EXPIRED');
          return Object.freeze({ plan: record.plan, requiresFreshWalletConsent: true, executionSupported: false });
        }, signal);
      },
      dispose,
    } satisfies SweepReminders));
  } catch (error) { prefs?.dispose(); return failed(codeOf(error)); }
}
