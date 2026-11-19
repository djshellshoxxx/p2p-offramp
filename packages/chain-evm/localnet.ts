/**
 * Localnet-only read-only EVM facade (A3). Construct EvmChainReader over the injected EIP-1193 provider with the trusted
 * `escrowLayouts` policy from the localnet config (runtime Keccak from the forge artifact, never from eth_getCode on the
 * same RPC). Reachable only from apps/web/src/localnet/** and admitted only by the localnet build profile.
 */
export { EvmChainReader, MAX_RPC_READS, MAX_RUNTIME_CODE_BYTES } from './src/reader.ts';
export type {
  EvmReadRpc, EvmRegistryView, EscrowLayout, EvmReaderOptions, LiveAnchor, EscrowExpectation, DecodedEscrow, EvmEscrowSnapshot, EvmReadRequest,
  ExpectedEscrowTransaction, ReceiptObservation,
} from './src/reader.ts';
