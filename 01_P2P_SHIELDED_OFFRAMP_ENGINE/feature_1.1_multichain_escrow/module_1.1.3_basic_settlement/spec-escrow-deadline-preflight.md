# Escrow deadline preflight

## 1. Metadata

- **Specification:** G18
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 2
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Gate payment guidance on finalized funding and enough remaining chain time; this is UI risk reduction, never settlement authority.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface PaymentPreflight {binding:TradeBinding; termsHash:string;
 finalizedAnchor:string; checkedChainTime:string; expiry:string;
 remainingSeconds:string; decision:"allow-guidance"|"block";
 reason:"ok"|"unfunded"|"stale"|"mismatch"|"near-expiry"|"unknown";}
// Basic policy: 900-second payment safety buffer; observations expire after 30 s.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Before showing payment instructions and on every resume/request-to-pay action reread funded immutable terms at registry finalized policy, chain time, and deployment identity. Verify expected seller/buyer/principal/asset. Require remaining >900 seconds and latest successful corroborated read at most 30 seconds old measured by local monotonic clock; browser suspension invalidates freshness. Local clock cannot authorize chain action. At remaining <=900 hide actionable pay guidance and show wait/refund risk; the seller may still release before chain expiry by independent fresh transaction preflight.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

RPC disagreement/outage or timer uncertainty blocks payment guidance with reconnect/reconcile; never block access to refund/release recovery information or export. No automatic transaction follows a successful check. Terms changes require new acceptance.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

A finalized block timestamp can lag current inclusion time; buffer is an operational bound, not a guarantee of fiat arrival or timely release. Payer may send outside UI, and payment rails can delay beyond expiry.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

900/901 boundaries; stale at 30/31 seconds; hidden tab resume; skewed wall clock; finalized but different recipient/amount; reorg; corrupted terms; RPC unavailable. Assert no instructions before finalized funded and no browser timer triggers a refund.

Sources: [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271), [Solidity security](https://docs.soliditylang.org/en/latest/security-considerations.html), [Solana transactions](https://solana.com/docs/core/transactions), [token accounts](https://solana.com/docs/tokens/basics/create-token-account). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
