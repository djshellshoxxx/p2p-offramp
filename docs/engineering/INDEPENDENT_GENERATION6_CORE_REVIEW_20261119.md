# Independent generation 6 core correction review

Date: November 19, 2026, America/Vancouver task date; execution November 20 UTC. Reviewer: original consolidation coordinator, separate from the successor implementation tree.

## Outcome and source

Original PR205 is `cd7d54ba075118a7ec043788c17718be842ee405`. The independently reviewed corrected source is `b67bd81e74b0f58338dc15bc694cd3a22b724cd4`, tree `f2476312544b27fc5d8c44dcc16a30857e4e7381`. Work ran in isolated branch `codex/generation6-core-independent-20261119` with physical pinned dependencies.

The coordinator reproduced four defects against original production bytes. The corrected composition passed **97/97 affected tests**, zero failures, skips, cancellations or todo, exit 0, native duration 9513.913867 ms. This is targeted source qualification; no full-suite, browser, validator or release result is claimed.

The adjacent `generation6-core-independent-evidence.json` contains complete GREEN command arguments, source identity, all timing/results, log SHA256 values and exact preservation inventory. The maintained repository tests provide the reproduction implementation.

## Independent RED evidence

The five changed production files were temporarily replaced with their exact original PR205 Git blobs. A Python finally block restored every corrected file. Clean Git status was checked after restoration and after GREEN. Tests were not modified.

| Scope | Original result |
| --- | --- |
| Stale absent Solana signature context | 0 pass / 2 fail |
| Cancelled accepted-release storage open | 6 pass / 3 fail |
| Controller retry after cancelled storage open | 1 pass / 1 fail |
| Portal cleanup removes replacement output | 1 pass / 1 fail |
| Late review replaces newer selected route | 8 pass / 7 fail |

Storage/controller rows exercise one cancellation defect; navigation exercises one defect at four entry points. These are four distinct corrections. RED used `node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1` with:

- `--test-name-pattern='stale absent signature context' packages/chain-solana/test/reconciliation-context.test.mjs`
- `packages/security/test/release-update-store.test.mjs`
- `--test-name-pattern='cancelled storage open|cancelled ignored native fetch' packages/security/test/release-update.test.mjs`
- `--test-name-pattern='failed portal build' scripts/portal/build.test.mjs`
- `apps/web/test/trade-ui-navigation-lifecycle.test.mjs`

GREEN ran ten affected test files together, including surrounding Solana lifecycle, updater HTTP/store/controller, portal, navigation and template-controller cases. Its 90-second timeout did not fire. It uses maintained modules, controlled IndexedDB/RPC fixtures, actual temporary filesystem operations and transformed TSX handlers. It does not execute browser DOM, native browser IndexedDB or network RPC.

## Assessment and boundaries

Cancellation retires only the aborted caller's wait. Shared native-open ownership, live callers, pre-transaction cancellation, rollback floor, CAS and the controller's separate physical HTTP-drain rule remain. Listeners are removed on cancellation/resolution; late success cannot start a cancelled transaction.

Route checks preserve initiating hash and mounted/current-record guards. Drafts also require their current unlocked generation. Actual-controller tests establish successful review preserves that generation, while profile retirement invalidates it and clears retained private bytes. No signing, sending or persistence authority is added.

Portal cleanup verifies device/inode of the current nonsymlink directory before deletion. The real-filesystem regression retains an unrelated replacement's KEEP.txt. This closes replacement-before-cleanup. Separate lstat/remove operations are not atomic against a continuously racing same-user filesystem actor.

Solana binds expiry to finalized slot/block height, fresh processed invalidity and a final signature-absence context reaching that slot. Malformed, unavailable or stale evidence fails conservatively; genesis identity is rechecked on errors before updating the height floor. Separate review `f2de9d44c67cf18769f3277bc41ca831888ece7f` inspected pinned Agave 4.1.2 and found no additional High/Medium. RPC context supplies a consistency bound, not a cryptographic guarantee of complete history.

Root checked official contracts for [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses), [isBlockhashValid](https://solana.com/docs/rpc/http/isblockhashvalid), [getBlock](https://solana.com/docs/rpc/http/getblock) and [getBlockHeight](https://solana.com/docs/rpc/http/getblockheight). Request parameters match those contracts and nullable block/height data is conservatively refused.

Exact Git-object comparison preserves six workflows, 74 contract/escrow paths and eight dependency manifest/lock/toolchain files. Five production/tooling files change: two trade UI files, Solana submit.ts, accepted-release storage and portal builder. The remaining 12 changed paths are tests/reports.

No additional High/Medium finding was established in these four corrections. This does not clear unrelated Cargo advisory matches or old PR205, which still contains the reproduced defects.

## Integration limits

Keep original PR205 unmerged. Its passing hosted foundation results remain bound to its own head. The corrected descendant requires its own complete local and hosted qualification: restore/replacement, strict physical-send evidence, principal/fee assertions and both real refund waits. Later successor test/report additions are outside this 97-test execution.

Two Cargo advisory matches are assessed separately; this review changes no dependency or advisory policy. Optional packages remain outside scope. No production source, external working tree, remote ref, global coordination file, deployment, release, credential, setting or real-funds operation was changed.
