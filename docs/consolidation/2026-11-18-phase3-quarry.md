# Phase 3 quarry: extraction plan for branch work absent from `7be1dbe`

Read-only analysis. Nothing in /home/user/p2p-offramp was edited, checked out, or committed. All trials ran in scratch copies made with `git archive` (head `7be1dbe`) plus overlaid source files, under the scratchpad directory (`ov`, `ov35`, `ovp`, `ovq`, `ov0`, `m`).
Environment limits: Node v22.23.5 here (repo requires >=24); no forge/anvil/z3/solc/Chromium; scratch copies are not git repos. The `node --test` suites and `tsc` ran. Browser, forge, anvil, SMT and Node-24 build runs did not (marked UNVERIFIED below).

## 0. Refs and key facts

| Ref | Full SHA |
| --- | --- |
| head `nodata/epic-newton-7bowm4` | `7be1dbef7fe38204db441ffb9c29e6f06acfaecd` |
| `origin/claude/vibrant-cray-ny4gum` (#56/#81) | `a45e932a37153590bc329c1e9012cf18e37fe12c` |
| merge-base head..vibrant | `c87c21b915c9e175113292bb1307754ed2424166` (call it MB) |
| N37F | `faf245e7766861a036725d76efc1015ffe321f81` |
| N38 | `dbad7cab70bd3a81def2a718473d13de3040bb1e` |
| N40 | `2a26041da7ee2d54136528bbdbcd95ec6b2d6a91` |
| N41 | `8354137d6a777ad819c1e2bf821f650b23342019` |
| N42 | `75d88460b37d14c721fe066d2411683b1a4a9597` |
| N42 test follow-up | `05cbd5f98308702fe5de8e6874fc4b98e4a0ce8b` |
| N43 | `7ca4a4a72b87e35694aa151e9a998b11e5b4b63e` |
| `-journey` (#35) | `4c5d01c639d05c0ec6ecba9bf162d5fa2a9abf05` |

Split-stack heads:

| Stage | Head | PR |
| --- | --- | --- |
| m0-s01 | `81a295d5cd` | #37 |
| m0-s02 | `71a56d1040` | #38 |
| m0-s03 | `404dc3daa8` | #39 |
| m0-s04 | `7706859d23` | #40 |
| m0-s05 | `dd2a648140` | #41 |
| m0-s06 | `58b3c876ae` | #42 |
| m0-s07 | `bc549f477f` | #43 |
| m0-s08 | `f8a9aa1430` | #44 |
| m0-s09 | `5a9997485b` | #45 |
| m0-s10 | `0baa3c1ae5` | #46 |
| m0-s11 | `14d7c5e267` | #47 |
| m0-s12 | `494703e837` | #48 |

- `git log 7be1dbe..vibrant` lists 20 commits (13 non-merge). The ledger counts 11 unique and 2 patch-equivalent.
- Already at head, byte-identical to vibrant (verified with `git diff head vibrant -- <path>`, empty):
  - N38 (`packages/identity/{index.ts,src/identity-service.ts,test/history-retention.test.mjs,test/hostile-boundary.test.mjs}`).
  - N41 leaf modules and tests (about 40 files in `apps/web/src/{analytics,compatibility,content-policy,context-adapters,privacy,sharing,ui/locale/{bundled,en,runtime},ui/*}` and `apps/web/test`).
  - `scripts/sepolia/trade.mjs` and its state test (`d653a77`).
  - So the ledger/matrix items C2, C3 and C4 are done. Do not re-extract them.
- Head's `apps/web/src/ui/locale/catalog.ts` is stricter than vibrant's (REDTEAM-P2-LOC1 visibility checks). Never overwrite it with the vibrant or stage copy.
- Head's `worker-endpoint.ts` already returns `null` from `legacySavedReview` on a malformed wrapper (#65 T33). The stage version throws.
- Head tree layout: `packages/` has no optional packages and no `personalization`. `apps/` has only `web`. There is no `apps/portal`, `docs/governance`, `security/intake`, `scripts/{formal,portal,distribution,lab,docs,governance,reputation}` or `.devcontainer`.
- `contracts/evm/src/BasicEscrow.sol` sha256 is `dbeca966…4569f` and the ABI sha256 is `aef2d918…6f98`. Both equal the hashes pinned in `m0-s12:docs/execution/qualification/evm-formal-partitions.json`, so the formal evidence is still source-bound to head's contract.

## 1. Signed release-update HTTP/store/controller + ERC-1271 fixtures (Tier C: release verification)

(a) Sources
- N40 `2a26041` (also the `m0-s04` stage, which `m0-s12` matches within 2 lines): 16 files.
  - `packages/security/src/release-update.ts` (190 lines, `createAssetUpdateController`).
  - `release-update-http.ts` (86 lines) and `release-update-store.ts` (47 lines, `IndexedDbAcceptedReleaseStore`).
  - `release-locator.ts` (+5 lines, exports `readUntrustedReleaseLocator`) and `release-manifest.ts` (+5 lines, exports `readUntrustedReleaseManifest`).
  - `packages/security/README-UPDATES.md`.
  - Tests: `packages/security/test/release-update.test.mjs` and `release-update-http-encoding.test.mjs`.
  - ERC-1271 fixtures: `contracts/evm/test/mocks/Eip1271RecoveryFixture.sol` (20 lines) and `scripts/test-eip1271-local.mjs` (59 lines).
  - Extended `scripts/test-evm-reconcile-local.mjs` (+195) and `scripts/test-exchange-evm-local.mjs` (+30).
  - Workflow line `npm run test:eip1271:local` in `.github/workflows/evm-escrow.yml`, plus a `package.json` script.
- Later fixes exist only on `origin/claude/loving-einstein-xgzvdy` (#28), not in vibrant:
  - `f5b12c6`: corrupt signed envelopes are `MANIFEST_UNSUPPORTED` (untrusted), not a network outage. Adds an `envelope()` helper in release-update.ts and 15 test lines.
  - `83f31c4` and `0ed3bdf`: F05 content-length and encoding handling.
- Browser side (#42, `75d8846`): `scripts/fixtures/release-update-browser.ts`, `scripts/test-release-update-browser.mjs`, script `test:updates:browser`, and a `vault-foundation.yml` step.

(b) Current equivalent at head
- None for the update controller. `createAssetUpdateController` and `release-update*.ts` do not exist.
- `release-manifest.ts`, `release-locator.ts` and `release-proof.ts` exist and are unchanged since MB.
- ERC-1271 read verification exists: `packages/wallet/src/evm-contract-acceptance.ts` and `evm-contract-acceptance.test.mjs`. No contract-wallet fixture contract and no anvil proof exist at head.
- F05 is already fixed in head's `packages/transport/src/http-driver.ts` (`declaresBodyLength`).

(c) Dependency closure
- Imports: `schemas` (`parseStrictJsonBytes`, `decodeBase64url`), `transport` (`SessionTransportPolicy`, `authorize`/`capture`/`generation`/`mode`), `release-manifest`, `release-locator` and `release-proof` (`revalidateRelease`). All are present at head.
- `HttpFetchPort` is not exported from head's transport facade (`packages/transport/index.ts`). Keep the vibrant local `UpdateResponsePort`/`HttpFetchPort` types. Do not take #28's facade import.
- The ERC-1271 script needs `scripts/test-support/fixture-receipt.mjs`, `scripts/sepolia/lib.mjs` and `packages/domain/test/fixtures/local-evm-scenario/*`. All are present at head.

(d) Drift
- Release verification and transport bounds: none. A trial overlay of the 8 release-update files onto head gave `tsc --noEmit` clean, `check:boundaries` PASS (155 production files), and 87/87 tests passing (release-update, http-encoding, release-locator, release-manifest).
- F07 is still present in `IndexedDbAcceptedReleaseStore`: a failed `indexedDB.open` leaves `#database` as a cached rejected promise. Add a reset on failure when extracting.
- The hostile-envelope classification (`f5b12c6`) is missing from the vibrant copy. Take it from #28 but keep the local port type.
- N40 also changes `packages/wallet/src/evm-execution.ts` (see section 2). That is a separate adaptation.
- `release-update.ts` header says "Absent from the public facade". Keep it unexported from `packages/security/index.ts`.

(e) Recommendation
- Release-update controller: extract (Tier C, owner approval, medium risk). Use the vibrant files plus the #28 `f5b12c6` envelope hardening, plus an F07 fix and test.
  - Land it unwired: no app import, `releaseEnabled:false`, `connectOrigins` empty.
  - Add as its own PR. Do not wire `test-release-update-browser.mjs` until the browser lane can run (UNVERIFIED).
- ERC-1271 fixtures: adapt (Tier C-adjacent, test-only). Take the fixture contract, `test-eip1271-local.mjs` and the workflow line.
  - Run with forge/anvil before merge (UNVERIFIED here).
  - Verify the extended reconcile/exchange loopback scripts against D9: they use pre-D9 `IntentV1`/`markSending` semantics.
- Hardened `evm-execution.ts`: adapt, do not copy (section 2).

## 2. Hardened EVM execution (part of N40) and backup verification / retention / runtime plumbing

### 2a. `evm-execution.ts` hardening (Tier C: signing path)
- Source: N40 changes `packages/wallet/src/evm-execution.ts` (+52/-29) and `evm-execution.test.mjs` (+81).
  - Per-submission internal AbortController.
  - Native `AbortSignal` accessors and listeners captured at module load.
  - Account/chain rechecks around every provider and journal step.
  - `selectedAccount()` parsing.
- Head: D9 changed the same file (`Intent` rather than `IntentV1`; `markSending` failure always returns `BROADCAST_UNKNOWN`) and `evm-execution.test.mjs`.
- A 3-way merge (`git merge-file`, base MB) gives 3 conflicts in the source file and 1 in the test file.
  - Two conflicts are type names (`Intent` vs `IntentV1`).
  - The third is semantic. The vibrant side has `const marked=await markSending(...,ownedSignal); if(!marked.ok) return marked;`, which re-introduces the pre-D9 behaviour.
  - Resolution: keep head's `if(!marked.ok) return fail('BROADCAST_UNKNOWN')` and pass `ownedSignal`.
  - Keep head's new D9 test ("persisted send marker followed by a typed journal error stays broadcast-unknown").
- Recommendation: adapt as a single Tier C PR, after the release-update PR. Medium-high risk; needs an independent review of every `return fail(...)` path against the D9 matrix. Not run: wallet tests on the resolved file (I did not produce a resolved file).

### 2b. Backup verification, retention, runtime plumbing (#42, `75d8846`; Tier B, escalate to C)
- Sources:
  - `packages/schemas/src/runtime.ts` (+208): new operations `verifyBackup`, `checkBackupVerification`, `planRetention`, `reviewRetention`, `deleteReviewedRecords`, `listReviewFavorites`, `setReviewFavorite`, `loadTradeDraftLibrary`, `planTradeDraftChange`, `commitTradeDraftChange`, `selectTransportMode`.
  - `saved-review.ts` (+4); schema tests `backup-verification.test.mjs` and `retention-runtime.test.mjs`.
  - `apps/web/src/runtime/worker-endpoint.ts` (+269), `app-runtime.ts` (+73), `pending-metadata.ts`, `app-services.ts` (+60), `main.tsx`.
  - `apps/web/src/trade/{draft-controller,review-controller}.ts`.
  - UI: `BackupVerificationForm.tsx`, `RetentionPanel.tsx`, `FavoriteSavedReviews.tsx`, `trade/TradeDraftEditor.tsx`, `trade/draft-copy.ts`, and edits to `App.tsx`, `Pages.tsx`, `VaultForms.tsx`, `PrivacyStatusPanel.tsx`, `TradePages.tsx`.
  - 10 web tests, e.g. `backup-verification-runtime.test.mjs`, `retention-worker.test.mjs`, `app-services-abort.test.mjs`.
- Current equivalent at head: the storage/domain halves exist.
  - `packages/schemas/src/backup-verification.ts`, `packages/storage/src/{backup-service,retention-service,vault-service(verifyBackup)}.ts`, `packages/identity` history retention (N38), `packages/schemas/src/trade-drafts.ts`.
  - Absent: the Worker/runtime protocol operations, the app services, and all UI for them.
  - Head has no `selectTransportMode` runtime operation.
- Dependency closure: `packages/personalization` (section 3, same PR family), and `scripts/lib/tool-path.mjs` for the browser scripts.
- Drift (from a trial overlay of the vibrant-only files onto head; the 3-way merge of `worker-endpoint.ts` and `saved-reviews-worker.test.mjs` is clean):
  - `tsc` clean in all four configs (root, runtime, worker, ui).
  - 688/694 passed across `personalization`, `schemas`, `security` and `apps/web` tests. The 6 failures are described below.
  - Storage migration: no drift. `packages/storage` changed since MB only by the `IntentV1`->`Intent` type rename in `retention-service.ts`.
  - D9: retention uses `Intent` and typechecks.
  - Malformed-review handling: a behaviour change, not a text conflict.
    - Stage `worker-endpoint.ts` makes `deleteTermsReview` always throw `NATIVE_PROOF_REQUIRED` (use the retention flow, DATA01) after a `NOT_FOUND` check.
    - Head's T33 test deletes a saved review and expects `{recordId}`, so it fails (1 of the 6).
    - Adapt that test: a malformed wrapper still gives `NOT_FOUND`, and a valid delete now needs the retention preview.
    - The owner should confirm the removal of immediate delete.
  - Locale: the stage `catalog.ts` must not overwrite head's. With head's catalog, the locale tests pass.
  - Transport bounds: `transport-selection-runtime.test.mjs` (N43) passed on head.
- Recommendation: adapt. Tier B for plumbing, but `deleteReviewedRecords` removes vault records, so treat the retention subset as Tier C-adjacent. Suggested order: personalization package, then the runtime/schema diff, then UI. Risk medium. UNVERIFIED: browser tests (`test:favorites:browser`, `test:share:browser`, `test:zoom:browser`, `test:updates:browser`), `build`, `build:demo`.

## 3. Private-trade journey and native retention (#43, `7ca4a4a`; Tier C: signing review, funding, escrow actions)

(a) Sources
- N43 `7ca4a4a`, 24 files:
  - `apps/web/src/journey/{README.md,native-contracts.ts,presentation.ts,private-trade.ts(357),screen.ts,vault-composition.ts}`.
  - `apps/web/src/retention/native-retention.ts`.
  - Tests: `journey-private-trade-recovery.test.mjs` (525 lines), `journey-private-trade.test.mjs`, `journey-vault-composition.test.mjs`, `retention-native.test.mjs`, `transport-selection-runtime.test.mjs`.
  - Browser: `scripts/test-journey-browser.mjs`, `test-journey-origin-browser.mjs`, `test-retention-browser.mjs`, plus `scripts/fixtures/{journey-*,retention-*}`; 3 package scripts and workflow steps.
- Vibrant deviated from `m0-s07` (PR #43) in 6 files because #62's privacy view was missing. It disclosed endpoint origins as "unknown" and used a plain 20 s lifetime.
- `-journey` (#35): 17 commits, 28 files. It adds `apps/web/test/journey-private-trade-flow.test.mjs` (729 lines, 40 tests), `apps/web/test/support/journey-harness.mjs` (280), and changes `private-trade.ts` (+430), `presentation.ts` (+131) and `native-contracts.ts` (+76).

(b) Current equivalent: none (`apps/web/src/journey` and `retention` are absent at head).

(c) Dependency closure
- Imports `domain`, `exchange`, `identity`, `relay`, `nostr-crypto`, `schemas`, `storage`, `runtime/worker-endpoint`, `content-policy/local-policy` and `privacy/policy-controller` (the last two at head). All resolve at head.
- Requires the section 2b runtime plumbing (`worker-endpoint`, `selectTransportMode`).

(d) Drift
- Head now has #62 privacy view, which adds `PrivacyView.endpointDetails`. The vibrant journey fails `tsc -p apps/web/tsconfig.ui.json` against it (`presentation.ts(23)`: `endpointDetails` missing).
  - Fix: use the PR #43 files (`m0-s07`) for `presentation.ts`, `private-trade.ts`, `native-contracts.ts`, `README.md`, the recovery test and `test-journey-browser.mjs`. They restore the endpoint-origin rows. With them, `tsc` is clean in all 4 configs.
- D9 drift: 5 of 18 (vibrant) or 5 of 62 (with #35) journey recovery tests fail on head, with either the vibrant or the stage copy:
  - "approval prepared but never marked fails closed..."
  - "wallet-rejected send after its marker..." (or the renamed 4001 test)
  - "funded escrow whose cancelled approval shares its re-approval nonce..."
  - "never-sent fund intent keeps its terminal cancellation phase..."
  - "never-sent fund after a sent approval is cancelled..."
  - Cause: they encode pre-D9 semantics (per-journal-memory never-sent proof, v1 intents seeded by the fixtures, `cancelled-before-send`). Head has durable v2 `sendMarkedAt`/`originProfileId`, and `reconcile` is chosen where the tests expect `cancelled-before-send`.
  - Fix: update the fixtures to v2 intents and rewrite the assertions. Never weaken them (gameplan rule). Needs Tier C owner review.
- Retention/native proof: `retention-native.test.mjs` and the other new tests pass on head.

F01 / F03 / F06 (`docs/reviews/2026-11-04-codebase-review/findings.json`)
- These do not apply to head as code, because the journey does not exist there. They apply to the extracted journey. `a45e932` records F01/F03/F06 reproducing on the extracted journey and F02 not applicable after `af0e178`.
- #35 fixes:
  - F01 `5d1ed9b`, `aab7f6b`: release stays open inside the 900 s buffer, with a 300 s margin before the deadline.
  - F03 `78fa8d0`, `40ac736`: the receipt reports pending credit and a withdraw route.
  - F06 `7040632`, `4bc74ea`, `ada28e7`: explicit same-event retry, with a delivery-stopped state.
  - Settlement reconciliation: `292d604`, `d09ece1`, `6775e3e`, `63e0b11`, `f87531b`.
- Compatibility: overlaying #35's journey files, harness, worker fixture and tests on head's tree gives `tsc` clean and 40/40 of `journey-private-trade-flow.test.mjs` passing. The only failures are the 5 recovery tests above. So #35 is compatible with D1/D9-era code as written, and its recovery-test failures are the same D9 drift.
- Also from the review: F05 fixed at head; F07 still open in the release-update store (section 1); F04 (relay dedup) and F02 not verified here.

(e) Recommendation: adapt (Tier C). Extract as one PR, journey (m0-s07 files) + #35 fixes + native-retention, unwired from the default app.
- Prerequisites: section 2b merged, and the D9 test rewrite done.
- Risk high. UNVERIFIED: the browser journey/origin/retention scripts.
- Do not claim F01/F03/F06 are fixed on head. Say "absent code; fixes ready in #35; file issues if re-extraction is deferred".

## 4. Formal / SMT tooling (N37F, `faf245e`; Tier C by touching `contracts/evm`, though dev-only)

(a) Sources (9 files): `contracts/evm/formal/CanonicalRefinement.t.sol` (113), `properties.json` (104), `partitions/{EarlyRefund,NativeConstructor,UnauthorizedRelease}.sol`; `scripts/formal/evm.mjs` (271), `scripts/formal/README.md`; `scripts/tests/formal-evm.test.mjs` (160); `package.json` script `test:formal:unit`.
- Later change on #28 only: `2cb0817` (partial CHC runs classified `PROOF_UNKNOWN`, not violation; +4/-1 in `evm.mjs`). Take it.
- Partition evidence: `m0-s12:docs/execution/qualification/evm-formal-partitions.json`.

(b) Current equivalent: none (`scripts/formal` absent). Specs mention `MODEL_IMPLEMENTATION_GAP` only in `00_PLANNING…/spec-formal-verification-properties.md`. The completeness matrix row C5 already plans this cherry-pick.

(c) Closure: `@noble/hashes` (present), `scripts/sepolia/lib.mjs` (`forgeEnv`, `checkToolchain`, `TOOLCHAIN`) and `scripts/lib/is-main.mjs` (both at head). Pinned Z3 4.12.2 wheel and solc 0.8.30 are external. The formal dir is outside Foundry's src/test roots.

(d) Drift: none found. `BasicEscrow.sol` and the ABI are byte-equal to the pinned hashes. With the files overlaid on head, `node --test scripts/tests/formal-evm.test.mjs` passed 15/15. Do not take vibrant's `foundry.toml` (it drops head's `peer-acceptance-v1.json` fs_permission). `faf245e` does not touch `foundry.toml`.

Honest results (from the README and the s12 evidence file; I did not rerun SMT):
- `MODEL_IMPLEMENTATION_GAP` / `STRICT_TERMINAL_ALREADY_PAID`: a reproducible native witness, not a theft defect. It remains a promotion blocker until the active/pending/paid refinement is reviewed.
- Whole-target CHC: `PROOF_UNKNOWN` with `COMPILER_TIMEOUT`. No clean result.
- Guard logic: 4 QF_LIA queries give `PROVED_GUARD_LOGIC_ONLY`. They exclude modifiers, gas, execution, storage transitions, payout custody, bytecode and whole-contract correctness.
- Partitions (bounded investigation): NativeConstructor `PROVED_UNDER_DECLARED_MODEL`; UnauthorizedRelease `PROOF_UNKNOWN`; EarlyRefund `PROOF_UNKNOWN`. `modelCommit` is null and `compiledBytecodeChecked` is false.
- Production approval is false. No deployment, ERC-20, Solana or whole-contract claim.

(e) Recommendation: extract (Tier C by path, risk low). Use `faf245e` plus `2cb0817`. Keep it dev-only. Run `forge test` (must stay at the existing count) and the full evidence run (UNVERIFIED here) before merge. Wording must say "formal evidence with unknowns", never "verified".

## 5. Dependency intake, governance, recovery portal / distribution

### 5a. `security/intake` (+ reputation evaluation) from `m0-s09` `5a9997485b` (Tier A)
- 27 added files: `security/intake/{xmtp,waku,relay-transport,mobile-wallet}` (README, package.json, package-lock.json, pins.json, evaluation.test.mjs; xmtp has no test), `scripts/reputation/*` (5 files plus 2 in `evaluation-remediated/`), `docs/reputation/*` (2), `.sonarcloud.properties`, script `test:reputation:intake`.
- No head equivalent (head has only `security/DEPENDENCY_EVIDENCE.md`, `crypto-inventory.json` and the npm signature checker).
- The intake tests import only Node built-ins. `semaphore-v4-evaluation.mjs` imports `schemas`, `scripts/lab/command.mjs` (from m0-s08) and `lib/is-main`.
- Risks: nested `package.json`/`package-lock.json` files can trigger Dependabot/audit/Sonar noise. Check that root `npm test` globs and CI do not pick them up (UNVERIFIED). Active evaluation is declared blocked in the packets.
- Recommendation: extract after 5c's `scripts/lab/command.mjs` (or drop the reputation script). Tier A, low risk.

### 5b. Governance from `m0-s11` `14d7c5e267` (Tier A, with a stale-decision risk)
- 34 files: `docs/governance/*` (14), `packages/governance/{index,src/assurance,src/records,test x2}`, `scripts/governance/{check,check-all,refresh-evidence-manifest}.mjs`, `scripts/tests/{refresh-evidence-manifest,tool-path}.test.mjs`, `docs/execution/assurance/*` (6), `docs/execution/drills/*` (3), `docs/execution/reviews/T49.json`, 1 workflow edit.
- `packages/governance` imports `domain` and `schemas` (present). In a trial overlay on head, `tsc` was clean, 16/18 tests passed, and `scripts/governance/check-all.mjs` reported `checked:12`, `authority:inert-record-only`.
- The 2 failures are expected: the evidence manifest binds `docs/execution` bytes (jurisdiction intake, a no-op manifest refresh) that are absent at head. Resolution: import the assurance/drills subset with it, or refresh the manifest on head.
- Stale-decision risk: the `docs/governance/*.proposal|decision.json` records (e.g. `peer-acceptance-carrier`, status `proposed`, empty reviewers) predate the accepted D1/D5/D7/D8/D9 in `docs/adr/ACCEPTED-DECISIONS-2026-11-04.md`. Mark them historical or reconcile; they must not be read as pending decisions.
- Recommendation: adapt (Tier A). D7 (accepted 2026-11-04, then superseded 2026-11-18) allowed governance and claims. Risk low.

### 5c. Portal, distribution, lab, docs tooling from `m0-s08` `f8a9aa1430` (Tier C by D8 wording: recovery and release verification; inert and unsigned)
- Files: `apps/portal/{index.html,portal.css}`, `scripts/portal/{build,policy,build.test}`, `scripts/distribution/{stage,manifest,stage.test,browser.test}`, `scripts/lab/{run,recipe,command,recipe.test}`, `.devcontainer/{Dockerfile,devcontainer.json}`, `scripts/docs/{generate.py,validate.mjs,validate.test.mjs,README.md}`, `packages/claims/*`, `docs/{portal,distribution,lab}/README.md`, `docs/wiki-source/{README.md,claims-register.json,docs-manifest.json}` and edits to 8 existing wiki-source docs.
- The portal is a scriptless static security/recovery page. It copies the canonical ABI, source and `docs/recovery/CANONICAL-EVM.md` byte for byte and binds their SHA-256 in `portal-build.json`. It states there is no approved release key. Distribution staging builds the real client twice and compares bytes. Both depend on head's `apps/web/scripts/{artifact-policy,build}.mjs`, `sepolia-network.ts` and `scripts/lib/is-main.mjs`.
- Trial overlay on head: `claims`, `lab/recipe` and `docs/validate` tests pass once `scripts/lib/tool-path.mjs` (from N42), `.devcontainer/*` and the wiki-source manifests are present. 26/31 passed overall. The remaining 5 (portal build and distribution stage tests) failed with exit 128, because the scratch copy has no `.git`. UNVERIFIED on a real checkout under Node 24.
- Drift: the wiki-source manifests and claims register hash the s08 versions of the 8 wiki docs. Head's `docs/recovery/CANONICAL-EVM.md` and wiki docs have evolved (G12/D9), so regenerate the manifest on head. No recovery-manifest/D3 key work is implied (D3 is still proposed).
- Recommendation: adapt, last, as 3 small PRs (lab+docs tooling Tier A; claims Tier A; portal/distribution Tier C-adjacent). Risk medium (byte-binding, wiki drift).

## 6. Optional reference packages (D7 accepted 2026-11-18: extract one package per PR, import-boundary check, none wired into the default build)

All sources are at `m0-s10` `0baa3c1ae5` (134 added files; identical at `m0-s12`). In a trial overlay of all 9 onto head: `tsc --noEmit` clean, `check:boundaries` PASS (218 production files, core entry graph 66 modules, unchanged), and every package suite passed. Head's `ADVANCED_PACKAGES` (`scripts/check-import-boundaries.mjs:37`) already lists meetup, courier, stealth, proof, arbitration, privacy-policy, privacy-controls, proof-jobs, liquidity and extensions. `proof-inputs` is covered by the `proof` path part (D7 flagged this as unconfirmed; the overlay boundary run passed). `personalization` is intentionally not advanced because the web app imports it.

| Package | Files (src/test) | Cross-package imports (src) | Tests (trial) | Kind | One-package PR needs |
| --- | --- | --- | --- | --- | --- |
| meetup | 32 (14/16) | schemas | 69/69 | model-only, unwired | `test:meetup:browser` (`test/origin-ledger-browser.mjs`, playwright, UNVERIFIED), python oracle fixtures, tests read `scripts/lib` and `storage` |
| courier | 19 (10/8) | none | 39/39 | model-only | none beyond the package; the governance assurance manifest mentions it (see D7) |
| stealth | 17 (9/6) | schemas | 38/38 | model-only, offline diagnostic | `@noble/curves`+`hashes` (in root deps); README links `docs/execution/profiles/stealth-local-contract.json` (link, do not import) |
| proof-jobs | 16 (6/6) | schemas, domain | 24/24 | model + Worker resource contract | `typecheck:optional` (worker and fixture tsconfigs), `test:proof:browser`, `test:proof:memory` (UNVERIFIED), vite+react fixtures |
| proof-inputs | 7 (4/1) | schemas, domain | 15/15 | parser-only, empty catalogs | `typecheck:optional` entry, tsconfig.json |
| arbitration | 16 (10/4) | none (noble hashes only) | 28/28 | diagnostic calculators (`economicAuthority:false`) | python vector generator fixtures |
| privacy-controls | 11 (5/4) | schemas, domain | 32/32 | local storage/state model | `test:privacy-controls:browser` (UNVERIFIED), reads `storage/src/vault-service.ts` in tests |
| liquidity | 10 (4/4) | schemas, domain | 18/18 | accounting/reservation reference | none |
| privacy-policy | 6 (4/1) | schemas, domain, extensions, transport | 11/11 | policy evaluator over G05/G14, unwired (web policy controller uses schemas, not this) | reads `relay/test/support/harness.mjs` in tests |
| personalization | 6 (3/2) | schemas | passed (inside the 688/694 batch; not counted separately) | adapter, wired into web (draft/favorites) | belongs with section 2b; vibrant copy equals `m0-s10` (empty diff) |

(Test totals are from `node --test packages/<p>/test/*.test.mjs`.)

- Per-package PR recipe: add `packages/<p>/**` plus its npm script(s) and CI step; add a negative boundary test (no core or web import specifier names the package); do not touch `apps/web`; keep it out of the default build.
- Tier B (non-custody). Low risk each; the main cost is CI time and the browser tests.
- Order suggestion: proof-inputs, liquidity, courier, arbitration, privacy-policy, privacy-controls, stealth, proof-jobs, meetup.

## 7. docs/execution historical evidence: LINK, do not import

- `m0-s12` has 231 files under `docs/execution`; head has 42. 195 s12 files are absent at head. By directory:

| Directory | Files |
| --- | --- |
| `reviews/` | 134 |
| `audit-2026-11-02/` | 19 |
| `profiles/` | 14 |
| `qualification/` | 7 |
| `assurance/` | 6 |
| `coverage/` | 4 |
| `acceptance/` | 4 |
| `drills/` | 3 |
| top-level | 3 |
| `architecture/` | 1 |

  The 3 top-level files are `ALL-REMAINING-WORK-PROMPT.md`, `FINAL-LOCAL-VERIFICATION-2026-11-02.{json,md}`.
- No git tags exist locally (`git tag -l` is empty). Create `archive/…` tags per gameplan Phase 1 before deleting branches. Until then, link by blob at `494703e837` (m0-s12) or `e82f1b5f96` (#28).
- Link from `docs/consolidation/` (the 6 head-only files `BLUE-TEAM-*`, `COMPLETENESS-MATRIX`, `ULTRACODE-LEDGER` remain). Highest-value links:
  - `docs/execution/qualification/evm-formal-partitions.json` and `browser-zoom.json`.
  - `docs/execution/acceptance/g24-*`, `docs/execution/coverage/*`.
  - `docs/execution/audit-2026-11-02/*` and `docs/execution/profiles/*` (stealth comparison vectors).
- Import (not just link) only what a capability needs: `assurance/*`, `drills/*`, `reviews/T49.json` with governance (5b).
- Also link, not import: `docs/adr/proposed/D1-implementation-plan-2026-11-11.md` (1122 lines in vibrant `a45e932`). It predates head's implemented peer-acceptance work. `docs/development/2026-11-11-lanes.md` and `task-ledger.json` edits are historical lane logs.
- Existing head history already covers `docs/execution/reviews-2026-11-01/` (8 files) and `journey-reviews-2026-11-01/` (5 files).

## 8. Suggested extraction order (each a separate PR)

1. Formal harness (N37F + `2cb0817`). Tier C by path; dev-only; lowest conflict.
2. Release-update controller, unwired (N40 security files + `f5b12c6` + F07 fix). Tier C.
3. ERC-1271 fixtures and local script, plus the `evm-execution` hardening merge that keeps D9's `BROADCAST_UNKNOWN`. Tier C.
4. Personalization package (Tier B), then runtime/UI plumbing (2b; retention subset Tier C-adjacent).
5. Journey (m0-s07 files) + #35 fixes + native retention, with the D9 test rewrite. Tier C.
6. Intake (5a), governance (5b) and docs/lab/claims tooling (5c). Tier A.
7. Portal/distribution (5c). Tier C-adjacent.
8. Optional packages, one PR each (section 6). Tier B.

## 9. Not verified

- Anything needing forge/anvil (ERC-1271 local proof, reconcile/exchange loopbacks, `forge test`), z3/solc (formal evidence run), Chromium/Playwright (all browser scripts), or Node 24 (`npm run build`, `build:demo`; `artifact-policy` test 15 also fails on pristine head under Node 22).
- Pristine head under Node 22 gave 1531/1533 passing; the one failure I saw is the relay failover test (`apps/web/test/…` run, "a relay that never connects exhausts six reconnects…"). It is unrelated to these extractions.
- Hosted CI state of #37–#48, #56, #81 was not queried.
- The resolved `evm-execution.ts` merge was not produced or tested; only the conflict hunks were analysed.
