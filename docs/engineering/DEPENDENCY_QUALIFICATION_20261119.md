# Dependency qualification — generation 6

Date: November 19, 2026, America/Vancouver task date; observations and commands occurred November 20 UTC. Reviewer: `generation6_dependency_audit`, with the read-only `cargo_and_pins` subreview.

## Result and boundaries

**Follow-up, November 20, 2026, 02:34 UTC:** the single bounded offline Cargo retry completed with two RustSec vulnerability matches and five separate unmaintained-package warnings. Its source identity, exact results and limits are recorded in the dated follow-up below. The original interrupted attempt remains historical; the npm results are unchanged.

Fresh advisory queries against the exact published core lockfiles returned **zero npm findings** for the full root tree, its production subset and the separately locked escrow tool. The prior Picomatch advisory is now **withdrawn upstream**. This is a change in advisory disposition, not a package fix, owner risk acceptance or an alteration of the earlier bounded timing observation.

No application or dependency change was justified by those npm results, and none was made. This audit does not replace the component-source review or the pending hosted financial/browser qualification. The independent no-High/Medium component-source verdict remains limited to its reviewed source; it is not a dependency-audit clearance. This review also does not establish a completely verified supply chain: the fresh whole-tree npm signature check did not run after its preparatory install was killed, and the initial Cargo advisory attempt returned no completed result. Neither incomplete attempt is treated as a pass. The subsequent Cargo matches require their own scoped assessment; they are not cleared by the earlier component-source verdict.

The existing November 18 assessment remains historical evidence. Do not rewrite its executed five-high audit or its slow-pattern reproductions as if they had never happened. Conversely, do not carry the withdrawn record forward as a newly discovered, currently active High vulnerability.

## Exact source and installation boundaries

