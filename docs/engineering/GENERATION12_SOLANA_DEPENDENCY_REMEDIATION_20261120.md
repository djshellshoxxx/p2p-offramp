# Compatible Solana recovery dependency remediation — generation 12

Recorded during the November 19, 2026 Pacific continuation / November 20 UTC.

## Outcome and source

The maintained Solana workspace now resolves `crypto-bigint 0.7.11` through
the compatible upstream `solana-secp256k1-recover 3.3.1` update. A fresh
before/after audit against the same RustSec database changes from one
vulnerability match to zero. All five maintenance warnings remain visible.
This is dependency-version remediation, not a side-channel certification or
production release approval.

| Identity | Value |
| --- | --- |
| Reviewed core parent | `d30152336bb687b31ae547ab3fcecb8835a02ef4` |
| Parent tree | `fa0d662c991cb03729ca0a4ea53ef60960b81842` |
| Dependency source commit | `1e940862ba6e01309b81d5ce9d3d9f4ae4e32ce7` |
| Dependency source tree | `5ab1f4ddc56742645c60ac43ac2184e194867e0a` |
| Published equivalent source / PR216 | `9dd01b199a3448a7654c4719d226ec01eb93eecc` |
| Original lock SHA-256 | `9700b283dad1a3fb008a53398f2e41e30f947aa9e76ddfb044ff9e922043ed90` |
| Updated lock SHA-256 | `b9596088f7a28dccf465f5165eade7a9c02ea73a5734e38005be5e3b1b830039` |
| RustSec database | `074ea9a7ed619f511b5b7374c7a97e98d1e98be4` |

Only `contracts/solana/Cargo.lock` changes in the source commit. Program source,
project manifests, feature selections, toolchain pins, workflows and financial
qualification assertions remain unchanged. Later documentation does not change
the tested dependency source.

