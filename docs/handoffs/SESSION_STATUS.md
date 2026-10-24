# Session status

Session: https://claude.ai/code/session_01BAvLvxSNjWLPiMmSdfUyJQ, 2026-10-24 UTC.
Owner: this session is the only integration owner for `djshellshoxxx/p2p-offramp`. A sibling session owns GhostPay; the two share no files.
Workers: none spawned. The work was sequential because the context was already loaded, and a cold worker would have to re-read the same files. No model routing claim is made.
Account usage indicator: not observable from this environment. Work proceeded in small pushed checkpoints.

## Baseline (reconciled)

- Remote `main` is `28bc32f1c8ea98d6216b2e1509b1fb5e3374bcfa` (scaffold and docs only).
- Most complete compatible baseline: PR #4 `work/p2p-client-shell-2026-10-24` @ `8a88d11d8e419cd402b28428947e8fe4fbcfe893`.
  By ancestry it contains PR #3 `3df560f`, the reconstruction `bc996aa`, PR #2 `6b6004b` and PR #1 `0ea82de`.
- The work branch `claude/adoring-wozniak-850ue6` was fast-forwarded from `main` to `8a88d11`. Nothing was lost.
- `feat/custodial-ledger-foundation` (`52e6987`) is an incompatible custodial design. It is excluded and was NOT merged.
- The reported capacity fix `fc146bb911319bb8f9c93855deaad2df18c3782e` is **not present** in any remote ref or in the local object DB, so it was not recovered.
  The capacity bound below is an independent implementation built against the visible source.

## Current

- Branch `claude/adoring-wozniak-850ue6`. The latest verified remote SHA is in `git ls-remote origin refs/heads/claude/adoring-wozniak-850ue6`.
  Checkpoints: `c606806` (storage), `de788e2` (runtime), `0b8caa0` (UI), then this docs commit.
- PR #5 (draft, base `work/p2p-client-shell-2026-10-24`, i.e. stacked on PR #4): https://github.com/djshellshoxxx/p2p-offramp/pull/5
- Open PRs #1–#3 are ancestors of #4. PR #4 is unmerged and its old green checks do not cover the PR #5 commits.
- There are no unpushed commits at checkpoint time.

## Completed ledger (this session, verified by the tests below)

1. Profile capacity (G02 resource bound): `MAX_VAULT_PROFILES=16`. Count and add run in one IDB readwrite transaction, so the bound holds across tabs. CAS updates at the bound still work.
2. Profile inventory: `listProfileIds` and `listProfiles` read keys only, flag truncation, and fail closed on foreign keys without deleting them.
3. Worker/runtime protocol has `create`, `restore` and `listProfiles`, with strict command and reply parsers:
   - Restore input is a bounded copy of a genuine `Uint8Array`.
   - A restore reply carries only `{newProfileId, records}`.
   - A checksum mismatch maps to `INVALID_INPUT`.
   - A stale create never attaches a session.
4. UI:
   - Create form with confirmation and no-reset consent; it is disabled at the bound.
   - Inventory choices in the unlock and export forms.
   - Restore form: size checked before reading, untrusted-content consent, fresh-key result stays locked, secrets cleared.
5. Bug found and fixed: CreateForm unmount cleanup suppressed reporting the new profile ID. It reproduced in the emitted-app Chromium test.

## Changed files (vs 8a88d11)

packages/schemas/src/{vault,runtime}.ts; packages/storage/{index.ts,src/idb-vault-store.ts,src/vault-service.ts};
apps/web/src/{app-services.ts,runtime/app-runtime.ts,runtime/worker-endpoint.ts,ui/Pages.tsx,ui/VaultForms.tsx,ui/messages.ts,ui/app.css};
tests: packages/storage/test/{idb-vault-store,vault-service}.test.mjs, packages/schemas/test/runtime.test.mjs,
apps/web/test/{app-runtime,app-services,worker-endpoint}.test.mjs, scripts/test-{vault,runtime,web-build}-browser.mjs;
docs: DEVELOPMENT_STATUS.md, adr/ADR-CLIENT-SIDE-2026-10-24.md, handoffs/*.

## Tests rerun this session (Node v22.22.0; package `engines` says >=24, no failure seen; Chromium 153 local)

| Command | Baseline 8a88d11 | At 0b8caa0 |
|---|---|---|
| `npm ci` | ok | ok |
| `npm test` | 273/273, 0 skipped | 286/286, 0 skipped |
| `npm run typecheck` | exit 0 | exit 0 |
| `npm run test:browser` (3 Chromium fixtures) | exit 0 | exit 0 (adds two-tab capacity race + native Worker create/restore/inventory) |
| `npm run build` / `check:boundaries` / `test:build-policy` (5) | not rerun before change | exit 0 / PASS / 5 pass |
| `npm run test:web:browser` | not rerun before change | exit 0 (adds UI export→restore→create→inventory→unlock journey) |
| `npm run check:specs` / `test:specs` | n/a | 173 docs, 0 broken links / OK |

The new storage tests were confirmed RED against the old `idb-vault-store.ts` (2 failures) before the change.
Remote CI for PR #5 was queued at the time of writing. Check `pull_request_read get_check_runs`.

## Known gaps, not done

- Safari/Firefox, physical devices, deployed headers, and any independent audit have not been done.
- Cross-tab capacity evidence is Chromium only.
- `MAX_VAULT_PROFILES=16` is an implementation bound. It is not yet written into the G02 spec text. Ratify or adjust it there.
- Inventory lists IDs only, with no labels. Labels would need encrypted metadata, which is a deliberate non-goal for now.

## Remaining work (dependency order)

1. Get PR #4 then PR #5 reviewed and green on the exact head, then merge. Do not force-push.
2. G09 vault schema migration registry (upgrade, rejected downgrade, interrupted resume).
3. G11 signed network/asset/deployment registry + G15 artifact manifest/digest verification.
4. H1 canonical signed trade terms. Then H2 EVM escrow (Foundry, local anvil only) and H4 signing/reconciliation adapters. Then M5/H5 transport/discovery.
5. Trade journey UI (M7) after those gates. Then Solana parity (H3). Keep `ReleaseEnabled=0` throughout.
