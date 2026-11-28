# Independent runtime backup selection review — generation 22

## Result and exact scope

**No actionable finding remains in the reviewed implementation.** Independent
execution on the frozen source passed **88/88 focused tests** with zero failures,
skips, cancellations or todos. All four TypeScript projects passed separately.
This review qualifies the new local ownership prerequisite, not a configured
updater or a production release.

| Identity | Exact value |
| --- | --- |
| Base | `8419ef138e17a25b56527523d27276cafcdd9037` |
| Independently reviewed and tested source | `44b0caef274e52632b509a23c7f1b7c9410c0568` |
| Tested complete tree | `c9512efee5d06da0e3741fbe638388d5ce04a2f5` |
| Review branch | `codex/runtime-backup-lease-independent-g22-20261120` |

The exact diff changes only
[`app-runtime.ts`](../../apps/web/src/runtime/app-runtime.ts),
[`app-services.ts`](../../apps/web/src/app-services.ts) and
[`runtime-backup-selection.test.mjs`](../../apps/web/test/runtime-backup-selection.test.mjs).
All **2,649 other tree entries** retain their base modes, types and object IDs.
The existing `selectionScope()` implementation is byte-for-byte unchanged.
The only import edit extends the existing runtime import with a type; it adds
no executable updater module.

The author history contains the initial feature regressions, implementation,
additional cancellation/ownership tests and preflight correction. This reviewer
tested the final source above and does not claim independent execution of the
author's earlier failing runs.

## Standards

**Findings: 0.** A separate short read-only standards review examined the same
three-file diff and surrounding runtime/facade code. No additional repository
coding-standard file was found, and no rule was invented from that absence.

The runtime retains private handles, generation and lifecycle identity. The
facade exposes only the opaque operations and currentness required by trusted
composition. The small facade delegation follows the existing application
boundary. An opaque object is suitable for exact local identity; a public
counter would weaken that boundary. Lease currentness, fresh verification and
owned lock remain together in the runtime that owns their requests and replies.

No baseline code-smell judgment warranted a change. In particular, cancellation
checks on both sides of a potentially reentrant currentness check serve a
specific lifecycle purpose and should not be combined as routine duplication.
The added implementation follows the surrounding compact TypeScript and fixed
runtime error conventions.

## Spec

**Findings: 0.** The reviewed requirement comes from the maintained
[G15 origin/update policy](../../00_PLANNING_AND_THREAT_MODELING/feature_0.3_system_integration/module_0.3.3_release_distribution/spec-ipfs-origin-and-update-policy.md),
the [updater backup-selection contract](../../packages/security/src/release-update.ts),
the [exact own-lock requirement](../../packages/security/README-UPDATES.md), and
the explicitly deferred prerequisite in the
[generation 13 implementation report](SIGNED_UPDATE_UI_GENERATION13_20261120.md).

The new private identity changes on every admitted `unlock` or `create`, before
its reply, and on each invalidation. It is separate from both the protocol
generation and the existing UI scope counter. Invalid or busy opening attempts
do not invent an admitted selection change. A lease can be captured only from a
current unlocked runtime and supplies no public handle, passphrase, receipt,
configuration or navigation authority.

The owned lock captures its identity before dispatch. Currentness is false
while the acknowledgment is outstanding and becomes true only after that exact
successful lock reply, with the same private identity and expected generation.
Another lock, admitted opening, terminal closure or disposal cannot be adopted
as the lease's own transition. A second lease cannot adopt the first one's
lock. Cancellation and lease disposal retire ownership without undoing an
already dispatched physical lock or allowing a late reply to revive it.

`requireVerifiedBackup()` calls the maintained Worker-owned verification path
on every invocation and accepts no receipt argument. Selection ownership is
deliberately distinct from backup freshness: exporting a file does not establish
verification, a selected mutation retires the backup fact, and reopening does
not inherit it. The existing updater still owns the acceptance sequence and
fresh-check requirements; merely capturing this lease grants no update approval.

No Worker protocol, updater controller, trust configuration, wallet ownership,
navigation, default activation or `selectionScope()` behavior is changed by
this slice.

## Independently executed qualification

The following single focused invocation ran from **2026-11-20T16:50:32.092913Z**
to **2026-11-20T16:50:36.186195Z** on the exact source/tree above:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=4 \
  apps/web/test/runtime-backup-selection.test.mjs \
  apps/web/test/app-runtime.test.mjs \
  apps/web/test/app-services.test.mjs \
  apps/web/test/backup-verification-runtime.test.mjs \
  apps/web/test/backup-verification-independent.test.mjs \
  apps/web/test/backup-verification-publication.test.mjs \
  packages/security/test/release-update.test.mjs
```

Result: **88 tests passed**, zero failed/skipped/cancelled/todo; exit code 0.
This includes the dedicated **28-case** lease suite. That subset is not a
separate execution and is not added to the 88 total.

The selection covers exact and repeated locks, acknowledgment reentrancy, shared
selection ownership, opening admission before successful or refused replies,
preflight and in-flight cancellation, late output, timeout, pagehide, idle
expiry, Worker failure, lease/runtime disposal and current verification facts.
The verification cases use the maintained endpoint, encrypted vault and backup
services with an in-process port and local store fixture. They are not an actual
browser Worker/IndexedDB or physical-device execution.

`npm run typecheck` ran from **2026-11-20T16:50:36.186544Z** to
**2026-11-20T16:50:39.211603Z** and passed all four projects, exit code 0.
The complete base-to-source whitespace check and exact tree-scope checks passed.

| Retained raw log | Bytes | SHA-256 |
| --- | ---: | --- |
| `focused.log` | 9,717 | `b310740e8745f1902caa2b4700c0848df3d94b77750e6c5a55267056d1ed6b97` |
| `typecheck.log` | 341 | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |

The exact raw logs and command/timestamp receipt are in
`/workspace/scratch/dcf03ef9bee8/p2p-runtime-lease-independent-g22-logs/`.
The coordinator may preserve them as gzip files under
`docs/execution/runtime-backup-lease-independent-generation22-20261120/`, with
decoded hashes matching this table. This review commit adds only this report;
it does not claim that packaging has already occurred.

## Limits and next integration step

This worker made no production, test, protocol or remote changes. It did not
repeat the full suite, builds, local browser or long native financial journeys.
Author qualification and later combined-source hosted checks remain separate
evidence. A future adapter must use the runtime-owned lease and preserve the
accepted fresh verification and exact lock contract; it must not reconstruct
ownership from UI state or enable an updater without its other required inputs.

**Standards: 0 findings, worst issue none. Spec: 0 findings, worst issue none.**
