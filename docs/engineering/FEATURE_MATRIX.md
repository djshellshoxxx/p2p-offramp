# Feature coverage — pinned main and retained candidates

Baseline: `5c5a84ef6300330700c8b0ca54d074ac113f08be`. Classifications describe actual source scope on this commit. Tests listed below are verified test-source paths; this inventory does not claim fresh product execution. Coordinator test results belong in the consolidation handoff.

**Implemented** means the named source capability exists at the stated scope. Localnet implementations remain isolated test profiles. It does not mean the default static app is enabled for live trades, that physical wallets are qualified, or that a release is authorized.

| ID | Capability | Status on pinned main | Current source scope | Remaining work / candidate |
|---|---|---|---|---|
| F01 | Encrypted profiles, backup, fresh-key restore | Implemented | Encrypted vault, IndexedDB CAS persistence, profiles, migration, backup verification and restore are present in main. | Continue supported-browser/device acceptance; library completeness does not establish independent cryptographic certification.  |
| F02 | Private messaging identity and lock lifecycle | Implemented | Messaging secret is owned by identity/vault services; session disposal and retention are implemented. | Verify physical-device sleep/reload behavior and complete long-term key-rotation decisions separately.  |
| F03 | Canonical EVM terms and offline review | Implemented | Immutable trade terms, registry bindings, role/account checks and signing-domain validation are implemented. | Integrate #187 to bound actual file reads before retained input; retain explicit review and validation. #187 |
| F04 | Basic EVM escrow and financial invariants | Implemented | Native/ERC-20 fund, seller-authorized release to fixed buyer, timeout refund to fixed seller, terminal-state replay refusal and reentrancy guard exist. | Independent contract review and authorized deployed-runtime/public-testnet qualification remain separate. BasicEscrow has no dispute/arbitration function.  |
| F05 | Failed payout and deferred withdrawal recovery | Implemented | Failed push payouts retain a recipient/asset-bound pending withdrawal; retries pay the original recipient. | Retain canonical state validation and exact recipient/asset binding during future UI expansion.  |
| F06 | Offer creation, discovery, expiration and stale-event defense | Implemented | Signed Nostr advertisements and bounded orderbook ingest are composed into localnet trading; expiry/deletion filters and immutable ad identities exist. | Production relay/bootstrap configuration and physical-browser acceptance are separate; it is a bilateral trade workflow, not an automatic centralized matching engine.  |
| F07 | Bilateral negotiation, cancellation and replay resistance | Implemented | v2 offer/accept requires TradeTerms plus PeerAcceptance signatures; terms-bound cancellation/rejection tombstones and durable replay ledger exist. | Do not import the older alternate exchange from #159 over current v2. Wallet and public-network acceptance remain separate. #159 retains selected test/vector evidence only |
| F08 | Nostr event verification, relay transport and interop | Implemented | Signature-checked events, malformed-event refusal, bounded subscriptions, duplicate handling, reconnect/failover and independent native relay harness are on main. | Readiness publication during reconnect needs #181; independently tested relay fixture does not establish every public relay/provider. #181 |
| F09 | Encrypted trade messaging and durable history | Implemented | NIP-17 envelopes and authenticated encrypted history are composed into localnet bilateral trades. | Public metadata and network/device privacy remain external qualification concerns; ciphertext does not hide public chain settlement.  |
| F10 | Wallet connection, network identity and prompt/session safety | Partial | EVM provider/peer signer and Solana wallet boundaries exist, with explicit account/network checks and prompt invalidation. | Physical injected wallets, hardware devices, mobile handoff and full account/chain switch matrix remain; local fixtures cannot qualify those devices.  |
| F11 | Durable send marker, concurrency and unknown-broadcast recovery | Implemented | Version-2 sendMarkedAt/origin provenance, CAS journal writes, conservative unknown outcomes, nonce reservations and canonical reconciliation are on main. | Retain no-automatic-resend rule and source-bound device/browser verification. Do not reimport the duplicate D9 branch stack.  |
| F12 | Native EVM browser trade flow | Implemented | Isolated localnet app supports two-party offer/accept, explicit review, funding, release/refund, messaging and encrypted recovery. It is merged into main. | Localnet profile is restricted to synthetic endpoints/fixtures and ReleaseEnabled=0. Default static app is not a live production trading deployment. #181 readiness correction |
| F13 | ERC-20 browser approval, settlement and recovery | Implemented | Merged #170/#173 add exact-token allowance review, funding, release/refund and fresh-profile/cancelled-intent recovery. | Qualify each authorized production token/profile separately; local MockERC20 evidence is not arbitrary token compatibility.  |
| F14 | Interrupted unfunded trade resumption | Implemented | Merged #175 revalidates original bilateral proof and same immutable terms from encrypted checkpoints before funding admission. | Missing/expired/withdrawn original evidence still requires a new negotiation. Resumption does not refresh peer authorization or send a transaction.  |
| F15 | Solana native/SPL escrow client and durable recovery | Implemented | Merged #167 provides finalized native/SPL reads, settlement planning, wallet submission fences, durable native journal and encrypted recovery. | Public network/genesis/program and allowed-mint policies are not invented or activated; Token-2022/wrapped SOL are refused.  |
| F16 | Solana funded-exit browser composition | Partial | Core native client exists. Open #179 adds explicit prepared/confirm review and browser recovery of already funded trades, rather than full offer/fund parity. | Repair #179 qualification and validate actual browser plus native validator; full Solana discovery/negotiation/funding UI remains beyond that funded-exit slice. #179 |
| F17 | Public QR codec and renderer | Implemented | Main contains versioned bounded QR envelope, canonical JSON, base45, text codec, symbol encoder and SVG rendering primitives. | Integrate #171 positive-safe-integer grouping guard and #172 typed failure for hostile array descriptors. Trade invite signing/verifier policy remains unresolved. #171 #172 |
| F18 | Public QR image/camera capture and review UI | Missing | Absent from pinned main; #183 contains new bounded image/header admission, decoder Worker, camera capture and explicit public review UI. | Repair browser qualification, integrate candidate with explicit trust-context refusal, then complete real device matrix; no authenticated invite claim from unsigned data. #183 |
| F19 | Localization and accessibility | Partial | Locale catalogs, language/direction selector, keyboard focus handling and basic responsive UI tests exist. | Complete supported translations, native browser zoom/RTL/screen-reader/mobile device acceptance. Locale source presence alone is not translation qualification.  |
| F20 | Privacy controls, origin policy and private-data isolation | Partial | Encrypted storage, session lock, explicit transport grants, content policy, import boundaries and static artifact checks exist. | Deployment origin, RPC/relay metadata, physical device and extension assumptions require separate review; no comprehensive anonymity guarantee.  |
| F21 | Dispute/jury arbitration | Experimental | Basic escrow has no adjudication path. Optional #147 preserves diagnostic arbitration calculations; this is not enabled dispute settlement. | Review optional module independently and define authority/model before any user-facing financial integration. #147; historical #46 |
| F22 | Meetup/geofencing, courier and advanced privacy modules | Experimental | Nine accepted independent optional-package branches preserve reference implementations outside main/default application. | Qualify one package at a time and keep default-build import isolation. Do not count unwired reference modules as completed core features. #144–148 #160–163 |
| F23 | zkTLS/payment proof adapters and private reputation | Missing | Main has research/specification material; optional proof-inputs/proof-jobs and intake evaluation branches are not production proof verification or a reputation service. | Select explicit trust model, implement adapter and real fixtures, independently review. Preserve #155 evaluations as inert evidence. #144 #155 #162 |
| F24 | Signed asset-update controller and browser update UI | Missing | Main has signed release/registry primitives. Historical #40/#56/#81 still contain a distinct asset-update HTTP/store/controller feature not yet present on main. | Selective extraction needs later malformed-envelope fixes, failed-IDB-open retry repair, current transport types, tests and release-verification review. Do not restore older trust semantics. #40 #56 #81 |
| F25 | Lab/docs tooling, claims and historical evidence | Partial | Core spec/build checks exist. Repaired #174 preserves original #154 tooling, bounded claims and evidence-manifest fixes; #176 contains prior inventory/evidence. | Qualify repaired tooling against current docs; preserve historical test dates/source hashes and update stale present-tense claims. #174 #176; dependent #155 #156 |
| F26 | Duplicate historical regression stack | Duplicate | D9 #69–75/#91–93 tests, isolated #78–80 tests, and #168 effective browser delta are already represented on current main. | No reimplementation. Exact normalized whole-file preservation and merge-tree proof are in branch-inventory.json.  |
| F27 | Production release and live-funds qualification | Blocked | Release-disabled architecture, explicit build modes and signed trust primitives exist; no deployment/release is authorized in this task. | Owner-controlled trust roots/pins, physical wallets/public testnet, required independent reviews and explicit release authorization remain separate. Preserve ReleaseEnabled=0.  |

