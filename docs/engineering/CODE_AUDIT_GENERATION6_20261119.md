# Generation 6 code audit: portal output ownership

## Source and scope

This independent worker started at published PR205 head
`cd7d54ba075118a7ec043788c17718be842ee405`, using its own worktree and physical
copies of the pinned dependencies. The audit read the current consolidation
handoff and state before examining the recovered portal/distribution tooling,
static import/build policy, and accepted-release storage lifecycle. UI
personalization, Solana restore, and network trust-boundary changes belonged to
other workers.

The confirmed repair changes only `scripts/portal/build.mjs` and its tests. It
adds no application, network, signing, publication, or release authority. The
coordinator owns integration and subsequent independent closure.

## Confirmed finding: cleanup can delete an unrelated replacement directory

**Severity:** Medium local tooling data-loss risk. This is a local filesystem
concurrency defect, not a demonstrated remote application exploit.

`buildPortal` remembered only that it had created an output path. If another
operation renamed that incomplete directory and created a different directory
at the same path, a later write failure caused the catch block to recursively
delete the replacement directory. Its contents did not belong to the failing
build.

The regression uses actual temporary filesystem directories. At the first
download write it performs a controlled rename, creates a replacement
containing `KEEP.txt`, and injects an I/O failure. The original implementation
deletes `KEEP.txt`; the assertion fails with `ENOENT`. A second regression
ensures a failed build still removes its own incomplete output.

The repair retains the output directory's device/inode identity immediately
after creation. On failure, cleanup first checks that the path still names the
same nonsymlink directory. A replacement is preserved. The original build
error remains observable. This follows the existing distribution staging
ownership pattern.

The check addresses the reproduced replacement-before-cleanup race. It does
not claim an atomic filesystem transaction or protection against an adversarial
same-user process continually replacing entries between individual native
filesystem operations.

## Reproduction and verification

| Checkpoint | Exact identity | Result |
| --- | --- | --- |
| Regression-only commit | `e657488a0bbcc059c11dce07de2fb70f51d10dd8` | Replacement preservation failed; own-output cleanup passed |
| Repair commit | `4966938d1f5803048c55f7d698b3ad76f9be4ec0` | Portal suite 4/4 passed |
| Tested source tree | `997eb07307b9d99bc4008ede6c869524bf707e9a` | Same source as the repaired executions below |

The regression-only command was:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test \
  --test-name-pattern='failed portal build' scripts/portal/build.test.mjs
```

It executed two tests: one passed and one failed. No skip or cancellation was
reported. After the repair, the complete portal suite passed four tests.

Additional actual executions:

| Command | Result |
| --- | --- |
| `npm run test:tooling` | 44/44 passed; zero failures, skips, or cancellations |
| `npm run test:build-policy` | 57/57 passed; zero failures, skips, or cancellations |
| `npm run check:boundaries` | Passed; 238 production source files and 142 core graph modules |
| `npm run typecheck` | All four TypeScript projects passed |
| `git diff --check` | Passed |

The tooling suite includes the current portal build and cleanup regressions,
immutable documentation checks, and the historical-client/current-tooling
two-pass distribution fixture. That historical distribution fixture does not
substitute for qualification of the current client. Current unsigned staging
continues to refuse stale immutable evidence. No evidence record was rebound.

The captured full tooling log SHA-256 is
`d9ee88b9ced0f253ef2a416f92515793e633c051efd130c0295f6893ebe8bee6`.
The captured build-policy log SHA-256 is
`c953570498234a3e344fbf8e9d2c15bb8dcf2cbf3c3c34fe492dbbd4363fbfba`.
These logs are execution records, not release approval.

## Fresh-worker handoff

1. Independently inspect the portal identity check, reproduce the old failing
   cleanup case, and review the repaired result. The coordinator can integrate
   the two ordered source commits without unrelated files.
2. Investigate `IndexedDbAcceptedReleaseStore.#run` waiting on `#open()` before
   registering any cancellation handling. A potential cancellation gap exists
   while the native open remains pending. This was identified by inspection
   only in this pass; it is **not a confirmed finding** and no fix is included.
   A useful deterministic probe would start two reads sharing one pending
   open, abort one read, and verify prompt cancellation without canceling the
   other read or permitting an aborted operation to start a transaction. Check
   how this interacts with `createAssetUpdateController`'s physical admission
   and drain rules before changing either implementation.
3. Keep exact current-head hosted browser/native qualification separate from
   these local tooling results. This worker did not launch Chromium or claim
   the pending PR205 contexts passed.

No additional confirmed High or Medium finding was identified in this bounded
scope. Independent review of the new portal repair remains the next step.
