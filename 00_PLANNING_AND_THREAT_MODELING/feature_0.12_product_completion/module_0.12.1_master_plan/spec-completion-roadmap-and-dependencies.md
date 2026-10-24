# P2P Off-ramp complete product plan
Status: planning, not implemented. This document supplements the existing architecture and feature specs. Source reference: [GhostPay blueprint](https://github.com/djshellshoxxx/GhostPay/blob/main/docs/MASTER_BLUEPRINT.md), [security playbook](https://github.com/djshellshoxxx/GhostPay/blob/main/docs/SECURITY_QA_DEVOPS_PLAYBOOK.md), [post-launch roadmap](https://github.com/djshellshoxxx/GhostPay/blob/main/docs/POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md). Reuse design patterns, not unreviewed code. Do not represent GhostPay as audited or deployed without evidence.

## Mandatory end-to-end journeys
Offer creation, discover/match, counterpart verification, wallet connect, chain/network confirmation, quote expiration, escrow funding, payment-instructions exchange, evidence presentation, settlement attestation, dispute/timeout, release/refund, receipt/export, recovery after tab/device loss. Define actors, state transitions, deadline, fees, custody, recovery, accessibility and test case for each. No fiat transfer or payment-processor settlement should be claimed final solely from a screenshot, unverified webhook or zkTLS proof.

## Milestones and acceptance gates

The authoritative milestone graph is [DEVELOPMENT_ROADMAP.md](../../../DEVELOPMENT_ROADMAP.md): M0 security foundation; M1 recoverable static shell; M2A EVM vertical slice; M2B Solana parity; M2C standalone release; M3 optional privacy; M4 fiat evidence; M5 physical coordination; M6 opt-in arbitration. This document adds cross-device, QR, accessibility and documentation requirements to those milestones; it does not redefine their order or add arbitration to basic escrow. G02/G03 recovery precedes funds-enabled trading.

Release gates: 100% documented invariants tested; no unresolved critical/high security findings; all supported wallet/chain combinations tested; translations reviewed; WCAG 2.2 AA audit; data-loss and network-disconnect recovery tests; dependency licenses verified; explicit risk disclosures; testnet funds only until independent review.

## Essential features to scope
User-controlled RPC; network health and chain mismatch; gas/fee preview; allowance limits and revoke guidance; balance and supported-token verification; immutable order IDs and receipt integrity; exact amount/expiry confirmation; quote freshness; status timeline; local export/import and recovery; malicious counterpart report/block; counterfeit site warning; dispute deadlines and evidence minimization; offline read-only status; payment-method risk warnings; optional watch-only mode; signed app version; safe address copy and full-address inspection; transaction explorer link (privacy warning); fee transparency and refund policy. Optional: templates, favorites stored locally, repeat-trade defaults, privacy preset selector, shareable referral links without transaction identifiers, educational demo mode and local-only analytics.

## Decision records to complete
ADR-001 escrow/dispute authority; ADR-002 fiat settlement evidence trust; ADR-003 supported jurisdiction/payment rails; ADR-004 identity and optional anonymity; ADR-005 transport and spam defense; ADR-006 hosting/origin trust; ADR-007 encrypted backup; ADR-008 wallets/mobile; ADR-009 optional advanced privacy; ADR-010 monetization and fees. Every ADR must include alternatives, threat tradeoffs and reversal plan.
