# Consolidation ledger — 2026-11-04

This ledger records a read-only GitHub comparison against `main` and proposes a gated integration order. No source PR has been merged by this ledger.

## Verified branch comparisons

GitHub compare `main...pull/N/head` reported:

| PR | Ahead | Behind | Files in comparison | Scope |
|---|---:|---:|---:|---|
| #37 | 3 | 4 | 20 | gates, signature oracle, EVM |
| #38 | 7 | 4 | 62 | core schema, transport, storage |
| #39 | 11 | 4 | 73 | relay, messaging |
| #40 | 14 | 4 | 91 | wallet signatures, asset updates |
| #41 | 18 | 4 | 131 | web locale runtime |
| #42 | 23 | 4 | 185 | personalization, UI |
| #43 | 28 | 4 | 206 | private trade |
| #44 | 33 | 4 | 245 | recovery and tooling |
| #45 | 37 | 4 | 272 | dependency intake |
| #46 | 43 | 4 | 300 | optional packages — park pending D7 |
| #47 | 49 | 4 | 300 | governance and CI |
| #48 | 53 | 4 | 300 | evidence and documentation |
| #50 | 6 | 5 | 37 | Solana escrow, separate workstream |

The increasing ahead/file counts indicate cumulative PR ancestry. Counts are *not* unique changes per PR. Comparisons are snapshots, not a proof of merge readiness.

## Proposed gated sequence

1. **Baseline:** inspect main's latest CI, open PRs #26, #28, #31, #35 and owner decision records. Map already-merged functionality and known defects.
2. **Foundation:** review #37, then #38. Extract or rebase only verified nonduplicated changes onto current main. Run specifications, EVM escrow and vault checks. Preserve formal and signature test evidence.
3. **Messaging and wallet:** review #39 and #40 against the accepted foundation; validate relay dedupe, bounds, EIP-1271 and signed asset updates.
4. **Web journey:** review #41–#43; validate localization, browser journeys, cancellation, retention and privacy requirements. Address verified findings from #28/#31/#35 rather than blindly applying their patches.
5. **Recovery and assurance:** review #44, #45, #47, #48, keeping documentation, tooling and CI changes appropriately separated. Park #46 until the D7 decision permits optional packages.
6. **Independent Solana track:** handle #50 separately; check D5 acceptance, Anchor/LiteSVM and vector tests, and third-party notices.
7. **Research and decisions:** reconcile #29–#34 and #49 as evidence/decision material; do not treat documentation-only PRs as production implementation.
8. **Final:** run full CI and security regression tests, inspect diff and attribution, create focused integration PRs, and merge only when review and required checks permit.

## Guardrails

- Do not merge the entire #37–#48 series as independent PRs without checking ancestry and duplicate content.
- Do not overwrite active contributor branches or close PRs based on inferred supersession.
- Do not bypass required checks or resolve conflicts by discarding functionality.
- Each integration PR must record source PR(s), exact commits, tests executed, decisions and remaining blockers.
- This document does not claim that source code has been consolidated or tests executed.
