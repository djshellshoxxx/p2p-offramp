# Solana localnet end-to-end check

Drives `basic_escrow.so` on a real `solana-test-validator` (Agave 4.1.2) with a dependency-free Node driver
(`driver.mjs`: legacy transactions, compact-u16, Borsh `FundArgs`, ed25519 via `@noble/curves`).

    node contracts/solana/localnet/run.mjs     # ~33 min; exit 0 only if every check passes

Prints a JSON summary (stdout), progress (stderr). Env: `SOLANA_LOCALNET_DIR` (work dir with ledger, keys,
`summary.json`), `SOLANA_LOCALNET_SO` (alternate `.so`, no fixture written), `SOLANA_LOCALNET_PORT_OFFSET`.
Overrides must resolve inside this checkout or the OS temp directory. Tools are spawned by absolute path
from absolute, non-world-writable `PATH` entries (`tool-path.mjs`). Ports 18899 (RPC), 19900 (faucet), 18001
(gossip), 18002-18030, bound to 127.0.0.1. The validator is killed on exit. On success it writes
`fixtures/accounts-localnet.json` (finalized account bytes, no private keys).

## What a passing run proves (on this local validator)

- Genesis-loaded upgradeable program; IDL discriminators, account order and signer/writable flags match.
- `solana program set-upgrade-authority --final` clears the authority (`program show`: `none`, finalized).
  ProgramData = 45-byte header + ELF; ELF bytes sha256 == `.so` sha256. A later upgrade is refused by the
  CLI and, as a raw loader-v3 `Upgrade`, fails on chain with `Immutable`; ProgramData bytes are unchanged.
- Native fund -> release+payout in one tx: fresh buyer balance == amount. SPL (open test mint) fund ->
  release+payout: buyer ATA == amount, vault 0. On-chain `terms_hash` == independent off-chain rebuild.
- Refund: funded with deadline = clock + 1805 s; an early refund lands and fails with 6013
  `DeadlineNotReached`; after waiting real time (no clock warp) until the validator Clock reaches the
  deadline, refund+payout_native paid by a third party credits the seller exactly the amount.
- All claimed state is read at `finalized` commitment.

## What it does NOT prove

- Not a cluster deployment: program id, genesis constant and mints are synthetic (ASCII-derived, no
  keypairs); mints are preloaded accounts; the program is loaded from genesis, not via a deploy tx.
- The committed build is SBPF v3 and runs with every feature active. For a v0-v2 ELF (via
  `SOLANA_LOCALNET_SO`), Agave 4.1.2 refuses `--final` while SIMD-0500 (`disable_sbpf_v0_v1_v2_deployment`)
  is active; the run proves that refusal, then runs the flows with only that feature deactivated (listed in
  `deviations`).
- No adversarial coverage (wrong signer, wrong recipient, frozen mint, Token-2022): see the LiteSVM tests.
- Single local validator: no forks, no real stake-weighted clock, no fee market.
