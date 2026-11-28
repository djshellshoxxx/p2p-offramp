# Generation 20: live locale display for backup verification notices

November 20, 2026 UTC.

## Result and exact source

The backup-verification form now keeps existing message keys or runtime error
codes in notice state and resolves their copy during rendering. Explicitly
changing a compiled development locale therefore updates a completed notice
alongside the form's labels, without repeating verification or recheck.

The default build still contains only the draft English source. This change
completes one supported development-fixture display behavior; it does not add
a translated locale or finish F19's human translation and accessibility work.

| Identity | Value |
| --- | --- |
| Merged main base | `388526a474aea0e08f9c04178c2b7f9e1d4bee3f` |
| Frozen implementation commit | `c5908d04c4216fcfbf24485070f81ce7f5bfc440` |
| Frozen implementation tree | `9875959aa4eaf94ffeddf60816e7efafee774ca7` |
| Local branch | `codex/locale-state-completion-g20-20261120` |
| Implementation paths | `apps/web/src/ui/BackupVerificationForm.tsx`; `apps/web/test/backup-verification-ui.test.mjs` |

Source was frozen before this separate documentation and evidence change.
Independent review is recorded separately by the coordinator and reviewer;
this author report does not grant semantic or release approval.

## Confirmed gap and bounded correction

The localization specification requires interface text, errors, receipts and
accessible labels to use the selected catalog. The maintained locale runtime
already permits explicitly compiled, complete draft fixtures, and `App` subscribes
to its selection. Its message views use live getters. The production composition
has no alternate locale configured.

`BackupVerificationForm` previously stored resolved strings when an action
completed. Rerendering after an explicit development-fixture selection changed
labels and receipt copy but left those notice strings in the previous catalog.
The new ordinary UI tests reproduced eight stale notice cases against the base
implementation: missing file, oversized file, revision mismatch, authentication
refusal, absent verification, recheck refusal, an ordinary file-read failure and
cancellation.

The correction stores one of the five already-defined backup message keys or
an existing `RuntimeErrorCode`. Rendering uses the existing message view or
`errorMessage` mapping. Existing notice roles, severity, wording and fallback
mapping remain exact. Verification conflicts retain their specific backup
mismatch copy; recheck conflicts retain the existing runtime error copy.

`SignedUpdatePanel` already stores semantic notice kinds and codes and resolves
them at render time. It required no source change. Its null-controller default
and the PR220 lifecycle correction remain intact.

There is no change to file admission, passphrase and byte clearing, duplicate
submission handling, aborts, selection scopes, service ownership, receipt
identity, late-result retirement, controller authority or build composition.
Catalogs, approval records, trust configuration, network and wallet capabilities,
and acceptance gates are unchanged.

## Ordinary regression coverage

The maintained handler test harness still executes the actual TSX handlers and
bounded importer with controlled service replies. The added tests use an
in-memory Vite build of the actual locale runtime, message views and error mapper.
Only that test build replaces `bundled.ts` with one complete synthetic draft
fixture. Its text is English source with a `[DRAFT ...]` marker and an Arabic
locale tag; it is not an Arabic translation. Nothing is written into the product
catalog or offered by the production build.

The tests select English, the fixture and English again while keeping the same
mounted form and result state. They verify exact notice text and status/alert
roles, live accessible form labels, unchanged read and service-call counts, and
absence of a receipt after refusal. A separate cancellation case verifies the
aborted request's late receipt stays discarded. Another changes locale during
a pending recheck and verifies that the original operation continues and its
returned profile/revision display and both canonical digests remain exact.

These are handler and compiled-locale tests. They do not claim a native-browser
language-control journey, assistive-technology audit, semantic translation review
or physical-device qualification. No local native browser was attempted or
execution restriction bypassed.

## Executed checks

| Check | Result |
| --- | --- |
| New tests against base production form | 26 tests: 18 passed, 8 expected failures showing stale notices |
| Corrected backup-verification UI | 26/26 passed |
| Backup UI plus signed-update UI and locale regression selection | 83/83 passed |
| Backup UI, runtime, publication, independent, schema and storage selection | 52/52 passed |
| Existing build-policy suite | 58/58 passed |
| Existing TypeScript projects | All four passed |
| Import boundaries | Passed: 241 production sources; 148 visited core entry modules |
| Default static build | Passed: 12 files; 794,380 bytes |
| Existing documentation consistency | Passed; semantic approval remains false |
| Source whitespace | Passed |

The successful test runs have zero failures, skips, cancellations and todos.
Scopes overlap and their counts are not added. The baseline failure run uses
the new tests with the unchanged base production form; it is separate from
the successful frozen-source checks.

The emitted default graphs contain 95 document modules, 30 vault Worker modules
and four QR Worker modules. The document graph contains both UI panels; none of
the three graphs contains the updater implementation. The artifact retains
`ReleaseEnabled=0`, `signedRelease=false`, `releaseAcceptance=false`, empty
connection origins and `connect-src 'none'`. The document bundle changes as
expected; artifact identity with the parent is not claimed.

Exact commands, log digests, byte lengths and build observations are in
[the generation 20 evidence record](BACKUP_NOTICE_LOCALE_GENERATION20_20261120.json).
Logs are retained in `docs/execution/backup-notice-locale-generation20-20261120/`.

The accepted behavior is grounded in
[the localization specification](../../00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion/module_0.12.3_localization/spec-natural-language-localization-tooltips-and-accessibility.md),
the maintained compiled-locale runtime and the existing backup service contract.
Translation publication, human semantic review, accessibility acceptance,
configured signed-update execution and production release remain pending.
