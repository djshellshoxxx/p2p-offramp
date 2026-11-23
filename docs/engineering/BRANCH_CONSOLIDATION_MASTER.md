## 2026-11-23 UTC — S04 historical EVM test corpus recovered on draft PR247→PR248, main still lacks nine tests

[Source-bound nine-case recovery proof](BRANCH_COHORT_S04_EVM_EXECUTION_REGRESSION_RECOVERY_20261123.md) verified all nine historical wallet-execution admission/signal regression title prefixes from S04/PR40 missing on main are represented in OPEN DRAFT PR248 (five in PR247, four added in PR248), with immutable test blobs main `d08491dabbe6c6f46a6617656bc8de5ebe2b3d31`, historical `66246d3a824c900cf7e2d714d4d66670d15fa4da`, PR247 `de53e46750c63b6a14685dbcf9bec054509bba18`, PR248 `ca324dfe61554936cd3478dc93e151c508f89179`. Live compare confirms ordered main→247→248 (two commits each, no behind). At current exact heads PR247 14/14 checks including CodeQL, PR248 11/11 reported checks but no CodeQL; no Tier C or owner approval. **S04 remains V, not merged/complete**; native EIP-1271 and other divergent S04 paths remain separately gated. Fresh fully paginated census 262 branches/247 PRs (65 open, 124 merged, 58 closed); classifications A137/P64/F34/C5/E0/V21/B1/D0. No new runtime execution or main merge; `ReleaseEnabled=0` remains unchanged.

---

## 2026-11-23 UTC — unique generation-11 historical CI evidence recovered; PR250 retry passed

[Source-bound preservation and hosted readback](BRANCH_COHORT_SUCCESSOR_G11_EVIDENCE_RECOVERY_20261123.md): recovered **five unique dated generation-11 source blobs** from immutable historical successor head `3b538fd4586b6fc00846262d67956a2125b6c9f1` to the still-DRAFT coordinator PR245, including original queued/cancelled/native-audit evidence and its historical handoff. No old snapshot was rewritten or promoted to live authority. The historical successor remains V, not merged or feature-complete; classifications unchanged **A137/P64/F34/C5/E0/V21/B1/D0 (262)**.

PR250 exact head `d75d2a00d4cfdd83fd681c361eefce69bc91c617` now has **11/11 check runs success** and separate Snyk success. First hosted local-trade attempt **failed** after native EIP-1271 success on unrelated Chromium wallet connection; one same-head retry **completed success**, job [137847864848](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/45218137585/job/137847864848), at 16:45:21Z, including native, controller, ERC-20 and browser acceptance steps. No CodeQL child check or independent Tier C/owner PR approval was established; #246→#249→#250 remain unmerged. Fully paginated inventory this run **262 branches / 247 PRs (65 open/124 merged/58 closed)**. Main `01f6f4feca051d68de24a04299cd3bb444bce40c`, `ReleaseEnabled=0` unchanged; no financial execution locally, deployment, funds or release.

---

## 2026-11-23 UTC — PR250 native negative controls executed; unrelated browser timeout keeps full CI held

On exact child source `d75d2a00d4cfdd83fd681c361eefce69bc91c617`, real GitHub [local-trade job 137844763914](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/45218137585/job/137844763914) completed the new `npm run test:eip1271:local` step **SUCCESS** at 16:36:27 UTC: five named native Anvil cases, `adapterReads=96`, `adapterSendsOrSigns=0`, `externalNetwork=false`, `releaseAcceptance=false`. The transport-failure negative-control assertion is part of the actually executed harness. This is more than parse-only evidence, but **not** a full-suite pass.

The very same original job subsequently **FAILED** at 16:38:41 UTC during the separate localnet Chromium buyer/seller workflow: `Error: Timed out: external wallet connection` at `scripts/test-localnet-browser.mjs:28` while connection is driven from line 90, unrelated to the one-file PR250 change. Do not relabel that failed job as successful. A **single targeted job rerun** was requested without changing the source or assertions (replacement job `137847864848` queued at read). Other 10/11 reported current-head check contexts completed SUCCESS, plus Snyk SUCCESS; no CodeQL result reported among those 11. The original browser timeout and any later rerun outcome remain separate.

PR250 remains DRAFT and unmerged; independent Tier C, recorded owner authorization, exact-target CodeQL/native financial/browser acceptance and parent ordering PR246→PR249→PR250 remain mandatory. Main `01f6f4feca051d68de24a04299cd3bb444bce40c` and `ReleaseEnabled=0` remain unchanged. No deployment, release or real funds.

---

## 2026-11-23 UTC — source fix published: EIP-1271 native transport false-positive negative control, PR250
[Source-bound engineering and gate report](docs/engineering/PR250_EIP1271_TRANSPORT_NEGATIVE_CONTROL_20261123.md). Actual one-file **draft child PR250** `d75d2a00d4cfdd83fd681c361eefce69bc91c617` of PR249 `bd860c66` adds a synthetic RPC transport-error negative control, native JSON-RPC execution-error validation, deployed-mode readback and exact EIP-1271 call target/selector/gas/canonical anchor proof. One-file GitHub blob `d0921a48` read back identical; V8 syntax **parse only**, no executed Anvil/Forge/Chromium and no CI pass claimed on PR250. PR249 and PR246 still DRAFT/unmerged. Source is explicitly test-only; no production wallet/custody changes or release activation. Fully paginated remote branch census **262**; PR record count **247/65 open by previous full 246 + new PR250**, not a full PR re-pagination. Classifications **A137/P64/F34/C5/E0/V21/B1/D0**. Exact main remains `01f6f4feca051d68de24a04299cd3bb444bce40c`, no source merge, release, funds or deployment; `ReleaseEnabled=0`. Mandatory parent order, current-source CI, Tier C, owner approvals and native financial acceptance remain unsatisfied.

---

## 2026-11-23 UTC — PR249 executed native negative-mode tests, bounded oracle finding; no merge

[Source-bound PR249 proof](PR249_NATIVE_EIP1271_NEGATIVE_ORACLE_20261123.md) records an actual **11/11** current-child hosted check pass, including 5 native Anvil EIP-1271 checks, 90 read-only verifier calls and zero verifier sends. Exact source `bd860c66c3f50deda72392523ac8fc8860703f84` has **one new test-only commit on PR246 head**, not an independent main-target approval. A bounded COMMENT review #6024392085 identified that `UNAVAILABLE` + a recorded `eth_call` is not sufficient to distinguish native revert/gas from generic transport failure for modes 2/3. Requested a transport-failure negative control / exact native-target oracle. No production exploit is claimed. PR249 remains DRAFT, no Tier C or owner authorization; old PR246 acceptance stays source-bound. New fresh inventory: **261 branches / 246 PRs (64 open/124 merged/58 closed)**; **A137/P63/F34/C5/E0/V21/B1/D0**. Main `01f6f4feca051d68de24a04299cd3bb444bce40c`, `ReleaseEnabled=0`; no merges, new local tests, funds, deployment or release.

