# P2P C04 — revision change during held diagnostic read

2026-10-26 UTC, direct-human bounded continuation. Ordinary workspace/status access succeeded on clean **a8a5f790019afa9b7eaa2b10f83b5dae3f2ee7e5**, no matching test process. Commands and edits executed in the same selected executor; no alternative environment, denied route or publication operation was used. This record does not assert an unseen approval-review outcome.

Only `packages/domain/test/trade-composition.test.mjs` changed outside documentation/evidence. Runtime remains byte-identical to **fa4e1f4ddd1fef95befb7ab7b6bb72b3ad22ba6a**, SHA-256 `294fa9c249fc56cc68e7ff317a8c90ecf5d73b41e4cea3b1967052be21b75ddd`. Final test hash: `0de8ef27bac37c4764ece37b0281ae02c6be0003b84c2473f6df0d69296a735c`. Exact committed test/docs snapshot follows in delivery receipt.

## Executed concurrency cases

Two new tests exercise three deterministic schedules. Fixtures at test lines69/77 create an independently unlocked actual EncryptedVaultService/IntentJournal and hold either the first durable store read or a real vault list result. They preserve existing final no-op revision synchronization. No second reducer, fake journal decision, weakened CAS or new retry/clear policy is introduced.

- **Peer reservation, before preflight and after cached empty snapshot** (test:291): session A begins an empty diagnostic read and pauses. Independently unlocked B commits the first reservation. A resumes and returns **CONFLICT**, never an empty-success view. Its old session subsequently returns **LOCKED**. Freshly unlocked A recovers the committed ID and refuses a competing fund. Stored envelope and write count stay exactly as B committed them.
- **Peer marker after cached prepared snapshot** (test:307): A pauses after its actual private journal snapshot. B commits prepared→broadcast-unknown. A refuses **CONFLICT**, its revoked journal refuses **LOCKED**, and fresh unlock recovers the same unresolved ID/state. Duplicate markSending refuses, no new ciphertext write or economic permission. Marker metadata is not a wallet invocation or proof of transaction submission.

Both tests passed existing code on their first run. **No new RED, defect or runtime fix is claimed.** Prior missing-factory and cancellation RED/GREEN logs remain separately preserved. The shared in-memory Store deliberately emits no invalidation broadcasts, so persistent-envelope/revision guards determine staleness. This is two independently unlocked services within Node, **not native browser cross-tab/IndexedDB acceptance**. No privacy, retention or retry policy decision was added.

## Fresh verification

All terminal exits and frozen source hashes are in `docs/evidence/P2P_COMPOSITION_REVISION_20261026.json` and five exact losslessly compressed logs/exit records under `docs/evidence/p2p-composition-revision-20261026/`.

- `node --test packages/domain/test/trade-composition.test.mjs`: **15 passed, 0 failed/skipped**.
- `npm test`: **356 passed, 0 failed/skipped**.
- `npm run check:boundaries`: exit0, 44 production sources/18 core graph modules; static proof only.
- `npm run test:build-policy`: **5 passed, 0 failed/skipped**.
- `npm run build`: exit0, all four existing strict typechecks then Vite static build. Emitted app/Worker graphs still exclude this private helper; ReleaseEnabled=0 and connectOrigins=[] checked.

Node24.19.0/npm11.9.0, installed tools only. Source/test hashes stayed frozen during all checks; logs retain exact original bytes through gzip/raw hashes. No KDF/resource cost, deadline, case count or safety/coverage threshold reduced. Browser/Python/spec suites were not repeated for this test-only change; earlier results remain historical. No independent audit or live-provider/funds qualification claimed.

Native Chromium/IndexedDB follow-up for these held-read races is now recorded in [browser acceptance](P2P_COMPOSITION_BROWSER_2026-10-26.md); its exact source/browser limits and fresh counts are separate from this earlier Node-only snapshot.

## Handoff and remaining work

This bounded C04 case is verified within its fixture limits. No additional defect was demonstrated in the diagnostic join. Remaining substantive dependencies are native anchor-bound timestamp and terms→preparedRequest→native-trade verification, trusted G12 hash/observe/reconcile lifecycle and actual wallet/escrow/offer/trade UI/two-party implementation. They require their existing canonical engineering contracts, with trust/deployment/provider/tool/device/independent-review and live-funds gates kept separate. Do not create more diagnostic runtime behavior or claim all trading is owner-blocked merely from these limits. Preserve client-side/noncustodial architecture and all deferred modules.

Coordinator only, no workers started. GhostPay reserved files untouched at3bb55f683b1ba2a0a6a1da05e19ddf7b2d2c330a. No pushes/CI/merge/release/deployment, network transactions, external-model paid calls, credentials/security/network changes, new software, environment replacement or denied HTTP retry. Private incremental checkpoint target remains **libfile_b5734354657c81919d25ed4930348dc9**, last confirmed version2; replace only with that guard, preserve prior versions. Canonical queue V55/Library57 untouched. No consumer retrieval or remote-clone/current-source claim; final receipt follows actual producing success.
