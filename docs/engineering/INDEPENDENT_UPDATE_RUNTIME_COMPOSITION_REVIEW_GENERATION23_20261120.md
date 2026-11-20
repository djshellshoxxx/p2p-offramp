# Independent generation 23 update/runtime composition review

## Result and exact scope

**No actionable finding remains in the assigned composition-test and developer-documentation scope.** The independent selection passed **59/59 tests**, with zero failures, skips, cancellations or todos. This review qualifies the ordinary Node composition and the accuracy of its stated limits. Final composed-source and hosted integration remain with the coordinator.

| Checkpoint | Exact identity |
| --- | --- |
| Reviewed runtime prerequisite / test parent | `44b0caef274e52632b509a23c7f1b7c9410c0568` |
| Reviewed and executed composition-test source | `2732f5b136987c27639db23f1c7943a278e3fa56` |
| Executed complete tree | `5a1f2969c06db1dba47a1a55d1332a099466edef` |
| New composition-test blob | `d1103693d2bcbbc71dd83bcc42769172d315b2a5` |
| Separately reviewed updater README commit | `95bd08e5c52e6cea574fc155f2dc25b466d6c3ea` |

The test commit adds only [update-runtime-composition.test.mjs](../../apps/web/test/update-runtime-composition.test.mjs). All **2,652 existing entries** from its runtime parent retain their exact modes, types and object IDs. The documentation commit separately changes only `packages/security/README-UPDATES.md`. No production file, dependency, workflow, protocol, trust input or activation setting changes in either reviewed delta.

The author reported an initially successful 12-case execution. This independent review also found the composition successful; no failing baseline or product correction is claimed for this test-only addition.

## What the tests establish

The fixture joins the maintained AppServices facade, AppRuntime, Worker endpoint, encrypted vault and backup services to the actual [asset-update controller](../../packages/security/src/release-update.ts). It also uses the maintained transport policy and release/locator verification. The synthetic signer creates process-local keys through the existing fixture helpers; verification follows the actual implementation.

The accepted [G15 lifecycle and integration requirements](../../00_PLANNING_AND_THREAT_MODELING/feature_0.3_system_integration/module_0.3.3_release_distribution/spec-ipfs-origin-and-update-policy.md) require verified backup and a locked/disconnected transition before opening the selected destination. I checked the following assertions against the relevant implementation and ordinary test execution:

- Locked selection, unchecked export and failed file authentication refuse acceptance before a floor write, wallet disconnect, lock command or destination observation. A failed file check is asserted as the real authentication refusal.
- Successful acceptance checks the existing Worker-owned backup fact twice, on opposite sides of the accepted-state write. The asserted event sequence includes both real request/reply pairs, wallet disconnect, the actual lock request and acknowledgment, then destination observation and wallet release.
- The successful path preserves the encrypted vault envelope exactly and cannot reuse the consumed candidate for a second transition.
- A normal `saveTermsReview` mutation between the checks performs a real vault write and increments its revision. The second check then refuses continuation while the controlled accepted-state port retains the already-recorded sequence floor.
- Unlock and create requests admitted after the first check retire the captured selection before their held opening replies. Releasing those genuine late replies cannot resume the retired acceptance.
- A held successful lock response does not complete acceptance or observe a destination until that response is delivered to the runtime. The test distinguishes the immediately visible locked snapshot from the matching acknowledged transition.
- A competing lock invalidates an outstanding owned lock. The late original acknowledgment cannot revive it.
- The opening-after-acknowledgment case first delivers the actual lock response, then synchronously admits the new opening before the old continuation resumes. It explicitly avoids treating a `BUSY` refusal while the lock request is pending as an admitted selection change.
- Cancellation during a held owned lock retains the floor, refuses late navigation and keeps the controlled wallet lease held until physical completion drains. A new update check is refused as busy during that interval. Cancellation during the first fresh verification prevents any floor or destination effect and exercises the runtime's existing protective lock.

