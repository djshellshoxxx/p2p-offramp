# Independent review: compatible Solana bigint remediation

## Scope and conclusion

Reviewed source: `1e940862ba6e01309b81d5ce9d3d9f4ae4e32ce7`, tree
`5ab1f4ddc56742645c60ac43ac2184e194867e0a`, based on combined core
`d30152336bb687b31ae547ab3fcecb8835a02ef4`. The only changed source path is
`contracts/solana/Cargo.lock`; its SHA-256 is
`b9596088f7a28dccf465f5165eade7a9c02ea73a5734e38005be5e3b1b830039`.
The independently read GitHub commit for [PR216](https://github.com/djshellshoxxx/p2p-offramp/pull/216),
`9dd01b199a3448a7654c4719d226ec01eb93eecc`, has this same complete tree and the
same d301 parent. Publication metadata changed the commit identity, not the source.

No actionable finding remains in this scoped dependency/source review. The
compatible upstream recovery update removes the vulnerable bigint version from
the lockfile, and an independently executed audit confirms the advisory match is
gone. **Native/SBPF qualification remains a separate integration gate.** This
report does not grant a dependency exception or release approval.

## Exact dependency closure

The existing `solana-syscalls 4.1.2` manifest permits recovery `^3.1.1`.
`solana-secp256k1-recover 3.3.1` uses `k256 ^0.14.0`; the resulting closure selects
`k256 0.14.0`, `elliptic-curve 0.14.3` and `crypto-bigint 0.7.11`. It does not force
bigint 0.7 into the former RustCrypto 0.13 API. The supporting `ctutils 0.4.8`
selection satisfies the existing digest `^0.4` range and the new bigint
requirement. No project manifest, program source, feature policy, compiler pin,
workflow, test or suppression setting changed.

Independent TOML comparison found 412 original package records and 427 candidate
records: 25 added version records, 10 removed version records, 22 same-version
dependency-list changes, and 380 unchanged records. Every added version is in
the dependency closure of the updated recovery or ctutils package. Version
disambiguation and feature-driven dependency lists explain the retained-package
changes; there is no unrelated package-version update.

All 25 added package versions were independently checked against current
crates.io metadata. Each checksum matches the lockfile and none is yanked.
Declared minimum Rust versions, where supplied, are at most 1.87; this is within
the project's 1.89 minimum and pinned host Rust 1.98.1. Omitted upstream MSRV
metadata is not inferred to be a compilation result.

The first targeted recovery update correctly refused the locked ctutils 0.4.4
selection. The author retained that failure, updated ctutils within its compatible
range, and reran the recovery update through Cargo. This reviewer inspected and
hash-verified the resolver logs; the lockfile was not manually rewritten.
The reviewer separately replayed both targeted updates from the original lock
in an isolated worktree, using pinned Cargo 1.98.1 and the verified offline
registry cache. Both commands exited 0 and reproduced the complete candidate
lockfile byte-for-byte. The reviewed worktree was restored to its frozen source
after this comparison.

## Source compatibility review

Checksum-verified recovery 3.3.0 and 3.3.1 source archives have an identical public
recovery function signature and on-chain implementation branch. Their shared
block hash is `fd16d158dabb7926eee4e3edfd71615c22c8ba1fad3c07387a7053c67f484c69`.
The host adapter uses the newer uncompressed point API and explicitly retains
the previous high-S signature refusal while adopting the upstream library API.
No side-channel or exploit experiment was performed.

The lockfile also resolves shared `solana-define-syscall` 5.2.0 to 5.4.0, so it
cannot be described as changing only a host test dependency. Independent archive
comparison found identical syscall macro and curve-constant source. The
definitions file groups declarations through that unchanged macro, adds a name
list, and introduces `sol_get_leader`. All 43 existing syscall signatures remain
identical. The escrow program source references neither the new syscall nor the
new list. This source comparison does not replace a real SBPF build, import
resolution or validator execution.

The author's recorded host normal/build dependency tree contains no bigint
package. Its development feature tree retains the LiteSVM/Solana syscall path.
These are graph observations, not a blanket whole-program reachability claim.

## Independent audit and evidence checks

This reviewer executed `cargo-audit 0.23.0` against a separate copy of the exact
candidate lock with RustSec database
`074ea9a7ed619f511b5b7374c7a97e98d1e98be4`, `--no-fetch`, `--json`, and the normal
yanked-version check. No ignore, suppression or waiver flag was used.

The command exited **0**, with **zero vulnerability matches** and the same five
unmaintained-package warnings: ansi_term 0.12.1, bincode 1.3.3, derivative 2.2.0,
libsecp256k1 0.7.2, and paste 1.0.15. Its JSON SHA-256 exactly matches the author's
independent execution:
`2feeba37bfa504a2f6d511a04fcf1fe9dfd8689d580bdc30d1ed115ae37dc88a`.

The preserved original lock audit exits 1 with one vulnerability match,
`crypto-bigint 0.5.5 / RUSTSEC-2026-0387`. The pinned advisory's patched range is
`>=0.7.6`; the selected non-yanked 0.7.11 satisfies it. This is a source-bound
one-to-zero advisory comparison, not a claim that all dependencies are maintained
or that future advisory databases will report no findings.

Twelve author output files and their receipts were independently hashed, including
resolver failures/successes, before/after audits, metadata, dependency trees and
initial native attempts. Full checksum and registry evidence is indexed in
`independent-dependency-review-generation12.json`.

## Native qualification and handoff

The first `cargo check -p solana-syscalls` attempt failed in Cargo feature
selection for a transitive development dependency; it is not counted as a
successful build. The initial SBPF attempt selected the host compiler, which
does not provide `sbpfv3-solana-solana`. That failure is also retained.

The next attempt used the exact platform-tools 1.54 compiler bundled for the
existing Agave 4.1.2 profile and its verified SBPF target. It progressed through
compilation but received SIGKILL while compiling unchanged `anchor-lang-idl`,
without a source diagnostic. Resource pressure is an inference. The author
retained that failure and retried with one compile job, preserving all compiler
versions, source, profile and assertions. The serial attempt also received
SIGKILL in the same unchanged host crate. Neither attempt qualifies SBPF, and
further local SBPF retries stopped without changing the required profile.

The author separately started the maintained root-library test command to
assess host dependency compilation. It was still running at this checkpoint;
no successful library-test result is transferred or inferred here.

At this review checkpoint, no successful SBPF, Clippy, LiteSVM, IDL or real
validator execution is claimed for this lock. Completion must be established
from the exact frozen source, completed logs and unchanged lock hash. Preserve
both real refund waits, financial assertions, default release-disabled behavior
and hosted merge gates. Re-review if the source or lock changes.

Primary sources: [recovery 3.3.1 metadata](https://crates.io/api/v1/crates/solana-secp256k1-recover/3.3.1),
[syscalls 4.1.2 source archive](https://static.crates.io/crates/solana-syscalls/solana-syscalls-4.1.2.crate),
[bigint 0.7.11 metadata](https://crates.io/api/v1/crates/crypto-bigint/0.7.11),
[ctutils 0.4.8 metadata](https://crates.io/api/v1/crates/ctutils/0.4.8), and the
[exact RustSec record](https://github.com/RustSec/advisory-db/blob/074ea9a7ed619f511b5b7374c7a97e98d1e98be4/crates/crypto-bigint/RUSTSEC-2026-0387.md).
