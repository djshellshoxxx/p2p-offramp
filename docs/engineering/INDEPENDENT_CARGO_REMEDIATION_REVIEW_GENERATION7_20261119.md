# Independent ctutils remediation review

Recorded November 19, 2026, America/Vancouver task date / November 20 UTC. Reviewer: original consolidation coordinator, separate from implementation worker.

## Source and result

Reviewed source `d2ba3b89c5e8a4fb06b3c01b2e981f9fafce672b`, tree `b6359a0273ae6ee5be194cb001878e981c85bf8d`, directly descends from published PR205 `cd7d54ba075118a7ec043788c17718be842ee405`. The only changed file is `contracts/solana/Cargo.lock`.

Independent parsed comparison of all 412 package records confirms only the ctutils version 0.4.2 to 0.4.4 and its checksum changed. All other package fields, dependency arrays, manifest/source/toolchain/workflow files are byte-identical. No ignore, override, patch fork, feature change or resolution-policy change is introduced.

Root independently hashed the official 0.4.4 crate archive and compared it with the registry record and repaired lock: `12218662ccac37d9714f2191252553d67585b97df8c839cbe49e0bde278dc865`. The inspected record is not yanked. The existing digest requirement accepts the 0.4 series. The implementation worker used actual pinned Cargo 1.98.1 resolution, not a manual checksum edit.

## Independent native advisory execution

In a separate checkout at the exact source, root reran the already verified cargo-audit 0.23.0 binary against unchanged pinned database `074ea9a7ed619f511b5b7374c7a97e98d1e98be4`, with `--no-fetch --no-yanked --json` and a 30-second timeout.

The process completed in 0.452 seconds with native exit 1, valid JSON and zero stderr bytes. It retained exactly one vulnerability match: **crypto-bigint 0.5.5 / RUSTSEC-2026-0387**. The ctutils match is absent. Five separate maintenance warnings remain. Raw JSON SHA256 is `2c194eff3f175e423423944db89ca26f4ba2b434138417bd25706fd505513ed1`. No clean-audit result is claimed.

The original two-match audit remains historical evidence. This is an additional independent execution on the repaired lock, not a relabeling of the original result.

## Compatibility, reachability and tests

The worker's actual 150/150 upstream library test result and native Cargo update logs were read and their recorded SHA256 values independently verified. Root also verified the three recorded offline graph-log hashes and read the four feature-resolution outcomes. Those executions are attributed to the implementation worker; they are not counted again as root test executions.

The host normal/build graph contains neither affected crate. Both occur in development/test feature resolution. Anchor's SHA256/digest path does not activate the optional MAC feature that brings ctutils; development BLAKE3 paths do. These host graph observations do not certify an unbuilt SBPF artifact.

The remaining bigint parent requires the 0.5 series, while its patched advisory range begins at 0.7.6. The author found no compatible non-yanked patched 0.5 release. A forced major substitution would not satisfy the current dependency constraint. The source report preserves enabled k256 signing features and limits its call-path conclusions to inspected source; it does not claim whole-program non-reachability or a secret-recovery experiment.

Root independently retrieved the primary [ctutils advisory](https://rustsec.org/advisories/RUSTSEC-2026-0385.html) and [crypto-bigint advisory](https://rustsec.org/advisories/RUSTSEC-2026-0387). Their patched ranges match the pinned audit records. The report assigns no unsupported CVSS or application exploitability rating.

No additional High/Medium issue was found in this narrow compatible lock correction. The remaining dependency advisory stays visible for upstream-compatible remediation or a separately reviewed backport. This review supplies no owner risk waiver and makes no new application vulnerability claim.

## Required final qualification

The change is ready for source composition and a reviewable PR. The exact final composition still needs the unchanged Solana SBPF build, lint, LiteSVM, IDL, validator and browser financial gates. Upstream crate tests and cargo-audit are not substitutes for those gates or target-specific constant-time machine-code verification. Do not merge the defective PR205 ancestor merely because this narrow descendant exists.

No source besides this report, dependency pin, workflow, external worktree, remote ref, deployment, release, credential, setting or real-funds operation was changed by the independent reviewer. Scratch receipts are under `verification/generation7-cargo-independent`; maintained author receipts are committed separately.