## Staging overlay through the optional-source generation

The table above remains the immutable 27-capability assessment of starting main. Generation 2 source `ef9d74258de63e98917c7a34a9392076ff86c35c` is published in PR #190 at `2b23ee614ff2dd05bd3a6e79f1278658c30a3909`; it has not merged to main. Nine separately reviewed optional source PRs and an active favorites implementation extend the work as recorded below. `consolidation-state.json` preserves exact source and test evidence.

| Capability | Change on staging | Remaining qualification or composition |
|---|---|---|
| F03 / F08 | Pre-copy byte bounds and restored-profile/relay readiness fixes are integrated. | Preserve current source-bound and live-provider checks. |
| F16 | Funded Solana exit/recovery composition and stable labels are integrated. | Real validator/browser refund workflow is still running; full Solana discovery/funding UI remains absent. |
| F17 / F18 | Core guards and public image/camera QR review are integrated. PR189 completed six actual Chromium journeys. | Synthetic camera is not physical-device acceptance; unsigned review conveys no authority. |
| F24 | Internal updater source and four storage lifecycle repairs are recovered. | Unexported/unwired; update UI and current trust composition remain separate. |
| F25 | Docs/lab tooling and source-bound historical evidence checks are recovered. | Historical receipts remain dated; stale references stay explicit. |
| F22 | All nine packages are published as #191–#199 with completed independent source reviews. Local all-nine composition preserves their exact source and prior gates. | Combined local qualification passed 2,553 tests and all 13 output files match the base; current-head hosted qualification remains active. No default runtime wiring is authorized by extraction alone. |
| F28 — favorites/templates | Reviewed encrypted preference consumers are recovered. Two fresh workers are implementing and independently reviewing current favorites UI/Worker composition. | Two stale-review reopening regressions are held for repair and independent closure; actual browser gate remains pending. Template UI is still absent. |
| F29 — scriptless portal | Strict source-reference page, exact downloads and actual PR190 hosted browser qualification passed, including PDF and enforced headers. | No deployed-host or physical print/device claim. |
| F30 — unsigned staging | Real two-pass builds, current artifact roles and tamper refusal pass; actual PR190 nested-path browser qualification passed over 42 assets with zero unexpected requests. | Signing, publication and independent distribution approval stay false. |
| F31 — inert governance | Historical record validators and assurance tooling pass;12 historical records,0 pending. |13 current non-owned historical references remain explicitly stale; records confer no authority. |

