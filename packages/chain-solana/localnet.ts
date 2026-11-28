/** Explicit local recovery facade. App imports are confined to the separate Solana localnet profile. */
export { createSolanaEscrowClient } from './src/compose.ts';
export type { SolanaEscrowClient, SolanaSubmission, PreparedSolanaAction } from './src/compose.ts';
export type { PreparedSolanaJournalMigration, SolanaJournalState, RebuildOption } from './src/compose.ts';
export type { SolanaReservationIdentity, SolanaReservationRef } from './src/journal.ts';
export { SolanaVaultJournal } from './src/vaultjournal.ts';
export { parseRecoveryDocument, recoveryBinding, recoveryExits } from './src/recovery.ts';
export type { SolanaRecoveryDocument } from './src/recovery.ts';
export type { BoundSolanaTrade } from './src/bind.ts';
export type { SolanaWalletPort, SolanaWalletSession } from './src/wallet.ts';
export type { SolanaEscrowSnapshot, SolanaReadRpc } from './src/reader.ts';
export type { SolanaIntentRecord } from './src/intent.ts';
export { encodeBase64, unsignedTransaction } from './src/message.ts';
export { decodeBase64 } from './src/codec.ts';
