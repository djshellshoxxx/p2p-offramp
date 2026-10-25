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
6. G09 in-place migration core (`packages/storage/src/migration-service.ts`):
   - `MigrationRegistry` validates registry shape: adjacent steps only, no duplicates, a schema for every version, so it is acyclic by construction. Max 64 steps per record.
   - `RecordMigrationService.plan/apply` builds the whole candidate from one consistent snapshot. Any failure discards it.
   - Apply recomputes the plan and rejects a supplied plan that differs (CONFLICT). It commits once with G02 CAS and verifies by readback.
   - Future-version records or missing paths return UNSUPPORTED_VERSION with no write.
   - More than 256 changes returns LIMIT_EXCEEDED.
   - **Gaps:** the G03 `InternalMigrationResealer` new-profile path is not implemented. `sourceKeyId` is omitted from the plan because the session does not expose it. The registry is empty in production, since every consumer schema is still v1. There is no UI.
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
2. G09 remainder: G03 resealer staged new-profile migration for >256 changes or fresh-key needs, and interrupted-resume tests. The in-place core is done.
3. G11 signed network/asset/deployment registry + G15 artifact manifest/digest verification.
4. H1 canonical signed trade terms. Then H2 EVM escrow (Foundry, local anvil only) and H4 signing/reconciliation adapters. Then M5/H5 transport/discovery.
5. Trade journey UI (M7) after those gates. Then Solana parity (H3). Keep `ReleaseEnabled=0` throughout.

## Continuation 2026-10-25 UTC (same session, after owner PR #6 lean-scope docs at `a35577c`)

