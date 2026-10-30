/** Public entry point for the offline runtime. No UI import reaches a private package path. */
export * from './src/runtime.ts';
export { encodeBase64url } from './src/vault.ts';
export { parseBackupBytes } from './src/backup.ts';
export type { VaultSession, VaultSessionLease, Result } from './src/vault-service.ts';
export * from './src/transport.ts';

// Public validated data contracts used by package boundaries; no key material or provider instance is exported.
export * from './src/core.ts';
export * from './src/vault.ts';
export * from './src/vault-service.ts';
export * from './src/backup.ts';
export * from './src/identity.ts';
export * from './src/intent.ts';
export * from './src/registry.ts';
export * from './src/saved-review.ts';
