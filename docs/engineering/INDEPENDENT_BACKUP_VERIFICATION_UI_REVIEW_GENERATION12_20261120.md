# Independent backup-verification UI review — generation 12

## Source and decision

Reviewed implementation: `358868f673f7a71ea09764752dcbaaed87f53dc0`, tree
`0c1824c69baccfdaee5869b9b850420dee31e12d`, based on combined core
`d30152336bb687b31ae547ab3fcecb8835a02ef4`. Historical form provenance is
`a45e932a37153590bc329c1e9012cf18e37fe12c`. The later author checkpoint
`a812ede2e3768d4fb305155edbe88a98147c5aba` adds only its report and evidence.

**No open High/Medium or other actionable integration finding was identified
within this review's scope.** Source admission remains conditional on applicable
exact-source hosted checks, including the newly added native browser journey.
This review does not claim general product security certification or completion
of physical-device, translation, distribution, or release qualification.

## What was checked

The recovered form calls the current AppServices methods and leaves the current
Worker, vault service, message schemas, crypto and release-verification primitives
unchanged. Its Recovery wiring adds explicit file authentication and explicit
revision recheck; rendering or navigation starts neither operation.

The document reads through the maintained bounded-import service, uses its
physical admission and owned-buffer cleanup, clears password/file controls on
submission, and guards same-turn duplicate operations with a request ref. A
cancelled physical import retains its admission until the underlying work drains.
Selection changes, facade replacement, lock and unmount abort pending work, clear
controls and invalidate late replies. Receipt visibility binds both facade
identity and selection scope, as well as the selected profile.

The display uses the existing point-in-time wording and explicit scope limits.
Only `checkBackupVerification` obtains a freshly checked Worker fact; no displayed
receipt is consumed as transaction, navigation, update or restoration authority.
Existing locale messages and labels, named form/region, busy and alert/status
semantics, file help, cancellation control and digest direction isolation were
reviewed. Keyboard, rendering and viewport assertions in the browser fixture still
need actual hosted execution; source inspection does not establish device acceptance.

The browser fixture uses the emitted offline app and native Worker/IndexedDB,
checks exact file digest, explicit recheck, wrong passphrase, lock/reload,
fresh-key restored profile ownership, no wallet prompts and three viewport widths.
The package command and existing browser job addition preserve all previous steps.
The original source form is adapted rather than its older runtime/trust code being
imported. No optional package, endpoint, trust root or financial path is activated.

## Executed evidence

| Scope | Result |
| --- | --- |
| Maintained UI/runtime/storage selection | 39/39, zero failures or skips |
| Three additional independent lifecycle cases | 3/3, zero failures or skips |
| Maintained UI file after appending those cases | 17/17, zero failures or skips |
| TypeScript | All four configurations pass |
| Import boundaries | 239 production files / 143 core modules pass |
| Default and demo builds | 13 and 14 output files; both pass |
| Browser harness syntax / whitespace | Pass |

These test scopes overlap and must not be summed. The three independent cases
are appended to `apps/web/test/backup-verification-ui.test.mjs` in this review
commit, using the existing harness rather than duplicating it. They cover an
ordinary delayed file read followed by a selection change, two same-turn recheck
events, and cancellation retaining physical admission until service completion.
They add no production-code change.

Both fresh build graphs include `BackupVerificationForm.tsx` only in the document
graph, not the private Worker or QR decoder graph. All nine optional packages stay
absent. `ReleaseEnabled=0`, `releaseAcceptance=false`, empty connection origins
and CSP `connect-src 'none'` remain. Exact source, artifact and log SHA-256 maps are
in `backup-verification-ui-independent-review-generation12.json`.

The initial reviewer wrapper used an incorrect QR graph filename after the
default build had succeeded. It stopped with ENOENT. The corrected wrapper used
the maintained `qr-graph-worker.json`, reused the completed default output and
built demo successfully. This is a reviewer-script correction, not a product
finding. Both raw logs are retained and hashed.

The author observed local Chromium launch refusal (`socket() failed: Operation
not permitted`). This reviewer neither repeated nor bypassed that restriction.
**No local browser execution is claimed.** The added exact-source hosted browser
step remains mandatory; native Solana/EVM gates are separate source evidence.

## Reproduction and continuation

From the reviewed checkout, with its physically installed lockfile dependencies:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test apps/web/test/backup-verification-ui.test.mjs apps/web/test/backup-verification-runtime.test.mjs apps/web/test/backup-verification-publication.test.mjs apps/web/test/backup-verification-independent.test.mjs packages/storage/test/backup-verification.test.mjs
npm run typecheck
npm run check:boundaries
npm run build
npm run build:demo
node --check scripts/test-backup-verification-browser.mjs
```

The original 39-test run used the author's 14-test UI file. The UI file in this
review adds three cases, so a future combined affected run has three additional
tests; do not relabel the earlier result. On a permitted browser runner execute
`npm run test:backup:browser` with `P2P_CHROMIUM` naming its installed Chromium.

Parent owns integration and publication. Verify the combined source identity,
retain these independent tests, preserve the original component branches and
all release/financial gates, and read completed hosted receipts before main merge.
