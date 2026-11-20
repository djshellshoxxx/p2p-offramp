/** Explicit local funding and recovery facade. App imports are confined to the separate Solana localnet profile. */
export { createSolanaEscrowClient } from './src/compose.ts';
export type { SolanaEscrowClient, SolanaSubmission, PreparedSolanaAction, PreparedSolanaFunding } from './src/compose.ts';
export { SolanaVaultJournal } from './src/vaultjournal.ts';
export { projectNativeFundingReview } from './src/funding-review.ts';
export { createRecoveryDocument, parseRecoveryDocument, recoveryBinding, recoveryExits } from './src/recovery.ts';
export type { SolanaRecoveryDocument } from './src/recovery.ts';
export type { BoundSolanaTrade } from './src/bind.ts';
export type { SolanaWalletPort, SolanaWalletSession } from './src/wallet.ts';
export type { SolanaEscrowSnapshot, SolanaReadRpc } from './src/reader.ts';
export type { SolanaIntentRecord } from './src/intent.ts';
export { encodeBase64, unsignedTransaction } from './src/message.ts';
export { decodeBase64 } from './src/codec.ts';
