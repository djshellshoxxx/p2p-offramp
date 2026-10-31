import type { CoreErrorCode } from '../../schemas/index.ts';

export const EXTENSION_LIMITS = Object.freeze({ modules: 16, registrations: 64, capabilities: 16, schemaHashes: 16, proposalBytes: 65_536, proposalDepth: 16 });
export interface ExtensionManifestV1 {
  readonly format: 'p2p-offramp-extension'; readonly version: 1; readonly id: string;
  readonly protocolVersion: number; readonly coreApiVersion: 1;
  readonly capabilities: readonly string[]; readonly schemaHashes: readonly string[];
}
export type NegotiatedCapabilitySet = readonly Readonly<Pick<ExtensionManifestV1, 'id' | 'protocolVersion' | 'capabilities' | 'schemaHashes'>>[];
const failures = new WeakMap<object, CoreErrorCode>();
class Invalid extends Error { constructor(code: CoreErrorCode) { super('Invalid extension input.'); failures.set(this, code); } }
export function invalid(code: CoreErrorCode = 'INVALID_INPUT'): never { throw new Invalid(code); }
export const inputError = (error: unknown): CoreErrorCode => typeof error === 'object' && error !== null ? failures.get(error) ?? 'INVALID_INPUT' : 'INVALID_INPUT';
const reflect = <T>(read: () => T): T => { try { return read(); } catch { return invalid(); } };
export function record(input: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || reflect(() => Array.isArray(input))) invalid();
  const prototype = reflect(() => Object.getPrototypeOf(input));
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const keys = reflect(() => Reflect.ownKeys(input));
  if (keys.length > required.length + optional.length || keys.some(key => typeof key !== 'string' || ![...required, ...optional].includes(key))) invalid();
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of [...required, ...optional]) {
    const descriptor = reflect(() => Object.getOwnPropertyDescriptor(input, key));
    if (!descriptor) { if (required.includes(key)) invalid(); continue; }
    if (!('value' in descriptor)) invalid();
    out[key] = descriptor.value;
  }
  return out;
}
export function array(input: unknown, limit: number): unknown[] {
  if (!reflect(() => Array.isArray(input)) || reflect(() => Object.getPrototypeOf(input)) !== Array.prototype) invalid();
  const lengthDescriptor = reflect(() => Object.getOwnPropertyDescriptor(input, 'length'));
  if (!lengthDescriptor || !('value' in lengthDescriptor)) invalid();
  const length: unknown = lengthDescriptor.value;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) invalid();
  if (length > limit) invalid('LIMIT_EXCEEDED');
  if (reflect(() => Reflect.ownKeys(input as object)).length !== length + 1) invalid();
  const out: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = reflect(() => Object.getOwnPropertyDescriptor(input, String(index)));
    if (!descriptor || !('value' in descriptor)) invalid();
    out.push(descriptor.value);
  }
  return out;
}
export const identifier = (input: unknown): string => typeof input === 'string' && /^[a-z0-9-]{1,64}$/.test(input) ? input : invalid();
export const capabilityName = (input: unknown): string => typeof input === 'string' && /^[a-z0-9][a-z0-9._:-]{0,63}$/.test(input) ? input : invalid();
export function strings(input: unknown, max: number, parse: (value: unknown) => string): readonly string[] {
  const values = array(input, max).map(parse);
  if (new Set(values).size !== values.length) invalid();
  return Object.freeze(values.sort());
}
export function manifest(input: unknown): ExtensionManifestV1 {
  const raw = record(input, ['format', 'version', 'id', 'protocolVersion', 'coreApiVersion', 'capabilities', 'schemaHashes']);
  if (raw.format !== 'p2p-offramp-extension') invalid();
  if (raw.version !== 1 || raw.coreApiVersion !== 1) invalid('UNSUPPORTED_VERSION');
  if (typeof raw.protocolVersion !== 'number' || !Number.isSafeInteger(raw.protocolVersion) || raw.protocolVersion < 1 || raw.protocolVersion > 65535) invalid();
  return Object.freeze({ format: raw.format, version: 1, id: identifier(raw.id), protocolVersion: raw.protocolVersion, coreApiVersion: 1,
    capabilities: strings(raw.capabilities, EXTENSION_LIMITS.capabilities, capabilityName),
    schemaHashes: strings(raw.schemaHashes, EXTENSION_LIMITS.schemaHashes, hash => typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash) ? hash : invalid()) });
}
/** Detached JSON data only, bounded before serialization. Never invokes getters or toJSON. */
export function snapshotProposal(input: unknown): unknown {
  const active = new Set<object>(); let nodes = 0, units = 0;
  const walk = (value: unknown, depth: number): unknown => {
    if (++nodes > 4096 || depth > EXTENSION_LIMITS.proposalDepth) invalid('LIMIT_EXCEEDED');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : invalid();
    if (typeof value === 'string') { units += value.length; if (units > EXTENSION_LIMITS.proposalBytes) invalid('LIMIT_EXCEEDED'); return value; }
    if (typeof value !== 'object' || active.has(value)) invalid();
    active.add(value);
    try {
      if (reflect(() => Array.isArray(value))) return Object.freeze(array(value, 4096).map(item => walk(item, depth + 1)));
      const prototype = reflect(() => Object.getPrototypeOf(value));
      if (prototype !== Object.prototype && prototype !== null) invalid();
      const keys = reflect(() => Reflect.ownKeys(value));
      if (keys.length > 4096 || keys.some(key => typeof key !== 'string')) invalid('LIMIT_EXCEEDED');
      const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const key of keys) {
        if (typeof key !== 'string') invalid(); units += key.length;
        if (units > EXTENSION_LIMITS.proposalBytes) invalid('LIMIT_EXCEEDED');
        const descriptor = reflect(() => Object.getOwnPropertyDescriptor(value, key));
        if (!descriptor || !('value' in descriptor)) invalid();
        out[key] = walk(descriptor.value, depth + 1);
      }
      return Object.freeze(out);
    } finally { active.delete(value); }
  };
  const out = walk(input, 0);
  if (new TextEncoder().encode(JSON.stringify(out)).byteLength > EXTENSION_LIMITS.proposalBytes) invalid('LIMIT_EXCEEDED');
  return out;
}