The JSON companion preserves the baseline and records this overlay separately. Optional reference source acceptance supersedes the earlier parking wording; application and release acceptance remain their own decisions.

## Source and regression evidence

### F01 — Encrypted profiles, backup, fresh-key restore

Source: `packages/storage/src/vault-service.ts`, `packages/storage/src/backup-service.ts`.

Regression source: `packages/storage/test/vault-service.test.mjs`, `packages/storage/test/backup-service.test.mjs`, `packages/storage/test/backup-verification.test.mjs`.

### F02 — Private messaging identity and lock lifecycle

Source: `packages/identity/src/identity-service.ts`.

Regression source: `packages/identity/test/identity.test.mjs`, `packages/identity/test/history-retention.test.mjs`.

### F03 — Canonical EVM terms and offline review

Source: `packages/wallet/src/evm-terms.ts`, `packages/wallet/src/evm-agreement.ts`.

Regression source: `packages/wallet/test/evm-terms.test.mjs`, `packages/wallet/test/evm-agreement.test.mjs`, `packages/wallet/test/g16-bilateral-replay.test.mjs`.

### F04 — Basic EVM escrow and financial invariants

Source: `contracts/evm/src/BasicEscrow.sol`.

Regression source: `contracts/evm/test/BasicEscrow.t.sol`, `contracts/evm/test/BasicEscrowFuzz.t.sol`, `contracts/evm/test/BasicEscrowInvariant.t.sol`.

