# Runtime-owned backup selection lease — generation 22

## Result and exact source

The runtime now provides an opaque backup-selection lease that recognizes one
exact, acknowledged lock of its captured profile. It is a prerequisite for future
trusted update composition. No updater is constructed or enabled by this change.
Independent source review and final integration qualification remain with the
coordinator.

| Checkpoint | Exact identity |
| --- | --- |
| Reviewed generation 21 base | `8419ef138e17a25b56527523d27276cafcdd9037` |
| Original feature-test checkpoint | `235971938bc824b2a031ea4a124aa774492beaf0` |
| Initial implementation | `6273ecbd8aab5c17618754eeb7e4857d0c628e98` |
| Additional preflight test checkpoint | `614e5882a6e759f3d2f76315cb002d2cfa73cec6` |
| Frozen implementation | `44b0caef274e52632b509a23c7f1b7c9410c0568` |
| Frozen implementation tree | `c9512efee5d06da0e3741fbe638388d5ce04a2f5` |
| Branch | `codex/runtime-backup-lease-g22-20261120` |

The implementation changes exactly three paths: two existing source files and
one new test file. All **2,649 other base entries** retain identical modes, types
and object IDs. This evidence follow-up adds documentation and compressed logs
after the frozen source.

## Existing requirement and implementation boundary

[G15 origin and update policy](../../00_PLANNING_AND_THREAT_MODELING/feature_0.3_system_integration/module_0.3.3_release_distribution/spec-ipfs-origin-and-update-policy.md)
requires explicit update acceptance, current backup verification and a locked
transition. The maintained
[`UpdateBackupSelection` contract](../../packages/security/src/release-update.ts)
requires the selection to remain current after its own lock only. Another lock or
selection must retire it. The
[generation 10 report](SECURITY_REVIEW_UPDATER_COMPOSITION_GENERATION10_20261120.md)
and [generation 13 report](SIGNED_UPDATE_UI_GENERATION13_20261120.md) record that
missing runtime capability separately from the already completed UI.

[`AppRuntime.captureBackupSelection()`](../../apps/web/src/runtime/app-runtime.ts)
captures the current opaque handle, protocol generation and a private lifecycle
identity. It returns only `current`, `requireVerifiedBackup`, `lock` and `dispose`.
[`AppServices.captureBackupSelection()`](../../apps/web/src/app-services.ts)
exposes that capability without exposing the handle or a lifecycle counter.
Its structural interface matches the existing updater selection contract; the
runtime imports no updater constructor, store, HTTP reader or navigation code.

The private identity changes on every admitted unlock/create and every runtime
invalidation. An admitted opening retires the old lease before a response,
including a same-profile reopen or an eventual authentication failure. Refused
invalid, already-cancelled or busy opening commands do not count as an admitted
selection. The existing `selectionScope()` UI counter is unchanged.

An owned lock records its expected identity before dispatch, follows the existing
lock command path, and awaits its actual matching acknowledgment. Currentness is
false while that acknowledgment is pending. A second lock, selection change,
timeout, closure or disposal cannot be adopted as the original transition. The
one-use lease cannot issue a second lock or adopt another lease's lock.

Cancellation during a dispatched lock retires the lease while the real command
drains; it neither undoes the lock nor manufactures acknowledgment. Lease
disposal is idempotent and does not itself send a vault command. Ordinary runtime
lock, cancellation, idle expiry, pagehide and Worker closure retain their existing
ordering and behavior.

`current()` proves selection ownership, **not backup freshness**.
`requireVerifiedBackup()` calls the existing Worker-owned freshness operation on
every invocation. Missing verification refuses with the existing fixed runtime
`CONFLICT` error. Export, restore, a supplied receipt or a successful lock cannot
create backup authority. Fresh verification is available only before the owned
lock, while its captured profile remains selected.

## Actual execution

The new [feature suite](../../apps/web/test/runtime-backup-selection.test.mjs)
exercises observable ownership, command admission and responses using controlled
message ports. Two cases additionally compose the real Worker endpoint,
`EncryptedVaultService` and `EncryptedBackupService` with an in-memory store and
the maintained encrypted fixture.

| Execution | Result |
| --- | --- |
| Original feature cases against unchanged implementation | **25 tests: 0 passed, 25 failed** because the capability was absent |
| Initial implementation, same cases | **25/25 passed** |
| Three additional ownership/cancellation cases on checkpoint `614e588` | **28 tests: 26 passed, 2 failed** |
| Corrected implementation, dedicated feature suite | **28/28 passed** |
| Eight affected runtime, facade, backup and updater-view/controller suites on exact `44b0cae` | **113/113 passed** |
| TypeScript on exact `44b0cae` | All **four** projects passed |
| Build-policy tests on exact `44b0cae` | **58/58 passed** |
| Static import boundaries | **241 production sources / 148 core modules** |
| Default artifact build and complete base-to-source whitespace check | Passed |

Every successful test selection has zero failures, skips, cancellations and todos.
The dedicated 28 cases are included in the 113-case selection; counts are not
added across executions. The original 25-case failures are missing-feature
evidence, not 25 separate implementation defects.

The two later failures concern one intermediate implementation issue: a supplied
runtime clock can observe cancellation during synchronous preflight. The initial
implementation did not recheck that cancellation before command admission or
lease retirement. Both unchanged tests passed after two explicit cancellation
checks were added. This is local development evidence for this new capability;
it is not a claim of an existing financial exploit.

The final six-command qualification ran from **2026-11-20T16:47:17Z to
2026-11-20T16:47:35Z** on exact committed source `44b0cae`, using Node `v24.22.3`.
The receipt distinguishes earlier executions of uncommitted, subsequently frozen
bytes from executions of an already committed checkpoint.

## Default build isolation

The actual default build contains **12 payload files / 795,831 bytes**, plus its
separate local evidence metadata file. The document, vault-Worker and QR-Worker
graphs contain **95 / 30 / 4 modules**. Every recorded graph-source and payload
digest was checked against the actual local files.

All three graphs contain zero executable updater modules and zero advanced
optional-package imports. The default update panel remains unconfigured.
`ReleaseEnabled=0`, `signedRelease=false`, `releaseAcceptance=false`, empty
`connectOrigins` and CSP `connect-src 'none'` remain in the actual build evidence.

Packages, Worker commands and implementation, schemas, vault cryptography,
updater/controller code, wallet ownership, navigation, trust configuration,
catalogs, dependencies and workflows are unchanged. This lease does not select a
key, endpoint, gateway or provider and does not grant release authority.

## Retained evidence and remaining scope

The [machine receipt](runtime-backup-lease-generation22.json) records source blobs,
commands, UTC execution times, default artifact graphs and **11 retained logs**.
Each log is gzip-compressed without modifying its original bytes and has both
compressed and decoded SHA-256 hashes and lengths. The original failing outputs
are retained alongside successful results. Logs are under
[`docs/execution/runtime-backup-lease-generation22-20261120/`](../execution/runtime-backup-lease-generation22-20261120/).

No full repository suite, native browser/IndexedDB, physical device, configured
updater, origin transition or long financial journey was executed in this worker
scope. Real endpoint tests with a controlled port and in-memory store are not
native Worker/browser claims. No remote refs were changed or published.

The coordinator must independently review this frozen source and qualify its
final composition. A later updater adapter, trusted constructor inputs,
physical-wallet ownership and current-source browser origin-transition evidence
remain separate work. The historical browser adapter was not revived. Production
trust, release and deployment remain disabled.
