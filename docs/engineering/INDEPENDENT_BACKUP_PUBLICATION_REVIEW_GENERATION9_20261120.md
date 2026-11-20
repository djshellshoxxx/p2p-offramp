# Independent backup publication review — generation 9

Reviewed November 19 Pacific / November 20 UTC, 2026.

## Result and scope

No additional product defect was found in this review of the new backup-verification document boundary.
Five independent publication, cancellation and byte-ownership cases pass. The combined focused selection
passes **39/39 tests**, with zero failures, skips or cancellations. No production source was changed by this reviewer.

This is a bounded review of the F24 prerequisite: current-runtime `verifyBackup` and
`checkBackupVerification` wiring. It does not complete or qualify the asset-update UI, provide update
trust configuration, or authorize a release. Favorites/templates mutation invalidation and held native
freshness checks belong to the separate generation 9 security reviewer.

## Source identity

| Reference | Identity |
| --- | --- |
| Frozen core base | `7e8f93a02d6ffb98164ed3b09ba3db5b44bd9390` |
| Author contract tests | `8067b025e6f9ef329370a4606311a39baf3c274a` |
| Author implementation | `74d414312dacbceb35d554aa791be319a326c504` |
| Author implementation tree | `c999c8e9bfeff71a4eeaf0cc23ea9cd2bf783f5e` |
| Equivalent local review source | `54fddf24545b0d588d00ed602937caff96dce082` |
| Independent test commit | `5a8c6bce00ea5879d15ebf9a4b70d81c52bd768e` |
| Tested tree including independent tests | `96c4e0bb49155b3f6775ad00b371aed9fbfa09f1` |

The local review source is a scoped cherry-pick of the two author commits and has the identical
implementation tree. Git comparison confirms all production bytes still match the author implementation.
Only this report and `apps/web/test/backup-verification-publication.test.mjs` are reviewer deliverables.

## Independent cases

The controlled test port exercises the actual `startAppServices` and `AppRuntime` implementation.
It deliberately returns public fixture receipts; it is not a substitute for file authentication.

| Case | Actual observation |
| --- | --- |
| `verifyBackup` reply delivered before same-profile replacement unlock | A replacement selection made after message settlement but before async publication causes `LOCKED`; the valid-looking old receipt is not returned. Both unlocks use the same protocol generation, so profile ID/generation equality alone cannot satisfy this case. |
| `checkBackupVerification` under the same ordering | The wrapper receipt is likewise retired; the replacement selection remains available. |
| Typed check receipt names another profile | The document closes with `PROTOCOL_ERROR` before returning verification. This covers the check wrapper separately from the author's direct verification receipt test. |
| Cancellation, reopened profile, and delayed old verification result | Cancellation immediately locks the document; the old result cannot settle a pending check in the newer generation. The current check independently returns null. No verification retry occurs. |
| Synchronous `postMessage` failure | The document returns `STORAGE_UNAVAILABLE`, closes once, wipes its parser-owned bytes, preserves caller-owned bytes, and makes no retry. |

The cancellation case also proves that synchronous posting captures an independent byte snapshot
before caller reuse. The parser-owned command copy is zeroed after posting; the transport snapshot is
intact and the original caller buffer remains under caller ownership. These are concrete memory-object
observations, not a claim of physical erasure of browser or operating-system copies, strings, or storage.

The author tests separately exercise real Web Crypto and the maintained storage/service composition
over controlled in-memory storage. This review ran those tests together with the independent cases;
it does not relabel the author's tests as newly independent evidence.

## Executed verification

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 \
  apps/web/test/backup-verification-publication.test.mjs \
  apps/web/test/backup-verification-runtime.test.mjs \
  apps/web/test/app-runtime.test.mjs \
  packages/schemas/test/backup-verification.test.mjs \
  packages/storage/test/backup-verification.test.mjs
```

Result: **39 passed; 0 failed; 0 skipped; 0 cancelled**, duration 11,199.547825 ms.

Log: `/workspace/scratch/6eace968c0df/verification-bug-hunt-g9/affected-final.log`.

SHA-256: `a4be0e06d0cd63eaf6d54186e6eae629dee761250396ced14d5aced85c0c306f`.

`git diff --check` passes. The five production paths remain byte-identical to author commit
`74d4143`. Workflows, dependency manifests and lockfile are unchanged from the frozen base. Static
source lookup finds no `release-update` import in `apps/web/src` or the security public facade.
This lookup is not emitted-graph or runtime-isolation evidence.

## Limits and successor handoff

No new High, Medium or Low defect was identified within this document publication scope. This does
not establish a whole-application security clearance. Native Worker isolation, native IndexedDB,
real browser event scheduling and actual update UI are not exercised by the controlled port.
No browser, broad full-suite, typecheck, build, network, deployment or financial qualification was run
by this reviewer. Those gates must be bound to the final integrated feature source by the coordinator.

A fresh successor should qualify the completed current-runtime backup-verification path in the actual
permitted browser composition, including native message cloning and profile retirement during a held
receipt. It should then review any update controller/UI adapter against this precise Worker-owned fact
and explicit current-revision check. Repeating these unchanged document unit cases cannot supply that
missing native-browser or trust-composition evidence.