---

## 2026-11-23 UTC — historical PR116 task ownership and PR64 M2A/wiki docs resolved, no code transplant

[Thirteen-path, source-bound proof](BRANCH_COHORT_HISTORIC_DOC_TASKS_FINAL_20261123.md): PR116 (closed/unmerged) adds only `tasks/plan.md` and `tasks/todo.md`. All 13 original added todo lines are exact in main; 11 old plan owner-matrix lines were intentionally superseded as live ownership while T41–T47 remain documented as unverified tasks. PR64 (closed/unmerged) changes only 11 dated documentation paths: nine have newer main counterparts, two dated 2026-11-10 instruction/status files are absent and explicitly superseded by current roadmap/wiki/status; no executable source/tests. Both original branch tips and old authors' instructions are preserved; **two V→F, A137/P62/F34/C5/E0/V21/B1/D0=260**. This is documentary disposition, not patch-ID equality, feature completion, owner review or runtime acceptance. Main `01f6f4feca051d68de24a04299cd3bb444bce40c`; no product merge/release/deployment/funds and `ReleaseEnabled=0`.

---

## 2026-11-23 — ten remaining E-class D9/test/doc patches have exact content in main

[Full verification report](BRANCH_COHORT_D9_RESTORE_STACK_EXACT_20261123.md) proves the unique PR-specific D9 restored nonce tests from #71–75/#91–93 remain byte-exact in current main (PR73 contains precisely the later four PR74 lines), PR79's sole test file matches the complete Git blob, and PR129's Python baseline documentation correction is already present. **Ten E→F**: A137/P62/F32/C5/E0/V23/B1/D0=260. All historical PRs remain unmerged by ancestry; no whole-history patch-ID, native runtime acceptance, new tests or qualified integration is claimed. Keep existing financial PR gates, reviews, owner decisions, optional features disabled, `ReleaseEnabled=0`.

---

## 2026-11-23 UTC — PR69/PR70 D9 marker and encrypted recovery unique additions verified in main

[Exact changed-scope and immutable Git proof](BRANCH_COHORT_D9_MARKER_RESTORE_EXACT_20261123.md): Both closed **unmerged** PR69 and PR70 remain Git-divergent (ahead 2/3, behind 580; common merge base `c87c21b9`), but **all unique contiguous patch additions** are already verbatim in `main@01f6f4feca051d68de24a04299cd3bb444bce40c`: PR69's fail-closed `BROADCAST_UNKNOWN` on a possibly durable marker plus 15-line test, and PR70's fresh-key encrypted restore import plus 21-line test. No obsolete source re-merge. **Two branch records E→F**; totals **A137/P62/F22/C5/E10/V23/B1/D0=260**. This is branch-local source/content proof, **not Git patch-id equivalence, native test execution or overall D9 feature acceptance**. Historical branches and failed results remain preserved. Main/ReleaseEnabled unchanged; no merge/deployment/funds.

---

## 2026-11-23 UTC — PR65 10-path source reconciliation and historical M2B/M2A disposition

[Exact-main/old-head comparison](BRANCH_COHORT_PR65_FINAL_DOCUMENT_DISPOSITION_20261123.md) resolves the remaining **two historical documents** and both task/plan records of closed, unmerged PR65 without importing obsolete 2026-11-10 execution prompts. Three historical test blobs are exactly present in main, the saved-review and artifact-policy source checks remain or are stronger, and main `tasks/todo.md` records T33–T35 completed via ancestor PR115. The original M2B gap record and M2A prompt remain byte-preserved on PR65, not promoted to present-day scope or authority. **T36–T40 and outstanding modern Solana items are expressly still open/unverified**; branch-local archival reconciliation is not their completion. Compared exact PR65 head `bd26833555e13408825942e9696157ed68e9980e` to main `01f6f4feca051d68de24a04299cd3bb444bce40c`: merge base `300287dcde818a9d10ae301265d00bc7c0877bbb`, ahead 6 / behind 615; no ancestry merge. One branch V→F (content and historical-process disposition); totals **A137/P62/F20/C5/E12/V23/B1/D0=260**. No tests, release or main merge. `ReleaseEnabled=0` remains unchanged.

---

## 2026-11-23 UTC — PR248 current-head hosted AbortSignal regressions executed; merge still held

