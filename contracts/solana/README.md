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
  A native buyer must be writable (reserved sysvar and builtin keys are not) and not executable.
- `release` needs the stored seller's signature and `now < deadline`. `refund` is permissionless at
  `now >= deadline`. Both only change state and are mutually exclusive.
- `payout_native` / `payout_spl` are permissionless. They pay exactly the recorded principal once to the
  party fixed by the terminal state: the buyer after release, the seller after refund. An SPL payout goes
  only to that party's canonical associated token account, whose current owner must also be that party.
  A client may submit `release` and `payout_*` in one transaction, but a failed payout (frozen account,
  empty wallet below rent) rolls back the entire transaction, including `release`: the escrow remains
  `Funded`. The seller can instead commit `release` alone, strictly before the deadline. Once that
  separate release is finalized, payout failures leave the escrow `Released`, and anyone can retry
  `payout_*` later. A failed combined transaction does not extend the deadline or prevent a refund while
  the escrow remains `Funded` at or after the deadline.
  After an uncertain transaction outcome, reconcile the transaction and re-observe finalized escrow
  state before any retry; submission alone does not establish a release, and uncertainty must not
  trigger an automatic second broadcast.
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
| Platform tools | v1.54 (Agave 4.1.2 default), SBPF v3 (`--arch v3`) | installed by `cargo build-sbf` |
| Anchor (`anchor-lang`, `anchor-spl`, CLI) | 1.2.2, commit `8d9d1488` | tag; CLI binary SHA-256 `e2c35a97…e741` |
| Rust host toolchain | 1.98.1 (`rust-toolchain.toml`) | rustup channel |
| LiteSVM | 0.15.0 (`Cargo.lock`, Anchor 1.2.2 template graph) | crates.io |

`anchor build` defaults to platform-tools v1.57, which Agave 4.1.2 does not ship, so the program is built with
`cargo build-sbf --arch v3` directly. SBPF v3 is required: with SIMD-0500 (`disable_sbpf_v0_v1_v2_deployment`,
`B8JJXCy5…o83g`) active, Agave 4.1.2 refuses to deploy or finalize v0–v2 programs (reproduced on a local
validator). LiteSVM's mainnet list (2026-07-10) shows v3 deployment and execution active, SIMD-0500 not yet. GitHub's release API is not reachable from the development
container; the tarball/binary digests above were computed locally, not compared with publisher digests.

## Commands

```bash
cargo build-sbf --manifest-path programs/basic-escrow/Cargo.toml --features localnet --arch v3
cargo test --features localnet
anchor idl build -p basic_escrow -o idl/basic_escrow.json -- --features localnet
node vectors/derive.mjs --check && node --test vectors/derive.test.mjs
```

Tests run on LiteSVM with a controlled Clock against the hash-pinned original SPL Token 3.5.0 build and
again with the mainnet feature set (p-token at the SPL Token ID, per LiteSVM's 2026-07-10 feature list).
`vectors/` is an independent JavaScript implementation of PDAs, associated token addresses and Anchor
discriminators; `tests/vectors.rs` cross-checks it and the G16 Solana terms vectors.

## Deployment prerequisites (from the 2026-11-04 adversarial review)

- Confirm the target cluster has the System program's `CreateAccountAllowPrefund` feature active. Anchor
  1.2.2 `init` uses it when lamports were donated to a predictable escrow or vault PDA first; without it,
  such a donation blocks that seller nonce (denial of service, no loss).
- A native payout keeps the escrow at the current rent-exempt minimum. If rent rises after funding, the
  payout fails until anyone tops the escrow up; principal is never at risk.
- The `.so` is not path-reproducible (identical source built in two directories hashed differently).
  Pin a ProgramData hash only from a verifiable build of the exact tagged source.

## Not covered

[`packages/chain-solana`](../../packages/chain-solana/README.md) is a finalized-only, read-only adapter with
unsigned instruction builders; the app build excludes it. No wallet, transaction journal (G12) or recovery
package uses this program yet. No public deployment, no confirmed verified-build hash method (the adapter's
`loader-v3-programdata-region/v1` is a proposal), no mainnet mint list, and no professional audit. Token-2022,
freeze-authority policy per mint, rent reclamation and the client deadline margin remain owner decisions.