Lean scope (`LEAN_RELEASE_SCOPE.md`, `RESTART.md`) now governs priority. The owner's documents were left unchanged. The private review packet has not been received, so no packet case was reproduced.
- **G09 durable result.** Before this fix, `apply` reported an error when a lock, cancel or readback failure happened after a committed CAS, which hid a durable migration. It now returns `{profileId, revision, verified}`; `verified: false` means committed but unconfirmed. RED test reproduced the bug first.
- **G09 no-op preflight.** Verified no write, no commit call, and cancel/lock still refused (`migration-service.test.mjs`).
- **Typed quota.** `QUOTA_EXCEEDED` is now a runtime error code. The Worker previously collapsed it into `STORAGE_UNAVAILABLE` for create, restore and inventory. The UI now shows a quota-specific message. RED test reproduced first.
- Reruns at this commit: `npm test` 295/295, 0 skipped. `typecheck`, `check:boundaries`, `test:build-policy`, `build`, `test:browser`, `test:web:browser` and `check:specs` all exit 0.
- Still open in lean order: source-bound G03 resealer (new-profile migration with source retained, interrupted resume, cross-tab), then G11/G15 → G16 → wallet/escrow/offer/trade UI → two-party local EVM proof.
- **G03 source-bound resealer** (`InternalMigrationResealer.migrateAndReseal`, storage-internal `EncryptedVaultService.resealSnapshot`, store `addWithSource`):
  - Copies a live session's authenticated snapshot through a bundled registry (looked up by ID; imported code is never accepted) into a new profile with fresh profile ID, key ID and KDF. The new profile starts at revision 0 and is locked.
  - The source is retained byte-identical.
  - Record IDs and kinds are preserved. Drop, duplicate and relabel are rejected.
  - G02 bounds are re-applied, and the destination is authenticated by round-trip before the add.
  - The source row is rechecked inside the destination add transaction, alongside the 16-profile bound: a concurrent commit returns CONFLICT, never a copy that silently omits work.
  - A durable add is reported even if a lock arrives afterwards.
  - Not exposed through the Worker or backup import.
  - Tests: `reseal.test.mjs` (5), an IDB `addWithSource` unit test, and a real Chromium two-tab test (stale source conflicts; fresh source copies, including the other tab's work).
- **Not done:** UI or Worker exposure of migration/reseal (the production registry is empty because every schema is v1); page-crash interrupted-resume evidence for reseal; Firefox/Safari.
- Reruns at this commit: `npm test` 301/301, 0 skipped. All of `typecheck`, `check:boundaries`, `test:build-policy`, `build`, `test:browser`, `test:web:browser`, `check:specs` and `test:specs` exit 0.

## Report for coordinator (2026-10-25 ~08:45 UTC)

- **Branch and head:** `claude/adoring-wozniak-850ue6`. Code head `1fe9efe693f90a85614e9fab5781e717d0b7fad0`, verified with `git ls-remote` before this docs commit. Read the final SHA from `git ls-remote origin refs/heads/claude/adoring-wozniak-850ue6`.
- **Local state:** no unpushed commits and no uncommitted files at report time.
- **Tests at `1fe9efe`:** `npm test` 301/301, 0 skipped. `typecheck`, `check:boundaries`, `test:build-policy` (5/5), `build`, `test:browser` (incl. two-tab capacity race and two-tab G03 reseal), `test:web:browser`, `check:specs` and `test:specs` all exit 0.
- **CI:** PR #5 at `1fe9efe` passed all 8 check runs (Vault foundation: schemas-and-crypto, browser, specs; Specification inventory: inventory; each for push and pull_request).
  - The repo has no Nightly or scheduled workflow (`list_workflow_runs event=schedule` returns 0).
  - `Payments Ledger CI` exists only for the excluded custodial branch.
- **v29 prep pack and private review packet:** **not in this container** (filesystem search found nothing). No packet case has been reproduced. The G03/G09 work follows the existing spec text only, not an approved clarification.
- **Blockers / owner decisions:**
  - Trust root (signing keys) for G11/G15.
  - Confirmation of the order relative to the GhostPay core milestone (`RESTART.md`).
  - Ratification of the 16-profile cap in the G02 text.
- **Next concrete step:** G11/G15, once a trust root is decided. Reseal interruption evidence is now done; see below.
- **Reseal interruption (Chromium, real IndexedDB):** the document was closed 0/50/300/900/2500 ms into a reseal. Outcomes were absent, absent, absent, copied, copied, identical across 3 runs.
  - The source row stayed byte-identical and unlockable every time.
  - Any destination row was a complete, authenticated, migrated profile. No partial rows were found.
  - Recovery after interruption means re-running the reseal. A copy that already completed is kept, never auto-deleted (G03). This is a page close; an OS or browser process kill was not tested.

## v29 review-queue reconciliation (2026-10-25)

The owner supplied the v29 packet archive. It is held privately in the session scratchpad, and nothing from it is committed.
The archive's P2P packets reviewed PR #5 up to `809b669`. Mapping to the current branch:

| Packet finding | State now | Evidence |
|---|---|---|
| G09 P1 durable outcome | Resolved in `809b669` (packet agrees). **Readback now persisted:** after commit, `verified` requires an authenticated decrypt of the stored row with the live key (`readPersisted`/`decryptRevision`, no key derivation, exact-envelope check), the expected record count, every record at its target version, and migrated payloads byte-equal to what was written. RED first: a row that diverged after commit was wrongly reported `verified:true` from the cache. A fresh-unlock byte check passes. | `migration-service.test.mjs` durable-lock test |
| **G09 P2 stale empty plan** | **Fixed in this commit.** RED reproduced first in unit and real two-tab Chromium tests. The fix adds a read-only `EncryptedVaultService.assertFresh` (exact-envelope compare, serialized with commits, no write or encryption; locks the stale session like commit). A fresh no-op still makes zero writes and no commit call. | Unit test: added record, future-schema record, and same-revision envelope substitution all return CONFLICT with no write; fresh no-op control passes. Browser: two-tab stale no-op returns CONFLICT; a fresh replan sees the other tab's work. |
| G03 R2 quota | Resolved. The quota code now survives Worker → strict reply parser → AppRuntime → facade for both restore and create, and maps to the fixed quota message rather than STORAGE_UNAVAILABLE. The UI treats it as a definite refusal, not uncertain. **A real-browser quota failure could not be reproduced**: Chromium 153's DevTools `Storage.overrideQuotaForOrigin` (even `quotaSize: 1`) did not block IndexedDB writes from the Worker, and the restore succeeded. That attempt was removed rather than kept as a false proof. | `worker-endpoint.test.mjs`, `app-runtime.test.mjs` quota test |
| G03 R1 uncertain restore → reconcile before retry | **Fixed.** After Cancel, or after CANCELLED/TIMEOUT/STORAGE_UNAVAILABLE/LOCKED/PROTOCOL_ERROR, Restore stays disabled behind a 'may have completed' alert. **Check local profiles** runs a fresh inventory and lists all profiles without attributing any of them to the job; only then is retry enabled. Definite refusals still allow retry. RED reproduced in the emitted-app Chromium test first. | `test-web-build-browser.mjs` R1 block |
| G03 source-bound resealer / resume | Covered by `1fe9efe` + `dea276f`, plus `scripts/test-reseal-crash-browser.mjs` (now part of `npm run test:browser`). Every Chromium process for a persistent profile directory is SIGKILLed 0/200/600/1200/3000 ms into a reseal, and the test asserts the kill actually happened. After relaunching on the same on-disk profile: source byte-identical and unlockable, any destination complete and migrated, and no partial row. Outcomes are timing-dependent (absent ×2, copied ×3). Chromium/Linux only; not covered: OS power loss, or Firefox/Safari. | `reseal.test.mjs`, browser reseal blocks |
| Saturated-origin export → fresh-origin fresh-key locked restore, source retained | **Covered (new evidence, no fix needed).** Starting with 16 profiles, export works; restore at a different origin with fresh storage gives revision 0, a distinct ID, the old passphrase refused, the record intact, and the restored profile locked until opened with the new passphrase. The source row is byte-identical and the full origin still holds 16. | `test-vault-browser.mjs` saturated-origin block |

16-profile cap: this is the engineering default, not a blocker. G11/G15 trust root: an unresolved owner decision; no signer, credentials or trust policy has been chosen.

Reruns at this commit: `npm test` 302/302, 0 skipped. `typecheck`, `check:boundaries`, `test:build-policy`, `build`, `test:browser`, `test:web:browser`, `check:specs` and `test:specs` all exit 0.

Next, in order:
1. (done) Saturated-origin recovery.
2. (done) G03 R1 restore reconciliation.
3. Quota through to the emitted UI.
4. Fresh-unlock persisted readback for migration.

## Handoff checkpoint (2026-10-25 ~11:30 UTC)

- **Branch:** `claude/adoring-wozniak-850ue6` (draft PR #5, stacked on PR #4 `8a88d11`, then `main` `28bc32f`). Verify the head with `git ls-remote`.
- **Commits this session after `dea276f`:**
  - `240d04c`: G09 P2 stale empty-plan fix.
  - `d37513c`: saturated-origin recovery evidence.
  - The R1 reconciliation commit that follows this table.
- **CI:** all checks were green through `d37513c` (check-suite events). Recheck on the R1 commit.
- **Local reruns at the R1 commit:** `npm test` 302/302, 0 skipped. `typecheck`, `check:boundaries`, `test:build-policy`, `build`, `test:browser`, `test:web:browser`, `check:specs` and `test:specs` all exit 0 (Node 22; CI uses Node 24).
- **v29 archive:** private, in the session scratchpad only, never committed. The next agent needs the owner to supply it again.
- **Remaining, in order:**
  1. (done, at unit/strict-parser level) Quota through to the UI. A real-browser quota failure is still unproven.
  2. (done) Persisted readback for G09 migration.
  3. (done) Reseal under a Chromium SIGKILL.
  4. G11/G15, **blocked on the owner's trust-root decision**. Do not invent signers, credentials or trust policy.
  5. G16 → wallet/escrow/offer/trade UI → two-party local EVM proof.
- **Unchanged rules:** cap 16 is the engineering default; `ReleaseEnabled=0`, `connectOrigins: []`; no real funds; no merging of PR #4/#5 or the custodial branch; no force-push or deploy.

### v29 `profile-ui-lifecycle` packet (low priority, display only)

- **H1, fixed.** Opening the unlock form clears an earlier creation receipt, so profile A's receipt no longer appears next to unlocked profile B. RED reproduced by reverting only this line.
- **H2, fixed.** After a confirmed restore or reconciliation, Recovery's export list refreshes once (one bounded refresh, no polling, no writes); the new profile appears without remounting the page. RED reproduced first.
- Both are covered in `test-web-build-browser.mjs`. No current-profile pointer and no new authority were added.

### G11 registry load/lookup (no trust-root decision needed)

- `packages/schemas/src/registry.ts`: a strict, bounded `parseRegistryBytes` with G11 v1 types. It:
  - checks UTF-8 in fatal mode (BOM rejected);
  - parses a JSON subset that rejects duplicate keys, prototype keys and fractional or negative numbers, with depth and node caps;
  - enforces the spec limits: 1 MiB, 32 networks, 8 endpoints, 64 assets, 16 deployments;
  - requires unique IDs and cross-references;
  - checks asset kind against chain family, decimals 0..38, and at most one native asset per network;
  - rejects upgradeable EVM contracts and Solana programs with an upgrade authority;
  - enforces finality profiles: EVM finalized tag, Solana `finalized`.
- `packages/domain/src/registry.ts`: `RegistryService.load(bytes, expectedSha256)` hashes the exact bytes (Web Crypto) **before** parsing.
  - A digest mismatch returns INTEGRITY_FAILURE.
  - A different digest after a successful load returns CONFLICT; updates belong to the G15 flow.
  - `network()` / `deployment()` return frozen entries, or null before a load.
- **Maintainer encoding choices** (G11 leaves these open):
  - IDs are `[A-Za-z0-9._-]`, 1..64 characters, with no `..`.
  - EVM addresses are lowercase hex; EIP-55 mixed case is rejected rather than normalized, and the zero address is rejected.
  - EVM chain identity is a decimal chain ID; the genesis hash is `0x`-prefixed hex.
  - Solana keys are canonical base58 decoding to 32 bytes, and `chainIdentity` must equal `genesisHash`.
  - Endpoint URLs must be HTTPS, with no userinfo, query or fragment; plain HTTP is allowed only for loopback in a `local` network. A key embedded in a URL path cannot be detected and remains a documented residual.
- **Deviation:** `load` is async (Web Crypto) where G11 sketches it as synchronous.
- **Not done:**
  - `validateLive`: needs RPC, which stays disabled.
  - The G15 signed manifest that supplies `expectedSha256`: **blocked on the owner's trust-root decision**. No signer, credentials or trust policy was chosen.
  - Real registry entries: none added.
- **Tests:** `packages/domain/test/registry.test.mjs` (5 tests, ~60 rejection cases, synthetic fixtures only). `npm test` 310/310; all other gates exit 0.

### G16 SHA-256 encodings (independent of the trust root)

- `packages/domain/src/trade-terms.ts` implements:
  - the exact G16 salted private-agreement encoding and the `capabilitiesHash` encoding (count zero for core);
  - the Solana raw terms message (`termsHash` = SHA-256);
  - `checkFundingWindow`;
  - `sha256Hex` (Web Crypto).
- Validation:
  - unknown fields, noncanonical or float numbers, u64/u128 overflow and lone surrogates are rejected;
  - capability IDs must be ASCII, sorted and unique; at most 8 capabilities, instructions at most 4 KiB, agreement at most 16 KiB;
  - the native/SPL mint and token program must match the asset kind; seller and buyer must differ.
- **Vectors:** `scripts/vectors/g16_vectors.py` is a second implementation (Python, written from the spec text) that generates `packages/domain/test/fixtures/g16-vectors.json`. The TS test must match it byte for byte; a Python unittest keeps the fixture in sync. **Both implementations were written by this session**, so the vectors are independent in implementation but not in authorship. The spec's "independent golden fixtures" enablement gate is not met.
- **Maintainer choices:** 32-byte IDs and hashes inside the private agreement are lowercase-hex UTF-8 strings; `fiatCurrency` is `^[A-Z]{3}$`; `policyHash` is lowercase hex.
- **Spec gap (needs owner/maintainer clarification):** the Solana message includes a "selected token-program ID", but `TradeTermsV1` and G11 `AssetV1` have no such field. The encoder takes it as an explicit input (all zero for native).
- **Not done:**
  - EVM EIP-712 digest (needs a reviewed Keccak-256 dependency plus vectors);
  - acceptance signatures (G10 wallet) and on-chain verification;
  - any funding.
- `npm test` 315/315; all other gates exit 0.

### Ready work exhausted at `eaba1fd`; owner/maintainer decisions now gate progress

1. **G11/G15 trust root:** who controls the release/distribution signing key, and how the first trusted fingerprint is bootstrapped.
2. **G15 manifest schema:** the spec references a "common content-addressed manifest" (ES256-P1363 profile, detached locator) that is not in this repository. Supply or locate it; it should not be invented.
3. **G16 EVM digest:** EIP-712 needs Keccak-256. Approve a reviewed dependency through the crypto-inventory gate; `@noble/hashes` is already a transitive dependency of the pinned `@noble/curves`. Independent EIP-712 vectors are also needed.
4. **G16 Solana:** which field supplies the "selected token-program ID". It is absent from `TradeTermsV1` and G11 `AssetV1`.
5. After these: G10 wallet signing → H2 EVM escrow (local anvil only) → offer exchange → trade UI → two-party local EVM proof.
