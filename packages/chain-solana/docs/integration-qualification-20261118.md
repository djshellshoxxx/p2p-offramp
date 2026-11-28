# Solana consolidation qualification — 2026-11-18

## Scope and source

The reviewed core source is `b1dbd00d800c0f6b8706826c59b6ae629d2c86ce` on
`integration/solana-core-20261118`, based on main
`97ce6a41805ab4d8fc6fccbcfb9dd79463deebd7`. The branch preserves the original PR
heads as merge ancestors:

| PR | Source head | Integrated behavior |
| --- | --- | --- |
| #151 | `236f815e79a852643d8dfa61d6d4895c8a93f54a` | Off-chain consent, acceptance verification, replay ledger |
| #152 | `37f074dd1d65d5f12b73182420998a152374b813` | Reader policy and single-slot payout inspection |
| #157 | `f1d9dd63a2ac9d55912899f8c6233456ebf8a499` | Reader bounds, cancellation and settlement planning |
| #158 | `0b0ca2907b372071471d7e060d0a80178d4294c9` | Wallet, message, journal, submission and recovery |
| #153 | `b7d06fed31fb7d2793da99c23f15bf6795a82b8a` | Deterministic base64 allocation-bound regression |

PR #159 is outside this Solana core change. Its EVM web integration does not wire
these Solana modules into the browser application.

## Integration corrections

Both ordinary and payout reads retain request validation, bounded jobs, cancellation
cleanup, program/deployment identity checks and snapshot branding. Both can feed
the pure settlement planner. Oversized array and base64 tests use operation spies,
not machine-speed thresholds.

Freeze-authority permits now govern admission before funding. A validated existing
escrow retains its original release, refund and executable payout paths if an issuer
rotates authority or application admission policy changes. The current mint authority
remains visible. Actual frozen-vault state still blocks payout, and mint/program/
owner/decimals/PDA/terms checks remain in force. This deliberately changes #152's
funded-escrow permit veto: an application policy change must not add a veto over an
otherwise executable exit from already funded custody. Before-funding permit
refusal, funded authority rotation, release, refund, payout and actual freeze refusal
have regression coverage. The composed client passes explicit permits through to
its reader, including the synthetic freezable mint in the local-validator driver.

Client disposal is checked after wallet approval, around the durable marker write,
and immediately before the physical RPC request. A marker that may have committed
is retained for recovery. Independent review reproduced the final microtask race;
the regression verifies zero physical sends when disposal wins that race.

Reconciliation checks the trade's genesis before and after reading signature,
height and account evidence. A wrong-network failed status or expiry observation
cannot settle an intent. Observed height floors are updated only after the second
genesis check succeeds, preventing a rejected network switch from poisoning the
legitimate network's floor. Independent before/during observation regressions cover
these cases.

Recovery uses the registry's identifier grammar: ASCII alphanumeric first character,
then ASCII alphanumeric, dot, underscore or hyphen, at most 64 characters, without
`..`. Independently supplied uppercase/dotted network, deployment and asset cases
round-trip; invalid separators, traversal-like identifiers and lengths remain refused.

## Executed acceptance

These results apply to the source above. They do not replace checks on a later
combined merge commit.

| Gate | Result |
| --- | --- |
| Chain-Solana Node test suite | 250 passed; 0 failed, cancelled, skipped or todo |
| Repository TypeScript checks | Passed all four configured projects |
| Import boundaries | Passed: 179 production files, core graph of 66 modules |
| Independent JavaScript program vectors | Fixture check passed; 7 tests passed |
| Independent Python peer-acceptance vectors | 4 tests passed |
| `cargo fmt --check` | Passed |
| Pinned SBPF v3 program build | Passed |
| `cargo clippy --locked --features localnet --all-targets -- -D warnings` | Passed |
| `cargo test --locked --features localnet` | 48 passed: 8 adversarial, 20 native, 15 SPL, 5 vectors |
| Anchor-generated IDL comparison | Passed; no difference from committed IDL |
| Real `solana-test-validator` client acceptance | Blocked before validator startup; see below |

The local program artifact SHA-256 is
`eed3a49072900a761756117514d0596b418ff33e6f9fe7d7b2f962471f6064c0`.
It matches the repository's synthetic localnet fixture build. This is evidence of
a local build, not approval of a production deployment or program pin.

Toolchain: Rust/rustfmt/Clippy 1.98.1, Agave 4.1.2 (source `182084b8`),
`cargo-build-sbf` 4.1.0, platform-tools v1.54, Anchor 1.2.2 and LiteSVM 0.15.0.
The Agave and Anchor archives matched the hashes pinned in
`.github/workflows/solana-escrow.yml`. The initial platform-tools extraction exhausted
the home filesystem; redirecting that tool cache to workspace disk resolved the
build setup failure.

## Validator environment blocker and reproduction

The exact pinned validator exits before RPC health is available. Its log reports:

```text
io_uring NOT supported: Operation not permitted (os error 1)
thread 'main' panicked at fs/src/dirs.rs:27:9:
assertion failed: io_uring_supported()
```

The container also refuses the validator's admin socket. Runtime restrictions were
not changed. No local-validator economic flow completed, and no public network
deployment or transaction was attempted. LiteSVM results above are separate evidence
and do not stand in for this blocked acceptance driver.

On a host that supports the pinned validator, install the workflow's verified tools,
use Node 24 with `npm ci --ignore-scripts`, and run:

```sh
cd contracts/solana
cargo fmt --check
cargo build-sbf --manifest-path programs/basic-escrow/Cargo.toml --features localnet --arch v3 -- --locked
cargo clippy --locked --features localnet --all-targets -- -D warnings
cargo test --locked --features localnet
anchor idl build -p basic_escrow -o /tmp/p2p-offramp-basic-escrow-idl.json -- --features localnet --locked
diff -u idl/basic_escrow.json /tmp/p2p-offramp-basic-escrow-idl.json
cd ../..
node --import ./scripts/test-support/register-tsx.mjs contracts/solana/localnet/client-run.mjs
```

The driver needs `solana-test-validator`, `solana-keygen` and `solana` on PATH,
and `contracts/solana/target/deploy/basic_escrow.so`. Its work directory must be
inside the checkout or the OS temporary directory. It binds loopback, creates
ephemeral synthetic keys and uses a documented synthetic-genesis shim. Allow at
least 60 minutes for the job: the refund case waits the real 1800-second minimum.
Do not set `SOLANA_CLIENT_SKIP_REFUND`; that debug mode deliberately fails qualification.

Workflow path coverage needs the localnet driver and program, `packages/chain-solana`,
its domain and schema dependencies, the TypeScript test loader and npm lockfile.

## Remaining integration boundaries

The package remains outside the application bundle. Wallet Standard discovery and
real-wallet off-chain signing, the Solana exchange carrier and acceptance/replay
wiring, browser recovery and browser transaction actions still need application
integration and browser evidence. The verifier's `candidateOnly` result grants no
economic-preparation authority. Physical wallet interoperability remains unverified.

The injected journal port and its lifecycle tests are present. A real encrypted
vault journal adapter is a separately scoped follow-up; the Lane A `IntentV2`
conversion remains lossy for pre-marker signatures/outcomes and cannot represent
every Solana payout state. It must not be used as a lossless recovery store.

The composed payout path uses validated escrow custody; the richer destination
inspection API is available separately. Destination failures can still produce an
on-chain failed payout while preserving the prior finalized release/refund state.
RPC identity checks do not provide a light client or protect against a consistently
dishonest endpoint. Hosted checks must execute on the final integrated source.
