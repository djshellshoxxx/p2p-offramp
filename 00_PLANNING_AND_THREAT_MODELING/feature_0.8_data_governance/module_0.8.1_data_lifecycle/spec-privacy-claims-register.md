# Privacy claim evidence and user-facing status register

## 1. Metadata

- **Specification ID:** DATA02
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 0
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Make privacy wording testable against actual implementation coverage. Do not describe the entire product as anonymous, untraceable, trustless fiat settlement, browser-wide Tor protected or securely erased merely because one module uses encryption.

## 3. Claim schema and initial register

```typescript
interface PrivacyClaimV1 {
  version: 1; id: string; capability: string;
  exactCopy: string;
  preconditions: readonly string[];
  exclusions: readonly string[];
  evidencePaths: readonly string[];
  status: "proposed" | "tested-scoped" | "unsupported" | "withdrawn";
  reviewedAt: string | null;
}
```

| Claim candidate | Required evidence | Exclusions that remain visible |
|---|---|---|
| Local records encrypted at rest | G02 vectors, auth/tamper/storage tests | Unlocked origin, weak passphrase, backups, OS compromise |
| Private message content encrypted | Selected NIP44/17 provider vectors and two-client tests | Relay metadata, recipient copies, no claimed forward secrecy |
| Selected channel privately routed | G05 real enforceable egress tests | Unknown/direct wallet, OS/extension/DNS limits, timing correlation |
| Per-payment stealth recipient | EIP5564 scheme1 vectors and spending/scanner integration | Gas/sweep linkage, public chain, receiver compromise |
| Approximate discovery region | Geo privacy-budget/collusion tests | Observers, exact private disclosures, external positioning |
| Local data logically removed | Actual storage/UI deletion tests | Backups, relay copies, filesystem/browser remanence |

Initial statuses are proposed/unsupported until implementation evidence exists. A generated report or seven-section spec is not testing evidence.

## 4. Claim evaluation algorithm

Each public/UI privacy sentence maps to one claim ID and exact tested preconditions. Display tested-scoped wording only if the runtime capability registry confirms the selected profile/evidence matches current configuration. Route or wallet changes immediately invalidate affected private-routing claims. Degraded/unknown coverage is visible before signing or data disclosure, not buried in settings.

CI checks that registered UI copy keys reference a known claim and that tested-scoped entries have existing review/evidence paths. Claim text changes require review of scope and exclusions. Dependency/protocol/browser/deployment changes affecting a claim move it to proposed until tests/review are rerun. Keep the old claim/evidence for prior immutable artifact identification, not as proof for the new build. A missing claim record yields neutral unsupported wording; never a broad privacy badge.

## 5. Interfaces and error handling

`claimFor(capability, runtimeProfile)` returns exact copy plus exclusions and status. `canDisplayTestedClaim(claim, evidenceManifest, runtimeCoverage)` is a pure predicate that rejects mismatches/unknown coverage. IDs <=64 ASCII bytes, exactCopy <=512 UTF-8 bytes, <=32 preconditions/exclusions/evidence paths; unknown fields and duplicate IDs fail config validation. Diagnostics record claim ID and fixed invalidation code only. Translations must preserve substantive scope/exclusions and are version-bound under the localization spec.

## 6. Threat assessment

Overbroad badges can cause users to disclose identifiers or send funds under false assumptions. Encryption protects a specific boundary, not all metadata or compromised recipients. Provider self-attestation and successful connectivity cannot establish private routing. A data deletion UI cannot prove physical erasure. Feature marketing and translations can expand claims without code changes; treat copy changes as security-sensitive and test them against registry scope.

## 7. Verification and references

Run a claim-by-runtime matrix for direct/private/unknown channels, locked/unlocked storage, unsupported messaging, absent advanced packages and stale evidence. Assert no tested label without matching evidence, no broad aggregate badge when wallet routing is unknown, and no secure-erasure/anonymity/trustless-fiat wording. Translation tests verify required exclusions remain accessible. Sources: [G05 transport](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md), [memory limitations](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.3_client_security/spec-rainbow-book-data-remanence-and-memory-sanitization.md), [NIP44 security](https://github.com/nostr-protocol/nips/blob/master/44.md). Registry evidence records evaluated immutable revisions at implementation.
