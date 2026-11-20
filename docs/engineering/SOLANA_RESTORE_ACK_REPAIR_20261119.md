# Solana restore acknowledgment and file-input lifecycle repair

## Result and source identity

The Solana recovery page now distinguishes immediate private-data redaction
from completion of the pending Worker command. Restore and profile inputs stay
disabled until acknowledgment, while lock clearing still happens immediately.
The page also invalidates and clears obsolete asynchronous backup reads. The
existing browser harness waits for this authoritative UI readiness after lock.

This is a separate product lifecycle repair from the earlier withheld-send
acknowledgment fixture correction. The already published PR202 source and its
running qualification were not modified. No actual Chromium execution is
claimed for this new source; the additive short browser gate and the retained
real-validator/browser gate require hosted qualification.

| Identity | Exact value |
| --- | --- |
| Published PR202 starting source | `d753c0af23ff43743e34679e6b778b9ac0370da2` |
| Starting tree | `25d637fa5d6596e44cdae060ccc407f0c23186ee` |
| RED checkpoint, original product source and four regressions | `3ebb2e7c4c742812858b3c542ef4387a7d5d799d` |
| Repaired source, ownership regression, and additive browser gate | `6207d14bf83213847620b0dd1541f2c7d2e3b893` |
| Repaired source tree | `75d068cc66e3138c89542550d2d6909600f1f68a` |
| Isolated branch | `codex/solana-restore-ack-20261119` |

The author read the persisted handoff and state before implementation, applying
the coordinator's newer hosted facts where those documents still described
PR188/189 as running. Those two old heads failed the duplicate-send assertion;
their successful restore journeys do not prove that this separate timing race
is absent. November 19 is the America/Vancouver work date; log times below are
November 20 UTC.

## Actual hosted failure

