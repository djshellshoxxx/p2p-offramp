# Future features: privacy architecture and enhancements

**Status:** Proposed / not implemented by this document  
**Date:** 2026-11-17  
**Scope:** Future optional extensions, not a change to the current release boundary  
**Project:** P2P-Offramp

## 1. Purpose and non-negotiable constraints

Improve privacy for buyers and sellers during discovery, negotiation, escrow, fiat coordination, settlement, and dispute resolution without compromising noncustodial ownership or accurate security claims.

- Follow [the authoritative development roadmap](../../DEVELOPMENT_ROADMAP.md) and [client-side ADR](../adr/ADR-CLIENT-SIDE-2026-10-24.md). Remain a static React/TypeScript/Vite client; no mandatory app-operated server, central identity database, hosted private keys, or central KYC account.
- All new capabilities are **versioned, opt-in per trade** where they affect the contract or protocol. Preserve existing signed terms, escrow exits, wallet boundaries, recovery, and manual-fiat-settlement risk disclosures.
- Do **not** turn on real-funds trading. `ReleaseEnabled` remains zero until the separate existing qualification gates pass.
- Distinguish encryption, pseudonymity, unlinkability, and true confidentiality. Do not promise anonymity from banks, payment processors, counterparties, public chains, relays, RPC operators, wallet providers or network observers where not technically established.
- Research dependencies and avoid implementing custom cryptographic primitives without expert review. Record security assumptions, version pins, test vectors, external audits, and rollback paths.
- Respect recoverability, authentication, replay resistance, offline/reconnect behavior, and escrow dispute evidence. Deleting local data does not retract copies held by relays, peers, banks or public ledgers.

## 2. Privacy threat model and measurement

Document an observer matrix covering: public relay operator, matching service, counterparty, wallet extension, RPC provider, block explorer, ISP/network observer, payment institution, arbitrator, local device attacker, colluding users, and compromised browser origin.

Define observable fields for each action: IP, persistent identity, ephemeral keys, order IDs, asset, amount, price, timing, geolocation, payment method, wallet address, escrow contract and event topics, messaging metadata, proof inputs and receipts. Prior to release, instrument a synthetic end-to-end flow and produce a metadata exposure report comparing private and standard modes. All privacy UI labels must map to verified properties of the active transport/wallet/rail.

## 3. Feature backlog and acceptance requirements

### PRIV-001 — Per-trade disposable identities (Critical)
**Goal:** Minimize linkability across separate trades.

**Requirements:** Derive or generate independent per-trade messaging/session keys locally using domain-separated key derivation; ensure each is authenticated to its own signed trade terms without public linkage to a long-term profile. Define recovery/backup, retirement, key rotation, cancellation, and dispute retention. Never reuse a session key inadvertently. Where durable reputation is needed, use selective-disclosure credentials rather than publishing a shared key on every trade.

**Acceptance:** Two separate trades expose no shared application-generated public trading identifier by default; recovery reinstates a live session with no unauthorized re-sign; a counterparty can authenticate only their own trade; test correlation against relay, timing and chain metadata and document residual leakage.

### PRIV-002 — Private authenticated negotiation (Critical)
**Goal:** Keep terms and messages confidential to authorized peers.

**Requirements:** Integrate interoperable NIP-44 payload encryption and NIP-17/NIP-59 private messaging as appropriate to existing transport, with authentication, deduplication, replay protections, bounded queues, expiry, and encrypted local persistence. Never include bank credentials, legal names, attachment contents, shipping/contact details or evidence in public events. Disallow silent NIP-04 downgrade. Consider attachment encryption and content scanning limitations.

**Acceptance:** Adversarial relay and unauthenticated recipient cannot read message contents; malformed/replayed events are rejected; reconnect and backup restore do not duplicate irreversible actions; prove via test vectors and cross-client interoperability.

### PRIV-003 — Verified private transport (Critical)
**Goal:** Reduce network-origin disclosure where feasible.

**Requirements:** Support Tor/I2P via an explicitly verified external proxy or supported environment. A browser-only application cannot assume it can force all traffic (wallet extensions, DNS, WebRTC, RPC, relays, payment proofs) through Tor. Introduce transport status: verified-private, direct, unsupported, unknown. Strict-private mode MUST fail closed when routing cannot be enforced; never silently fall back. Document dependency on browser and OS proxy enforcement.

