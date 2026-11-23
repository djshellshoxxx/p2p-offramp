## 2026-11-23 — PR65 branch-local document reconciliation (no execution)

[Evidence](BRANCH_COHORT_PR65_FINAL_DOCUMENT_DISPOSITION_20261123.md) classifies closed PR65 source/docs by content equivalence or deliberate dated-document supersession. This cohort executed **zero** runtime/unit/native/browser/financial tests; previously recorded PR115 and other historical check results are unchanged, not transferred. Main SHA `01f6f4feca051d68de24a04299cd3bb444bce40c`; no new source merge/CI claims.

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

## 2026-11-23 UTC — PR246 all 15 GitHub checks passed; still DRAFT and unmerged

[Exact-source hosted completion record](PR246_ALL_HOSTED_CHECKS_PASS_20261123.md) supersedes only the older 14/15-in-progress observation, not its failure history. On unchanged PR246 head `233a66a7c2a465ac7b5504564c0e3b826afedcf5` (complete tree `38fb1a712824435f2bcf9fd5225d27706472a979`, base main `01f6f4feca051d68de24a04299cd3bb444bce40c`), **15/15** GitHub check-runs now report SUCCESS, plus Snyk SUCCESS. The previously outstanding Solana [program job 137488374969](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/45112658714/job/137488374969) finished SUCCESS at **05:46:56Z**, including actual validator/Chromium/Worker encrypted-IDB real-time refund/recovery and `fixtureErrors=[]`. Separate same-tree native Anvil EIP-1271 **5/5** proof remains valid. **Zero GitHub review submissions; independent Tier C review and matching owner authorization remain absent.** No PR merge, source change, real funds, release or deployment; `ReleaseEnabled=0`. Historical lower snapshots are intentionally preserved.

---

## 2026-11-23 UTC — PR246 source/target exact hosted native EIP-1271 results

GitHub PR246 head `233a66a7c2a465ac7b5504564c0e3b826afedcf5`; checkout `e26d135f8e8b3f8f3a1fc8cae57998721c21e747`; identical full tree `38fb1a712824435f2bcf9fd5225d27706472a979`, parents main `01f6f4feca051d68de24a04299cd3bb444bce40c` then head. [Hosted local-trade job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/45112658538/job/137488330411) finished SUCCESS: real `npm run test:eip1271:local` passed **5/5 named oracles**, 90 verifier read-RPC calls, 0 sends/signs through the verifier, loopback Anvil only. Verified literal log lines at 2026-11-23 04:35:36 UTC; [Foundry forge job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/45112658538/job/137488330221) SUCCESS. All 5 cases and the no-EOA-fallback rule are detailed in [source-bound report](PR246_NATIVE_EIP1271_EXECUTED_20261123.md). **14/15** head checks completed SUCCESS, `program` still **IN_PROGRESS** at read; **zero independent GitHub review submissions**. Thus the native EVM gap has actual proof but PR246 is not approved or merged. Prior source-only/queued observations remain retained. No native Solana acceptance is inferred; no release, deployment or funds.

---

## 2026-11-23 UTC — PR246 documentation-link correction, code blobs unchanged

