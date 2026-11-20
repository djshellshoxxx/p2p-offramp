# Generation 29 — explicit offline retention preview backend

## Source identity and scope

The source is frozen at `5ad059fa8b77cfb8beffcf2f1889e5f19d727ea4`,
tree `05ff7a561aea207d6d54dad08d08fadd5cd8cf45`, on
`codex/retention-preview-backend-g29-20261120`.
Its base is `76d107e4e0ca1a2533636a6057d9d603861668e1`,
tree `437323a382952b9623a875c818f8af005a5d4563`.
This report and its receipts are a separate evidence change after the source freeze.

DATA01 already had a real Worker-private `RetentionService.planRetention` with
conservative classification and the 30-day archive-review threshold. The runtime
protocol and `AppServices` lacked a way to request that offline preview. This
change adds that operation across the schema, pending metadata, document runtime,
Worker endpoint and public facade. The storage implementation and existing
saved-review deletion behavior are unchanged.

The coordinator confirmed the live historical retention PRs were last updated on
November 4, with no contradictory active ownership for this narrow new slice.
The local November 18 quarry describes broader native review/deletion and an old
saved-review policy change; none of that historical implementation was imported.
Independent audits and optional staging remain outside this change.

## Public contract

`AppServices.planRetention(nowMs, signal?)` returns
`Promise<AppResult<RuntimeRetentionPreview>>`. The explicit timestamp must be a
nonnegative safe integer, matching the existing service's bound. The runtime
supplies the currently selected profile ID. The UI receives exactly:

```typescript
interface RuntimeRetentionPreview {
  readonly version: 1;
  readonly revision: number;
  readonly archiveReviewCount: number;
  readonly reviewedDeleteCount: 0;
  readonly protectedCount: number;
  readonly logicalOnly: true;
  readonly backupAndRemoteCopiesUnaffected: true;
}
```

The parser rejects extra fields, accessors, malformed revisions/counts, counts
above `MAX_RECORDS`, archive-review counts greater than protected counts, and any
nonzero reviewed-delete count. No record IDs, record contents, native proof or
opaque plan identity crosses this boundary. Pending metadata retains only the
operation, generation and selected profile correlation.

## Lifecycle and read-only composition

The Worker constructs the real `RetentionService` against its current vault and
captured session without a native authority, calls only `planRetention`, copies
the validated scalar projection, and disposes the service. It then calls the real
vault's persisted `assertFresh` again. Its returned revision must match both the
preview and captured session; the same selected object, session ID and current
revision must still hold before publication. The ordinary runtime generation,
selection, abort, idle and request-deadline checks also remain in force.

This operation performs no vault mutation, backup change, native proof call or
network request. Age-based suggestions grant no deletion authority. Every record,
including unresolved journals, saved reviews without timestamps, identity data,
preferences and unknown/future payloads, stays protected. Native review, consent,
deletion and whole-vault disposal are not added. `ReleaseEnabled=0` remains fixed.

## Executed verification

| Check | Result | Interpretation |
|---|---:|---|
| Protocol baseline on original production source | 3 passed, 2 failed | The two valid command/reply cases fail because `planRetention` is absent from the operation allowlist. The harness executes normally. |
| Initial protocol implementation | 5/5 | Explicit timestamp bounds and exact conservative response projection. |
| Initial new composition/protocol cases | 19/19 | Real encrypted vault, real retention service and real Worker endpoint with controlled persistence; document delivery-order cases use a labeled synthetic transport. |
| Final focused plus adjacent selection | 148/148 | Includes the 19 new cases and existing runtime, Worker, metadata, retention service, backup, recovery, templates and saved-review regressions. |
| Full four-project TypeScript check | Exit 0 | Root, runtime, Worker and UI projects. |
| Import-boundary check | Exit 0 | 241 production files; 148 modules in the core entry graph. This is a static boundary result. |
| Complete staged source/test whitespace check | Exit 0 | All seven changed source/test paths; no excluded paths. |

New composition cases cover the exact 30-day threshold, future timestamps,
unresolved and unknown records, empty/locked/wrong-profile requests, real durable
cross-tab conflicts without notification, same-session revision changes,
revision changes after the final persisted read, lock/disposal, cleanup-triggered
revocation, request expiry, admitted abort and BUSY handling, same-profile
replacement after response settlement, malformed replies and fixed error text.
Successful preview cases assert unchanged encrypted storage, no writes, no native
review/deletion calls, no fetch calls and disposal before publication.

The 148-test run includes the 19 new tests; these totals overlap. Initial candidate
runs are identified separately in the receipt. The earlier aggregate 2,505-test
full-suite result was not rerun or represented as a current-source full-suite
result. Browser/device qualification, native financial runs, remote operations,
deployments and release actions were not performed in this backend task.

## Evidence

The [machine-readable receipt](../execution/retention-preview-backend-generation29-20261120/receipt.json)
records exact commands, exit codes, source identities and SHA-256 hashes for all
seven source/test files. Eight complete stdout/stderr logs are retained as
lossless gzip files with `mtime=0`; both compressed and decompressed hashes are
recorded, including the expected failing baseline. No failed output was replaced.
Dependencies were copied physically from the existing verified checkout; no
dependency installation or update was performed.

Tests paused when the coordinator reported capacity exhaustion elsewhere and
resumed after capacity was restored. This worker encountered no capacity error
in a completed check. UI composition and independent review are coordinated as
separate work; their results belong to their own source-bound evidence.
