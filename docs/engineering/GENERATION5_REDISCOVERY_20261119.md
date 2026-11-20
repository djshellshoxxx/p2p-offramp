# Generation 5 rediscovery and optional integration sequence

## Scope and observed state

This is a read-only successor audit, with only this report and `inventory-delta-generation5.json` added in an isolated worktree. It reads the original maximum-consolidation directive, PR200's durable handoff at `f0773c2c91ec271b86c84baf3745c9cd56d1cf36`, the immutable 192-branch inventory, the generation4 overlay, live GitHub refs/PRs/issues/checks, native failure logs and accepted decision records. No product source, remote ref, PR metadata, workflow setting, release or deployment was changed.

The consistent inventory snapshot completed at **2026-11-20 01:50:42 UTC / November 19 17:50:42 Pacific**. It precedes publication of the coordinator's generation5 core candidate; that later head must be recorded as a subsequent observation.

| Metric | Actual observation |
| --- | --- |
| Main | `5c5a84ef6300330700c8b0ca54d074ac113f08be`, unchanged |
| Remote branches | **209** |
| Pull requests | **201**: 58 open, 105 merged, 38 closed without merge |
| Original 192 heads moved or removed | **0 / 0** |
| Owned additions relative to original inventory | **17**, PR188–204 |
| New branches since generation4 overlay | **2**, PR203 and PR204 |
| Previously observed owned head changed | PR200 only, `de7c385…` to `f0773c2…` |
| Tags / releases | **0 / 0**, CLI refs and releases API |
| New external source branch or changed original head | **None observed** |
| Main merges performed by this successor | **0** |

All paginated branch and PR records were read, with unique names/numbers checked. The first draft read straddled PR204 creation; it was discarded for totals and repeated as a consistent three-page read. CLI heads independently matched the 209-branch total. The original A108/B20/C41/D5/E2/F11/G5/H0 classification is preserved; absence of a moved ref does not prove nobody is working offline.

### New published source identities

