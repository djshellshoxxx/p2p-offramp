# Generations 26–28 — vault request ownership and main-target consolidation

## Result and active integration plan

**All four vault forms retain the original request controller when the same
render's submit handler is called again.** The combined source passed
**2,505/2,505 tests**, with zero failures, skips, cancellations or todos, plus
four TypeScript projects, build policy, import boundaries and both builds.
Production changes after PR235 consist of four admission-condition replacements
and one explanatory comment in `VaultForms.tsx`; two regression files add 27 cases.

The coordinator is consolidating the exact published ancestry of PR233, PR234
and PR235 into **one new candidate targeting main**. This plan supersedes the
older instructions to merge PR233, retarget PR234, then qualify PR235 separately.
Keep all three original heads frozen while the aggregate is qualified. Their
individual check results do not qualify the aggregate's current source and main
target. Publication, a new PR identity, the actual proposed merge and hosted
completion remain pending at this documentation checkpoint.

| Checkpoint | Exact identity |
| --- | --- |
| Last coordinator-observed main | `8e836baa877b676a863c877003e277b638fc5061` |
| Published [PR233](https://github.com/djshellshoxxx/p2p-offramp/pull/233) | `92663e46508b06645111d9c713beb82d3a6d1a0f` |
| Published [PR234](https://github.com/djshellshoxxx/p2p-offramp/pull/234) | `477777dc152cd3148ba7f25a75ce8f00dc1b03b5` |
| Published [PR235](https://github.com/djshellshoxxx/p2p-offramp/pull/235), immediate parent | `bca96b796db18d69563ae5f0395452494a0dacd5` |
| PR235 complete tree | `bfcdf96410df7bbb59996537c8388abaafefbb7c` |
| Frozen combined source | `2a0b26f3392d86c1cd3e056771c59438ece92927` |
| Frozen combined tree | `92beca7b34957889156260d1167df81ebcf4aa84` |

The integration branch is `codex/main-consolidation-g28-20261120`. All four
listed ancestor commits are present in the frozen local source. Of PR235's
1,020 non-documentation entries, 1,019 remain exact; `VaultForms.tsx` changes and
the two regression files are added, producing 1,022 such entries. Subsequent
documentation/evidence commits must preserve that entire tested set.

## Generation 26: UnlockForm ownership

The original handler checked the render-captured `busy` value. A second call
before rerender could replace `request.current` even though the actual runtime
refused the second operation with `BUSY`. Cancel and teardown then targeted the
replacement controller; the original request remained admitted. The duplicate's
completion could also clear the busy indicator and request ref while the
original request was still pending.

The corrected handler checks `busy || request.current !== null` before reading
inputs or replacing ownership. The first invocation reserves the existing ref
synchronously. Its controller remains available to the existing cancellation
and cleanup paths, and the runtime can suppress a late reply after cancellation.

The test-only source is `6df5a34a7c00f8a6fa489a53ca8f783616e285f5`; the
author fix is `a2a854a285563d4560610577a0df099b041643bf`. The same eight
cases produce **4 pass / 4 fail** on the original handler and **8/8 pass** on
the fix. Both author and independent affected selections pass 52/52, with the
UI TypeScript project passing. The independent review identifies no finding.
The [author report](UNLOCK_FORM_ADMISSION_GENERATION26_20261120.md) and
[independent review](unlock-form-admission-independent-review-generation26.md)
retain separate source identities and actual evidence.

The independent RED assertions stop at the first failed ownership or busy-state
check; their log does not independently observe every later publication
described by source analysis. GREEN explicitly delivers correlated fixture
replies and checks that cancelled output cannot publish unlocked state or an
extra completion callback. Ordinary success and an explicit retry after a
completed refusal remain covered.

## Generation 27: ExportForm, CreateForm and RestoreForm

The remaining three forms had the same ownership gap. Their repair changes
exactly three guard lines to the same condition and preserves the complete G26
UnlockForm section and regression. Test-only source
`515a7c945b6bef136c3ede436577635b17ccd4e2` produces **7 pass / 12 fail**;
the identical 19 cases pass on author fix
`0df0e191e5829e66141d4ba9c028599ce9c91de2`. The bounded affected selection,
including the eight UnlockForm cases, passes **60/60**, and UI typechecking passes.
The [author report](vault-form-admission-generation27.md) describes each
delivered late-response observation and the preserved behavior.

The [independent review](remaining-vault-admission-independent-review-generation27.md)
reproduces the same RED and GREEN counts, passes the affected 60-case selection,
UI typecheck and all 16 source-identity assertions, and identifies no finding.
Its evidence-only commit is `44b17b0e66c26ed5e10830931f4287e112aba18b`.
Unlike the G26 RED run, these RED diagnostics directly record the late download,
Create callback/publication and Restore dispatch/inventory callback outcomes.

| Controlled sequence | Failure observed on unchanged production | Behavior with the guards |
| --- | --- | --- |
| Export duplicate and teardown | The original signal remains unaborted and a late reply produces a controlled download after unmount. | The original controller stays owned and teardown suppresses that download. |
| Create duplicate, Cancel or unmount | A late accepted reply can publish unlocked and call back with the created ID after cancellation. | Cancellation reaches the admitted request and suppresses late output. |
| Restore duplicate while file reads are held | Both reads start; ownership can be lost before runtime dispatch, allowing the original read to dispatch and invoke an inventory callback after teardown. | One original read owns the ref until its body settles; a duplicate cannot replace it. |
| Restore duplicate after runtime admission | Cancel can target the duplicate while the original admitted request survives. | The admitted controller remains the cancellation target. |

Create's accepted-success callback still runs once when an unlocked notification
unmounts the form before the successful awaited result reaches its handler.
Cancellation of a still-pending operation is distinct from that accepted-success
path. Export still requires renewed consent. Original refusal notices, secret
clearing, ordinary cancellation and explicit retries remain covered.

Restore continues to communicate uncertainty and require reconciliation. A
truncated inventory leaves retry disarmed; a complete inventory can permit an
explicit retry without attributing any listed profile to the interrupted
operation. Cancellation does not roll back dispatched storage work. The tested
retry occurs only after the original request settles and reconciliation is
complete. An aborted unresolved file read retains ownership until its `finally`
runs; no pre-settlement replacement behavior is claimed.

These regressions execute maintained transpiled TSX handlers with the actual
AppServices facade and AppRuntime. Hook scheduling, file reads, downloads and
Worker replies are controlled. Correlated fixture replies do not establish
cryptographic acceptance or native browser event reachability. No cooldown,
attempt counter, clock or broader rate policy was added.

## Combined-source qualification

The complete six-command run started at **18:06:31 UTC** and completed at
**18:08:19 UTC on 2026-11-20**. Every command ran at the exact clean
`2a0b26f3392d86c1cd3e056771c59438ece92927` source. The full suite completed
at 18:08:07 UTC; its complete raw output is 253,936 bytes with SHA-256
`dd3c29c48af60a466514b12d2bbc7e4ea45bf4818623e278671dcfd1e802cec1`.

| Command | Actual result |
| --- | --- |
| `npm test` | 2,505/2,505; zero failed, skipped, cancelled or todo |
| `npm run typecheck` | All four TypeScript projects passed |
| `npm run test:build-policy` | 58/58 passed |
| `npm run check:boundaries` | 241 production source files / 148 core modules |
| Default build | 12 files / 795,725 bytes |
| Demo build | 13 files / 807,823 bytes |

Default document/vault-Worker/QR graph membership is **95/30/4** modules; demo
membership is **97/30/4**. The emitted vault Worker remains
`assets/vault.worker-BFynfgnx.js`, 93,535 bytes, SHA-256
`a872b4c6d91e8a8b2178561bdf8a9e1b03035199cca98ad3374f6fe4fc87d044`.
Document bundles change with the four form guards. Both builds retain
`ReleaseEnabled=0`, no signed release or release acceptance, and no configured
connection origin. Static boundaries and graphs do not establish complete
runtime isolation or cryptographic certification.

The coordinator's [combined receipt](qualification-generations26-28.json) and
[retained-log index](retained-logs-generations26-28.json) bind this run to exact
source, commands, times and hashes. The six root logs are retained losslessly;
author and independent records retain their own complete failure and success
outputs. Focused selections overlap the complete suite and each other, so their
counts are not added to 2,505.

## Generation 28: independent aggregate composition review

The [independent composition review](INDEPENDENT_MAIN_COMPOSITION_REVIEW_GENERATION28_20261120.md)
inspects the exact combined source and the completed root logs and artifacts.
Its 119 source checks preserve all 55 prior local-to-published mapping entries,
the expected ancestry, every workflow blob, both frozen regression identities
and the accepted G26 UnlockForm section. Reversing only the four guards and the
one explanatory comment reconstructs PR235's complete `VaultForms.tsx` bytes.

All 362 evidence checks pass. The reviewer rehashes the six complete raw logs,
all 27 emitted files including the two build-evidence files, and all 260 graph
module entries. Graph membership and the native Worker bytes remain exact;
default optional/updater/Solana exclusions remain in force. These are evidence
checks, not 481 additional behavior tests. No composition finding was identified.
The [review receipt](main-composition-independent-review-generation28.json)
retains the exact claims and their limits without rerunning the full suite.

Unchanged tooling, documentation and native-fixture preparation retain their
separate [G24/G25 source-bound qualification](qualification-generations24-25.json).
They were not rerun as additional commands in this six-command batch. No native
browser executed locally. The earlier six-scenario updater fixture remains
implemented with an additive hosted Chromium step, but preparation does not
qualify native Worker/IndexedDB execution. All current-target hosted requirements
remain required for the final aggregate.

## Main-target publication and merge requirements

1. Freeze the complete source/evidence candidate and publish its exact trees and
   ordered ancestry. Retain the local-to-published commit mapping and read back
   the remote branch. Every tested non-documentation entry must remain exact.
2. Open the aggregate against **main**. Read back the actual source, target and
   proposed merge tree/ordered parents. Require all applicable current-source,
   current-main-target gates, including browser, native financial and CodeQL
   qualification. Old stacked-branch results do not waive these requirements.
3. Keep PR233, PR234 and PR235 frozen while the aggregate is owned and qualifying.
   If main changes, reconcile normally and refresh qualification of the actual
   target. Preserve original failures, assertions, timeouts and gate strength.
4. Once qualified, merge with the exact expected source head. Read back main,
   the resulting tree and ordered parents; prove that each original frozen PR
   head is an ancestor before reconciling the contained PRs. Retain all original
   branches and their source-bound evidence.

Update the concrete PR and continuation ownership with actual publication and
gate results. Preserve earlier dated records without creating a succession of
state-only PRs. The original sequential instructions below older overlays are
historical evidence and no longer control this integration plan.

## Remaining scope

Trusted application/wallet/source configuration, native accepted-floor
durability, physical wallet quiescence, trusted activation, actual navigation,
destination startup and cross-origin storage/restore remain separate work.
The default updater remains unconfigured and production trust remains unset.
Supported-locale semantics, assistive technology, physical-device acceptance,
live Wiki publication and full Solana negotiation/funding remain unfinished.
The catalog fixtures remain synthetic; production remains English-only/draft.

Optional PR224–232 and audits 184–186 remain separately owned. Preserve their
histories and default exclusions. Do not repeat unchanged long financial
journeys locally or bypass the managed browser-launch restriction. No deployment,
release, live-funds operation, trust provisioning or default activation follows
from this source consolidation; `ReleaseEnabled=0` remains the active boundary.
