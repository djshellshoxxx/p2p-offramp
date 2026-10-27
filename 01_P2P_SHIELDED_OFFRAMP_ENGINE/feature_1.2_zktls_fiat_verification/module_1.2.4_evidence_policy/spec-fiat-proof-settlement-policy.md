# Fiat evidence and settlement policy

## 1. Metadata

- **Specification:** G30
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 4 (optional evidence)
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Keep authenticated evidence advisory in basic trades and make separately negotiated stronger authority explicit.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
type EvidenceState="unverified"|"origin-authenticated"|"status-attested"|
 "contradicted"|"expired";
interface FiatEvidencePolicyV1 {mode:"advisory";termsHash:string;
 sourcePolicyIds:readonly string[];maxAgeSeconds:300;autoRelease:false;
 retention:"discard-after-session"|"encrypted-user-retained";}
// No evidence state is "irrevocably-paid" or an EscrowState.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Terms negotiate advisory proof capability only for new trades; absent module does not block manual basic trade. Origin-authenticated requires exact source proof; status-attested also requires receipt predicates; contradiction can result from authenticated reversal or inconsistent evidence; 300-second freshness expiry removes current-status label. Seller independently decides release before deadline; even a valid proof cannot call release, change recipient or extend expiry. Arbitration/automatic settlement requires separately versioned opt-in custody, rail reversal policy and reviewed verifier, never retrofit.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Expired/failed/unavailable proof shows explicit reason and manual-risk disclosure; do not imply bank failure or paid status. Raw evidence export requires user disclosure consent and encryption recipient selection. Removing optional module preserves original seller/refund paths.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Screenshots, compromised notaries and bank status semantics can mislead. An authentic posted observation can later reverse; no UI verified badge can imply payment protection. Basic seller withholding remains unresolved.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Forged screenshot, authentic reversed transfer, wrong beneficiary, delayed/partial payment, expired proof, valid source with unsupported status, compromised source profile and absent optional package. Assert no verifier result invokes wallet, changes escrow state or blocks refund recovery.

Sources: [TLS 1.3 RFC 8446](https://www.rfc-editor.org/rfc/rfc8446), [TLSNotary source](https://github.com/tlsnotary/tlsn). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
