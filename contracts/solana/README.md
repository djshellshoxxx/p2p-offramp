# Solana basic escrow (D5 Option A)

An immutable Anchor program that holds a seller's native SOL or an allowlisted original-SPL-Token
balance under the same economic rules as [`contracts/evm/src/BasicEscrow.sol`](../evm/src/BasicEscrow.sol).
The owner approved [decision D5](../../docs/adr/ACCEPTED-DECISIONS-2026-11-04.md) Option A with its
recommended sub-rules on 2026-11-04. Nothing here is deployed to a public cluster.

## Rules

- The seller funds with `fund_native` or `fund_spl`. Buyer, seller, asset, exact base-unit amount and
  deadline are fixed at funding. The program rebuilds the G16 Solana terms bytes from the instruction
  fields, its own program ID and its compiled genesis constant, and stores their SHA-256 as the trade id.
- Funding requires `now < acceptBefore` and `1800 <= deadline - now <= 604800`, read from the Clock sysvar
  with a checked conversion. The buyer must differ from the seller, the zero key, the escrow and the vault.
  A native buyer must not be executable.
- `release` needs the stored seller's signature and `now < deadline`. `refund` is permissionless at
  `now >= deadline`. Both only change state and are mutually exclusive.
- `payout_native` / `payout_spl` are permissionless. They pay exactly the recorded principal once to the
  party fixed by the terminal state: the buyer after release, the seller after refund. An SPL payout goes
  only to that party's canonical associated token account, whose current owner must also be that party.
  Clients send `release` and `payout_*` in one transaction; if the payout leg fails (frozen account, empty
  wallet below rent) the decision stands and anyone retries the payout later.
- Escrow PDA `[b"p2p-offramp-escrow-v1", seller, sellerNonce]`; vault PDA `[b"p2p-offramp-vault-v1",
  escrow]`. Accounts are never closed in v1, so a nonce or trade id funds at most once. Rent and donated
  surplus stay locked; there is no sweep, owner, operator, pause or upgrade path.
- Only the original SPL Token program and compiled-in mints (at most 32) with matching decimals are
  accepted. Token-2022 and both wrapped-SOL mints are refused. Source accounts must be undelegated and
  unfrozen. Acceptance signatures are not verified on chain (as on EVM); the seller's funding transaction
  is the seller's acceptance.

## Network profiles

Exactly one profile feature must be selected. Only `localnet` exists. Its genesis constant, program ID and
two test mints are synthetic ASCII-derived 32-byte values, never a real cluster's. Devnet or mainnet needs
verified genesis/program/mint evidence and a deployment decision; building without a profile fails.

## Toolchain (pinned)

| Tool | Version | Source check |
| --- | --- | --- |
| Agave (`solana`, `cargo build-sbf`, `solana-test-validator`) | v4.1.2, commit `182084b8` | tag; release tarball SHA-256 `5991d027…f770` recorded at download |
| Platform tools | v1.54 (Agave 4.1.2 default), SBPF v0 | installed by `cargo build-sbf` |
| Anchor (`anchor-lang`, `anchor-spl`, CLI) | 1.2.2, commit `8d9d1488` | tag; CLI binary SHA-256 `e2c35a97…e741` |
| Rust host toolchain | 1.98.1 (`rust-toolchain.toml`) | rustup channel |
| LiteSVM | 0.15.0 (`Cargo.lock`, Anchor 1.2.2 template graph) | crates.io |

`anchor build` defaults to platform-tools v1.57 / SBPF v3, which Agave 4.1.2 does not ship, so the program
is built with `cargo build-sbf` directly. GitHub's release API is not reachable from the development
container; the tarball/binary digests above were computed locally, not compared with publisher digests.

## Commands

```bash
cargo build-sbf --manifest-path programs/basic-escrow/Cargo.toml --features localnet
cargo test --features localnet
anchor idl build -p basic_escrow -o idl/basic_escrow.json -- --features localnet
node vectors/derive.mjs --check && node --test vectors/derive.test.mjs
```

Tests run on LiteSVM with a controlled Clock against the hash-pinned original SPL Token 3.5.0 build and
again with the mainnet feature set (p-token at the SPL Token ID, per LiteSVM's 2026-07-10 feature list).
`vectors/` is an independent JavaScript implementation of PDAs, associated token addresses and Anchor
discriminators; `tests/vectors.rs` cross-checks it and the G16 Solana terms vectors.

## Not covered

No client adapter, wallet, journal or recovery package uses this program yet. No public deployment, no
verified-build hash method, no mainnet mint list, and no professional audit. Token-2022, freeze-authority
policy per mint, rent reclamation and the client deadline margin remain owner decisions.
