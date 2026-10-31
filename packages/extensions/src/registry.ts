/** G14 bundled-code discipline, not a same-origin JavaScript sandbox or spending authority. */
import { createCoreError, createOperationId, normalizeError } from '../../domain/index.ts';
import { parseTradeBinding, parseChainObservation, sameBinding, parseIntentId, type CoreResult, type CoreErrorCode, type TradeBinding, type TradeView } from '../../schemas/index.ts';
import { array, capabilityName, EXTENSION_LIMITS, identifier, inputError, invalid, manifest, record, snapshotProposal, strings, type ExtensionManifestV1, type NegotiatedCapabilitySet } from './manifest.ts';
export type { ExtensionManifestV1, NegotiatedCapabilitySet } from './manifest.ts';
export { EXTENSION_LIMITS } from './manifest.ts';

export interface ExtensionContext {
  readTrade(binding: TradeBinding): Readonly<TradeView> | null;
  /** Core must still perform account/network/state/preflight/journal/consent checks. */
  proposeIntent(binding: TradeBinding, intent: unknown): CoreResult<string>;
}
export interface ExtensionInstance {
  readonly manifest: ExtensionManifestV1;
  initialize(context: Readonly<ExtensionContext>, signal: AbortSignal): Promise<CoreResult<void>>;
  dispose(): Promise<void>;
}
export interface ValidatedExtensionProposal { readonly schemaHash: string; readonly value: unknown; }
export interface ExtensionRegistration {
  readonly instance: ExtensionInstance;
  /** Trusted bundled parser registered before initialization; no parser means proposals are unsupported. */
  readonly validateProposal?: (binding: TradeBinding, input: unknown) => CoreResult<ValidatedExtensionProposal>;
}
export interface ExtensionRegistryOptions {
  readonly entries?: readonly ExtensionRegistration[];
  readonly registeredCapabilities?: readonly string[];
  readonly generation?: number;
  /** Trusted owner hook: revoke this registry when its active generation retires. */
  readonly isCurrent?: (generation: number) => boolean;
}
export interface ExtensionRegistry {
  readonly generation: number;
  resolve(id: string, protocolVersion: number): ExtensionInstance | null;
  negotiate(manifests: unknown): CoreResult<NegotiatedCapabilitySet>;
  disposeAll(): Promise<void>;
}
type Phase = 'idle' | 'initializing' | 'ready' | 'disabled' | 'disposed';
interface Entry {
  readonly manifest: ExtensionManifestV1;
  readonly start: ExtensionInstance['initialize']; readonly stop: ExtensionInstance['dispose'];
  readonly validate: ExtensionRegistration['validateProposal'];
  phase: Phase; controller: AbortController | undefined; pending: Promise<CoreResult<void>> | undefined;
  drain: Promise<void> | undefined; reason: 'LOCKED' | 'CANCELLED'; facade: ExtensionInstance | undefined;
  detach: (() => void) | undefined;
}
const success = <T>(value: T): CoreResult<T> => Object.freeze({ ok: true, value });
const failure = (code: CoreErrorCode): CoreResult<never> => Object.freeze({ ok: false, error: createCoreError(code, { operationId: createOperationId(), readOnly: false }) });
function result(input: unknown): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: unknown } {
  const first = record(input, ['ok'], ['value', 'error']);
  if (first.ok === true) { const raw = record(input, ['ok', 'value']); return { ok: true, value: raw.value }; }
  if (first.ok === false) { const raw = record(input, ['ok', 'error']); return { ok: false, error: raw.error }; }
  return invalid('INTEGRITY_FAILURE');
}
const sanitizedFailure = (error: unknown): CoreResult<never> => ({ ok: false, error: normalizeError(error, { operationId: createOperationId(), phase: 'prepare' }) });
function snapshotView(input: unknown, binding: TradeBinding): Readonly<TradeView> {
  const raw = record(input, ['binding', 'chain', 'chainHealth', 'pendingIntentIds', 'fiatClaim', 'walletGeneration']);
  const parsedBinding = parseTradeBinding(raw.binding);
  if (!sameBinding(binding, parsedBinding)) invalid('WRONG_CHAIN');
  const chain = raw.chain === null ? null : parseChainObservation(raw.chain);
  if (chain && !sameBinding(binding, chain.binding)) invalid('WRONG_CHAIN');
  if (raw.chainHealth !== 'loading' && raw.chainHealth !== 'fresh' && raw.chainHealth !== 'stale' && raw.chainHealth !== 'unavailable' && raw.chainHealth !== 'reorged') invalid();
  if (raw.fiatClaim !== 'none' && raw.fiatClaim !== 'buyer-claims-paid' && raw.fiatClaim !== 'seller-attests-received') invalid();
  if (typeof raw.walletGeneration !== 'number' || !Number.isSafeInteger(raw.walletGeneration) || raw.walletGeneration < 0) invalid();
  const pendingIntentIds = array(raw.pendingIntentIds, 1024).map(parseIntentId);
  if (new Set(pendingIntentIds).size !== pendingIntentIds.length) invalid();
  return Object.freeze({ binding: parsedBinding, chain, chainHealth: raw.chainHealth, pendingIntentIds: Object.freeze(pendingIntentIds), fiatClaim: raw.fiatClaim, walletGeneration: raw.walletGeneration });
}

