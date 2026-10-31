/** Private browser proof entry; never part of the application graph. */
export { createDurableTradeChat, encodeMessage } from '../../packages/messaging/index.ts';
export { createLocalNobleNostrProvider, createTradeChat } from '../../packages/nostr-crypto/index.ts';
export { EncryptedVaultService, EncryptedBackupService } from '../../packages/storage/index.ts';
export { IndexedDbVaultStore } from '../../packages/storage/src/idb-vault-store.ts';
