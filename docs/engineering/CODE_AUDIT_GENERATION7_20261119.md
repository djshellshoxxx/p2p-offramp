# Generation 7 code audit: portal closure and cancellable update storage

Date: 2026-11-19, America/Los_Angeles (2026-11-20 UTC).

## Source and scope

This fresh worker started from generation 6 checkpoint
`b1e61dc78c462d8a4e1419249b19d814d4648148`, whose core ancestor is published
PR205 head `cd7d54ba075118a7ec043788c17718be842ee405`. It read the current
consolidation handoff, state and generation 6 audit report. Work used an isolated
worktree and physical copies of the existing pinned dependencies.

The pass independently reviewed the portal cleanup repair, then investigated
the preceding worker's unconfirmed IndexedDB cancellation lead. It changes
only the internal accepted-release store, two updater test files and this
report. The coordinator owns integration and the global handoff/state.

| Checkpoint | Exact identity |
| --- | --- |
| New regression-only commit | `91fd7b4fc4d40cab0131f2ed363d5ec6bcf43aaa` |
| Repaired source commit | `8a7e5e539cd33e398daa987ddc7c5256bac8be8f` |
| Repaired source tree, before this report | `18e7bef952d2005b7c7c1373afd27777ddccbeb2` |

## Independent closure of the generation 6 portal repair

The worker inspected the exact delta from regression checkpoint
`e657488a0bbcc059c11dce07de2fb70f51d10dd8` to repair
`4966938d1f5803048c55f7d698b3ad76f9be4ec0`.

The original source was temporarily materialized in this worker's checkout
for the focused regression command and restored in a `finally` block. The
original source reproduced deletion of the unrelated replacement's `KEEP.txt`:
**one test passed and one failed**. The repaired source passed **both tests**.
The complete repaired portal suite then passed **4/4**.

The ownership check matches the existing distribution cleanup pattern. It
preserves a replacement directory and still removes the builder's own
incomplete output. Existing-output refusal, scriptless content policy and
unsigned source-reference reporting remain intact. No additional High or
Medium finding was identified in this scoped repair.

The conclusion retains the author's limit: native filesystem calls are not an
atomic transaction against continual same-user path replacement. The repair
closes the reproduced replacement-before-cleanup defect; it does not claim a
general hostile-filesystem guarantee.

## Confirmed finding: cancelled storage operations remain pending during open

`IndexedDbAcceptedReleaseStore.#run` checked cancellation before and after
awaiting the shared `#open()` promise. It had no cancellation handler while
that native open was pending. Cancelling a read or advance therefore left the
operation pending until a later native open event or store closure.

The actual update controller races logical cancellation against its work but
retains shared admission until that work drains. With this store, the cancelled
operation continued waiting, so a later explicit check returned
`{"kind":"unreachable","reason":"BUSY"}`.

This is one confirmed cancellation/liveness defect, exercised through three
storage edge cases and one controller composition case. The updater remains
internal and unwired in the default app, so the demonstrated impact is on the
library and its configured controller. No rollback-state corruption, financial
loss or active default-app exposure is claimed.

The regression-only source produced:

- Existing plus new storage tests: **6 passed, 3 failed**. The cancelled read,
  cancelled advance and cancellation during open setup each remained pending.
- Focused controller tests: **1 passed, 1 failed**. The new explicit retry
  remained `BUSY`; the existing ignored-fetch physical-drain test passed.

## Repair and preserved behavior

The store now waits for a shared native open through a per-operation abort
listener. Cancellation rejects only that operation's wait with the fixed
`CANCELLED` result. It does not close or replace the shared connection. A caller
that remains active can continue, and a later explicit operation can reuse the
same pending or completed native open.

Both cancellation checks around the awaited connection remain. A late native
success cannot resume an already rejected operation or start its transaction.
The listener is removed on cancellation, connection success or connection
failure. Cancellation that occurs synchronously during native-open setup is
also observed after listener registration.

