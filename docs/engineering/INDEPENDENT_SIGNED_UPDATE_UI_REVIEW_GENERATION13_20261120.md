# Independent signed-update UI review — generation 13

## Source and decision

Reviewer: `signed_update_ui_review_g13`. Review date: 2026-11-20 UTC.

The bounded optional view implementation has **no actionable source finding**
under either the Standards or Spec axis. This decision covers the UI projection
and its ordinary lifecycle behavior. It does not qualify a configured update
transition or complete F24.

| Identity | Commit or tree |
| --- | --- |
| Reviewed base | bad3b708bb6528cfdc7b1e65e8f29727ad4bbe6e |
| Reviewed author source | 723b8d105a185f3c84130d1ccd5c9a907ff13153 |
| Reviewed complete source tree | 5813c5bbc09900698ce7a79ca44383adb149c8e8 |
| Independent test-only commit | 12729ba1e895d68a0a5417c96b83673eea14b9c6 |
| Independently tested tree | 92a10d92ee70d9246e0dfd12e626e8c277448577 |

The author's eight-file change adds a panel, English catalog entries, a type-only
facade, optional App/Settings injection, and tests/import-boundary registration.
This review adds three ordinary UI tests. No production source correction was
needed. The review worktree uses its own physical dependency copy and makes no
remote mutation.

## Standards

**No actionable finding.**

The [G07 frontend architecture](../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.3_frontend_shell/spec-static-frontend-architecture.md)
requires public package interfaces, injected side-effectful services, explicit
commands and preserved default build boundaries. The new `update-view.ts`
facade exports types only. It emits no constructor or trust, transport, storage
or navigation implementation. The existing private updater path remains refused
by the import-boundary test.

The actual default entry, `OfflineRoot.tsx`, supplies no updater. App and Settings
default the optional dependency to null. Rendering performs no check, acceptance
or network operation. The supplied owner retains disposal, exact backup selection,
wallet quiescence, route and trust responsibilities.

The component uses fixed localized status copy and critical reviewed metadata
for consent/recovery text. Its public identity values use left-to-right isolated
text; destination and asset paths are not links. It retains the original opaque
candidate and invokes acceptance synchronously from the direct click task,
before the first await. The controller still owns its separate real gesture check.

No Fowler heuristic justified a source change in this bounded diff. Automated
style/type/boundary results are recorded separately below.

## Spec

**No actionable finding within the assigned partial UI scope.**

The [G15 update design](../../00_PLANNING_AND_THREAT_MODELING/feature_0.3_system_integration/module_0.3.3_release_distribution/spec-ipfs-origin-and-update-policy.md)
calls for a review of current/candidate fingerprints, schema compatibility,
recovery requirements and known changes before a user-confirmed transition.
The view displays every field available in the maintained review interface:
current sequence/digest/key, candidate release ID/sequence/digest/key/source
commit/predecessor, schema bounds, full destination, and asset paths/byte
lengths/digests. It explicitly explains that signed human change notes are absent,
fresh-origin local sequence limits, separate storage and fresh-key restore.

Check, review, consent and confirm are separate UI actions. A fresh check retires
the prior review and consent. Synchronous admission prevents duplicate dispatch
before React renders. Explicit discard, document hide, pagehide, route unmount
and controller replacement abort the UI request, call cancellation and reject
late UI results. Disposal remains with the injected owner.

A profile lock does not by itself cancel this panel: acceptance intentionally
locks its own selection before navigation. The existing controller and its
external exact-selection lease retain that authority. This review does not
provide or validate the unresolved exact-own-lock backup adapter.

The task deliberately stops before trusted composition. Unknown release keys,
sources, destination policy, wallet/backup adapters and a configured transition
remain outstanding. The old feature matrix's main-branch inventory is historical;
this report does not change it to imply full completion.

## Independent execution

| Execution | Result |
| --- | --- |
| Maintained UI suite, including three independent additions | 23/23 |
| UI plus five locale suites, including the same 23 UI cases | 55/55 |
| Import-boundary tests | 15/15 |
| Four TypeScript projects, invoked by the default build | Passed |
| Default static build | Passed |
| Source boundaries | Passed; 241 production files, 148 core modules |
| Whitespace | Passed |

All three test invocations had zero failures, skips, cancellations and todos.
The counts overlap and are not summed. No full repository suite was run by this
reviewer.

The three added cases check:

1. Replacing a controller after a completed review removes the candidate and
   requires a new check and fresh consent.
2. Ordinary synchronous check failure and asynchronous acceptance failure settle
   the UI, retain fixed copy and permit a later explicit check.
3. Pagehide during pending acceptance retires its displayed result; late success
   neither appears as accepted nor dispatches another acceptance.

These are synthetic controller/component tests and server-rendered markup checks.
They do not establish browser user activation, wallet behavior, IndexedDB
isolation, backup verification or successful origin navigation.

## Actual default build evidence

The reviewer built the unchanged production source independently, then inspected
the emitted graph records and every output file.

| Emitted graph | Modules | New panel | Updater/facade runtime modules |
| --- | ---: | --- | ---: |
| Document | 95 | Present | 0 |
| Native vault Worker | 30 | Absent | 0 |
| QR Worker | 4 | Absent | 0 |

The type facade and all `release-update` controller/HTTP/store modules are absent
from all three runtime graphs. Actual output contains 13 files; the build's
12-file scan excludes its final evidence document. The scanned asset bytes total
794,354. Default evidence retains `ReleaseEnabled=0`, `signedRelease=false`,
`releaseAcceptance=false`, empty connection origins and CSP `connect-src 'none'`.

The [portable review receipt](signed-update-ui-independent-review-generation13.json)
records commands, source identities, log hashes, graph observations, unchanged
implementation blobs and hashes for all 13 emitted files.

## Qualification limits and integration

No browser was launched in this review. No Chromium, Firefox, WebKit, Safari,
physical-device, real user-activation or configured update qualification is
claimed. The managed local browser socket restriction already observed by the
coordinator remains a separate limitation. This review did not attempt to bypass it.

The generation10 exact-own-lock backup adapter remains a configuration blocker.
The updater runtime, trust root, endpoints, wallet/backup interfaces and navigation
policy are unchanged. No release, deployment, real-fund action or default optional
activation follows from this view review.

Integrate the test-only commit and this evidence with the reviewed author source.
Keep applicable source-bound CI and eventual configured browser/runtime gates.
Standards findings: **0 actionable**. Spec findings in the bounded scope:
**0 actionable**. Full F24 remains partial.