### F05 — Failed payout and deferred withdrawal recovery

Source: `contracts/evm/src/BasicEscrow.sol`, `scripts/recovery/evm-recovery.mjs`.

Regression source: `packages/wallet/test/recovery-erc20-withdraw-boundary.test.mjs`, `packages/wallet/test/recovery-withdrawal-boundary.test.mjs`.

### F06 — Offer creation, discovery, expiration and stale-event defense

Source: `packages/relay/src/ad.ts`, `packages/relay/src/advertisement.ts`, `apps/web/src/localnet/controller.ts`.

Regression source: `packages/relay/test/ad.test.mjs`, `packages/relay/test/advertisement.test.mjs`, `packages/exchange/test/async-boundaries.test.mjs`.

### F07 — Bilateral negotiation, cancellation and replay resistance

Source: `packages/exchange/src/exchange.ts`, `packages/exchange/src/peer-acceptance.ts`.

Regression source: `packages/exchange/test/peer-acceptance.test.mjs`, `packages/exchange/test/redteam-exchange.test.mjs`, `packages/exchange/test/redteam-pass2-exchange.test.mjs`.

### F08 — Nostr event verification, relay transport and interop

Source: `packages/nostr-crypto/src/relay-event-crypto.ts`, `packages/relay/src/pool.ts`, `scripts/lib/nostr-relay-fixture.mjs`.

Regression source: `packages/relay/test/pool.test.mjs`, `packages/relay/test/pool-lifetime.test.mjs`, `scripts/tests/nostr-relay-native.test.mjs`.

### F09 — Encrypted trade messaging and durable history

Source: `packages/messaging/src/envelope.ts`, `apps/web/src/localnet/controller.ts`.

Regression source: `packages/messaging/test/envelope.test.mjs`, `packages/messaging/test/durable-chat.test.mjs`.

### F10 — Wallet connection, network identity and prompt/session safety

Source: `packages/wallet/src/evm-adapter.ts`, `packages/wallet/src/evm-peer-acceptance.ts`, `packages/chain-solana/src/wallet.ts`.

Regression source: `packages/wallet/test/evm-adapter.test.mjs`, `packages/wallet/test/evm-peer-session.test.mjs`, `packages/chain-solana/test/wallet.test.mjs`.

### F11 — Durable send marker, concurrency and unknown-broadcast recovery

Source: `packages/domain/src/intent-journal.ts`, `packages/domain/src/tx-lifecycle.ts`, `packages/wallet/src/evm-execution.ts`.

Regression source: `packages/domain/test/intent-journal.test.mjs`, `packages/domain/test/tx-lifecycle.test.mjs`, `packages/wallet/test/evm-execution.test.mjs`.

### F12 — Native EVM browser trade flow

Source: `apps/web/src/localnet/LocalnetRoot.tsx`, `apps/web/src/localnet/controller.ts`, `apps/web/src/localnet/wallet-bridge.ts`.

Regression source: `apps/web/test/localnet-boundary.test.mjs`, `apps/web/test/localnet-ui-restore.test.mjs`, `scripts/test-localnet-browser.mjs`.

### F13 — ERC-20 browser approval, settlement and recovery

Source: `apps/web/src/localnet/erc20-funding.ts`, `apps/web/src/localnet/controller.ts`.

Regression source: `apps/web/test/localnet-erc20-funding.test.mjs`, `scripts/test-localnet-erc20-independent.mjs`, `scripts/test-localnet-erc20-browser.mjs`.

### F14 — Interrupted unfunded trade resumption

Source: `packages/exchange/src/checkpoint.ts`, `apps/web/src/localnet/controller.ts`.

Regression source: `apps/web/test/localnet-resumption.test.mjs`, `apps/web/test/localnet-resumption-ui.test.mjs`.

### F15 — Solana native/SPL escrow client and durable recovery

