/** Public entry point for the offline runtime. No UI import reaches a private package path. */
export * from './src/runtime.ts';
export { encodeBase64url } from './src/vault.ts';
export { parseBackupBytes } from './src/backup.ts';
export type { VaultSession, VaultSessionLease, Result } from './src/vault-service.ts';
export * from './src/transport.ts';
