# Liquidity quote reservation

## 1. Metadata

- **Specification:** spec-quote-reservation-interface
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** Post-MVP optional; independently gated
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Bind optional maker quotes and atomic reserve accounting without advertising off-chain offers as locked liquidity.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface QuoteV1 {v:1;quoteId:string;maker:string;taker:string;
 binding:TradeBinding;termsHash:string;assetId:string;principal:string;
 fee:"0";nonce:string;expiresAtSeconds:string;signature:Uint8Array;}
type ReservationState="unreserved"|"reserved"|"consumed"|"expired"|"cancelled";
// TTL <=120 s; one exact fill; reservation ID unique in immutable vault domain.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Verify maker/taker/domain/amount/expiry signature and supported vault before atomic reserve. Chain-confirmed reserve moves exact available principal to reserved with consumed nonce guard; off-chain quote remains unreserved regardless of maker promise. Consume requires bound taker consent/terms, now<quote expiry, exact reserved amount and atomic funding into supported basic escrow with maker as seller; no partial fill. Any caller may expire at/after expiry, returning reserve only to maker available ledger. Maker cancellation before consumption is explicit chain action; inclusion order decides race. Basic trades do not need quotes/vault.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Failed consume reverts reservation/custody changes together; terminal reservation cannot be reused. Unknown reserve broadcast remains G12 unresolved. Reorg invalidates provisional locked label. Unsupported vault escrow integration returns UNSUPPORTED_PROVIDER, never falls back to an operator balance.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Front-running/replayed quotes can lock capacity; bind taker, bounded TTL and signature nonce. Reservation expiry is not crypto escrow deadline and cannot change already funded trade rights.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Duplicate nonce/quote, two takers, expiry -1/exact/+1, simultaneous reserve beyond available, cancellation/consume ordering, zero/stale fee, changed terms, reverted funding, reorg and off-chain quote labeled unreserved.

Sources: [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271), [Solidity security](https://docs.soliditylang.org/en/latest/security-considerations.html). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Separate vault ABI and same-transaction consume/fund signature strategy need reviewed deployment profile before activation.
