# P2P Offramp: unfinished features and reusable upstream code

**Research snapshot: 2026-11-03 America/Vancouver.** Current source was checked on GitHub, including merged main and the separately unmerged implementation in PR #26. The purpose is to help the next implementation worker select useful code, place it at the correct boundary, and avoid rebuilding existing work.

The five reports contain approximately **13,600 words**, map **all 27 non-complete canonical records**, and cite **259 immutable upstream references across 62 GitHub repositories**, supplemented by official specifications and documentation. That repository count includes source candidates, reference-only projects, existing dependencies and a separate organization license repository; it is not a dependency-installation list. The [machine-readable source index](SOURCE-INDEX.json) records the exact counts, revisions, citations and report checksums.

## Start with these decisions

The largest remaining core blocker is the **production peer wallet-acceptance carrier and its integration into a real two-client journey**. EVM terms/signature verification, local escrow, encrypted messaging and recovery primitives already exist. More libraries will help at specific boundaries, but they do not supply this project's role/account/trade binding or signed protocol choices. See the [verified feature map](00-unfinished-feature-map.md).

The most promising immediate reuse is focused: independent protocol vectors, a reviewed QR stack, wallet handoff adapters, native Solana tooling, release/archive verification components and targeted browser/accessibility tests. Optional zkTLS, reputation, stealth, maps, private routing and arbitration each have useful donors, but require their own profile and integration evidence. Full exchanges are predominantly design/test references because their custody and runtime models differ.

## Research files

| File | What an implementation worker will find |
| --- | --- |
| [00 — Unfinished-feature map](00-unfinished-feature-map.md) | Exact repository baseline, all 27 non-complete canonical records, existing work to preserve and recommended order. |
| [01 — Core transport and wallets](01-core-transport-wallets.md) | Nostr/peer acceptance, transport, EVM utilities, mobile wallets and native Solana/SPL candidates. |
| [02 — Proofs and optional protocols](02-proofs-and-optional-protocols.md) | zkTLS, membership/reputation, stealth, proof tooling, arbitration/randomness and the limits of each donor. |
| [03 — Product, recovery and release](03-product-recovery-release.md) | QR, canonicalization, localization/accessibility, browser/storage testing, authenticated updates and archive readers. |
| [04 — Escrow, maps, privacy and comparable exchanges](04-escrow-maps-privacy-and-peer-projects.md) | Existing OpenZeppelin/Foundry reuse, extra assurance tools, Mostro/RoboSats/Bisq/Haveno comparisons, MapLibre/PMTiles, locker transport, TorJS and deferred shielded/UTXO references. |
| [Source index](SOURCE-INDEX.json) | Deduplicated immutable upstream references, official-document links, repository baseline and SHA-256 checksums for the five reports. |

Each detailed report provides immutable source revisions, exact upstream files or symbols, license evidence, existing or explicitly proposed destination paths, missing integration work, acceptance tests and reasons to defer unsuitable alternatives. Research pins identify inspected source; they are not automatically approved release artifacts or lockfile changes.

## Selection findings that change earlier assumptions

- **WalletConnect and Reown are conditional mobile choices.** Their inspected community licenses include network-use, commercial-threshold and modification provisions. The [core report](01-core-transport-wallets.md) identifies the exact texts and the smaller provider integration seam.
- **New TLSNotary work should evaluate the current core/extension architecture.** The old `tlsn-js` package is deprecated. Reclaim's MIT SDK and AGPL attestor are separate components; Semaphore's MIT proof wrapper depends on GPL `snarkjs`. The [proof report](02-proofs-and-optional-protocols.md) records these distinctions and unresolved artifact/provider contracts.
- **TorJS is a concrete new browser-routing lead, with substantial integration work.** Its experimental gateway/WASM architecture still needs a bounded, cancellable adapter and an explicit traffic-coverage profile. See the [privacy report](04-escrow-maps-privacy-and-peer-projects.md); it is not an application-wide Tor implementation.

## Recommended next work packages

| Order | Work package | Reuse opportunity | Required outcome |
| --- | --- | --- | --- |
| 1 | Consolidate current work and close the peer-acceptance contract | Preserve PR #26; use Nostr/EIP-712 primary sources and independent implementation vectors | Two separate clients exchange correctly bound acceptance evidence, with explicit replay/expiry/version behavior and no fixture-only peer capability. |
| 2 | Freeze release/deployment/archive profiles | TUF concepts and exact archive/content-address tooling, alongside existing release services | Authenticated registry plus canonical ABI/artifact; explicit root-transition and original-exit recovery rules. |
| 3 | Add one bounded QR implementation | Prefer a coherent scanner/renderer stack; retain file/manual fallback | Decode to an untrusted candidate, validate the selected typed payload, review it, then explicitly import; no scan-triggered authority. |
| 4 | Complete wallet handoff and qualification | Existing provider boundary plus evaluated WalletConnect/Reown or native wallet support | Checkpoint before switching, validate the allowed return, refresh account/network/permission, and measure actual supported wallet/device tuples. |
| 5 | Implement native SOL/SPL after the profile | Solana client/codec/wallet and Anchor/native-program sources | Separate native custody, journal, finality, token-extension and recovery behavior tested on a local validator. |
| 6 | Improve evidence at the existing boundaries | Existing Foundry handler; targeted Playwright/axe/WPT and independent vector checks | New tests close named gaps rather than duplicate existing suites or inflate completion counts. |
| 7 | Evaluate later optional providers | TLSNotary/Reclaim, Semaphore, ERC-5564 sources, MapLibre/PMTiles and TorJS | One coherent inactive intake per selected provider, with exact artifacts, resource limits and measured compatibility before integration. |

## How to use the recommendations

Prefer a small version-pinned dependency behind an existing interface when it fits. Prefer independent vectors or behavioral reference material when runtime replacement would add complexity. Copy or adapt source only when its exact license, attribution, dependencies and maintenance cost are understood. “Reference-only” and “deferred” entries are useful negative results: they identify what should not be pasted into the product.

For each admitted component, record the chosen source revision and package artifact/integrity separately; transitive licenses and build scripts; exact local owner/interface; upstream modifications, if any; independent vectors; lifecycle/cancellation/size/network behavior; and the concrete acceptance result. Preserve upstream notices in source and emitted artifacts. The existing [reuse baseline](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.3_reusable_code/spec-open-source-component-matrix.md) and [attribution record](../../../THIRD_PARTY_NOTICES.md) remain the starting point. These notes supply current evidence without silently turning research candidates into adopted dependencies.

The snapshot and PR distinction matter: `main` is `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa`; PR #26 is `94554ecf9854e4604f9f56afe5bebedeee931994`. References to PR #26-only packages are integration prerequisites, not claims that those packages are already on main. Source files were checked against the remote tree; existing test counts are historical evidence. This task changes research documentation only and does not claim new application test runs, imported code, feature activation or release readiness.
