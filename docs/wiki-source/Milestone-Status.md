# Milestone status

**Snapshot: 2026-11-10.** No milestone is complete. ReleaseEnabled is 0. Trading and funds are disabled in every build. No real-funds readiness is claimed.

Sources: [roadmap](../../DEVELOPMENT_ROADMAP.md) (milestone order and exit artifacts), [task ledger](../../tasks/todo.md), [README](../../README.md).

| Milestone | Exit artifact (roadmap) | Status | Evidence and open gaps |
|---|---|---|---|
| M0 approved foundation | Reviewed threat model, crypto/vault/transport contracts, test evidence | Planned; partial foundations | Encrypted vault, fresh-key backup recovery and transport-policy work exist (ledger T1–T9, README). No named M0 review sign-off is recorded. |
| M1 recoverable static shell | Reproducible static build; tested adapter and state boundaries | In progress | Static React/Vite shell, locked startup, unlock/lock, create/restore UI and native Worker exist (README). Clean-install digest/CID and test-shell publish checklist are not recorded as done. |
| M2A EVM vertical slice | Complete EVM test-network trade and recovery paths | In progress | Local EVM escrow, read-only chain validation, journaled execution and a two-party loopback recovery test exist. Open: full fund, finality, payment, release and timeout/refund journeys with two fresh clients; direct-contract recovery without frontend or relay; zero open critical/high findings on enabled custody paths. Ledger T12 and T30 still show INTEGRATING. |
| M2B Solana parity | Independently validated Solana/SPL paths | Blocked | Undefined: exact PDA seed bytes, account layouts, discriminators, program IDL/SDK and token profiles. Solana/Cargo/Anchor toolchain is absent from the workspace (INCOMPLETE-WORK-2026-10-31, GUIDANCE-REMAINING-2026-11-01). EVM fixtures are not Solana parity. |
| M2C standalone release | Deployable release bundle with advanced modules absent | Not started | Depends on M2A and M2B. Release checklist in roadmap is unchecked. No deployment. |
| M3 privacy extensions | Opt-in stealth and reputation compatibility evidence | Planned; no implementation recorded | Depends on M2C. |
| M4 authenticated fiat evidence | Bounded WASM jobs; reviewed bank/rail policies | Planned; no implementation recorded | Basic trades use manual settlement only. Fiat proof is not part of the basic escrow. |
| M5 physical coordination | Consent, spoofing, hardware and custody recovery evidence | Planned; no implementation recorded | Optional. Not required for basic trades. |
| M6 dispute extension | Audited tribunal version with bounded finality | Planned; no implementation recorded | Optional. Basic escrows have no juror or arbitration path. |

## Next step

Prepared plan for M2A (and M2B/M2C preparation): [M2A orchestration prompt, 2026-11-10](../execution/MILESTONE-M2A-ORCHESTRATION-PROMPT-2026-11-10.md).

The prompt runs only when the project owner explicitly asks for execution. Reading it grants no authority.

## Rules for this page

- Status reflects repository documents and the task ledger. It does not add claims.
- Changing a status requires recorded evidence in the ledger or a linked execution document.
- Being "in progress" or "planned" is not a release, audit or approval.
