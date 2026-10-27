/** G05 bounded data projections. Parsing data never issues routing evidence or consent. */
export const TRANSPORT_CHANNELS = Object.freeze(['rpc', 'relay', 'map', 'proof', 'update', 'wallet'] as const);
export type TransportChannel = typeof TRANSPORT_CHANNELS[number];
export type AppTransportChannel = Exclude<TransportChannel, 'wallet'>;
export type TransportMode = 'ordinary' | 'strict';
export type RouteCoverage = 'direct' | 'verified-private' | 'unknown' | 'unsupported';
export type RouteError = 'INVALID_ENDPOINT' | 'ROUTE_UNAVAILABLE' | 'POLICY_BLOCKED' | 'CANCELLED' | 'LIMIT_EXCEEDED' | 'TIMEOUT';
export type TransportResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: RouteError };
export interface RequestPolicy { readonly channel: AppTransportChannel; readonly endpointId: string; readonly method: 'read' | 'publish'; }
export interface RouteEvidence { readonly channel: TransportChannel; readonly coverage: RouteCoverage; readonly adapterId: string; readonly generation: number; }
export interface RegisteredTransportEndpoint { readonly id: string; readonly channel: AppTransportChannel; readonly url: string; readonly adapterId: string; readonly methods: readonly ('read' | 'publish')[]; }
/** An internal projection of a trusted connection capability, not a signed registry wire format. */
export interface TransportEvidenceProjection { readonly channel: TransportChannel; readonly coverage: RouteCoverage; readonly adapterId: string; readonly expiresAt: number | null; }
export interface TransportGrantProjection { readonly version: 1; readonly request: RequestPolicy; readonly endpoint: RegisteredTransportEndpoint; readonly evidence: TransportEvidenceProjection; readonly directConsent: boolean; }
export class TransportValidationError extends Error {
  readonly code = 'INVALID_ENDPOINT';
  constructor() { super('Invalid transport policy input.'); this.name = 'TransportValidationError'; }
}
function fail(): never { throw new TransportValidationError(); }
function object(input: unknown, keys: readonly string[]): Record<string, unknown> {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail();
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) return fail();
    const own = Reflect.ownKeys(input);
    if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) return fail();
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) { const value = Object.getOwnPropertyDescriptor(input, key); if (!value || !('value' in value)) return fail(); output[key] = value.value; }
    return output;
  } catch { return fail(); }
}
export function transportId(input: unknown): string { if (typeof input !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(input)) return fail(); return input; }
export function transportChannel(input: unknown): TransportChannel {
  if (typeof input !== 'string' || !(TRANSPORT_CHANNELS as readonly string[]).includes(input)) return fail();
  return input as TransportChannel;
}
function appChannel(input: unknown): AppTransportChannel { const channel = transportChannel(input); if (channel === 'wallet') return fail(); return channel; }
function method(input: unknown): 'read' | 'publish' { if (input !== 'read' && input !== 'publish') return fail(); return input; }
export function parseTransportRequest(input: unknown): RequestPolicy {
  const raw = object(input, ['channel', 'endpointId', 'method']);
  return Object.freeze({ channel: appChannel(raw.channel), endpointId: transportId(raw.endpointId), method: method(raw.method) });
}
export function parseTransportEvidence(input: unknown): TransportEvidenceProjection {
  const raw = object(input, ['channel', 'coverage', 'adapterId', 'expiresAt']);
  if (raw.coverage !== 'direct' && raw.coverage !== 'verified-private' && raw.coverage !== 'unknown' && raw.coverage !== 'unsupported') return fail();
  if (raw.coverage === 'direct' || raw.coverage === 'verified-private') {
    if (typeof raw.expiresAt !== 'number' || !Number.isSafeInteger(raw.expiresAt) || raw.expiresAt <= 0) return fail();
  } else if (raw.expiresAt !== null) return fail();
  return Object.freeze({ channel: transportChannel(raw.channel), coverage: raw.coverage, adapterId: transportId(raw.adapterId), expiresAt: raw.expiresAt as number | null });
}
function endpoint(input: unknown): RegisteredTransportEndpoint {
  const raw = object(input, ['id', 'channel', 'url', 'adapterId', 'methods']);
  if (typeof raw.url !== 'string' || raw.url.length > 2048 || /[\u0000-\u0020\u007f]/.test(raw.url)) return fail();
  let url: URL;
  try { url = new URL(raw.url); } catch { return fail(); }
  if ((url.protocol !== 'https:' && url.protocol !== 'wss:') || url.username || url.password || url.hash || raw.url.includes('#')) return fail();
  const methods: ('read' | 'publish')[] = [];
  try {
    if (!Array.isArray(raw.methods) || Object.getPrototypeOf(raw.methods) !== Array.prototype) return fail();
    const count: unknown = Object.getOwnPropertyDescriptor(raw.methods, 'length')?.value;
    if (typeof count !== 'number' || count < 1 || count > 2 || Reflect.ownKeys(raw.methods).length !== count + 1) return fail();
    for (let index = 0; index < count; index++) {
      const value = Object.getOwnPropertyDescriptor(raw.methods, String(index)); if (!value || !('value' in value)) return fail();
      const parsed = method(value.value); if (methods.includes(parsed)) return fail(); methods.push(parsed);
    }
  } catch { return fail(); }
  return Object.freeze({ id: transportId(raw.id), channel: appChannel(raw.channel), url: url.href, adapterId: transportId(raw.adapterId), methods: Object.freeze(methods) });
}
export function parseTransportGrant(input: unknown): TransportGrantProjection {
  const raw = object(input, ['version', 'request', 'endpoint', 'evidence', 'directConsent']);
  if (raw.version !== 1 || typeof raw.directConsent !== 'boolean') return fail();
  const request = parseTransportRequest(raw.request), destination = endpoint(raw.endpoint), evidence = parseTransportEvidence(raw.evidence);
  if (destination.channel !== evidence.channel || destination.adapterId !== evidence.adapterId || request.channel !== destination.channel ||
      request.endpointId !== destination.id || !destination.methods.includes(request.method)) return fail();
  return Object.freeze({ version: 1, request, endpoint: destination, evidence, directConsent: raw.directConsent });
}
