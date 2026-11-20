/** Private document projection for reusable templates. Persistence and preview authority stay in the Worker. */
import {
  parseTradeDraftDefaults, parseTradeDraftInput, parseTradeDraftChange, parseRuntimeTradeTemplates,
  parseRuntimeTradeTemplatePreview, parseRuntimeTradeTemplateReceipt,
  type TradeDraftDefaultsV1, type TradeDraftInputV1, type TradeDraftChangeV1,
  type RuntimeTradeTemplates, type RuntimeTradeTemplatePreview,
} from '../../../../packages/schemas/index.ts';
import { draftDefaultsFromReviewed } from '../../../../packages/domain/index.ts';
import type { AppServices } from '../app-services.ts';
import type { DraftRegistryIdentity, TradeReviewController } from './review-controller.ts';

export type TemplatePort = Pick<AppServices, 'getSnapshot' | 'selectionScope' | 'subscribe' | 'loadTradeTemplates' |
  'previewTradeTemplateChange' | 'commitTradeTemplateChange' | 'cancelTradeTemplateChange'>;
export type DraftFields = Readonly<Record<keyof TradeDraftInputV1, string>>;
export const DRAFT_FIELD_NAMES = Object.freeze(['networkId', 'deploymentId', 'assetId', 'amountBaseUnits', 'fiatCurrency', 'fiatMinorUnits',
  'fiatScale', 'seller', 'buyer', 'paymentInstructions', 'acceptBeforeSeconds', 'escrowExpirySeconds'] as const);