The controller, HTTP reader, public API, storage schema, rollback-floor
validation and compare-and-swap transaction logic are unchanged. The repair
does not cancel the underlying IndexedDB request. The store continues owning
that connection and its existing late-success/close handling. No HTTP fetch,
wallet action or navigation is introduced by a retired read.

The tests establish that:

- Two reads share one native open. Cancelling one settles it promptly while
  the other read remains pending and later reads the intact rollback floor.
- The cancelled read starts no transaction. The surviving read starts exactly
  one, without writes or connection replacement.
- A cancelled advance starts no transaction, invokes no authority callback,
  and leaves the existing rollback floor unchanged after a late open success.
- A later explicit controller check can use the retained open and obtain the
  existing signed fixture's candidate. Only that new operation starts a read
  transaction; no acceptance, write, wallet disconnect, lock or navigation occurs.
- The unchanged ignored-fetch tests still retain physical admission until the
  actual fetch drains. No controller admission assertion was weakened.

## Executed verification

Environment: Node `v24.22.3`; existing pinned dependency set, physically copied
inside this checkout. Tests use deterministic native-API-shaped IndexedDB
fixtures and the real controller. They are not a browser IndexedDB execution.

| Command or check | Result |
| --- | --- |
| Portal regression against original `e657488` source | 1 passed, 1 failed, expected `KEEP.txt` deletion reproduced |
| Same portal regression against repaired source | 2/2 passed |
| `node --import ./scripts/test-support/register-tsx.mjs --test scripts/portal/build.test.mjs` | 4/4 passed |
| Storage suite on regression-only source | 6 passed, 3 failed, expected pending-after-cancel failures |
| Focused controller cases on regression-only source | 1 passed, 1 failed, expected `BUSY` result |
| Combined updater, store and HTTP-encoding suites on repaired source | **33/33 passed**, zero failures, skips or cancellations |
| `git diff --check` | Passed |

The repaired updater command was:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test \
  packages/security/test/release-update-store.test.mjs \
  packages/security/test/release-update.test.mjs \
  packages/security/test/release-update-http-encoding.test.mjs
```

The focused controller command used
`--test-name-pattern='cancelled storage open|cancelled ignored native fetch'`.
The portal regression command used `--test-name-pattern='failed portal build'`.

The coordinator requested that this worker defer heavy typecheck/build/full-suite
execution while the shared optional-composition suite drains. Those gates were
**not run on this repaired source**. Earlier workers' typecheck/build results
are not substituted for this source's qualification. Exact-source browser and
hosted qualification also remain separate.

Captured log identities:

| Log | SHA-256 |
| --- | --- |
| `portal-red.log` | `44d864ea1edaddb76bc8edf284bb9847b6a28adceafb05e20b93b5d90f428b29` |
| `portal-green.log` | `429da249256f85b50b30088e98f87558f27bb0109abeb20d5cbdb94b8ae4d114` |
| `portal-full.log` | `acaed85d85ef9872175b5320f16615e47bef4cdce9cda918333a3bc32e8cebb2` |
| `store-red.log` | `cd6911951228c2aa25379a778933877e038ca7c19c920cf74d937f9fd61c41cc` |
| `controller-red.log` | `f2f60aff72b4b7cc33ccbd7f581f595748498102373705820c35231cb65645bf` |
| `updates-green.log` | `92456b4d6dce7a57a285dbc09957ea635a1f6a2b7389e9122fa9d0cb0f31b747` |

## Fresh-worker handoff

1. Independently review the cancellation repair and reproduce the regression
   from `91fd7b4` to `8a7e5e5`. Check live-caller isolation, listener cleanup,
   pre-transaction cancellation, late-open behavior and preservation of the
   controller's physical HTTP drain rule.
2. Run the source's typecheck, build/import-policy and combined test gates when
   the coordinator's shared resource constraint clears. Keep native/browser
   qualification bound to the actual integrated source and checkout tree.
3. Retain the updater's internal/unwired status and existing owner trust-input
   requirements. This repair supplies no default update UI, endpoint, key or
   release authority.

No remote ref, PR, coordinator state, deployment, release, credential, policy
setting or real-funds action was changed by this worker.
