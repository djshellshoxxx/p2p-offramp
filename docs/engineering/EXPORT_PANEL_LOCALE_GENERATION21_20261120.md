# Generation 21 — diagnostic and recovery export notices

## Result and source

Diagnostics and private recovery-reference notices now follow the selected
compiled locale. The components retain existing message keys or runtime error
codes in state, then resolve the current catalog during rendering. Previously,
completed notices retained the text resolved when the operation finished.

| Checkpoint | Exact identity |
| --- | --- |
| Base main | `388526a474aea0e08f9c04178c2b7f9e1d4bee3f` |
| Regression-only commit | `3191d50658147286854ea14eae58755f8164d533` |
| Frozen implementation | `0046c8288ea18c219c4cc7be79c94d86134d56cf` |
| Implementation tree | `92b5d9e8a795621e3ab98a132e69232d65f62e1a` |
| Source branch | `codex/export-panels-locale-g21-20261120` |

The frozen implementation changes `DiagnosticsPanel.tsx` and
`RecoveryReferencesPanel.tsx`, and adds `export-panels-locale.test.mjs`.
All 2,574 other base-tree entries retain their modes, types and object IDs.
This report, its JSON receipt and retained logs are a separate documentation
commit after the frozen implementation.

## Preserved behavior

Diagnostics retains its existing collection, preview, clear and explicit
download operations. Its already-semantic diagnostic error codes are unchanged.
Recovery references retains selection and consent, canonical preview bytes,
the fresh revision-pinned read immediately before export, and the existing
request, scope, sequence, cancellation, cleanup and focus rules. Notice roles,
fixed copy, error mappings, file names and downloaded JSON stay the same.

The change does not modify catalog text, service contracts, domain/storage code,
the other locale workers' components, dependencies, workflows or trust/release
configuration. No new locale or semantic approval is added. Production remains
English-only and draft.

## Executed evidence

The ordinary tests bundle the maintained locale runtime, message views and
error mapper in memory with an explicitly compiled draft marker catalog.
They execute maintained TSX handlers with controlled hooks and service replies.
They qualify state and message rendering, not browser DOM behavior or native
storage durability.

| Execution | Actual result |
| --- | --- |
| Ten new cases against unchanged base panels | 4 passed, 6 expected failures showing stale notices; zero skipped/cancelled |
| Fixed panel, existing UI lifecycle/render and locale selection suites | 46/46 passed; zero failed/skipped/cancelled/todo |
| Adjacent diagnostics, recovery schema and Worker suites | 28/28 passed; zero failed/skipped/cancelled/todo |
| All four TypeScript projects | Passed |
| Whitespace and complete source-tree scope checks | Passed |

The new cases cover clear and download notices, ordinary listing refusal and
thrown-error mapping, selection in both locale directions, pending revision
recheck refusal, lock/unmount retirement, retained preview/consent and exact
export bytes. They assert that changing locale performs no extra collection,
read, confirmation or download. The existing lifecycle cases continue to cover
profile replacement and revision changes.

The [machine-readable receipt](export-panel-locale-generation21.json) records
the exact commands, source identities, environment, actual results and SHA-256
digests of all four retained logs. The failed original run remains in
[red.log](../execution/export-panel-locale-generation21-20261120/red.log.gz);
the [focused green run](../execution/export-panel-locale-generation21-20261120/green.log.gz),
[adjacent run](../execution/export-panel-locale-generation21-20261120/adjacent.log.gz)
and [type check](../execution/export-panel-locale-generation21-20261120/typecheck.log.gz)
are separate executions. Counts describe their scopes and are not a new
full-suite total.

## Remaining qualification

The coordinator owns fresh independent review and the final combined-source
build and hosted gates. This worker made no remote changes and did not run a
local browser, full suite, build or long native financial journey. Existing
catalog/evidence pins and draft limitations remain unchanged; no production,
device, release or distribution acceptance is claimed.

Execution logs are retained with gzip packaging. Decoded bytes and the original
raw-log hashes remain unchanged; see the [packaging index](retained-logs-generation21.json)
for stored paths and both hashes. Original author commits retain their raw files.