| PR | Head | Tree | Base |
| --- | --- | --- | --- |
| [203](https://github.com/djshellshoxxx/p2p-offramp/pull/203), restore acknowledgment/byte ownership | `2245b3bfb462eca468b4cf759fdc12fa49c5cd3a` | `412efa7b9534cc182d05d2b97830d5f6ff09944e` | PR202 `d753c0af23ff43743e34679e6b778b9ac0370da2` |
| [204](https://github.com/djshellshoxxx/p2p-offramp/pull/204), encrypted templates | `98d33db64622eab3f5f4ece6141d445d255245e7` | `f5c5bb060732a892ba4eb91532e82ed79f64f2c4` | PR201 `f5241c09f268a7a6841a5760ed0faa90b5b7f005` |

Both new source heads have main as their exact merge base, with zero commits behind and 35 ahead. PR200's current head also has zero behind/35 ahead, tree `a3c94e992597a84a5603a16527156c0c934a762e`. Git objects were fetched and these identities recomputed locally.

The coordinator's core source `de5bb8aadadd9b76099110262b2f7beb123f9421`, tree `ff1028ddc6c90119e38be7ca8fe3e007fb525b06`, is the input for this successor's merge-surface analysis. Its author and independent reviewer separately report 2217 full tests and 506 affected/38 policy/3 cross-feature probes; this successor did not repeat those executions or qualify their hosted gates.

## Updated optional CI, with actual failure causes

These check counts belong to unchanged published optional heads. The checks and logs were read between 01:50:42 and 01:54:40 UTC. A check on an old source is not qualification for a future stack.

| PR/package | Passed checks | Other conclusion |
| --- | --- | --- |
| 191 proof-inputs | 9/10 | Native `program` failed |
| 192 liquidity | 9/9 | All triggered checks passed; no native Solana trigger |
| 193 arbitration | 9/9 | All triggered checks passed; no native Solana trigger |
| 194 privacy-policy | 9/9 | All triggered checks passed; no native Solana trigger |
| 195 courier | 9/9 | All triggered checks passed; no native Solana trigger |
| 196 meetup | 9/10 | Native `program` failed |
| 197 privacy-controls | 9/10 | Native `program` failed |
| 198 stealth | 9/9 | All triggered checks passed; no native Solana trigger |
| 199 proof-jobs | 10/11 | Native `program` failed; dedicated proof Worker browser check passed |

All nine foundation browser checks remain passed. The four native failures are no longer running or queued:

- [PR191 job135983838195](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44644591747/job/135983838195): duplicate physical-send assertion at **00:58:22 UTC**; fresh-key restore/explicit replacement passed at 00:59:57; the real refund wait completed, then final fixture-error assertion failed at **01:30:13**.
- [PR196 job135987783703](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44645760050/job/135987783703): duplicate assertion at **01:19:55**; restore/explicit replacement passed at 01:21:31; real refund wait completed, then final fixture-error assertion failed at **01:51:48**.
- [PR197 job135987836079](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44645775824/job/135987836079): duplicate assertion at **01:11:38**, then a disabled `Restore with a fresh key` button timed out at **01:12:23**.
- [PR199 job135990906563](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44646673349/job/135990906563): duplicate assertion at **01:12:18**; restore/explicit replacement passed at 01:13:51; real refund wait completed, then final fixture-error assertion failed at **01:44:08**.

The exact error excerpts and head/job identities are retained in the JSON delta. These actual logs match the source defects addressed by PR202's completed acknowledgment fixture and PR203's restore lifecycle correction. That correspondence does not turn an old failure into a pass, and this successor did not run the corrected financial browser flow.

## Policy observations

The canonical accepted-decision index and November18 gameplan explicitly accept the nine optional reference packages **one package per PR**, each with an import-boundary check and separate gating before any default wiring. The old D7 parking instruction is superseded. No optional package should be combined into the core candidate merely to avoid its separate review scope.

The detailed accepted D8 packet distinguishes three tiers. Its Tier B paragraph explicitly calls for a CodeRabbit or Qodo automated review pass. Its recommendation also describes those services as advisory **server checks**. The canonical summary calls for independent review and retains the packets where it is shorter. The [November19 issue82 checkpoint](https://github.com/djshellshoxxx/p2p-offramp/issues/82#issuecomment-7002263636) still explicitly described standalone QR/tooling Tier B automated review as outstanding.

All nine optional PR review-submission lists are empty, and their observed check-run lists contain no CodeRabbit/Qodo check. This does not invalidate committed independent native-worker reviews. It does mean a named service pass must not be invented or claimed. The coordinator must apply the actual tier of each standalone delta and the current user's authorization to this written-policy question before merging. This report does **not** apply a Tier B-only condition to the combined Tier C core candidate, change any policy, or request new approval.

Current branch-list metadata reports `main.protected:false`; the rulesets API returned an empty list. The detailed branch-protection endpoint returned **403 Resource not accessible by integration**. No inaccessible setting is inferred, and an unprotected branch is not permission to waive written qualification. No server setting was changed.

The three issue records are still open: #55 research roadmap, #82 consolidation ledger and #130 historical orphaned CI. Their age and unchecked boxes do not override newer source evidence. Latest #130 comments preserve the November11 queued/zero-job observations and distinguish them from successful newer runs. No old run was canceled, deleted, retriggered or relabeled here.

## Actual merge-surface assessment

Each existing optional source changes only its own package subtree, its scoped evidence and necessary root command/workflow additions relative to `ac9a4b0ffc3ca50a299398e72554e7964a634cd4`. No optional head changes a second optional package.

Read-only `git merge-tree --write-tree --messages` against the frozen core source produced:

| PRs | Result |
| --- | --- |
| 191, 192, 193, 194, 195, 198 | Clean merge trees |
| 196, 197, 199 | Only `package.json` content conflict |
| Existing all-nine local composition `27fba7450600836b5edc131ae1f4f1744ae96248` | Only `package.json` content conflict |

No source, lockfile, contract or workflow conflict was reported. These computations wrote only unreachable analysis tree objects; no index, worktree source, branch or remote was advanced.

The conflict is a command-list append. The common command values and all non-script package metadata agree. The exact union is **56 core commands + six optional additions = 62 commands**, with no name/value collision:

| Origin | Added command |
| --- | --- |
| 191 | `typecheck:proof-inputs` |
| 196 | `test:meetup:browser` |
| 197 | `test:privacy-controls:browser` |
| 199 | `test:proof:memory`, `test:proof:browser`, `typecheck:proof-jobs` |

The two proof-jobs TypeScript configurations and the separate proof-inputs configuration must remain as authored, along with the real Worker/memory qualification. Preserve the foundation blocks' own Chromium environment assignments and the dedicated proof-jobs workflow. A clean textual merge is not evidence of semantic correctness; compare exact package subtrees and command/workflow unions after composition.

## Recommended sequence, without executing it

A stack of the **existing** owned PRs can preserve one-package review scope while qualifying independent layers concurrently. It should be prepared only against the published, frozen core identity; no new competing baseline is needed.

1. Keep the reviewed core candidate as the first main integration. Preserve its full hosted native/browser gates and independent verdict.
2. In isolated worktrees, merge the frozen core into the first optional head, then merge that prospective result into the next optional head, continuing in a declared order such as 191–199. Each resulting head must descend from its old published optional head, so publication can use a normal leased fast-forward. No rebase, forced update or history deletion is necessary.
3. For each layer, verify the diff against its immediately preceding base contains exactly that package, scoped tests/reports and its command/workflow additions. Verify every earlier package subtree and all core source remain byte-identical. Resolve append conflicts by the checked exact command union.
4. Qualify the final all-package local composition and meaningful per-layer boundaries. Its final source must have no optional imports in default document/private-Worker/QR graphs. The previous 2553- and 2580-test compositions are useful source evidence, but neither substitutes for execution with the new templates and restore source.
5. Set each PR's intended stack base before advancing its owned head, then publish the new heads in order with expected-head leases. Capture the actual newly executed workflow run, merge-checkout commit, ordered parents and tree for every layer. Do not assume a base-only edit launches the required checks.
6. Allow independent hosted jobs to run concurrently. Maintain all native 1800-second waits, source/body inventory checks, specialized optional browser gates and exact-head reviews.
7. Once the core qualifies and merges, retarget the first optional PR to main. Before merging, verify current main equals the intended preceding source tree and the actual prospective merge tree equals the tree that was qualified. Repeat in dependency order. If any source/tree or parent assumptions differ, investigate and requalify; no blanket transfer of old green results.
8. Preserve branch history and dated CI failures, and update the durable ledger only after actual results. Do not mark source PRs merged or superseded merely because a prospective stack exists.

The workflow source uses `pull_request` without extra activity types. GitHub's [event documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request) states that the default activity types are opened, synchronize and reopened, and that normal pull-request checkout uses the merge ref. Therefore a planned base edit needs actual execution evidence; a new reviewed head provides a source change to qualify. This is an operational inference from the documented defaults and the inspected YAML, not a claim that any new run has already started.

The unchanged Solana path filter includes `package.json`, explaining why 191/196/197/199 triggered the long native gate and the five package-only PRs did not. Preserve that filter; do not edit it to shorten the sequence.

## Concrete remaining work and documentation corrections

No new external unique source or previously unclassified remote branch was found. Useful work remains in qualification and accepted integration, rather than repeated recovery of D9, retention or historical duplicate tests.

The existing feature matrix deliberately pins its baseline to main and must remain historically accurate. Its **staging overlay**, however, contains stale continuation assertions:

| Entry | Stale text | Required new dated overlay |
| --- | --- | --- |
| F28 favorites/templates | Favorites reopening defects held; templates unimplemented | Favorites defect independently closed; templates implemented and locally reviewed at PR204; new hosted browser results still required |
| F16 Solana funded exits | Native workflow running | Old applicable heads failed as above; source repairs202/203 exist, combined corrected hosted qualification pending |
| F30 unsigned distribution | PR190 hosted positive without current-source distinction | Preserve PR190 positive; new-current locale binding remains stale and staging refuses it; historical-client/current-tooling fixture is explicitly separate |
| F22 optional packages | Hosted qualification active generically | Five heads fully green among triggered checks; four native failures; source integration remains accepted/separate, corrected-core qualification required |

The coordinator subsequently corrected F16/F28/F30 in the new core checkpoint. This successor read that updated feature matrix and verified that all 27 pinned-main feature entries remain byte-for-byte equivalent as parsed data. The original stale observations above are retained as the reason for that correction, not as newly open findings. Root owns coordinated ledger updates; this successor did not edit them. The new optional CI detail in this report remains a dated input for that ledger.

The internal asset-update controller remains source-only. A next design review can connect its current trust, transport and lifecycle contracts, but must not invent a trust root or activate a network update path. Full Solana discovery/negotiation/funding parity, a payment-proof trust model, physical wallets/camera/mobile acceptance and release authority remain distinct from the funded-exit/reference-package scope. Existing #155 Waku/mobile/XMTP and pinned-container limits remain preserved rather than silently promoted.

## Verification and continuation

This successor executed inventory consistency comparisons, exact local object/tree/merge-base/divergence checks for newly published refs, nine dry individual merges plus one all-nine dry merge, exact command/non-script metadata comparisons, and one-package path-scope checks. It read actual GitHub check-run/review/issue results and four complete native logs. It did **not** rerun product tests, launch Chromium, mutate remote state or claim a merge.

The JSON overlay binds all 17 owned branch heads, optional source checks, failure excerpts, issue identities, original-head comparisons, API limitations and dated counts. Before any next write, resolve live heads again and account for the coordinator's later core publication. Keep the original inventory and prior overlays unchanged.