**Acceptance:** Controlled proxy-leak tests include relay/WebSocket, RPC, wallet handoff and refresh; no direct fallback in strict mode; unavailable transports are truthfully labeled unsupported/unknown.

### PRIV-004 — Isolated receiving addresses and escrow linkage review (Critical)
**Goal:** Reduce wallet/address reuse and cross-trade clustering.

**Requirements:** Prefer fresh receiving addresses compatible with each chain and escrow profile. Evaluate ERC-5564 stealth address capability for supported EVM receiving paths and its actual effect on visible escrow, asset, amount, funding account and gas linkage. Use per-trade isolation without implying escrow contract addresses or transfer events are confidential. Preserve solvency, claimability, refund, expiry, and recovery. Solana receives an independent compatibility review.

**Acceptance:** Independent address generation and recovery vectors pass; funding/release/refund invariants unchanged; chain-analysis fixtures document linkable metadata left visible.

### PRIV-005 — Data-minimized order advertisements and private discovery (Critical)
**Goal:** Avoid publishing unnecessary trading and liquidity profiles.

**Requirements:** Publish minimum discovery fields; encrypt precise amounts, payment coordinates and counterparty details after authenticated match. Offer optional invite-only orders, bounded amount bands and blinded/private matching research. Define order expiry, cancellation and relay retention honestly; prohibit publicly readable decryption keys. Preserve signed terms validation, matching integrity, spam resistance and manipulation resistance.

**Acceptance:** Passive relay scraping cannot extract exact private terms from protected orders; public disclosure documented per mode; malformed/expired/replayed offers rejected, and match outcomes deterministic and authenticated.

### PRIV-006 — Unlinkable portable reputation credentials (High)
**Goal:** Enable trust without exposing complete trade histories.

**Requirements:** Specify signed outcome attestations, credential portability, selective disclosure or ZK threshold proofs (e.g. minimum completed trades) and per-context nullifiers to limit double-use where needed. Do not put trade IDs or permanent identity pointers in public proofs. Address Sybil farming, colluding attestations, malicious negative ratings, revocation, recovery, loss and reputation laundering. Claims must identify issuer/trust assumptions.

**Acceptance:** Verifier proves a threshold without learning underlying trades in a demonstrable circuit/protocol; repeated verifier queries do not trivially link users except expressly disclosed scope; adversarial Sybil and forged credential tests documented.

### PRIV-007 — Privacy-preserving fiat payment evidence / zkTLS (High)
**Goal:** Verify narrowly defined payment facts without sharing full financial records.

**Requirements:** Research provider-specific consent, TLS/proof threat models, notary/prover trust and data minimization. Bind proof to trade identifier, amount, currency, payee, payment reference and freshness where the rail supports trustworthy attributes. Distinguish initiation, posting, settlement, reversibility and chargeback; a payment proof does not mean irrevocable receipt. Do not collect online banking passwords or store raw statements. Optional feature only, never required for the manual fiat path.

**Acceptance:** Independent test fixtures reject swapped trade/amount/payee, expired/forged proofs and provider format changes; document unavailable banks and rails; UI never describes initiation as final payment.

### PRIV-008 — Selective disclosure and encrypted dispute bundles (High)
**Goal:** Reveal only necessary data to a specific counterparty or authorized arbitrator.

**Requirements:** Define granular capability-bound disclosure grants, expiration, explicit previews and recipient-specific encryption. Support redacted evidence bundles, signed manifest, chain of custody, export, recovery and revocation semantics that acknowledge already downloaded copies. Disputes must not require publishing unrelated trades. Never allow optional modules to retroactively gain control of funded escrow.

**Acceptance:** No bystander or unrelated arbitrator can decrypt protected evidence; disclosure preview names recipients and fields; access controls, tamper checks and recovery pass.

### PRIV-009 — Local-first retention, secure export, and telemetry minimization (High)
**Goal:** Avoid an application-wide personal data repository.

**Requirements:** Use existing encrypted IndexedDB/CAS and vault boundary; separate keys by purpose, set bounded expiry for nonessential material, allow explicit user-controlled export and local removal, sanitize exceptions/logs, prevent secrets entering analytics or crash reports, prohibit mandatory remote telemetry. Keep transaction-critical receipts and journals until safe recovery requirements permit pruning. Document browser backup/sync leakage risks.