| Item | Exact identity |
| --- | --- |
| Published core PR | [#205](https://github.com/djshellshoxxx/p2p-offramp/pull/205) |
| Reviewed commit | `cd7d54ba075118a7ec043788c17718be842ee405` |
| Reviewed tree | `ce3c69ddc36245f756005c540e521a26a3ce59b8` |
| Worktree | `p2p-offramp-generation6-dependency-audit` |
| Branch | `codex/generation6-dependency-audit-20261119` |
| Runtime | Node 24.22.3, npm 11.19.1 |
| Advisory registry | `https://registry.npmjs.org/` |
| Root lock SHA-256 | `9099553922da18ffb1847f2af0780add27c422ecdcbb00b1050503ffb2e4dd72` |
| Escrow-tool lock SHA-256 | `1153d63e76110354be9ec1be3ec23ae547a59e47e656b488abfab791d2aec35a` |
| Cargo lock SHA-256 | `af3401d2bd8e793693ea1e2626df46972b7933207d14c0cb450d13ab8f14c597` |
| Python crypto requirements SHA-256 | `fd3fcbe314d2f7eae173805009a1b40f214fb8ed839905a98228ec4eebbed911` |

The active npm installation boundaries in CI are the root and `packages/escrow-evm`, each with its own lockfile. The root lock has 102 package entries beyond the root and fourteen exact direct pins: six runtime and eight development dependencies. The escrow tool has nineteen package entries beyond its root and four exact direct development pins. Direct manifest versions and lockfile versions agree at both boundaries. Every package entry has integrity metadata, and root resolved URLs use the public npm registry. No dependency install-script policy was relaxed.

The only root lock delta from starting main `5c5a84e` is the already reviewed `jsqr@1.4.0` addition and its exact integrity entry. The previously pinned versions, the escrow lock, Cargo lock and Python requirement pins remain unchanged. The earlier November 18 Picomatch report used the preceding root lock, so its digest must not be attributed to this current source.

This review read the current handoff/state and prior security/integration reports before creating the isolated checkout. Those reports establish scoped source invariants and functional tests; they do not by themselves establish a new advisory query.

## Executed npm advisory checks

These commands only query the existing lockfiles; no audit-fix or package update was requested:

```sh
npm audit --package-lock-only --ignore-scripts --json --fetch-timeout=15000 --fetch-retries=0
npm audit --omit=dev --package-lock-only --ignore-scripts --json --fetch-timeout=15000 --fetch-retries=0
# Run the first command independently from packages/escrow-evm as well.
```

| Query | Actual returned result |
| --- | --- |
| Full root lock | 0 info, low, moderate, high or critical findings |
| Root production subset | 0 findings |
| Separate escrow-tool lock | 0 findings |

The full root result reports 102 total dependencies, including 8 production and 95 development classification counts; npm's category counts overlap and include its own root accounting. The source inventory separately identifies seven non-development package entries: three Noble packages, React, React DOM, Scheduler and jsQR. The production-subset result is not substituted for the full result.

All three queries produced valid JSON without an advisory error response. Registry audit results are time-bound matches against published advisory data, not a proof that package code is benign or every reachable operation is safe. npm documents that the audit and signature/provenance checks are separate operations. [npm audit documentation](https://docs.npmjs.com/cli/v11/commands/npm-audit/)

### Picomatch disposition, verified against current primary sources

The live [GitHub advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) records withdrawal on **November 18, 2026** and an update on **November 19**. Its current description says it was withdrawn because it is not considered a security issue. The [linked maintainer discussion](https://github.com/micromatch/picomatch/pull/235) rejects that classification and places glob-pattern authorship inside a trusted boundary. A search-engine cached fragment had older wording; the live canonical record was used.

The advisory retains its original affected range and no-patched-version field for historical reference. Actual current `npm view picomatch version versions dist.integrity --json` still reports **4.0.7** as both latest and highest published version. Its registry integrity is the same as the lock:

```text
sha512-qcJu88Q2IWqJsDD529JKMdwGm/dvInW4HvQnRwiH9JtihJvzGOscDtHE3x1pBKeUOTysQ8kVmLnJ2kJu7yhcGA==
```

The official [Picomatch releases](https://github.com/micromatch/picomatch/releases) corroborate 4.0.7. Current [Vite registry metadata](https://registry.npmjs.org/vite/latest) reports 8.3.8, still depending on Picomatch `^4.0.7`; blindly moving Vite would not replace this implementation. No version change, override, fork, audit exclusion or integrity rewrite was applied.

The preserved `docs/execution/PICOMATCH-ADVISORY-ASSESSMENT-2026-11-18.md` contains executed bounded direct/Vite slow-pattern tests. Withdrawal does not make those observed timings false. The current project continues to use repository-owned build configuration and loopback development/preview hosts; no application-input path into those glob patterns was identified. This is a source-scoped usage constraint, not a universal claim about arbitrary consumers of Vite or Picomatch. The old probes were not repeated merely to produce another defect count.

## Signature and install scope

The repository's retained public-registry evidence checker executed successfully:

```sh
node scripts/check-npm-registry-signatures.mjs
```

It verifies the dated registry signature assertions for `@noble/curves@2.4.0` and `@noble/hashes@2.4.0`, binds their retained integrity to the current lock, and rejects tampered messages, tampered signatures and the wrong key. The embedded observation date remains **October 26, 2026**. This does not extend the evidence to every current package, authenticate a git source commit, or approve cryptographic implementation safety.

A fresh isolated installation was attempted solely to enable the native whole-tree signature/provenance command:

```sh
npm ci --ignore-scripts --offline --no-audit --no-fund
# Intended next command, not executed:
npm audit signatures --json --fetch-timeout=15000 --fetch-retries=0
```

The install process was **killed with exit 137**. It produced only the existing npm environment-option warning before termination. The cause was not established. Because the commands were joined with a success condition, `npm audit signatures` **never started**. No successful fresh install, complete registry-signature pass or current provenance-attestation pass is claimed. The command was not retried with weaker script/integrity settings. Tracked manifests and locks remained unchanged.

## Actual emitted-artifact inspection

The coordinator's preserved exact-core default/demo artifacts were reopened read-only; this reviewer did not rebuild them or run Chromium. Every recorded asset size and SHA-256 matched the local build evidence: twelve default assets and thirteen demo assets, plus their evidence documents, for **13 and 14 files** respectively.

| Artifact | Document / private Worker / QR modules | Affected build-tool modules |
| --- | --- | --- |
| Default | 93 /30 /4 | 0 |
| Demo | 95 /30 /4 | 0 |

The inspection searched the emitted module graphs for Picomatch, Tinyglobby, Fdir, Vite and the React Vite plugin. None occurs in either profile's document, private Worker or public QR graph. This narrows the demonstrated browser-runtime exposure; it does not certify every developer-server or future plugin configuration. Both artifacts retain `ReleaseEnabled:0`.

Evidence document SHA-256:

- Default: `48fdb1bb94c8ce49743ecb194eb8e8d53835a34e679eff7fba87a5258cdd5ab9`.
- Demo: `8fc6e7d2f539dc162f75d691faf4d2e7e2e175b02fdb67c26654b29b18e4736c`.

## Cargo and toolchain subreview

The exact Cargo lock has **412 entries**: 411 crates.io registry packages with valid SHA-256 checksum fields and the local `basic-escrow` package. There are no git dependency sources. This verifies lock metadata coverage, not downloaded crate contents or cryptographic trust by itself.

The read-only subreview obtained the official [`cargo-audit 0.23.0` release](https://github.com/rustsec/rustsec/releases/tag/cargo-audit/v0.23.0), published November 10, 2026, without installing a full Rust toolchain. The release archive SHA-256 matched the GitHub release asset digest. It also fetched the official [RustSec database commit `074ea9a7ed619f511b5b7374c7a97e98d1e98be4`](https://github.com/RustSec/advisory-db/commit/074ea9a7ed619f511b5b7374c7a97e98d1e98be4), dated November 19, 2026. The attempted command was:

```sh
cargo-audit audit --file contracts/solana/Cargo.lock --db <isolated-advisory-db> --no-fetch --no-yanked --json
```

The subreview was interrupted before a completed result was captured. On resumption, the original tool session was unavailable, no process matching that exact owned command remained, and both `cargo-audit.json` and its stderr file were still zero bytes. **No exit code, native RustSec pass, vulnerability count or yanked-package check is claimed.** The exact-lock command was not restarted or replaced with a broader probe. Lock metadata and workflow pin inspection below are completed evidence independent of that incomplete execution.

| Downloaded audit input | SHA-256 |
| --- | --- |
| Official musl release archive | `4f01c74ed84b2dffd0b1d37012a62cdf2a92c96e25bdf8eec7fcc0d4d3eb7811` |
| Extracted `cargo-audit` binary | `ae133cc7bdfc6d61d1f9d000da3259423f1a232e6275e9ade45b4b4c67207b64` |

### CI and pinned inputs

All **32 action-use occurrences**, across six workflows and nine distinct action references, use full forty-hex commit pins. Native qualification workflows retain read-only contents permissions; all eight inspected automatic `npm ci` commands use `--ignore-scripts`, and the escrow install uses its own prefix/lock. Cargo build, clippy, tests and IDL generation use `--locked`. The Solana cache is restored for pull requests, while saving remains restricted to an eligible successful push to main.

Agave 4.1.2 and Anchor CLI 1.2.2 download paths retain explicit SHA-256 comparisons before extraction/execution. Host Rust is pinned to 1.98.1; on-chain compilation uses the separately specified platform toolchain. The relay tool pins `nak 0.22.3` and verifies its SHA-256. The Foundry workflow selects `v1.5.1` through a commit-pinned action; contract configuration fixes solc `0.8.30`, disables compiler autodetection and pins vendor submodules by commit. This inspection does not independently re-attest each compiler or toolchain asset.

The independent Python crypto oracle retains exact `cryptography==50.0.0`, `cffi==2.1.1` and `pycparser==3.0` pins. Both installation sites use isolated pip, required hashes and binary-only installation. This is completed installation-integrity inspection, not a current Python vulnerability query; no such advisory pass is claimed.

These controls have scoped limits. Hosted `ubuntu-latest`, Node24/Python3.12 patch selection and Chromium `stable` are mutable qualification environments, so their actual versions must remain in execution evidence. A download hash establishes byte identity relative to the recorded value, not independent provenance or a source audit of the binary. Thirteen checkout occurrences exist; five explicitly disable persisted credentials. The others are not silently described as having that setting, and no exploitable credential path was established by this bounded review.

The separate manually invoked `openai-agents.yml` workflow was inspected only. Its explicit apply job has a distinct write permission and it installs an exact Codex CLI version with scripts disabled. It was not invoked, altered or treated as authorization to use paid OpenAI/Codex services during this task.

## Evidence retained and continuation

Temporary evidence is under `/workspace/scratch/6bd6e00af1c0/verification/dependency-qualification`; the report records identities so it can be regenerated without promoting ephemeral logs into current release receipts.

| Evidence | SHA-256 |
| --- | --- |
| `npm-full.json` | `42d1a24ead6ccb74baeee473b945314b7f67b180beaab7ff956b5b7722c1c85b` |
| `npm-production.json` | `42d1a24ead6ccb74baeee473b945314b7f67b180beaab7ff956b5b7722c1c85b` |
| `npm-escrow-tool.json` | `d453f09007fcda812cb4415289b64c250821bd43e80b64002e8fd9a16d93234f` |
| `picomatch-current.json` | `8a31ddccfb4542816420e95c5d90da98459b766aa9ccd56ed4e0100d814beb32` |
| `retained-registry-signatures.json` | `786b3ce21b0ae9f12b0cb156b4bb6d52327d8ba7573416747af19b85dc838b36` |
| Incomplete `npm-ci-offline.log` | `9aac3da9a7039a99c345545c32f286aa65c358d571bfce7e00d94625d095c829` |
| Cargo/action `pins.json` | `658b38f0daf36b1c71c41957129993d2114d2adcb791f9599f9d321b69dd3a27` |

Continuation is limited to any explicitly incomplete signature/Cargo scope or a new current advisory/version change. Preserve the original assessment and append this dated withdrawal/current-query result to the coordination ledger. Do not increment the repair count for an upstream withdrawal, change dependency pins just to make a stale scanner agree, or infer owner acceptance of a separate risk. No financial suites, product fixes, deployments, release settings, credentials or remote mutations were performed by this review.

## Follow-up — November 20, 2026, 02:34 UTC: bounded offline RustSec result

The coordinator authorized one retry of the same exact-lock command with a strict **45-second subprocess timeout**, fresh evidence filenames and no further installation or download. Before the retry, the previously verified binary, Cargo lock and clean advisory database were rehashed or identified; no process matching the original owned command remained. The reviewed source is still `cd7d54ba075118a7ec043788c17718be842ee405`, with the unchanged Cargo lock SHA-256 `af3401d2bd8e793693ea1e2626df46972b7933207d14c0cb450d13ab8f14c597`. The report-only branch was at `4205cc76a59e2f42e775c87b5306d63e6ba15594` when this retry ran.

The auditor remains `cargo-audit 0.23.0`, binary SHA-256 `ae133cc7bdfc6d61d1f9d000da3259423f1a232e6275e9ade45b4b4c67207b64`. The local database remains the independently verified clean Git commit `074ea9a7ed619f511b5b7374c7a97e98d1e98be4` from November 19. No database fetch or yanked-version query occurred. The command was:

```sh
/workspace/scratch/6bd6e00af1c0/verification/dependency-qualification/cargo-pins/cargo-audit audit \
  --file /workspace/scratch/6bd6e00af1c0/p2p-offramp-generation6-dependency-audit/contracts/solana/Cargo.lock \
  --db /workspace/scratch/6bd6e00af1c0/verification/dependency-qualification/cargo-pins/advisory-db \
  --no-fetch --no-yanked --json
```

The native process **completed with exit 1 in 0.366 seconds**, from `2026-11-20T02:34:28.245626+00:00` to `2026-11-20T02:34:28.611603+00:00`; the timeout did not fire. Stdout is valid JSON containing **two vulnerability matches**, 412 lockfile dependencies and a database advisory count of 1,550. Stderr is empty. The JSON's `database.last-commit` and `last-updated` fields are null, so the database identity above comes from the separate local Git verification, not invented report metadata. Audit settings report no ignored advisories, target filters or severity filter.

| Matched package | Primary advisory in the exact database snapshot | Patched range recorded by RustSec |
| --- | --- | --- |
| `crypto-bigint 0.5.5` | [RUSTSEC-2026-0387](https://github.com/RustSec/advisory-db/blob/074ea9a7ed619f511b5b7374c7a97e98d1e98be4/crates/crypto-bigint/RUSTSEC-2026-0387.md): timing variability in operations intended to be constant-time | `>=0.7.6`; no unaffected range listed |
| `ctutils 0.4.2` | [RUSTSEC-2026-0385](https://github.com/RustSec/advisory-db/blob/074ea9a7ed619f511b5b7374c7a97e98d1e98be4/crates/ctutils/RUSTSEC-2026-0385.md): non-constant-time mask generation and `u128` comparisons | `>=0.4.4`; no unaffected range listed |

Both records are dated October 23, 2026, have no withdrawal date, and have no CVSS value in this snapshot. The upstream references are [RustCrypto/crypto-bigint pull request 1365](https://github.com/RustCrypto/crypto-bigint/pull/1365) and [RustCrypto/utils pull request 1569](https://github.com/RustCrypto/utils/pull/1569). These are real exact-version advisory matches, not package-name-only guesses. This bounded retry did not establish whether affected operations execute on secret inputs in the project's enabled dependency features, which runtime or development paths include them, or what the relevant compiler/target produces. It therefore establishes neither application exploitability nor non-reachability, and assigns no unsupported High/Medium severity. Patch compatibility, affected-call reachability and any necessary dependency change remain separate engineering work; no risk acceptance or safe override is inferred.

The JSON also reports five **unmaintained** warnings separately from its two vulnerability matches:

| Package | Informational record |
| --- | --- |
| `ansi_term 0.12.1` | `RUSTSEC-2021-0139` |
| `bincode 1.3.3` | `RUSTSEC-2025-0141` |
| `derivative 2.2.0` | `RUSTSEC-2024-0388` |
| `libsecp256k1 0.7.2` | `RUSTSEC-2025-0161` |
| `paste 1.0.15` | `RUSTSEC-2024-0436` |

Fresh logs are under the existing `verification/dependency-qualification/cargo-pins` scratch evidence directory. The original `cargo-audit.json` and `cargo-audit.stderr` remain zero-byte historical files, and the original attempt still has no observed exit status.

| Fresh evidence file | Bytes | SHA-256 |
| --- | --- | --- |
| `cargo-audit-followup-20261120-bounded-1.json` | 12,119 | `c0df34d63623aa346f667d39a5fab8906afa38b2a2b72d3ab4de19754866c16e` |
| `cargo-audit-followup-20261120-bounded-1.stderr` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `cargo-audit-followup-20261120-bounded-1.status.json` | 14,506 | `b1808d6ae6bd8d4f1306298df99e07114b2672a2324e77fbc00abeb95c71c854` |

This follow-up changes the native Cargo advisory status from unqualified to **completed with findings against the pinned database**. Yanked-package checking, fresh whole-tree npm signatures and a Python advisory query remain outside the completed qualification. No additional audit retry, worker, build, heavy test, installation, download, source change or remote mutation was performed.
