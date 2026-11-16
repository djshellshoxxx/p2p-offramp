# Escrow assurance, maps, privacy transports and comparable exchanges

Research date: **2026-11-03 America/Vancouver** (2026-11-04 UTC). This is source-level reuse research, not an implementation or dependency approval. P2P Offramp observations use main `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa` and the separately unmerged PR #26 head `94554ecf9854e4604f9f56afe5bebedeee931994`.

## Decisions that matter

1. **Preserve the current escrow and its existing upstream dependencies.** OpenZeppelin and Foundry are already used. The remaining opportunities are additional interoperability and invariant evidence, not a replacement escrow.
2. **Use other exchanges as protocol and UX references.** Mostro, RoboSats, Bisq and Haveno implement different custody, transport and recovery systems. Their source is not a compatible browser escrow module.
3. **MapLibre plus PMTiles is a credible optional map stack.** A local, authenticated archive and a bounded renderer are a better starting point than automatic remote tile fetching. The application's large-map storage profile still needs a separate design.
4. **There is now a concrete browser Tor candidate worth an isolated evaluation:** `ethereum/tor-js`. Its source is experimental, starts work at construction, and the default package entry loads WASM from external sources. It cannot simply be installed and labelled as verified private routing.
5. **No selected library supplies the missing locker, collateral, shielded-custody or standalone-transfer protocol.** The useful finding for those gaps is the exact prerequisite, not a speculative adapter.

All proposed file paths below are explicitly marked. Existing paths are relative to P2P Offramp. Packages such as `meetup`, `courier`, `liquidity` and `privacy-controls` are PR #26 additions, not merged-main capabilities at this snapshot.

## A. Existing escrow dependencies and incremental assurance

### A1. OpenZeppelin Contracts — already adopted; reuse the existing pin

