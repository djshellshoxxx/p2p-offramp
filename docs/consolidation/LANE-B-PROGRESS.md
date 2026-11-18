# Lane B progress

Owner of this file: the Lane B session. Lane A folds it into `LEDGER.md`. Brief: `docs/consolidation/LANE-B-PROMPT.md`
(the original note placed it on Lane A's branch until #135; #135 is now merged).

## Reconciled track status — November 18, 2026

Pinned main: `6c38e641e24abcfdcf645f864bd64c9645836d75`. This table supplements the original progress record;
it does not transfer source ownership or count draft code as integrated. See the
[reconciliation record](2026-11-18-documentation-reconciliation.md) for exact stack heads.

| Track | PRs and observed disposition | Remaining boundary |
| --- | --- | --- |
| B1 Solana client | #151 merged; #152/#153/#157/#158 remain drafts and are consolidated in draft #167 | Qualify the combined native-validator path and compose native browser actions before claiming parity |
| B2 optional packages | #144 proof-inputs, #145 liquidity, #146 courier, #147 arbitration, #148 privacy-policy, #160 privacy-controls, #161 stealth, #162 proof-jobs and #163 meetup remain drafts | Separate modular review; no core completion or D7 deferral change |
| B3 formal harness | #137 merged at `6c38e641`; development-only tooling | Retain unknown proofs/model gap; no release certification |
| B4 tooling/intake/governance | #154/#155/#156 remain drafts | Review each exact source and its claims before integration |
| B5 canonical EVM reads | #143 merged at `f9bc66e7`; downstream wallet/payment/recovery work is in #166 | Current-head qualification for #166 and the dependent stack |
| B6 artifact verifier | #141 merged at `d6344b66` | Explicit build-mode verification does not approve release keys, artifacts or deployments |

Original progress PR #136 is preserved as a merge ancestor of this documentation
candidate. Its initial table below remains historical. No optional-package or audit
source branch was changed by this reconciliation.

## Historical start state (2026-11-18)

- Gate: `git merge-base --is-ancestor 7be1dbe origin/main` is true. PR #134 merged as `eef9a80`.
- Verified source SHAs: N37F `faf245e7766861a036725d76efc1015ffe321f81`, `2cb0817` (#28 branch), m0-s08 `f8a9aa1430`,
  m0-s09 `5a9997485b`, m0-s10 `0baa3c1ae5`, m0-s11 `14d7c5e267`, N42 `75d88460`.
- Local toolchain (all hashes checked against the repository pins): Node 24.22.3 (nodejs.org SHASUMS256), Foundry
  `1.5.1-v1.5.1` commit `b0a9dd9c`, solc 0.8.30 SHA-256 `f3e987dc…28f7` (matches `scripts/sepolia/lib.mjs`), Agave
  4.1.2 `182084b8` tarball SHA-256 `5991d027…f770`, Anchor CLI 1.2.2 SHA-256 `e2c35a97…e741`, Python 3.12 oracle venv
  (`cryptography` 50.0.0, hash-pinned).
- Baseline on `main@eef9a80` under Node 24: `typecheck` pass; `npm test` 1568 tests, 1567 pass, 1 skip (forge-gated
  calldata test), 0 fail, 0 todo; `check:boundaries`, `test:build-policy` and `build` pass.

## Historical initial branches and PRs

Branch names use the session prefix `nodata/youthful-maxwell-uwy8hx-<track>` (owner-approved in the session). One PR per
coherent unit, draft, targeting `main`.

| Track | Unit | Tier | Branch | PR | State |
| --- | --- | --- | --- | --- | --- |
| B1 | Solana client parity | C | `-b1-solana` | - | in progress |
| B2 | proof-inputs, liquidity, courier, arbitration, privacy-policy, privacy-controls, stealth, proof-jobs, meetup | B | `-b2-<package>` | - | in progress |
| B3 | Formal harness | C (by path) | `-b3-formal` | - | in progress |
| B4 | Lab/docs tooling + claims; intake + reputation; governance | A | `-b4-tooling`, `-b4-intake`, `-b4-governance` | - | in progress |
| B5 | Block-hash-bound EVM reads (C-L1) | B | `-b5-evm-blockhash` | - | in progress |
| B6 | Artifact verifier mode (D-L4) | C (release verification) | `-b6-verifier-mode` | - | in progress |

## Needs Lane A recorded at the initial checkpoint

None recorded yet.

## Owner decisions and external materials recorded at the initial checkpoint

None recorded yet.
