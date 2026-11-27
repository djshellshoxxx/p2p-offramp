# G27 author qualification: remaining vault form request ownership

## Result

ExportForm, CreateForm and RestoreForm reproduce the request-ownership defect through their maintained handlers and the actual AppServices facade and AppRuntime. The frozen regression has **7 pass / 12 fail** on unchanged production, then **19/19 pass** with the identical test bytes after three guard-line replacements. The affected suites pass **60/60**, including all eight G26 UnlockForm cases, and the UI typecheck passes.

The production repair changes each form's existing `if (busy) return` to `if (busy || request.current !== null) return`. The existing ref acquires ownership synchronously; the duplicate therefore cannot replace that controller before a busy-state rerender or while a Restore file read is pending. No other production logic changes.

This is author qualification of the maintained handler/facade/runtime composition under controlled hook scheduling, file reads, downloads and Worker replies. It does not establish native browser event reachability or a physical cryptographic create/restore. Independent review and a later combined-source full suite remain with the coordinator.

## Frozen identities

| Role | Commit | Tree |
| --- | --- | --- |
| Assigned base, including G26 | `f36a0a07dff55aa83b9d01a69501d049461d9b33` | `e465bb6894fa4d890255ad045c68398e3aae9a5c` |
| Test-only RED | `515a7c945b6bef136c3ede436577635b17ccd4e2` | `ae419673f5930a09e96aa19db26e8537e3cbb931` |
| Source GREEN | `0df0e191e5829e66141d4ba9c028599ce9c91de2` | `69395d2cc344ba360cddb0ca3e1b19884a568ed9` |

The regression file is `apps/web/test/vault-form-admission.test.mjs`, Git blob `42136f64ef31c1bf646ae1d67946e363a3db48cd`, SHA-256 `ff52ac643512849b2178977b8d07d4affe688a9b460bc91a0add033984a538b4`. Its bytes are identical in RED and GREEN. Both frozen regression runs and all affected gates started and ended on their exact clean source commits.

Complete tree comparison verified that RED preserves all 2,764 base entries and adds only the regression. GREEN changes only `VaultForms.tsx` from RED, exactly matching the three expected guard replacements. All 2,763 other base entries remain identical. The complete G26 UnlockForm section and its regression are preserved.

## Observed failures

The RED log includes explicit observations collected after the late replies are delivered. These are outcome observations in addition to failing ownership assertions.

| Form and sequence | Observed on unchanged production |
| --- | --- |
| Export duplicate, immediate or settled teardown | Two facade attempts, one Worker command, original signal not aborted, one controlled download after unmount. |
| Create duplicate, Cancel and unmount | Two facade attempts, one Worker command, original signal not aborted, `onDone(null)` followed by the created ID, and an unlocked public notification after the late accepted success. |
| Create settled duplicate, then unmount | The duplicate's real `BUSY` refusal clears the busy indicator and the request ref while the admitted create remains pending; late success invokes the callback and publishes unlocked. |
| Restore duplicate while both file reads are held | Two reads begin. Cancel/unmount leaves the original controller unowned; its eventual read can dispatch a restore and invoke the inventory callback. Forward and reverse read release reproduce the outcome. |
| Restore duplicate read finishes first | Its now-empty secret inputs cause a real runtime `INVALID_INPUT` refusal. That duplicate clears busy/ref ownership while the original read remains pending. The original can dispatch after unmount and later invoke the inventory callback. |
| Restore duplicate after runtime admission | Cancel can target the duplicate's controller while it is still awaiting its read; the already admitted request survives and invokes the inventory callback after its late success. |

The runtime continues to admit only one Worker command in the overlapping-command cases. The defect is the UI losing the admitted controller or the still-pending original file read, rather than a change to runtime admission.

## Preserved behavior

The same regression verifies ordinary cancellation for all three forms and delivered late-success suppression. Export still produces the exact labeled unchecked backup bytes and consumes consent; a subsequent export needs fresh consent. The affected locale suite also retains its validation, consent, secret-clearing and notice coverage.

Create and Restore clear their password fields on submission. An original refusal remains visible, ownership releases on completion, and a fresh explicit retry succeeds. Create still reports the profile from an accepted success once when the runtime's unlocked notification unmounts the form before its awaited success reaches the handler. That behavior is distinct from cancelling a still-pending create and is preserved deliberately.

Restore cancellation still presents uncertainty. Truncated inventory leaves retry disarmed; a complete inventory permits an explicit retry without attributing a listed profile to the interrupted operation. Only the later confirmed restore creates the profile handoff. The successful read buffers are cleared, and success resets the form and consent.

An aborted Restore file read retains `request.current` until its asynchronous body reaches `finally`. The tested fresh retry follows original-request settlement and complete reconciliation. These tests do not claim admission of a replacement while the cancelled read remains unresolved. No cooldown, clock, attempt count or broader retry policy was added.

## Executed gates

| Check | Result |
| --- | --- |
| Frozen 19-case regression on RED | Expected exit 1; 7 pass / 12 fail |
| Identical regression on GREEN | Exit 0; 19/19 |
| G26 UnlockForm, vault locale, facade, runtime and pending metadata suites | Exit 0; 60/60 |
| UI typecheck | Exit 0 |
| Full base-to-source whitespace check | Exit 0 |
| Complete tree/blob identity comparison | Exit 0; all eight assertions true |
| Full base-to-evidence whitespace check, including every added path | Exit 0; no path exclusions |

No test run timed out or had cancelled, skipped or todo cases. A development run using the final test bytes is retained separately from the exact frozen RED. There were no harness test errors; the two patch-tool dispatch failures occurred before any file was written or test executed and are not product evidence.

Exact regression command:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-reporter=tap --test-timeout=10000 apps/web/test/vault-form-admission.test.mjs
```

The companion JSON records exact commands, timestamps, source identities, exit statuses, counts and hashes. Combined stdout/stderr is retained losslessly in deterministic gzip files under `evidence/vault-form-admission-generation27/`; each file was decompressed and checked against its decoded byte count and SHA-256. Both compressed and decoded hashes are recorded. Capture and source-identity scripts are retained as text.

The worktree is isolated at `/workspace/scratch/dcf03ef9bee8/p2p-remaining-vault-admission-g27`, branch `codex/remaining-vault-admission-g27-20261120`. No browser launch, full suite, financial test, remote operation, publication, release/trust change or wider ownership audit was performed.
