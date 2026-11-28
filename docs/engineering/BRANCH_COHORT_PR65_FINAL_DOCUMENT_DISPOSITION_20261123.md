# PR65 final branch-local source and historical document disposition — 2026-11-23 UTC

**Scope:** closed, **not merged** [PR65](https://github.com/djshellshoxxx/p2p-offramp/pull/65), branch `claude/friendly-dijkstra-nsi310`, exact tip `bd26833555e13408825942e9696157ed68e9980e` (tree `73a9b55007d65c317c0bdb2877edd306b439e0b3`). Current-main comparison: `main@01f6f4feca051d68de24a04299cd3bb444bce40c`, merge base `300287dcde818a9d10ae301265d00bc7c0877bbb`, **ahead 6 / behind 615**, status diverged. Do not confuse this with the separate `integration/m2a-safe-fixes-20261114` branch / merged PR115, which has tip `c0bbfe62951873a0960b4218b9db9b06b616da5a`, ahead 0 / behind 435 and is an exact ancestor of main.

**Conclusion:** all ten *branch-local PR65 paths* now have an explicit disposition. The actual T33–T35 regressions are present in newer main code and tests. Two 2026-11-10 research/orchestration documents and the historical plan/task-log changes are **superseded as current instructions**, but their original bytes and provenance remain unchanged at the original PR65 head. Distinct T36–T40 *feature obligations* are **NOT certified complete** by this source classification; they remain in the unresolved-feature register below. This is a **F/content-and-historical-process reconciliation**, **not** an ancestry merge, Tier C approval, security signoff, source test result or release-acceptance declaration.

## Ten-path disposition

| PR65 branch-local path | Source decision against 2026-11-23 main |
| --- | --- |
| `apps/web/src/runtime/worker-endpoint.ts` | T33 corrected semantic behavior retained: invalid historical saved-review wrappers return null, remain encrypted/untouched and are counted as skipped. Current code contains later BUSY, vault and backup protections, so do not overwrite with old code |
| `apps/web/test/saved-reviews-worker.test.mjs` | **Exact main blob** `9a4504e2de244b0177d7731567cba68fd7d81009` |
| `apps/web/test/worker-endpoint.test.mjs` | **Exact main blob** `260bef2bd4a0044731d22883b9e1c25aa267f862` |
| `apps/web/scripts/artifact-policy.mjs` | T34 unquoted/space-padded `http-equiv=refresh` deny rule retained; main has additional modern build/exception checks; retain newer source |
| `apps/web/scripts/artifact-policy.test.mjs` | T34 historical negative cases present and extended; not an identical complete blob |
| `scripts/test-evm-local-trade.mjs` | **Exact main blob** `1c31ac25f09fa6cc41028895b138e0c0c7da425e`: four same-block release/refund races (before/at expiry; both fee orders), not a proof of live deployment |
| `tasks/plan.md` | Old M2A frozen-files/worker ownership was specific to main `300287d`; today's main plan `6cc699663ed17b627c8fda2976e2fafdebb996f5` supersedes it. Preserve historical owner boundaries, do not reinstate stale locks |
| `tasks/todo.md` | Original blob `7f4c8532b27d76d1d754d6a960115460f2f56b7d` listed T33–35 REVIEW and T36–40 OPEN. Current `tasks/todo.md` blob `064aa0383f264644aa2a5d73f0bd90f8e2f60b5f` records T33–35 DONE via PR115 and explicitly warns T36–40 require fresh status review; do not restore old REVIEW statuses |
| `docs/execution/M2B-GAP-RECORD-2026-11-10.md` | Historic read-only spec-gap research at main `300287d`, original blob `10839e328ae6f13b17b9a9155e7b1ab76236b930`, [read original](https://github.com/djshellshoxxx/p2p-offramp/blob/bd26833555e13408825942e9696157ed68e9980e/docs/execution/M2B-GAP-RECORD-2026-11-10.md). Preserve immutable source, **do not** present its Solana missing-wire-format table as current state; later Solana code and unmerged PR241/242 must be checked individually |
| `docs/execution/MILESTONE-M2A-ORCHESTRATION-PROMPT-2026-11-10.md` | Historic execution prompt pinned to `300287d`, original blob `a1fb2e5f505958f705526fe89d96d7ecfb35916e`, [read original](https://github.com/djshellshoxxx/p2p-offramp/blob/bd26833555e13408825942e9696157ed68e9980e/docs/execution/MILESTONE-M2A-ORCHESTRATION-PROMPT-2026-11-10.md). Its old agent assignments and authorizations are deliberately non-applicable to today's current source; do not republish as executable policy |

## Important unresolved work not declared complete

- **T36:** independently refresh Phase 2 security/audit triage against current main and active funding stack; original eight-auditor count is historical, not current acceptance.
- **T37:** determine which current EVM matrix TestCase rows have exact hosted evidence and which require a dedicated checker; no passed row without source-specific proof.
- **T38:** review present unsigned local release-bundle inventory and checkers; no invented deployment/CID/keys or signed release manifest.
- **T39:** compare current direct-contract recovery and incident runbooks with intended loss-of-frontend/relay proof; preserve external ownership/jurisdiction dependencies.
- **T40:** inspect Wallet Standard/EIP-6963 discovery lifecycle and explicit wallet action gates against current code. Do not assume the 2026-11-10 sketch is integrated or that current financial device acceptance is complete.
- **Solana M2B research:** some earlier undefined interfaces may now be implemented in main or drafted in [PR241](https://github.com/djshellshoxxx/p2p-offramp/pull/241)/[PR242](https://github.com/djshellshoxxx/p2p-offramp/pull/242); no blanket assertion that the eleven old questions were solved. The canonical [feature tracker](FEATURE_COMPLETION_TRACKER.md) and independently reviewed final-target code must decide.

## Auditability and boundaries

Based on authenticated GitHub PR65 ten-file patch, immutable commit compare, original task/docs blobs, exact main saved-review and EVM test blobs, main policy/endpoint semantics and current task-status files. Prior [PR100/PR65 source comparison](BRANCH_COHORT_PR100_PR65_SAFETY_SOURCE_PROOF_20261123.md) is preserved. **No local Node, Foundry, Solana validator, browser, fuzzing, RED/GREEN or live-wallet execution was performed this cohort**. No PR merged, source ref deleted, original documentation changed, trust key invented or release flag enabled. Keep `ReleaseEnabled=0`, historical failure receipts and independent/owner approval gates intact. This classification tracks **branch-local content only**; other still-open M2A/M2B feature work is outside this supersession decision.
