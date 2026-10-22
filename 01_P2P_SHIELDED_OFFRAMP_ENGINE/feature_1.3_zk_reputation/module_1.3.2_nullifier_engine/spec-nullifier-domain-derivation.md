# Nullifier domain derivation

## 1. Metadata

- **Specification:** spec-nullifier-domain-derivation
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 3 (optional reputation)
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Define domain scope and serialization without inventing circuit arithmetic or causing cross-purpose tracking.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface NullifierDomainV1 {protocol:"p2p-offramp";version:1;
 networkId:string;deploymentId:string;verifierProfileId:string;issuerId:string;
 groupId:string;purpose:"order-eligibility"|"rating";epoch:string;
 relyingParty:string;tradeId:string|null;}
// Every string length <=128 UTF-8 bytes; epoch uint64 decimal;
// tradeId null for one-use-per-epoch scope, present for one-use-per-trade.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Encode domain as fixed-order length-prefixed UTF-8 byte tuple with explicit null marker and unsigned big-endian version, never raw concatenation or JSON field-order dependence. Hash-to-field and V4 scope mapping must be the selected reviewed provider profile with published vectors, not modulo reduction added by app. Message separately binds accepted terms digest and required predicate. Purpose policy decides whether tradeId is present: including it prevents cross-trade proof substitution but permits one use in each trade; it does not enforce global one-per-epoch. Domain is authenticated/verifier-derived, not user-controlled.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Unknown purpose/encoding/profile fails UNSUPPORTED_VERSION; out-of-field values fail INVALID_INPUT. Changing domain/profile requires newly negotiated terms. No fallback domain that omits unavailable chain/relying-party data.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Same scope can intentionally link repeated attempts and deter double signaling; issuer may correlate roots. Overbroad relyingParty creates tracking; overspecific scope weakens duplicate control. Document intended uniqueness per consumer.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Ambiguous tuples, reordered fields, null versus empty, Unicode bytes, field overflow, distinct chains/deployments/purposes/epochs, trade-present versus null and V3/V4 confusion. Compare independent encoding implementations before enabling.

Sources: [Semaphore V4 documentation](https://docs.semaphore.pse.dev/), [Semaphore source](https://github.com/semaphore-protocol/semaphore). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
