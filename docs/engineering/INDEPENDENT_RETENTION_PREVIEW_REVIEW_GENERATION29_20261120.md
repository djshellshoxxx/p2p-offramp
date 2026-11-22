# Independent retention preview review — generation 29

## Decision and exact scope

**Accept for the bounded integration. No actionable Standards or Specification
finding was identified on the frozen combined source.** The new Settings action
requests an offline preview from the selected unlocked profile, displays only
validated counts, and supplies no record IDs, native dependency review, plan
capability, or retention deletion command.

| Checkpoint | Commit | Complete tree |
| --- | --- | --- |
| Reviewed local baseline | `76d107e4e0ca1a2533636a6057d9d603861668e1` | `437323a382952b9623a875c818f8af005a5d4563` |
| Exact published baseline | `d9ddcf53d82100f05de7346143a0ad00d43c2c1a` | `437323a382952b9623a875c818f8af005a5d4563` |
| Backend author source | `5ad059fa8b77cfb8beffcf2f1889e5f19d727ea4` | `05ff7a561aea207d6d54dad08d08fadd5cd8cf45` |
| UI author source | `0d1d929d8bfb97b9772f84eb5fa3425de6fd3602` | `a9010c02a383346ab7041d5549b9cb09eb7f2471` |
| Combined reviewed and qualified source | `fa7c1a11ff990be4646053731f1030d09eb8f9b6` | `dc34c0065a6bc4d66b4195b16d573ef1ec7463a5` |

The reviewer used isolated checkout `p2p-retention-preview-review-g29` on
`codex/retention-preview-independent-review-g29-20261120`. It was clean at each
tested checkpoint. The final reviewer commit contains documentation and evidence
only. This record does not establish a hosted gate, release approval, native
browser execution, or financial qualification.

The normative source is
[DATA01](../../00_PLANNING_AND_THREAT_MODELING/feature_0.8_data_governance/module_0.8.1_data_lifecycle/spec-data-retention-matrix.md).
The machine-readable review receipt, commands, hashes, and scope checks are in
[retention-preview-independent-review-generation29.json](retention-preview-independent-review-generation29.json).

## Standards

**Findings: 0.** The implementation extends the existing exact-shape runtime
protocol and profile-bound command path. The facade continues to expose state
and purpose-specific commands without returning a vault handle. Pending request
metadata contains only operation, generation, and profile correlation. The
Worker composes the existing storage service rather than recreating retention
classification or adding a second deletion policy.

The panel owns a single request ref before React commits its disabled state.
Its result state contains semantic kinds, fixed error codes, and scalar counts;
the current locale resolves those values at render time. Existing APIs and
layout classes are reused. No new dependency, general record API, background
timer, automatic preview, or alternate native authority is introduced.

## Specification and lifecycle

**Findings: 0.** The reviewed contract is
`planRetention(nowMs, signal?)` on AppServices and AppRuntime. The command names
the currently selected profile and admits only safe, nonnegative integer times,
including `Number.MAX_SAFE_INTEGER`. The public preview has exactly seven fields:
version, revision, archive-review count, zero reviewed-delete count, protected
count, and the two true logical/backup-remote limit flags. Counts are bounded by
`MAX_RECORDS`, and archive-review count cannot exceed protected count. Accessors,
extra fields, symbols, malformed counts, and attempts to import deletion
authority are rejected by the runtime boundary.

The Worker captures the selected session, constructs the actual
`RetentionService` without a native authority, and invokes only `planRetention`.
It projects the scalar result, disposes the service, then rechecks persisted
freshness and exact selection, session, and revision before publication. Runtime
generation and handle checks suppress a result whose public continuation runs
after lock or same-profile replacement. Abort, request expiry, and disposal also
retire pending output.

The original storage service and tests are byte-identical to the baseline. The
30-day threshold remains an archive-review suggestion. Terminal journal labels
and old chat timestamps do not become deletion proof. Saved terms without a
stored timestamp receive no invented age. Unresolved, identity, unknown, damaged,
and future records remain protected. The preview keeps all records protected;
archive suggestions are a subset of that protected count.

Settings starts work only after the explicit preview action. Rendering and
locale changes perform no preview or clock read. The panel binds pending and
completed state to the facade owner, selection scope, and profile ID. Selection
subscriptions clear and abort work before the next render; layout cleanup and
the final continuation predicate also cover hidden intermediate locks, facade
replacement, and unmount. A refresh discards earlier counts before awaiting its
result, and conflict or failure cannot leave an earlier preview visible.

The displayed copy explains the 30-day rule, the overlap between suggested and
protected counts, the local revision, and the need to preview again after
changes. It states that this operation leaves stored records, backups, and remote
copies unchanged. There are no native-review, consent, or retention-delete
controls. Existing SavedReview deletion code is untouched; its misleading
Settings guidance was corrected to name the existing Offers control and the
unlock-and-load check after interrupted operations.

## Independent dynamic checks

| Exact source | Reviewer command or check | Observed result |
| --- | --- | --- |
| Backend `5ad059f` | New protocol/runtime tests plus two reviewer probes | **21/21 passed**; zero failures, skips, cancellations, or todo |
| Backend `5ad059f` | `npm run typecheck` | All four TypeScript projects passed |
| Backend `5ad059f` | Complete baseline-to-source `git diff --check` | Passed; no path exclusions |
| Combined `fa7c1a1` | UI lifecycle/catalog/runtime tests plus the same two reviewer probes | **33/33 passed**; zero failures, skips, cancellations, or todo |
| Combined `fa7c1a1` | UI TypeScript project | Passed |
| Combined `fa7c1a1` | Complete published-baseline-to-source `git diff --check` | Passed; no path exclusions |

