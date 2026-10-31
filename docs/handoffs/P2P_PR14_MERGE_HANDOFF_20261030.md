# PR #14 merged — 2026-10-30 Pacific

**Milestone complete: PR #14 merged into the integration branch. Main was not advanced.** The owner explicitly authorized finishing/merging PR #14 and then approved continuing to the next milestone. No GitHub PR approval review was submitted.

## Exact source and remote verification

- PR: https://github.com/djshellshoxxx/p2p-offramp/pull/14 — verified closed/merged.
- Merge and remote integration `claude/sweet-noether-arf6ne`: **391653eaba946f77057b01fd03d3c234958bcf1d**.
- Reviewed/tested PR head: **2d3135b646bf99f63935287a082856ea7fe6b74d**. Runtime implementation: `f379dc243cd9164da076c69702c2b5c21898f520`.
- Merge tree: **634a2ec9e910c31844f9ea7de7e5f4b1cde96ef6**, exactly equal to the reviewed head and GitHub's tested synthetic merge tree. Merge parents: `47f9bbee455e7affbc39539489227228eb346a0f`, `2d3135b646bf99f63935287a082856ea7fe6b74d`.
- Main remains **c8547859f603f04d3df92e68925b99162594c39d**. Testnet remains `7165626c17d8afb7ad7fce461ae7df9cbfcdba07`.
- Runtime blob `888a199d6ec7ab5843c6e57f0e371949de3f33eb`; SHA-256 `263aaf875c457e444aae904fc3f7d53c440e6e2fccc6888a234d932b9af7ae2a`.
- Prior documentation SHA **eace75c2291546bfd53bde1116833877ea51b92e** is retained as the first parent of the updated documentation checkpoint. The new checkpoint also retains merge `391653e` as a parent. Resolve its exact documentation SHA from this file's containing commit on `work/p2p-pr14-finish-handoff-20261030`; it is recorded in PR #14's publication links. This branch contains documentation/evidence only beyond the merged source.

Original exchange/test-repair/review branch refs remain intact. PR #16 now reports merged by retained ancestry; no separate source import was needed. The queued-CI handoff and original red evidence remain in history.

## Completed behavior

The merged runtime refuses late results after close, stale/replaced sessions, expired advertisements/terms/messages, superseded takes and replay overbooking before state mutation. Offers are size-checked before copying. Accepted sessions cannot restart until advertisement expiry and count toward the bounded session capacity; cancelled/rejected sessions can restart.

Product paths changed by PR #14: `packages/exchange/src/exchange.ts`, `packages/exchange/test/exchange.test.mjs` (inherited exact PR #17 wrapper repair), and `packages/exchange/test/async-boundaries.test.mjs` (twelve new real-provider regressions). Other changes preserve review/evidence/handoffs, use native source imports instead of transformed-source evaluation and share synthetic harness setup. No app/runtime/schemas/dependency/workflow/security setting changed. PR #17 and PR #16 histories are retained, not recreated.

## Exact-head hosted qualification

All twelve push/pull-request Actions jobs completed successfully on `2d3135b` before merge. The post-merge tree is identical; this does not claim that separately triggered post-merge jobs have completed.

| Check | Result and evidence |
|---|---|
| Node suite | Job 124024299266: 795 tests, **794 pass, 0 fail/cancelled, 1 skip**. The cast-calldata comparison is skipped because Foundry is absent in that Node job. All twelve new real-provider boundary tests pass. |
| Typecheck/build/boundaries | Same job: pinned typecheck and app build, import boundaries pass. |
| Build policy / fuzz harness | 18/18 and 26/26 respectively, zero skips. This is not a newly executed 4,096-case campaign. |
| Browser | Job 124024299059: browser foundation/lifecycle, emitted web/testnet and private G16/release suites pass. Local fixtures; no deployment. |
| Specifications | Jobs 124024298694 and 124024298439 pass; spec unit tests 12/12. |
| Forge | Job 124024298748: 82 tests pass, zero failed/skipped, committed ABI check succeeds. This does not erase the separate Node skip. |
| Local EVM fixtures | Job 124024298934: local trade 8/8, reconciliation 5/5, Sepolia kit 9 checks and Sepolia trade 13 checks pass. Local fixture execution, not live-network deployment. |
| Sonar | Check 124025066415 passes, 0% new-code duplication, zero hotspots; two non-gate issues are reported. Original security/duplication failures remain historical evidence. |
| Snyk / automated review | Snyk succeeds with no manifest change. CodeRabbit skips non-default-base auto review; it is not counted as substantive review. |

