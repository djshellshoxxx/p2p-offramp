# Chain adapter contract

## 1. Metadata

- **Specification:** spec-chain-adapter-contract
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 2
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Normalize observations and economic preparation while retaining independent EVM and Solana implementations. This adapter is not a bridge or a cross-chain atomic swap.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
type NativePrepared =
 | {chain:"evm"; to:string; data:string; value:string; chainId:string}
 | {chain:"solana"; messageBase64:string; blockhash:string; lastValidBlockHeight:string};
interface EscrowAdapter {
 read(binding:TradeBinding, signal:AbortSignal):Promise<CoreResult<EscrowSnapshot>>;
 prepare(action:"fund"|"release"|"refund", binding:TradeBinding,
   wallet:WalletSession, signal:AbortSignal):Promise<CoreResult<NativePrepared>>;
}
// EscrowSnapshot: binding, absent/funded/released/refunded, immutable terms,
// chain-native block/slot anchor and provisional/finalized observation label.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

G11 preflight authenticates approved network/deployment/asset; read native state and validate every immutable field against accepted G16 terms. Preparation is read-only and capped at 64 KiB. EVM encodes ABI calls and uint256 value; Solana compiles reviewed instructions/account metas, signatures and transaction version. Fees are separate from trade principal. G12 reserves and G10 submits; this interface MUST NOT send. Finality uses registry finalized policy, never wall-clock confirmations. Reorg invalidates prior snapshot and blocks payment guidance until reread.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Map unknown network to UNSUPPORTED_PROVIDER, mismatch to WRONG_CHAIN/INTEGRITY_FAILURE and RPC outage to UNAVAILABLE. Unknown submission remains G12 BROADCAST_UNKNOWN; no automatic prepare-and-send retry. Abort invalidates late reads without pretending to cancel a broadcast.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

RPC can report false state. Native chain identity/code checks and configured independent corroboration reduce this risk without constituting light-client verification. No format coercion by address length or token symbol.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

For both families test wrong network/deployment/asset; swapped recipient; stale wallet generation; absent/failed/finalized transactions; conflicting RPCs; reorg; 64 KiB cap. Assert prepare invokes no send method and identical commands preserve exact principal.

Sources: [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271), [Solidity security](https://docs.soliditylang.org/en/latest/security-considerations.html), [Solana transactions](https://solana.com/docs/core/transactions), [token accounts](https://solana.com/docs/tokens/basics/create-token-account). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
