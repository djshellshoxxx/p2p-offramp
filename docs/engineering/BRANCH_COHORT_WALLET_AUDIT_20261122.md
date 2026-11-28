# P2P-Offramp branch-consolidation cohort: wallet release and EVM audit (2026-11-22)

**Disposition:** source-bound classification only; no financial/source merge, local test, runtime certification, or release. All comparisons are against live `main@01f6f4feca051d68de24a04299cd3bb444bce40c`. Retain prior failures and the separately owned open PR stack. Re-read exact refs before any later write or merge.

## 1. Historical wallet release stage 04

- Historical branch: `claude/loving-einstein-xgzvdy-s04-wallet-release@4ebe660f0514cc8e9ed580bf0cc23bc5a80dfad2`.
- Verified merge base: `a88560741e60146a424cc18fcb2cc1043756ae3e`; against main the branch is **4 commits ahead and 626 behind**. The branch's four newly authored commits are stages 01–04 of historical PR #26's 12-stage split.
- The **85 base-to-branch changed paths** were compared against full recursive Git object trees for both exact commits. **45 paths have precisely identical blob SHA** in main and the historical branch; **38 paths have different blob SHA** and require semantic comparison; **2 files are absent from main**.
- The two absent files are **test-only**, not production wallet code:
  - `contracts/evm/test/mocks/Eip1271RecoveryFixture.sol` — blob `83ba7e42eeead97a6a99455b4a82b714dbcc8701`.
  - `scripts/test-eip1271-local.mjs` — blob `3f0ddfce4bb986b3423ecfffa40685614a16d28c`.
- **Both absent blobs are already present byte-identically in the separately owned open [PR #40](https://github.com/djshellshoxxx/p2p-offramp/pull/40) head `7706859d2385cae0f8e49615392de08dfee83f84`, and in open [PR #26](https://github.com/djshellshoxxx/p2p-offramp/pull/26) head `94554ecf9854e4604f9f56afe5bebedeee931994`.** Neither is in main, and the historical branch is **not an ancestor** of PR #40: their Git comparison is 14 ahead / 4 behind with merge base `a88560741e60146a424cc18fcb2cc1043756ae3e`. Shared blobs, not shared complete ancestry, justify deferring the two-file integration to the existing owned PR lineage.
- One material security-sensitive divergence was checked directly: the older `packages/wallet/src/evm-contract-acceptance.ts` sends `eth_call` using a block-number tag, whereas current main at blob `c3fa7500353bd1e6ea64be41c0e94c6b67143c0f` passes **EIP-1898 `{blockHash: anchor.hash, requireCanonical: true}`** for the same acceptance call and performs canonical state checks. Copying the old source wholesale risks undoing a later canonical-hash check. This is **not** a demonstrated exploit or proof that every other changed path is obsolete.
- The other 38 differing paths include wallet, domain, retention, recovery, signed updates, transport, workflows, formal tooling, and tests. Their blob differences are **not** automatically classified as missing features or completed equivalence; compare original intent/behavior, per-file diffs, test coverage and patch IDs before any cherry-pick.
- The local EIP-1271 test script sets up a local Anvil escrow/contract-wallet fixture, tests revocation/wrong magic/revert/timeout/reorg and explicitly labels its observations test-only. It was **read**, not executed in this runtime. Main does not contain the corresponding `test:eip1271:local` package script, while the historic branch does. No default integration or transaction is authorized.
- **Decision:** retain and mark *partially reconciled, no duplicate integration*. Preserve existing PR #40/#26 source ownership and Tier C gates. Do not merge historical stage 04 as a replacement for main or present its two test files as wholly new implementation. Reconcile the remaining 38 divergent blobs in a bounded subsequent code-review cohort.

## 2. Historical randomized EVM audit ledger

- Branch: `chatgpt/zero-codex/audit-evm-schema-20261110@353b3d18eee66d0b7b9a101c9e2c575bb87cd7ab`.
- Git comparison to current main: **30 ahead / 615 behind**, merge base `300287dcde818a9d10ae301265d00bc7c0877bbb`. Exactly **one** base-to-branch path changed: `docs/audits/CHATGPT_RANDOM_AUDIT_LEDGER.md` (312 source additions in original GitHub patch); no production/test/workflow changes.
- Fetched historical ledger blob `6669fbc159da99e28adde8b60b743b08c61c29cd` (102,302 characters) and current-main blob `6b1e702e5752c9c7317ed9b9e3b882178740dc5b` (218,383 characters). The **entire historical file is an exact byte-for-byte prefix of the main file**, including all 31 historical audit section headings. Trimmed nonblank ledger-line coverage: **202/202** in main, zero missing.
- Historical [PR #67](https://github.com/djshellshoxxx/p2p-offramp/pull/67) is **closed without merge**. Its **document content** is already wholly represented in main, despite its branch commits not being ancestors. This is a scoped source-equivalence disposition, not a claim its security observations were independently reproduced or that its Git commits were merged.
- **Decision:** historical audit branch requires **no duplicate document merge**. Preserve the ref and closed PR history; classify audit content included, Git ancestry divergent.

## Proof boundaries and follow-up

- Evidence: authenticated GitHub commit compare and full recursive tree/identifier fetches, exact blob hashes, matched source-file contents, current-main ref and PR metadata. No local Git checkout was available; **no `git patch-id`, `range-diff`, combined merge-tree checkout, executable Node/Foundry/Chromium/Agave test or independent live review** was performed.
- The wallet historical branch remains **partially unassessed** in its 38 differing blobs; active PR #40/#26 review/CI/ownership remains unresolved. D8 Tier B/Tier C, full native/browser/financial gates and explicit PR-recorded owner authorizations remain binding.
- Next cohort: inspect those 38 differences for old-versus-main safety and test coverage, then independently examine an unassessed fund/refund/settlement branch. Continue broad branch inventory without claiming blanket completion.
- No force push, deletion, real funds, optional default activation, external trust/key invention, deployment or release; `ReleaseEnabled=0` retained.
