# P2P private diagnostic join — first implementation milestone

Implemented from the existing frozen-plan packet on 2026-10-26 UTC, starting clean at `bfd7df8ab1eb7c7e16206ddf7d237c2eb06ce472`. Exact new source/test SHA-256 and command/time/terminal exits are in `docs/evidence/P2P_COMPOSITION_IMPLEMENTATION_20261026.json` and `docs/evidence/p2p-composition-20261026/`. The final committed source identity is recorded in the following private delivery receipt; no remote source upload is claimed.

## What changed and why

- New worker-private `packages/domain/src/trade-composition.ts` joins existing TradeAuthority.readView with IntentJournal.unresolved for one parsed immutable binding/account. It projects intent IDs into a detached frozen diagnostic view, always with economicPreparationAllowed=false. No state reducer, new storage or plaintext writer was introduced; the G08 authority's own pendingIntentIds stays unchanged.
- Each read checks authority generation/wallet generation around journal awaits and uses current authority/time at reply. A newer read invalidates its predecessor, forwards cancellation and respects the journal's single-active CONFLICT. There is no queue/retry loop or cached view/private intent payload. The helper owns only its lifecycle; its caller must dispose it alongside the existing services. Disposal forwards abort; it cannot undo effects and a held underlying store operation may still need to settle before its read completes.
- Journal failures stay fixed sanitized failures instead of empty “no unresolved intents.” Private record IDs, preparedRequest and signature/private agreement data are not projected. Existing no-op commit([]) revision/preflight checks remain in the unmodified journal. No reserve/markSending/clear/sign/send/network method is added or called by the helper.
- Eight cross-module tests use the actual EncryptedVaultService and journal with an in-memory exact-envelope CAS Store. They cover loading/fresh joins and no new persisted mutation, immutable/private projection, binding/account/case isolation, held wallet/lock/cancel/dispose, A/B conflict with stale A suppression, reply-time chain/fiat/display state and fixed future-schema/locked/foreign errors. Fixture canonical approval and native reader results are explicitly test-only, not ABI/deployment verification. Two additional deterministic lifecycle regressions cover abort-listener and synchronous reentrant read ordering.

Only the two new source/test files and documentation/evidence changed. No facade/schema, wallet, registry, runtime, UI, dependencies, locks or GhostPay files changed. Production source/bundle boundary checks passed; emitted document/Worker graph manifests exclude the helper. Client-side/noncustodial design, wallet/identity test-only status, ReleaseEnabled=0 and connectOrigins=[] remain intact.

## Executed evidence and preserved failures

1. RED: `node --test packages/domain/test/trade-composition.test.mjs` failed exit1, 0 passed/1 failed: missing private composition factory, before implementation existed.
2. Initial GREEN: same focused file after minimum implementation, exit0, 1 passed.
3. Added lifecycle run: exit1, 5 passed/1 failed because the new wallet-invalidated fixture used a noncanonical eventId. Retained original output; corrected the test to the existing required 32-byte base64url identifier. No production/schema/parser weakening.
4. Initial-source focused new+existing authority/journal/terms/EVM test run: exit0, **55 passed, 0 failed/skipped**.
5. Initial-source `npm test`: exit0, **347 passed, 0 failed/skipped**.
6. `npm run check:boundaries`: exit0, 44 production source files, 18 core graph modules. Static inspection is not a runtime isolation proof.
7. `npm run test:build-policy`: exit0, **5 passed, 0 failed/skipped**.
8. Initial-source `npm run build`: exit0; includes all four existing strict typecheck commands, then Vite meta-profile static build. Build attestation still says signedRelease=false, releaseAcceptance=false, completeXssProof=false. No host/production/device acceptance inferred.