Source: `packages/chain-solana/src/compose.ts`, `packages/chain-solana/src/vaultjournal.ts`, `contracts/solana/programs/basic-escrow/src/lib.rs`.

Regression source: `packages/chain-solana/test/settlement.test.mjs`, `packages/chain-solana/test/lifecycle.test.mjs`, `packages/chain-solana/test/vaultjournal.test.mjs`.

### F16 — Solana funded-exit browser composition

Source: `packages/chain-solana/src/compose.ts`.

Regression source: `packages/chain-solana/test/recovery.test.mjs`, `packages/chain-solana/test/independent-vault-dispatch.test.mjs`.

### F17 — Public QR codec and renderer

Source: `packages/qr/src/text-codec.ts`, `packages/qr/src/jcs.ts`, `packages/qr/src/qr-matrix.ts`.

Regression source: `packages/qr/test/codec.test.mjs`, `packages/qr/test/jcs.test.mjs`, `packages/qr/test/qr-matrix.test.mjs`.

### F18 — Public QR image/camera capture and review UI

Source: `packages/qr/index.ts`.

Regression source: `packages/qr/test/envelope.test.mjs`.

### F19 — Localization and accessibility

Source: `apps/web/src/ui/locale/runtime.ts`, `apps/web/src/ui/locale/catalog.ts`.

Regression source: `apps/web/test/locale-runtime.test.mjs`, `apps/web/test/locale-catalog.test.mjs`, `scripts/test-locale-layout-browser.mjs`.

### F20 — Privacy controls, origin policy and private-data isolation

Source: `packages/transport/src/http-driver.ts`, `packages/security/src/content-policy.ts`, `scripts/check-import-boundaries.mjs`.

Regression source: `packages/transport/test/http-driver.test.mjs`, `apps/web/test/content-policy.test.mjs`, `scripts/tests/import-boundaries.test.mjs`.

### F21 — Dispute/jury arbitration

Source: `contracts/evm/src/BasicEscrow.sol`.

Regression source: No core test source establishes this optional/missing capability.

### F22 — Meetup/geofencing, courier and advanced privacy modules

Source: `docs/adr/ACCEPTED-DECISIONS-2026-11-04.md`.

Regression source: No core test source establishes this optional/missing capability.

### F23 — zkTLS/payment proof adapters and private reputation

Source: `docs/adr/ACCEPTED-DECISIONS-2026-11-04.md`.

Regression source: No core test source establishes this optional/missing capability.

### F24 — Signed asset-update controller and browser update UI

Source: `packages/security/src/release-manifest.ts`, `packages/security/src/release-locator.ts`.

Regression source: `packages/security/test/release-manifest.test.mjs`, `packages/security/test/release-locator.test.mjs`.

### F25 — Lab/docs tooling, claims and historical evidence

Source: `scripts/spec_audit.py`, `docs/execution/CONSOLIDATION-RESULT-2026-11-18.md`.

Regression source: `scripts/tests/test_spec_audit.py`.

### F26 — Duplicate historical regression stack

Source: `packages/domain/test/intent-journal.test.mjs`, `packages/wallet/test/evm-execution.test.mjs`.

Regression source: `packages/domain/test/intent-journal.test.mjs`, `packages/wallet/test/evm-execution.test.mjs`.

### F27 — Production release and live-funds qualification

Source: `apps/web/scripts/build.mjs`, `docs/recovery/OWNER-TESTNET-RELEASE-RUNBOOK.md`.

Regression source: `apps/web/scripts/artifact-policy.test.mjs`, `scripts/tests/verify-web-artifact.test.mjs`.

## Original inventory integration order (historical)

1. Bound retained review reads (#187) and repair readiness publication (#181).
2. Integrate isolated QR core guards (#171/#172), then repair/qualify public QR capture (#183).
3. Qualify Solana funded-exit browser recovery (#179) without claiming full Solana trading UI.
4. Integrate repaired lab/docs tooling (#174), preserve old evidence (#176), and reconcile current status text.
5. Revisit remaining historical asset-update/personalization/journey deltas selectively; keep independent optional packages out of default runtime.

The integration order above is the inventory worker's original recommendation. Completed work and the current queue are in the staging overlay and consolidation handoff. No branch, release setting or deployment was changed by the inventory worker.
