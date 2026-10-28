# P2P G03 confirmed restore → select → unlock

2026-10-26 UTC. Base `c0d2c8a18de760d1bede6da0cf94cd038ed93305`, branch `work/p2p-restore-commit-reconciliation-test-2026-10-26`. Coordinator owns integration; no workers started. Source/evidence commit follows this note; delivery receipt will record exact SHA/tree. Five changed runtime/test paths and frozen SHA-256 values are in `../evidence/P2P_RESTORE_HANDOFF_20261026.json`.

## Requirement and implementation

G03 section4 step6 requires selecting a new destination only after transaction-complete success; no persistent active-profile pointer exists in v1. This joins existing operations rather than introducing a new recovery or crypto subsystem.

- `VaultForms.tsx`: only a confirmed, non-aborted restore receipt creates **Open restored profile**. A new restore attempt clears the old offer; cancellation/stale replies and fresh inventory cannot create one. The explicit button passes the opaque ID only. Existing byte wipe, temporary passphrase variables and uncertain-result/retry gating remain.
- `App.tsx`: validates the ID, holds it in component memory and navigates to the constant `#/home`. Navigation away clears the handoff; reload/unmount discards it. No URL/query/profile pointer, browser storage, secret forwarding or new Worker command.
- `Pages.tsx`: Home selects that ID in the existing unlock form. If a profile is already unlocked, it explains the existing **Lock vault** control; no implicit lock, switch or unlock occurs. Successful locked→unlocked transition consumes the handoff, because the runtime notification can unmount the form before its reply. Cancel consumes it too.
- `UnlockForm`: pre-fills only the opaque ID and focuses a blank passphrase field. The user supplies the new passphrase through the normal existing unlock command; editing/manual selection remain available. No automatic credential reuse.
- `messages.ts`: truthful page-local selection and explicit-switch copy. Source preservation, fresh keys, 16-profile bound and runtime schemas/commands are unchanged.

## Executed evidence and retained failures

All10 raw logs are losslessly gzip-preserved with terminal records/timestamps and hashes under `docs/evidence/p2p-restore-handoff-20261026/`. The executed driver is retained there. Final browser/aggregate/build/policy/boundary commands share identical five-file hashes.

1. `01-red-missing-restore-handoff`: exit1 at the intended missing-action assertion (0 versus1). No application code changed before this RED.
2. `02-green-restore-handoff`: initial browser journey passed after minimal implementation. It proved selection alone does not unlock, old backup passphrase fails against the fresh destination, and a fresh new passphrase opens through normal unlock.
3. `03-expanded-browser`: exit1 at **successful unlock consumes the handoff**. This exposed an introduced lifecycle bug: the notification unmounts the form before its success callback. Home now consumes on the actual state transition, without treating initial already-unlocked state as success for the destination.
4. `04-final-browser`: exit1 from an undefined test-helper name. Corrected the fixture to use its existing fill helper and explicit file/consent/submit steps; no production fix was attributed to this test-authoring error.
5. `05-final-browser`: exit0, installed Chromium154.0.8037.57. Existing emitted-asset policy/layout/base-path/fallback/recovery matrix retained. New G03 join runs in the existing meta/root recovery scenario: exact confirmed ID; blank/fresh passphrase and old-passphrase refusal; no auto unlock; consumed success; cancelled/held stale success plus BUSY/truncated/fresh reconciliation never creates selection; already-unlocked restore requires explicit lock without implicit commands; reload **while selected** returns to manual selection; separate confirmed selection cancels without sticking. Original encrypted source remains byte-equal; existing cap16/truncation assertions retained. Synthetic destination creation adds two later profiles; the earlier four-profile assertion stays intact and later five-profile inventory is independently asserted.
6. `06-unit`: `npm test`, **379pass/0fail/0skip**, exit0. Browser assertions are not counted as additional Node tests.
7. `07-build-types`: `npm run build`, exit0, all four strict TypeScript configurations then the existing Vite build.
8. `08-boundaries`: exit0,46 production sources/18 core modules, but emitted `context canceled` before PASS. Original log retained. Existing checker closes its TS API in finally; exact internal cause not established. One isolated rerun `10-boundaries-isolated` passed exit0 without that diagnostic; no code/gate changed.
9. `09-build-policy`:5pass/0fail/0skip, exit0. Both emitted graphs inspected: no wallet/G16/Noble inclusion; ReleaseEnabled0, connectOrigins[] unchanged.

`test:browser` separate vault/runtime/content/reseal suite, Python/spec checks and other engines/devices were not rerun. Browser reports explicitly decline device, deployment, signed-release and release-acceptance claims. No thresholds, cases, deadlines, KDF parameters or failure evidence were weakened. This is coordinator engineering verification, not independent audit/provider acceptance.

## Restart and next gate

This bounded user-visible offline recovery join is implemented. Preserve the exact receipt pin and fresh-profile/source-retained semantics; uncertain inventories never identify which job created a row. No G16 app inclusion occurred. Existing G16 Node-only public-data review does not establish browser qualification; four other crypto reviews remain pending. Native-vault/browser review and any later offline G16 Worker/UI inclusion are engineering work, not blanket owner-only blockers. Native authoritative contract/ABI/reader, trusted journal reconciliation, registry/manifest roots, wallet/escrow/offer/trade wiring and independent/two-party acceptance remain substantial separate dependencies before trading.

No GhostPay edits, source pushes/CI/merges, deployments/releases, wallet prompts/network transactions, new dependencies, Claude/paid calls, credentials/security/network changes, replacement environment or denied retries. Same private Library checkpoint `libfile_b5734354657c81919d25ed4930348dc9`, expected version6, will be replaced only after source commit and patch reconstruction check. Versions0–6/canonical queue stay preserved. Producer success is not consumer retrieval or a whole-repository restore; exact delivery receipt follows.
