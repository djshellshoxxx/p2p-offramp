# Independent backup-notice locale review — generation 20

## Decision and exact source

No actionable finding was identified in the bounded backup-notice change at
`c5908d04c4216fcfbf24485070f81ce7f5bfc440`. The review and executed checks below
apply to that immutable source, not to an unreviewed later composition or a
production translation. This report is a separate documentation-only commit.

| Identity | Value |
| --- | --- |
| Reviewed source commit | `c5908d04c4216fcfbf24485070f81ce7f5bfc440` |
| Reviewed source tree | `9875959aa4eaf94ffeddf60816e7efafee774ca7` |
| Exact parent/main snapshot | `388526a474aea0e08f9c04178c2b7f9e1d4bee3f` |
| Author branch | `codex/locale-state-completion-g20-20261120` |
| Independent review branch | `codex/backup-locale-independent-review-g20-20261120` |
| Review environment | Node `v24.22.3`, isolated Git worktree with a physical dependency directory |

The parent and reviewed tree each contain 2,576 entries. Exactly two files
change; all 2,574 other entries retain their modes, object types and object IDs.

| Changed file | Parent blob | Reviewed blob |
| --- | --- | --- |
| `apps/web/src/ui/BackupVerificationForm.tsx` | `b22ef6fc72c2b397e49fa912c23e8e4173134a88` | `3265f97cacbf09326169546d77577a08ae3ea0f5` |
| `apps/web/test/backup-verification-ui.test.mjs` | `8d620f4e11cc435408e413398cf1bcec17eeda0b` | `6336e69bea30828160f4310361bf31329685c49d` |

## Reviewed behavior

The previous form resolved a localized message when it created a notice. Its
stored string could therefore remain in the previous language after an explicit
compiled fixture selection caused the application to render again. The fix
stores a restricted existing message key or a `RuntimeErrorCode` and resolves
the display text during rendering through the maintained catalog and error
mapper.

The change preserves each notice's status/alert role and its existing message
choice, including the distinction between a backup-verification revision
mismatch and a general recheck conflict. File/passphrase handling, the bounded
importer, request admission, abort signals, generation checks, profile/selection
ownership, scope retirement, and receipt visibility conditions are unchanged.
It adds no service invocation when the locale changes. Receipt profile,
revision and digest values continue to come from the returned receipt; the
digest display retains its explicit left-to-right isolation.

Integration inspection confirmed that `App.tsx` already subscribes to the
locale store and renders Recovery on selection updates. Static message views
retain live getters, and `errorMessage` resolves the current fixed catalog
entry. The backup form's `[services, scope]` retirement effect does not gain a
locale dependency, so a display change does not cancel or repeat a pending
verification/recheck.

`SignedUpdatePanel.tsx` is unchanged at blob
`d7f1396909945b60d57436468a64c65ce5897e90`; the regression checks for unconfigured
panels owning no global visibility/pagehide listeners still pass. The production
locale composition is unchanged at blob
`297db783fad41cf4a79303988d661beecb45d8fe`: it supplies only the draft English
source and no alternate language fixtures. No workflow, dependency, release,
trust, claims, evidence approval or funds configuration changes.

## Independently executed checks

Both commands ran from the isolated review worktree at the exact reviewed
source, before adding this report.

```sh
node --import ./scripts/test-support/register-tsx.mjs --test \
  apps/web/test/backup-verification-ui.test.mjs \
  apps/web/test/signed-update-ui.test.mjs \
  apps/web/test/locale-runtime.test.mjs \
  apps/web/test/locale-selector.render.test.mjs \
  apps/web/test/locale-source.test.mjs \
  apps/web/test/locale-catalog.test.mjs \
  apps/web/test/locale-stress.test.mjs
npm run typecheck
```

| Check | Actual result |
| --- | --- |
| Seven focused Node suites | Exit 0; 83 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo |
| Backup-verification UI cases within those suites | 26 passed, including nine added locale cases |
| All four TypeScript projects | Exit 0 |
| `git diff --check` against the exact parent | Exit 0 |
| Complete tree comparison | Exactly the two files listed above change |

The added cases exercise missing and oversized files, revision mismatch,
authentication refusal, absent verification, recheck refusal, ordinary I/O
failure, cancellation with a late result, and selection changes during a
pending recheck. They check that existing notices change language without
repeating reads or service calls, pending work retains its ownership, canceled
work cannot display a late receipt, and canonical digest strings stay exact.

The fixture build bundles the actual locale runtime, message views and error
mapper in memory. Its complete alternate fixture marks English source text as
draft and assigns a right-to-left locale for functional selection checks. This
is explicitly a development fixture, not an Arabic translation or approval;
each exercised snapshot remains `fundsLocaleEligible: false`.

## Limits and follow-on scope

This is an independent source review with executed Node and TypeScript checks.
The maintained TSX handler harness controls the service facade and rendering
hooks. It does not establish actual browser layout, assistive-technology,
physical-device, native Worker/IndexedDB or production translated-copy
acceptance. No local browser launch or repeated long Solana native/browser
journey was performed. Applicable hosted checks remain an integration gate.
The author-reported baseline failure run was not independently repeated here.

Separate source inspection found that `App.tsx` still stores resolved command
notice/pending strings and compares a pending label with `m.locking`. That
existing application-level locale state is outside this two-file patch and was
not modified or qualified in this review. It is a bounded follow-on engineering
candidate, not a finding introduced by this change.

`ReleaseEnabled=0` remains the project constraint. This review grants no locale
semantic approval, release authorization, update trust, wallet configuration
or authority to transact.