The coordinator published [draft PR216](https://github.com/djshellshoxxx/p2p-offramp/pull/216)
on `codex/dependency-g12-20261120`, based on the unchanged d301 core. The
published commit has the same complete `5ab1f4dd` tree as the local source
commit. Hosted qualification is separate from the local executions below.

## Compatible resolution

The earlier report correctly identified that `crypto-bigint 0.5.5` has no
patched same-series release. This continuation found a compatible transition
one level higher: `solana-syscalls 4.1.2` declares a caret `3.1.1` recovery
dependency, and recovery `3.3.1` uses `k256 ^0.14.0`. Version `3.3.1` was
published on October 26; it is newly identified here, not newly published.

The first targeted update refused the existing `ctutils 0.4.4` lock because
the new bigint requires at least `0.4.5`. That failed command left the original
lock unchanged. Native Cargo then performed these two explicit updates:

```sh
cargo update --manifest-path contracts/solana/Cargo.toml \
  --package ctutils --precise 0.4.8
cargo update --manifest-path contracts/solana/Cargo.toml \
  --package solana-secp256k1-recover --precise 3.3.1
```

Both updates stay within the existing parent constraints. No direct bigint
substitution, patch fork, feature removal, advisory exception or policy waiver
is introduced. The resolved path is recovery `3.3.1`, `k256 0.14.0`,
`elliptic-curve 0.14.3` and `crypto-bigint 0.7.11`. The supporting ctutils update
stays within the existing `^0.4` range and retains its prior advisory fix.

The complete lock grows from 412 to 427 records: ten old-version records are
replaced, 25 records are added, 380 records are identical, and 22 retained
versions have Cargo-generated dependency-list changes. The dependency closure
also updates the shared `solana-define-syscall` package from `5.2.0` to `5.4.0`;
this is why actual SBPF qualification remains necessary. Newly selected crates
with a declared Rust minimum require at most `1.87`; the two Solana crates do
not declare that field. The project minimum remains `1.89.0`.

Primary sources: [recovery 3.3.1 dependencies](https://crates.io/api/v1/crates/solana-secp256k1-recover/3.3.1/dependencies),
[recovery source archive](https://static.crates.io/crates/solana-secp256k1-recover/solana-secp256k1-recover-3.3.1.crate),
[parent source archive](https://static.crates.io/crates/solana-syscalls/solana-syscalls-4.1.2.crate),
[ctutils 0.4.8](https://crates.io/api/v1/crates/ctutils/0.4.8), and
[bigint advisory](https://rustsec.org/advisories/RUSTSEC-2026-0387.html).
Source archives and tool downloads were checked against their primary registry
or release digests before use.

## Audit evidence and remaining warnings

Cargo-audit `0.23.0` ran against both exact lockfiles with the same freshly
resolved database commit. It used `--no-fetch` to preserve that database
identity. There were no ignore flags, target filters, warning waivers or
`--no-yanked` flag.

| Scope | Exit | Vulnerability matches | Maintenance warnings |
| --- | ---: | ---: | ---: |
| Original lock | 1 | 1: `RUSTSEC-2026-0387`, bigint `0.5.5` | 5 |
| Updated lock | 0 | 0 | The same 5 |

The retained unmaintained dependencies are `ansi_term 0.12.1`,
`bincode 1.3.3`, `derivative 2.2.0`, `libsecp256k1 0.7.2`, and `paste 1.0.15`.
The warning records are unchanged. Zero matched vulnerabilities does not mean
the dependency tree has no maintenance or release-review concerns.

Original audit JSON SHA-256:
`2c194eff3f175e423423944db89ca26f4ba2b434138417bd25706fd505513ed1`.
Updated audit JSON SHA-256:
`2feeba37bfa504a2f6d511a04fcf1fe9dfd8689d580bdc30d1ed115ae37dc88a`.

## Native qualification

Local SBPF qualification did not complete. After selecting the correct pinned
target compiler, compilation reached 142 crates before the compiler process for
the unchanged `anchor-lang-idl 0.1.4` dependency was terminated by `SIGKILL`.
Retrying the same source, compiler and release profile with one build job also
received `SIGKILL` in that dependency. There was no Rust source/type diagnostic.
Resource pressure is a plausible explanation; unavailable cgroup counters mean
it is not established as the cause. The failures remain part of this record.

The project was not modified to make that build pass. No optimization, lint,
feature, assertion or toolchain setting was changed. Local Clippy/all-targets,
LiteSVM, IDL and financial validator/browser qualification remain outstanding.
A host library-only compatibility execution is recorded separately below; it
cannot replace those maintained complete-program gates.

The isolated host uses checksum-verified official Rust/Cargo `1.98.1`, the
workflow-pinned Agave `4.1.2` and Anchor `1.2.2`, and platform-tools `1.54`.
Because the host toolchain was installed directly without rustup, local SBPF
execution uses the maintained `--no-rustup-override` option with `RUSTC`
explicitly selecting platform-tools' `rustc 1.89.0-dev`. The compiler confirms
the `sbpfv3-solana-solana` target. This adapts the local installer only; repository
toolchain pins and hosted commands remain unchanged.

Two preliminary diagnostic failures are retained. Selecting a transitive
dev-only package with `cargo check -p solana-syscalls` caused a Cargo feature
selection panic. The initial direct-install SBPF invocation selected the host
compiler, which lacks the SBPF target. Neither is represented as successful
compilation or erased from the evidence. The maintained complete project
commands use the correct target compiler and replace neither assertion nor gate.

| Executed check | Result |
| --- | --- |
| Native targeted lock resolution | Both explicit updates passed; complete lock is reproducible |
| `cargo metadata --locked --features localnet` | Passed; exact 427-package lock retained |
| Host normal/build and inverse bigint feature graphs | Both passed on the locked source |
| `cargo fmt --check` | Passed |
| Before/after Cargo audit | One vulnerability to zero; all five maintenance warnings preserved |
| Correct-compiler SBPF, two jobs | Failed: compiler process received `SIGKILL`, 208.084 seconds |
| Same SBPF source/profile, one job | Failed: compiler process received `SIGKILL`, 33.037 seconds |
| Host library-only target compilation | Exit 0 in 258.453 seconds; 375 compilation entries; zero tests defined |
| Full Clippy, LiteSVM, IDL, validator and browser | Not run by this worker; exact-source hosted gates remain required |

The two SBPF failure log hashes are respectively
`7a425d8d0afcb69df9098d7e4822d65119375b51c3f6fb6b31a318864dfa5447`
and `679a8d8fbf668faa2343d08a19fa4698d089185284d1ce12aa8735aef8238233`.

The successful host command was:

```sh
cargo test --locked --offline --features localnet --lib --jobs 1
```

It compiled the complete selected host dependency closure, including the
updated RustCrypto, recovery and syscalls packages. Its literal final result
was `0 passed; 0 failed` because this library target defines no unit tests.
This is successful native compilation evidence only. The maintained integration
tests all include the missing SBPF artifact and were not replaced with a stub,
an older artifact or a narrower claim of financial acceptance. Host log SHA-256:
`5fb948ea6a15a192a97f3e965b0bd527e9cbe20e7e3f5d5a2468f143f29a441e`.

## Handoff

Raw command logs, complete audits, exact upstream archive receipts, source
comparisons, metadata and lock delta are retained in the continuation workspace
under `evidence/dependencies-g12/worker`. The durable summary is
[`generation12-solana-dependency-remediation.json`](generation12-solana-dependency-remediation.json).
Independent review and applicable
exact-source hosted SBPF, native validator and browser financial qualification
are required before merging the final composition. Both real 1,800-second refund
minima remain intact. This change selects no trust root, publishes no release,
deploys no program and performs no real-funds operation.
