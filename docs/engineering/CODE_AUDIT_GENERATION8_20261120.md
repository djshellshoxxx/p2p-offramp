# Generation 8 independent accepted-release storage review

## Decision and scope

The generation 7 repair passes an independent review of cancellation while the
accepted-release store waits for IndexedDB to open. The original failure was
reproduced. Four additional event-order cases pass, and the complete focused
updater, storage and encoding selection passes **37/37** with no skipped or
cancelled tests. No additional production defect was identified in this scope.

This is a fresh successor review, not a claim that the update feature is enabled
or complete. It covers per-operation cancellation, shared callers, late native
success, failed-opening ownership and the existing controller physical-drain
contract. The coordinator owns combined-branch typechecking, build qualification,
broader suites and integration. Portal rendering, navigation ownership and Solana
changes were outside this review's mutation scope.

## Exact source and independent work

The reviewer read the generation 7 report, consolidation handoff and state before
working in a separate checkout:

- Integrated starting source: `b67bd81e74b0f58338dc15bc694cd3a22b724cd4`.
- Author's regression checkpoint: `91fd7b4fc4d40cab0131f2ed363d5ec6bcf43aaa`.
- Author's repair: `8a7e5e539cd33e398daa987ddc7c5256bac8be8f`.
- Reviewed store blob, identical in the author's repair and integrated source:
  `3685b61d0a3ae9c0b0ab22f9396ec30282cebb11`.
- Independent test commit: `e9a3b6807833d0c6aea9fde39c097adbe7827383`.
- Tested tree with those additional cases: `a7dd5e4a69c7b530688298f667aee12e725f3949`.

The review branch is `codex/p2p-code-audit-g8-20261120`. Its only code change is
`packages/security/test/release-update-open-independent.test.mjs`; no runtime
repair was necessary. Runtime was Node `24.22.3`. Dependencies were physically
copied into the isolated checkout after confirming identical lockfiles; this was
not a fresh dependency installation and no dependency symlink was used.

## Standards review

No applicable `AGENTS.md`, `CONTRIBUTING` file or separate coding-standards file
was found in the checked-out repository. The review used the existing module
contract, adjacent lifecycle tests and the documented extraction boundaries in
`docs/engineering/ASSET_UPDATE_EXTRACTION_20261119.md`.

The production delta adds one private operation-specific wait around the existing
shared opening promise. It retains the store's connection ownership and fixed
errors. Abort listeners are removed on abort, open success and open failure. The
existing checks before and after the asynchronous wait remain necessary; the new
independent test covers the interval after the wait listener is removed but before
the operation resumes. No documented-standard violation or material new design
smell was identified in this small delta.

## Contract review

The repair meets the cancellation contract without replacing the store's native
opening request. A cancelled operation settles before any native open event, and
another caller can continue using that opening request. Once a connection arrives,
the cancelled operation starts no transaction and invokes no acceptance authority
callback. The persisted rollback floor is neither cleared nor reset.

Failed-open cleanup still clears only its own connection slot. A newer successful
opening remains current when an older failed request later reports success; the
old connection closes itself. Terminal store close settles surviving waiters and
prevents a late connection from creating transactions.

The controller and HTTP-reader production files are byte-for-byte unchanged
between the author's regression checkpoint and the integrated source. The
existing ignored-fetch test independently passed on both versions: cancelling a
logical update result does not free admission while an already-started native
fetch is still physically pending. The repaired storage wait releases a job only
when that job has not started such physical network work. No contract defect or
scope expansion was found in the reviewed repair.

## Reproduced failure and executed verification

For the original-code checks, only
`packages/security/src/release-update-store.ts` was temporarily replaced with its
blob at the exact regression checkpoint. The test fixtures and remaining source
were the integrated starting tree. The repaired source was restored in a `finally`
block before the green checks. These are independent source-substitution results,
not a claim that the entire historical branch was rebuilt.

| Check | Actual result |
|---|---|
| Original store with the nine author storage cases | 6 passed, 3 expected failures |
| Original store with controller cancellation and ignored-fetch drain selection | 1 passed, 1 expected failure |
| Repaired integrated store/controller/HTTP encoding selection | 33/33 passed |
| Same selection plus four independent event-order cases | 37/37 passed |
| Static references in the default web source/scripts and security public facade | No updater references found |
| Controller and HTTP-reader diff from the original regression checkpoint | No changes |
| `git diff --check` | Passed |

