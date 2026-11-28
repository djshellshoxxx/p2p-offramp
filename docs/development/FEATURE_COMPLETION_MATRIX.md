# Feature completion matrix — historical November 18 checkpoint

For current source scope, use [the November 19 feature coverage matrix](../engineering/FEATURE_MATRIX.md) and [the consolidation handoff](../engineering/CONSOLIDATION_HANDOFF.md). The draft/merge states below are preserved as historical evidence at their stated source SHA.

Updated: November 18, 2026; source `main@6c38e641e24abcfdcf645f864bd64c9645836d75`.

[The reconciliation record](../consolidation/2026-11-18-documentation-reconciliation.md)
pins the merged source and active draft stack. This matrix counts main capabilities;
#166/#167/#168 and later ERC-20/browser work remain separate until qualified and merged.
No product tests were rerun by this documentation update. Earlier test counts belong
to their recorded source checkpoints, not automatically to the current row.

This matrix tracks user-facing and release-critical P2P-Offramp features. A code
implementation or passing unit suite does not establish release completion. A
feature is verified only when its specification, application wiring, acceptance
evidence, security review, documentation and required release checks all pass.

| ID | Feature | Specification | Current implementation and evidence | Remaining work | Status |
|---|---|---|---|---|---|
| F01 | Encrypted vault, profile storage and migrations | `docs/adr/ADR-CLIENT-SIDE-2026-10-24.md`; vault and migration specs | Encrypted IndexedDB/CAS storage, migration, fresh-key backup/restore and regression source are on main | Supported-browser/device qualification and independent security review; new stack recovery paths need their own evidence | Implemented; release-gated |
| F02 | Local messaging identity and lifecycle | Identity package specifications | Encrypted key material, explicit creation/adoption/retirement, lock invalidation and lifecycle tests | Browser and hardware-wallet acceptance; key rotation policy for D1 | Implemented; integration-gated |
| F03 | Private messaging and relay transport | Messaging and transport specifications; `packages/messaging/README.md` | NIP-17 encrypted messaging, durable authenticated history, bounded relay pool and replay controls | Real relay interoperability, browser journey and deployment privacy review | Implemented; acceptance-gated |
| F04 | EVM escrow contracts | `contracts/evm/`; EVM contract specifications | Canonical native and ERC-20 escrow, ordinary/fuzz/invariant tests and merged development-only formal harness #137 | Independent Solidity/release review and exact deployed runtime qualification; formal UNKNOWNs and model gap remain explicit | Implemented; review-gated |
| F05 | Trade terms and offline review | `packages/wallet/`; trade and offer specifications | Signed terms, local terms review and synthetic demo Offers; registry checks fail closed | Approved registry and production trust roots; full seller/buyer UI flow | Partial; release-gated |
| F06 | Wallet transaction lifecycle and recovery | `docs/consolidation/2026-11-16-d9-migration.md` | Versioned durable send marker, conservative recovery, nonce holds and restored-record tests | Exact-head hosted checks; browser crash/reload and wallet rejection journey; independent review | Implemented; acceptance-gated |
| F07 | Canonical escrow state reader | G3 design; `packages/chain-evm/README.md` | Canonical `getTrade(bytes32)` reader and EIP-1898 block-hash binding merged through #143 | Downstream wallet/payment/recovery hardening in draft #166; endpoint and deployed-runtime qualification | Implemented; further integration pending |
| F08 | Payment verification and settlement guidance | Payment-preflight and receipt specifications | Read-only native chain observations and payment guidance; no fiat receipt is treated as proof | Two-party browser acceptance and independent review of each enabled settlement path | Partial; acceptance-gated |
| F09 | D1 peer acceptance and replay protection | `docs/integration/D1-peer-acceptance.md` | Option B two-signature v2 carrier, account verification, exchange composition and durable replay are merged through #150; default app does not enable trading | External-wallet signer and complete two-party browser acceptance are in draft #166/#168; physical-wallet interoperability and release review remain | Library/exchange integrated; browser acceptance pending |
| F10 | Web application and Offers workflow | `apps/web/README.md`; static Offers review | Main exposes encrypted profile create/restore and synthetic offline Offers review; native-EVM localnet trading composition is draft #168 | Qualify actual built-artifact browser flow, ERC-20 UI parity, recovery/unknown-broadcast paths and unfunded-negotiation resumption | Partial; draft trading composition |
| F11 | Mobile and QR handoff | Mobile journey specifications and historical branches | `packages/qr` on main (PR #140): RFC 9285 base45, RFC 8785 canonical envelope, `P2POFFRAMP:1:` text codec with a 2,048-byte decoded cap, ISO/IEC 18004 symbol encoder and static SVG renderer, with package tests. No app or script imports it yet. No current-head physical-device acceptance evidence. | Camera/scanner UI and image decoding; wire the codec into the app; bind QR/deep links to authenticated session; test device restore and wallet switching | Unverified |
| F12 | Localization and accessibility | Locale catalogs and accessibility specifications | English catalog and locale checks, keyboard-focused recovery controls, document language/direction and conditional selector wiring merged in #135 | Supported translations and runtime locale coverage; browser, zoom, RTL and assistive-technology qualification | Partial |
| F13 | Disputes, arbitration and recovery options | Dispute, arbitration and recovery specifications | No enabled arbitration or custody authority in default application | Review each optional design, define trusted adjudication and recovery limits, then implement independently | Planned / gated |
| F14 | Payment-proof integrations | zkTLS/TLSNotary/Reclaim research and proof specifications | Research only; no production proof adapter | Select reviewed protocol, define trust and limits, implement an adapter and qualify real fixtures | Planned |
| F15 | Solana escrow and payout | D5/Solana specifications; `packages/chain-solana/README.md` | Native/SPL program source, finalized read-only adapter and unsigned instruction builders are on main; verify-only off-chain consent/replay candidate merged in #151 | Native settlement/lifecycle/encrypted recovery in draft #167 needs combined real-validator qualification; external-wallet/browser action wiring remains unfinished | Partial; native client integration pending |
| F16 | Release trust, deployment and real-funds enablement | D2/D8 decisions; deployment and acceptance gates | Offline signed registry/release primitives, QR codec and explicit artifact build-mode checks are merged (#140/#141); `ReleaseEnabled=0` | Approved trust roots/pins, independent security/dependency review, physical-wallet/public-testnet acceptance, exact-source hosted checks and signed owner release authorization | Blocked by remaining qualification and owner release gate |
| F17 | Optional roadmap modules | D7 decision and feature specifications | D7 parks optional packages pending core qualification | Keep separately modular; begin only after core release gates and per-feature intake | Deferred |

## Evidence limits

- Local package tests do not prove browser, physical-device, relay, hosted CI,
  testnet, production or independent-review acceptance.
- Historical branch presence does not prove current integration or correctness.
- D1 Option B is merged as a library/exchange capability. Its presence does not
  enable the default app or qualify the draft browser trading composition.
- Release enablement remains zero. No production or real-funds readiness is
  claimed.

Historical intake and the earlier EOA candidate: [November 16 carrier review](../consolidation/2026-11-16-carrier-review.md).
The earlier matrix's 82 Foundry tests plus four vector checks describe that historical
continuation; no fresh contract-test count is inferred by this documentation change.