These checks observe maintained behavior through commands, actual replies, persisted envelope changes and destination effects. They do not replace the runtime's selection lease with a fixture boolean or manufacture a completed lock acknowledgment. The new suite therefore supplies a meaningful composition check beyond the previously separate controller and runtime selections.

## Fixture and qualification boundaries

The message port is in-process. Vault storage is a local map with currentness and compare-and-swap checks. The trusted route registry, HTTP bytes, owner gesture, accepted-state store, wallet ownership and navigation are explicitly controlled fixture ports. Actual network fetch is replaced with a refusal, and every test checks that its external-fetch count remains zero.

The recorded sequence floor belongs to that controlled store; this execution does not qualify native IndexedDB durability or actual origin isolation. It also does not qualify native Workers, real browser user activation, physical wallet/provider behavior, devices, archive installation, production trust or release distribution. Production updater construction and default activation remain absent. No redundant production backup adapter was added.

The fixture follows the maintained Node test patterns, bounds its configured operations through the existing runtime/controller limits and releases held responses during cleanup. Its controlled callbacks are scoped to this test file. I found no correctness, readability, architecture or resource-handling issue requiring a change in this addition.

## Independent README accuracy review

A separate short read-only worker checked the documentation axis against runtime source `44b0cae` and documentation commit `95bd08e`. It found no actionable issue and verified all **six relative links** in that exact documentation commit.

The README correctly identifies completion of the specific missing runtime prerequisite recorded in generation 10 while preserving that report as historical evidence. It describes the frozen four-method lease, acknowledgment-sensitive currentness, admitted-opening and competing-lock retirement, operation cancellation, late replies and the separation between ownership and fresh backup verification.

The direct binding `backup: { capture: services.captureBackupSelection }` is accurate: the facade method is an arrow function closing over its runtime, and the returned interface structurally matches `UpdateBackupSelection`. The README does not attribute configuration, transport grants, physical-wallet authority or navigation authority to that binding. Its explanation of the two fresh verification calls matches their placement before and after the controller's accepted-state write.

Its Node/in-process qualification language matches the generation 22 receipt. It makes no claim that the new generation 23 tests had passed when the README was written, or that configured application, native-origin, device or release qualification is complete. The default App remains unconfigured and retains `ReleaseEnabled=0`.

## Independent execution

One invocation ran the following three maintained files on exact source `2732f5b`:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 apps/web/test/update-runtime-composition.test.mjs apps/web/test/runtime-backup-selection.test.mjs packages/security/test/release-update.test.mjs
```

| Actual execution | Result |
| --- | --- |
| New composition cases | 12 included in the selection |
| Runtime backup-selection cases | 28 included in the selection |
| Maintained update-controller cases | 19 included in the selection |
| Complete independent selection | **59 passed; 0 failed, skipped, cancelled or todo** |
| Node | `v24.22.3` |
| Start / completion, UTC | `2026-11-20T17:03:40.662849+00:00` / `2026-11-20T17:03:45.777675+00:00` |
| Exit code | `0` |

The component counts describe this one invocation and are not separate runs. I did not rerun TypeScript for this MJS/Markdown-only delta, or repeat the full suite, builds, browser checks or long native journeys. Runtime TypeScript qualification remains separately recorded at its unchanged source; the coordinator owns final composition qualification.

The complete parent-to-test-source whitespace check and source-entry comparison passed. This review adds only its own Markdown receipt, leaving all reviewed code and tests unchanged.

## Exact execution evidence

Raw evidence remains at:

`/workspace/scratch/dcf03ef9bee8/p2p-update-runtime-composition-independent-g23-logs/`

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `focused.log` | 6,410 | `3b72dbb1d879227196f0325c2537d0cf1e9ed172939affe8887c5fc240b990cc` |

The adjacent `receipt.json` records the full command, exact source/tree, timestamps, duration and exit code. The coordinator may preserve these original bytes under `docs/execution/update-runtime-composition-independent-generation23-20261120/` with compressed and decoded hashes. No compressed-log publication is claimed by this review receipt itself.

No remote branch or PR was changed by this review or its read-only documentation worker. Source publication and applicable exact-candidate hosted gates remain separate coordinator actions.
