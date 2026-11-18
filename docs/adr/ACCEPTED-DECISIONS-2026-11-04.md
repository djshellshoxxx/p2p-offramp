# Owner decisions accepted on 2026-11-04

Status: ACCEPTED by the repository owner on 2026-11-04 in Claude Code session
`session_01KtKj8hYiFjAoM2cbX6NoM3`, answering a structured question that quoted each recommendation. The
packets themselves are in [PR #29](https://github.com/djshellshoxxx/p2p-offramp/pull/29) under
`docs/adr/proposed/`. This file records only what was decided; the packets keep the analysis.

| ID | Decision | Accepted option |
| --- | --- | --- |
| D1 | Peer acceptance carrier | **Option B**: version 2 offer/accept messages carry each party's EIP-712 `TradeTerms` signature plus a wallet-signed `PeerAcceptance` binding role, account, both Nostr keys and expiry, keyed by `(termsHash, role)`. Cancel or reject tombstones the `termsHash`. No downgrade to bare signatures. The seller can still fund without any acceptance. |
| D5 | Solana/SPL custody design | **Option A** with the packet's recommended sub-rules: immutable Anchor program, native SOL and original SPL Token only, Token-2022 and wrapped SOL refused, state-only release/refund with a separate permissionless payout, "funded" shown only at `finalized`. |
| D8 | Merge policy for `main` | **Tiered**: Tier A (CI, tests, docs) and Tier B (non-custody product code) merge after green CI and an independent review with no open High/Medium finding. Tier C (contracts, signing/EIP-712, terms binding, vault crypto, recovery, registry trust, release verification) waits for owner approval. |
| D9 | Durable send marker | **Option A**: `sendMarkedAt` written in `markSending`'s compare-and-swap and never cleared; older records without it are treated as possibly sent. |

| D4 | Capability-to-terms commitments | **Option C now, Option B as the named target** (recorded in the D4 packet, 2026-11-04): core trades commit only the count-zero capabilities hash and refuse any other value before signing and funding. |
| D6 | QR payload profiles | **Option B** (recorded in the D6 packet, 2026-11-04): RFC 8785 canonical JSON envelope, RFC 9285 base45 behind a version prefix; only trade invites are signed, over a domain-separated digest; no secrets in a QR; unsigned types shown as unauthenticated. The invite signing-key profile is still open. |
| D7 | Optional reference packages | **Option 2** on 2026-11-04 (merge personalization, governance and claims; park the nine optional packages). **Superseded on 2026-11-18** by the owner's acceptance recorded in `docs/consolidation/2026-11-18-branch-consolidation-gameplan.md` §5: the optional packages are accepted, extracted one package per PR with an import-boundary check, and none is wired into the default build without its own gate. |

Canonical index (reconciled 2026-11-18): D1, D4, D5, D6, D7, D8 and D9 are accepted as above; the individual packets
under `docs/adr/proposed/` keep the analysis and are authoritative where this table is shorter. **D2** (testnet trust
root and Sepolia record) and **D3** (maintained recovery manifest) remain **proposed**. D2 needs owner-run key
generation, so no agent can complete it. Older summaries that list D4, D6 or D7 as proposed are stale.

## D5 open questions, as resolved by accepting the recommendation

1. **On-chain acceptance signatures.** Not verified on chain, matching EVM: the seller's signed funding
   transaction is the seller's acceptance and the buyer funds nothing. This supersedes the program-side
   Ed25519 Instructions-sysvar requirement in `spec-signed-trade-terms.md` line 49 for the basic escrow.
   Off-chain signatures over the same G16 bytes remain the D1 peer-acceptance carrier's concern.
2. **Freeze-authority mints.** Not decided globally. Each compiled-in allowlist entry is an owner choice;
   a frozen vault stalls both exits, as an EVM blacklist would. The synthetic `localnet` profile includes
   one freezable test mint only to test the frozen-destination retry path.
3. **Rent.** Locked for every trade in v1; any closure design is a later decision.
4. **Client deadline margin.** Still open; it belongs to the client adapter, which does not exist yet.
5. **Toolchain pins.** Anchor 1.2.2 (`8d9d1488`), Agave 4.1.2 (`182084b8`) and Rust 1.98.1, as proposed.

## Implementation deviations recorded for review

- The packet's single `payout` instruction is implemented as `payout_native` and `payout_spl`, so each
  has a fixed account list and an explicit asset-kind constraint. Economics are unchanged.
- Only the synthetic `localnet` network profile exists. Devnet/mainnet genesis constants, program IDs
  and mint lists are not invented; building without a profile fails at compile time.
