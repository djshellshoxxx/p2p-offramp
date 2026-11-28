# 2026-11-22 — S01–S03 core/relay provenance, corrected guards and historical documentation

**Source-bound evidence.** Fixed default branch `main@01f6f4feca051d68de24a04299cd3bb444bce40c` (Git tree `437323a382952b9623a875c818f8af005a5d4563`), existing documentation coordinator `PR #245@88b7be1f9e3aeff1728db153315c5cf57526cfd0` prior to this update. Full GitHub recursive Git trees returned `truncated=false`: main 3,378 entries, S01 2,077, S02 2,092, S03 2,092, owner PR37 2,077, PR38 2,093 and PR39 2,095. The S02 and S03 stage-local path sets came from direct compare of the adjacent original stage tips; S01's path set was checked against fixed main. All 68 source paths exist in both main and relevant owner PR stacks; no branch was merged here.

| Historical immutable tip | Owner branch/PR head | Isolated stage paths | Exact blob in owner | Corrected owner blob | Exact blob in main | Changed since in main | Missing paths |
|---|---|---:|---:|---:|---:|---:|---:|
| S01 `4e319013ea61ead31ae00ea9a44fa9c431cc84ce` | #37 `81a295d5cd3936b88eded7e52b6f2a78989f6ea7` | 20 | 15 | 5 | 9 | 11 | 0 |
| S02 `01344cbd6655f509f3e2e3903333cdb579228d37` | #38 `71a56d10405bacc7ab39f29d1b63b4bde8a82504` | 40 | 37 | 3 | 29 | 11 | 0 |
| S03 `5a747ded358ee9fcca393bb4a0616fd4e8632296` | #39 `404dc3daa8b19904c7da29d71d49d8df0f5e03ba` | 8 | 6 | 2 | 4 | 4 | 0 |
| **Totals** | Original stage work only | **68** | **58** | **10** | **42** | **26** | **0** |

**Ownership:** PR #37 remains open, PR #38 and #39 are closed **without merge**; open PR #40 stacks on the historical #39 head, and PR #26 preserves the larger source. Closed PRs are not treated as integrated into main. Counts cover isolated stage-local paths, not the cumulative stacked PR tree or all historical commits.

## Five inspected S02/S03 corrections, and why not to overwrite main

- **S02 history-retention test:** historical `bf08c7714eead9668f719478c7f785af44f3c05e` → current owner/main `ff9154690c1e6e7f57e17a91f573b7bd9931213d`. Comparison of response keys switched from sorting keys to exact `Set` equality.
- **S02 core schema:** historical `bee036af86182acf66efcf9230b9f452ab8a10ed` → owner/main `d33644a5745f53df83bfefda347bdd04e56c4a61`. Explicit locale-independent UTF-16 comparator is now used for pending intent IDs.
- **S02 retention test:** historical `6c8d06cb389c78fcff0b3e66decfceaf842cd0d6` → owner `1df95b9cfd6e83750885dd1f4ae3c3522bad6d94`, main `5e5939b2c93da6e416e458354f1c5ca59b0c7b8d`. Main also adds fail-closed chat completeness and dynamic-length-getter regression cases. Preserve those newer assertions.
- **S03 NIP-01 decoder:** historical `8c34172bdab11bb376bb1b2b0fcc3de4b035580e` → owner/main `977f91b14411c9ed6046e1fb18a86ee748a7b104`. Duplicate inline `indexedValues` snapshot helper was extracted to `./snapshot.ts`.
- **S03 relay pool:** historical `f9183b5ddfcce5a80d22f0ffe3fd84aab5324451` → owner `f157c515776ab2a249f5d2974bd9d655967f3925` → main `4ec25347479229d8f59da55be595bbddcd50e016`. Owner fixes deduplication from globally keyed event IDs to **(subscription ID, event ID)** and cleans up dedup entries on subscription removal. Main retains that correction and additionally rechecks scope/generation/subscription ownership **after async verification** before delivery/penalty mutation, and uses descriptor-based handler lookup through a bounded prototype chain. Merging the historical pool wholesale would regress both the corrected dedup boundary and newer ownership guards.

S01's five corrected owner paths are `scripts/check-import-boundaries.mjs`, `scripts/formal/README.md`, `scripts/formal/evm.mjs`, `scripts/tests/formal-evm.test.mjs`, and `scripts/tests/sepolia-trade-state.test.mjs`; nine of 20 S01 stage blobs exactly match main, with all other paths still present but updated. The S01 formal/run-time tooling remains unexecuted by this coordinator. **Do not transplant old test harnesses or weaken existing main CI/financial assertions.**

## Other divergent document-only branches

- `chatgpt/zero-codex/docs-collaboration-20261117@e21a58e6a4d09c099d3249660ddec770f2164a74`: complete `docs/handoffs/CHATGPT_GITHUB_COLLABORATION_LATEST.md` Git blob `d752c1004057a2aef039f90de1eb8b0fc7a492b0` **exactly matches main**. PR #131 is closed unmerged; do not duplicate its documentation.
- `chatgpt/zero-codex/docs-python-baseline-20261116@75a5e35b56310a9660aa7c6a3855db3c64e759f4`: historic commit replaces `Python 3.11+` with `Python 3.12+` in `docs/OPERATOR.md`. The intended new line is present in main and the removed line is not. Complete historical blob `0179f2ca58a45ffc14629c65071fce951f56cf1c` differs from expanded current main blob `c3013a8322ad9b34863cbcadbb14b5885b09779d`; this is **one-line documentary patch coverage**, not full-tree or Git patch-id equivalence. PR #129 remains closed unmerged.
- The unique old proposed zero-Codex workstream document from PR #63 is absent main and still recorded as unassessed/superseded-candidate rather than silently classified as merged.

## Qualification and remaining work

All 257 current remote branches and all 242 PR records were re-enumerated (60 open, 124 merged, 58 closed unmerged). Previous PR #245 source head `88b7be1f9e3aeff1728db153315c5cf57526cfd0` has 14/14 completed-success GitHub check-runs (including Firefox/WebKit and CodeQL). A new document SHA requires its **own** check results; prior check success is not transferred.

Counters after this bounded source review: **A137 / P59 / U0 / C4 / E12 / V14 / F14 / B1 / D16 = 257**. `U=0` means ancestry screened, **not all branches reconciled**: 16 divergent semantically unreviewed, 59 open-PR-associated branch heads, 12 limited-equivalence, 14 partially reconciled and existing Tier B/C/review/native gates remain. No local `git patch-id`, `git range-diff`, Node, Chromium, EVM or Solana test execution: the original `/workspace/scratch` checkout is not mounted, and local direct GitHub DNS fails. The analysis is exact GitHub commit ancestry/tree/blob and source-guard inspection only. No feature completion/approval inference.

**Next actionable cohort:** determine whether newer wallet admission/cancellation tests from PR #26/#40 need current-main adaptations and run red-green in a qualified local executor; assess original S02/S03 remaining 26 main-different blobs for unique desirable effects, not just syntactic difference; qualify PR #237 Tier B named review and current-target checkout before ordered PR #238/#239 and Tier C #241/#242. Preserve noncustodial escrow/replay invariants, source ownership, prior failed tests, real 1,800-second waits and required approvals. Do not force/delete, release, deploy or enable optional defaults. `ReleaseEnabled=0` remains in effect.
