# State transitions and events

## 1. Metadata

- **Specification:** spec-state-transitions-and-events
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 2
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Give chain events exact economic semantics and keep local provisional observations distinct.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
type EscrowState="absent"|"funded"|"released"|"refunded";
// EVM events (indexed id,seller,buyer on Funded):
Funded(bytes32 id,address seller,address buyer,address token,uint256 amount,uint64 expiry,bytes32 termsHash)
Released(bytes32 id)
Refunded(bytes32 id)
// Solana IDL events carry equivalent fields plus program-derived trade account.
interface ChainAnchor {chain:"evm"|"solana"; blockOrSlot:string;
 blockHash:string; transactionId:string; eventIndex:number;}
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Only absent -> funded -> released OR refunded is legal. Fund emits one canonical Funded event after successful deposit; settlement emits one terminal event after successful payout; reverted transactions have no persistent successful event. Native event receipts must match approved deployment, success status, stored terms and G11 finality. Deduplicate by network/deployment/transaction/event index. Logs are indexing hints: snapshot reads decide current custody. Reorg removes observations, not immutable historical assertions in diagnostics; rebuild from canonical state. CTX02 wraps verified observations only.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Unknown events do not advance state. Missing/truncated logs require read/getTrade reconciliation. Conflicting state or anchors returns INTEGRITY_FAILURE and stops economic preparation. Repeated terminal events do not create a second economic transition.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Public events expose participants, asset, amount, timing and terms digest; exclude fiat instructions and proof witnesses. Chain-source labeling alone does not establish authenticity; selected adapter validates native evidence.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Generate arbitrary transition attempts; reject funded->funded and terminal->anything; forged deployment logs; reverted receipt with apparent logs; repeated event across relays; log-index collision on different chains; reorder; reorg back to funded. Assert total payout equals one principal.

Sources: [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271), [Solidity security](https://docs.soliditylang.org/en/latest/security-considerations.html), [Solana transactions](https://solana.com/docs/core/transactions), [token accounts](https://solana.com/docs/tokens/basics/create-token-account). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
