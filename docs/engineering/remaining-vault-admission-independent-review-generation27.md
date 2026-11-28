# G27 independent review: remaining vault form request ownership

## Decision

**Accept the frozen three-guard change for scoped integration.** No actionable correctness, standards, or scope finding remains. Independent execution reproduced **12 behavioral failures** among 19 cases on the test-only commit, then passed **19/19** on the repair. Five affected suites passed **60/60**, and the UI TypeScript project passed.

This qualifies request ownership in the maintained ExportForm, CreateForm, and RestoreForm handlers composed with the real AppServices facade and AppRuntime. Hooks, form fields, file reads, download elements, and the held Worker port are controlled. It does not establish native browser duplicate-event reachability, browser-wide rate policy, or rollback of a dispatched storage write. `ReleaseEnabled=0` remains unchanged.

The [machine-readable receipt](remaining-vault-admission-independent-review-generation27.json) retains exact commands, UTC timestamps, source identities, result counts, source hashes, and both decoded and compressed evidence hashes. This review adds only documentation and evidence.

## Frozen source identities

| Checkpoint | Commit | Complete tree |
| --- | --- | --- |
| Accepted G26 base | `f36a0a07dff55aa83b9d01a69501d049461d9b33` | `e465bb6894fa4d890255ad045c68398e3aae9a5c` |
| Test-only RED | `515a7c945b6bef136c3ede436577635b17ccd4e2` | `ae419673f5930a09e96aa19db26e8537e3cbb931` |
| Reviewed GREEN | `0df0e191e5829e66141d4ba9c028599ce9c91de2` | `69395d2cc344ba360cddb0ca3e1b19884a568ed9` |

The isolated reviewer branch is `codex/remaining-vault-admission-independent-review-g27-20261120`, worktree `/workspace/scratch/dcf03ef9bee8/p2p-remaining-vault-admission-review-g27`. The exact RED and GREEN commits were checked out before execution; every qualification command recorded a clean before/after working tree. Dependencies were physically copied without changing package definitions or the lockfile. Checked package files resolve inside the reviewer worktree and have different inodes from their copy source.

Complete-tree comparison independently establishes:

- RED directly follows the base, preserves all **2,764** base entries, and adds only `apps/web/test/vault-form-admission.test.mjs`.
- GREEN directly follows RED and changes only `apps/web/src/ui/VaultForms.tsx`. Its complete production file equals the base with exactly three `if (busy) return;` guards replaced by `if (busy || request.current !== null) return;`.
- The accepted G26 UnlockForm block and test are identical. All **2,763** other base entries retain their modes, types, and object IDs, including runtime, Worker, schemas, configuration, trust inputs, dependencies, and workflows.
- The new test is identical in RED and GREEN: Git blob `42136f64ef31c1bf646ae1d67946e363a3db48cd`, SHA-256 `ff52ac643512849b2178977b8d07d4affe688a9b460bc91a0add033984a538b4`.
- The unchanged facade still starts AppRuntime with `ReleaseEnabled: 0` and an empty connection-origin list.

## Standards

**Findings: 0.** The handlers use their existing ref before input reads, controller replacement, notice changes, or file reads. This follows the accepted UnlockForm repair and adds no state, clock, cooldown, counter, abstraction, dependency, or policy. The regression follows the maintained-TSX/controlled-hook fixture pattern, forwards calls to real services, and declares its controlled boundaries accurately.

No repository or parent `AGENTS.md`, separate coding-standard file, or contribution-standard file was found in the scoped lookup. The assignment supplied the baseline and behavioral scope. Both axes were reviewed by this independent reviewer; no additional workers were started.

## Spec

**Findings: 0.** The assignment requires retaining each admitted request across calls through one render's handler while preserving cancellation, success, consent, secret clearing, and legitimate retry. The [G03 encrypted-backup contract](../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-encrypted-backup-recovery.md) requires bounded recovery work and reconciliation after uncertain storage outcomes. The [web workflow documentation](../../apps/web/README.md) explains that interruption can follow a durable write and incomplete inventory cannot rearm Restore retry.

