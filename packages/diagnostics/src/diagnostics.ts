/** G26 allowlisted local diagnostics. No raw errors, vault access, network or upload API. */
import { revalidateRelease } from '../../security/release-context.ts';

export const DIAGNOSTIC_LIMITS = Object.freeze({ events: 500, bytes: 1024 * 1024, ageSeconds: 7 * 86400 });
export const DIAGNOSTIC_MODULES = Object.freeze(['runtime', 'vault', 'backup', 'trade-review', 'release', 'transport', 'wallet', 'chain', 'relay', 'diagnostics'] as const);
export const DIAGNOSTIC_OPERATIONS = Object.freeze(['init', 'status', 'unlock', 'create', 'restore', 'listProfiles', 'lock', 'exportEncrypted', 'dispose', 'activity',
  'saveTermsReview', 'listTermsReviews', 'deleteTermsReview', 'listRecoveryReferences', 'verifyRelease', 'reviewTerms', 'readChain', 'connect', 'receiveMessage', 'collectDiagnostics', 'previewExport', 'clearDiagnostics'] as const);
export const DIAGNOSTIC_ERRORS = Object.freeze(['INVALID_INPUT', 'UNSUPPORTED_ENVIRONMENT', 'UNSUPPORTED_VERSION', 'NOT_FOUND', 'AUTHENTICATION_FAILED', 'LOCKED', 'CONFLICT',
  'LIMIT_EXCEEDED', 'QUOTA_EXCEEDED', 'STORAGE_UNAVAILABLE', 'CANCELLED', 'BUSY', 'PROTOCOL_ERROR', 'TIMEOUT', 'UNSUPPORTED_PROVIDER', 'WRONG_CHAIN', 'UNAUTHORIZED',
  'USER_REJECTED', 'UNAVAILABLE', 'INTEGRITY_FAILURE', 'BROADCAST_UNKNOWN', 'EXPIRED', 'SIGNATURE_INVALID', 'KEY_UNTRUSTED', 'MANIFEST_EXPIRED', 'RELEASE_ROLLBACK',
  'ASSET_MISMATCH', 'MANIFEST_UNSUPPORTED', 'REDACTION_FAILED', 'REPORT_TOO_LARGE'] as const);
export const DIAGNOSTIC_ROUTES = Object.freeze(['direct', 'verified-private', 'unknown', 'unsupported'] as const);
export const DIAGNOSTIC_CHAINS = Object.freeze(['none', 'evm', 'solana'] as const);
export interface DiagnosticInput {
  readonly module: typeof DIAGNOSTIC_MODULES[number]; readonly errorCode: typeof DIAGNOSTIC_ERRORS[number];
  readonly operation: typeof DIAGNOSTIC_OPERATIONS[number]; readonly routeState: typeof DIAGNOSTIC_ROUTES[number]; readonly chainNamespace: typeof DIAGNOSTIC_CHAINS[number];
}
export interface DiagnosticEvent extends DiagnosticInput { readonly v: 1; readonly timeBucket: string; readonly releaseId: string; readonly storageSchema: number; }
export type DiagnosticWarning = 'DISCARDED_INVALID' | 'DISCARDED_EXPIRED' | 'CAP_REACHED';
export interface DiagnosticCollection { readonly configured: boolean; readonly events: readonly DiagnosticEvent[]; readonly warnings: readonly DiagnosticWarning[]; }
export interface DiagnosticPreview {
  readonly bytes: Uint8Array; readonly rows: readonly { readonly event: number; readonly field: string; readonly value: string }[];
  readonly warnings: readonly DiagnosticWarning[];
}
export type DiagnosticErrorCode = 'RELEASE_UNAVAILABLE' | 'STORAGE_UNAVAILABLE' | 'REDACTION_FAILED' | 'REPORT_TOO_LARGE';
export type DiagnosticResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly code: DiagnosticErrorCode } };
/** Small trusted browser adapter. The fixed storage key is chosen by app composition, never imported event fields. */
export interface DiagnosticStorage { read(): string | null; write(value: string): void; clear(): void; }
export interface Diagnostics {
  record(input: DiagnosticInput): DiagnosticResult<void>;
  collectDiagnostics(): DiagnosticResult<DiagnosticCollection>;
  previewExport(snapshot: DiagnosticCollection, indexes: readonly number[]): DiagnosticResult<DiagnosticPreview>;
  /** Revalidates proof, selection and unchanged preview bytes immediately before the user downloads. */
  confirmExport(preview: DiagnosticPreview): DiagnosticResult<Uint8Array>;
  clearDiagnostics(): DiagnosticResult<void>;
}
const fields = ['v', 'timeBucket', 'releaseId', 'module', 'errorCode', 'operation', 'routeState', 'chainNamespace', 'storageSchema'] as const;
const inputFields = ['module', 'errorCode', 'operation', 'routeState', 'chainNamespace'] as const;
const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
const success = <T>(value: T): DiagnosticResult<T> => Object.freeze({ ok: true, value });
const failure = (code: DiagnosticErrorCode): DiagnosticResult<never> => Object.freeze({ ok: false, error: Object.freeze({ code }) });
const refusals = new WeakMap<object, DiagnosticErrorCode>();
class Refused extends Error { constructor(code: DiagnosticErrorCode) { super('Local diagnostics unavailable.'); refusals.set(this, code); } }
const refusal = (error: unknown): DiagnosticErrorCode | undefined => typeof error === 'object' && error !== null ? refusals.get(error) : undefined;
const stop = (code: DiagnosticErrorCode = 'REDACTION_FAILED'): never => { throw new Refused(code); };
function exact(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return stop();
  const own = Reflect.ownKeys(input);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) return stop();
  const copy: Record<string, unknown> = Object.create(null);
  for (const key of keys) { const d = Object.getOwnPropertyDescriptor(input, key); if (!d || !('value' in d) || !d.enumerable) return stop(); copy[key] = d.value; }
  return copy;
}
function oneOf<T extends string>(value: unknown, choices: readonly T[]): T { return typeof value === 'string' && choices.includes(value as T) ? value as T : stop(); }
function inputSnapshot(value: unknown): DiagnosticInput {
  const raw = exact(value, inputFields);
  return Object.freeze({ module: oneOf(raw.module, DIAGNOSTIC_MODULES), errorCode: oneOf(raw.errorCode, DIAGNOSTIC_ERRORS), operation: oneOf(raw.operation, DIAGNOSTIC_OPERATIONS),
    routeState: oneOf(raw.routeState, DIAGNOSTIC_ROUTES), chainNamespace: oneOf(raw.chainNamespace, DIAGNOSTIC_CHAINS) });
}
const serialize = (events: readonly DiagnosticEvent[]): string => JSON.stringify({ v: 1, events });
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((value, i) => value === b[i]);

