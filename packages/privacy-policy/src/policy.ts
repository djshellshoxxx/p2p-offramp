/** Inert local policy proposals. No provider loading, network endpoints, custody or release flags. */
import { parseStrictJsonBytes, type CoreErrorCode, type CoreResult } from '../../schemas/index.ts';
import { createCoreError, createOperationId } from '../../domain/index.ts';
// Canonical, locale-independent UTF-16 code-unit order: exactly what the default sort() does for strings.
const compareCodeUnits = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
export const POLICY_LIMITS = Object.freeze({ bytes: 32_768, entries: 32, profiles: 32, nodes: 64 });
export interface CapabilityReference { readonly name: string; readonly protocolVersion: number; readonly schemaHash: string; }
export interface FeaturePolicy {
  readonly format: 'p2p-offramp-feature-policy'; readonly version: 1; readonly policyId: string; readonly revision: number;
  readonly required: readonly CapabilityReference[]; readonly optional: readonly CapabilityReference[]; readonly disabled: readonly CapabilityReference[];
  readonly mode: 'ordinary' | 'strict-private'; readonly profileIds: readonly string[];
}
const failures = new WeakMap<object, CoreErrorCode>();
class Invalid extends Error { constructor(code: CoreErrorCode) { super('Local feature policy unavailable.'); failures.set(this, createCoreError(code, { operationId: createOperationId(), readOnly: true }).code); } }
export function invalid(code: CoreErrorCode = 'INVALID_INPUT'): never { throw new Invalid(code); }
export function failure(code: CoreErrorCode): CoreResult<never> { return Object.freeze({ ok: false, error: createCoreError(code, { operationId: createOperationId(), readOnly: true }) }); }
export function errorCode(error: unknown): CoreErrorCode { return typeof error === 'object' && error !== null ? failures.get(error) ?? 'UNAVAILABLE' : 'UNAVAILABLE'; }
export function attempt<T>(read: () => T): CoreResult<T> { try { return Object.freeze({ ok: true, value: read() }); } catch (error) { return failure(errorCode(error)); } }
const reflect = <T>(read: () => T): T => { try { return read(); } catch { return invalid(); } };
export function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || reflect(() => Array.isArray(input))) invalid();
  const proto = reflect(() => Object.getPrototypeOf(input)); if (proto !== Object.prototype && proto !== null) invalid();
  const own = reflect(() => Reflect.ownKeys(input)); if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) invalid();
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) { const descriptor = reflect(() => Object.getOwnPropertyDescriptor(input, key)); if (!descriptor || !('value' in descriptor)) invalid(); out[key] = descriptor.value; }
  return out;
}
export function array(input: unknown, maximum: number): unknown[] {
  if (!reflect(() => Array.isArray(input)) || reflect(() => Object.getPrototypeOf(input)) !== Array.prototype) invalid();
  const length = reflect(() => Object.getOwnPropertyDescriptor(input, 'length'))?.value as unknown;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) invalid();
  if (length > maximum) invalid('LIMIT_EXCEEDED');
  if (reflect(() => Reflect.ownKeys(input as object)).length !== length + 1) invalid();
  const out: unknown[] = [];
  for (let index = 0; index < length; index++) { const d = reflect(() => Object.getOwnPropertyDescriptor(input, String(index))); if (!d || !('value' in d)) invalid(); out.push(d.value); }
  return out;
}
export function name(input: unknown): string { return typeof input === 'string' && /^[a-z0-9][a-z0-9._:-]{0,63}$/.test(input) ? input : invalid(); }
export function identifier(input: unknown): string { return typeof input === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(input) ? input : invalid(); }
export function counter(input: unknown): number { return typeof input === 'number' && Number.isSafeInteger(input) && input >= 0 ? input : invalid(); }
export function strings(input: unknown, maximum: number, parse: (input: unknown) => string = name): readonly string[] {
  const values = array(input, maximum).map(parse); if (new Set(values).size !== values.length) invalid('CONFLICT'); values.sort(compareCodeUnits); return Object.freeze(values);
}
export function reference(input: unknown): CapabilityReference {
  const raw = record(input, ['name', 'protocolVersion', 'schemaHash']), version = counter(raw.protocolVersion);
  if (version < 1 || version > 65535 || typeof raw.schemaHash !== 'string' || !/^[0-9a-f]{64}$/.test(raw.schemaHash)) invalid();
  return Object.freeze({ name: name(raw.name), protocolVersion: version, schemaHash: raw.schemaHash });
}
export function snapshotPolicy(input: unknown): FeaturePolicy {
  const raw = record(input, ['format', 'version', 'policyId', 'revision', 'required', 'optional', 'disabled', 'mode', 'profileIds']);
  if (raw.format !== 'p2p-offramp-feature-policy') invalid(); if (raw.version !== 1) invalid('UNSUPPORTED_VERSION');
  const required = array(raw.required, POLICY_LIMITS.entries), optional = array(raw.optional, POLICY_LIMITS.entries), disabled = array(raw.disabled, POLICY_LIMITS.entries);
  if (required.length + optional.length + disabled.length > POLICY_LIMITS.entries) invalid('LIMIT_EXCEEDED');
  const parsed = [required, optional, disabled].map(items => Object.freeze(items.map(reference).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)));
  const identities = parsed.flat().map(item => item.name); if (new Set(identities).size !== identities.length) invalid('CONFLICT');
  if (raw.mode !== 'ordinary' && raw.mode !== 'strict-private') invalid();
  return Object.freeze({ format: raw.format, version: 1, policyId: identifier(raw.policyId), revision: counter(raw.revision), required: parsed[0]!, optional: parsed[1]!, disabled: parsed[2]!, mode: raw.mode, profileIds: strings(raw.profileIds, POLICY_LIMITS.profiles, identifier) });
}
const byteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')!.get!;
export function parsePolicy(bytes: Uint8Array): CoreResult<FeaturePolicy> {
  return attempt(() => { let length: unknown; try { length = Reflect.apply(byteLength, bytes, []); } catch { invalid(); } if (typeof length !== 'number') invalid(); if (length > POLICY_LIMITS.bytes) invalid('LIMIT_EXCEEDED'); let input: unknown; try { input = parseStrictJsonBytes(bytes, POLICY_LIMITS.bytes); } catch { invalid('INVALID_INPUT'); } return snapshotPolicy(input); });
}
export interface PolicyDiff { readonly modeChanged: boolean; readonly profilesChanged: boolean; readonly changedCapabilities: readonly string[]; }
export function diffPolicy(previous: FeaturePolicy, next: FeaturePolicy): CoreResult<PolicyDiff> {
  return attempt(() => {
    const a = snapshotPolicy(previous), b = snapshotPolicy(next);
    const roles = (p: FeaturePolicy) => new Map(['required', 'optional', 'disabled'].flatMap(role => p[role as 'required' | 'optional' | 'disabled'].map(item => [item.name, `${role}:${item.protocolVersion}:${item.schemaHash}`] as const)));
    const left = roles(a), right = roles(b); return Object.freeze({ modeChanged: a.mode !== b.mode, profilesChanged: a.profileIds.join() !== b.profileIds.join(), changedCapabilities: Object.freeze([...new Set([...left.keys(), ...right.keys()])].filter(key => left.get(key) !== right.get(key)).sort(compareCodeUnits)) });
  });
}