export function parseExtensionManifest(input: unknown): CoreResult<ExtensionManifestV1> {
  try { return success(manifest(input)); } catch (error) { return failure(inputError(error)); }
}

/** One registry owns one generation. Dispose it and supply fresh bundled instances for the next generation. */
export function createExtensionRegistry(options: ExtensionRegistryOptions = {}): CoreResult<ExtensionRegistry> {
  let generation: number, check: ExtensionRegistryOptions['isCurrent'];
  const entries = new Map<string, Entry>(); let closed = false, allDrain: Promise<void> | undefined;
  const key = (id: string, version: number): string => `${id}:${version}`;
  try {
    const raw = record(options, [], ['entries', 'registeredCapabilities', 'generation', 'isCurrent']);
    const nextGeneration = raw.generation === undefined ? 0 : raw.generation;
    if (typeof nextGeneration !== 'number' || !Number.isSafeInteger(nextGeneration) || nextGeneration < 0) invalid();
    generation = nextGeneration;
    if (raw.isCurrent !== undefined && typeof raw.isCurrent !== 'function') invalid();
    check = raw.isCurrent as ExtensionRegistryOptions['isCurrent'];
    const registered = new Set(strings(raw.registeredCapabilities === undefined ? [] : raw.registeredCapabilities, 256, capabilityName));
    const seenInstances = new Set<object>();
    for (const candidate of array(raw.entries === undefined ? [] : raw.entries, EXTENSION_LIMITS.registrations)) {
      const registration = record(candidate, ['instance'], ['validateProposal']);
      const instance = record(registration.instance, ['manifest', 'initialize', 'dispose']);
      const declared = manifest(instance.manifest);
      if (declared.capabilities.some(capability => !registered.has(capability))) invalid('UNSUPPORTED_PROVIDER');
      if (typeof instance.initialize !== 'function' || typeof instance.dispose !== 'function' ||
          registration.validateProposal !== undefined && typeof registration.validateProposal !== 'function') invalid();
      if (seenInstances.has(registration.instance as object) || entries.has(key(declared.id, declared.protocolVersion))) invalid('CONFLICT');
      seenInstances.add(registration.instance as object);
      const entry: Entry = { manifest: declared, start: instance.initialize.bind(registration.instance) as Entry['start'], stop: instance.dispose.bind(registration.instance) as Entry['stop'],
        validate: registration.validateProposal as Entry['validate'], phase: 'idle', controller: undefined, pending: undefined, drain: undefined, reason: 'LOCKED', facade: undefined, detach: undefined };
      entries.set(key(declared.id, declared.protocolVersion), entry);
    }
  } catch (error) { return failure(inputError(error)); }
  const current = (): boolean => {
    if (closed) return false;
    try { if (check === undefined || check(generation) === true) return true; } catch { /* Retire a failing owner hook, without exposing it. */ }
    void closeAll(); return false;
  };
  const live = (entry: Entry): boolean => current() && (entry.phase === 'initializing' || entry.phase === 'ready') && !entry.controller?.signal.aborted;
  const dispose = (entry: Entry, reason: Entry['reason'] = 'LOCKED'): Promise<void> => {
    if (entry.drain) return entry.drain;
    let finish: () => void = () => {};
    entry.drain = new Promise(resolve => { finish = resolve; });
    entry.reason = reason; entry.phase = 'disposed'; entry.detach?.(); entry.detach = undefined; entry.controller?.abort();
    // Revoke first, then invoke module cleanup. Drain initialization too: no reused physical instance after disposal.
    let stopped: Promise<unknown>;
    try { stopped = Promise.resolve(entry.stop()); } catch { stopped = Promise.resolve(); }
    void Promise.allSettled([stopped, ...(entry.pending ? [entry.pending] : [])]).then(finish);
    return entry.drain;
  };
  function closeAll(): Promise<void> {
    if (allDrain) return allDrain;
    let finish: () => void = () => {};
    allDrain = new Promise(resolve => { finish = resolve; }); closed = true;
    void Promise.all([...entries.values()].map(entry => dispose(entry))).then(finish);
    return allDrain;
  }
  for (const entry of entries.values()) {
    entry.facade = Object.freeze({ manifest: entry.manifest,
      async initialize(context: Readonly<ExtensionContext>, signal: AbortSignal): Promise<CoreResult<void>> {
        if (!current() || entry.phase === 'disposed') return failure('LOCKED');
        if (entry.phase === 'disabled') return failure('UNSUPPORTED_PROVIDER');
        try {
          if (typeof signal?.aborted !== 'boolean' || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function') return failure('INVALID_INPUT');
          if (signal.aborted) return failure('CANCELLED');
        } catch { return failure('INVALID_INPUT'); }
        if (entry.phase === 'ready') return success(undefined);
        if (entry.phase === 'initializing') return failure('CONFLICT');
        let read: ExtensionContext['readTrade'], propose: ExtensionContext['proposeIntent'];
        try {
          const ports = record(context, ['readTrade', 'proposeIntent']);
          if (typeof ports.readTrade !== 'function' || typeof ports.proposeIntent !== 'function') invalid();
          read = ports.readTrade.bind(context) as typeof read; propose = ports.proposeIntent.bind(context) as typeof propose;
        } catch (error) { return failure(inputError(error)); }
        entry.phase = 'initializing'; const controller = new AbortController(); entry.controller = controller;
        const scoped: Readonly<ExtensionContext> = Object.freeze({
          readTrade(binding: TradeBinding): Readonly<TradeView> | null {
            if (!live(entry)) return null;
            try { const parsed = parseTradeBinding(binding), value = read(parsed); if (!live(entry) || value === null) return null; return snapshotView(value, parsed); } catch { return null; }
          },
          proposeIntent(binding: TradeBinding, input: unknown): CoreResult<string> {
            if (!live(entry) || entry.phase !== 'ready') return failure('LOCKED');
            if (!entry.validate) return failure('UNSUPPORTED_PROVIDER');
            try {
              const parsed = parseTradeBinding(binding), payload = snapshotProposal(input);
              const checked = result(entry.validate(parsed, payload));
              if (!live(entry)) return failure('LOCKED');
              if (!checked.ok) return sanitizedFailure(checked.error);
              const validated = record(checked.value, ['schemaHash', 'value']);
              if (typeof validated.schemaHash !== 'string' || !entry.manifest.schemaHashes.includes(validated.schemaHash)) return failure('UNSUPPORTED_PROVIDER');
              const detached = snapshotProposal(validated.value);
              if (!live(entry)) return failure('LOCKED');
              const submitted = result(propose(parsed, Object.freeze({ schemaHash: validated.schemaHash, value: detached })));
              if (!live(entry)) return failure('LOCKED');
              if (!submitted.ok) return sanitizedFailure(submitted.error);
              if (typeof submitted.value !== 'string' || !/^[A-Za-z0-9._:-]{1,256}$/.test(submitted.value)) return failure('INTEGRITY_FAILURE');
              return success(submitted.value);
            } catch (error) { return failure(inputError(error)); }
          },
        });
        let abortResolve: (result: CoreResult<void>) => void = () => {};
        const cancelled = new Promise<CoreResult<void>>(resolve => { abortResolve = resolve; });
        const abort = (): void => { void dispose(entry, 'CANCELLED'); abortResolve(failure('CANCELLED')); };
        signal.addEventListener('abort', abort, { once: true });
        entry.detach = () => signal.removeEventListener('abort', abort);
        // A microtask ensures pending is assigned before trusted code can synchronously re-enter disposal.
        entry.pending = Promise.resolve().then(async (): Promise<CoreResult<void>> => {
          try {
            if (!live(entry)) return failure(entry.reason);
            const initialized = result(await entry.start(scoped, controller.signal));
            if (!live(entry)) return failure(current() ? entry.reason : 'LOCKED');
            if (!initialized.ok) { entry.phase = 'disabled'; controller.abort(); void dispose(entry); return sanitizedFailure(initialized.error); }
            if (initialized.value !== undefined) invalid('INTEGRITY_FAILURE');
            entry.phase = 'ready'; return success(undefined);
          } catch (error) {
            if (!live(entry)) return failure(current() ? entry.reason : 'LOCKED');
            entry.phase = 'disabled'; controller.abort(); void dispose(entry); return failure(inputError(error) === 'INVALID_INPUT' ? 'UNAVAILABLE' : inputError(error));
          } finally { if (entry.phase !== 'ready') { entry.detach?.(); entry.detach = undefined; } }
        });
        if (signal.aborted) abort();
        return Promise.race([entry.pending, cancelled]);
      },
      dispose(): Promise<void> { return dispose(entry); },
    });
  }
  return success(Object.freeze({ generation,
    resolve(id: string, protocolVersion: number): ExtensionInstance | null {
      try {
        if (!current() || identifier(id) !== id || !Number.isInteger(protocolVersion)) return null;
        const entry = entries.get(key(id, protocolVersion));
        return entry && entry.phase !== 'disabled' && entry.phase !== 'disposed' ? entry.facade ?? null : null;
      } catch { return null; }
    },
    negotiate(input: unknown): CoreResult<NegotiatedCapabilitySet> {
      if (!current()) return failure('LOCKED');
      try {
        const requested = array(input, EXTENSION_LIMITS.modules).map(manifest);
        if (new Set(requested.map(item => item.id)).size !== requested.length) invalid('CONFLICT');
        for (const item of requested) {
          const entry = entries.get(key(item.id, item.protocolVersion));
          if (!entry) {
            if ([...entries.values()].some(other => other.manifest.id === item.id)) invalid('UNSUPPORTED_VERSION');
            invalid('UNSUPPORTED_PROVIDER');
          }
          if (entry.phase === 'disabled' || entry.phase === 'disposed') invalid('UNSUPPORTED_PROVIDER');
          if (JSON.stringify(item.capabilities) !== JSON.stringify(entry.manifest.capabilities) || JSON.stringify(item.schemaHashes) !== JSON.stringify(entry.manifest.schemaHashes)) invalid('UNSUPPORTED_PROVIDER');
        }
        if (!current()) return failure('LOCKED');
        return success(Object.freeze(requested.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(item => Object.freeze({ id: item.id, protocolVersion: item.protocolVersion, capabilities: item.capabilities, schemaHashes: item.schemaHashes }))));
      } catch (error) { return failure(inputError(error)); }
    },
    disposeAll: closeAll,
  }));
}