**Inspected sources:** [current repository gitlink](https://github.com/djshellshoxxx/p2p-offramp/tree/94554ecf9854e4604f9f56afe5bebedeee931994/contracts/evm/lib), [current-pin SafeERC20](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/c64a1edb67b6e3f4a15cca8909c9482ad33a02b0/contracts/token/ERC20/utils/SafeERC20.sol), [current-pin SignatureChecker](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/c64a1edb67b6e3f4a15cca8909c9482ad33a02b0/contracts/utils/cryptography/SignatureChecker.sol), [MIT license](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/c64a1edb67b6e3f4a15cca8909c9482ad33a02b0/LICENSE). The upstream head was also inspected at `efaa6f78ab1dde05416246e801c0baaf4f900d49`, dated 2026-11-02. That newer head is an observation, not an upgrade recommendation.

**Current fit:** `contracts/evm/src/BasicEscrow.sol` already imports `SafeERC20` and `ReentrancyGuard`; the pinned submodule exists on both main and PR #26. This supersedes the older reuse matrix's suggestion that OpenZeppelin is only a candidate. Safe transfer handling is already part of the implementation.

**Best further use:** use the pinned `SignatureChecker`/`IERC1271` semantics as an independent reference for `packages/wallet/src/evm-contract-acceptance.ts` and `contracts/evm/test/mocks/Eip1271RecoveryFixture.sol`. The current verifier already has bounded signature length, gas, runtime identity and anchored reads. A library's boolean result does not supply those application controls, durable peer acceptance or the absent wire carrier. Contract signatures can change validity with state; historical approval cannot become permanent authority.

**Admission:** keep the existing dependency pin, retain MIT notices, and add only tests for a concretely missing behavior. Candidate checks include state-dependent revocation, changed wallet policy at a new anchor, return-shape refusal and account/network invalidation. Do not transplant latest-head helpers merely because they are newer. No dependency was updated by this research.

### A2. Foundry — already adopted; extend the existing handler

**Inspected sources:** upstream head `2ed30fca48218751d77b8d0507525042ae72c268`, 2026-11-04 UTC; [invariant configuration](https://github.com/foundry-rs/foundry/blob/2ed30fca48218751d77b8d0507525042ae72c268/crates/config/src/invariant.rs), [MIT](https://github.com/foundry-rs/foundry/blob/2ed30fca48218751d77b8d0507525042ae72c268/LICENSE-MIT), [Apache-2.0](https://github.com/foundry-rs/foundry/blob/2ed30fca48218751d77b8d0507525042ae72c268/LICENSE-APACHE). Researching the current source does not replace the project's already selected toolchain.

**Existing integration:** `contracts/evm/foundry.toml` pins Solidity 0.8.30 and Cancun and defines fuzz/invariant profiles. `contracts/evm/test/BasicEscrowInvariant.t.sol` already contains `EscrowHandler`, native/token conservation, no-double-payout and terminal-state properties. `BasicEscrowFuzz.t.sol` already tests deadlines, exact amounts, caller restrictions and terms binding. `forge-std` is pinned to `8e40513d678f392f398620b3ef2b418648b33e89`.

**Next useful work:** retain one handler and extend it only when a newly admitted token or contract-wallet profile introduces behavior the existing state machine does not cover. Preserve seeds/corpus and include pending-withdrawal liabilities in conservation. This is incremental assurance; it cannot convert the existing formal `UNKNOWN` results into proofs or justify repeating the spent formal tranche. Keep compiler settings and artifact identity stable unless an explicit upgrade is being evaluated.

### A3. Echidna — conditional independent test runner

**Pin:** `crytic/echidna@f0b6676298d70802be635297072e51224420e08c`, head dated 2026-11-02. Read [testing modes](https://github.com/crytic/echidna/blob/f0b6676298d70802be635297072e51224420e08c/README.md), [configuration](https://github.com/crytic/echidna/blob/f0b6676298d70802be635297072e51224420e08c/tests/solidity/basic/default.yaml), [Foundry test example](https://github.com/crytic/echidna/blob/f0b6676298d70802be635297072e51224420e08c/tests/solidity/foundry-basic/basic.sol), and [AGPL-3.0 license](https://github.com/crytic/echidna/blob/f0b6676298d70802be635297072e51224420e08c/LICENSE).

**Use:** an optional development-only, independently scheduled conservation campaign against the existing escrow handler. The inspected source documents a Foundry-style mode; the exact released binary containing that behavior still must be selected and verified. An older installed release must not be assumed to have current-head capabilities.

**Destination:** existing `contracts/evm/test/BasicEscrowInvariant.t.sol`; **proposed** `contracts/evm/test/echidna/` for the minimal runner-specific harness/config. Do not add the executable to the browser bundle.

**Acceptance:** pin executable/compiler/config, prove the harness reaches funding and both exits, include native/token pending withdrawals, retain a deterministic regression for any verified own-project failure, and report bounded campaign results rather than completeness. Tool licensing and copied harness licensing need separate review. The decision is conditional because another fuzzer is worthwhile only if it adds a concrete independent signal.

### A4. crytic/properties and fuzz-utils — useful secondary leads, not mandatory dependencies

`crytic/properties@5ea14b813ff296e24b4257ab52a0402360f916f6` (2025-11-29) contains [ERC20 external properties](https://github.com/crytic/properties/blob/5ea14b813ff296e24b4257ab52a0402360f916f6/contracts/ERC20/external/properties/ERC20ExternalBasicProperties.sol) and an [AGPL-3.0 license](https://github.com/crytic/properties/blob/5ea14b813ff296e24b4257ab52a0402360f916f6/LICENSE). Its token properties can inform a separately licensed token-admission test suite, but they test token behavior, not this escrow's trade authority. Do not import all ERC4626/token mocks into the app or count generic ERC20 properties as coverage of settlement.

`crytic/fuzz-utils@6f68fcc82d106045e995106f027ef4aaafecc24e` (2025-08-25) has a [Foundry test generator](https://github.com/crytic/fuzz-utils/blob/6f68fcc82d106045e995106f027ef4aaafecc24e/fuzz_utils/generate/FoundryTest.py), an [Echidna result parser](https://github.com/crytic/fuzz-utils/blob/6f68fcc82d106045e995106f027ef4aaafecc24e/fuzz_utils/generate/fuzzers/Echidna.py), and [AGPL-3.0 terms](https://github.com/crytic/fuzz-utils/blob/6f68fcc82d106045e995106f027ef4aaafecc24e/LICENSE). Consider it only for preserving regression evidence from this project's own bounded test campaigns. Review generated fixtures and template licensing before committing them. No package execution, failure reproduction or generated source is included here. Head timestamps are maintenance observations, not a promise of current toolchain compatibility.

### A5. Why ERC4626 is not the missing liquidity implementation

The inspected [OpenZeppelin ERC4626 implementation](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/efaa6f78ab1dde05416246e801c0baaf4f900d49/contracts/token/ERC20/extensions/ERC4626.sol) implements share/asset conversions and vault deposits/withdrawals. P2P Offramp's [liquidity decisions](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/liquidity/DECISIONS.json) explicitly exclude pooled shares/NAV and require segregated maker custody, exact-fill reservations and atomic escrow funding. Consequently ERC4626 is **not selected** as a drop-in solution.

Use the current `packages/liquidity/src/accounting.ts` and `reservations.ts` models as the specification oracle. Define the separate custody/quote/consume/refund ABI before writing **proposed** `contracts/evm/src/MakerVault.sol`. `BasicEscrow` requires the seller to be the funding caller; a maker vault would therefore need a deliberate contract-account seller and acceptance profile. Ordinary SafeERC20 helpers cannot define that relationship.

## B. Comparable P2P exchanges: what to study and what not to port

These are primary-source references. They are not runtime integration recommendations. Copying a small component still requires its own license and dependency assessment; a public GitHub page is not permission to disregard the license.

| Project and observed head | Files actually inspected | Useful lesson and P2P Offramp destination | Why not a drop-in donor |
| --- | --- | --- | --- |
| **Mostro** `8111f5eb1297e253e64a1c5fd928cf696545f6df`, 2026-10-29 | [transport v2](https://github.com/MostroP2P/mostro/blob/8111f5eb1297e253e64a1c5fd928cf696545f6df/docs/TRANSPORT_V2_SPEC.md), [fiat action](https://github.com/MostroP2P/mostro/blob/8111f5eb1297e253e64a1c5fd928cf696545f6df/src/app/fiat_sent.rs), [release/reconciliation](https://github.com/MostroP2P/mostro/blob/8111f5eb1297e253e64a1c5fd928cf696545f6df/src/app/release.rs), [GPL license](https://github.com/MostroP2P/mostro/blob/8111f5eb1297e253e64a1c5fd928cf696545f6df/LICENSE), [historical MIT notice](https://github.com/MostroP2P/mostro/blob/8111f5eb1297e253e64a1c5fd928cf696545f6df/LICENSE-MIT) | Study versioned identity-to-trade-key binding and explicit buyer/seller action authorization when specifying the missing peer-acceptance carrier around `packages/messaging/src/envelope.ts`, `packages/wallet/src/evm-agreement.ts` and `apps/web/src/journey/private-trade.ts`. Study uncertain-payout reconciliation as a comparison for the existing journal. | Rust daemon, database and Lightning invoice workflow. Mostro v1/v2 are explicitly incompatible; its Nostr messages are not this project's EVM wallet signatures. The retained MIT file is not blanket permission for current GPL-era code. |
| **RoboSats** `10970d712fdeea543d0ef374e58dd22df2145681`, 2026-11-03 | [fiat receipt dialog](https://github.com/RoboSats/robosats/blob/10970d712fdeea543d0ef374e58dd22df2145681/frontend/src/components/TradeBox/Dialogs/ConfirmFiatReceived.tsx), [step projection](https://github.com/RoboSats/robosats/blob/10970d712fdeea543d0ef374e58dd22df2145681/frontend/src/components/TradeBox/stepXofY.ts), [order model](https://github.com/RoboSats/robosats/blob/10970d712fdeea543d0ef374e58dd22df2145681/api/models/order.py), [AGPL license](https://github.com/RoboSats/robosats/blob/10970d712fdeea543d0ef374e58dd22df2145681/LICENSE) | Role-specific progress and explicit irreversible-action review are useful UX comparisons for `apps/web/src/ui/trade/TradePages.tsx` and `packages/domain/src/journey-view.ts`. Convert observations into independently authored acceptance cases. | Backend/order statuses, Lightning bonds, MUI/i18n imports and AGPL source cannot simply be pasted into the current shell. Its displayed amount parsing is not the project's canonical integer signing format. Keep chain-confirmed state and manually reported fiat distinct. |
| **Bisq** `18a1bdb97398b1ac32d0d600a1409cfdccfbe645`, 2026-10-22 | [TradeProtocol](https://github.com/bisq-network/bisq/blob/18a1bdb97398b1ac32d0d600a1409cfdccfbe645/core/src/main/java/bisq/core/trade/protocol/TradeProtocol.java), [AGPL license](https://github.com/bisq-network/bisq/blob/18a1bdb97398b1ac32d0d600a1409cfdccfbe645/LICENSE) | Peer/message checks, mailbox acknowledgments and explicit timeout lifecycle are useful test-case references for `packages/exchange/`, `packages/messaging/` and transaction recovery. | Java desktop Bitcoin protocol and multisig/dispute model. Reusing a timeout pattern does not authorize resending economic actions or importing its custody rules. |
| **Haveno** `240a3684612ba808d1078ac2c293f59b6d9bc4d9`, 2026-11-03 | [TradeProtocol](https://github.com/haveno-dex/haveno/blob/240a3684612ba808d1078ac2c293f59b6d9bc4d9/core/src/main/java/haveno/core/trade/protocol/TradeProtocol.java), [AGPL license](https://github.com/haveno-dex/haveno/blob/240a3684612ba808d1078ac2c293f59b6d9bc4d9/LICENSE) | Verified-peer acknowledgment handling and serialized per-trade work inform cross-client fault/recovery cases. The corresponding destinations are the existing exchange/journal tests, not a second application coordinator. | Java/Monero-specific trade and dispute machinery; different asset, wallet, custody and persistence assumptions. Reference-only until an explicitly compatible, licensed slice is identified. |

**Recommended extraction method:** write a short behavioral case in P2P Offramp's own terms (for example, a peer action received twice after reconnection), identify whether existing tests already cover it, and implement only the missing test or behavior. Do not transliterate another project's state machine, copy its status numbers, or replace an exact signed format with its message format.

## C. Optional maps and physical coordination

### C1. MapLibre GL JS — preferred renderer candidate

**Pin:** `maplibre/maplibre-gl-js@2b68611a4e2d4f7f076f6c6ebf758e2d53f91471`, 2026-11-03. Inspected [custom protocol implementation](https://github.com/maplibre/maplibre-gl-js/blob/2b68611a4e2d4f7f076f6c6ebf758e2d53f91471/src/source/protocol_crud.ts), [request implementation](https://github.com/maplibre/maplibre-gl-js/blob/2b68611a4e2d4f7f076f6c6ebf758e2d53f91471/src/util/ajax.ts), and [complete license/retained notices](https://github.com/maplibre/maplibre-gl-js/blob/2b68611a4e2d4f7f076f6c6ebf758e2d53f91471/LICENSE.txt). Primary project code is BSD-3-Clause; preserve all embedded notices too.

**Destination:** existing `packages/meetup/src/map-manifest.ts` validation and consent owners; **proposed** `apps/web/src/meetup/map-view.ts` and `packages/meetup/src/map-resource-adapter.ts`. `addProtocol` allows custom resource loading; `removeProtocol` allows lifecycle cleanup. Request interception is an integration hook, not proof that all style/glyph/sprite/worker resources obey the privacy policy.

**Missing glue:** selected dataset/style licenses, exact signed content binding, immutable local assets, G05-authorized resource access, bounded decoder/worker ownership and cleanup. Remote default styles and automatic geolocation are not part of this recommendation.

**Acceptance:** load a known local map with network denied; exercise all style/glyph/sprite paths; refuse unknown source URLs; enforce byte/decode/worker limits; cancel on lock/revocation; test dateline display and keyboard alternatives. Renderer success establishes drawing, not verified location or a safe venue.

### C2. PMTiles — preferred archive-reader candidate, with an application-owned Source

**Pin:** `protomaps/PMTiles@aec8fa1341222fdddb3318e9ffa8e18e19b312f7`, 2026-09-16. Inspected [`Source`, `FileSource`, `FetchSource` and `PMTiles`](https://github.com/protomaps/PMTiles/blob/aec8fa1341222fdddb3318e9ffa8e18e19b312f7/js/src/index.ts), [MapLibre adapter](https://github.com/protomaps/PMTiles/blob/aec8fa1341222fdddb3318e9ffa8e18e19b312f7/js/src/adapters.ts), [license](https://github.com/protomaps/PMTiles/blob/aec8fa1341222fdddb3318e9ffa8e18e19b312f7/LICENSE) and [format documentation](https://docs.protomaps.com/pmtiles/). Implementations are BSD-3-Clause; the specification is public domain/CC0 as applicable; sample datasets have separate terms.

**Destination:** **proposed** `packages/meetup/src/pmtiles-source.ts` behind existing `createMapValidator` and map consent. A bounded application-owned `Source.getBytes` can read a preauthenticated local archive. The built-in file source is a reference, but its name-based cache key and unbounded file-read assumptions need review. A digest-derived archive identity avoids conflating different same-named files.

**Limit:** `FetchSource` uses HTTP range requests. HTTPS protects transport contents but does not hide request ranges from the endpoint; inferencing viewed areas remains a concern. Prefer an explicitly selected local/offline profile first. The project's G02 snapshot cap is 8 MiB, while the map design expects 100 MiB cache/2 MiB tiles: PMTiles does not solve that conflict. Define separate bounded storage/retention and authenticate the whole archive or a reviewed per-block scheme before consumption.

**Acceptance:** archive identity changes, truncated/invalid ranges, bounded decompression, corrupt offsets, same-name collisions, abort and physical drain, no unsolicited fetch, and consent revocation. A valid ETag or CID is not publisher authentication.

### C3. Turf — small math/reference candidate

**Pin:** `Turfjs/turf@1b87820003ef71c23a8336bdb8b5b71c034a7ad2`, 2026-10-26. Inspected [`distance`](https://github.com/Turfjs/turf/blob/1b87820003ef71c23a8336bdb8b5b71c034a7ad2/packages/turf-distance/index.ts), [`booleanPointInPolygon`](https://github.com/Turfjs/turf/blob/1b87820003ef71c23a8336bdb8b5b71c034a7ad2/packages/turf-boolean-point-in-polygon/index.ts) and their [distance](https://github.com/Turfjs/turf/blob/1b87820003ef71c23a8336bdb8b5b71c034a7ad2/packages/turf-distance/LICENSE)/[polygon](https://github.com/Turfjs/turf/blob/1b87820003ef71c23a8336bdb8b5b71c034a7ad2/packages/turf-boolean-point-in-polygon/LICENSE) MIT licenses. Polygon code imports `point-in-polygon-hao`; a root license alone does not cover that transitive review.

**Use:** compare the existing geohash/XYZ independent fixtures or supply a deliberately selected numerical adapter for `packages/meetup/src/geofence.ts`. Do not import the entire Turf bundle or replace existing consent/disclosure accounting. A polygon feature would be new scope unless a selected venue profile requires it.

**Acceptance:** specified Earth model/units, longitude wrapping, poles, polygon boundaries/holes, accuracy margins and stable integer-to-float conversion. The 50 m/100 m local geofence thresholds remain uncertain sensor observations; geometry does not authenticate presence. Priority is low because existing math and fixtures already cover much of the need.

### C4. MQTT.js — conditional transport lead; no approved locker driver

**Pin:** `mqttjs/MQTT.js@0ceae419ff0542105fa258b3ae9760798db7b44d`, 2026-10-20. Inspected [browser WebSocket transport](https://github.com/mqttjs/MQTT.js/blob/0ceae419ff0542105fa258b3ae9760798db7b44d/src/lib/connect/ws.ts), [client lifecycle](https://github.com/mqttjs/MQTT.js/blob/0ceae419ff0542105fa258b3ae9760798db7b44d/src/lib/client.ts), [MIT license](https://github.com/mqttjs/MQTT.js/blob/0ceae419ff0542105fa258b3ae9760798db7b44d/LICENSE.md).

**Destination only if a chosen device supports it:** **proposed** `packages/courier/src/locker-mqtt-adapter.ts` behind `packages/courier/src/locker.ts`. No such hardware profile is presently selected. The library supplies messaging, not device provisioning, authenticated counters, command/result identity, one-use credentials or physical unlock evidence.

The inspected defaults include automatic reconnect and resubscribe. MQTT delivery/QoS acknowledgments cannot stand in for a completed physical command. Before adoption define durable write-before-send, explicit ambiguity reconciliation, replay persistence, refusal of retained/stale command results and no automatic repeat unlock after uncertain delivery. Test disconnect after each protocol stage with the selected vendor simulator and actual device; a generic broker test is insufficient. Keep this a conditional lead, not a feature-completion shortcut.

## D. Optional privacy providers: concrete new leads and clear limits

### D1. ethereum/tor-js — valuable new isolated evaluation, not selected routing

**Pin:** `ethereum/tor-js@d9d9612d10d3775ff100b70e96a291718191d856`, 2026-10-29; source package version 0.4.4. Inspected [package exports](https://github.com/ethereum/tor-js/blob/d9d9612d10d3775ff100b70e96a291718191d856/package.json), [`TorClient`](https://github.com/ethereum/tor-js/blob/d9d9612d10d3775ff100b70e96a291718191d856/src/TorClient.ts), [socket provider](https://github.com/ethereum/tor-js/blob/d9d9612d10d3775ff100b70e96a291718191d856/src/socketProvider.ts), [default CDN loader](https://github.com/ethereum/tor-js/blob/d9d9612d10d3775ff100b70e96a291718191d856/src/entryPoints/wasm-cdn/index.ts), [local WASM loader](https://github.com/ethereum/tor-js/blob/d9d9612d10d3775ff100b70e96a291718191d856/src/entryPoints/wasm-file/index.ts), [IndexedDB storage](https://github.com/ethereum/tor-js/blob/d9d9612d10d3775ff100b70e96a291718191d856/src/storage/indexeddb.ts), [MIT](https://github.com/ethereum/tor-js/blob/d9d9612d10d3775ff100b70e96a291718191d856/LICENSE-MIT) and [Apache-2.0](https://github.com/ethereum/tor-js/blob/d9d9612d10d3775ff100b70e96a291718191d856/LICENSE-APACHE) licenses. Read the [experimental status](https://github.com/ethereum/tor-js/blob/d9d9612d10d3775ff100b70e96a291718191d856/README.md) and [first-party technical overview](https://reads.ethereum.foundation/projects/torjs/).

**Why this changes the research:** the older matrix names no maintained browser Tor client. This repository supplies a concrete Arti/WASM-based `fetch` surface worth evaluating. The conclusion is not that ordinary browser `fetch` is private, or that TorJS is already approved.

**Integration location:** first **proposed** `security/intake/tor-js/` for coherent source/npm/WASM/Arti/gateway provenance. If it qualifies, a **proposed** `packages/transport/src/tor-http-driver.ts` can adapt to existing `HttpFetchPort`/`BoundedHttpDriver` and `SessionTransportPolicy`. Keep network construction behind explicit admission; `new TorClient` begins bootstrapping. Imported module evaluation must not silently grant transport permission.

**Concrete compatibility work:** browser connections use a WebRTC-capable gateway; Node has different transport behavior. The default export selects a CDN WASM loader, which checks hashes but still contacts external sources. A reviewed locally bundled WASM entry must be selected for this project's static-artifact profile. `FetchInit` is not the full native `RequestInit`: verify redirect refusal, final URL, credentials, headers, streaming, error mapping and cancellation rather than casting types. Scope cancellation does not necessarily stop shared bootstrap, so physical slot ownership and shutdown require direct measurement. Review its separate IndexedDB persistence and logs against the local data policy.

**Acceptance:** exact artifact/source mapping, no unapproved bootstrap/CDN/ICE traffic, bounded stream handling, cancellation/lock drain, no ordinary HTTP fallback, trusted gateway configuration and reproducible routing evidence. Evidence must identify the specific requests and channel. A successful Tor-routed HTTP call does not cover Nostr WebSockets, an external wallet, all RPC traffic or the whole browser. Gateway metadata and fingerprinting are still separate questions. Priority: optional experimental intake after core peer acceptance and release work.

### D2. JoinMarket — reference-only UTXO architecture

**Pin:** `JoinMarket-Org/joinmarket-clientserver@23d61a8b42b50cf3f7e0c2198c12fadedc7488df`, 2026-11-04 UTC; [wallet source](https://github.com/JoinMarket-Org/joinmarket-clientserver/blob/23d61a8b42b50cf3f7e0c2198c12fadedc7488df/src/jmclient/wallet.py), [GPL-3.0 license](https://github.com/JoinMarket-Org/joinmarket-clientserver/blob/23d61a8b42b50cf3f7e0c2198c12fadedc7488df/LICENSE).

The Python wallet/UTXO/signing system is useful background for the deferred CoinJoin profile. It is not an EVM wallet adapter or a browser privacy layer. Existing P2P Offramp profiles do not define the UTXO custody, coordinator, transaction or recovery protocol needed to use it. Record the reference against `L-PRIV-OPTIONAL-PROVIDER`; do not put its wallet into `packages/wallet` or introduce application-held spending seeds. No runtime reuse is recommended.

### D3. RAILGUN Engine — conditional future shielded-profile research

**Pin:** `Railgun-Community/engine@6e2614d53a106dd62abad91e7ce03ee4a3956138`, 2026-06-19; [software wallet](https://github.com/Railgun-Community/engine/blob/6e2614d53a106dd62abad91e7ce03ee4a3956138/src/wallet/railgun-wallet.ts), [external-signer hardware wallet](https://github.com/Railgun-Community/engine/blob/6e2614d53a106dd62abad91e7ce03ee4a3956138/src/wallet/hardware-wallet.ts), [MIT license](https://github.com/Railgun-Community/engine/blob/6e2614d53a106dd62abad91e7ce03ee4a3956138/LICENSE).

The inspected software wallet derives spending keys, which conflicts with the current external-wallet boundary if adopted directly. The same source also includes a `HardwareWallet`/`ExternalSignerConnector` route; therefore it would be inaccurate to claim that every possible integration requires app-held spending keys. That route remains a future feasibility lead, not a selected device or custody profile. Circuit artifacts, prover dependencies, note scanning, viewing-key storage, shield/unshield commitments and the actual external signer require separate evaluation. The engine's MIT file does not establish licenses of all cryptographic transitives.

**Where:** a future **proposed** `security/intake/railgun/` linked to `L-PRIV-OPTIONAL-PROVIDER`; only after an explicit shielded-note/custody/exit model exists. Do not alter `BasicEscrow` or the ordinary trade path. No claim of private basic-escrow transfers follows from installing an SDK.

## E. Work that source reuse cannot decide

| Missing contract | Appropriate next artifact | Why a donor library is insufficient |
| --- | --- | --- |
| Courier collateral and handoff custody | Separate terms-bound vault/fee/slashing/timeout specification and independently tested contract | A token helper cannot decide who may seize principal or what a physical receipt proves. |
| Locker provisioning/result protocol | Named device model, firmware/protocol revision, identity/counter/time/recovery profile | MQTT/WebSocket support says nothing about an authenticated physical action. |
| Whole-profile deletion | Reconciled export/delete/recovery workflow in `packages/privacy-controls/DECISIONS.json` and G02 consumers | An IndexedDB delete method does not settle backup retention, outstanding trades or cross-tab recovery. |
| Standalone sweep execution | Versioned transfer intent, exact balance/fee/recipient binding and unknown-outcome recovery around `packages/domain/src/tx-lifecycle.ts` | A wallet SDK's send call cannot create journal semantics or authorize the transfer. |
| Large encrypted map cache | Versioned sharded storage, authentication, quotas and eviction independent of core vault data | An archive reader cannot increase the vault's established bounds. |
| New optional commitments | Exact G14-to-G16 canonical mapping and independent vectors | Generic hashing or JSON canonicalization cannot choose the signed protocol. |

These are proposed engineering decisions to make concrete before implementation. They do not require rebuilding already completed local models, and this research does not select a production trust root or activate any optional provider.

## Evidence limits

Sixteen upstream repositories were examined for this report, including exact license files and relevant source files at immutable commits. Current heads were used as reproducible research snapshots; release artifacts, transitive trees and npm integrity were not universally qualified. All source-fit and priority decisions above are engineering assessments from those sources. No upstream code was imported, no live provider was contacted through its SDK, no test campaign was run, and no new runtime dependency or production configuration was introduced.