Workflows: vault `41044252146`, EVM `41044252121`, inventory `41044252066`. Full hosted job logs were fetched and hashed locally; selected excerpts, counts, URLs and exact checks are committed under `docs/evidence/P2P_PR14_MERGE_20261030/`. Original full local logs remain in `review/hosted-<job>.log` in the finishing snapshot. The evidence JSON states this distinction.

## Substantive review and remaining package limitations

Separate specification and standards reviewers found no remaining merge blocker after the reproduced fixes. Follow-up reviews assessed both Qodo findings and reproduced the described behavior:

1. Buyer acceptance prepared before the deadline can reach the seller at/after it, producing local buyer accepted and seller offered/EXPIRED. Receipt-time refusal is retained. The exact lifecycle spec explicitly anticipates relay delay and ends accept eligibility at acceptBefore; acceptance is a local record, not delivery acknowledgment or funding. Sender timestamps are authenticated claims, not trusted time. The committed synthetic three-case probe covers receipt before/at/after the deadline.
2. Accepted sessions hold the bounded capacity until ad expiry. The standards probe with maxSessions=1 verified outgoing/incoming refusal, blocked same-pair restart, and successful reclamation for a different live ad exactly at expiry. Ad-lifetime slot starvation is an explicit availability limit; a separate tombstone map or caller release API needs its own bounded policy.

Both findings are retained as app/API design obligations, not represented as nonexistent. See `review-disposition.md` in the new evidence directory. App composition must expose local preparation/delivery/expiry appropriately and preserve no-restart/replay constraints. This is package qualification, not an independent whole-codebase audit, interoperability proof or release acceptance.

## Current other work and next milestone

- PR #18 candidate is **68fb46920431e3311c78f931432bc4a21d066c17**, based on source merge `eeb2a81323b9093864d6ec53b113949dbb710d25`. It already contains runtime `f379dc2` and the twelve new tests, plus PR #15 relay, review, validation, screenshots and gate notes. It does not yet include evidence cleanup `2d3135b` in its own ancestry. Its owner retains the candidate branch; do not overwrite it or duplicate the runtime fixes. Reconcile the newly merged integration history with the owner and qualify the resulting merge tree/current checks.
- PR #15 relay **e0961edc8cb64b466a2a3193aa37158bfc8c3487** remains separately owned. This milestone does not merge it or transfer ownership.
- Validation branch now **11ce9e42bea9e5f27e303ee6db66e463d38ebdda**, preserving `cc9a0a4` and `9eed65d`. Its hosted-workflow report is consistent with this session's log-level results. Its local candidate tests were on `fa115bb`, not a new claim for every subsequent head.
- App/trade/runtime/Worker/schemas remain reserved to their respective session. Reconcile ownership before editing. Unique local G16 **beb9866ed39452b603554d364c98fe025372da3a** remains inaccessible/unincorporated here; preserve it and retain `saved-review.ts` on any coordinated extraction.
- Parent PR #10/#12 acceptance, candidate integration and lean EVM app acceptance remain separate. Refresh their live gates; do not transfer PR #14's passing Sonar or tests to them.

Next milestone: coordinate candidate/relay ownership, reconcile this merge and the latest validation evidence without losing any history, then qualify that combined source. Once app ownership is clear, implement dependency-ready composition and local two-party EVM acceptance. The detailed `P2P_FINISH_PROJECT_PROMPT_20261030.md` supplies the continuation sequence, controls and eventual whole-code/deep security review.

## Access and boundaries

No merge/upload was denied in this milestone. GitHub confirmed the merge and remote ref; no uncertain write remains. Earlier local npm access failed EPERM at the managed proxy and was not retried or bypassed; current full-suite evidence is hosted and independently reported by the validation executor. This workspace remains a partial materialized snapshot, not another executor's checkout or unpublished work.

Keep ReleaseEnabled=0, connectOrigins=[], client-side/noncustodial, profile cap 16, trust/resource/recovery/data-loss and unknown-outcome controls. No deployment, live funds, new credentials, security settings, custodial-ledger merge, paid infrastructure, paid Claude call or measured prompt-cache claim occurred. No release authority is implied.