GitHub job `135987836079` for
[PR197](https://github.com/djshellshoxxx/p2p-offramp/pull/197) was fetched directly
through the read-only job-log and job-step interfaces. PR metadata named source
head `86952b1ccc8eb9c25a3be05d6a32d3c556df8c84`. The log confirms checkout
`3847e6f49337317a2c402e2f4eb94730959fcf12`, the merge of that head into PR190
`2b23ee614ff2dd05bd3a6e79f1278658c30a3909`.

| Observed event | UTC time or result |
| --- | --- |
| Real validator client acceptance, step14 | Success |
| Actual browser release followed by separate payout | Passed at `01:11:37.5766232Z` |
| Earlier withheld-send duplicate signature observer | Failed at `01:11:38.3990201Z` |
| Fresh-key restore button | Resolved to a disabled button throughout the subsequent click wait |
| Browser stage failure | `45000ms` timeout at `01:12:23.9931616Z`, harness line126 |

The browser did not reach its later refund journey in this run. Its log does not
record which restore input was empty or the relative delivery time of every
Worker message. The deterministic reproduction below demonstrates a product
race capable of the same disabled-button outcome; it is not an invented browser
trace or proof that every possible restore failure has this cause.

The component, client, controller, and full Solana browser harness at the PR197
head compare byte-identically to the PR202 starting source used here. The
earlier 503 fixture correction does not alter any of those lifecycle paths.

## Reproduced boundary

`createSolanaRecoveryClient.request({ type: 'profile.lock' })` synchronously
revokes the document's authority and publishes a blank, locked projection
before the Worker acknowledgment. This immediate redaction is required and is
unchanged.

Previously, `SolanaLocalnetRoot` derived `busy` only from the Worker snapshot's
phase. The immediate blank projection therefore exposed enabled restore inputs
while the lock request was still pending. Its subscriber correctly cleared
private fields on each later null-profile snapshot. Inputs accepted in the gap
could consequently be erased by the actual lock snapshot/result. Waiting only
for an empty profile ID, or for the old phase-based idle predicate, did not wait
for acknowledgment.

The RED witness executes the actual component handlers and actual document
client against the actual encrypted controller. It holds delivery of the
controller's real lock messages. Before delivery, the profile ID is empty,
`aria-busy` is false, the backup input is enabled, and completing the restore
fields enables the Restore button. Delivering the real lock snapshot/result
clears both entered passphrases and disables Restore again. The test then fails
the required pending-command readiness assertion.

Three additional RED cases show that the original async file callback retains
its returned buffer after a visibility lock, component unmount, or explicit
profile opening. The original callback has no input-generation guard, so a
late completion can also install obsolete bytes into component state.

## Narrow product correction

Only `apps/web/src/solana-localnet/SolanaLocalnetRoot.tsx` changes production
source. The component owns the pending command state immediately, before
calling the existing client. A command generation prevents an older completion
from clearing a newer pending state or publishing a stale result. Lock and
review cancellation remain able to interrupt pending work. `aria-busy` includes
both the local pending command and the existing Worker working phase.

Profile selection, profile passphrase, backup selection, and restore
passphrases are disabled while busy. The component retains the existing
unconditional clearing on null-profile snapshots and adds explicit file-input
clearing. Visibility lock goes through the same pending-command owner. The
native client still redacts synchronously and retains all its authority fences.

Each backup read captures an input generation and its owning client. On return,
it must still belong to the active component and current locked input scope,
with no pending command or working Worker. Otherwise its returned byte view is
zeroed and never installed. Replacing a selected backup or clearing private
state also zeroes the previous selected buffer. Unmount and profile transitions
invalidate reads; an old configuration completion cannot create a client after
unmount.

Restore explicitly transfers ownership of the selected byte view out of the UI
backup reference before clearing the form. The unchanged document client posts
the command synchronously. After `postMessage` has cloned the payload, the page
zeroes its submitted view. Refusal and exceptional paths also dispose it. No
zeroed buffer is sent in place of the user's selected encrypted backup.

The dedicated ownership regression inspects the independently cloned command
bytes, requires the document buffer to be zero immediately, and completes a
successful restore through the real encrypted controller into a distinct
profile. This verifies application-owned byte-view disposal; it does not claim
to erase an immutable browser File, operating-system buffers, or every runtime
copy.

## Regressions and actual checks

The new test file is
`apps/web/test/solana-localnet-restore-lifecycle.test.mjs`:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test apps/web/test/solana-localnet-restore-lifecycle.test.mjs
```

At the immutable RED checkpoint, all four tests fail for the documented
readiness and stale-buffer assertions. The same four pass after correction.
Adding the explicit successful payload-ownership regression gives five passing
tests. These tests use render-only hook stubs, controlled Worker message
delivery, and a memory VaultStore. The maintained component, document client,
controller, cryptography, and encrypted backup operations execute. They do not
claim a React DOM, native Worker, IndexedDB, or actual browser execution. They
require zero wallet and RPC calls throughout.

| Check actually executed | Result |
| --- | --- |
| Focused RED checkpoint | 0/4 passed; four expected failures; no skips |
| Same four regressions after correction | 4/4 passed; no failures or skips |
| Final focused suite with ownership regression | 5/5 passed; no failures or skips |
| All `packages/chain-solana/test/*.test.mjs` and `apps/web/test/solana-*.test.mjs` | 339/339 passed; no failures or skips |
| `npm run typecheck` | All four configured TypeScript projects passed |
| `npm run check:boundaries` | Passed; 234 production files, 140 core-entry modules |
| `npm run test:build-policy` | 54/54 passed; no failures or skips |
| `node apps/web/scripts/build.mjs` | Default artifact build passed; 12 scanned emitted assets, 715,318 bytes; release acceptance false |
| New browser script syntax | `node --check scripts/test-solana-restore-browser.mjs` passed |
| `buildSolanaRestoreArtifact()` only, without launching a browser | Actual Solana artifact build and graph assertions passed; 11 assets; asset-list digest `54937986dbf48ed92cb1ebf72ad1a003ba95f7283514f1ecd8f21de58201a946` |
| Command/workflow preservation | All 53 prior npm commands and 129 prior physical foundation lines preserved; one command and four lines added; package metadata unchanged |
| Protected-path comparison and `git diff --check` | Passed |

## Short actual-browser gate and retained financial qualification

`npm run test:solana:restore:browser` runs the new
`scripts/test-solana-restore-browser.mjs`. The additive foundation step follows
the existing withheld-acknowledgment diagnostic. It serves the actual maintained
Solana artifact and requires its actual native module Worker, encrypted
IndexedDB rows, and successful backup restore into a different profile and key.
The original encrypted row must remain unchanged.

External test instrumentation delays delivery of one lock command's actual
Worker responses; it does not manufacture result messages or replace the Worker.
The gate checks immediate private redaction, busy state, and disabled restore
inputs while those real responses are held. Only after delivering them does it
fill and submit a backup. A wrapper around the native File read later holds its
actual returned ArrayBuffer while an explicit profile opening supersedes the
input. The obsolete buffer must be zero when released. The submitted buffer is
also observed zero after the successful native Worker restore.

This short check uses an empty encrypted profile and structural local config.
It imports no funded receipt, starts no validator, performs no RPC, and permits
no wallet prompt or transaction. Unexpected network traffic, WebSockets,
page errors, extra restore commands, or non-profile command types fail. Its
receipt explicitly reports zero wallet/RPC/financial calls,
`nativeChainQualified: false`, and `ReleaseEnabled: 0`. The emitted artifact was
built locally; this browser journey has not been executed locally.

The existing full harness now uses the page's authoritative `aria-busy` state
and waits for it after lock before entering restore data. All existing cases,
send counts, signature uniqueness, durable markers, restored provenance,
explicit fresh-signature replacement, payout and fee assertions, timeouts, and
real refund waits remain. Its Solana workflow is unchanged. Native client,
controller, RPC, protocol, packages, contracts, send observers, the 503 helper,
and its transport diagnostic are unchanged from the published PR202 base.

## Retained logs and remaining qualification

The coordinating workspace retains these files in `verification`. Their hashes
bind the executed evidence above, not a later integrated source or hosted run.

| Log | SHA-256 |
| --- | --- |
| `pr197-solana-restore-failure.log` | `7ef3b69ed62c822e58ed0eafd52d392ba37cbaf3d6606a9df9f46b4a548fe3ba` |
| `solana-restore-ack-red.tap` | `918314db6d826cbde8063a2d8343027b074b4a88507f8ffe32d2e019fc2a6f6d` |
| `solana-restore-ack-green.tap` | `e4110d727f4466ed15925bd5b9b1d61321d493674ff4ea6ee165d70ebe643dbe` |
| `solana-restore-ack-ownership-green.tap` | `b1559245595d9402ba4302c6159a4e41961b710ff8d64e7701c043c781dad668` |
| `solana-restore-ack-affected.log` | `9c6bc946890dcda2e12d4cd8e8b5de4c2269ea111191dacace54c649ef833f47` |
| `solana-restore-ack-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `solana-restore-ack-boundaries-build-policy.log` | `7081e6e3b2d8bd993cd1aaa1c5641edb99abcfccd216a79f54a94307c28bee1a` |
| `solana-restore-ack-default-build.log` | `99742fe3ce7cc88b38823e906e6436b1ebd71c858e94b254d945e8fd9696a96a` |

No remote write, workflow retry or cancellation, merge, release, dependency
change, local Chromium launch, socket-policy bypass, or refund timeout reduction
was performed. The coordinator owns independent review and publication. The
remaining execution gate is the actual emitted-browser diagnostic and retained
native financial/browser qualification on the repaired exact head.
