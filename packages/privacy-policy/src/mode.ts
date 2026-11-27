/** Local scoped orchestration over actual G05/G14. Never changes funded terms or native exit authorization. */
import { createExtensionRegistry, EXTENSION_LIMITS, type ExtensionRegistry, type ExtensionContext } from '../../extensions/index.ts';
import type { SessionTransportPolicy } from '../../transport/index.ts';
import type { CoreResult, CoreErrorCode } from '../../schemas/index.ts';
import { createPolicyRuntime, evaluatePolicy, runtimeState, type CapabilityNode, type PolicyEvaluation, type UnbrokeredPath } from './plan.ts';
import { attempt, errorCode, failure, invalid, snapshotPolicy, type FeaturePolicy } from './policy.ts';
export type ModePhase = 'inactive' | 'validating' | 'active' | 'degraded' | 'blocked' | 'leaving';
export interface ModeSnapshot {
  readonly state: ModePhase; readonly policyGeneration: number; readonly requestedMode: FeaturePolicy['mode'] | null;
  readonly preparationFrozen: boolean; readonly reason: CoreErrorCode | null; readonly evaluation: PolicyEvaluation | null;
}
export interface ModeController {
  requestMode(policy: FeaturePolicy, options?: { readonly ordinaryConsent: boolean }): Promise<CoreResult<ModeSnapshot>>;
  onEvidenceChanged(): void;
  cancelTransition(generation: number): void;
  inspectMode(): ModeSnapshot;
  dispose(): Promise<void>;
}
export interface ModeControllerOptions {
  readonly broker: SessionTransportPolicy; readonly catalog?: readonly CapabilityNode[]; readonly unbrokeredPaths?: readonly UnbrokeredPath[];
  readonly context?: ExtensionContext;
  /** Trusted compiled factory; each registry owns fresh G14 instances. Bind their transport work to the supplied initialization signal. */
  readonly createRegistry?: (generation: number, isCurrent: (generation: number) => boolean) => CoreResult<ExtensionRegistry>;
}
export function createModeController(options: ModeControllerOptions): ModeController {
  const broker = options.broker;
  // Snapshot/validate the compiled catalog using the same source validator; the probe registry owns no modules.
  const probe = createExtensionRegistry(); if (!probe.ok) throw Error('Local policy configuration unavailable.');
  const compiled = createPolicyRuntime({ broker, registry: probe.value, ...(options.catalog ? { catalog: options.catalog } : {}), ...(options.unbrokeredPaths ? { unbrokeredPaths: options.unbrokeredPaths } : {}) });
  if (!compiled.ok) { void probe.value.disposeAll(); throw Error('Invalid compiled policy catalog.'); }
  const frozen = runtimeState(compiled.value); void probe.value.disposeAll();
  const factory = options.createRegistry ?? ((generation, isCurrent) => createExtensionRegistry({ generation, isCurrent }));
  const context = options.context ?? Object.freeze({ readTrade: () => null, proposeIntent: () => failure('UNSUPPORTED_PROVIDER') });
  let generation = 0, closed = false, busy = false;
  let registry: ExtensionRegistry | undefined, controller: AbortController | undefined;
  let physical: Promise<void> | undefined, disposal: Promise<void> | undefined;
  let cleanup: Promise<void> | undefined, activePolicy: FeaturePolicy | undefined, activeBrokerGeneration = -1;
  let snapshot: ModeSnapshot = Object.freeze({ state: 'inactive', policyGeneration: generation, requestedMode: null, preparationFrozen: true, reason: null, evaluation: null });
  const publish = (state: ModePhase, reason: CoreErrorCode | null = null, evaluation: PolicyEvaluation | null = null): void => {
    snapshot = Object.freeze({ state, policyGeneration: generation, requestedMode: activePolicy?.mode ?? null, preparationFrozen: state !== 'active' || evaluation?.canPrepare !== true, reason, evaluation });
  };
  const nextGeneration = (): boolean => { if (generation >= Number.MAX_SAFE_INTEGER - 1) { closed = true; return false; } generation++; return true; };
  const closeRegistry = (target: ExtensionRegistry | undefined): Promise<void> => {
    if (!target) return Promise.resolve();
    const closing = attempt(() => Promise.resolve(target.disposeAll()).then(() => undefined, () => undefined));
    return closing.ok ? closing.value : Promise.resolve();
  };
  const retire = (reason: CoreErrorCode): void => {
    if (closed || busy) return;
    busy = true; nextGeneration();
    publish(activePolicy?.mode === 'strict-private' ? 'blocked' : 'degraded', reason);
    const previous = registry; registry = undefined;
    // Own the retirement drain before abort, revocation or registry cleanup can reenter disposal.
    let finishDrain!: () => void;
    const drain = new Promise<void>(resolve => { finishDrain = resolve; }); cleanup = drain;
    void drain.finally(() => { if (cleanup === drain) { cleanup = undefined; busy = false; } });
    // Retire only this controller's G14 work. Unrelated core scopes share the broker.
    try { controller?.abort(); }
    finally { void closeRegistry(previous).then(finishDrain); }
  };
  const evidenceChanged = (): void => {
    if (closed || busy || snapshot.state !== 'active' || !activePolicy || !registry) return;
    const runtime = createPolicyRuntime({ broker, registry, catalog: frozen.catalog, unbrokeredPaths: frozen.paths });
    const checked = runtime.ok ? evaluatePolicy(activePolicy, runtime.value) : runtime;
    if (!checked.ok || broker.generation !== activeBrokerGeneration || !checked.value.canPrepare || snapshot.evaluation?.nodes.some(node => node.state === 'enabled' && checked.value.nodes.find(next => next.name === node.name)?.state !== 'enabled')) retire(checked.ok ? 'UNAVAILABLE' : checked.error.code);
    else publish('active', null, checked.value);
  };
  let unsubscribe = (): void => undefined;
  try { unsubscribe = broker.subscribeInvalidation(evidenceChanged); } catch { closed = true; publish('blocked', 'UNAVAILABLE'); }
  return Object.freeze({
    async requestMode(input: FeaturePolicy, consent?: { readonly ordinaryConsent: boolean }): Promise<CoreResult<ModeSnapshot>> {
      if (closed) return failure('LOCKED'); if (busy) return failure('LIMIT_EXCEEDED');
      busy = true; let finishPhysical = (): void => undefined;
      const physicalJob = new Promise<void>(resolve => { finishPhysical = resolve; }); physical = physicalJob;
      const admissionGeneration = generation;
      try {
      const parsed = attempt(() => snapshotPolicy(input)); if (!parsed.ok) return parsed;
      let ordinaryConsent = false;
      try { const descriptor = consent === undefined ? undefined : Object.getOwnPropertyDescriptor(consent, 'ordinaryConsent'); ordinaryConsent = descriptor !== undefined && 'value' in descriptor && descriptor.value === true; } catch { return failure('INVALID_INPUT'); }
      if (closed || generation !== admissionGeneration) return failure('CANCELLED');
      if (broker.mode === 'strict' && parsed.value.mode === 'ordinary' && !ordinaryConsent) return failure('UNAUTHORIZED');
      if (!nextGeneration()) return failure('LIMIT_EXCEEDED');
      const mine = generation, control = new AbortController(), previousControl = controller; controller = control;
      const previous = registry; registry = undefined; activePolicy = parsed.value;
      publish(broker.mode === 'strict' && activePolicy.mode === 'ordinary' ? 'leaving' : 'validating');
      previousControl?.abort();
      let candidate: ExtensionRegistry | undefined, retained = false, brokerGeneration = -1;
      let previousDrain: Promise<void> | undefined;
      const drainPrevious = (): Promise<void> => previousDrain ??= closeRegistry(previous);
      const current = (): boolean => !closed && generation === mine && !control.signal.aborted && broker.generation === brokerGeneration;
      try {
        // Revoke real native scopes before the first await, including same-mode policy replacements.
        if (broker.invalidate() !== undefined) invalid('UNAVAILABLE');
        if (closed || generation !== mine || control.signal.aborted) invalid('CANCELLED');
        if (broker.setMode(activePolicy.mode === 'strict-private' ? 'strict' : 'ordinary') !== undefined) invalid('UNAVAILABLE');
        brokerGeneration = broker.generation;
        await drainPrevious();
        if (!current()) invalid('CANCELLED'); publish('validating');
        const created = factory(mine, expected => current() && expected === mine);
        if (!created.ok) invalid(created.error.code); candidate = created.value;
        if (candidate.generation !== mine || !current()) invalid('CANCELLED');
        const runtime = createPolicyRuntime({ broker, registry: candidate, catalog: frozen.catalog, unbrokeredPaths: frozen.paths });
        if (!runtime.ok) invalid(runtime.error.code);
        let evaluated = evaluatePolicy(activePolicy, runtime.value);
        if (!evaluated.ok) invalid(evaluated.error.code); if (!evaluated.value.canPrepare) invalid('UNSUPPORTED_PROVIDER');
        const native = runtimeState(runtime.value), modules = new Map<string, CapabilityNode>();
        for (const node of native.catalog) if (evaluated.value.nodes.some(value => value.name === node.name && value.state === 'enabled')) modules.set(`${node.moduleId}:${node.protocolVersion}`, node);
        if (modules.size > EXTENSION_LIMITS.modules) invalid('LIMIT_EXCEEDED');
        for (const node of modules.values()) {
          if (!current()) invalid('CANCELLED');
          const instance = candidate.resolve(node.moduleId, node.protocolVersion); if (!instance) invalid('UNSUPPORTED_PROVIDER');
          const result = await instance.initialize(context, control.signal);
          if (!current()) invalid('CANCELLED'); if (!result.ok) invalid(result.error.code);
        }
        evaluated = evaluatePolicy(activePolicy, runtime.value);
        if (!current()) invalid('CANCELLED'); if (!evaluated.ok) invalid(evaluated.error.code); if (!evaluated.value.canPrepare) invalid('UNSUPPORTED_PROVIDER');
        registry = candidate; retained = true; activeBrokerGeneration = brokerGeneration; publish('active', null, evaluated.value);
        return Object.freeze({ ok: true, value: snapshot });
      } catch (error) {
        const code = closed || generation !== mine || control.signal.aborted ? 'CANCELLED' : errorCode(error);
        if (generation === mine && !closed) publish('blocked', code);
        return failure(code);
      } finally {
        await drainPrevious();
        if (!retained) { control.abort(); await closeRegistry(candidate); }
      }
      } finally {
        busy = false; if (physical === physicalJob) physical = undefined; finishPhysical();
      }
    },
    onEvidenceChanged: evidenceChanged,
    cancelTransition(expected: number): void {
      if (closed || !busy || !Number.isSafeInteger(expected) || expected !== generation) return;
      nextGeneration(); publish('blocked', 'CANCELLED'); controller?.abort();
    },
    inspectMode(): ModeSnapshot { evidenceChanged(); return snapshot; },
    dispose(): Promise<void> {
      if (disposal) return disposal;
      // Publish the completion promise before synchronous abort/revocation callbacks can reenter.
      let finish!: () => void, reject!: (reason: unknown) => void;
      disposal = new Promise<void>((resolve, fail) => { finish = resolve; reject = fail; });
      void (async () => {
        if (closed) { await Promise.all([...(cleanup ? [cleanup] : []), ...(physical ? [physical] : [])]); return; }
        closed = true; nextGeneration(); publish('inactive', 'CANCELLED'); controller?.abort();
        try { unsubscribe(); } catch { /* Finish native resource revocation. */ } unsubscribe = () => undefined;
        publish('inactive', 'CANCELLED'); const previous = registry; registry = undefined;
        const drained = closeRegistry(previous); await Promise.all([drained, ...(cleanup ? [cleanup] : []), ...(physical ? [physical] : [])]);
      })().then(finish, reject);
      return disposal;
    },
  });
}
