# Cargo dependency remediation — generation 7

Recorded November 19, 2026, America/Vancouver task date / November 20 UTC.

## Outcome and exact source

The pinned Solana workspace now resolves **`ctutils 0.4.4`**, the patched range
for `RUSTSEC-2026-0385`. Native Cargo changed only that package's version and
registry checksum. The same pinned RustSec database subsequently reports one
remaining vulnerability match, `crypto-bigint 0.5.5 / RUSTSEC-2026-0387`, and the
same five separate maintenance warnings. The audit still exits **1**; it is not
reported as clean.

The patched upstream crate passed **150/150 native library unit tests** with
the repository's pinned host Rust version. This is a compatible dependency
repair prepared for integration. It does not substitute for the corrected
core's exact-source Solana build, LiteSVM, validator and browser gates.

| Reference | Identity |
| --- | --- |
| Starting source / PR205 | `cd7d54ba075118a7ec043788c17718be842ee405` |
| Starting source tree | `ce3c69ddc36245f756005c540e521a26a3ce59b8` |
| Dependency repair commit | `d2ba3b89c5e8a4fb06b3c01b2e981f9fafce672b` |
| Dependency repair tree | `b6359a0273ae6ee5be194cb001878e981c85bf8d` |
| Original Cargo lock SHA-256 | `af3401d2bd8e793693ea1e2626df46972b7933207d14c0cb450d13ab8f14c597` |
| Repaired Cargo lock SHA-256 | `9700b283dad1a3fb008a53398f2e41e30f947aa9e76ddfb044ff9e922043ed90` |
| RustSec database | `074ea9a7ed619f511b5b7374c7a97e98d1e98be4` |
| Worker branch | `codex/generation7-cargo-remediation-20261119` |

The worker read the durable handoff/state and the preceding dependency report
at `42cf34ba9d98ae1fd651a2d7fb9ea8c847c2a5c7`. Its isolated worktree is
`p2p-offramp-generation7-cargo-remediation`. No applicable repository
`AGENTS.md` was found. The coordinator owns publication and integration; the
external successor's worktrees and branches were not changed. An attempted
nested read-only worker could not start because the agent-thread limit was
reached, so no additional launched worker is claimed.

## The compatible correction

The original `digest 0.11.3` manifest permits `ctutils = "0.4"`. The registry's
`0.4.4` record is not yanked and declares Rust `1.87`, below the project's
declared `1.89.0` minimum and pinned host `1.98.1`. The downloaded crate's
SHA-256 matches the official registry checksum
`12218662ccac37d9714f2191252553d67585b97df8c839cbe49e0bde278dc865`.

Native Cargo, rather than a hand-written lock edit, executed:

```sh
cargo update --manifest-path contracts/solana/Cargo.toml \
  --package ctutils --precise 0.4.4
```

The command succeeded in **8.194 seconds**. A parsed before/after comparison
verified all **412** package records: one record changed, and only its
`version` and `checksum` fields differ. The source URL and dependency array
are identical. `cmov 0.5.4` is unchanged. All manifests, program/client code,
toolchain pins and six workflows remain byte-identical to the starting source.
No ignore, override, fork, feature removal or policy exception was introduced.

The primary advisory describes compiler/target-dependent branching in mask
generation and certain comparisons, with `>=0.4.4` as its patched range.
This update removes the matched dependency version. It is not a reproduced
application exploit, a newly counted product bug, or an independent proof of
constant-time machine code on every target.