Each handler already stores its controller synchronously before its first asynchronous boundary. Export and Create then call the facade; Restore first awaits `file.arrayBuffer()`. The new guard protects both runtime requests and Restore's earlier file read. A refused duplicate cannot replace the controller, change busy/notices, call the facade again, or start another read. The unchanged identity-checked `finally` releases ownership after completion. Positive retry cases submit after the original refusal settles and observe new facade calls and Worker commands.

Create intentionally still reports a valid successful result's public ID when an unlocked-state notification has already unmounted the form. The unchanged runtime queues observer notifications and removes the abort listener when settling a response. Its control observes unmount before `onDone`, an aborted form signal, an `ok` facade result, and one public-ID callback. This controlled success-response test does not itself perform or prove an IndexedDB commit.

Restore cancellation still makes the outcome uncertain. A truncated reconciliation inventory leaves retry disabled; a complete inventory allows a new explicit retry. Neither list automatically restores, attributes an existing ID to the interrupted operation, nor exposes an Open restored profile action. Only the successful explicit retry reports and opens the confirmed ID. Existing validation, secret extraction/clearing, export labeling and consent reset, uncertainty, and confirmed-ID handoff remain unchanged.

A canceled file read retains its controller until its promise settles. The retry controls begin after old-request settlement; they do not claim that reconciliation releases a still-pending file read. The result is per-form ownership, not global admission across independent forms or documents.

## Independently observed RED behavior

All twelve failures are ordinary `ERR_ASSERTION` mismatches, with no import, compilation, harness, or timeout failure. Diagnostics are emitted after late delivery, directly observing these effects:

| Controlled sequence on unchanged production | Recorded observation |
| --- | --- |
| Export duplicate, immediate teardown | Two facade attempts, one Worker command, original signal not aborted, one late download. |
| Create duplicate, Cancel and unmount | Two facade attempts, one Worker command, original signal not aborted, `onDone(null)` followed by the created ID, unlocked public state and publication. |
| Settled duplicate before unmount, all forms | Busy becomes false and a BUSY notice appears while the original remains pending; it is not aborted. Export downloads, Create reports its ID and unlocks, and Restore invokes its inventory-change callback after late reply. |
| Two held Restore reads, then Cancel | Forward and reverse release both allow a later facade call and Worker restore plus inventory callback. Retry remains visibly disabled, demonstrating that the disabled control alone did not preserve ownership. |
| Restore duplicate read finishes first | Empty-secret duplicate receives INVALID_INPUT and clears busy/ownership; the original read later dispatches after unmount. |
| Restore duplicate after runtime admission | Two reads; Cancel reaches the replacement controller while the original signal stays un-aborted, allowing a late inventory callback. |

The three refusal/retry cases fail on RED at their captured pending-state assertion. Their later successful-retry assertions are reached and pass on GREEN; no successful RED retry is claimed.

GREEN retains one admitted facade attempt and one relevant Worker command for runtime-stage cancellation cases. The original signal is aborted, the facade returns CANCELLED, and the late well-formed response reaches the real runtime listener without a download, successful callback, or unlocked publication. Canceled pre-read Restore cases record one read and **zero** facade calls, Worker restore commands, and inventory callbacks after the read finishes.

## Test composition and controls

| Layer | Executed boundary | Qualification limit |
| --- | --- | --- |
| Form | Maintained TSX is read and transpiled; real submit, cleanup, notices, and download helper execute. | Imports are supplied to a VM context; no native React mount. |
| Scheduling and inputs | Controlled state/ref/effect storage preserves a render's handler; fields, file reads, and download elements are fixtures. | Native DOM dispatch and React event scheduling are not established. |
| Facade and runtime | Actual startAppServices/AppRuntime execute admission, parsing, cancellation, generation checks, public state, and notifications. | Document lifecycle is disabled in this fixture. |
| Worker boundary | EventTarget records commands, holds replies, and dispatches correlated responses through the maintained runtime listener. | New regression does not run the Worker endpoint, IndexedDB, crypto, or native transport. |
| Export | Maintained schema encoder builds backup bytes from the existing vault fixture; runtime profile binding and exact downloaded bytes are checked. | Valid fixture response does not establish live storage or browser download behavior. |