9. Source review reproduced two bugs before the local source checkpoint: predecessor-abort callbacks could cancel an external signal before listener attachment, or synchronously start a newer read whose ownership was then overwritten. RED logs09/10 retain 6 passed/1 failed and 6 passed/2 failed. Minimal fix installs new ownership and its signal link before aborting the predecessor, rechecks cancellation/current ownership, and performs no new journal work for already-stale requests.
10. Final-source focused new+existing run: exit0, **57 passed, 0 failed/skipped**; final `npm test`: exit0, **349 passed, 0 failed/skipped**.
11. Final-source import boundaries, build-policy5, and build including all strict typechecks: exit0. Required reruns followed actual source changes; earlier347/55 are not transferred to this source.
12. `npm run test:specs`: exit0, **12 Python tests**; `npm run check:specs`: exit0, **173 specs, 0 broken links**, 171 still design-review-pending. Spec counts are documentation status, not implemented features.

Commands ran with installed Node24.19.0/npm11.9.0. Each terminal exit was atomically recorded after completion; aggregate records pin source hashes and check they stayed frozen. No original failure log was discarded. No dependencies were installed, compiler/Foundry/Library input retry attempted, test deadline/KDF/case/threshold changed or CI invoked. Browser fixtures were not rerun for this private helper: UI/runtime/facades are unchanged and emitted app graphs exclude it. Installed Chromium remains available for subsequent affected browser acceptance; no browser/device qualification of the helper is inferred. No new lint command is invented.

Follow-up C05/C06 service-restart/unknown-marker/terminal/reorg evidence is recorded in [recovery verification](P2P_COMPOSITION_RECOVERY_2026-10-26.md). Those five new cases passed existing runtime without a fix; this first-milestone report retains its own historical counts and remaining acceptance limits.

## Remaining scope and next bounded step

This closes the first private G08/G12 diagnostic wiring gap, **not the whole ten-family packet, G16 integration, a trading engine or audit**. Exact synthetic fixture association, private G16 digests, native timestamp/anchor and terms→preparedRequest→native-trade verification still must not be inferred from a structural join. Missing chain time remains missing; the helper emits no funding-window-valid claim. G12 trusted hash/observe/reconcile lifecycle and safe terminal reservation resolution remain absent. Current serialized terminal labels remain reserved.

Next ready bounded engineering: extend this private helper's deterministic integration cases for restart/uncertain marker and terminal/reorg observations while preserving unresolved reservations (packet C05/C06), using existing journal and authority APIs, with no new clear/retry-release policy. First add the failing/unmet cross-module oracle; do not duplicate the existing reducer or native unit vectors. Before any native G16 window composition, supply separately verified anchor-bound chain time; do not substitute display observedAt or wall time. Real escrow/wallet/offer/UI/two-party work remains substantial.

Actual trust/deployment/manifest/provider/custody-tool/wallet/device/independent-review/live-funds gates are retained. They do not block the fixture-only work above. No external Claude/API call, secret injection, spending, network/security/credential change, push, merge, deployment or release occurred. Coordinator performed integration/source review; no worker team was started or independent audit claimed. GhostPay remains reserved and untouched at3bb55f683b1ba2a0a6a1da05e19ddf7b2d2c330a.

## Evidence storage correction

The first source commit retained raw Node failure output, whose blank-line spaces triggered Git whitespace checks. It was committed before that check was resolved. Follow-up stores all17 exact raw logs as `.log.gz`, with compressed/uncompressed hashes in the evidence JSON; original local raw logs remain preserved. Decompression equality was checked before removing duplicate plaintext repository logs. No failure content, test or threshold changed. Source/test bytes still match the final tested hashes; application tests are not rerun merely for evidence format.

## Durable handoff

Update the existing private composition Library item `libfile_b5734354657c81919d25ed4930348dc9` with expected version0 only after the source checkpoint is committed. Include current documentation, command logs/exits, exact source files and an incremental patch against the preserved baseline; validate/secret-check the resulting payload. Preserve v0's preparation-only status in history. The canonical queue V55/Library57 is unrelated and must remain untouched. No supported consumer retrieval success is claimed. Source is local/unpushed; a remote fresh clone is not assumed current. After delivery, keep the separate receipt commit so the package's exact source/docs checkpoint remains reproducible.
