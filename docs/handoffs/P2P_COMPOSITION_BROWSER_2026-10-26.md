# P2P native IndexedDB authority/composition acceptance

2026-10-26 UTC, clean source base **53d9ccf253ae524cc617a346aeed0482bab8b453**. Changed only `scripts/test-vault-browser.mjs` outside documentation/evidence. Existing authority/reducer, composition, journal, vault/IndexedDB runtime source remains byte-identical to that base; recorded source hashes and commands/exits are in `docs/evidence/P2P_COMPOSITION_BROWSER_20261026.json`. Final committed harness/source identity follows in the private delivery receipt.

## What ran in a real browser

The installed **Chromium154.0.8037.57** with Playwright Core1.64.1 ran the existing loopback vault harness. The harness now compiles the existing authority/composition entries and opens two same-origin documents in a separate ephemeral browser context. Each document has its own real IndexedDbVaultStore connection, EncryptedVaultService session and IntentJournal. No second state engine or fake storage was introduced. Synthetic chain reads remain explicitly fixture-only, not RPC/deployment/finality verification.

Six new deterministic schedules passed on the first run:

| Schedule | Executed result |
|---|---|
| Peer reserves while A is held before durable preflight | A refusesCONFLICT, its revoked session subsequently refusesLOCKED; fresh unlock recovers1 prepared intent; duplicate attempt refusesCONFLICT; committed ciphertext unchanged. |
| Peer reserves after A reads an empty journal snapshot | Same refusal/recovery properties; A never publishes stale empty success. Actual journal final revision synchronization remains intact. |
| Peer marks sending after A reads prepared snapshot | A refusesCONFLICT thenLOCKED; fresh unlock recovers1 broadcast-unknown reservation; duplicate attempt refuses; exact committed ciphertext unchanged. |
| Explicit abort during held journal read | Owned read refusesCANCELLED after gate release; fresh unlock retains1 prepared intent and no new reservation/write. No rollback/cancelled-wallet claim. |
| Helper disposal during held journal read | Same CANCELLED/reservation/ciphertext invariants; production services unchanged. |
| Wallet-generation invalidation with held chain A and journal read | Old chain/read results refuseCANCELLED; newer generation1 fixture observation completes funded; released old A cannot overwrite it. Fresh composition retains1 prepared intent and spendingfalse; ciphertext unchanged. |

No invalidation BroadcastChannel was added: the current store signals database version/disposal changes, while peer mutation races are detected through existing persistent envelope/revision checks. Fixture barriers pause before an actual get or after an actual vault list; native IDB transaction/CAS and final durable guards remain unmodified. The same existing strict route allowlist/CSP blocks external page requests. New pages reported **0 uncaught page errors** and **0 observed out-of-origin requests**. That measurement is page-route evidence, not a host-wide egress audit.

The existing harness also completed its original assertions: encrypted persistence/exact-ciphertext CAS, two-tab reservation and marker winner, unknown-outcome recovery, versionchange/disposal, profile-bound create/restore races, source-retaining fresh-key backup/reseal and five document-interruption points. All old bounds/cases remain. Recorded interruption outcomes were absent,absent,copied,copied,copied, each under existing source-intact/no-partial-copy assertions. This does not establish every possible crash schedule.

## Commands/results and source provenance

- `node scripts/test-vault-browser.mjs`: exit0, **6 new native composition schedules**, existing full vault-browser fixture passed; actual browser version recorded above. About18 seconds from recorded start/end.
- `node --test packages/domain/test/trade-composition.test.mjs`: exit0, **15pass/0fail/0skip**.
- `npm run typecheck`: exit0, all four existing strict configurations.
- `npm run check:boundaries`: exit0,45 production sources/18 core graph modules; static inspection only.
- `npm run test:build-policy`: exit0, **5pass/0fail/0skip**.

Five raw logs and atomically captured terminal exit records are stored under `docs/evidence/p2p-composition-browser-20261026/`; gzip/raw hashes preserve exact bytes. Source hashes stayed frozen throughout checks. Browser source SHA-256 **e2fc72fff690caa5487f8c1b7f6408d9ac05be5726364f9797f8a534576febed**. No failed output was discarded: this tranche had no observed failure or runtime defect; earlier RED/bugfix evidence remains separate. Full367-test aggregate/static build/Python/spec results from the prior preflight milestone were **not rerun or transferred** to this harness-only checkpoint. Other browser scripts were not run here.

Existing browser launch flags, KDF costs, deadlines, resource/case/coverage gates and CSP/origin rules were unchanged. No new dependency/install, Chrome DevTools service, external network policy, paid API, live wallet or chain transaction. Node24.19.0/npm11.9.0 and installed Chromium/TypeScript only. Dedicated test contexts contain only generated test profiles and public fixture data; no real browser profile, cookies, private user keys or screenshots were accessed/exported.

## Acceptance boundaries and next dependencies

This supplies native Chromium/IndexedDB evidence for the specified cross-document held-read/cancellation cases, replacing their earlier Node-only limitation for this exact harness snapshot. It is not full trading, physical-device/multi-browser/wallet assurance, a security audit or native chain authentication. The payment-preflight evaluator was not browser-wired/exercised by this fixture and remains fixture-only. Keep ReleaseEnabled0, app network origins empty, signing/submission disabled and noncustodial/client-side architecture fixed.

Substantive next dependencies remain the reviewed native ABI/reader that binds actual immutable trade fields/header time to verified expected G16/registry/finality, trusted G12 hash/observe/reconcile lifecycle, and wallet/escrow/offer/trade UI/two-party acceptance. Preserve separate owner trust/deployment/live-funds and independent review gates; do not manufacture further diagnostic runtime fixes merely because broader implementation is incomplete.

Coordinator only; no workers started. GhostPay reserved files stayed untouched at3bb55f683b1ba2a0a6a1da05e19ddf7b2d2c330a. No source push/CI/merge/release/deployment, credentials/security-setting/environment change, alternate executor or denied-route retry. Save a local harness/evidence milestone and guard the same private Library item **libfile_b5734354657c81919d25ed4930348dc9** at last-confirmed version4; preserve its prior0–4 versions. Canonical queue V55/Library57 is unrelated/untouched. No consumer retrieval or fresh-remote-clone claim. Receipt follows actual producer success.