The 19 cases cover three single teardowns; two immediate duplicates; three settled duplicates; forward/reverse held-file release; duplicate-read-first; Restore duplication after runtime admission; three refusal/fresh-retry cases; exact unchecked-export bytes and fresh consent; Create success-notification/unmount; canceled pre-read Restore; and truncated/complete reconciliation with explicit confirmed retry. Password fields, reset consent/file selection, and the runtime-stage Restore buffers are also checked in their respective controls.

Every mount registers teardown, unsubscription, and real-service disposal. Late delivery and observable effects are checked, not merely abort flags or Worker-post counts. Seven controls already pass on RED, including single-request cancellations and the Create success-notification path; twelve duplicate regressions distinguish the repair.

## Independent commands and results

Execution used Node `v24.22.3`, npm `11.19.1`, React/React DOM `19.3.1`, Vite `8.3.5`, and TypeScript `7.0.2`. Execution windows below are UTC on 2026-11-20. No test was cancelled, skipped, or marked todo; no check timed out.

| Check | Start–end UTC | Result |
| --- | --- | --- |
| Exact test-only RED | 18:06:22.846202–18:06:23.917563 | Expected exit 1: 7 pass / 12 fail |
| Identical regression, exact GREEN | 18:07:37.449649–18:07:39.093970 | Exit 0: 19/19 |
| Five affected suites, exact GREEN | 18:07:37.431727–18:07:42.278706 | Exit 0: 60/60 |
| UI TypeScript project | 18:07:37.414591–18:07:39.455038 | Exit 0 |
| Complete base-to-GREEN whitespace | 18:07:37.427793–18:07:37.451216 | Exit 0; no exclusions |
| Tree/source/dependency identity | 18:07:37.412538–18:07:38.030954 | Exit 0; all 16 invariants true |

Exact regression command, unchanged between RED and GREEN:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-reporter=tap --test-timeout=10000 apps/web/test/vault-form-admission.test.mjs
```

Affected suites, UI check, and complete source whitespace command:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-reporter=tap --test-concurrency=2 --test-timeout=10000 apps/web/test/unlock-form-admission.test.mjs apps/web/test/vault-forms-locale.test.mjs apps/web/test/app-services.test.mjs apps/web/test/app-runtime.test.mjs apps/web/test/pending-metadata.test.mjs
./node_modules/.bin/tsc -p apps/web/tsconfig.ui.json --noEmit
git diff --check f36a0a07dff55aa83b9d01a69501d049461d9b33...0df0e191e5829e66141d4ba9c028599ce9c91de2
```

The nineteen new cases are separate from the sixty affected cases. These runs overlap the author's and coordinator's checks and are independent repetitions, not extra unique coverage of their aggregate. Only the UI TypeScript project was independently run here.

## Evidence and integration limits

Combined stdout/stderr is retained without normalization in deterministic gzip files under `docs/engineering/evidence/remaining-vault-admission-independent-review-generation27/`. The receipt records decoded and compressed byte counts and SHA-256 hashes. Capture and identity scripts are retained as inspectable text with their hashes. Every gzip is decompressed and checked against its recorded decoded length/hash before handoff.

The complete source range and staged documentation/evidence candidate receive whitespace checks without path exclusions. Packaging evidence identifies its staged snapshot separately from the frozen production tree; appending a receipt is not described as retesting production. The final committed full range is checked again at handoff.

This reviewer launched no native browser and ran no full suite, build, hosted check, long financial journey, remote operation, release, deployment, trust change, optional-stack work, or broader ownership audit. The author's and coordinator's worktrees were not edited. PR233–235 remain frozen.

The coordinator owns combined-source qualification and any final aggregate against current main. This review neither qualifies that later aggregate nor replaces its complete current-target hosted gates. `ReleaseEnabled=0`; no release or real-funds readiness is inferred.

**Standards: 0 findings, worst issue none. Spec: 0 findings, worst issue none.**
