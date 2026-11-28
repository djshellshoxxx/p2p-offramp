import { data, stop } from './shared.ts';
export const LOCAL_PROFILE_IDS = Object.freeze(['local-erc5564-reference-xy64-v1', 'local-scopelift-ecdh33-comparison-v1'] as const);
export type LocalProfileId = typeof LOCAL_PROFILE_IDS[number];
export function profileOf(input: unknown): LocalProfileId { return typeof input === 'string' && LOCAL_PROFILE_IDS.includes(input as LocalProfileId) ? input as LocalProfileId : stop('UNSUPPORTED_PROFILE'); }
export interface OfflineContext { readonly kind: 'offline-fixture'; readonly id: string; }
export function contextOf(input: unknown): OfflineContext {
  const raw = data(input, ['kind', 'id']);
  if (raw.kind !== 'offline-fixture' || typeof raw.id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(raw.id)) return stop('CONTEXT_MISMATCH');
  return Object.freeze({ kind: 'offline-fixture', id: raw.id });
}
export const sameContext = (left: OfflineContext, right: OfflineContext): boolean => left.kind === right.kind && left.id === right.id;
export const MAX_ENTROPY_ATTEMPTS = 128, MAX_VIEW_HANDLES = 16;
export const FIELD_PRIME = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
export const SCALAR_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
