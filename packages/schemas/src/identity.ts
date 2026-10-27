/** G01 private G02 identity payload; no UI or wallet key interface is defined here. */
import { decodeBase64url, encodeBase64url } from './vault.ts';
export const IDENTITY_PROVIDER_ID = 'noble-curves-bip340-2.4.0';
export const MAX_IDENTITY_JSON_BYTES = 4096;
export type IdentityErrorCode = 'LOCKED' | 'CANCELLED' | 'UNSUPPORTED_PROVIDER' | 'INVALID_IDENTITY' | 'STORAGE_UNAVAILABLE' | 'CONFLICT' | 'LIMIT_EXCEEDED';
export class IdentityError extends Error {
  readonly code: IdentityErrorCode;
  constructor(code: IdentityErrorCode = 'INVALID_IDENTITY') { super('Messaging identity operation unavailable.'); this.name = 'IdentityError'; this.code = code; }
}
export type IdentityResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly code: IdentityErrorCode; readonly messageKey: string } };
export interface IdentityHandle { readonly id: string; readonly generation: number; readonly purpose: 'messaging'; }
export interface IdentityReference { readonly profileId: string; readonly identityRecordId: string; }
export interface CreatedIdentity extends IdentityReference { readonly state: 'unlocked' | 'locked'; readonly handle: IdentityHandle | null; }
export interface PrivateIdentityRecordV1 {
  readonly format: 'p2p-offramp-messaging-identity'; readonly version: 1;
  readonly profileId: string; readonly identityRecordId: string;
  readonly purpose: 'messaging'; readonly providerId: typeof IDENTITY_PROVIDER_ID;
  readonly publicKey: string; readonly secretKey: string; readonly state: 'active' | 'retired';
}
function fail(): never { throw new IdentityError(); }
function exact(input: unknown, keys: readonly string[]): Record<string, unknown> {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail();
    const proto: unknown = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) return fail();
    const actual = Reflect.ownKeys(input);
    if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key))) return fail();
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) { const descriptor = Object.getOwnPropertyDescriptor(input, key); if (!descriptor || !('value' in descriptor)) return fail(); out[key] = descriptor.value; }
    return out;
  } catch { return fail(); }
}
export function identityRecordId(input: unknown): string { if (typeof input !== 'string' || !/^[0-9a-f]{32}$/.test(input)) return fail(); return input; }
export function identityPublicKey(input: unknown): string { if (typeof input !== 'string' || !/^[0-9a-f]{64}$/.test(input)) return fail(); return input; }
export function parseIdentityHandle(input: unknown): IdentityHandle {
  const raw = exact(input, ['id', 'generation', 'purpose']);
  try { decodeBase64url(raw.id, 32, 32); } catch { return fail(); }
  if (raw.purpose !== 'messaging' || typeof raw.generation !== 'number' || !Number.isSafeInteger(raw.generation) || raw.generation < 0) return fail();
  return Object.freeze({ id: raw.id as string, generation: raw.generation, purpose: 'messaging' });
}
export function parseIdentityRecord(input: unknown): PrivateIdentityRecordV1 {
  const raw = exact(input, ['format', 'version', 'profileId', 'identityRecordId', 'purpose', 'providerId', 'publicKey', 'secretKey', 'state']);
  if (raw.format !== 'p2p-offramp-messaging-identity' || raw.version !== 1 || raw.purpose !== 'messaging' || raw.providerId !== IDENTITY_PROVIDER_ID || (raw.state !== 'active' && raw.state !== 'retired')) return fail();
  let secret: Uint8Array | undefined;
  try { secret = decodeBase64url(raw.secretKey, 32, 32); } catch { return fail(); } finally { secret?.fill(0); }
  return Object.freeze({ format: 'p2p-offramp-messaging-identity', version: 1, profileId: identityRecordId(raw.profileId), identityRecordId: identityRecordId(raw.identityRecordId), purpose: 'messaging', providerId: IDENTITY_PROVIDER_ID, publicKey: identityPublicKey(raw.publicKey), secretKey: raw.secretKey as string, state: raw.state });
}
export function decodeIdentityPayload(payload: string): PrivateIdentityRecordV1 {
  let bytes: Uint8Array | undefined;
  try {
    bytes = decodeBase64url(payload, 1, MAX_IDENTITY_JSON_BYTES);
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    const record = parseIdentityRecord(JSON.parse(text) as unknown);
    // This private generated-v1 format has one serialization, as does G02's
    // containing snapshot. Duplicate decoded keys must not become last-wins data.
    if (JSON.stringify(record) !== text) return fail();
    return record;
  }
  catch { return fail(); } finally { bytes?.fill(0); }
}
export function encodeIdentityPayload(input: PrivateIdentityRecordV1): string {
  const raw = parseIdentityRecord(input); const bytes = new TextEncoder().encode(JSON.stringify(raw));
  try { if (bytes.byteLength > MAX_IDENTITY_JSON_BYTES) throw new IdentityError('LIMIT_EXCEEDED'); return encodeBase64url(bytes); } finally { bytes.fill(0); }
}