/** Release is an actual live G15 verifier result value, not a manifest or JSON projection. */
export function createDiagnostics(options: { readonly storage: DiagnosticStorage; readonly release?: unknown; readonly storageSchema: number; readonly nowSeconds?: () => number }): Diagnostics {
  const storage = options.storage, release = options.release, schema = options.storageSchema, clock = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  let epoch = 0, highWater = 0;
  const snapshots = new WeakMap<object, { readonly epoch: number; readonly serialized: string }>();
  const previews = new WeakMap<object, { readonly epoch: number; readonly snapshot: DiagnosticCollection; readonly indexes: readonly number[]; readonly bytes: Uint8Array }>();
  function guarded<T>(work: () => T): DiagnosticResult<T> {
    try { return success(work()); } catch (error) {
      const code = refusal(error);
      if (code === 'RELEASE_UNAVAILABLE') {
        try { clearRing(); } catch { return failure('STORAGE_UNAVAILABLE'); }
      }
      if (code) return failure(code);
      return failure('REDACTION_FAILED');
    }
  }
  /** Invalidate all prior selections even when local removal fails; never claim that failed erase succeeded. */
  function clearRing(): void {
    epoch++;
    try { storage.clear(); } catch { return stop('STORAGE_UNAVAILABLE'); }
  }
  function context() {
    const verified = revalidateRelease(release);
    if (!verified.ok || !Number.isSafeInteger(schema) || schema < verified.value.manifest.minStorageSchema || schema > verified.value.manifest.maxStorageSchema) return stop('RELEASE_UNAVAILABLE');
    let now: number; try { now = clock(); } catch { return stop(); }
    if (!Number.isSafeInteger(now) || now < 0 || now > 253402300799) return stop();
    highWater = Math.max(highWater, now); now = highWater;
    if (now < verified.value.manifest.createdAt || now >= verified.value.manifest.expiresAt) return stop('RELEASE_UNAVAILABLE');
    return { releaseId: verified.value.manifest.releaseId, now };
  }
  function write(events: readonly DiagnosticEvent[]): string {
    const text = serialize(events); if (encode({ v: 1, events }).byteLength > DIAGNOSTIC_LIMITS.bytes) return stop('REPORT_TOO_LARGE');
    try { storage.write(text); } catch { return stop('STORAGE_UNAVAILABLE'); } return text;
  }
  function read(ctx: ReturnType<typeof context>): { events: DiagnosticEvent[]; warnings: DiagnosticWarning[]; serialized: string } {
    let text: string | null; try { text = storage.read(); } catch { return stop('STORAGE_UNAVAILABLE'); }
    let candidates: unknown[] = [], dirty = false;
    const warnings = new Set<DiagnosticWarning>();
    if (text !== null) {
      try {
        if (typeof text !== 'string' || text.length > DIAGNOSTIC_LIMITS.bytes || new TextEncoder().encode(text).length > DIAGNOSTIC_LIMITS.bytes) throw Error();
        const raw = exact(JSON.parse(text), ['v', 'events']);
        if (raw.v !== 1 || !Array.isArray(raw.events) || raw.events.length > DIAGNOSTIC_LIMITS.events) throw Error();
        candidates = raw.events;
      } catch { dirty = true; warnings.add('DISCARDED_INVALID'); }
    }
    const events: DiagnosticEvent[] = [];
    for (const candidate of candidates) {
      try {
        const raw = exact(candidate, fields);
        if (raw.v !== 1 || raw.releaseId !== ctx.releaseId || raw.storageSchema !== schema || typeof raw.timeBucket !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:00:00\.000Z$/.test(raw.timeBucket)) return stop();
        const time = Date.parse(raw.timeBucket) / 1000;
        if (!Number.isFinite(time) || new Date(time * 1000).toISOString() !== raw.timeBucket || time > ctx.now || ctx.now - time >= DIAGNOSTIC_LIMITS.ageSeconds) {
          warnings.add('DISCARDED_EXPIRED'); dirty = true; continue;
        }
        const projected = inputSnapshot(Object.fromEntries(inputFields.map(field => [field, raw[field]])));
        events.push(Object.freeze({ v: 1, timeBucket: raw.timeBucket, releaseId: ctx.releaseId, ...projected, storageSchema: schema }));
      } catch { dirty = true; warnings.add('DISCARDED_INVALID'); }
    }
    const serialized = dirty ? write(events) : serialize(events);
    if (events.length === DIAGNOSTIC_LIMITS.events) warnings.add('CAP_REACHED');
    return { events, warnings: [...warnings], serialized };
  }
  function checkedSnapshot(snapshot: DiagnosticCollection): DiagnosticCollection {
    const ctx = context();
    const saved = snapshots.get(snapshot);
    if (!saved || saved.epoch !== epoch) return stop();
    const current = read(ctx); context();
    if (saved.epoch !== epoch || current.serialized !== saved.serialized) return stop();
    return snapshot;
  }
  const service: Diagnostics = Object.freeze({
    record(value: DiagnosticInput) {
      return guarded(() => {
        const ctx = context(), input = inputSnapshot(value), ring = read(ctx);
        const timeBucket = new Date(Math.floor(ctx.now / 3600) * 3600_000).toISOString();
        ring.events.push(Object.freeze({ v: 1, timeBucket, releaseId: ctx.releaseId, ...input, storageSchema: schema }));
        while (ring.events.length > DIAGNOSTIC_LIMITS.events || encode({ v: 1, events: ring.events }).length > DIAGNOSTIC_LIMITS.bytes) ring.events.shift();
        context(); write(ring.events); epoch++; context();
      });
    },
    collectDiagnostics() {
      return guarded(() => {
        try {
          const ctx = context(), ring = read(ctx); context();
          const snapshot: DiagnosticCollection = Object.freeze({ configured: true, events: Object.freeze(ring.events), warnings: Object.freeze(ring.warnings) });
          snapshots.set(snapshot, { epoch, serialized: ring.serialized }); return snapshot;
        } catch (error) {
          if (refusal(error) === 'RELEASE_UNAVAILABLE') {
            // An unauthenticated/expired context cannot retain or present earlier release metadata.
            // This ring is disposable, never a recovery/audit record; no vault data is touched.
            clearRing();
            return Object.freeze({ configured: false, events: Object.freeze([]), warnings: Object.freeze([]) });
          }
          throw error;
        }
      });
    },
    previewExport(snapshot: DiagnosticCollection, selection: readonly number[]) {
      return guarded(() => {
        checkedSnapshot(snapshot);
        if (!Array.isArray(selection) || selection.length === 0 || selection.length > DIAGNOSTIC_LIMITS.events || new Set(selection).size !== selection.length) return stop();
        const indexes = [...selection];
        if (indexes.some(index => !Number.isSafeInteger(index) || index < 0 || index >= snapshot.events.length)) return stop();
        const events = indexes.map(index => snapshot.events[index]!);
        const bytes = new TextEncoder().encode(JSON.stringify(events, null, 2)); if (bytes.length > DIAGNOSTIC_LIMITS.bytes) return stop('REPORT_TOO_LARGE');
        const rows = events.flatMap((event, index) => fields.map(field => Object.freeze({ event: index + 1, field, value: String(event[field]) })));
        const preview = Object.freeze({ bytes, rows: Object.freeze(rows), warnings: snapshot.warnings });
        previews.set(preview, { epoch, snapshot, indexes, bytes: new Uint8Array(bytes) }); return preview;
      });
    },
    confirmExport(preview: DiagnosticPreview) {
      return guarded(() => {
        context();
        const saved = previews.get(preview);
        if (!saved || saved.epoch !== epoch) return stop();
        checkedSnapshot(saved.snapshot);
        if (!sameBytes(saved.bytes, preview.bytes)) return stop();
        return new Uint8Array(saved.bytes);
      });
    },
    clearDiagnostics() { return guarded(() => { clearRing(); }); },
  });
  return service;
}
