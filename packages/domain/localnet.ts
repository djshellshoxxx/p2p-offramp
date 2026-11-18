/**
 * Localnet-only domain facade (A3): the encrypted lifecycle journal, the EVM transaction lifecycle (the localnet send
 * path, as proven by scripts/test-exchange-evm-local.mjs), finality policy, chain-authority, composition and journey
 * projection. Reachable only from apps/web/src/localnet/** and admitted only by the localnet build profile.
 * RELEASE_ENABLED stays the literal 0.
 */
export { createLifecycleJournal, createIntentJournal, LIFECYCLE_TRANSITIONS } from './src/intent-journal.ts';
export type { LifecycleJournal, IntentJournal, IntentJournalOptions, JournalVaultPort, NativeIntentObservation, LifecycleTransition } from './src/intent-journal.ts';
export { createEvmTxLifecycle, evmFinalityPolicy } from './src/tx-lifecycle.ts';
export type {
  EscrowState, Eip1193Request, EvmBlockRef, EvmReceiptView, EvmTransactionView, EvmChainReader, EvmFinalityPolicy, EvmWalletContext, EvmCall,
  EvmPreparedRequest, EvmPrepareInput, PreparedEvmIntent, EvmOutcome, EvmReconciliation, EvmSubmission, EvmTxLifecycleOptions, EvmTxLifecycle,
} from './src/tx-lifecycle.ts';
export { createTradeAuthority, RELEASE_ENABLED, DISPLAY_MAX_AGE_MS, MAX_PENDING_RECONCILIATIONS } from './src/authority.ts';
export type { ReconcileRequest, TradeAuthorityOptions, TradeAuthority } from './src/authority.ts';
export { createTradeComposition } from './src/trade-composition.ts';
export type { TradeCompositionOptions, TradeDiagnosticView, TradeComposition } from './src/trade-composition.ts';
export { createJourneyProjection } from './src/journey-view.ts';
export type {
  JourneyStep, JourneyAuthority, JourneyBlocker, JourneyPaymentGuidanceObservation, JourneyPaymentGuidancePort, JourneyView, JourneyProjection, JourneyProjectionService,
} from './src/journey-view.ts';
