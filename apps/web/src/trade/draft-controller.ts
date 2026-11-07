/** Owns the actual editable local draft and selected-profile template consumer. No wallet/send API. */
import { MAX_REVISION, MAX_DRAFT_INSTRUCTIONS_BYTES, parseTradeDraftDefaults, parseTradeDraftInput, parseTradeDraftLibrary, parseTradeDraftChange,
  type TradeDraftDefaultsV1, type TradeDraftInputV1, type TradeDraftChangeV1, type RuntimeResult } from '../../../../packages/schemas/index.ts';
import type { TradeDraftLibraryState, TradeDraftChangePreview, TradeDraftChangeConsent, TradeDraftChangeReceipt } from '../../../../packages/personalization/index.ts';
import type { TradeDraftChoice, ImportOutcome } from './review-controller.ts';

export const TRADE_DRAFT_FIELDS = ['networkId', 'deploymentId', 'assetId', 'amountBaseUnits', 'fiatCurrency', 'fiatMinorUnits', 'fiatScale',
  'seller', 'buyer', 'paymentInstructions', 'acceptBeforeSeconds', 'escrowExpirySeconds'] as const;
export type TradeDraftField = typeof TRADE_DRAFT_FIELDS[number];
export type TradeDraftForm = Readonly<Record<TradeDraftField, string>>;
export interface DraftReviewPort {
  getDraftChoices(): readonly TradeDraftChoice[];
  reviewDraft(input: TradeDraftInputV1, signal?: AbortSignal): Promise<ImportOutcome>;
  subscribe(listener: () => void): () => void;
}
export interface DraftPersistencePort {
  getSnapshot(): { readonly state: 'locked' | 'unlocked' }; selectionScope(): number; subscribe(listener: () => void): () => void;
  loadTradeDraftLibrary(signal?: AbortSignal): Promise<RuntimeResult<TradeDraftLibraryState>>;
  planTradeDraftChange(expectedRevision: number, change: TradeDraftChangeV1, signal?: AbortSignal): Promise<RuntimeResult<TradeDraftChangePreview>>;
  commitTradeDraftChange(previewId: string, expectedRevision: number, consent: TradeDraftChangeConsent, signal?: AbortSignal): Promise<RuntimeResult<TradeDraftChangeReceipt>>;
}
export interface TradeDraftSnapshot {
  readonly unlocked: boolean; readonly busy: boolean; readonly form: TradeDraftForm; readonly choices: readonly TradeDraftChoice[];
  readonly amountsConfirmed: boolean; readonly identitiesConfirmed: boolean; readonly emptyInstructionsConfirmed: boolean;
  readonly library: TradeDraftLibraryState | null; readonly preview: TradeDraftChangePreview | null; readonly reviewId: string | null;
  readonly status: 'idle' | 'busy' | 'saved' | 'reviewed' | 'cancelled' | 'failed'; readonly code: string | null;
}
export interface TradeDraftController {
  getSnapshot(): TradeDraftSnapshot; subscribe(listener: () => void): () => void;
  setPersistence(port: DraftPersistencePort | null): void; setReview(port: DraftReviewPort | null): void;
  edit(field: TradeDraftField, value: string): void; currentDefaults(): TradeDraftDefaultsV1;
  confirmAmounts(value: boolean): void; confirmIdentities(value: boolean): void; confirmEmptyInstructions(value: boolean): void;
  startBlank(): void; useTemplate(slot: number): void; useRepeatDefault(): void;
  loadTemplates(): Promise<void>; planChange(change: TradeDraftChangeV1): Promise<void>; commitChange(reviewed: boolean): Promise<void>;
  review(): Promise<string | null>; cancel(): void; dispose(): void;
}
const empty = (): TradeDraftForm => Object.freeze(Object.fromEntries(TRADE_DRAFT_FIELDS.map(key => [key, ''])) as Record<TradeDraftField, string>);
const rev = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_REVISION;
const CODES = new Set(['INVALID_INPUT', 'UNSUPPORTED_ENVIRONMENT', 'UNSUPPORTED_VERSION', 'NOT_FOUND', 'AUTHENTICATION_FAILED', 'LOCKED', 'CONFLICT',
  'LIMIT_EXCEEDED', 'QUOTA_EXCEEDED', 'STORAGE_UNAVAILABLE', 'CANCELLED', 'BUSY', 'PROTOCOL_ERROR', 'TIMEOUT', 'NATIVE_PROOF_REQUIRED',
  'REGISTRY_NOT_READY', 'LOCAL_LIMIT_REACHED', 'TOO_LARGE', 'MALFORMED', 'UNSUPPORTED_FORMAT', 'INVALID_TERMS', 'INVALID_AGREEMENT', 'AGREEMENT_MISMATCH',
  'AGREEMENT_HASH_MISMATCH', 'CAPABILITIES_HASH_MISMATCH', 'UNKNOWN_NETWORK', 'NOT_EVM_NETWORK', 'UNKNOWN_DEPLOYMENT', 'UNSUPPORTED_ASSET', 'UNFUNDABLE_WINDOW', 'UNAVAILABLE', 'UNKNOWN_OUTCOME']);