The live draft [PR246](https://github.com/djshellshoxxx/p2p-offramp/pull/246) advanced from source commit `afc8eff73df48dace2c4650a7a9c4f4a81be7fdb` to **`233a66a7c2a465ac7b5504564c0e3b826afedcf5`** solely to replace a report-relative Markdown link (absent on current main) with the verified immutable PR245 source-gap URL. Git readback: complete tree `38fb1a712824435f2bcf9fd5225d27706472a979`, parent `afc8eff73df48dace2c4650a7a9c4f4a81be7fdb`, current main merge base `01f6f4feca051d68de24a04299cd3bb444bce40c`, ahead=2/behind=0, and the same **five changed paths**. Original source blobs and workflow/npm test code were not altered. Fresh CI on this actual head is needed; earlier checks cannot transfer. New census unchanged at **258 branches / 243 PRs**. No main merge, no native acceptance claimed, `ReleaseEnabled=0`.

---

## 2026-11-23 UTC — New test-only recovery PR246: pending exact-head native execution

New exact-source [PR246](https://github.com/djshellshoxxx/p2p-offramp/pull/246) `afc8eff73df48dace2c4650a7a9c4f4a81be7fdb` restores original Anvil EIP-1271 contract fixture and acceptance harness without modifying current main production wallet or reader. Two recovered Git blob SHAs exactly match frozen PR40, new EVM workflow runs `npm run test:eip1271:local`, and GitHub compare reports precisely five paths. Node JSON parsing of the npm script and static matching of the workflow insertion were checked during commit construction. Initial **14 check runs queued**; no actual current-head result, Anvil/Forge run or approval yet. Script asserts real contract wallet positive signature, revocation, changed terms, wrong magic/revert/out-of-gas/size, reorganization, lock, no EOA fallback and verifier no-sends. Treat these as **unexecuted test assertions** until hosted CI finishes. Original historical PR40 remains open and unmerged; prior PR245 documentation results do not qualify this branch. New branch/PR are included in the 258/243 ledger; main and `ReleaseEnabled=0` unchanged.

## 2026-11-23 UTC — S04 historical EIP-1271 native coverage status

At current `main@01f6f4feca051d68de24a04299cd3bb444bce40c`, legacy PR40 retains `contracts/evm/test/mocks/Eip1271RecoveryFixture.sol` and `scripts/test-eip1271-local.mjs` but neither file is in current main. The historical script source covers physical local contract-wallet negative cases (wrong magic/revert/gas/size/reorg/revocation) and verifier no-send invariants. Main's `evm-contract-acceptance.test.mjs` contains mock RPC tests, **not the native Anvil fixture**. No test was run here because shell GitHub DNS resolution fails. Do not claim native coverage from file inspection. See [S04 source report](BRANCH_COHORT_S04_WALLET_RELEASE_20261123.md). Exact prior PR245 docs head `cf0c8ccf30c93761e262b3aa8cd7dd4eb523b1d4` 14/14 checks successful, does not transfer to the new head.

## 2026-11-22/23 verified: PR244 real native browser succeeds; PR242 original failure remains

See [detailed fixed-source proof](PR244_HOSTED_PAYOUT_READINESS_20261122.md). PR242 exact `00efff307b10c5ed9a8bd604a21eb2bf5816e7ef` failed job `136601434309` on the disabled `Review separate payout` control. PR244 test-only exact `2acdaa3714b2c263291251b18742068077cc54ea` succeeded all 12 check runs; actual hosted Solana job `137159396404` reached full validator plus Chromium/Worker/encrypted-IDB acceptance, real Clock refund wait, and `fixtureErrors=[]`. A 150-second bounded explicit-refresh wait and final journal/send assertions are added *only* to the test; no app/contract changes. Bounded COMMENT review `6015955813` is **not** formal independent/owner review. Preserve both distinct source outcomes. PR245 documentation predecessor `917921d73f9f8bca747e620b1f4248fe6e09a8e7` passed 14/14 checks; new documentation head requires its own checks. No main merge or release; `ReleaseEnabled=0`.

# Consolidation execution and test evidence — 2026-11-22

## Live source identities

- Observed `main`: `01f6f4feca051d68de24a04299cd3bb444bce40c` (tree `437323a382952b9623a875c818f8af005a5d4563`).
- PR #237 `33232f62dc9cd250528ef3eb0313c0c319d99495`: GitHub Actions 12/12 completed successfully at its own exact source; Tier B named review missing and current-target merge-ref stale according to PR description.
- PR #243 `56ca31bad8fd3d1beaa2aca0af1d6541c4280fdf`: GitHub Actions 12/12 successful, including real hosted `browser` and `program`; PR remains draft with no submitted GitHub reviews at time of inspection.
- PR #241 `29491c2842e0aedcb00a674cbfffb9edc2424013`: PR source records 2,735/2,735 local Node cases, independent review and successful exact-head native SOL/SPL acceptance; Tier C owner sign-off still required.
- PR #242 `00efff307b10c5ed9a8bd604a21eb2bf5816e7ef`: 11/12 hosted GitHub Actions successful, **one failed** `program` job at [run 44826827834](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44826827834/job/136601434309). The `Real validator client acceptance` step passed, but `Actual Worker encrypted Solana recovery and real-time refund` failed in Chromium. The test reached release finalized/paidOut=false, then Playwright timed out after 45s because `Review separate payout` was present but disabled. Later recovery/refund checks were not reached.
- PR #244 `2acdaa3714b2c263291251b18742068077cc54ea`: draft follow-up changes only `scripts/test-solana-localnet-browser.mjs`, adding explicitly guarded readiness polling, journal assertions and redacted payout-blocker diagnostics. No new-hosted or local result claimed in this receipt.

## Evidence type and uncertainty

These results were **read from GitHub's existing CI records or source-bound PR reports**. This session did not run a checked-out Node/Agave/Chromium toolchain, did not execute a financial transaction, and did not certify the resulting combined main tree. Historical suite totals (e.g. 2,555 for PR #237 and 2,915 for PR #242) refer to their original authors' pinned sources, **not** this session's execution.

Reason for withholding #242 completion: finalized escrow state does not guarantee terminal journal evidence, active wallet binding, custody rent eligibility or a ready UI action. The new test can expose a blocker; it must not weaken or mask it.

## Required before any merge

1. Fetch source and target SHA anew; read full check-runs and external status.
2. Inspect Tier B/C automated and independent reviews, resolution of all findings, ownership and owner approval.
3. Validate the final merge tree and dependency chain, not only the original child branch.
4. Run full Node suite, TypeScript projects, policies and boundaries, default/demo builds, real Chromium/Worker and actual Solana/EVM native financial tests as applicable.
5. Verify missing/failed tests explicitly, and read back main SHA/parents after a successful guarded merge.

**Current disposition:** No source PR in this newly inventoried group has been merged by this session. All financial/release gates remain active; `ReleaseEnabled=0`.

## Optional-module qualification readback

All nine PRs #224–232 compare to `main@01f6f4fe` as **two commits ahead and 73 behind**. Exact-head Actions results are: #224 15/15, #225 14/14, #226 13/14 with **cancelled** `backup-verification-firefox`, #227 14/14, #228 16/16, #229 15/15, #230 14/14, #231 15/15, #232 14/14. None has a submitted GitHub review. Treat these as historical source-head checks; re-run any required tests on a qualified current-target merge result. Particularly, a cancelled job is not a passing test.

## New follow-up PR CI state at initial observation

PR244 and PR245 were published as **draft** and GitHub Actions began running automatically. Their check suites were still in progress at inspection, so neither is recorded as passing or ready for merge.
