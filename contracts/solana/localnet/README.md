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
- Frozen vault (review C-L2, C-L3), through the TypeScript reader (`reader-check.mjs`, packages/chain-solana):
  the vault and the buyer ATA of the freezable test mint are frozen. The reader reports `funded`, `vaultFrozen`,
  `payoutBlockedBy: vault-frozen`, and `validateLive` matches the region hash. `release` alone lands. The payout
  fails with SPL Token `AccountFrozen` (17) while the vault is frozen and with 6016 `DestinationFrozen` while the
  ATA is frozen. After both thaws it pays the buyer, and the reader reports `complete`.
- All claimed state is read at `finalized` commitment.

## What it does NOT prove

- Not a cluster deployment: program id, genesis constant and mints are synthetic (ASCII-derived, no
  keypairs); mints are preloaded accounts; the program is loaded from genesis, not via a deploy tx.
- The committed build is SBPF v3 and runs with every feature active. For a v0-v2 ELF (via
  `SOLANA_LOCALNET_SO`), Agave 4.1.2 refuses `--final` while SIMD-0500 (`disable_sbpf_v0_v1_v2_deployment`)
  is active; the run proves that refusal, then runs the flows with only that feature deactivated (listed in
  `deviations`).
- No other adversarial coverage (wrong signer, wrong recipient, Token-2022): see the LiteSVM tests.
- The synthetic profile compiles a fake genesis constant into the program. So the reader's RPC adapter maps the one
  validator genesis recorded at startup to that constant, and only that; the reader registry is built locally,
  not signed.
- Single local validator: no forks, no real stake-weighted clock, no fee market.

## Client flow (`client-run.mjs`)

    node --import ./scripts/test-support/register-tsx.mjs contracts/solana/localnet/client-run.mjs   # ~36 min

Drives the `packages/chain-solana` client against the same pinned validator (ports offset 400 by default): fund,
release alone, payout; a manually bundled `[release, payout_spl]` to a frozen ATA that rolls the release back,
next to the client's sequenced flow that keeps it; a crash after the durable send marker (no resend, dropped after
finalized expiry, explicit rebuild); a vault restore with the marker; and a real refund after the deadline. Every
escrow transaction is built by the client's serializer and signed through its Wallet Standard port by a runtime
keypair; one signed transaction is cross-checked with `solana decode-transaction`. Localnet-only shim: its RPC
adapter answers `getGenesisHash` with the program's compiled synthetic genesis constant, which no real validator
can have. Writes `client-summary.json` in the work dir; `SOLANA_CLIENT_SKIP_REFUND=1` skips the wait (and fails).

The native SOL and refund flows now use the production encrypted vault service
and `SolanaVaultJournal` over an atomic in-memory store. Each funds through v1,
explicitly migrates that nonempty journal, and preserves every intent field and
the original record locator. Migration must commit once, allocate fresh
generations, survive independent decryption, and make no wallet or RPC calls.
Native release fills the 32-entry journal with its finalized fund and 31
explicitly cancelled release reviews. Its next explicit release preparation
must retire exactly one eligible cancellation while preserving all other
records and identities; release and separate payout then finalize through v2.
Refund and its separate payout retain their captured v2 identities. Refund
still waits for the existing 1,815-second deadline in real time.

A complete successful run is expected to report 98 checks: the original 62 plus
36 migration, retirement and identity checks. SPL and crash flows retain the
existing v1 Map/CAS fixture; their restored marker snapshot is not an encrypted
fresh-key backup restore. Package tests separately cover that restore boundary.
This harness does not exercise browser Worker messages, IndexedDB or migration
controls. Offline helper tests use a simulated cluster and cannot substitute
for real-validator execution.