[Source-bound report](PR248_HOSTED_ABORT_EXECUTION_20261123.md) for [draft PR248](https://github.com/djshellshoxxx/p2p-offramp/pull/248), exact head `4fc269e4fe17b8aaa9f315c29f726071f3834f5e` stacked on PR247 head `3f23c774b2464b04de6cfece9ab1721dd5130f86`. GitHub source checks: **11/11** child-head jobs completed SUCCESS, separate **Snyk SUCCESS**, and Node `schemas-and-crypto` job [137604754024](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/45148833309/job/137604754024) executed **all seven** historical hostile AbortSignal regression cases successfully; 2,516 pass, **one Foundry/Cast-dependent skip**, zero fail. Provisioned Foundry job 137604754500 separately passed 92/92. A distinct Node 22.16.0 isolated probe of the verbatim signal-isolation helper passed 9/9 (not a full checkout). Source review of three changed paths yielded no independently reproduced High/Medium in its bounded scope; exact-head COMMENT review #6020031700 is not Tier C approval. A CodeQL child check was not reported among those 11 contexts. Preserve historical failure/skip and parent/child distinction; **independent Tier C, owner authorization, applicable scanning/current-target gates and PR247-first integration remain outstanding**. Main stays `01f6f4feca051d68de24a04299cd3bb444bce40c`; no merge, deployment, release, funds or optional default activation; `ReleaseEnabled=0`. Existing 260-branch/245-PR inventory is not recast as feature completion.

---

## 2026-11-23 UTC — executed source recovery: hostile AbortSignal boundary, draft PR248 stacked on qualified PR247

**Actual engineering:** On unchanged main `01f6f4feca051d68de24a04299cd3bb444bce40c`, confirmed parent [PR247](https://github.com/djshellshoxxx/p2p-offramp/pull/247) head `3f23c774b2464b04de6cfece9ab1721dd5130f86` has **14/14 exact-head hosted checks SUCCESS** (CodeQL, Node/TS, EVM, Chromium, Firefox/WebKit and remaining required check contexts). **This does not constitute independent Tier C/owner approval.** Published isolated [DRAFT PR248](https://github.com/djshellshoxxx/p2p-offramp/pull/248), test-first `caab74ad1ff737625e365f099b1c4e672b5231dc`, subsequent fix `4fc269e4fe17b8aaa9f315c29f726071f3834f5e`, full tree `19bd218ca957f119c0299b4fc9fb1045b9327b20`, targeting **PR247 only**, not main. Restored seven historical malformed/hostile AbortSignal test declarations from owner PR40 and narrowly isolated native signal getters/event methods and private linked cancellation in the explicitly **test-only** EVM adapter. Marked uncertain post-marker attempts `BROADCAST_UNKNOWN`, single-send slot, no retry, original PR40/247 owner refs all preserved. [Provenance and verification limits](https://github.com/djshellshoxxx/p2p-offramp/blob/4fc269e4fe17b8aaa9f315c29f726071f3834f5e/docs/engineering/EVM_ABORT_SIGNAL_HOOK_RECOVERY_20261123.md).

**Verification:** GitHub immutable compare parent→child ahead=2/behind=0; main→child ahead=4/behind=0, merge base main. PR248 head/ref/parent/tree verified; own checks **7 SUCCESS/4 IN_PROGRESS** at first post-publication read, not final acceptance. No executed local RED/GREEN, Tier C independent approval, PR owner merge authorization, funds, deployment, release, forced ref changes or main integration. Keep PR248 DRAFT until all relevant exact-source/target and review gates succeed. Do not combine it ahead of PR247 or claim test-only code is production wallet logic.

**Refreshed census:** 260 branches, 245 PRs (63 open/124 merged/58 closed unmerged), classifications **A137/P62/F19/C5/E12/V24/B1/D0**. Main still `01f6f4feca051d68de24a04299cd3bb444bce40c`, `ReleaseEnabled=0`. New next cohort: investigate child native tests and independent findings; reconcile PR237–244 owner-gated stack separately; prioritize other unowned financial safety branches without duplicate implementation.

---

## 2026-11-23 UTC — concrete EVM admission-scope hardening published, draft PR247

**Source-bound engineering:** current `main@01f6f4feca051d68de24a04299cd3bb444bce40c`; owner PR40's five historical EVM scope-retirement tests restored in test-first commit `c16dc9470ff1dc4a76b2a4d7b088428dd475a64b`, then narrowly repaired in [draft PR247](https://github.com/djshellshoxxx/p2p-offramp/pull/247), head `3f23c774b2464b04de6cfece9ab1721dd5130f86`, complete tree `33843108065cf2a924bde6d3ec68b8d945d3d753`. The correction rechecks disposal after `isCurrent()`, refuses foreign account index accessors and revalidates after obtaining `provider.request` before physical EVM send. Current durable marker => `BROADCAST_UNKNOWN`, no automatic resend, chain/nonce/hash and explicit physical slot constraints remain intact; old PR40 branch unchanged. [Exact-source report](https://github.com/djshellshoxxx/p2p-offramp/blob/3f23c774b2464b04de6cfece9ab1721dd5130f86/docs/engineering/EVM_EXECUTION_ADMISSION_HARDENING_20261123.md).

**Gate status at published-source readback:** GitHub 13 current-head checks, 1 success and 12 in progress. No local Node/Foundry/Chromium, no executed RED or GREEN claim, no independent Tier C, owner authorization or merge. The historical hostile AbortSignal cases are not treated as fixed. Preserve all earlier failures, PR237–244 review/financial gates and PR246's prior-source acceptance separately.

**Complete fresh census:** 259 remote branches and 244 PRs (62 open, 124 merged, 58 closed-unmerged). Classifications A137/P61/F19/C5/E12/V24/B1/D0=259. Main unchanged, `ReleaseEnabled=0`. No main merge, funds, deployment or release.

---

## 2026-11-23 UTC — PR100 native-locale warning source reconciliation; PR65 bounded follow-up

[PR100/PR65 source/blob evidence](BRANCH_COHORT_PR100_PR65_SAFETY_SOURCE_PROOF_20261123.md). Refreshed **258 branches / 243 PRs** (61 open) via authenticated GitHub pagination; main remains `01f6f4feca051d68de24a04299cd3bb444bce40c`. PR100's **only unique 14-line regression test** is now present and extended on main and the production catalog enforces visible warning text; historical branch reclassified V→F **by content**, not ancestry. PR65's T33–T35 implementation/test fixes are in modern source, but its two historical documents are absent, so PR65 remains **V**, not falsely complete. New totals **A137/P60/F19/C5/E12/V24/B1/D0 = 258**. No local tests were executed, no source branch or PR was merged, and PR246 owner/Tier C gates remain outstanding. `ReleaseEnabled=0` unchanged. Previous snapshots preserved below.

---

## 2026-11-23 UTC — PR246 all 15 GitHub checks passed; still DRAFT and unmerged

[Exact-source hosted completion record](PR246_ALL_HOSTED_CHECKS_PASS_20261123.md) supersedes only the older 14/15-in-progress observation, not its failure history. On unchanged PR246 head `233a66a7c2a465ac7b5504564c0e3b826afedcf5` (complete tree `38fb1a712824435f2bcf9fd5225d27706472a979`, base main `01f6f4feca051d68de24a04299cd3bb444bce40c`), **15/15** GitHub check-runs now report SUCCESS, plus Snyk SUCCESS. The previously outstanding Solana [program job 137488374969](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/45112658714/job/137488374969) finished SUCCESS at **05:46:56Z**, including actual validator/Chromium/Worker encrypted-IDB real-time refund/recovery and `fixtureErrors=[]`. Separate same-tree native Anvil EIP-1271 **5/5** proof remains valid. **Zero GitHub review submissions; independent Tier C review and matching owner authorization remain absent.** No PR merge, source change, real funds, release or deployment; `ReleaseEnabled=0`. Historical lower snapshots are intentionally preserved.

---

## 2026-11-23 UTC — PR246 native EIP-1271 executed successfully; financial merge gates retained

[Actual hosted logs, exact merge-tree proof and separate open gates](PR246_NATIVE_EIP1271_EXECUTED_20261123.md). PR246 head `233a66a7c2a465ac7b5504564c0e3b826afedcf5` and GitHub PR merge checkout `e26d135f8e8b3f8f3a1fc8cae57998721c21e747` both have **complete tree `38fb1a712824435f2bcf9fd5225d27706472a979`**, with ordered checkout parents `[01f6f4feca051d68de24a04299cd3bb444bce40c, 233a66a7c2a465ac7b5504564c0e3b826afedcf5]`. Hosted `local-trade` job **137488330411** ran the actual loopback Anvil `npm run test:eip1271:local` on that checkout and passed **all five named native behavioral checks** (revocation, terms mutation, malformed/revert/gas/length, reorg, lock and EOA fallback refusal included); machine receipt `adapterReads=90`, `adapterSendsOrSigns=0`. Same exact-tree EVM forge job passed. On the checked head, **14/15 CI checks completed SUCCESS** and the separate Solana `program` job was **IN_PROGRESS**, not green. The GitHub review list remained empty: **no independent Tier C or owner approval**, and no merge is permitted yet. Refreshed full list **258 branches / 243 PRs** (61 open). Main remains `01f6f4feca051d68de24a04299cd3bb444bce40c`; no PR merge, live transaction, deployment, release or option activation, `ReleaseEnabled=0`. Previous pending snapshot is preserved below as historical, now superseded only for executed native test status.

---

## 2026-11-23 UTC — PR246 documentation-link correction, code blobs unchanged

The live draft [PR246](https://github.com/djshellshoxxx/p2p-offramp/pull/246) advanced from source commit `afc8eff73df48dace2c4650a7a9c4f4a81be7fdb` to **`233a66a7c2a465ac7b5504564c0e3b826afedcf5`** solely to replace a report-relative Markdown link (absent on current main) with the verified immutable PR245 source-gap URL. Git readback: complete tree `38fb1a712824435f2bcf9fd5225d27706472a979`, parent `afc8eff73df48dace2c4650a7a9c4f4a81be7fdb`, current main merge base `01f6f4feca051d68de24a04299cd3bb444bce40c`, ahead=2/behind=0, and the same **five changed paths**. Original source blobs and workflow/npm test code were not altered. Fresh CI on this actual head is needed; earlier checks cannot transfer. New census unchanged at **258 branches / 243 PRs**. No main merge, no native acceptance claimed, `ReleaseEnabled=0`.

---

## 2026-11-23 UTC — Actual engineering: native EIP-1271 test recovery (draft PR246)

Current `main@01f6f4feca051d68de24a04299cd3bb444bce40c` remains unchanged. Recovered two exact Git blobs from frozen original [PR40](https://github.com/djshellshoxxx/p2p-offramp/pull/40) into a separate **current-main-only test** [PR246](https://github.com/djshellshoxxx/p2p-offramp/pull/246): fixture `83ba7e42eeead97a6a99455b4a82b714dbcc8701` and harness `3f0ddfce4bb986b3423ecfffa40685614a16d28c`. Added just one npm script and one existing EVM workflow step; **no product logic or release settings changed**. Current branch commit `afc8eff73df48dace2c4650a7a9c4f4a81be7fdb`, tree `939e6b7c0fdc0be869bed3c602da7224498eda91`, sole parent `01f6f4feca051d68de24a04299cd3bb444bce40c`, GitHub compare ahead **1**, behind **0**, exactly **5 changed paths**. The owner PR40/legacy stage/frozen stacks were not modified.

[Detailed source and expected native negative-mode acceptance](EIP1271_NATIVE_ACCEPTANCE_RECOVERY_20261123.md). Hosted 14 checks were **queued** at first current-head read: no success, local Anvil execution, Tier C independent review or owner approval is claimed. Preserve both historical and future failures; do not merge this draft until source/target CI, real Anvil/Foundry, independent review, relevant D8/owner authorization and final guarded tree/readback are verified. This is concrete recovery code in an isolated PR, not a main product merge. Refreshed full GitHub inventory: **258 branches / 243 PRs** (61 open, 124 merged, 58 closed unmerged); classification **A137/P60/U0/C5/E12/V25/F18/B1/D0 = 258**. Continue 59 other existing open PR heads and 25 partial branch decisions; preserve `ReleaseEnabled=0`.

---

## 2026-11-23 UTC — S04 wallet / release update: immutable native-coverage recovery finding

[Stage S04 full 18-path owner/main blob matrix and native EIP-1271 acceptance gap](BRANCH_COHORT_S04_WALLET_RELEASE_20261123.md). Stage `4ebe660f0514` is 17/18 exact against still-open PR40 source `7706859d2385`; its one corrected HTTP reader is superseded by the owner's gzip/CORS identity-length guard. Main has 3 exact/13 later-updated/2 absent stage paths. Crucially, the original Anvil EIP-1271 fixture and native contract-wallet harness are absent from main while simulated RPC contract-acceptance unit tests remain. Port the unique read-only native test through PR40 ownership and fresh Tier C/native qualification; do **not** merge old product source or infer a financial defect. PR245 current head `cf0c8ccf30c9` had 14/14 completed-success GitHub checks at read, **but only for that documentation head**. No new local tests, no main merge. Inventory remains **A137/P59/U0/C5/E12/V25/F18/B1/D0=257**; `ReleaseEnabled=0`.

---

## 2026-11-22/23 — Executed PR244 native payout-readiness proof and source-bound COMMENT review

[Exact-SHA test diff, original failure, hosted native/browser proof and gate separation](PR244_HOSTED_PAYOUT_READINESS_20261122.md). PR #242 original head `00efff307b10c5ed9a8bd604a21eb2bf5816e7ef` failed at disabled separate payout in job `136601434309`; frozen parent remains unchanged. PR #244 one-file test-only head `2acdaa3714b2c263291251b18742068077cc54ea` passed **12/12 current checks** with actual native validator/Chromium encrypted-Worker test job `137159396404`, final unwarped-Clock refund, no fixture errors, and guard-preserving release journal/send assertions. Coordinator submitted source-bound COMMENT review `6015955813` (not independent Tier B/C approval). Coordinator PR #245 prior exact head `917921d73f9f8bca747e620b1f4248fe6e09a8e7` passed **14/14** hosted checks. No main merge, production fix, real-funds action or release. Review, owner and changing-target gates still block PR #237–244; inventory counters unchanged **A137/P59/U0/C5/E12/V25/F18/B1/D0=257**. `ReleaseEnabled=0`.

---

## 2026-11-22 — Last six divergent historical stage variants source-mapped

[Full immutable stage/owner/main proof](BRANCH_COHORT_FINAL_DIVERGENT_STAGE_20261122.md). S02 (42 stage-local paths: 42 owner-exact, 32 main-exact), S03 (11: 11, 6), S05 merged (40: 40, 34), S05 split (40: 38, 32), S11 (33: 30, 9), and S12 (190: 190, 0; 185 archival docs absent main). Owner branches/PRs #38/#39/#41/#47/#48 retain all original stage-local code/evidence. Current main has stronger retention, transport-zeroization, relay handler/async ownership and governance historical-pointer protections; do not replace these with old branches. **D6→0 / V19→25; A137/P59/U0/C5/E12/V25/F18/B1/D0 = 257.** This is bounded source comparison, NOT complete branch consolidation: 59 open PR heads and 25 partial records plus current-target CI, independent Tier B/C reviews, financial acceptance, patch-ID checks remain. No executable local testing, funds, deployment, source merge or release; `ReleaseEnabled=0`.

---

## 2026-11-22 — Historical process/security and optional-evidence reconciliation (10 branches)

[Immutable source and workflow security report](docs/engineering/BRANCH_COHORT_HISTORIC_PROCESS_SECURITY_20261122.md). On main `01f6f4feca051d68de24a04299cd3bb444bce40c`, screened 16 formerly D branches via GitHub compare, then source-audited 10. The legacy `codex/setup-autonomous-agent-20261104` workflow exposes persistent write credentials to the agent job and an unpinned CLI, while current main uses read-only agent, clean verification, pinned tooling and separate publication; **do not merge old workflow**. Research-plan historical blob is identical on main, historical qualification-handoff lines 595/595 covered in main; two dated operator prompts deliberately excluded, and five branches retain explicit partial status (including optional historic sources kept in PR224–232). Count **A137/P59/U0/C5/E12/V19/F18/B1/D6=257**; no product source changed, no runtime/native CI performed, no PR merged, no owner/review gate waived. Preserve history below; `ReleaseEnabled=0`.

---

## 2026-11-22 — Source-verified S01–S03, relay dedup/ownership and two documentary tips

[Fixed-SHA provenance and corrected-source report](docs/engineering/BRANCH_COHORT_CORE_RELAY_PROVENANCE_20261122.md). Compared 68 **stage-local** changed paths across historical S01/S02/S03 with owners #37/#38/#39 and exact main: 58 identical and 10 corrected owner blobs; 42 identical and 26 later-changed main blobs; **0 missing in either**. Main retains the owner-corrected relay (subscription,event)-keyed dedup, plus stricter after-verification subscription-generation scope checks, which older S03 must never replace. Five historical entries move out of semantically unreviewed ancestry-only state (three stage-source partially reconciled, collaboration doc exact main blob, Python baseline patch present but not whole-file equivalent). New counters **A137/P59/U0/C4/E12/V14/F14/B1/D16 = 257**. PR #37 open; PR #38/#39 and #129/#131 closed **unmerged**; owner/review/native/patch-id acceptance still pending. Prior coordinator head `88b7be1f9e3aeff1728db153315c5cf57526cfd0` has 14/14 successful hosted checks; those do not qualify this new SHA. No product/source merge, executed financial tests, deployment, release or default activation. `ReleaseEnabled=0`; preserve all historical records below.

---

## 2026-11-22 — Complete U-cohort ancestry screening, not release completion

[Immutable-source cohort report](BRANCH_COHORT_REMAINING_ANCESTRY_20261122.md). On exact `main@01f6f4feca051d68de24a04299cd3bb444bce40c`, all 70 previously U-labeled branches now have fresh GitHub compare analysis: **46 already-main ancestors; 21 Git-divergent and still semantically unreviewed; one identical complete source tree to unmerged PR237; one exact test blob already in main; one PR245 self-indexed documentation head**. New snapshot totals **A137/P59/U0/C3/E11/V11/F14/B1/D21 = 257**. U0 is *not* completion: 21 divergent unreviewed, 59 open-PR branch heads and the prior partial/held branches remain. PR245 had one real Firefox backup browser failure at creation/unlocked-status wait; a targeted identical-source Firefox rerun succeeded, both results preserved. No runnable Git/Node/native tests locally, no qualified merges, no source/release changes. `ReleaseEnabled=0`. Preserve all dated prior findings and D8 authorization.

---

## New 2026-11-22 immutable Git and optional-code reconciliation (25 ancestor + 4 divergent)

[Source-bound report](BRANCH_COHORT_ANCESTRY_OPTIONAL_PRESERVATION_20261122.md). Current verified main `01f6f4feca051d68de24a04299cd3bb444bce40c` and coordinator `d841728c34c12b7225e351d87ab66c09b7eddcc0`. GitHub compare proved **25** additional historical tips exact ancestors (`ahead=0`, tip equals merge base); four diverged tips had bounded exact-tree/blob comparisons and remain held. Most importantly, **all 153** G11 optional package files missing from main are already retained across open PRs #224–232 (**152 identical Git blobs, one corrected sparse-topic regression-test blob in #232**). No duplicate bulk optional merge or reimplementation is warranted. Source/review gates remain; no local Git checkout, runtime tests, native browser, funding, deployment or main merge. Counters now **A91/P58/U70/C3/E10/V10/F14/B1 = 257**. Preserve old handoffs, D8 review conditions, release disabled. Next cohort: 70 still unassessed plus owner-gated financial PR stack.

---

## New immutable-source reconciliation — 2026-11-22 (22 ancestry tips, 2 equivalent test paths)

[Exact SHA/compare/blob report](BRANCH_COHORT_ANCESTRY_TEST_EQUIVALENCE_20261122.md). GitHub's paginated current remote inventory remains **257 branches and 242 PRs** (60 open, 124 merged, 58 closed unmerged) with `main@01f6f4feca051d68de24a04299cd3bb444bce40c`. This execution compared **22** previously unassessed immutable branch tips and proved they are exact ancestors of main (`ahead_by=0`, tip equals merge base); no duplicate merges required. Two separately divergent one-file HTTP/registry regression commits have exactly byte-identical full test blobs already in main, but are **not** Git-ancestry or patch-ID equivalent. Ledger counts now **A66 / P58 / U99 / C3 / E10 / V6 / F14 / B1 = 257**. All historical original refs, owners, failed CI, financial assertions, D8 reviews and predecessor reports remain unchanged. This is source/provenance reconciliation, not runtime qualification. Host DNS prevented repository checkout and no local tests, native browsers, financial runs or merges occurred. `ReleaseEnabled=0`; keep continuation active to inspect the **99 remaining unassessed** and satisfy existing open PR gates.

---

## New source reconciliation — 2026-11-22: S11/S12 plus custody decision (verified)

[Full source-bound report](BRANCH_COHORT_S11_S12_CUSTODY_20261122.md). Fresh complete GitHub enumeration remains **257 branches / 242 PRs** (60 open, 124 merged, 58 closed unmerged) on `main@01f6f4feca051d68de24a04299cd3bb444bce40c`. Exact recursive tree comparisons inspected **36 S11** stage paths (10 byte-identical main, 26 later-changed) and **190 S12** paths (185 archival docs absent main, five later-changed). Both are retained in open owner PRs **#47/#48** and each has only a historical Qodo `COMMENTED` submission, not approval. Older governance records lack current main's `historical`/`supersededBy` state and accepted-decision banner; old receipts must not overwrite current authority. A new `work/noncustodial-reconstruction-2026-10-24` ancestor is proven already in main, while the 12-file `feat/custodial-ledger-foundation` branch is a **separate unapproved custodial PostgreSQL product**, not safe to merge into this noncustodial default. Exact counters **A44 / P58 / U123 / C3 / E10 / V6 / F12 / B1**; original branches preserved. No executed tests or main merge; `ReleaseEnabled=0` unchanged.

---

# P2P-Offramp — branch consolidation master (live intake, 2026-11-22)

## New verified cohort: original S08–S10 stage source retained (2026-11-22)

[Source-bound SHA/PR blob report](BRANCH_COHORT_S08_S10_20261122.md). The three original divergent S08/S09/S10 stage refs are now **path-level reconciled** to still-open owner PR44/45/46, with exact stage-local recursive blob proof: S08 **41 paths** (PR44: 37 exact/4 corrected; main: 11 exact/30 different), S09 **27** (PR45: 27 exact; 26 absent main), S10 **136** (PR46: 120 exact/16 corrected; 134 absent main). This is *not* integration or whole-history patch equivalence. S09 mobile-wallet's historical 4/5 evaluation remains failed for the stronger URI expectation; optional S10 packages remain off by D7 and PR46 lacks a review. No runtime/native execution or product change. Fully paginated branch refs still total **257 before this report publication**, main `01f6f4feca051d68de24a04299cd3bb444bce40c`. Updated inventory statuses: **43 A, 58 P, 125 U, 3 C, 10 E, 6 V, 12 F**, 257 total. Preserve PR44/45/46 owners and original historical heads. Next: S11/S12 with PR47/48, then specific owner-corrected source and current-main adapted tests. `ReleaseEnabled=0`.

> **Execution status: PARTIAL.** This is a reproducible coordination baseline, not a claim that all branches are qualified, features finished, or any open PR merged. The complete branch-head/open-PR metadata capture is [BRANCH_INVENTORY.json](BRANCH_INVENTORY.json).

## Authoritative baseline

- Repository: `djshellshoxxx/p2p-offramp`.
- Starting/current observed `main`: `01f6f4feca051d68de24a04299cd3bb444bce40c`, tree `437323a382952b9623a875c818f8af005a5d4563`. This already includes PR #236; PR #233–235 are represented in its merge ancestry per the corresponding source handoff.
- Metadata capture: 256 branch refs, including the newly created diagnostic branch for #244, and 59 open PRs. The separate branch holding this inventory was created *after* the capture and is not included in that count.
- Treat source/merge ancestry, executable tests and current GitHub checks as primary evidence. Historical handoff/test totals apply only to their recorded SHAs.
- `agents.md` forbids direct pushes to main, forced overwrites and unqualified merges. D8's applicable Tier B/Tier C gates, privacy/financial safety, worker ownership and explicit recorded approvals remain binding.
- `ReleaseEnabled=0`, client-side/noncustodial architecture and no-production-deployment restrictions must remain unchanged.

## Active dependency graph

```text
main 01f6f4fe (#236 integrated)
 └─ #237 retention read-only preview, Tier B, CodeRabbit/Qodo and fresh target gates pending
      └─ #238 generic sharing UI integration
           └─ #239 offline startup/recovery guidance
                ├─ #243 Chromium sharing/startup acceptance (draft; hosted 12/12)
                ├─ #240 Solana preparation (draft; content retained by #241)
                └─ #241 prepared funding + core policy (Tier C, owner approval pending)
                     └─ #242 saved-proposal seller funding/recovery (draft; hosted program failure)
                          └─ #244 guarded payout readiness diagnostic test (draft; qualification pending)

Separate isolated optional intake, currently targeting main:
#224 proof-inputs, #225 liquidity, #226 arbitration, #227 privacy-policy,
#228 proof-jobs, #229 privacy-controls, #230 courier, #231 meetup, #232 stealth.
These supersede older-source intake PRs #191–199 for current-main integration,
but do not automatically authorize activation or production financial authority.
```

## Ranked immediate work

1. **Critical qualification:** Reproduce and determine exact guard causing #242's disabled separate-payout button in the actual encrypted-Worker/browser test. #244 adds guard-preserving wait and redacted diagnostic evidence; do not treat its proposed code as a proven fix until current-head native CI runs.
2. **Parent-chain merge eligibility:** Resolve #237's specified CodeRabbit-or-Qodo gate and target-specific merge-tree qualification, then requalify #238, #239, #243, #241 and #242 on their actual changing target heads. Do not bulk-merge the stack.
3. **Financial authority:** Obtain #241/#242 matching owner approval where D8 Tier C requires it, independent review and Solana native/validator/browser acceptance. Never infer successful funding from wallet request or broadcast.
4. **Optional intake:** Verify unique source, dependency checks and current-main conflicts one isolated optional package at a time; keep feature gates disabled and original source branches intact.
5. **Full 256-ref archaeology:** Compare commit ancestry and patches for each metadata-only branch. Classify as complete, integration/test-needed, incomplete, nonfunctional, superseded-unique, already-integrated, deferred or docs-only **after** examining the code and policy. This work remains open.

## Merge protocol

Before each proposed merge: fetch current source and main SHAs; inspect file ownership; check submitted reviews and unresolved threads; inspect full current-head actions, coverage and external statuses; read back the exact proposed merge tree/parents; run required combined tests; use an expected-head guard; then verify resulting main SHA, tree, and ancestry. No merge is authorized solely by this intake document.

## Evidence pointers

- [Feature tracker](FEATURE_COMPLETION_TRACKER.md)
- [Test/CI evidence and failures](CONSOLIDATION_TEST_RESULTS.md)
- [Current continuation handoff](CONSOLIDATION_HANDOFF.md)
- [PR #242 failed native browser job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44826827834/job/136601434309)
- [PR #244 isolated diagnostic follow-up](https://github.com/djshellshoxxx/p2p-offramp/pull/244)

## Optional-module current-main comparison (live verification)

At `main@01f6f4feca05`, authenticated GitHub comparisons for each optional PR #224–232 report **two ahead / 73 behind** with common merge base `388526a474ae`. Their original CI alone is not current-main integration qualification.

| PR | Source delta from merge base | Exact-head check-runs |
| --- | --- | --- |
| #224 proof-inputs | 10 added files; 2 modified workflow/package files | 15/15 success |
| #225 liquidity | 14 added | 14/14 success |
| #226 arbitration | 20 added | 13 success; 1 cancelled Firefox backup check |
| #227 privacy-policy | 11 added | 14/14 success |
| #228 proof-jobs | 21 added; package.json modified | 16/16 success |
| #229 privacy-controls | 14 added; workflow/package files modified | 15/15 success |
| #230 courier | 24 added | 14/14 success |
| #231 meetup | 37 added; workflow/package files modified | 15/15 success |
| #232 stealth | 21 added | 14/14 success |

All nine PR descriptions explicitly require a **D8 Tier B CodeRabbit-or-Qodo pass with findings answered**, in addition to independent human/source review and current-target CI. No submitted GitHub review and no unresolved inline threads were found for these nine PRs at inspection. The mostly additive per-package source is promising for isolated intake, but **three packages edit package/workflow wiring, conflicts may appear in a combined tree, and no final target-specific integration gate is satisfied**. No optional main merge was attempted.

## Historical source equivalence samples

Live comparison with `main@01f6f4fe` proves the following ten named historical branches have **zero ahead commits**, i.e., their entire respective histories are already ancestors of `main`: `feature/public-qr-capture-20261119`, `feature/same-terms-resumption-20261119`, `feature/erc20-browser-continuation-20261118`, `codex/max-consolidation-20261119`, `integration/solana-core-qualification-20261118`, `codex/solana-browser-send-repair-20261119`, `consolidation/solana-browser-recovery-20261119`, `codex/continuation-g21-20261120`, `codex/signed-update-ui-g13-20261120`, and `codex/relay-freshness-capacity-20261120-auto2`.

`integration/browser-mvp-20261118` is a special case: its commit `823f5d3b8a26e5be8d8a5a65fc5b74766cc04c10` remains one ahead / 206 behind, but its **three exact source changes** (separate React private/backup keys, RPC's exact `method`/`params` shape and a fixture assertion of permitted EIP-1193 keys) are already present in current main. This unique commit does **not** represent missing feature code requiring re-merge.

`validation/pr237-current-main-20261121` is ten commits ahead and zero behind `main`; it is a current-main-descended validation branch and its code has **not** been classified as uniquely missing or safe to merge from commit counts alone. Check its overlap with active PR #237 before considering any integration. Do not infer that the other unexamined branches are redundant.


## Bounded consolidation cohort — 2026-11-22, refreshed live refs

**Execution result:** source-bound ancestry and content analysis, not a main merge. New live counts: **257** remote heads, **242** total PRs (**60 open, 124 merged, 58 closed unmerged**) from complete current GitHub ref and three-page all-PR enumeration. The earlier 256/59 count above is preserved as a prior dated snapshot, not the current tally. Main is still `01f6f4feca051d68de24a04299cd3bb444bce40c` (tree `437323a382952b9623a875c818f8af005a5d4563`). The canonical [BRANCH_INVENTORY.json](BRANCH_INVENTORY.json) was advanced to schema v2 with all current refs and each associated historical/open PR; unexamined branches remain explicitly unassessed.

**19 newly verified ancestor-contained heads:** GitHub compare against the exact main commit returned **ahead=0**, and the merge-base SHA equals the individual branch tip. These require no new source merge, regardless of whether their corresponding historical PR was marked merged or closed. The canonical inventory retains exact SHA, merge base and behind count for each:

- `chatgpt/zero-codex/d9-cross-deployment-nonce-20261111`
- `chatgpt/zero-codex/g12-native-withdraw-recipient-20261111`
- `chatgpt/zero-codex/g18-final-chain-recheck-20261111`
- `chatgpt/zero-codex/g16-bilateral-replay-20261111`
- `chatgpt/zero-codex/g26-clear-reentrancy-20261111`
- `codex/solana-restore-ack-20261119`
- `integration/all-compatible-work`
- `claude/recovery-consolidation`
- `claude/trade-review-integration`
- `integration/core-hardening-20261118`
- `codex/ctutils-remediation-20261119`
- `codex/backup-cross-browser-g13-20261120`
- `codex/historical-recovery-20261119`
- `integration/pages-offline-recovery-20261112`
- `chatgpt/zero-codex/qr-jcs-array-trap-20261118`
- `chatgpt/zero-codex/recovery-reference-identity-20261115`
- `chatgpt/zero-codex/g20-chat-scope-regression-20261111`
- `autonomous/completion-20261031`
- `claude/p2p-offramp-integration-aan57u`

**Two divergent D9 security/recovery branches need no automatic merge but retain a remaining patch-review task:**

| Branch | Exact GitHub compare against main | Bounded three-version code evidence | Disposition |
| --- | --- | --- | --- |
| `chatgpt/zero-codex/d9-marker-failure-20261110` | 2 ahead / 580 behind; merge base `c87c21b915c9e175113292bb1307754ed2424166` | In `packages/wallet/src/evm-execution.ts`, all 3 newly added, nonblank source lines from base-to-branch occur in current main. In wallet regression test, 11/11 newly added lines occur in main and the test blob is byte-identical to main (SHA `d08491dabbe6c6f46a6617656bc8de5ebe2b3d31`). | Likely content-superseded; confirm removed-line semantics and patch-id before marking complete |
| `chatgpt/zero-codex/d9-restored-account-isolation-20261111` | 13 ahead / 580 behind; same merge base | Same wallet source 3/3 and wallet regression 11/11; in `packages/domain/test/intent-journal.test.mjs`, all 191 newly added, nonblank lines occur in main (current main is larger). | Source overlap strongly indicated, but exact patch equivalence / semantic independence remains unproven |

These are **source overlap observations**, not proof that all 2/13 unique commits are fully included; do not re-merge or discard the branches without full comparison. No runtime, native browser, financial, package or CI tests were run during this analysis.

**Current canonical inventory disposition:** 19 newly verified ancestry heads plus 10 earlier ancestry-contained, 1 earlier source-equivalent, 2 divergent content-overlap candidates, 58 open-unintegrated PR heads, 166 other metadata-only heads, and 1 main = 257. The 58 PR-associated heads still require their own exact-source gates and decisions; the 166 metadata-only branches have not been declared integrated, harmless or complete.

**Fresh PR gate readback:** PR #244 exact head `2acdaa3714b2c263291251b18742068077cc54ea` now has **12/12 completed SUCCESS** GitHub check runs including `program` and `browser`; this corrects the older pending/failed *child* status above. It does **not** rewrite PR #242's historical real-browser failure nor transfer qualification between source trees. PRs #237, #241 and #244 still have **zero submitted GitHub review records** on current readback. Parent/child stacks remain unmerged and require source/target-specific code review, named Tier B or recorded owner Tier C approvals as applicable, plus guarded tree reconciliation. The PR #245 documentation branch is draft, not merged.

**Next productive cohort:** classify `chatgpt/zero-codex/d9-restored-account-isolation-20261111` and `chatgpt/zero-codex/d9-marker-failure-20261110` using exact patch-id/removal semantics and current tests; then examine the distinct `claude/*`, `chatgpt/*` and `nodata/*` metadata-only security/escrow/recovery branches, prioritizing those with no PR association. Handle #237's missing required review and exact-target integration without editing frozen parent sources. Reassess any owner-owned branch before change.

**Operational boundary:** The provided `/workspace/scratch/dcf03ef9bee8` worktree is not mounted in this run; direct Git clone reports DNS resolution failure. Authenticated GitHub reads and guarded docs-only updates are available, but this is not a substitute for local Git patch-id, independent executing workers or native acceptance. No source, CI assertions, other-worker worktrees, main, optional default activation or `ReleaseEnabled=0` were modified.

## Follow-up D9 security/recovery cohort — 2026-11-22 (source-bound)

- `main` remains `01f6f4feca051d68de24a04299cd3bb444bce40c`, and all **257** branch tips are represented in the canonical inventory. Ten more high-value historical branches are **exact ancestors** (merge base equals tip, ahead=0), increasing exact-ancestor-verified tips to **39** (29 current `A` classifications plus 10 older `F-contained-in-main-by-ancestry` classifications); all exact SHAs and behind counts are preserved in [BRANCH_COHORT_D9_20261122.json](BRANCH_COHORT_D9_20261122.json).
- Ten closed-but-unmerged D9 PR patches **#69–75 and #91–93** were examined against the exact current-main wallet and domain test source. All **267/267 nonblank added patch lines** occur in the matching current-main paths. The single removed `markSending` retry-safe return is absent, replaced by `BROADCAST_UNKNOWN` in the corresponding current-main guard. This includes distinct restored nonce terminal/prepared/pending/hash/casefold/network/account/race tests. These ten branch tips are divergent (2–14 commits ahead, 580 behind); this is **static source/test line coverage, NOT Git patch-id equivalence, executable test success or permission to merge/close**.
- Two other branches were screened, not cleared: `chatgpt/zero-codex/audit-evm-schema-20261110` (30 ahead / 615 behind; one audit-ledger path) and `claude/loving-einstein-xgzvdy-s04-wallet-release` (4 ahead / 626 behind; 85 changed paths). They require intended-source and conflict assessment before any integration.
- Updated classification counts across 257 tips: {"A":29,"P":58,"U":146,"V":2,"E":10,"F":12}. `U` remains explicitly unexamined; `P` represents open PR heads requiring their own gates; `E` is unresolved patch-context equivalence. No runtime, financial, native browser or Git patch-id execution occurred; the named worktree is absent and direct git clone DNS failed. No branch/deployment/release changes; `ReleaseEnabled=0`.


## Cohort — wallet stage 04 and randomized EVM audit (2026-11-22)

**Current-main evidence:** `01f6f4feca051d68de24a04299cd3bb444bce40c`. See [exact source and tree report](BRANCH_COHORT_WALLET_AUDIT_20261122.md). These GitHub object/PR comparisons are read-only; no local executable tests or `git patch-id` were run.

1. `claude/loving-einstein-xgzvdy-s04-wallet-release@4ebe660f0514cc8e9ed580bf0cc23bc5a80dfad2` (4 ahead / 626 behind, merge base `a88560741e60146a424cc18fcb2cc1043756ae3e`): among 85 historical changed files, **45** are byte-for-byte blob-identical in main, **38** differ and need semantic review, and **2** are not in main. Those 2 are test-only EIP-1271 Anvil fixture/harness blobs, **both already identical in open PR #40 and #26 heads**. The historical branch is not their ancestor; content reuse is established for the two blobs only. The older acceptance verifier uses block-number `eth_call`, whereas main uses `{blockHash, requireCanonical:true}`; never replace main's canonical-hash guard with this older source. **Decision: partially reconciled, retained, not merged.**
2. `chatgpt/zero-codex/audit-evm-schema-20261110@353b3d18eee66d0b7b9a101c9e2c575bb87cd7ab` (30 ahead / 615 behind): only `docs/audits/CHATGPT_RANDOM_AUDIT_LEDGER.md` changed. The entire 102,302-character historical ledger blob is the **exact prefix** of current main's 218,383-character ledger blob; 31 section headings and all 202 normalized nonblank historical lines are included. Associated PR #67 is **closed, not merged**; its **document content** needs no redundant merge. **Decision: content-included despite nonancestor branch, no security-certification inference.**

The inventory's 257 branch tips are unchanged; two classifications/evidence records have been updated in [BRANCH_INVENTORY.json](BRANCH_INVENTORY.json) and all 146 metadata-only unassessed tips remain unassessed. Continue the distinct open-PR head reviews, 38 wallet-stage blob differences, and priority fund/recovery branches; do not manufacture partial PRs, weaken native/owner/Tier B/C gates, or disturb `ReleaseEnabled=0`.


## New source-bound wallet safety / closed-document cohort — 2026-11-22

Verified 14 previously metadata-only branch tips as *exact commit ancestors* of main and two additional divergent documentary branches as content included (five review blobs byte-identical; Solana payout README 9 added/2 removed patch-line semantics already present). Current totals: `{"A":43,"P":58,"U":130,"C":3,"E":10,"V":1,"F":12}` across all 257 branches. **No historical PR closed state was treated as merge proof**. See [wallet safety and priority branch report](BRANCH_COHORT_WALLET_SECURITY_20261122.md).

A nontrivial **potential** wallet admission race was detected while reviewing the remaining 38 stage-04 blob differences: old (open #26/#40) EVM execution has nine defensive regression scenarios absent by title from main; old code guards reentrant session-current callbacks, account indexed getters, late provider capability acquisition and signal hooks more defensively. Main separately has a newer durable marker => `BROADCAST_UNKNOWN` fix **absent from that older branch**; do not substitute old code. This is **unexecuted source-only suspicion**, not a proven exploit. Next obtain the exact historical tests and execute red-green in a leased isolated current-main checkout, then independently review any scoped fix. `claude/...-s07-native-journey` is still 7 ahead/626 behind with 199 paths not semantically cleared.

Full branch and PR pagination reconfirmed **257 heads and 242 PRs (60 open/124 merged/58 closed)**. PR #245's previous exact head had 14/14 successful check runs plus successful Snyk, but new document head will need its own checks. No native financial suite, Chromium, local patch-id, source merge or release was run.

## Historical S06/S07 source-retention and native-journey cohort (2026-11-22)

See [exact source/test report](BRANCH_COHORT_S06_S07_20261122.md). Two previously unassessed divergent original PR26 stage heads have now been classified **partially reconciled, not merged or fully equivalent**. S06 `14be5a1c` (6 ahead/626 behind) changes 55 stage-local paths; all 55 byte-match open PR42, whereas only 5 match main, 31 differ, 19 are missing. S07 `8f0e5e24` (7 ahead/626 behind) changes 24 stage-local paths; 18 byte-match and six have corrections in open PR43; 21 paths are missing from main. Original source remains in owned PR26/42/43, not accepted in main.

Two independent historical test files are **missing from both main and PR26** but already preserved in M-0: S06's `app-services-abort.test.mjs` (PR42) and S07's `journey-private-trade-recovery.test.mjs` (PR43). The first uses old draft-method names that were renamed in main, so naive test copying would create an invalid red; newer main has separate lock/reload/uncertain-commit tests. The second retains nine prepared/unsent recovery scenarios and explicit comparator correction. PR43 also avoids mutating matches during recovery selection. Neither named CodeRabbit pass nor Tier C current-target authorization is established; both heads remain unmerged.

**Inventory change:** 257 remote branches still; two entries move **U→V** (unassessed 130→128; divergent-partially-reconciled 1→3). No productive source or test changes, CI execution, merges or releases claimed. This does **not** count a feature as completed or qualify PR42/43.
