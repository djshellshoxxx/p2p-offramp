# D9 durable marker and encrypted fresh-key restoration — exact branch-local content proof (2026-11-23 UTC)

**Source of truth:** authenticated GitHub reads of immutable closed [PR #69](https://github.com/djshellshoxxx/p2p-offramp/pull/69), stacked closed [PR #70](https://github.com/djshellshoxxx/p2p-offramp/pull/70), their GitHub per-file patches, exact live `main@01f6f4feca051d68de24a04299cd3bb444bce40c`, and three current-main file contents/blobs. **Neither PR was merged by GitHub.** A closed PR is not proof of integration. This report establishes that these two branches' *unique intended changed lines* are represented in main; it does not certify other D9 branches, current runtime execution, or release acceptance.

## Immutable Git identities / decisions

| Historical branch / PR | Tip SHA | Merge base with current main | Ahead / behind main | Changed scope / conclusion |
| --- | --- | --- | --- | --- |
| `chatgpt/zero-codex/d9-marker-failure-20261110` / [#69](https://github.com/djshellshoxxx/p2p-offramp/pull/69) | `44ca5fcf5e5d94893b5d7a0e3e15735506a76f52` | `c87c21b915c9e175113292bb1307754ed2424166` | 2 / 580 | Two changed files; three contiguous source additions and all 15 contiguous added test lines **exact in main** |
| `chatgpt/zero-codex/d9-restore-regression-20261110` / [#70](https://github.com/djshellshoxxx/p2p-offramp/pull/70) | `78af7214a1aab97eb3eb7722793bb536e7d6ff39` | `c87c21b915c9e175113292bb1307754ed2424166` | 3 / 580 | PR #70's unique delta is one import and one contiguous 21-line test, **exact in main**; inherits PR #69 by its historical PR base |

Both comparisons are Git-diverged, **not ancestor-merged**. Counts are from live GitHub compare and differ from previous-era base references. Comparison against the *actual PR-specific patches*, not whole-branch versus current-main diffs, avoids counting their already-stacked parent work twice.

## Current-main content proof

| Current-main path | Current main blob | Verified historical addition | Safety significance |
| --- | --- | --- | --- |
| `packages/wallet/src/evm-execution.ts` | `8c0727c48fdc9c884510b8828e87f4da451122f6` | PR69's exact three contiguous added lines (two explanatory lines and `if(!marked.ok)return fail('BROADCAST_UNKNOWN')`) | A typed error following a potentially durable marker cannot be reported as retry-safe |
| `packages/wallet/test/evm-execution.test.mjs` | `d08491dabbe6c6f46a6617656bc8de5ebe2b3d31` | PR69's full contiguous 15-line `D9: a persisted send marker...` regression | Four typed journal error modes, zero send, one reservation, no second attempt |
| `packages/domain/test/intent-journal.test.mjs` | `56f65a853a4a9c09a2c07d69fa5827017e2892b2` | PR70's exact import plus complete 21-line `D9: fresh-key encrypted restore...` regression | Encrypted backup restoration preserves unknown marker, nonce and no-signing authority; fresh reservation conflicts |

The GitHub patch added-line groups were compared as **verbatim contiguous strings including whitespace** against each current main file. Every PR69/PR70 unique added group matched exactly. PR69's removed `if(!marked.ok)return marked` has been replaced in the relevant marker path; the safe unknown-status branch remains. The current source also retains later EVM guarding and journal behavior that old branches must not overwrite.

**Disposition:** Move these **two** records from E (line-only static overlap) to F (branch-local intended change already represented by exact contextual source). E 12 → 10; F 20 → 22; branch total remains **260**. This is not a claim of whole-history Git patch-id equality, direct ancestry, all D9 features complete, independent review, new native/browser/financial acceptance or authorization to merge the older branch. Preserve both historical PRs and their source refs. Other D9 E-classified branches remain separately unverified.

## Evidence boundaries and next cohort

This run **did not execute local Node, RED/GREEN, Foundry, Anvil, Solana validator, browser, or real-wallet tests**; these already-present tests are not assigned a newly passed CI outcome. No modifications to production logic, test code, original branches, branch protection, release flags or source PR targets. Continue with remaining D9 stacked unique deltas and independently blocked [#237–244](https://github.com/djshellshoxxx/p2p-offramp/pull/237), [#246](https://github.com/djshellshoxxx/p2p-offramp/pull/246), [#247](https://github.com/djshellshoxxx/p2p-offramp/pull/247), [#248](https://github.com/djshellshoxxx/p2p-offramp/pull/248). Require named Tier B/Tier C reviews, exact-head/current-target hosted native/financial checks and recorded owner authorization before any applicable merge. Preserve `ReleaseEnabled=0` and no deployments or real funds.
