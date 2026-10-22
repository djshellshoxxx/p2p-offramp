# Manual settlement risk policy

## 1. Metadata

- **Specification:** G17
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 2
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Make the basic escrow’s unilateral seller release and buyer exposure an explicit acceptance condition.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface ManualRiskConsent {version:1; termsHash:string;
 role:"seller"|"buyer"; disclosureVersion:"manual-v1";
 acceptedAtLocalMs:number; // encrypted local consent, not bank evidence
 sellerWithholdingAcknowledged:boolean; railReversibilityAcknowledged:boolean;
 deadlineRiskAcknowledged:boolean; }
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Show before both parties accept terms: seller funds crypto, buyer sends fiat outside escrow, seller alone may release before expiry, anyone may refund crypto only to seller at expiry. Buyer may lose fiat if seller withholds; no app operator can compel release/refund fiat. Seller must independently check correct fiat amount/beneficiary/status and may face reversal even after apparent receipt. Require explicit role-specific consent bound to termsHash; stale disclosure/terms invalidates consent. Never precheck acceptance. Receipts/screenshots/chat/proofs cannot enable an automatic release command.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Declining consent leaves draft unaccepted and no wallet prompt. After fiat sent, offer encrypted communication/evidence export and direct chain observation, without implying guaranteed remedy or basic escrow dispute authority. Missing consent blocks guidance/signing but not watch-only recovery of existing funds.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Pressure, false proof badges and countdowns can induce unsafe payment. Use plain persistent risk text and accessible acknowledgement. Consent records do not establish legal enforceability, informed human understanding or that fiat occurred.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Fresh client cannot accept without acknowledgements; role switch/terms edit resets consent; screenshot/valid proof never enables buyer release; expiry shows seller refund destination; decline invokes no wallet; keyboard/screen-reader flow. Human review checks text against actual authority.

Sources: [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271), [Solidity security](https://docs.soliditylang.org/en/latest/security-considerations.html). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
