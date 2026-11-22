# P2P-Offramp — stage-04 wallet safety and priority branch cohort (2026-11-22)

**Evidence level: authenticated GitHub source/commit/tree review, not executable validation.** Current main is `01f6f4feca051d68de24a04299cd3bb444bce40c` (tree `437323a382952b9623a875c818f8af005a5d4563`). Paginated live scan: 257 branches, 242 PRs (60 open/124 merged/58 closed), no changed ref except the documentation branch's own prior tip. Original PR/branch ownership and all historical failures are preserved.

## 1. Fourteen newly resolved ancestry-contained branch tips

GitHub compare for each exact inventory SHA to the current main returned **ahead=0** and merge-base equal to the respective branch tip. The source commits are already in main, regardless of the historical PR's state; no duplicate merge is appropriate.

| Branch | Commits behind main |
| --- | ---: |
| `codex/native-update-locale-continuation-g24-20261120` | 13 |
| `codex/post-send-reconcile-20261109` | 590 |
| `codex/solana-public-export-g14-20261120` | 89 |
| `docs/lean-release-handoff-2026-10-24` | 827 |
| `docs/security-spec-expansion-20261021` | 860 |
| `integration/privacy-endpoint-disclosures-20261109` | 578 |
| `parallel/accessibility-recovery-panels-20261113` | 483 |
| `parallel/browser-cold-nonce-20261113` | 466 |
| `parallel/browser-cold-recovery-20261113` | 465 |
| `parallel/docs-web-profile-recovery-20261113` | 481 |
| `parallel/portable-recovery-guide-20261113` | 579 |
| `parallel/recovery-builder-help-20261113` | 579 |
| `research/security-addendum-20261103` | 625 |
| `test/erc20-browser-recovery-20261119` | 199 |

These are Git ancestry conclusions only, not assertions of feature acceptance or passing current-main tests.

## 2. Two divergent docs-only branches with included content

- `review/codebase-security-20261104-94554ec@6e9c0c5ea8881013d06892103cf87ef1c547476a`: 2 ahead/627 behind. All five historical report paths have **identical Git blob SHAs** in main: `README.md`, `findings.json`, `local-tests.log`, `remaining-work.json`, and `verification.json`. Historical PR #31 remains closed without merge; the document content itself requires no re-merge. This does not validate findings as repaired.
- `codex/solana-payout-docs-20261109@7e8d571ae350190e9ba0fdf50a7b9184a4730ad9`: 1 ahead/621 behind. The sole `contracts/solana/README.md` patch has **9/9 added nonblank lines** in current main, and **0/2 removed old statements** remain. Current narrative correctly differentiates atomic combined release+payout failure (entire transaction rolls back to Funded) from a separately finalized release followed by retryable payout. Historical PR #57 closed unmerged. No Solana runtime acceptance is inferred.

## 3. Wallet stage-04 source comparison — potentially important missing defense

Historical tip `claude/loving-einstein-xgzvdy-s04-wallet-release@4ebe660f0514cc8e9ed580bf0cc23bc5a80dfad2`, merge base `a88560741e60146a424cc18fcb2cc1043756ae3e`, 4 ahead/626 behind. Prior 85 changed-path review: 45 exact matching blobs, **38 differing**, two absent main test-only blobs already byte-identical in *open* PR #26/#40. This cohort inspected **all 38 differing paths** against base-to-stage-04 GitHub patches and exact main file source. Exact added-line presence is only a screening heuristic, not executable patch equivalence.

The standout is `packages/wallet/src/evm-execution.ts`: 48 of 51 unique historical added lines are absent from main and 28 of 29 historically removed lines still occur in main. Historical 150-line code has stricter defensive boundaries than present main's 129-line version:
- Historical `current()` checks `disposed` **again after** `options.isCurrent(originalSession)`. Main checks `!disposed` before invoking the possibly reentrant callback, but does not repeat the test after its return.
- Historical `selectedAccount()` reads own-value array descriptors without invoking indexed accessor properties; main directly reads `accounts[0]` and `finalAccounts[0]`.
- Historical code obtains the final `provider.request` capability then checks the scope guard before invoking it. Main performs a property lookup and invokes `provider.request` directly to submit; a reentrant property getter could change scope between the check and invocation.
- Historical code captures native AbortSignal getters/event methods and uses an owned cancellation controller; main uses direct `signal?.aborted` and `signal.addEventListener`. Whether any supplied signal is hostile requires a real typed boundary test.

**Important compatibility stop:** the older implementation returns a journal's `marked` failure directly after a durable marker attempt; current main deliberately converts all such failures into `BROADCAST_UNKNOWN`. Therefore copying historical source wholesale would risk weakening the newer D9 uncertainty invariant. Only a narrow test-first reconciliation is appropriate.

The historical EVM execution test blob `66246d3a824c900cf7e2d714d4d66670d15fa4da` is **byte-identical** on historical stage-04, open PR #26 and open PR #40, but *not* on main (`d08491dabbe6c6f46a6617656bc8de5ebe2b3d31`). It contains 20 named test definitions versus 12 in main, including **nine historical scenarios absent by test title**: indexed account getters, scope retirement during reflection and final request acquisition, disposal during `isCurrent`, malformed signal hooks and overridden native signal methods. The historical and main source have not been executed here.

**Disposition: POTENTIAL financial admission/race regression, NOT a demonstrated exploit or verified failing test.** A fresh independent worker should recover the nine maintained historical tests without editing the owned #26/#40 branches; run them first against current main to establish actual red/green behavior, then narrow-fix any confirmed issue with new current-source CI, code/security review and unaltered marker, send-count, nonce, physical-slot, signer, timeout and reconciliation assertions. Do not insert a partial or duplicate implementation into #237–244's frozen stack. Track ownership before integration.

Other differing stage-04 paths screened include security release updates, storage retention and backups, relay, schemas, formal tooling, Sepolia scripts and workflows. Some historical additions are fully represented line-for-line in newer main, while `scripts/test-evm-reconcile-local.mjs`, `scripts/formal/evm.mjs` and some release/wallet code differ substantially; those remain to be independently tested and semantically qualified. Do not classify all 38 as resolved.

## 4. Another high-value historical stack remains unresolved

`claude/loving-einstein-xgzvdy-s07-native-journey@8f0e5e245ee8c63c749e8af97fdb9d309e95b8d7` is 7 ahead/626 behind current main, merge base `a88560741e60146a424cc18fcb2cc1043756ae3e`, with 199 changed paths. It is an additional later stage in the historical #26 split, *not* safely mergeable from branch name or commit count. Keep classified unassessed until source/PR-diff ownership and exact current-feature overlap are checked.

## 5. Exact next acceptance work

Preserve current source heads and existing PR ownership. First reproduce the suspected reentrant execution-scope risk with historic test cases under the same main source and targeted Node runner; preserve `BROADCAST_UNKNOWN` after any attempted durable marker and no duplicate physical send. Then handle the rest of the 38 differences and s07, while continuing independent non-PR escrow/recovery branch examination. D8 named Tier B for #237/#224–232, Tier C PR-recorded owner approval for #241/#242, current-target checks and independent review remain unwaived. No local clone, Git patch-id, runtime/Chromium, Solana validator or real financial action was performed during this cohort. `ReleaseEnabled=0`; no deployment, optional default activation, branch deletion, force push or main merge.
