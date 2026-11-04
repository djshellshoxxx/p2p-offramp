/** Source-bound evaluation over existing G05/G14. No imported status can implement this runtime capability. */
import type { ExtensionRegistry } from '../../extensions/index.ts';
import type { SessionTransportPolicy } from '../../transport/index.ts';
import { transportChannel, type TransportChannel, type RouteEvidence, type CoreResult } from '../../schemas/index.ts';
import { POLICY_LIMITS, array, attempt, counter, identifier, invalid, name, record, reference, snapshotPolicy, strings, type CapabilityReference, type FeaturePolicy } from './policy.ts';
export type UnbrokeredPath = 'static' | 'webrtc' | 'sdk';
export interface CapabilityNode extends CapabilityReference {
  readonly moduleId: string; readonly profileId: string | null; readonly mandatory: boolean;
  readonly dependencies: readonly string[]; readonly conflicts: readonly string[]; readonly channels: readonly TransportChannel[];
  readonly unbrokeredPaths: readonly UnbrokeredPath[]; readonly dataClasses: readonly ('public' | 'private' | 'secret')[];
}
export type PlanReason = 'ENABLED' | 'DISABLED' | 'UNSUPPORTED_PROVIDER' | 'MISSING_PROFILE' | 'DEPENDENCY_BLOCKED' | 'CONFLICT' | 'ROUTE_UNAVAILABLE' | 'UNBROKERED_PATH';
export interface NodeEvaluation { readonly name: string; readonly profileId: string | null; readonly routes: readonly RouteEvidence[]; readonly state: 'enabled' | 'disabled' | 'blocked'; readonly reasons: readonly PlanReason[]; }
export interface PolicyEvaluation {
  readonly policy: FeaturePolicy; readonly nodes: readonly NodeEvaluation[]; readonly canPrepare: boolean;
  readonly brokerGeneration: number; readonly registryGeneration: number; readonly blockedPaths: readonly UnbrokeredPath[];
  /** This is a configuration prerequisite; native custody/preflight/consent and exits remain outside this policy. */
  readonly economicAuthority: false;
}
export interface PolicyRuntimeOptions {
  readonly broker: SessionTransportPolicy; readonly registry: ExtensionRegistry; readonly catalog?: readonly CapabilityNode[];
  /** Actual compiled active paths outside the six G05 channels; browser defaults include static loading. */
  readonly unbrokeredPaths?: readonly UnbrokeredPath[];
}
interface RuntimeState { readonly broker: SessionTransportPolicy; readonly registry: ExtensionRegistry; readonly catalog: readonly CapabilityNode[]; readonly paths: readonly UnbrokeredPath[]; }
export interface PolicyRuntime { readonly kind: 'native-policy-runtime'; }
const states = new WeakMap<object, RuntimeState>();
const path = (input: unknown): UnbrokeredPath => input === 'static' || input === 'webrtc' || input === 'sdk' ? input : invalid();
function catalog(input: unknown): readonly CapabilityNode[] {
  const nodes = array(input, POLICY_LIMITS.nodes).map(input => {
    const raw = record(input, ['name', 'protocolVersion', 'schemaHash', 'moduleId', 'profileId', 'mandatory', 'dependencies', 'conflicts', 'channels', 'unbrokeredPaths', 'dataClasses']);
    const ref = reference({ name: raw.name, protocolVersion: raw.protocolVersion, schemaHash: raw.schemaHash });
    if (typeof raw.mandatory !== 'boolean' || typeof raw.moduleId !== 'string' || !/^[a-z0-9-]{1,64}$/.test(raw.moduleId)) invalid();
    const channels = array(raw.channels, 6).map(value => { try { return transportChannel(value); } catch { return invalid(); } });
    if (new Set(channels).size !== channels.length) invalid('CONFLICT');
    return Object.freeze({ ...ref, moduleId: identifier(raw.moduleId), profileId: raw.profileId === null ? null : identifier(raw.profileId), mandatory: raw.mandatory,
      dependencies: strings(raw.dependencies, 32), conflicts: strings(raw.conflicts, 32), channels: Object.freeze(channels),
      unbrokeredPaths: strings(raw.unbrokeredPaths, 3, path) as readonly UnbrokeredPath[],
      dataClasses: strings(raw.dataClasses, 3, value => value === 'public' || value === 'private' || value === 'secret' ? value : invalid()) as readonly ('public' | 'private' | 'secret')[] });
  });
  const byName = new Map(nodes.map(node => [node.name, node])); if (byName.size !== nodes.length) invalid('CONFLICT');
  const visiting = new Set<string>(), done = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) invalid('CONFLICT'); if (done.has(id)) return;
    const node = byName.get(id); if (!node) invalid('UNSUPPORTED_PROVIDER');
    visiting.add(id); for (const dependency of node.dependencies) visit(dependency); visiting.delete(id); done.add(id);
    for (const conflict of node.conflicts) if (!byName.has(conflict) || conflict === id) invalid('CONFLICT');
  };
  for (const node of nodes) visit(node.name);
  return Object.freeze(nodes);
}
export function createPolicyRuntime(options: PolicyRuntimeOptions): CoreResult<PolicyRuntime> {
  return attempt(() => {
    const native = Object.freeze({ kind: 'native-policy-runtime' as const });
    states.set(native, { broker: options.broker, registry: options.registry, catalog: catalog(options.catalog ?? []), paths: strings(options.unbrokeredPaths ?? ['static'], 3, path) as readonly UnbrokeredPath[] });
    return native;
  });
}
export function runtimeState(runtime: PolicyRuntime): RuntimeState {
  const state = typeof runtime === 'object' && runtime !== null ? states.get(runtime) : undefined;
  if (!state) invalid('INVALID_INPUT'); return state;
}
export function evaluatePolicy(input: FeaturePolicy, runtime: PolicyRuntime): CoreResult<PolicyEvaluation> {
  return attempt(() => {
    const policy = snapshotPolicy(input), source = runtimeState(runtime), { broker, registry } = source;
    const brokerGeneration = counter(broker.generation), registryGeneration = counter(registry.generation);
    if (!registry.negotiate([]).ok) invalid('LOCKED');
    if (broker.mode !== (policy.mode === 'strict-private' ? 'strict' : 'ordinary')) invalid('CONFLICT');
    const byName = new Map(source.catalog.map(node => [node.name, node]));
    const refs = [...policy.required, ...policy.optional, ...policy.disabled];
    for (const ref of refs) { const node = byName.get(ref.name); if (!node || node.protocolVersion !== ref.protocolVersion || node.schemaHash !== ref.schemaHash) invalid('UNSUPPORTED_PROVIDER'); }
    for (const id of policy.profileIds) if (!source.catalog.some(node => node.profileId === id)) invalid('UNSUPPORTED_PROVIDER');
    const disabled = new Set(policy.disabled.map(ref => ref.name));
    for (const node of source.catalog) if (node.mandatory && disabled.has(node.name)) invalid('UNAUTHORIZED');
    const required = new Set([...policy.required.map(ref => ref.name), ...source.catalog.filter(node => node.mandatory).map(node => node.name)]);
    const active = new Set([...required, ...policy.optional.map(ref => ref.name)]);
    const expand = (id: string): void => { for (const dependency of byName.get(id)!.dependencies) if (!active.has(dependency)) { active.add(dependency); expand(dependency); } };
    for (const id of [...active]) expand(id);
    const requiredClosure = new Set(required);
    const requireDependencies = (id: string): void => { for (const dependency of byName.get(id)!.dependencies) if (!requiredClosure.has(dependency)) { requiredClosure.add(dependency); requireDependencies(dependency); } };
    for (const id of required) requireDependencies(id);
    const evaluations = new Map<string, NodeEvaluation>();
    const evaluate = (id: string): NodeEvaluation => {
      const existing = evaluations.get(id); if (existing) return existing;
      const node = byName.get(id)!; const reasons: PlanReason[] = [];
      if (!active.has(id) || disabled.has(id)) { const value = Object.freeze({ name: id, profileId: node.profileId, routes: Object.freeze([]), state: 'disabled' as const, reasons: Object.freeze(['DISABLED'] as PlanReason[]) }); evaluations.set(id, value); return value; }
      const instance = registry.resolve(node.moduleId, node.protocolVersion);
      if (!instance || instance.manifest.id !== node.moduleId || instance.manifest.protocolVersion !== node.protocolVersion || !instance.manifest.capabilities.includes(id) || !instance.manifest.schemaHashes.includes(node.schemaHash)) reasons.push('UNSUPPORTED_PROVIDER');
      if (node.profileId !== null && !policy.profileIds.includes(node.profileId) || node.channels.length > 0 && node.profileId === null) reasons.push('MISSING_PROFILE');
      for (const dependency of node.dependencies) if (evaluate(dependency).state !== 'enabled') reasons.push('DEPENDENCY_BLOCKED');
      if (node.conflicts.some(conflict => active.has(conflict) && !disabled.has(conflict))) reasons.push('CONFLICT');
      const routes = Object.freeze(node.channels.map(channel => broker.inspect(channel)));
      if (policy.mode === 'strict-private' && node.unbrokeredPaths.length) reasons.push('UNBROKERED_PATH');
      for (const evidence of routes) if (evidence.generation !== brokerGeneration ||
        (policy.mode === 'strict-private' ? evidence.coverage !== 'verified-private' : evidence.coverage !== 'verified-private' && evidence.coverage !== 'direct')) reasons.push('ROUTE_UNAVAILABLE');
      const value: NodeEvaluation = Object.freeze({ name: id, profileId: node.profileId, routes, state: reasons.length ? 'blocked' : 'enabled', reasons: Object.freeze(reasons.length ? [...new Set(reasons)] : ['ENABLED'] as PlanReason[]) }); evaluations.set(id, value); return value;
    };
    for (const node of source.catalog) evaluate(node.name);
    // G14 initializes exact atomic manifests, not per-capability subsets. Refuse partial activation.
    const groups = new Map<string, { readonly names: readonly string[]; readonly invalid: PlanReason | null }>();
    for (const node of source.catalog) {
      if (!active.has(node.name) || disabled.has(node.name)) continue;
      const key = `${node.moduleId}:${node.protocolVersion}`; if (groups.has(key)) continue;
      const instance = registry.resolve(node.moduleId, node.protocolVersion); if (!instance) continue;
      const manifest = instance.manifest, names = manifest.capabilities;
      const complete = names.every(id => { const member = byName.get(id); return member?.moduleId === node.moduleId && member.protocolVersion === node.protocolVersion && active.has(id) && !disabled.has(id); });
      const hashes = new Set(names.map(id => byName.get(id)?.schemaHash));
      const exactHashes = !hashes.has(undefined) && manifest.schemaHashes.length === hashes.size && manifest.schemaHashes.every(hash => hashes.has(hash));
      groups.set(key, { names, invalid: !complete ? 'CONFLICT' : !exactHashes ? 'UNSUPPORTED_PROVIDER' : null });
    }
    const block = (id: string, reason: PlanReason): boolean => {
      if (evaluations.get(id)?.state !== 'enabled') return false;
      evaluations.set(id, Object.freeze({ ...evaluations.get(id)!, state: 'blocked', reasons: Object.freeze([reason]) })); return true;
    };
    // Each changing pass removes at least one enabled node; <=64 passes, with no retry or external work.
    let changed: boolean;
    do {
      changed = false;
      for (const group of groups.values()) {
        const reason = group.invalid ?? (group.names.some(id => evaluations.get(id)?.state !== 'enabled') ? 'DEPENDENCY_BLOCKED' : null);
        if (reason) for (const id of group.names) changed = block(id, reason) || changed;
      }
      for (const node of source.catalog) if (node.dependencies.some(id => evaluations.get(id)?.state !== 'enabled')) changed = block(node.name, 'DEPENDENCY_BLOCKED') || changed;
    } while (changed);
    // A missing optional root must not initialize otherwise-available dependency modules just for itself.
    const retained = new Set<string>();
    const retain = (id: string): void => { if (retained.has(id)) return; retained.add(id); for (const dependency of byName.get(id)!.dependencies) retain(dependency); };
    for (const id of [...required, ...policy.optional.map(ref => ref.name)]) if (evaluations.get(id)?.state === 'enabled') retain(id);
    for (const [id, value] of evaluations) if (value.state === 'enabled' && !retained.has(id)) evaluations.set(id, Object.freeze({ ...value, state: 'disabled', reasons: Object.freeze(['DISABLED'] as PlanReason[]) }));
    if (broker.generation !== brokerGeneration || registry.generation !== registryGeneration || !registry.negotiate([]).ok) invalid('CANCELLED');
    const blockedPaths = policy.mode === 'strict-private' ? source.paths : Object.freeze([]);
    const canPrepare = blockedPaths.length === 0 && [...requiredClosure].every(id => evaluations.get(id)?.state === 'enabled');
    return Object.freeze({ policy, nodes: Object.freeze([...evaluations.values()].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)), canPrepare, brokerGeneration, registryGeneration, blockedPaths, economicAuthority: false });
  });
}
export const validatePrivacyPlan = evaluatePolicy;
