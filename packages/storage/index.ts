/** Public storage composition boundary. Key material and crypto internals remain private. */
export { EncryptedVaultService } from './src/vault-service.ts';
export { EncryptedBackupService, BackupError } from './src/backup-service.ts';
export type { BackupExport } from './src/backup-service.ts';
export type { ProfileInventory, VaultStore } from './src/idb-vault-store.ts';
