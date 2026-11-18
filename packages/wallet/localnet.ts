/**
 * Localnet-only wallet facade (A3). Reachable only from apps/web/src/localnet/** (scripts/check-import-boundaries.mjs)
 * and admitted only by the localnet build profile (apps/web/scripts/static-build-plugin.mjs); every default, demo and
 * testnet build refuses these modules. The seller sends fund/release/refund through the domain lifecycle; the buyer only
 * signs typed data. evm-execution.ts (test-only RPC execution) is deliberately NOT exported.
 */
export * from './src/evm-adapter.ts';
export * from './src/evm-terms.ts';
export * from './src/evm-escrow.ts';
export { createEip1193ChainReader, escrowCallFor } from './src/evm-submit.ts';
export type { Eip1193Request, ReaderRequest, Eip1193ChainReaderOptions, EscrowAction } from './src/evm-submit.ts';
export * from './src/evm-payment-preflight.ts';
export * from './src/evm-peer-acceptance.ts';
export * from './src/evm-peer-envelope.ts';
export * from './src/evm-peer-replay.ts';
export { createEvmPeerAcceptancePorts, evmTermsFromReviewed } from './src/evm-peer-port.ts';
export type { EvmPeerPorts, EvmPeerPortOptions } from './src/evm-peer-port.ts';
