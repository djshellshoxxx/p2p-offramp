# Claim freshness completion — November 27, 2026

Baseline: `fdf346ab8e6aacc60b501007ec10ec7ee840a701`. This completes the implementation of B4 tooling F2 recorded in [Lane B progress](../consolidation/LANE-B-PROGRESS.md). Integration remains subject to the repository's D8 review and CI gates.

## Observed gap and plan

The documentation validator already reports stale evidence paths and stale claim IDs. A change only to the bound English UI catalog makes the associated claim IDs stale without changing their individual evidence files. The claims API previously ignored that second signal and defaulted missing freshness data to an empty list.

The completed implementation follows these steps:

1. Reproduce missing-freshness acceptance and copy-only drift through the actual validator in an isolated Git fixture.
2. Require both validator lists in `canDisplayTestedClaim` and `claimFor`, preserving maintained trust and exact scope checks.
3. Validate bounded own-data arrays before checking either evidence paths or claim IDs. Reject malformed lists without invoking their methods or accessors.
4. Preserve the description while downgrading stale tested claims to `proposed` with no review date.
5. Verify clean acceptance, stale refusal, restored-copy acceptance and unrelated-claim preservation; review the complete change independently.

## Regression evidence

Four added regressions failed against the baseline: omitted freshness, copy-only stale IDs, hostile array methods/accessors, and the actual validator-to-claims copy-drift path. The focused suite then passed 31 tests with no failures, skips, cancellations or TODOs. It includes 256 deterministic combinations of stale paths and stale IDs, plus exact limit and over-limit checks.

An independent reviewer reproduced the original defect, reviewed the implementation and ran the same 31-test suite. No High or Medium finding remained. A Low test-reachability finding was fixed: no-trust tests now supply explicit fresh lists so they continue to exercise the authority check. The final claims-only suite passed all 14 tests after that correction.

Run the focused checks with:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test packages/claims/test/*.test.mjs scripts/docs/validate.test.mjs
```

The PR records broader verification and hosted checks at its current head. This source change follows Tier B: the independent review here is separate from the required CodeRabbit or Qodo review.

## Compatibility and limits

Existing calls must pass `report.stale` and `report.staleClaims` from a successful current validation. Omission now refuses tested status. The validator's path limit is 128 evidence records plus one copy source; the claim-ID limit is 64.

Freshness can veto a claim but cannot approve it. Maintained verification of the entire canonical claim, source revision, evidence digest, runtime profile and currentness remains necessary. No default trust implementation, approved claim, payment authority, release enablement or public deployment is introduced. The defect and its regression use synthetic maintained trust to isolate this API behavior; they do not establish that the shipped application displayed a stale approved claim.