**Acceptance:** Static/network audit shows no mandatory app-run collection endpoint; ciphertext and logs leak no payment secrets; tamper/reload/restore tests pass; user can see what is retained and cannot force remote deletion.

### PRIV-010 — Confidential on-chain settlement research (Advanced)
**Goal:** Investigate settlement that exposes less transaction metadata.

**Requirements:** Evaluate privacy-preserving chain, token, shielded-pool or confidential settlement adapters only where noncustodial escrow, refunds, dispute paths, asset compatibility, auditability and soundness can be established. Treat cross-chain bridges, mixers and third-party custody as new threat surfaces, not inherent privacy improvements. Assess anonymity sets, timing correlation, entry/exit leaks, fees, compliance constraints and chain finality. Do not replace the core EVM/Solana MVP.

**Acceptance:** Written comparative threat model and audited prototype on test networks; explicit residual linkability; independently reproduced complete trade, timeout, recovery and adversarial settlement paths before activation.

### PRIV-011 — Anonymous/limited-disclosure arbitration (Advanced)
**Goal:** Resolve disputes without publishing full identities and unrelated history.

**Requirements:** Scope juror access using encrypted evidence, minimal credentials, opt-in contract version and immutable dispute authority bound at funding. Evaluate anonymous juror eligibility proofs with anti-Sybil safeguards. Preserve collusion, appeal/finality, denial-of-service and key-loss handling; do not claim zero-knowledge proof can establish real-world fiat receipt by itself.

**Acceptance:** Unauthorized jurors learn nothing beyond public metadata; authorized decisions verifiable and bound to contract/trade; no arbitration code can alter legacy escrows; document failure/recovery tests.

### PRIV-012 — Payment-method privacy labels and leakage dashboard (High)
**Goal:** Make actual privacy properties understandable to users.

**Requirements:** Per payment method and execution mode show who can observe identity, account details, amount, timing, IP, wallet graph, and chargeback information. Include examples for bank transfer, Interac e-Transfer, PayPal, cash, and cryptocurrency, with jurisdiction/provider dependence. State unknown instead of green/anonymous whenever a guarantee is not verified. Offer local pre-trade preview listing counterparties, chain and network endpoints, disclosures and irreversible data.

**Acceptance:** Automated decision-table tests ensure disclosures reflect runtime capabilities; strict mode blocks or warns for unsupported network claims; UI cannot label fiat-bank transactions anonymous.

## 4. Dependency order / future phases

| Future lane | Features | Prerequisites | Release gate |
|---|---|---|---|
| A: foundational metadata protection | PRIV-001, 002, 003, 005, 009, 012 | Current identity, vault, relay, browser transport and core trade terms | threat-model audit, cross-client tests, no regression of core |
| B: private settlement coordination | PRIV-004, 007, 008 | Escrow profile review, provider-specific proof evaluation, existing manual fiat path | independent cryptographic / chain review and end-to-end adversarial tests |
| C: private trust and governance | PRIV-006, 011 | Credential system, opt-in arbitration versioning | Sybil/collusion evaluation, independent verification |
| D: confidential settlement research | PRIV-010 | Proven chain/asset/escrow compatibility | audited testnet prototype and honest confidentiality evaluation |

These future lanes do **not** replace phases 0–6 of the current authoritative roadmap, and are not MVP blockers. The implementation order within a lane can be adjusted after reviewing current code and dependency inventories.

## 5. Engineering contracts

Each feature implementation PR MUST include: (1) scoped ADR and threat-model delta; (2) versioned schema/capability negotiation and backwards compatibility; (3) cryptographic or protocol vectors; (4) boundary tests and adversarial/privacy-linkage tests; (5) independent review evidence and pinned dependencies; (6) updated UI claims and operator documentation; (7) deterministic recovery and rollback tests; (8) explicit statement about any new network/third-party trust assumptions.

All chain-affecting changes MUST preserve seller-funded escrow, buyer binding, signed terms, release/refund invariants and the manual-fiat risk model unless a separately approved, versioned escrow profile explicitly changes those economics. A core-only build MUST work without future-feature packages.

## 6. Definition of done

A feature is complete only when implemented, tested against its acceptance requirements, interoperable with supported clients, demonstrated without prohibited network/key leaks, reviewed independently for the threat model, documented, and integrated without changing default funding/release gates. A passing CI run is necessary but insufficient for real-funds readiness.

**Tracking status:** All PRIV-001 through PRIV-012 are **proposed**, not implementation claims.
