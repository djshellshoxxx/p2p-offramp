/** Optional local diagnostic math. No native custody, provider or default app integration. */
export { inspectVaultAccounting } from './src/accounting.ts';
export { createLiquidityReference } from './src/reservations.ts';
export type { VaultAccountingV1, AccountingReport } from './src/accounting.ts';
export type { ReferenceOptions, ContextSnapshot, ReferencePorts, ModelQuote, SimulationOutcome,
  ReferenceCommand, SimulatedReservationState, ReservationView, LiquidityView,
  UnreservedQuote, LiquidityReference } from './src/reservations.ts';
