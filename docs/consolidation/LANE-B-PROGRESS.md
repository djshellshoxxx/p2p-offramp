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

## Status update — November 26, 2026 (Lane B session)

Observed on GitHub at `main@8cff449`:

- Merged: #141 (B6), #143 (B5), #137 (B3), #151, #152, #153 and #158 (B1), #154 (B4 tooling), #136 (this file).
- Open:
  - #155 (B4 intake, draft) and #156 (B4 governance, draft).
  - The B2 optional packages are being integrated by #191–#199 and #224–#232. The Lane B drafts #144–#148 and #160–#163 are their source.

The Lane B session's container ran out of its disk allowance after the 2026-11-18 run, so no further local work was possible. Everything Lane B produced is pushed. The findings below were never recorded anywhere else.

### Feature matrix (implementation versus qualification)

| Track | Implemented | Local evidence | Not yet qualified |
| --- | --- | --- | --- |
| B1a Solana reader policy | C-L3 frozen vault reads as funded; per-read identity checks plus a deploy-slot pin; freeze-authority permits; payout plans; proposed margins; solana-escrow.yml cache scope | 129/129 chain-solana tests, LiteSVM 48, real Agave 4.1.2 localnet run with 186/186 checks | Real cluster, wallets, browser; owner margin and permit decisions; rotated-permit payout matrix for funded/released/refunded escrows |
| B1b Solana lifecycle | Legacy message serializer; sign-only wallet port; C-L2 sequencing; durable send marker; dropped-versus-uncertain rule; portable recovery; `createSolanaEscrowClient` | 150/150 tests, 8 mutants caught, localnet client run 62/62 twice | `apps/web` wiring (Lane A); browser; public cluster; open Mediums F1–F3 |
| B1c Solana acceptance | Off-chain message v1 envelope; strict Ed25519; acceptance statement; bounded replay and tombstone ledger | TS and Python vectors byte-identical; real `@solana/offchain-messages` 8.6.0 cross-check | No physical or browser wallet; exchange carrier (Lane A); open Mediums M1 and F1 |
| B3 formal harness | Fail-closed SMTChecker classification and the evidence pipeline | 22/22 unit tests, forge 89; evidence rerun: NativeConstructor is PROOF_UNKNOWN | Second independent review of fix commits `05b9d22..59d091f` never ran (usage limit) |
| B4 tooling | Lab, docs validator, claims, tool-path; evidence bound to `sourceCommit` | `check:docs` ok at bind time | B4 tooling F2 (below) |
| B5 chain-evm | EIP-1898 hash-pinned `eth_getCode`/`eth_call`; receipt check at the anchored height | 25/25 tests; real anvil load-balancer probe | Other number-pinned readers (Lane A) |
| B6 verifier | Scan mode from the CLI only; one file handle; exit codes | 7 tests, 0/6 pass on pre-fix code | Release approval remains separate |

### Findings already mitigated on main (verified at source, `main@8cff449`)

These came from the 2026-11-18 reviews, and source read shows they are mitigated on current `main`. No local or runtime execution was done in this pass.

| ID | Mitigation on main | Still to verify |
| --- | --- | --- |
| B1A-T1 | `packages/chain-solana/src/reader.ts` (blob `07b2e85c`): `splMint` refuses a freeze-authority mint without a permit only when `existing === null`. `#observe` passes `classified.escrow`, and `readValidated` and `readPayout` both go through it. `test/policy.test.mjs` covers funded reads without a permit and pre-funding refusal. | A full rotated-permit payout matrix (funded, released, refunded) and a fresh run at the exact target. A frozen vault still cannot be paid out until it is thawed. |
| viem oracle receipt race (unowned) | `scripts/test-evm-viem-oracle-local.mjs` (blob `920f9290`): the refund uses a bounded `waitForTransactionReceipt`, and `finalizeThrough` polls for the receipt. | None. |
| B4 tooling F1 | `scripts/docs/validate.test.mjs` (blob `0fc95f19`): `maintainedDocumentPaths` derives link targets dynamically, and stale assertions are relative to a baseline report. | Not every docs-drift scenario is proven to pass. |

### Open findings from the 2026-11-18 independent reviews

These are AI-assisted reviews, not a professional audit. "Verified" means at least one of two independent skeptics reproduced the finding. "Unverified" means skeptic verification was cut short by a usage limit. Treat unverified findings as leads to reproduce first, not as established defects.