export const DEFAULT_FIELD_NAMES = Object.freeze(DRAFT_FIELD_NAMES.slice(0, 7) as readonly (keyof TradeDraftDefaultsV1)[]);
const blank = (): DraftFields => Object.freeze(Object.fromEntries(DRAFT_FIELD_NAMES.map(key => [key, ''])) as Record<keyof TradeDraftInputV1, string>);
export interface TradeDraftSnapshot {
  readonly unlocked: boolean; readonly generation: number; readonly fields: DraftFields;
  readonly library: RuntimeTradeTemplates | null; readonly preview: RuntimeTradeTemplatePreview | null;
  readonly busy: 'load' | 'preview' | 'commit' | 'cancel' | 'review' | null;
  readonly status: 'idle' | 'saved' | 'failed'; readonly code: string | null;
}
export interface DraftReviewConsent { readonly amounts: boolean; readonly identities: boolean; readonly emptyInstructions: boolean; }
export interface TradeDraftController {
  getSnapshot(): TradeDraftSnapshot; subscribe(listener: () => void): () => void;
  syncSelection(): void; startBlank(): void; edit(field: keyof TradeDraftInputV1, value: string): void;
  apply(slot: number): void; applyRepeatDefault(): void; useReviewedDefaults(localId: string): void;
  currentIdentity(): DraftRegistryIdentity | null;
  load(): Promise<void>; preview(change: TradeDraftChangeV1): Promise<void>; previewPut(slot: number): Promise<void>;
  commit(reviewed: boolean): Promise<void>; cancel(): Promise<void>;
  review(consent: DraftReviewConsent): Promise<string | null>; dispose(): void;
}
export function createTradeDraftController(port: TemplatePort, trade: TradeReviewController): TradeDraftController {
  let disposed = false, generation = 0, operation = 0, scope = port.selectionScope();
  let abort: AbortController | undefined, ownedReview: string | null = null;
  const listeners = new Set<() => void>();
  let snapshot: TradeDraftSnapshot = Object.freeze({ unlocked: port.getSnapshot().state === 'unlocked', generation,
    fields: blank(), library: null, preview: null, busy: null, status: 'idle', code: null });
  const publish = (next: Partial<TradeDraftSnapshot>) => {
    if (disposed) return;
    snapshot = Object.freeze({ ...snapshot, ...next });
    for (const listener of [...listeners]) { try { listener(); } catch { /* One view cannot retain another view's private projection. */ } }
  };
  const dropReview = () => {
    if (snapshot.busy === 'review') trade.cancel();
    if (ownedReview) trade.remove(ownedReview);
    ownedReview = null;
  };
  const sync = (): boolean => {
    if (disposed) return false;
    const nextScope = port.selectionScope(), unlocked = port.getSnapshot().state === 'unlocked';
    if (scope !== nextScope || snapshot.unlocked !== unlocked) {
      const uncertain = !unlocked && (snapshot.busy === 'commit' || snapshot.code === 'UNKNOWN_OUTCOME');
      scope = nextScope; operation++; generation++; dropReview();
      const previous = abort; abort = undefined;
      publish({ unlocked, generation, fields: blank(), library: null, preview: null, busy: null, status: uncertain ? 'failed' : 'idle', code: uncertain ? 'UNKNOWN_OUTCOME' : null });
      previous?.abort();
    }
    return unlocked;
  };
  const unsubscribe = port.subscribe(sync);
  const current = (mine: number, selected: number) => sync() && !disposed && mine === operation && selected === scope;
  const ready = () => sync() && snapshot.busy === null && snapshot.preview === null;
  const fail = (code: string) => publish({ busy: null, preview: null, status: 'failed', code });
  const values = (): TradeDraftDefaultsV1 => parseTradeDraftDefaults({ networkId: snapshot.fields.networkId, deploymentId: snapshot.fields.deploymentId,
    assetId: snapshot.fields.assetId, amountBaseUnits: snapshot.fields.amountBaseUnits, fiatCurrency: snapshot.fields.fiatCurrency,
    fiatMinorUnits: snapshot.fields.fiatMinorUnits, fiatScale: /^[0-6]$/.test(snapshot.fields.fiatScale) ? Number(snapshot.fields.fiatScale) : NaN });
  const replace = (defaults?: TradeDraftDefaultsV1) => {
    dropReview(); generation++;
    // Enumerate only these seven primitives. No prior party, agreement, nonce, deadline or signature can survive.
    const fields = defaults ? Object.freeze({ ...blank(), networkId: defaults.networkId, deploymentId: defaults.deploymentId, assetId: defaults.assetId,
      amountBaseUnits: defaults.amountBaseUnits, fiatCurrency: defaults.fiatCurrency, fiatMinorUnits: defaults.fiatMinorUnits, fiatScale: String(defaults.fiatScale) }) : blank();
    publish({ generation, fields, status: 'idle', code: null });
  };
  const apply = (slot: number) => {
    if (!ready()) return;
    const selected = snapshot.library?.library.templates.find(item => item.slot === slot);
    if (!selected) { fail('NOT_FOUND'); return; }
    const identity = trade.resolveDraftDefaults(selected.defaults);
    if (!identity) { fail('REGISTRY_NOT_READY'); return; }
    if (sync()) replace(identity.defaults);
  };
  async function load(): Promise<void> {
    if (!ready()) return;
    const mine = ++operation, selected = scope, controller = new AbortController(); abort = controller;
    publish({ busy: 'load', library: null, status: 'idle', code: null });
    try {
      const result = await port.loadTradeTemplates(controller.signal);
      if (!current(mine, selected)) return;
      if (!result.ok) { fail(result.error.code); return; }
      const library = parseRuntimeTradeTemplates(result.value);
      if (current(mine, selected)) publish({ busy: null, library });
    } catch { if (current(mine, selected)) fail('PROTOCOL_ERROR'); }
    finally { if (abort === controller) abort = undefined; }
  }
  async function preview(input: TradeDraftChangeV1): Promise<void> {
    if (!ready()) return;
    const observed = snapshot.library;
    if (!observed) { fail('CONFLICT'); return; }
    let change: TradeDraftChangeV1;
    try { change = parseTradeDraftChange(input); } catch { fail('INVALID_INPUT'); return; }
    if (change.kind === 'put-template' && !trade.resolveDraftDefaults(change.defaults)) { fail('REGISTRY_NOT_READY'); return; }
    const mine = ++operation, selected = scope, controller = new AbortController(); abort = controller;
    publish({ busy: 'preview', status: 'idle', code: null });
    try {
      const result = await port.previewTradeTemplateChange(observed.revision, change, controller.signal);
      if (!current(mine, selected)) return;
      if (!result.ok) { publish({ library: null }); fail(result.error.code); return; }
      const planned = parseRuntimeTradeTemplatePreview(result.value);
      if (planned.revision !== observed.revision || JSON.stringify(planned.change) !== JSON.stringify(change)) { fail('PROTOCOL_ERROR'); return; }
      if (current(mine, selected)) publish({ busy: null, preview: planned });
    } catch { if (current(mine, selected)) { publish({ library: null }); fail('PROTOCOL_ERROR'); } }
    finally { if (abort === controller) abort = undefined; }
  }
  return Object.freeze({
    getSnapshot() { sync(); return snapshot; },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    syncSelection() { sync(); },
    startBlank() { if (ready()) replace(); },
    edit(field: keyof TradeDraftInputV1, value: string) {
      if (!ready() || !DRAFT_FIELD_NAMES.includes(field) || typeof value !== 'string' || value.length > (field === 'paymentInstructions' ? 4096 : 128)) return;
      dropReview(); generation++;
      publish({ generation, fields: Object.freeze({ ...snapshot.fields, [field]: value }), status: 'idle', code: null });
    },
    apply,
    applyRepeatDefault() { const slot = snapshot.library?.library.repeatDefaultSlot; if (slot !== null && slot !== undefined) apply(slot); },
    useReviewedDefaults(localId: string) {
      if (!ready()) return;
      const reviewed = trade.find(localId);
      if (!reviewed) { fail('NOT_FOUND'); return; }
      const identity = trade.resolveDraftDefaults(draftDefaultsFromReviewed(reviewed.review));
      if (!identity) { fail('REGISTRY_NOT_READY'); return; }
      if (sync()) replace(identity.defaults);
    },
    currentIdentity() { if (!sync()) return null; try { return trade.resolveDraftDefaults(values()); } catch { return null; } },
    load, preview,
    async previewPut(slot: number) {
      if (!ready()) return;
      try { await preview({ kind: 'put-template', slot, defaults: values() }); } catch { fail('INVALID_INPUT'); }
    },
    async commit(reviewed: boolean) {
      if (!sync() || snapshot.busy !== null || !snapshot.preview || reviewed !== true) return;
      const planned = snapshot.preview, mine = ++operation, selected = scope, controller = new AbortController(); abort = controller;
      publish({ busy: 'commit', preview: null, status: 'idle', code: null });
      try {
        const result = await port.commitTradeTemplateChange(planned.previewId, planned.revision,
          { reviewed: true, logicalOnly: true, backupAndRemoteLimitsAcknowledged: true }, controller.signal);
        if (!current(mine, selected)) return;
        publish({ library: null });
        if (!result.ok) { fail(result.error.code); return; }
        const receipt = parseRuntimeTradeTemplateReceipt(result.value);
        if (!receipt.sessionCurrent || receipt.revision !== planned.revision + (receipt.changed ? 1 : 0)) { fail('PROTOCOL_ERROR'); return; }
        // Clear the observed revision after any commit. A fresh explicit load admits the next change, without CAS retry.
        if (current(mine, selected)) publish({ busy: null, status: 'saved', code: null });
      } catch { if (current(mine, selected)) { publish({ library: null }); fail('PROTOCOL_ERROR'); } }
      finally { if (abort === controller) abort = undefined; }
    },
    async cancel() {
      if (!sync()) return;
      const pending = abort;
      if (pending) {
        operation++; abort = undefined; dropReview();
        publish({ busy: null, preview: null, library: null, status: 'failed', code: 'UNKNOWN_OUTCOME' });
        pending.abort(); return;
      }
      if (!snapshot.preview) return;
      const mine = ++operation, selected = scope, controller = new AbortController(); abort = controller;
      publish({ busy: 'cancel', preview: null, status: 'idle', code: null });
      try {
        const result = await port.cancelTradeTemplateChange(controller.signal);
        if (!current(mine, selected)) return;
        if (!result.ok || result.value.cancelled !== true) { fail(result.ok ? 'PROTOCOL_ERROR' : result.error.code); return; }
        publish({ busy: null });
      } catch { if (current(mine, selected)) fail('PROTOCOL_ERROR'); }
      finally { if (abort === controller) abort = undefined; }
    },
    async review(consent: DraftReviewConsent) {
      if (!ready()) return null;
      if (consent.amounts !== true || consent.identities !== true || (snapshot.fields.paymentInstructions.length === 0 && consent.emptyInstructions !== true)) { fail('INVALID_INPUT'); return null; }
      let input: TradeDraftInputV1;
      try { input = parseTradeDraftInput({ ...snapshot.fields, fiatScale: values().fiatScale }); } catch { fail('INVALID_INPUT'); return null; }
      if (!trade.resolveDraftDefaults(values())) { fail('REGISTRY_NOT_READY'); return null; }
      dropReview(); const mine = ++operation, selected = scope, controller = new AbortController(); abort = controller;
      publish({ busy: 'review', status: 'idle', code: null });
      try {
        const outcome = await trade.reviewDraft(input, () => current(mine, selected), controller.signal);
        if (!current(mine, selected)) return null;
        if (outcome.kind !== 'accepted') { fail(outcome.kind === 'rejected' ? outcome.code : 'CANCELLED'); return null; }
        ownedReview = outcome.localId; publish({ busy: null });
        return current(mine, selected) ? outcome.localId : null;
      } catch { if (current(mine, selected)) fail('PROTOCOL_ERROR'); return null; }
      finally { if (abort === controller) abort = undefined; }
    },
    dispose() {
      if (disposed) return;
      unsubscribe(); operation++; dropReview(); const pending = abort; abort = undefined;
      if (snapshot.preview && !pending && port.getSnapshot().state === 'unlocked' && port.selectionScope() === scope) {
        void port.cancelTradeTemplateChange().catch(() => { /* Runtime disposal/expiry remains the authority if already busy. */ });
      }
      snapshot = Object.freeze({ unlocked: false, generation: ++generation, fields: blank(), library: null, preview: null, busy: null, status: 'idle', code: null });
      disposed = true; listeners.clear(); pending?.abort();
    },
  });
}
