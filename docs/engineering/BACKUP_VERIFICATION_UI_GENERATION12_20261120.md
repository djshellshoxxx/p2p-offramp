# Generation 12: explicit backup verification in Recovery

November 19 Pacific / November 20 UTC, 2026.

## Result and provenance

The current runtime already authenticates a complete backup file against the
selected profile, but the Recovery page had no interface for that operation.
This feature restores the historical backup-verification form and connects it to
the current AppServices boundary. The user can select a saved file, supply its
passphrase, authenticate it without a profile write, and explicitly recheck the
Worker's stored verification fact.

| Source | Exact identity |
| --- | --- |
| Current core parent | `d30152336bb687b31ae547ab3fcecb8835a02ef4` |
| Historical form donor, PR81 | `a45e932a37153590bc329c1e9012cf18e37fe12c` |
| New feature source | `358868f673f7a71ea09764752dcbaaed87f53dc0` |
| New feature tree | `0c1824c69baccfdaee5869b9b850420dee31e12d` |

The donor path is `apps/web/src/ui/BackupVerificationForm.tsx`. Only that form
was selectively recovered; historical runtime, update routing and trust logic
were not imported. The current form uses the maintained bounded file importer,
current selection subscriptions and layout cleanup. The form is composed in
`Pages.tsx`; existing locale strings and control help are reused unchanged.

This is feature completion. It is not another reproduced defect or a completed
signed-update UI. It adds no wallet, network, transaction, release, trust-key or
navigation capability. Export remains labelled unchecked. Default release
activation, static CSP and all existing CI commands and assertions remain.

## Implementation contract

- Authentication starts only when the user submits the selected file and
  passphrase. Rendering, navigation, export and restore cannot establish a
  verification fact.
- The existing file importer checks advertised and actual file size, holds one
  physical import admission until work settles and clears its owned buffer.
  The form clears the password and file inputs when work begins.
- A synchronous request reference rejects duplicate submissions before React
  commits disabled controls. No retry or polling is introduced.
- The displayed result contains the authenticated profile, revision and two
  digests returned by the existing validated service. It is explicitly a
  point-in-time check; it does not become update or spending authority.
- Recheck calls the Worker without supplying a receipt, revision or readiness
  boolean. An absent or refused fact clears the earlier displayed result.
- Form unmount, lock, profile replacement and facade replacement retire pending
  work and clear local display and inputs. Late results must still match the
  exact service owner, selection scope and selected profile.
- Fresh-key restore creates a separate profile. Its original source file does
  not qualify as a current backup of the new profile; that profile needs its own
  export and explicit authentication.

The README now gives those separate export, authentication and restore steps.
The new `test:backup:browser` command is added to the existing foundation browser
job after the diagnostics command and before the recovery-reference command.

## Executed checks and limits

| Check | Actual result |
| --- | --- |
| New UI tests | 14/14 passed |
| Combined UI/runtime/schema/storage backup selection | 40/40 passed; includes the 14 UI tests |
| Existing document content-policy tests | 11/11 passed |
| Existing build-policy suite | 57/57 passed |
| Existing TypeScript projects | All four passed |
| Import boundaries | Passed: 239 production sources and 143 core entry modules |
| Default and demo builds | Passed: 13 and 14 output files |
| Documentation consistency | Passed; semantic approval remains false |
| Whitespace and browser-fixture syntax | Passed |
| Native browser journey | Blocked before Chromium execution |

All completed test runs above had zero failures, skips, cancellations and todos.
These are separate scopes; their counts are not summed. The UI tests execute
the maintained TSX handlers and bounded importer with controlled facade replies.
They are not native-browser or native-persistence acceptance.

Both built document graphs contain the new form, with 94 default and 96 demo
modules. The private Worker graphs contain 30 modules each, and the QR graphs
contain four. All six graphs contain zero imports from the nine optional
packages. Both builds retain `ReleaseEnabled=0`, `signedRelease=false`,
`releaseAcceptance=false`, empty connection origins and `connect-src 'none'`.
The feature intentionally changes the document bundle; artifact identity with
the previous core is not claimed.

The actual browser attempt successfully built the unchanged product source,
then Chromium failed at startup with `socket() failed: Operation not permitted`
in `process_singleton_posix`. No browser journey executed and no environmental
restriction was bypassed. The final fixture's restore selectors were then
reconciled with the existing locale source and its syntax was checked. Its
current exact source still requires hosted execution.

The browser fixture uses the emitted default app, actual module Worker and
IndexedDB. Its intended checks cover explicit file authentication, exact file
digest, wrong passphrase, explicit recheck, lock/reload, independent fresh-key
restore verification and 320/768/1440-pixel layouts. Wallet prompts and off-origin
requests must remain zero. These remain pending assertions until the fixture
executes successfully.

A first developer build invocation used the unsupported profile name `default`
and correctly failed with `UNSUPPORTED_BUILD_PROFILE`. The invocation was
corrected to the existing `meta` profile; no product code or gate was changed.
The failed invocation log is retained separately.

## Reproduction and handoff

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 \
  apps/web/test/backup-verification-ui.test.mjs \
  apps/web/test/backup-verification-runtime.test.mjs \
  apps/web/test/backup-verification-publication.test.mjs \
  apps/web/test/backup-verification-independent.test.mjs \
  packages/schemas/test/backup-verification.test.mjs \
  packages/storage/test/backup-verification.test.mjs
node --import ./scripts/test-support/register-tsx.mjs --test apps/web/test/content-policy.test.mjs
npm run typecheck
npm run check:boundaries
npm run test:build-policy
npm run build
npm run build:demo
npm run check:docs
npm run test:backup:browser
```

The [machine evidence](backup-verification-ui-generation12-evidence.json) records
source identities, output hashes and source-scoped results. Raw author logs and
complete artifact graph evidence remain in the shared workspace under
`/tmp/p2p-g12-backup-*`; the machine record includes their hashes. No complete
repository suite, independent-review clearance or hosted result is attributed
to this author report. The coordinator owns independent review, full final-source
qualification, publication and any source merge. No remote ref was changed by
this worker.
