# Independent main-target qualification review — generation 13

## Decision at the observation boundary

**PR213 is not ready to merge.** At 2026-11-20 06:35 UTC, its current-target
native/browser and remaining workflow jobs were not complete. The candidate is
mergeable and its merge tree exactly equals the reviewed source tree; that
identity does not turn pending execution into a pass.

This worker performed read-only hosted inspection and local documentation work.
It did not change source, workflows, checks, branch settings, remote refs,
release state or funds. This is an independent qualification/readiness review,
not a new claim that every source path was security-reviewed.

## Exact sources and target checkouts

GitHub PR metadata and Git commit APIs independently returned these identities:

| PR | Source head | Target base | Actual proposed merge checkout | Merge tree |
| --- | --- | --- | --- | --- |
| [213](https://github.com/djshellshoxxx/p2p-offramp/pull/213) | `d30152336bb687b31ae547ab3fcecb8835a02ef4` | `5c5a84ef6300330700c8b0ca54d074ac113f08be` | `007651d899220b7aa0ec50794db51e8c4605c6d2` | `fa0d662c991cb03729ca0a4ea53ef60960b81842` |
| [214](https://github.com/djshellshoxxx/p2p-offramp/pull/214) | `24378d91682f7ee2957e1237aefcdb2ed062962b` | `d30152336bb687b31ae547ab3fcecb8835a02ef4` | `54da0586b24b38021d92eff8ba2aca4f13e93c83` | `ff58a8823649c43ba74356cc78084703ffaeedb6` |
| [215](https://github.com/djshellshoxxx/p2p-offramp/pull/215) | `e77a2d3e758ee3b416d8d96ecd979526c7ae78ce` | `d30152336bb687b31ae547ab3fcecb8835a02ef4` | `c89188e50e3f05709852149fe055dafa5e005430` | `af568d385edf9792f6e602d864e4c6d3d9a2d64a` |
| [216](https://github.com/djshellshoxxx/p2p-offramp/pull/216) | `9dd01b199a3448a7654c4719d226ec01eb93eecc` | `d30152336bb687b31ae547ab3fcecb8835a02ef4` | `1e5742ebb0dee499d6ee36dab101c40bffc190a5` | `5ab1f4ddc56742645c60ac43ac2184e194867e0a` |
| [217](https://github.com/djshellshoxxx/p2p-offramp/pull/217) | `973d7b046df54856e0f71688db7a3efd879e7c2d` | `e77a2d3e758ee3b416d8d96ecd979526c7ae78ce` | `1020dd891cd60abda81a21f17dd7fdcafa1390c8` | `9c5e9d8cc8d3c6996a646b43d39b581fe325484f` |

Every proposed merge commit has exactly the table's target base and source head,
in that order, as its parents. PR213 head d301 independently resolves to the same
fa0d tree. Local full-history ancestry confirms main 5c5a is an ancestor of d301:
56 commits and 351 changed paths. No main/source ref moved during this review.

PR213/215/216/217 were drafts; PR214 was ready for review. All were mergeable,
with GitHub reporting `mergeable_state: unstable`. None was merged.

## Current-target PR213 execution

The following jobs belong to PR213, not to the older PR210 that shares its head:

| Workflow / run | Job | Observed status |
| --- | --- | --- |
| Vault foundation / 44685352661 | schemas-and-crypto / 136118251247 | Completed successfully |
| Vault foundation / 44685352661 | specs / 136118251527 | Queued |
| Vault foundation / 44685352661 | local-evm / 136118251580 | Queued |
| Vault foundation / 44685352661 | docs-tooling / 136118251665 | Queued |
| Vault foundation / 44685352661 | browser / 136118251733 | Queued |
| EVM escrow / 44685352684 | local-trade / 136118251232 | Queued |
| EVM escrow / 44685352684 | forge / 136118251512 | Queued |
| Specification inventory / 44685352623 | inventory / 136118250851 | Queued |
| Nostr relay interoperability / 44685352627 | native-nostr-relay / 136118250875 | Completed successfully |
| Solana escrow / 44685352632 | program / 136118251162 | Running |
| Dynamic PR213 CodeQL / 44685341266 | Analyze (python) / 136118219795 | Completed successfully |
| Dynamic PR213 CodeQL / 44685341266 | Analyze (javascript-typescript) / 136118220045 | Completed successfully |

I downloaded and read the four completed jobs' actual decoded logs. Both Nostr
and schemas logs record `refs/remotes/pull/213/merge`, full checkout
`007651d899220b7aa0ec50794db51e8c4605c6d2`, and the expected main/d301 merge
message. Both CodeQL logs instead record `refs/remotes/pull/213/head` and full
checkout d301. The Git commit API binds those checked-out objects to the exact
trees above.

The schemas job completed four TypeScript configurations and the full JavaScript
suite: **2,310 passed, one skipped, zero failures/cancellations/todos**, out of
2,311 tests. The skip is the already-known Foundry Cast calldata comparison,
because this job does not install Foundry. Its separately executed suites passed:
22 formal-unit, 12 acceptance-CLI, eight agent-workflow, 57 build-policy,
16 diagnostics and 26 parser-fuzz tests. These overlap the project's broader
coverage and are not added into a claimed aggregate count. Boundary validation
reported 238 production source files / 142 graph modules; the build completed.

The native Nostr job passed **3/3**, zero skips. Its receipts cover exact native
relay writes and reconnect handling, project NIP-17/NIP-59 transport, and the
explicit fixture AUTH policy. They do not qualify TLS or physical providers.

The Solana job step API reported successful pinned installation, formatting,
SBPF build, lint, LiteSVM tests and committed-IDL comparison. It was executing
the real-validator acceptance/refund/recovery step. A running job's complete
decoded log was not yet available for this review, so these native milestones
are recorded as **API step status**, not independently inspected completed-log
proof. The second actual-browser refund gate was not complete. The workflow
still contains both real 1,800-second minima, the 50-/60-minute individual step
timeouts and 150-minute whole-job timeout.

## Followup gates

All PR214–217 workflow runs in the snapshot were queued. I additionally read
their relevant job lists:

- PR214's EVM `forge` and `local-trade` jobs were queued. Its mandatory
  `cast --version` and wallet test step has no hosted pass yet.
- PR215's five foundation jobs, including actual backup-verification browser
  execution, were queued.
- PR216's Solana program job **136124723167** was queued. Neither host-only
  compilation nor an audit result substitutes for its updated-lock SBPF,
  Clippy, LiteSVM, IDL or financial/browser gates.
- PR217's actual backup engine jobs were present and queued:
  **136125239461** for WebKit and **136125239664** for Firefox. The existing
  Chromium browser job **136125239174** was also queued.

No failure was diagnosed from queued state. There was no rerun, cancellation,
timeout reduction, job deletion or test/assertion weakening by this worker.

## Older same-head evidence remains separate

Original PR210's Solana run **44677307772**, job **136092098296**, had completed
its first real-validator refund/recovery step and was executing
`Actual Worker encrypted Solana recovery and real-time refund`. It was not
complete at the observation boundary.

Existing generation12 records bind PR210 execution to merge checkout
`65f9739dfd1ea44cb2dc9aa93a884c35548aa888`, with ordered parents
`df10fe26a308407237f9ccbc636c8bb61f55b84f` and d301, and the same fa0d tree.
That remains useful source evidence. It is not relabeled as PR213's current
main-target execution.

The commit-level checks endpoint mixes PR210 and PR213 jobs because their head
is identical. Its standalone CodeQL summary even links an older PR210 alert
query. The separate dynamic PR213 job logs establish their actual checked-out
head. An aggregate success or the presence of older green contexts is not
sufficient to declare the current-target queue complete.

## Policy and next decision

The live branch API returned main `protected: false`; the ruleset collection
was empty. That does not remove the written gates. The canonical accepted
decision index and current consolidation handoff preserve the owner's Tier C
source-integration approval, exact-head checks and independent review with no
open High/Medium findings. No new approval is requested by this review.
Standalone optional Tier B packages keep their separately applicable named
review condition; they are outside this gate assessment.

No PR213 review submissions or discussion comments were returned at this
observation. That is recorded narrowly: existing source review evidence lives
in committed reports and the coordinating session, and empty discussion is not
a new review approval.

Root should keep these source heads frozen while the current-target jobs run.
Before merging, re-read the live head/base/tree and applicable checks, inspect
completed native/browser logs and the required receipt assertions, verify no
new unresolved finding, then use the exact expected head. A head/base change
requires reassessing its proposed merge tree and execution binding. Preserve
the original branches and source ancestry. ReleaseEnabled remains 0.

## Evidence and limits

The companion `independent-main-gate-review-generation13.json` carries the
portable source identities, per-run/job status, checkout bindings, test totals
and decoded-log hashes. Complete snapshots and the four decoded logs are in
the sibling scratch evidence directory
`/workspace/scratch/dcf03ef9bee8/evidence/main-gate-review-g13/`.
Hashes identify the exact UTF-8 decoded log copies, including their BOM.

This review ran no application, browser, blockchain or exploit test. It created
only this report and its evidence JSON on an isolated documentation branch.
Later CI changes must be recorded as new observations rather than silently
rewriting this timestamped snapshot.

## Followup observation — 06:37:28 UTC

A later checks read found current-target PR213 `specs` job **136118251527**
completed successfully. I downloaded its complete log and verified checkout
`007651d899220b7aa0ec50794db51e8c4605c6d2`, **32/32 Python tests**, and
specification inventory **173 documents, zero broken links, zero unindexed**.
Its decoded UTF-8 log SHA-256 is
`f6f8827e63e50375cc7d268afbcfcb20fddc506e34ecbcfcae0abef4ba822ddc`
(22,214 bytes). The initial table above remains the earlier observation.

The six other queued source jobs and the in-progress Solana program still
prevent merge readiness. PR213's real-validator step began at **06:31:14 UTC**;
original PR210's second browser-refund step began at **06:11:06 UTC** and was
still running. There is no complete native-financial pass in this followup.

Local documentation validation completed with engineering consistency true,
semantic approval false, publication false and approved release null. JSON
parsing and staged whitespace checks passed. No application test was rerun.
