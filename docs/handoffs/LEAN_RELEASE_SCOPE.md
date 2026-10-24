# P2P Offramp lean release scope

**Status: owner-approved working boundary, 2026-10-24 UTC.** Documentation only; not release acceptance, an audit, or permission to enable trading or use production funds.

Application baseline: draft PR #5 `claude/adoring-wozniak-850ue6` at `a606743d4f417ee37158e69292ea0395b55b5675`, stacked on unmerged PR #4 `work/p2p-client-shell-2026-10-24` at `8a88d11d8e419cd402b28428947e8fe4fbcfe893`. `main` was `28bc32f1c8ea98d6216b2e1509b1fb5e3374bcfa`. Recheck live refs; do not merge application code merely to publish these instructions.

## A trade product needs one real local/test EVM trade

The encrypted-profile/recovery shell is a useful **offline foundation preview**, not a working off-ramp. A minimal trade release requires:
- G03/G09 key-bound recovery/resealing and migration acceptance without source-profile loss.
- Approved signed network/asset/deployment registry and update-manifest trust path (G11/G15).
- Canonical signed trade terms (G16), with independent digest vectors.
- Wallet/signing, reviewed escrow/custody contracts and funds model, offer exchange and trade UI.
- Two-party local/test EVM evidence for offer → accept → fund → settle/refund, or an honest unknown outcome, including chain observation, recovery, replay, amount and expiry controls.
- Independent exact-build review and applicable audit/release gates.

Exact network, trust root, custody model and deployment are verification/decision gates, not assumptions. Keep `ReleaseEnabled=0` and `connectOrigins: []`; any future enabling requires the applicable reviewed prerequisites and explicit owner authority. No production funds.

## Retain everything; narrow what is qualified

| Area | Lean disposition |
|---|---|
| Encrypted profiles, storage/CAS, identity, create/unlock/inventory, backup/restore and shell | Foundation preview to reuse; not trade-product acceptance. Preserve cap 16 pending explicit policy ratification. |
| G03/G09 recovery; G11/G15 trust; G16 terms; wallet, escrow, offer exchange, trade UI and chain lifecycle | `beta-core` requirements; `blocked` until prerequisites, implementation and acceptance evidence pass. EVM-only work is M2A, not full M2C/Solana completion. |
| Solana parity, reputation/proofs, private pools, meetup/courier/locker, arbitration, liquidity/partial fills and advanced messaging | `later-preserved`; excluded from the first EVM-trade claim until separately qualified. |
| Deferred-path reachability in a future release artifact | `excluded-with-proof` only after evidence; this document has not isolated or disabled source. |

Keep all existing branches, code, specifications, tests, research, provenance and history. Deferred-code isolation is separate future implementation work, not done here. Prove deferred paths cannot affect the supported core, or exclude them from the artifact. Count duplicate capabilities once while retaining independent tests/history; prototypes remain unqualified. The custodial-ledger branch stays archival/reference only: never merge it into the client-only path or make its balances/holds settlement authority.

## Next sequence and acceptance

Follow [restart instructions](RESTART.md). After the GhostPay core milestone, establish G09 durable-result/preflight acceptance and source-bound G03 recovery/resealer reconciliation, then G11/G15 → G16 → wallet/escrow/offer exchange/trade UI → two-party EVM proof.

Preserve the 16-profile bound; do not revert to 255 or delete/overwrite a source profile to create migration space. Keep exact persisted-envelope semantics and migration, interrupted-resume, cross-tab, quota, replay, amount/expiry and unknown-outcome tests. Obtain the owner-supplied private review packet before detailed reproductions; new unrun cases remain unrun until executed.

Keep existing test/resource/crypto/security/trust gates and [historical evidence](SESSION_STATUS.md). A profile-only preview must not be called an off-ramp. No audited, deployed, real-money-safe, production-ready or full multi-chain claim without corresponding evidence and approvals.