Primary records: [RustSec advisory](https://rustsec.org/advisories/RUSTSEC-2026-0385.html),
[exact pinned advisory](https://github.com/RustSec/advisory-db/blob/074ea9a7ed619f511b5b7374c7a97e98d1e98be4/crates/ctutils/RUSTSEC-2026-0385.md),
[ctutils 0.4.4 registry metadata](https://crates.io/api/v1/crates/ctutils/0.4.4),
[checksum-verified source archive](https://static.crates.io/crates/ctutils/ctutils-0.4.4.crate).

## Resolved dependency and feature evidence

All graph commands used the repaired lock, `--locked`, the maintained
`localnet` feature and Cargo `1.98.1` on `x86_64-unknown-linux-gnu`. The first
graph populated an isolated Cargo cache; subsequent graph commands were
offline. No compilation or feature change was needed to resolve these graphs.

| Inspected graph | Actual observation |
| --- | --- |
| Normal and build dependencies | 585 output lines; neither `ctutils` nor `crypto-bigint` appears |
| Test/development graph, inverted from `ctutils` | BLAKE3's `traits-preview` dependency activates `digest/mac`, which activates `ctutils`; the paths return through Solana transaction/message and LiteSVM development dependencies |
| Normal/build graph, inverted from `digest 0.11.3` | Anchor procedural macros use `anchor-syn` → `sha2 0.11.0` → `digest`; `alloc`, `block-api`, `default` and `oid` are shown, while `mac` is not |
| Test/development graph, inverted from `crypto-bigint` | LiteSVM → Solana syscalls → `solana-secp256k1-recover 3.3.0` → `k256 0.13.4` / `elliptic-curve 0.13.8` → `crypto-bigint 0.5.5` |

This corrects the weaker initial lock-only observation: a static lock path
through Anchor's macro parser does **not** establish that its optional
`ctutils` dependency is active. The native graph separates those features.

The [Cargo documentation](https://doc.rust-lang.org/cargo/commands/cargo-tree.html)
describes these graphs as approximations of build/test dependency resolution,
not a guarantee of the final compiled artifact. The default target here is
the host. This review did not build or inspect a new SBPF binary, and it does
not transfer the host graph into an unexecuted cross-target build claim.

Source inspection also narrows the demonstrated use. The maintained
`solana-message 4.3.0` transaction-hash implementations use an unkeyed BLAKE3
hasher and the `Digest` interface. The feature's presence compiles MAC support;
it does not by itself establish an application call to `CtOutput` comparisons
on secret material. No such application exposure is claimed here.

## Remaining crypto-bigint match and compatibility boundary

`RUSTSEC-2026-0387` remains an active exact-version match in the pinned database.
Its patched range starts at `0.7.6`. The registry query found **`0.5.5` as the
highest published non-yanked `0.5` release**. It also reported the literal
`0.7.6` release as yanked; the current newest release was `0.7.11`. The
advisory's range is not an instruction to force a yanked or incompatible
version into the current graph.

The checksum-verified `elliptic-curve 0.13.8` manifest requires
`crypto-bigint = "0.5"`. Its parent `k256 0.13.4` belongs to the `0.13` API
series, which is selected by `solana-secp256k1-recover 3.3.0`. A `0.7` bigint
substitution would not satisfy that constraint. No safe same-series patched
release was available in the inspected registry snapshot. Resolving this
match requires a compatible upstream Solana/RustCrypto transition or a
separately reviewed backport, with native qualification; neither was invented
or forced in this patch.

The enabled test graph includes k256 signing-related features. That fact is
preserved: the report does not claim the signing API is absent from the
dependency's compilation. The inspected application and runtime call paths
are narrower:

- The `basic-escrow` manifest declares LiteSVM under `dev-dependencies`.
- The upstream recovery crate makes k256 a dependency only for non-Solana,
  non-BPF targets. Its host `secp256k1_recover` implementation recovers a
  **public** verifying key from a message hash, signature and recovery ID.
- The actual `solana-syscalls 4.1.2` recovery implementation imports the
  recovery crate's constants/error types but calls **`libsecp256k1::recover`**
  at `src/lib.rs:961`; it does not call the k256-based wrapper. Direct source
  searches of the inspected LiteSVM/syscalls modules found no k256 signing
  call.
- The maintained project tests use Solana keypairs/signers. This review did
  not establish a secret-signing call through the affected bigint operations.

These are source and feature-resolution findings, not whole-program dynamic
reachability or linker evidence. No side-channel experiment, secret recovery,
application exploitability verdict, unsupported CVSS severity or owner risk
waiver is claimed. The remaining advisory stays visible for follow-up.

Primary records: [RustSec advisory](https://rustsec.org/advisories/RUSTSEC-2026-0387.html),
[exact pinned advisory](https://github.com/RustSec/advisory-db/blob/074ea9a7ed619f511b5b7374c7a97e98d1e98be4/crates/crypto-bigint/RUSTSEC-2026-0387.md),
[current registry response](https://crates.io/api/v1/crates/crypto-bigint),
[elliptic-curve 0.13.8 source](https://static.crates.io/crates/elliptic-curve/elliptic-curve-0.13.8.crate),
[recovery source](https://static.crates.io/crates/solana-secp256k1-recover/solana-secp256k1-recover-3.3.0.crate),
[syscalls source](https://static.crates.io/crates/solana-syscalls/solana-syscalls-4.1.2.crate).

## Actual validation and its limits

| Check | Actual result |
| --- | --- |
| Official pinned toolchain installation | Cargo/rustc `1.98.1`; all three downloaded component hashes match the official channel manifest, and the manifest matches its official SHA-256 file |
| Native targeted Cargo update | Exit 0; `8.194s`; exactly one package's version/checksum changed |
| Original lock identity | Matches the preceding completed two-finding audit; that prior audit was not rerun or rewritten |
| Native audit of repaired lock | Exit **1**, valid JSON, **one** remaining vulnerability match, five unmaintained warnings; `0.683s` |
| Native graph commands | Four successful executions; initial ctutils tree `8.620s`, offline normal/build `0.677s`, bigint `0.421s`, host digest `0.358s` |
| Upstream patched library unit tests | **150 passed, 0 failed, 0 ignored, 0 filtered out**; command exit 0 in `35.231s`; upstream lock unchanged |
| Parsed lock preservation and whitespace checks | Passed |
| Repository SBPF build / Clippy / LiteSVM / IDL / real validator / browser | **Not run by this worker on this source**; exact-source hosted gates remain required |
| BINSEC/checkct or 32-bit machine-code verification | **Not run**; upstream unit tests are not a side-channel proof |

The native library test command was:

```sh
cargo test --manifest-path <verified-ctutils-0.4.4-source>/Cargo.toml \
  --locked --lib --jobs 1
```

It used the crate archive's own 42-package development lock, whose SHA-256
remained `68a0e988a37f399b87c82d3ae0a690c11044e658c2e11b8f3645add60b59da10`.
The production dependency `cmov 0.5.4` matches the application's lock. No
upstream property-test or doc-test pass is claimed by this `--lib` execution.

The original toolchain was absent. The new toolchain, Cargo cache and test
target are confined to this worker's scratch verification directory; global
environment files were not changed. Setup and commands were sequential and
bounded. Only owned extraction staging was removed after successful installs.
Full application compilation was deliberately left to the applicable native
qualification path because it requires the pinned Agave platform toolchain
and prebuilt program fixture, and shared disk/resources were constrained.

## Durable receipts and continuation

`cargo-dependency-remediation-generation7.json` records commands, exit codes,
log hashes, source identities, the exact lock delta and the remaining match.
The raw logs live under
`verification/generation7-cargo-remediation` in the coordinator workspace.
Seven inspected Cargo-cache archives were rehashed against the application
lock and their inspected source files compared byte-for-byte to the archives.

| Evidence | SHA-256 |
| --- | --- |
| Cargo update log | `dd5d4b5af5538dd3d3a016fbf1ea3f7a9c41ce58b034a9214155d86607b10e7c` |
| Patched-lock audit JSON | `2c194eff3f175e423423944db89ca26f4ba2b434138417bd25706fd505513ed1` |
| ctutils feature tree | `2804b49f490fb160d577efe97b84b670101623ffa72811f7d4eefbedb2c259fa` |
| Normal/build graph | `839d81e69b91651cae6942b101faa34e801e00b1f7e3220687d063e65563edc9` |
| Bigint feature tree | `7fbbf752e4d415c0dcfbb6bc38b2271af60f14a0c87eefa74e8c843127124057` |
| Host digest feature tree | `a22c914bf417921facf17d9a9f54f3379ae095a79e763f089036fe091db5257e` |
| Upstream unit-test log | `10cc3c330e0ad1e9dc815bbc39e4c1f2fbe4603635f0199ed523e45f86f34b8c` |

The coordinator can independently review and cherry-pick the one-file source
commit onto its corrected core, preserving this source-bound report. Qualify
that final composition with the unchanged Solana workflow. Keep the remaining
crypto-bigint advisory and five maintenance warnings visible; pursue the
upstream-compatible transition separately. Do not treat this patch, the graph
separation, or a later green workflow as an owner risk waiver.

No remote ref, PR, global handoff/state, workflow, credential, release setting,
deployment or real-funds operation was changed by this worker.