class Failure { readonly code: string; constructor(code: string) { this.code = code; } }
const stop = (code: string): never => { throw new Failure(CODES.has(code) ? code : 'PROTOCOL_ERROR'); };
const value = <T>(result: RuntimeResult<T>): T => result.ok ? result.value : stop(result.error.code);
interface Job { readonly generation: number; readonly port: DraftPersistencePort; readonly review: DraftReviewPort | null; readonly scope: number; readonly abort: AbortController; readonly action: 'load' | 'plan' | 'commit' | 'review'; }

export function createTradeDraftController(options: { readonly review: DraftReviewPort | null; readonly persistence?: DraftPersistencePort | null }): TradeDraftController {
  let port = options.persistence ?? null, reviewer = options.review, scope = port?.selectionScope() ?? null;
  let unsubscribePort: (() => void) | undefined, unsubscribeReview: (() => void) | undefined;
  let generation = 0, active: Job | undefined, disposed = false, persistenceOwner = 0, reviewOwner = 0;
  const listeners = new Set<() => void>();
  const cleanup = (off: (() => void) | undefined): void => { try { off?.(); } catch { /* Foreign cleanup cannot retain private state or ownership. */ } };
  let snapshot: TradeDraftSnapshot = Object.freeze({ unlocked: false, busy: false, form: empty(), choices: Object.freeze([]),
    amountsConfirmed: false, identitiesConfirmed: false, emptyInstructionsConfirmed: false, library: null, preview: null, reviewId: null, status: 'idle', code: null });
  const publish = (patch: Partial<TradeDraftSnapshot>): void => {
    if (disposed) return; snapshot = Object.freeze({ ...snapshot, ...patch, busy: active !== undefined });
    for (const listener of [...listeners]) { try { listener(); } catch { /* Observers cannot acquire another selection's state. */ } }
  };
  const retire = (): void => { generation++; active?.abort.abort(); };
  const reset = (form: TradeDraftForm = empty()): void => { retire(); publish({ form, amountsConfirmed: false, identitiesConfirmed: false,
    emptyInstructionsConfirmed: false, preview: null, reviewId: null, code: null, status: 'idle' }); };
  const fail = (code: string): void => publish({ status: 'failed', code });
  const sync = (): void => {
    if (disposed) return;
    let unlocked = false, nextScope: number | null = null, choices: readonly TradeDraftChoice[] = Object.freeze([]);
    try { unlocked = port?.getSnapshot().state === 'unlocked'; nextScope = port?.selectionScope() ?? null; } catch { /* Treat a failing owner as locked. */ }
    if (nextScope !== scope || !unlocked && snapshot.unlocked) {
      scope = nextScope; retire(); publish({ form: empty(), library: null, preview: null, reviewId: null, amountsConfirmed: false,
        identitiesConfirmed: false, emptyInstructionsConfirmed: false, status: 'idle', code: null, unlocked });
    }
    try { choices = reviewer?.getDraftChoices() ?? Object.freeze([]); } catch { /* No current registry choices. */ }
    const changed = JSON.stringify(choices) !== JSON.stringify(snapshot.choices);
    if (changed || unlocked !== snapshot.unlocked) publish({ unlocked, choices: changed ? choices : snapshot.choices,
      ...(changed ? { identitiesConfirmed: false, reviewId: null } : {}) });
  };
  const current = (job: Job): boolean => {
    sync(); let selected = false;
    try { selected = job.port.getSnapshot().state === 'unlocked' && job.port.selectionScope() === job.scope; } catch { /* Refuse below. */ }
    return !disposed && active === job && generation === job.generation && port === job.port && reviewer === job.review && selected && !job.abort.signal.aborted;
  };
  const attach = (source: { subscribe(listener: () => void): () => void } | null, owned: () => boolean): (() => void) | undefined => {
    let off: (() => void) | undefined;
    try { off = source?.subscribe(sync); } catch { /* Snapshot reads still enforce current scope. */ }
    if (!owned()) { cleanup(off); return undefined; } return typeof off === 'function' ? off : undefined;
  };
  async function run<T>(action: Job['action'], work: (job: Job) => Promise<T>): Promise<T | null> {
    sync(); if (disposed) return null; if (active) { fail('BUSY'); return null; }
    if (!port || !snapshot.unlocked || scope === null) { fail('LOCKED'); return null; }
    const job: Job = { generation: ++generation, port, review: reviewer, scope, action, abort: new AbortController() }; active = job;
    publish({ status: 'busy', code: null });
    try { if (!current(job)) return null; return await work(job); }
    catch (thrown) {
      if (current(job)) { let code = 'PROTOCOL_ERROR'; try { if (thrown instanceof Failure) { const d = Object.getOwnPropertyDescriptor(thrown, 'code'); if (d && 'value' in d && typeof d.value === 'string' && CODES.has(d.value)) code = d.value; } } catch { /* Foreign rejection stays fixed. */ } fail(code); }
      return null;
    } finally { if (active === job) active = undefined; if (!disposed) publish({}); }
  }
  const check = (job: Job): void => { if (!current(job)) return stop('LOCKED'); };
  const defaults = (): TradeDraftDefaultsV1 => {
    sync(); if (!snapshot.unlocked) return stop('LOCKED');
    const f = snapshot.form; if (!/^[0-6]$/.test(f.fiatScale)) return stop('INVALID_INPUT');
    try { return parseTradeDraftDefaults({ networkId: f.networkId, deploymentId: f.deploymentId, assetId: f.assetId, amountBaseUnits: f.amountBaseUnits,
      fiatCurrency: f.fiatCurrency, fiatMinorUnits: f.fiatMinorUnits, fiatScale: Number(f.fiatScale) }); } catch { return stop('INVALID_INPUT'); }
  };
  const apply = (slot: number): void => {
    sync(); if (!snapshot.unlocked) { fail('LOCKED'); return; }
    const entry = snapshot.library?.library.templates.find(item => item.slot === slot); if (!entry) { fail('NOT_FOUND'); return; }
    const d = entry.defaults;
    reset(Object.freeze({ ...empty(), networkId: d.networkId, deploymentId: d.deploymentId, assetId: d.assetId, amountBaseUnits: d.amountBaseUnits,
      fiatCurrency: d.fiatCurrency, fiatMinorUnits: d.fiatMinorUnits, fiatScale: String(d.fiatScale) }));
  };
  const controller: TradeDraftController = Object.freeze({
    getSnapshot() { sync(); return snapshot; }, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setPersistence(next: DraftPersistencePort | null) {
      if (disposed || next === port) return; const mine = ++persistenceOwner, previous = unsubscribePort; unsubscribePort = undefined;
      retire(); port = next; scope = null;
      publish({ form: empty(), library: null, preview: null, reviewId: null, amountsConfirmed: false, identitiesConfirmed: false, emptyInstructionsConfirmed: false });
      cleanup(previous);
      if (!disposed && mine === persistenceOwner && port === next) unsubscribePort = attach(next, () => !disposed && mine === persistenceOwner && port === next);
      sync();
    },
    setReview(next: DraftReviewPort | null) {
      if (disposed || next === reviewer) return; const mine = ++reviewOwner, previous = unsubscribeReview; unsubscribeReview = undefined;
      reviewer = next; reset(); cleanup(previous);
      if (!disposed && mine === reviewOwner && reviewer === next) unsubscribeReview = attach(next, () => !disposed && mine === reviewOwner && reviewer === next);
      sync();
    },
    edit(field: TradeDraftField, text: string) {
      sync(); if (!snapshot.unlocked) { fail('LOCKED'); return; }
      const max = field === 'paymentInstructions' ? MAX_DRAFT_INSTRUCTIONS_BYTES : field === 'amountBaseUnits' ? 78 : field === 'fiatMinorUnits' ? 39 :
        field === 'seller' || field === 'buyer' ? 42 : field.endsWith('Seconds') ? 20 : field === 'fiatScale' ? 1 : field === 'fiatCurrency' ? 3 : 64;
      if (!TRADE_DRAFT_FIELDS.includes(field) || typeof text !== 'string' || text.length > max) { fail('LIMIT_EXCEEDED'); return; }
      const form = { ...snapshot.form, [field]: text };
      if (text !== snapshot.form[field]) {
        if (field === 'networkId') { form.deploymentId = ''; form.assetId = ''; form.amountBaseUnits = ''; }
        if (field === 'deploymentId') { form.assetId = ''; form.amountBaseUnits = ''; }
        if (field === 'assetId') form.amountBaseUnits = '';
        if (field === 'fiatCurrency' || field === 'fiatScale') form.fiatMinorUnits = '';
      }
      reset(Object.freeze(form));
    },
    currentDefaults: defaults,
    confirmAmounts(confirmed: boolean) { sync(); if (snapshot.unlocked) publish({ amountsConfirmed: confirmed === true, reviewId: null }); },
    confirmIdentities(confirmed: boolean) { sync(); if (snapshot.unlocked) publish({ identitiesConfirmed: confirmed === true, reviewId: null }); },
    confirmEmptyInstructions(confirmed: boolean) { sync(); if (snapshot.unlocked) publish({ emptyInstructionsConfirmed: confirmed === true, reviewId: null }); },
    startBlank() { reset(); }, useTemplate: apply,
    useRepeatDefault() { const selected = snapshot.library?.library.repeatDefaultSlot; if (selected === null || selected === undefined) { fail('NOT_FOUND'); return; } apply(selected); },
    async loadTemplates() {
      await run('load', async job => { const result = value(await job.port.loadTradeDraftLibrary(job.abort.signal)); check(job);
        if (!rev(result.revision)) return stop('PROTOCOL_ERROR'); const library = parseTradeDraftLibrary(result.library); check(job);
        publish({ library: Object.freeze({ revision: result.revision, library }), preview: null, status: 'idle' }); });
    },
    async planChange(input: TradeDraftChangeV1) {
      await run('plan', async job => {
        const loaded = snapshot.library; if (!loaded) return stop('NOT_FOUND'); const change = parseTradeDraftChange(input);
        publish({ preview: null }); check(job);
        const preview = value(await job.port.planTradeDraftChange(loaded.revision, change, job.abort.signal)); check(job);
        if (!/^[0-9a-f]{32}$/.test(preview.previewId) || preview.revision !== loaded.revision || JSON.stringify(parseTradeDraftChange(preview.change)) !== JSON.stringify(change) ||
          preview.logicalOnly !== true || preview.backupAndRemoteCopiesUnaffected !== true || !Number.isInteger(preview.affectedTemplateCount) || preview.affectedTemplateCount < 0 || preview.affectedTemplateCount > 1 || typeof preview.clearsRepeatDefault !== 'boolean') return stop('PROTOCOL_ERROR');
        publish({ preview: Object.freeze({ ...preview, change }), status: 'idle' });
      });
    },
    async commitChange(reviewed: boolean) {
      if (!reviewed) { fail('INVALID_INPUT'); return; }
      await run('commit', async job => {
        const preview = snapshot.preview, loaded = snapshot.library; if (!preview || !loaded) return stop('NOT_FOUND');
        publish({ preview: null }); check(job);
        const receipt = value(await job.port.commitTradeDraftChange(preview.previewId, preview.revision, { reviewed: true, logicalOnly: true, backupAndRemoteLimitsAcknowledged: true }, job.abort.signal)); check(job);
        if (!receipt.sessionCurrent || receipt.persisted !== true || !rev(receipt.revision) || typeof receipt.changed !== 'boolean' || receipt.revision !== preview.revision + (receipt.changed ? 1 : 0)) return stop('PROTOCOL_ERROR');
        let templates = [...loaded.library.templates], repeatDefaultSlot = loaded.library.repeatDefaultSlot; const change = preview.change;
        if (change.kind === 'put-template') { templates = templates.filter(entry => entry.slot !== change.slot); templates.push({ slot: change.slot, defaults: change.defaults }); templates.sort((a, b) => a.slot - b.slot); }
        else if (change.kind === 'remove-template') { templates = templates.filter(entry => entry.slot !== change.slot); if (repeatDefaultSlot === change.slot) repeatDefaultSlot = null; }
        else repeatDefaultSlot = change.slot;
        const library = parseTradeDraftLibrary({ ...loaded.library, templates, repeatDefaultSlot }); check(job);
        publish({ library: Object.freeze({ revision: receipt.revision, library }), preview: null, status: 'saved', code: null });
      });
    },
    async review() {
      return run('review', async job => {
        if (!job.review || !snapshot.choices.length) return stop('REGISTRY_NOT_READY');
        if (!snapshot.amountsConfirmed || !snapshot.identitiesConfirmed || !snapshot.form.paymentInstructions && !snapshot.emptyInstructionsConfirmed) return stop('INVALID_INPUT');
        let input: TradeDraftInputV1; try { input = parseTradeDraftInput({ ...snapshot.form, fiatScale: defaults().fiatScale }); } catch { return stop('INVALID_INPUT'); }
        check(job);
        const result = await job.review.reviewDraft(input, job.abort.signal); check(job);
        if (result.kind !== 'accepted') return stop(result.kind === 'rejected' ? result.code : 'CANCELLED');
        if (!/^[A-Za-z0-9_-]{22}$/.test(result.localId)) return stop('PROTOCOL_ERROR');
        publish({ status: 'reviewed', reviewId: result.localId, code: null }); return current(job) ? result.localId : null;
      });
    },
    cancel() { if (active?.abort.signal.aborted) return; const unknown = active?.action === 'commit'; retire(); publish({ preview: null, reviewId: null, status: unknown ? 'failed' : 'cancelled', code: unknown ? 'UNKNOWN_OUTCOME' : null }); },
    dispose() {
      if (disposed) return; const previousPort = unsubscribePort, previousReview = unsubscribeReview; unsubscribePort = undefined; unsubscribeReview = undefined;
      disposed = true; persistenceOwner++; reviewOwner++; generation++; port = null; reviewer = null; scope = null; listeners.clear();
      snapshot = Object.freeze({ ...snapshot, unlocked: false, busy: false, choices: Object.freeze([]), form: empty(), library: null, preview: null, reviewId: null, amountsConfirmed: false, identitiesConfirmed: false, emptyInstructionsConfirmed: false });
      try { active?.abort.abort(); } catch { /* Permanent retirement and private clearing already happened. */ }
      cleanup(previousPort); cleanup(previousReview);
    },
  });
  const initialPort = port, initialReview = reviewer;
  unsubscribePort = attach(initialPort, () => !disposed && port === initialPort && persistenceOwner === 0);
  unsubscribeReview = attach(initialReview, () => !disposed && reviewer === initialReview && reviewOwner === 0);
  sync(); return controller;
}
