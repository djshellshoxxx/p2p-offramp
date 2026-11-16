# Feature completion matrix

Updated: 2026-11-16

This matrix tracks user-facing and release-critical P2P-Offramp features. A code
implementation or passing unit suite does not establish release completion. A
feature is verified only when its specification, application wiring, acceptance
evidence, security review, documentation and required release checks all pass.

| ID | Feature | Specification | Current implementation and evidence | Remaining work | Status |
|---|---|---|---|---|---|
| F01 | Encrypted vault, profile storage and migrations | `docs/adr/ADR-CLIENT-SIDE-2026-10-24.md`; vault and migration specs | Encrypted IndexedDB/CAS storage, migration, fresh-key backup and restore; package tests pass on current branch | Browser IndexedDB race and supported-device qualification; external security review | Implemented; release-gated |
| F02 | Local messaging identity and lifecycle | Identity package specifications | Encrypted key material, explicit creation/adoption/retirement, lock invalidation and lifecycle tests | Browser and hardware-wallet acceptance; key rotation policy for D1 | Implemented; integration-gated |
| F03 | Private messaging and relay transport | Messaging and transport specifications; `packages/messaging/README.md` | NIP-17 encrypted messaging, durable authenticated history, bounded relay pool and replay controls | Real relay interoperability, browser journey and deployment privacy review | Implemented; acceptance-gated |
| F04 | EVM escrow contracts | `contracts/evm/`; EVM contract specifications | Native and ERC-20 escrow implementation; prior evidence records 82 Foundry tests | Re-run Foundry on current head; independent Solidity review; exact deployed runtime qualification | Implemented; review-gated |
| F05 | Trade terms and offline review | `packages/wallet/`; trade and offer specifications | Signed terms, local terms review and synthetic demo Offers; registry checks fail closed | Approved registry and production trust roots; full seller/buyer UI flow | Partial; release-gated |
| F06 | Wallet transaction lifecycle and recovery | `docs/consolidation/2026-11-16-d9-migration.md` | Versioned durable send marker, conservative recovery, nonce holds and restored-record tests | Exact-head hosted checks; browser crash/reload and wallet rejection journey; independent review | Implemented; acceptance-gated |
| F07 | Canonical escrow state reader | G3 design and canonical qualification docs | Canonical `getTrade(bytes32)` reader plus explicit legacy layouts and local differential tests | Runtime policy approval, hosted checks and independent contract review | Implemented; approval-gated |
| F08 | Payment verification and settlement guidance | Payment-preflight and receipt specifications | Read-only native chain observations and payment guidance; no fiat receipt is treated as proof | Two-party browser acceptance and independent review of each enabled settlement path | Partial; acceptance-gated |
| F09 | D1 peer acceptance and replay protection | `docs/integration/peer-acceptance-v1-candidate.md` | Private EOA verifier, four differential vectors, encrypted CAS replay ledger and cancellation tombstones; 18 focused tests pass | Independent field/vector review; contract/delegated account policy; v2 carrier and authenticated session wiring; restore freshness and browser races | Candidate; not integrated |
| F10 | Web application and Offers workflow | `apps/web/README.md`; static Offers review | Locked profile shell, create/restore UI and synthetic offline Offers review | Authenticated live discovery, peer acceptance, two-wallet flow and browser qualification | Partial |
| F11 | Mobile and QR handoff | Mobile journey specifications and historical branches | No current-head physical-device acceptance evidence | Recover and review unique implementation; bind QR/deep links to authenticated session; test device restore and wallet switching | Unverified |
| F12 | Localization and accessibility | Locale catalogs and accessibility specifications | English catalog, locale checks and keyboard-focused recovery controls | Complete runtime locale coverage, supported-language audit, browser/assistive-technology checks | Partial |
| F13 | Disputes, arbitration and recovery options | Dispute, arbitration and recovery specifications | No enabled arbitration or custody authority in default application | Review each optional design, define trusted adjudication and recovery limits, then implement independently | Planned / gated |
| F14 | Payment-proof integrations | zkTLS/TLSNotary/Reclaim research and proof specifications | Research only; no production proof adapter | Select reviewed protocol, define trust and limits, implement an adapter and qualify real fixtures | Planned |
| F15 | Solana escrow and payout | D5/Solana specifications and historical PR #50 | Historical program source exists; not qualified on current continuation head | Review source provenance, build and run LiteSVM, implement client adapter, verify rollback semantics and review independently | Unverified |
| F16 | Release trust, deployment and real-funds enablement | D2/D8 decisions; deployment and acceptance gates | Build and workflow tooling exist; `ReleaseEnabled=0` | Owner trust-root/key decisions, independent security review, funded testnet acceptance, exact-head CI and signed release qualification | Blocked by external gates |
| F17 | Optional roadmap modules | D7 decision and feature specifications | D7 parks optional packages pending core qualification | Keep separately modular; begin only after core release gates and per-feature intake | Deferred |

## Evidence limits

- Local package tests do not prove browser, physical-device, relay, hosted CI,
  testnet, production or independent-review acceptance.
- Historical branch presence does not prove current integration or correctness.
- D1 remains a private candidate. It grants no funding authority and is not
  connected to the live exchange.
- Release enablement remains zero. No production or real-funds readiness is
  claimed.
