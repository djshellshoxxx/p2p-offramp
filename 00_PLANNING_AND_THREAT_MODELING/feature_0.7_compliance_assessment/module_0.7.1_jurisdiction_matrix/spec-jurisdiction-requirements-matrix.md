# Jurisdiction applicability evidence matrix

## 1. Metadata

- **Specification ID:** LEGAL01
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 0
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Provide a versioned source-backed review workflow for supported operations without inventing a legal classification from the words noncustodial, anonymous or decentralized. This specification defines an evidence interface; it does not conclude that any commercial operation is approved in any jurisdiction.

## 3. Matrix schema and boundaries

```typescript
interface JurisdictionAssessmentV1 {
  version: 1;
  jurisdiction: string; // explicit country/province/state scope, not inferred IP location
  roleAssessmentId: string; // LEGAL02 fact pattern
  activity: "software-publication" | "matching" | "liquidity" |
    "fiat-processing" | "custody" | "courier" | "arbitration";
  operationProfile: string;
  requirementClass: "financial-services" | "sanctions" | "consumer" |
    "privacy" | "cash-handling" | "tax-records";
  sources: readonly { url: string; title: string; retrievedAt: string;
    effectiveDate: string | null; sourceDigest: string }[];
  status: "unassessed" | "needs-review" | "approved-profile" | "unsupported";
  reviewer: string | null;
  rationalePath: string | null;
  reviewedAt: string | null;
  nextReviewAt: string | null;
}
```

Default production matrix has no approved commercial profiles. Local/simulated/testnet engineering remains clearly labeled and cannot be represented as commercial approval. Sources identify actual official guidance/legislation and effective dates; digest records captured evidence, not a legal opinion.

## 4. Applicability and update algorithm

Collect LEGAL02 operational facts before classifying an activity: who controls keys/assets, routes fiat, matches counterparties, receives fees, operates relays, adjudicates or physically carries cash. Map each actual role/activity/jurisdiction to source-backed requirements and record a qualified reviewer decision. Do not assume software publisher, liquidity provider and courier share a classification.

A production operation profile may be marked approved only with named review, dated rationale, cited sources and bounded nextReviewAt no more than 90 days after review. A material role/authority/fee/custody/payment-rail change invalidates affected assessments immediately; source changes or elapsed nextReviewAt move status to needs-review. Missing/rejected assessments keep the relevant new commercial profile unsupported. Do not use inferred IP/GPS as proof of residence, jurisdiction or identity. No hidden KYC upload or operator account is added by this generic matrix.

This module does not alter an already-funded immutable escrow or block its recovery exits. Any service-specific operational controls are separately specified and disclosed before funding; they cannot be retrofitted through a UI flag.

## 5. Interfaces and error behavior

`assessmentFor(roleAssessmentId, jurisdiction, operationProfile)` returns an exact entry or unassessed. `canOfferCommercialProfile(entry, now)` requires approved-profile, matching role facts and current review dates; unknown inputs return unsupported, never an optimistic default. At most 256 matrix entries per release and 32 sources per entry; schema rejects unknown fields, malformed dates, duplicate IDs and non-HTTPS source URLs. Rationale/evidence is public and redacted; no user's private transaction data is included. Review failures are fixed codes REVIEW_MISSING/REVIEW_STALE/ROLE_CHANGED/UNSUPPORTED_PROFILE and do not claim a person broke a law.

## 6. Threat assessment

False labels can conceal actual custody or intermediary roles. Geographic spoofing and provider location do not settle jurisdiction. Mutable websites, outdated opinions and copied guidance require freshness/provenance checks; automated source diffs flag review but cannot decide legal applicability. Anonymity and a static frontend do not themselves establish exemption. Review records are advisory operational policy and cannot grant on-chain confiscation or privileged access.

## 7. Verification and official sources

Fixtures cover missing role facts, expired/invalid dates, changed custody/fees, stale official sources, unsupported jurisdictions and privacy-preserving local/testnet mode. Assert no commercial approval from an absent matrix row or IP-derived country. Assert a changed assessment never changes funded escrow destination/exit. Review Canadian applicability against current [FINTRAC MSB guidance](https://fintrac-canafe.canada.ca/msb-esm/msb-eng), [FINTRAC obligations](https://fintrac-canafe.canada.ca/guidance-directives/guidance-directives-eng) and [Office of the Privacy Commissioner PIPEDA guidance](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/). These are research entry points, not a conclusion about this project; capture exact applicable primary sources for each actual review.
