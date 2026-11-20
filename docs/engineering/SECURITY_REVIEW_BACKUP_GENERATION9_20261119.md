# Generation 9 independent backup-verification security review

Date: November 19, 2026, Pacific / November 20, 2026, UTC.

## Result and scope

The current-runtime backup-verification prerequisite passes this independent
review. **No open High or Medium issue was identified in the reviewed five-path
production change.** Three independently written interaction cases passed, and
the combined focused selection passed **40/40**, with zero failures, skips or
cancellations. No production repair was needed during this review.

This is a scoped source and local execution result. It does not qualify an
enabled updater, a browser update UI, production trust, physical devices, native
browser isolation or real IndexedDB. The feature author explicitly kept native
updater-browser composition as the next separate slice.

## Exact source

| Item | Identity |
| --- | --- |
| Consolidated starting source | `7e8f93a02d6ffb98164ed3b09ba3db5b44bd9390` |
| Author's recovered tests | `8067b02` |
| Reviewed author production commit | `74d414312dacbceb35d554aa791be319a326c504` |
| Reviewed complete author tree | `c999c8e9bfeff71a4eeaf0cc23ea9cd2bf783f5e` |
| Independent local mapped source | `6a841d8f8d3790db28926947db1aad8d57c65c70` |
| Independent test commit | `c64b181ba9c0a381986b7e548d72f450c6d7b0f0` |
| Tested source plus independent tests tree | `370dcebdc852b574ef3d71f6eee538e14a04dec9` |

The independently checked-out source tree equals the author's tree exactly.
Only the new independent test is added before this report. The five production
paths reviewed were:

- `packages/schemas/src/runtime.ts`
- `apps/web/src/runtime/pending-metadata.ts`
- `apps/web/src/runtime/app-runtime.ts`
- `apps/web/src/runtime/worker-endpoint.ts`
- `apps/web/src/app-services.ts`

The vault authentication implementation, update controller/HTTP/store, transport
policy, default application entry, Worker entry, build scripts, dependency files
and workflows are unchanged from the starting source. Runtime and schema changes
still require the coordinator's current-source type/build and hosted gates; an
older default artifact's qualification cannot be transferred to this tree.

## Why this slice was needed

The historical browser fixture on `origin/claude/vibrant-cray-ny4gum` calls
`AppServices.verifyBackup` and `AppServices.checkBackupVerification`. Both commands
were absent from the current application boundary even though the maintained
`EncryptedVaultService.verifyBackup` and strict scalar receipt schema already
existed. Restoring the fixture without this prerequisite could not establish the
actual current-backup requirement.

The author selectively added the two commands through the current strict
protocol, document runtime, Worker and facade. The implementation uses the
maintained vault authentication unchanged. It does not introduce an imported
receipt setter, substitute export for authentication, or install an updater key,
gateway, source, route or navigation capability.

## Reviewed security properties

| Boundary | Source evidence and disposition |
| --- | --- |
| File authentication | The Worker calls the maintained vault verifier, which authenticates the supplied complete envelope and passphrase, compares the exact current profile, and rechecks persisted state. Unlock and export alone establish no verification fact. |
| Private authority | The Worker retains the fact with the exact opaque handle, Worker generation and strict scalar receipt. The document sees only public receipt metadata and cannot import that metadata as a new fact. |
| Freshness | Each `checkBackupVerification` calls `assertFresh` before inspecting the saved fact, then compares current profile and revision. A stale/cross-tab row fails instead of being treated as missing or reset. |
| Lifecycle | Lock, selection replacement, disposal, expiry and selected mutation attempts clear the private fact. Existing physical operation admission survives logical cancellation until the underlying operation returns. |
| Current personalization | Save/delete review, set favorite and commit template use current operation names in the invalidation list. Read-only listing, template preview and cancellation do not grant new authority or silently write. |
| Document publication | Both commands use the existing exact-handle/generation publication guard. Successful receipt profiles are independently checked against the pending selected profile. Pending metadata contains no backup bytes or passphrase. |
| Byte ownership | Scalar validation precedes the bounded owned file copy. The document clears its parsed copy after posting; the Worker clears its parsed copy on every dispatch exit, including early refusal. Caller and structured-clone copies are distinct. Universal heap erasure is not claimed. |
| Updater trust | The existing controller remains internal and absent from the default app. Compiled trust, exact broker grants, verified manifest/locator identity, current backup, exclusive wallet lease and explicit user acceptance remain separate required capabilities. |

The trust review also inspected `packages/security/README-UPDATES.md`, the G15
origin/update contract, the current updater source and the historical fixture.
Constructor capabilities are trusted compiled composition; this review does not
claim protection from compromised same-origin executable code or authenticate a
first visit to an unknown gateway.

## Independent cases

`apps/web/test/backup-verification-independent.test.mjs` exercises the real
`EncryptedVaultService`, backup service and Worker endpoint with an in-memory
store. It adds three cases beyond the author's recovered verification tests:

1. A verified complete backup remains current through favorite listing and
   template preview/cancel. A favorite write and then a template commit each
   retire the fact. The preceding backup cannot authenticate the newer revision;
   only a fresh current-file verification restores the fact. Verification adds no
   encrypted-profile write.
2. An explicitly confirmed no-op template commit retires the fact while preserving
   the exact write count. A preview alone preserves it.
3. A real successful freshness read is held before returning to the Worker. Lock
   retires the old response; a new unlock remains `BUSY` until the held operation
   drains. Reopening the same profile then exposes no inherited fact and no extra
   write.

These are additional feature-contract checks, not reproduced product defects.
The separate generation 9 bug reviewer owns document reply ordering and caller
byte/cancellation cases to avoid duplicating this scope.

## Executed verification

Independent selection: **3/3**, zero failures/skips/cancellations, 2,513.528 ms.

Combined selection: **40/40**, zero failures/skips/cancellations, 9,147.061 ms.

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 \
  apps/web/test/backup-verification-independent.test.mjs \
  apps/web/test/backup-verification-runtime.test.mjs \
  packages/schemas/test/backup-verification.test.mjs \
  packages/storage/test/backup-verification.test.mjs \
  packages/security/test/release-update.test.mjs
```

`git diff --check` passed. The unchanged-path comparison listed above returned no
differences. No broad suite, typecheck, build, browser, live network or financial
execution was run by this worker; the coordinator owns those combined gates.

Local logs are under
`/workspace/scratch/6eace968c0df/verification-security-g9/`:

| Log | SHA-256 |
| --- | --- |
| `independent.log` | `c74a1efa09842212f8508798c4ab38af5cdc0cd1a3a2066de9ea8b039752b02c` |
| `combined.log` | `578ae8843cbecc946f482ac2dc027c32e0b508723f83c428c421aac103b6455c` |

## Integration and fresh successor handoff

After integrating the author's source, cherry-pick independent test commit
`c64b181ba9c0a381986b7e548d72f450c6d7b0f0` and this report's commit. No updater
activation, release flag, credentials, workflow or remote reference was changed
by this worker.

The next useful fresh security review should examine the adapted native-browser
composition against the real current backup commands: exact selection ownership
through the intended final lock, real gesture consumption, physical wallet drain,
native accepted-floor durability, verified origin transition, and explicit
fresh-key recovery. It should bind evidence to the actual published source and
keep synthetic local trust clearly distinct from owner-provided production
trust. Repeating these unchanged unit cases would not close that browser and
composition gap.