The two reviewer probes address cleanup cases beyond the author suite. A
same-session commit deliberately queued from `RetentionService.dispose()`
completes before the final freshness check and causes `CONFLICT`; no old preview
escapes. The sole write is the probe's explicit fixture commit. A cleanup callback
that throws after disposal becomes a fixed `STORAGE_UNAVAILABLE` result, with no
successful preview, raw exception detail, or vault write. Both probes passed on
the backend source and the combined source.

The 21- and 33-test results are separate runs and share those two probes. They
must not be added as a count of distinct tests. The maintained UI tests exercise
real compiled panel handlers, live catalog resolution, and real facade/runtime
paths with controlled hooks and transport delivery. They do not establish native
DOM event reachability or native browser behavior. The reviewer did not rerun
the G26/G27 suites, the complete repository suite, any browser command, or a
financial harness.

## Complete source preservation

The combined source contains **2,846 Git entries**. Of the baseline's **2,832
entries, 2,825 retain their exact mode, type, and object ID**. The seven changed
existing entries are the five backend production files, Settings composition,
and the source locale catalog. Four non-documentation paths are added: the panel
and three focused test files. The other ten additions are backend evidence.
No baseline entry is deleted.

The full changed-path list equals the union of the two frozen author source
deltas and the backend evidence delta. The applied backend and evidence commits
have exactly the authors' complete trees. Every backend source/test entry and
all four UI source/test entries match their frozen author blobs. Every
non-documentation entry in the combined source equals the complete UI author's
composed source tree.

This preserves storage policy, SavedReview deletion, G26/G27 fixes and tests,
the G24 native updater fixture and command, financial guards, workflows, npm and
Cargo locks, production locale configuration, release/trust settings, and audit
and optional-work scopes. No PR42/43 whole branch was imported. Active audit
PR184–186 and optional PR224–232 ownership was not changed or incorporated by
these deltas. The reviewer performed no remote operation.

Dependencies came from the frozen-base checkout using `cp -al`: the review
directory has local paths and shares immutable dependency inodes. This is not an
independent dependency installation. The lockfile and package hashes were
verified, and no install, package update, or in-place dependency change was made.

## Coordinator qualification directly verified by the reviewer

The coordinator's seven-command qualification ran on exact `fa7c1a1` from
**18:32:00.154510 to 18:33:52.876690 UTC on November 20, 2026**. The reviewer
independently checked all seven raw log lengths and SHA-256 hashes, parsed the
actual test summaries, and retained lossless deterministic gzip copies and the
exact qualification receipt. Every command records the same source and tree and
exit zero.

| Coordinator command | Directly checked evidence |
| --- | --- |
| `npm test` | **2,555/2,555 passed**; zero failures, skips, cancellations, or todo |
| `npm run typecheck` | Four TypeScript projects passed |
| `npm run test:build-policy` | **58/58 passed**; zero failures, skips, cancellations, or todo |
| `npm run check:boundaries` | Passed |
| Default build | **12 assets / 809,472 bytes**, all actual retained bytes verified |
| Demo build | **13 assets / 821,570 bytes**, all actual retained bytes verified |
| Existing updater command with `--build-only` | Strict preparation succeeded; **37 fixture modules reported; `nativeExecuted: false`** |

All **25 retained build assets** match the receipt, and every actual file is
accounted for, including the separately verified local-build evidence files.
The six graph files match their hashes and captured JSON. All **262 graph module
references** match the actual coordinator files, the review dependency copy, and
the frozen Git source for tracked modules. The document graphs include the
retention panel while storage retention remains confined to the Worker graph.
Executable updater modules are absent from all six default/demo graphs.

The actual content policies retain `connect-src 'none'`, no connect origins,
`ReleaseEnabled: 0`, and no testnet trust, signed release, or release acceptance.
The fixture preparation's logged Worker hash and graph hashes match the actual
default artifact. Its temporary compiled fixture directory was removed by the
maintained command. The reviewer verified that preparation log and the retained
default Worker/graphs, and does not claim to have retained or rehashed the removed
fixture modules. No native scenarios ran. Local Chromium remains blocked; no
bypass or new browser attempt was made.

The earlier 2,505-test aggregate receipt remains historical evidence. The new
2,555-test result belongs specifically to this combined source. Later source or
target changes require their own applicable qualification.

## Author evidence and packaging

Backend evidence commit `b57b5b38bc5bec61b9d1fef00d887a4f13db9452`
preserves eight compressed logs and all seven frozen source/test hashes. The
reviewer verified every raw and compressed hash, length, and gzip timestamp.
The initial protocol run was **3 passed / 2 failed** because the valid command
and reply were not yet supported; this was a missing-interface baseline.

UI evidence commit `3fbad18399f57f559572f5ceb8a2dbb941df2be3` preserves
nine compressed artifacts, including the **13 passed / 18 failed** initial
expectation-harness run and its exact pre-correction source patch. The reviewer
verified all nine artifacts, their metadata, and frozen source hashes. The
initial expected-message realm mismatch is recorded as a harness failure, not
claimed as a production regression. The corrected UI source passed independently.

Reviewer output is retained losslessly with gzip `mtime=0`, raw and compressed
SHA-256 hashes, exact command arguments, source identities, and before/after
checkout status. Reproducible probe and verification sources are stored as text
under the evidence directory. The final staged comparison covers the complete
published-baseline range without exclusions. This review's evidence-only commit
does not alter application code, maintained tests, dependencies, or release
policy.
