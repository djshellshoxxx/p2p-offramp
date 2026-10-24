# Acceptance evidence and gate matrix

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M0–M6.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Require traceable evidence for release claims. A checked document heading, generated inventory or green link checker is not product acceptance. Gates attach to exact source, dependency and deployed artifact identities.

## 3. Architecture and data contracts

GateRecord: `{id,milestone,requirementIds,specDigests,sourceCommit,artifactDigests,testCases,targetMatrix,reportDigests,reviewer,decision,decidedAt,expiresOnChange}`. decision is pending, failed or passed; waived is prohibited for mandatory critical/high security blockers. Each test result is pass/fail/unsupported/not-run with logs and environment. Unsupported is acceptable only for optional advertised-as-unavailable features, never a mandatory chain/recovery path.

## 4. Algorithms and lifecycle

M0: primitive known-answer/tamper tests, separate key lifecycle, G02 authenticated persistence, G03 fresh-key restore on new origin, G04 hostile content and G05 strict-route refusal. M1: reproducible static build, migrations/downgrade rejection, chain/account-change cancellation, uncertain broadcast reconciliation, core-only module exclusion and G15 trust/bootstrap checks. M2A: EVM native/allowlisted ERC-20 release/refund and adversarial cases. M2B: Solana native/allowlisted SPL parity with signer/account/program validation. M2C: full G24 browser/device matrix, independent recovery, G25 rollback, G26 incident drill, WCAG 2.2 AA assessment, reviewed safety translations, license/SBOM evidence and independent security review. M3–M6 add capability-specific circuit/privacy/hardware/arbitration evidence and must rerun basic trade regression. Any unresolved critical/high finding makes decision failed; all risk acceptances for lesser findings identify owner and rationale.

## 5. Interfaces and integration

A gate is passed only when every mandatory row has applicable evidence and named review of its scope/limitations. `evaluateGate(records,releaseCandidate)` verifies artifact/spec identity and reports missing, stale or failing evidence, without auto-approving semantic review. Store artifacts append-only with hashes; superseding results link prior failures rather than erasing them. Review decisions distinguish designer, implementer and independent reviewer roles.

## 6. Errors, abuse and residual threats

GATE_INCOMPLETE, TARGET_UNTESTED, REVIEW_SCOPE_MISMATCH and STALE_EVIDENCE block promotion. Browser emulation alone cannot mark physical mobile-wallet/device cases passed. Flaky tests need investigated causes; rerunning until green without explanation is not acceptance. Changed dependencies, compiler flags, deployment or cryptographic artifacts invalidate relevant rows.

## 7. Verification and primary references

Acceptance report must show totals and every not-run/unsupported target, not just aggregate pass percentage. Include negative tests for wrong origin/network, corrupted backup, expired terms, seller withholding disclosure and expiry equality. Verify that build/deployment cannot promote with a mandatory pending row. Current status is design baseline with implementation and independent review pending.

Primary references (exact implementation revisions must be pinned in the evidence record): [WCAG 2.2](https://www.w3.org/TR/WCAG22/); [GitHub Actions security](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions).