| Unit (PR) | ID | Sev | Status | Finding | Suggested direction |
| --- | --- | --- | --- | --- | --- |
| B1b (#158, merged) | F1 | Medium | unverified; source still matches on main | `journal.ts:79,119` bounds all records to 32, and `submit.ts:194-215` admits before the CAS for every prepared action, so 32 terminal records could lock a trade's exits. | Reproduce a native funded-trade exit first. Then design bounded retention or recovery as a Tier C decision. Do not simply remove the cap or discard terminal evidence. |
| B1b | F2 | Medium | unverified; source still asymmetric on main | `adapter.ts` maps cancelled/dropped records to Lane A `failed`/`expired`, but `importedState` refuses a non-prepared record with a null signature. | Preserve deliberate terminal re-observation. Settle which unmarked terminal cases are valid under the shared schema (owner/Lane A decision) before any change. |
| B1b | F3 | Medium | unverified | `submit.ts:236-238,276,296-300`: three D9/expiry properties have no regression test; mutants survived 150/150. The properties: the status re-read after the height check; treating any `confirmationStatus` as landed; sending after a `CONFLICT` on the `sendMarked` CAS. | Add one test per property and show each fails on its mutant. |
| B1b | L1–L3, F4–F6 | Low | unverified | A comment off by one on `lastValidBlockHeight`; `planPayout` ignores `rent-unknown`; `recoveryExits` shows payout open when rent-blocked; a hostile-RPC test passes for the wrong reason; unmarked signed intents are cancellable while the transaction stays valid; `sendTransaction` goes through a read port that may retry. | Address with F1–F3. |
| B1c (#151, merged) | M1 | Medium | conditional | `replay.ts` refuses out-of-horizon or full-capacity tombstones (`LIMIT_EXCEEDED`). The policy test already asserts the refusal and a later explicit tombstone. The open question is whether the product can then admit a peer acceptance for a cancelled `termsHash`. | Prove it through the accepted carrier before calling it a product defect. In any case, a cancel UI must not claim durable cancellation when the tombstone is refused. |
| B1c | F1 | Medium | reported | `acceptance.ts:268-270`, `acceptance.py:411-414`: no vector isolates the verifier's role check or its counterparty-key check; every wrong-role and swapped-key negative is caught earlier, so mutants of those checks survive in both implementations. | Add negatives that pass the wallet and own-key checks but fail only role or counterparty binding. |
| B4 tooling (#154, merged) | F2 | Medium→Low | verified | `packages/claims/src/claims.ts:80-82,90,103`: the claims API ignores staleness when only `en.ts` changed, and the stale list defaults to `[]`. | Take the validator's `staleClaims` (required argument) and refuse listed ids. |
| B4 tooling | F1 (extraction) | Medium | unverified | `dist-lab/` is not ignored (the s08 `.gitignore` line was not extracted), so every lab run after the first records `sourceDirty: true`. | Appears to be addressed by #259. |
| B4 intake (#155, draft) | F1 | Medium | unverified | `semaphore-v4-evaluation.test.mjs:94-100`: the "changed lock" refusal test never changes the lock; an earlier check fails first. | Make each refusal case reach its own check. |
| B4 intake | Qodo (#45 thread) | Medium | open | The evaluator verifies inputs, then mounts the caller-controlled `node_modules`/artifacts read-only and rechecks only after execution. | **Owner decision:** isolate verified input snapshots before execution, or archive the tool. |
| B4 governance (#156, draft) | GOV-1 | Medium | unverified | `scripts/governance/evidence.mjs:70,88-106`: `check:governance` never checks that `sourceCommit` is reachable from `origin/main`; only the refresh script does. | Check reachability in CI (the job already has full history). |
| B4 governance | F2 | Medium | unverified | `scripts/tests/tool-path.test.mjs:23-24`: the relative-PATH rejection is never exercised. | Put a fixture tool in the relative entries. |
| B2 (superseded drafts) | several | Medium | unverified | Boundary tests miss Worker URLs, Vite references and regex evasions; the only resolved-graph guard is `NON_CORE_MODULE` in `apps/web/scripts/static-build-plugin.mjs:41` (Lane A). Authority tests check names, not behaviour. The liquidity trap test never runs its traps. The courier locker accepts any non-null profile. The arbitration regex misses `crypto.subtle`. In privacy-policy, `retire()` invalidates every G05 broker permit, including core (PP-A2; #273 appears to address it). | Reviewers of #191–#199/#224–#232 should check each against the integrated source. |

### Needs Lane A (consolidated)

1. `scripts/recovery/evm-recovery.mjs` `readRecovery`, plus `packages/wallet/src/{evm-payment-preflight,evm-submit,evm-contract-acceptance}.ts`: state reads are still pinned by block number. Use `{blockHash: anchor.hash, requireCanonical: true}` (the C-L1 remainder).
2. `packages/schemas/src/registry.ts`: an SPL `AssetV1.freezeAuthority: string | null`, so the freeze permits derive from the signed registry.
3. `packages/schemas/src/intent.ts` and `packages/domain/src/intent-journal.ts`: Solana `payout`, `released|refunded`, the signature written in the `markSending` CAS, Solana observe/reconcile branches and successor reservation. The proposed hunks are in `packages/chain-solana/docs/lifecycle.md` §6.
4. `packages/exchange`: a v2 carrier for `{statement, termsSignature, acceptanceSignature}`.
5. `apps/web`: `signOffchainMessage` with an exact-bytes check; replay-ledger wiring; `createSolanaEscrowClient` with explicit margins.
6. `apps/web/scripts/static-build-plugin.mjs:41`: list every optional package in `NON_CORE_MODULE`, the only check that sees resolved module ids.
7. `scripts/sepolia/lib.mjs`: pin the forge binary SHA-256 (today only version and commit).
8. Unowned: the stale comment at `packages/domain/src/trade-terms.ts:167`. (The viem receipt race is already fixed; see above.)

### Owner decisions and external materials

- D5 client deadline margins: proposed 300 s for funding and release (`packages/chain-solana/src/policy.ts`).
- Freeze-authority permits per allowlisted SPL mint.
- D1 open item: whether a separate Solana terms consent is wanted in addition to the peer acceptance.
- Solana acceptance ledger bounds (64 entries per space, 7-day horizon).
- B1b journal retention and the shared-schema terminal states (F1/F2 above).
- #155 Semaphore evaluator: isolate-and-verify, or archival-only.
- External materials, none of which an agent can supply:
  - physical and browser Solana wallets for signing and interoperability tests;
  - a public Solana cluster profile (genesis, program id, mint list);
  - proving artifacts and providers for the optional packages.

## Handoff prompt (for a fresh Lane B session)

```text
You are continuing Lane B of djshellshoxxx/p2p-offramp. Read agents.md, docs/adr/ACCEPTED-DECISIONS-2026-11-04.md,
docs/consolidation/LANE-B-PROMPT.md and this file first. Lane ownership, invariants and D8 tiers are unchanged.
Your own push branch prefix is nodata/youthful-maxwell-uwy8hx-<unit>. Many PRs from other agents are open (#191-#273):
check each before starting so you do not duplicate it. Do not reimplement anything under "Findings already mitigated".

1. Reproduce each "Open findings" row against current main before changing anything. Start with B1b F1 (exact native
   funded-trade exit reproduction first, then a bounded-retention design for owner approval; Tier C), then F3
   (regression tests that fail on their mutants), B1c F1 (role/counterparty negatives) and M1 (through the carrier).
2. Run the second independent review of the B3 fix commits 05b9d22..59d091f (scripts/formal/evm.mjs): first-review
   findings are in the #137 description; check that the fail-closed classification has no new fail-open path.
3. For #155/#156: rebase is not allowed. Merge main, refresh the bound manifests at an origin/main commit, fix GOV-1/F2
   and the intake F1, and record the owner's decision on the Semaphore evaluator before any execution.
4. Post one review comment per B2 finding on the matching codex integration PR (#224-#232) if it is still open there.
Gates per PR: npm ci --ignore-scripts; typecheck, test, test:specs, check:specs, check:boundaries, test:build-policy,
build, plus affected workflow suites; Foundry 1.5.1 and solc 0.8.30 hash-checked; Agave 4.1.2/Anchor 1.2.2 for Solana.
Keep the disk allowance in mind: remove worktree node_modules, cargo target dirs and review scratch copies when done.
```

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
