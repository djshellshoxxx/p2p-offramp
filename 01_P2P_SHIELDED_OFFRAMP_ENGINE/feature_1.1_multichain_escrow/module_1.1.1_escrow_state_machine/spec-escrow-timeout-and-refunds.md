# Escrow timeout and refunds

## 1. Metadata

- **Specification:** spec-escrow-timeout-and-refunds
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 2
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Define disjoint settlement deadlines and permissionless execution without redirectable refunds.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface DeadlinePolicyV1 { version:1; minDurationSeconds:1800;
 maxDurationSeconds:604800; releaseGuard:"chain-time-lt-expiry";
 refundGuard:"chain-time-gte-expiry"; }
// expiry is uint64 Unix seconds in immutable accepted terms.
// refund caller may be any account; beneficiary is always stored seller.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

At funding require 1800 <= expiry - authoritative chain time <= 604800 seconds. Values are basic-v1 design bounds and MUST be implemented identically in contract/program, terms and UI. Release before expiry and refund at/after expiry are mutually exclusive at inclusion. EVM uses block.timestamp; Solana uses validated Clock sysvar unix_timestamp with checked nonnegative conversion. Browser clock only formats display. Any caller pays execution fees unless an explicitly consented relayer does; no fee is deducted from principal. There are no evidence or dispute deadlines in basic escrow.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Expiry creates eligibility, not automatic execution. Offer a native-chain refund transaction, fee estimate and direct ABI/IDL recovery instructions. Chain outage postpones execution; lost seller spending key prevents seller release but anyone can still refund to its bound address. A refund transfer failure on EVM marks the trade refunded and preserves principal as a pending credit for retry to the original destination (see [escrow contract interface](spec-escrow-contract-interface.md) §4).

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Timestamp uncertainty, congested inclusion and seller withholding persist. A locally expired timer cannot authorize a payout. A chain-level release included before deadline remains valid even if observed after deadline. Later modules cannot extend an existing deadline.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Check minimum/maximum duration and one second outside; expiry exactly; Solana negative Clock timestamp; non-seller refund caller paid no principal; release/refund races ordered by actual inclusion; reorg; receiver failure; unavailable RPC; stale local clock. Assert no grace branch or extension exists.

Sources: [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271), [Solidity security](https://docs.soliditylang.org/en/latest/security-considerations.html), [Solana Clock](https://docs.rs/solana-clock/latest/solana_clock/struct.Clock.html). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
