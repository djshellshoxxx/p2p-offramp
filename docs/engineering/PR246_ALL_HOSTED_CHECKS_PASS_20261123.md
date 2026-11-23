# PR246 complete hosted checks, exact-source scope — 2026-11-23 UTC

**Result: 15/15 exact-head GitHub checks SUCCESS, security/Snyk SUCCESS, independent approval still absent. PR246 remains draft and unmerged.**

## Git source and provenance
- Repository: [p2p-offramp](https://github.com/djshellshoxxx/p2p-offramp), main `01f6f4feca051d68de24a04299cd3bb444bce40c`.
- PR [#246](https://github.com/djshellshoxxx/p2p-offramp/pull/246) unchanged head `233a66a7c2a465ac7b5504564c0e3b826afedcf5`; compare to main: merge base `01f6f4feca051d68de24a04299cd3bb444bce40c`, **2 ahead / 0 behind**, 5 changed paths. Git full tree `38fb1a712824435f2bcf9fd5225d27706472a979`.
- The source-bound hosted checkout `e26d135f8e8b3f8f3a1fc8cae57998721c21e747` has validated ordered parents [main, PR246 head] and the identical complete tree `38fb1a712824435f2bcf9fd5225d27706472a979`. The original PR40 test fixture and native harness blobs remain byte-exact. No production wallet, custody, escrow, payment logic, flags, feature imports or deployment files are modified.

## Fresh hosted CI (2026-11-23 UTC)
- GitHub readback on `233a66a7c2a465ac7b5504564c0e3b826afedcf5`: **all 15/15 check-runs are completed SUCCESS**: CodeQL, program, schemas-and-crypto, backup-verification-firefox, browser, specs, backup-verification-webkit, docs-tooling, local-evm, local-trade, forge, native-nostr-relay, inventory, Analyze (javascript-typescript), Analyze (python). Combined commit status also reports `security/snyk (djshellshoxxx)` SUCCESS.
- Last previously outstanding Solana `program` [job 137488374969](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/45112658714/job/137488374969) finished **2026-11-23T05:46:56Z** SUCCESS. Actual recorded step conclusions: SBPF v3 build, lint, LiteSVM with SPL Token, committed IDL, real validator refund/recovery, Chromium and actual Worker/encrypted IndexedDB real-time refund — **SUCCESS**. The dependency-cache save step was conditionally SKIPPED (main-only) and is not an acceptance test.
- The job log includes at **05:46:52Z**: `ok - real chain time opens refund; separate reviewed refund and payout return original seller principal minus actual fees`. Final browser receipt declares `actualModuleWorker=true`, `encryptedIndexedDB=true`, `genesisRpcRewritten=false`, `clockWarped=false`, `fixtureErrors=[]`. All assertions remain intact. This is controlled local validator/loopback execution, not a public-network financial or release claim.
- Earlier same-tree EVM `local-trade` [job 137488330411](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/45112658538/job/137488330411) actually ran `npm run test:eip1271:local` with **5/5** named native Anvil checks; the verifier made **90 read RPCs / 0 sends or signatures**. Same-tree EVM forge job succeeded. Preserve original historical failed/queued/pending observations in lower checkpoints, rather than rewriting them as passed.

## Unresolved merge gates
- PR246 GitHub review submissions are **zero**. No independent Tier C review and no matching PR-recorded owner authorization are established. A passing check, Qodo COMMENT or this report is not approval. **Do not merge** or move the frozen financial parents.
- Next: obtain the required independent review; resolve findings; record applicable owner authorization; refresh the exact current main, head, merge tree/parents, all CI and Snyk results; use an expected-head-SHA guard only after all gates pass. If either ref changes, requalify.
- PR237–239 remain standalone Tier B review/target-gated; PR241–244 remain separate Tier C/native/owner-gated; optional PR224–232 remain independently owned and off by default. No branch deletion, live funds, force push, deployment, release or default option activation. `ReleaseEnabled=0` remains unchanged.

Evidence source: fresh GitHub check-run listing for `233a66a7c2a465ac7b5504564c0e3b826afedcf5`, verified job step outcomes, the actual `program` log and [prior exact-tree EIP1271 source log](PR246_NATIVE_EIP1271_EXECUTED_20261123.md). No new local test run was performed for this report.
