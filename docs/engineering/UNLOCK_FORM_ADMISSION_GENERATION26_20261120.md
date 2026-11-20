# Generation 26: preserve ownership of an admitted unlock

## Result and source identity

`UnlockForm` now rejects a duplicate submission synchronously while its existing
request ref is occupied. The first admitted request retains its AbortController
before React rerenders the busy state, so Cancel and unmount still cancel that
request. The production change is one admission condition and its explanatory
comment in `apps/web/src/ui/VaultForms.tsx`.

| Checkpoint | Exact identity |
| --- | --- |
| Assigned coordinator source base | `1a52c1c4f53a97cbbd0937f14a4379b88fd249b8` |
| Base tree | `26938456c4924e4792a5671183a0879e86f8b7a2` |
| Regression-only commit | `6df5a34a7c00f8a6fa489a53ca8f783616e285f5` |
| Frozen implementation | `a2a854a285563d4560610577a0df099b041643bf` |
| Frozen source tree | `d6eea6d8e46d9612b59768801daa28ee9544e3a3` |
| Author branch | `codex/unlock-form-admission-g26-20261120` |

Only two paths differ between the base and frozen implementation:

- `apps/web/src/ui/VaultForms.tsx`
- `apps/web/test/unlock-form-admission.test.mjs`

All **2,727 other base entries** retain their exact mode, type and object ID.
The added regression file gives 2,729 source tree entries against 2,728 in the
base. Subsequent author commits contain only this report, its receipt and the
retained evidence. The assigned base describes the coordinator's source; no
remote ref was inspected or changed for this work.

## Reproduced behavior and bounded correction

The old submit handler checked only the render-captured `busy` value. Two calls
from one render could therefore both assign `request.current`. The real runtime
admitted the first unlock and returned `BUSY` to the second before registering
an abort listener for the second signal. This kept the Worker command count at
one but left the UI owning the rejected duplicate's controller.

Immediate Cancel then aborted only the duplicate. If the duplicate completed
first, its `finally` cleared both the busy state and request ref while the
original was still pending. Cancel or unmount could no longer abort the original
request. A later valid reply could publish unlocked state and invoke the form's
completion callback after the form had closed. The runtime's generation checks
were intact: the original request had never received the intended cancellation.

The new condition checks `busy` or a non-null `request.current` before taking
the submitted inputs. The first request reserves that ref synchronously, so a
same-render duplicate returns before replacing ownership or entering a second
completion path. The original input clearing, notices, success callback, abort
behavior and final cleanup continue to run for the admitted request.

No cooldown, attempt counter, interval, clock or persistent rate policy was
added. The existing runtime and Worker one-job bounds remain unchanged. The
passphrase specification remains unchanged, including its explicit limit that
UI attempt controls do not stop offline guessing. Trust, keys, origins,
protocol, dependencies, workflows, `ReleaseEnabled=0` and default activation
retain the base bytes outside the two named source/test paths.

## Executed validation

Runtime: Node `v24.22.3`, with a physical dependency copy in the isolated author
worktree.

| Executed check | Result |
| --- | --- |
| Initial characterization on unchanged base source | 5/5 checks passed, confirming observed behavior including the ownership loss |
| Desired-behavior regressions on unchanged base production source | **8 tests: 4 passed, 4 failed** |
| Identical regression bytes after the correction | **8/8 passed** |
| Existing vault-form locale, app-services, app-runtime and pending-metadata suites | **52/52 passed** |
| UI TypeScript project | Passed |
| Source and complete base-to-evidence whitespace checks | Passed |

All test runs had zero cancellations, skips or todos. The characterization run
asserts the observed old behavior; its green outcome is not qualification of
the desired behavior. The four original regression failures remain retained.

RED ran before the production edit and before the regression-only commit was
created. GREEN, the four affected suites and the UI typecheck ran on the exact
working tree subsequently frozen in the implementation commit. The regression
test blob is identical in both commits.

The eight regressions cover:

1. Ordinary single-submit cancellation followed by a late valid reply.
2. A same-render duplicate followed immediately by Cancel and unmount.
3. A settled duplicate followed by Cancel.
4. A settled duplicate followed by unmount.
5. Preservation of the pending UI and the original authentication notice.
6. The already-working rerender-between-submissions control.
7. Ordinary successful unlock, cleared passphrase and one close callback.
8. A fresh explicit retry after a completed authentication failure.

The cancellation cases verify that the held valid reply was actually delivered
to the runtime, that it produced no unlocked publication, and that it produced
no extra completion callback. The duplicate cases preserve one service call
and one posted Worker unlock command.

## Evidence and qualification boundary

[The machine-readable receipt](unlock-form-admission-generation26.json) records
the exact commands, source identities, source hashes and all six retained log
hashes. Evidence is under
`docs/engineering/evidence/unlock-form-admission-generation26/`. The original
characterization source is retained as text with its original execution path
recorded in the receipt; the committed regression suite is directly runnable.

The [original RED output](evidence/unlock-form-admission-generation26/regression-red.log.gz)
is stored as lossless gzip with `mtime=0`; decompression was verified byte-for-byte
against the original output. The receipt records both storage and decoded
lengths and SHA-256 values: **852 compressed bytes / 3,646 decoded bytes**. This
preserves the assertion renderer's output exactly while allowing the complete
base-to-evidence whitespace gate to cover every changed path.

The tests execute the maintained transpiled TSX handlers, the actual AppServices
facade and the actual AppRuntime. Hook scheduling and the held Worker port are
controlled. They establish behavior when one captured submit handler is called
twice before rerendering. They do not establish native-browser event
reachability, native Worker behavior, browser persistence or crypto acceptance.

This is author evidence. Independent review and final composed-source
qualification remain with the coordinator. No full suite, local browser,
financial run, remote operation, deployment or publication was performed.