The three original store failures each observed a pending operation after its
signal had been aborted: a cancelled shared reader, a cancelled advance, and
cancellation during native-open setup. The original controller selection failed
its later explicit retry assertion. The ignored-native-fetch ownership case
passed even with the original store, separating the existing drain invariant from
the repaired storage liveness behavior.

### Additional independent cases

The new file uses manually driven native-shaped opening requests and transactions
instead of copying the author's automatically progressing event fixture:

1. Resolve the native open, let the wait listener be removed, then abort in the
   microtask before the operation continuation. No transaction, write or authority
   callback occurs; a later explicit read reuses the connection and reads the
   retained floor.
2. Cancel a reader while a live advance shares the same pending open. Exactly one
   read/write transaction proceeds with strict durability, advances the floor
   once, and remains readable through the same connection.
3. Cancel an old advance, fail its shared open, start a fresh opening, and deliver
   the old success after the new connection has started its read. The old
   connection closes; the current connection remains usable and its floor remains
   intact. The cancelled authority callback never runs.
4. Cancel one waiter and terminally close the store while another waiter remains.
   Both settle, all abort listeners are removed, and late native success closes
   without transactions or writes. A new operation on the closed store refuses.

### Reproduction commands

Run the repaired independent selection from the reviewed checkout:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 \
  packages/security/test/release-update-open-independent.test.mjs \
  packages/security/test/release-update-store.test.mjs \
  packages/security/test/release-update.test.mjs \
  packages/security/test/release-update-http-encoding.test.mjs
git diff --check
```

The original-store commands were:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 \
  packages/security/test/release-update-store.test.mjs
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 \
  --test-name-pattern='cancelled storage open|cancelled ignored native fetch' \
  packages/security/test/release-update.test.mjs
```

The original-source substitution is limited to the named store path from
`91fd7b4fc4d40cab0131f2ed363d5ec6bcf43aaa`; preserve and restore the current file
when reproducing it. The 33-test repaired run used the first repaired command
without the independent test file.

### Evidence records

Logs are in
`/workspace/scratch/6eace968c0df/verification-code-audit-g8/`.

| File | SHA-256 |
|---|---|
| `store-red.log` | `83601b3c28b14536508900e53a37af8cc33b1f37a2d9daf61902f93076174004` |
| `controller-red.log` | `7a17f2b178c6101a6224dc63ec41da990830aab548da4c7dca5e734afea1c9d4` |
| `updater-green.log` | `506b513a040819c1bd51baecd6cc72e4232157350f520c647efc838ee39b653e` |
| `updater-independent-green.log` | `21b5a78c5bb63ba62a6e7ccc39fbe77f35aec5c72558cc12faa1e0fe49f34daa` |
| `default-graph-static.json` | `911f9b6800938c77d58f6b7b5102f494893a5e6d61f9ac6ab8455746e6d60354` |

## Default graph and limitations

The static reference check inspected `apps/web/src`, `apps/web/scripts`,
`packages/security/index.ts` and `scripts/check-import-boundaries.mjs` for
`release-update`, `AssetUpdateController` and `AcceptedReleaseStore`. There were
no matches. The public facade still exports release verification and acceptance
evaluation only. This checks source references; it is not fresh emitted-build
evidence.

The reviewer did not run a real browser or native IndexedDB implementation. The
tests deliberately model relevant native event order, so browser-specific
scheduling, blocked-open behavior across tabs and transaction lifecycle still
need browser qualification before any runtime composition is enabled. Full
typecheck, default build, emitted graph checks and broad security/transport suites
remain the coordinator's combined-branch gate. This report does not claim those
checks were repeated here.

No trust key, endpoint, default runtime activation, release flag, deployment
manifest or production navigation policy changed. No live network service,
wallet, funded account, deployment or remote ref was exercised or changed.
There are no newly identified open high- or medium-severity findings in this
narrow repair review; that statement does not cover the full application.

## Handoff to the next fresh reviewer

The coordinator can integrate the independent test commit and this report, then
qualify the resulting combined source. A next reviewer should start from that
exact integrated head and retain the separation between logical storage
cancellation and physical HTTP drain.

The next meaningful updater work is the still-uncompleted native browser
composition and its evidence: real IndexedDB cancellation, failed/blocked opens,
late completion and cross-tab version changes, using the permitted browser
environment. Review any new adapter against the current trust-unset and explicit
acceptance boundaries before considering activation. If that environment is not
available, record the limitation and move to another incomplete source task;
repeating these unchanged unit cases does not supply the missing browser evidence.
