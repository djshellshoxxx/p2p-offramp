# Generations 22–23 — runtime backup lease and updater composition

## Result and dated source state

**The runtime now supplies the exact backup-selection ownership required by
the existing updater, and its direct composition is locally qualified.** The
frozen combined source passed **2,470/2,470 tests**, with zero failures, skips,
cancellations or todos. All ten additional qualification commands passed.
This completes the runtime prerequisite; configured application updates remain
unfinished, with `ReleaseEnabled=0` and production trust unset.

| Checkpoint | Exact identity |
| --- | --- |
| Unchanged observed main | `8e836baa877b676a863c877003e277b638fc5061` |
| Published parent, [PR233](https://github.com/djshellshoxxx/p2p-offramp/pull/233) | `92663e46508b06645111d9c713beb82d3a6d1a0f` |
| Verified PR233 proposed merge | `5e31128ad101f0e11df96f1453c0ffd685e5089a` |
| PR233 proposed complete tree | `8a75938288a394e8e7b836eba48bf56bcd98a41d` |
| Fully tested child source | `4cff269483e7372f607a8e994d35ca558d7cff00` |
| Fully tested child tree | `c5f9d82f618a935f24603e2290ecd8c946954d66` |

Eight reviewed source/documentation commits were applied onto the actual
published parent. The child branch is
`codex/runtime-update-continuation-g22-20261120`; it is not yet published or
merged at this checkpoint. PR233's latest recorded snapshot had fourteen checks
queued and Snyk successful. Hosted qualification remains pending for the parent
and the new child. Later PR and source-bound gate receipts supersede this dated
status; neither local success nor an ancestor's checks establish hosted acceptance.

## Runtime capability completed

Generation 22 changes [AppRuntime](../../apps/web/src/runtime/app-runtime.ts)
and the [AppServices facade](../../apps/web/src/app-services.ts), and adds
28 [lease cases](../../apps/web/test/runtime-backup-selection.test.mjs).
The frozen author source is `44b0caef274e52632b509a23c7f1b7c9410c0568`.
Its [author receipt](RUNTIME_BACKUP_LEASE_GENERATION22_20261120.md) and
[independent review](INDEPENDENT_RUNTIME_BACKUP_SELECTION_REVIEW_GENERATION22_20261120.md)
retain the source and actual execution history.

`captureBackupSelection()` returns an opaque frozen lease exposing only
`current`, `requireVerifiedBackup`, `lock` and `dispose`. It captures private
runtime ownership without publishing a handle or counter. Every admitted
unlock/create retires prior ownership before its reply; refused invalid,
already-canceled or busy openings do not invent an admitted selection change.
The existing UI `selectionScope()` remains unchanged.

The one-use lock must receive its exact successful acknowledgment. Currentness
is false while that reply is pending. Another lock, another lease's lock,
admitted opening, invalidation, timeout, closure or disposal cannot become the
original transition. Cancellation retires ownership while an already-dispatched
lock drains; late replies cannot revive it.

Ownership and backup freshness remain separate. Each `requireVerifiedBackup`
invocation uses the maintained Worker-owned fresh check. Export, restore,
supplied receipts and successful locking create no verification authority.
The original missing-capability run failed 25/25; a later intermediate
preflight issue produced two failures among 28 cases and was corrected before
the source freeze. Those outputs remain original development evidence.

## Actual updater composition qualified

Generation 23 adds twelve
[composition cases](../../apps/web/test/update-runtime-composition.test.mjs)
at `2732f5b136987c27639db23f1c7943a278e3fa56`. Its first execution passed
**12/12 without a production change**; no failed baseline or product defect is
invented. The facade directly satisfies the existing controller contract:

```ts
backup: { capture: services.captureBackupSelection }
```

**No additional production backup adapter is needed.** The updated
[updater README](../../packages/security/README-UPDATES.md) describes this exact
binding and its limits. The [composition author report](UPDATE_RUNTIME_COMPOSITION_GENERATION23_20261120.md)
and [independent review](INDEPENDENT_UPDATE_RUNTIME_COMPOSITION_REVIEW_GENERATION23_20261120.md)
record the executed scope and separate README review.

The tests compose the actual runtime, facade, Worker endpoint, encrypted vault
and backup services, updater controller, transport policy and release/locator
signature verification. They exercise two fresh checks around the accepted-floor
write, real vault revision mutation, admitted openings, exact lock acknowledgment,
competing locks, cancellation, physical command drain and destination ordering.
Consumed acceptance cannot repeat; a refused continuation retains an already
recorded floor.

Message delivery is in-process and vault storage is a local fixture. Wallet,
accepted-floor, gesture, HTTP/source and destination ports are controlled.
External fetch is refused and asserted absent. This is Node composition
qualification, with no native Worker/IndexedDB, physical-wallet/device,
browser-activation, origin-isolation or actual navigation claim.

## Combined execution and evidence

Relative to PR233, the implementation changes **two production files and two
new test files**, adding **40 cases**, plus `packages/security/README-UPDATES.md`
and engineering evidence. The one full-suite invocation ran on exact `4cff269`
from 17:03:57 to 17:05:47 UTC. Its decoded log SHA-256 is
`94e370b471f8afafc9f6bf92c3fcc8d22329ebe09e785a53c6442ae7c2a77686`.

| Additional command | Actual result |
| --- | --- |
| `npm run typecheck` | Four projects passed |
| `npm run test:build-policy` | 58/58 passed |
| `npm run check:boundaries` | 241 production sources / 148 core modules |
| Default static build | 12 payload files / 795,831 bytes |
| Demo static build | 13 payload files / 807,741 bytes |
| `npm run test:tooling` | 44/44 passed |
| `npm run check:docs` | Seven documents / 191 links; semantic approval and publication false |
| `npm run check:governance` | Passed |
| `npm run check:specs` | 173 indexed documents; zero broken links or unindexed documents |
| `npm run test:specs` | 32 Python tests passed |

The independent runtime review passed **88/88** focused tests and four
TypeScript projects, with no findings. The independent composition/README review
passed **59/59**, with no findings. These selections overlap the full suite and
are not added to its total. All forty new cases are included in 2,470.

The [combined qualification](qualification-generations22-23.json) and
[retained-log index](retained-logs-generations22-23.json) bind commands, source,
timestamps and exact evidence hashes. Later evidence-only commits must preserve
the tested non-documentation tree. Default updater construction remains absent;
trust, network configuration, optional activation and release policy are unchanged.

## Integration and next work

1. Keep PR233 frozen while its applicable checks execute. Read completed logs
   and actual checkout/tree identities; preserve failed attempts and financial
   assertions. Do not repeat unchanged long local journeys or bypass the managed
   browser restriction.
2. Publish the child with final evidence and verify its remote head/tree against
   the tested source. While PR233 is open, target its branch. After the parent
   merges, retarget to main only after confirming source/tree equivalence and
   revalidating the applicable proposed-merge checks. Do not transfer a pass from
   a different source or target.
3. Merge qualified source using the exact expected head only when current gates
   and review conditions pass. Read back main, tree and ordered parents. Update
   the concrete PR/handoff result; avoid another state-only stamp chain.

F24 still needs the trusted application owner, physical wallet ownership,
source/origin configuration and actual native-browser transition composition.
Owner-controlled trust inputs are not supplied by this lease or its fixtures.
The historical browser adapter must not be revived without current-source
adaptation and qualification. Strict-mode native navigation still needs its
separately accepted profile.

The earlier [generation 21 handoff](CONTINUATION_GENERATION21_20261120.md)
retains locale, documentation and branch-consolidation evidence. Supported-locale
semantic review, physical devices, full Solana negotiation/funding and separately
owned optional PRs remain independent scopes. Preserve their owners and source
branches. No deployment, release, real-funds operation or default optional-package
activation follows from this work.
