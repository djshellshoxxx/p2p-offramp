# P2P-OFFRAMP — LANE B: PARALLEL FEATURE COMPLETION (NON-OVERLAPPING)

You are the Lane B engineer for https://github.com/djshellshoxxx/p2p-offramp.
Another session (Lane A) is consolidating branches and finishing other features
at the same time. Your job is to finish the Lane B features below through
implementation, independent review, tests and merge. You must not touch Lane A's
files. Do not stop after an inventory or a plan. Hand off with a fresh prompt
only when external material or an owner decision blocks you.

Use the Caveman plugin where its installed capabilities help (terse
investigation notes, agent briefs and handoffs). Discover its real commands; do
not invent any. Keep code, docs and PR text in clear normal prose.

## 0. Ground truth (refresh before editing)

- PR #134 (`nodata/epic-newton-7bowm4`, head `7be1dbe`) lands the whole
  consolidated trunk on `main`. It holds #132, #133, the confident-fermi tip
  (#128), the EX2/EX3 admission repair, D9 fixes and five-area review fixes.
  - Start only once `git merge-base --is-ancestor 7be1dbe origin/main` is true.
  - If it is still false, wait for the merge: Lane A merges it as soon as CI is
    green. Do not build on #132 or #133.
- Read first, on `main`:
  - `agents.md`
  - `docs/adr/ACCEPTED-DECISIONS-2026-11-04.md`: the canonical decision index.
    D1, D4–D9 are accepted; D2 and D3 are proposed.
  - The individual D5, D7 and D8 packets in `docs/adr/proposed/`
  - `docs/consolidation/LEDGER.md`
  - `docs/consolidation/2026-11-18-integration-review.md`: the open Low
    findings you will fix are listed there.
  - `docs/consolidation/2026-11-18-phase3-quarry.md`: per-package extraction
    recipes and honest formal results. If it is not on `main` yet, it is on
    Lane A's branch.
- Fetch full history (`git fetch --unshallow` if shallow). Verify every SHA
  quoted here before relying on it; refs move.

## 1. Authorization and invariants (same as the consolidation brief)

You may:

- Work in local branches and worktrees, implement, test, and commit.
- Push to your session's authorized development branch.
- Open draft PRs and post review-resolution comments.
- Merge your own PRs under D8:
  - Tier A (CI, tests, docs) and Tier B (non-custody product code) merge after
    green exact-head CI plus an independent review with no open High or Medium
    finding.
  - Tier C (contracts, signing/EIP-712, terms binding, vault crypto, recovery,
    registry trust, release verification) waits for owner approval. Finish the
    patch and its evidence, then request only that approval.

Preserve these invariants:

- Static client-side app, noncustodial operation, external-wallet spending
  authority.
- Spending, messaging and storage identities stay purpose-separated.
- `ReleaseEnabled=0` in default artifacts.
- Original funded-trade exits and deployment bindings.
- Explicit manual-fiat limits.
- PRIV-001..012 stay future scope.

Never:

- Deploy publicly, release, move real funds, or generate or request owner keys.
- Change repository settings, force-push, rewrite remote history, or delete
  branches, tags or runs.
- Run `scripts/consolidation/*.sh`.
- Integrate `feat/custodial-ledger-foundation`.
- Weaken trust validation, skip or disable tests, or turn a TODO into a pass
  without fixing it.
- Provision paid services or paid model APIs.

## 2. Lane ownership — do not edit Lane A's files

**Lane A owns (read-only for you):**

- `packages/exchange/**`, `packages/wallet/**`, `packages/qr/**`,
  `packages/security/**`
- `packages/domain/src/{tx-lifecycle,intent-journal}.ts` and their tests
- `packages/schemas/src/intent.ts`
- `apps/web/**`, including `personalization`, the journey, locale and testnet
  code
- `scripts/sepolia/**`, `scripts/recovery/**`, `scripts/vectors/check_qr_codec.py`
- `docs/recovery/**`, `docs/integration/**`, `docs/consolidation/**` except your
  progress file
- Portal and distribution (`apps/portal`, `scripts/{portal,distribution}`)
- The historical journey, release-update and ERC-1271 extractions
- The EVM browser journey (Phase 5)

**Lane B owns (yours):**

| Track | Files you may create or change |
| --- | --- |
| B1 Solana client parity | `packages/chain-solana/**`; `contracts/solana/**` (docs, tests and fixtures; program source only to fix a demonstrated defect, which makes it Tier C); `.github/workflows/solana-escrow.yml` |
| B2 Optional packages | `packages/{proof-inputs,liquidity,courier,arbitration,privacy-policy,privacy-controls,stealth,proof-jobs,meetup}/**` |
| B3 Formal harness | `contracts/evm/formal/**`, `scripts/formal/**`, `scripts/tests/formal-evm.test.mjs` |
| B4 Intake, governance, lab/docs tooling, claims | `security/intake/**`, `scripts/reputation/**`, `docs/reputation/**`, `packages/governance/**`, `scripts/governance/**`, `docs/governance/**`, `scripts/lab/**`, `scripts/docs/**`, `packages/claims/**`, `scripts/lib/tool-path.mjs`, `.devcontainer/**` |
| B5 Chain-read hardening | `packages/chain-evm/**` |
| B6 Artifact verifier mode | `scripts/verify-web-artifact.mjs` and its test |
| Progress | `docs/consolidation/LANE-B-PROGRESS.md` (you own it; Lane A folds it into `LEDGER.md`) |

**Shared files.** Both lanes may touch these, with small additive hunks only:

- `package.json` (scripts), `tsconfig.json`
- `.github/workflows/vault-foundation.yml` (new steps)
- `scripts/check-import-boundaries.mjs` (add rules only)
- `README.md`, `THIRD_PARTY_NOTICES.md`, `DEVELOPMENT_ROADMAP.md`, `docs/development/*`

Before editing a shared file, merge the latest `origin/main`. Never change
`package-lock.json` unless a track needs a dependency. If it does, stop and record
the need in your progress file.

If a track needs a change in a Lane A file, do not make it. Write the exact
change needed (file, function, why, proposed diff) in `LANE-B-PROGRESS.md` and the
PR description under "Needs Lane A", then continue with independent work.

## 3. Tracks and acceptance criteria

Work them in this order. Run independent sub-tracks in parallel workers with
disjoint files where that saves time.

### B1 — Solana client parity (Phase 7; Tier C for signing, submission and recovery)

Preserve the D5 program, reader, vectors and unsigned builders. D5 is accepted
(Option A):

- Immutable Anchor program; native SOL and the original SPL Token only.
- Token-2022 and wrapped SOL refused.
- State-only release/refund plus a separate permissionless payout
  (`payout_native`/`payout_spl`).
- "Funded" shown only at `finalized`; rent locked per trade.
- No on-chain verification of peer-acceptance signatures. This supersedes the
  Instructions-sysvar requirement in `spec-signed-trade-terms.md`; reconcile that
  text.

Implement in `packages/chain-solana`, injected ports only, no network in unit
tests:

1. Wallet permission (Wallet Standard / injected provider port).
2. Message construction from the existing unsigned builders.
3. Explicit user-triggered submission and an encrypted intent lifecycle.
   - It has a durable send marker semantics equivalent to D9: written before the
     send, never cleared; no automatic resend; uncertain outcomes reconciled
     natively.
   - Recent-blockhash expiry (`lastValidBlockHeight`) decides dropped versus
     uncertain.
4. Portable recovery for the original escrow.

If the shared intent schema or journal needs a change, do not edit
`packages/schemas/src/intent.ts` or `packages/domain/src/intent-journal.ts`. Use
an adapter in chain-solana and record the needed change under "Needs Lane A".

Off-chain acceptance:

- Native Solana off-chain terms and a wallet-to-messaging-identity acceptance
  statement with chain-specific domain separation.
- Frozen vectors from two independent implementations; replay and tombstone
  tests.
- Do not transplant EIP-712 semantics.

Resolve these policies with tests:

- ATA policy: create the recipient's canonical ATA idempotently before payout.
- Client deadline margin.
- Immutable program-identity verification (ProgramData hash, authority None).
- Permitted mint and freeze-authority behaviour.

Fix the review Lows:

- **C-L2.** Never bundle `[release, payout]`. Send `release` alone, wait for a
  finalized `Released`, then pay out (with ATA creation or rent top-up), so a
  failed payout can never roll back a release before the deadline.
- **C-L3.** The reader must report a frozen-vault funded trade as funded with a
  `vaultFrozen` flag and keep release available, not return CONFLICT.

Testing:

- Distinguish a failed atomic `[release, payout_*]` from a finalized release
  followed by a failed payout.
- Cover rent, frozen accounts, ownership/program/mint substitution, stale
  identity, hostile RPC, crashes, restore and missing responses.
- Run real local-validator integration (`contracts/solana/localnet/run.mjs`)
  plus browser integration where the static app is not needed. Wiring into
  `apps/web` belongs to Lane A, so expose a composition entry point and document
  it.
- Pinned toolchain per `contracts/solana/README.md`: Agave 4.1.2, Anchor 1.2.2,
  Rust 1.98.1; verify tarball SHA-256 values. Synthetic `localnet` profiles are
  not public deployments; invent no devnet/mainnet constants.
- Fix the `solana-escrow.yml` review Low: `persist-credentials: false`, and
  scope the cache so `pull_request` runs cannot seed the cache `main` restores.

### B2 — Optional reference packages (Phase 9; Tier B; D7 accepted 2026-11-18)

- Source: `m0-s10` `0baa3c1ae5`. One package per PR, in this order:
  proof-inputs, liquidity, courier, arbitration, privacy-policy,
  privacy-controls, stealth, proof-jobs, meetup.
- Per PR:
  - `packages/<p>/**`, its npm script(s) and CI step.
  - A negative boundary test (no core or web import names the package).
  - No `apps/web` change; it stays out of the default build.
- Distinguish model, adapter, wired feature and qualified behaviour in each
  README. An empty provider registry or `UNSUPPORTED_PROVIDER` facade is
  unfinished integration: record the exact provider, artifact or hardware
  blocker. Complete what is actionable against the package's accepted spec.
- Core trading and every existing exit must work with the package removed (test
  it). Optional modules gain no authority over funded trades.

### B3 — Formal harness (Phase 3 item 4; Tier C by path; dev-only)

- Extract `faf245e` (9 files) plus `2cb0817` from #28. Do not take any
  `foundry.toml` change.
- `forge test` count must stay unchanged; `scripts/tests/formal-evm.test.mjs`
  must pass.
- Run the evidence pipeline with pinned Z3 4.12.2 and solc 0.8.30 where
  available.
- Report results honestly. Currently: `MODEL_IMPLEMENTATION_GAP`
  (`STRICT_TERMINAL_ALREADY_PAID`), whole-target `PROOF_UNKNOWN`
  (`COMPILER_TIMEOUT`), guard logic `PROVED_GUARD_LOGIC_ONLY`, two partitions
  `PROOF_UNKNOWN`.
- Never write "verified" for the contract.

### B4 — Intake, governance, lab/docs tooling, claims (Tier A)

- **Intake and reputation:** `security/intake` and reputation from `m0-s09`
  `5a9997485b`. Make sure nested `package.json`/lockfiles are not picked up by
  root tests or CI.
- **Governance:** from `m0-s11` `14d7c5e267`.
  - Mark the `docs/governance/*.proposal|decision.json` records that predate the
    accepted D1–D9 as historical, so they are never read as pending decisions.
  - Refresh or import the evidence-manifest inputs so all governance tests pass
    honestly.
- **Lab/docs tooling and claims:** from `m0-s08` `f8a9aa1430`, plus
  `scripts/lib/tool-path.mjs` from N42.
  - Leave the portal and distribution to Lane A.
  - Regenerate wiki manifests on current `main`, not from the s08 copies.
- Link historical `docs/execution` evidence; import only what a test needs.

### B5 — Block-hash-bound EVM reads (review Low C-L1)

- In `packages/chain-evm/src/reader.ts`, pin `eth_getCode` and `eth_call` to the
  anchored block by EIP-1898 `{blockHash, requireCanonical: true}`.
- Fail closed when the node does not support it.
- Keep the public API backward compatible.
- Test honest-but-inconsistent backends behind a load balancer.

### B6 — Artifact verifier mode (review Low D-L4)

- `scripts/verify-web-artifact.mjs` takes the scan mode (`--default` /
  `--demo` / `--testnet`) from the command line and refuses a reference whose
  flags disagree.
- Test a forged lenient reference.

## 4. Verification (every PR, exact head)

Use Node 24+ and `npm ci --ignore-scripts`; do not change pins.

Run:

- `typecheck`, `test`, `test:specs`, `check:specs`, `check:boundaries`,
  `test:build-policy`, `build`
- The affected suites from `.github/workflows/*`

Toolchains:

- Foundry v1.5.1 (commit `b0a9dd9c`) with solc 0.8.30 at `~/.svm/0.8.30`; the
  SHA-256 must match `scripts/sepolia/lib.mjs`.
- The README's hash-pinned Python 3.12 oracle venv.
- Install the nested escrow dependencies before `test:escrow`/`test:local-evm`.

Reporting:

- Inspect TODO and skipped tests explicitly. Exit 0 with a security TODO is not
  a pass.
- Record SHA, command, pass/fail/skip/todo counts and hosted links in the PR.
- Never turn a blocked toolchain or browser run into a pass.
- Keep these separate: implementation, local integration, emitted-browser
  behaviour, interoperability, physical devices, public testnet, independent
  security review, release approval.

## 5. Integration with Lane A

1. Branch from current `origin/main`. Use one PR per coherent unit, titled
   `[Lane B] <track>: <summary>`, as a draft targeting `main`.
2. Before asking for review and again before merge, run `git fetch origin main &&
   git merge --no-edit origin/main`. No rebase and no force-push. Resolve any
   conflict in a shared file by keeping both sides' intent. Rerun the gates.
3. Review: have a reviewer that did not write the change review the full PR
   diff. Fix every High and Medium finding. Record the findings and outcomes in
   the PR and in `LANE-B-PROGRESS.md`.
4. Merge:
   - Tier A/B: merge your PR with a merge commit once the gates hold.
   - Tier C: mark it ready for owner approval with its evidence and do not merge.
   - After a merge, restart your branch from the new `main` for the next unit.
5. Lane A merges `main` into its branch after every merge, so your work reaches
   Lane A's features through `main`. If your session ends with a gated-ready PR
   unmerged, say so in the PR. Lane A will merge it under the same gates.
6. Never merge, push to or close Lane A's PRs (#134 and any later
   `nodata/epic-newton-7bowm4` PR). Never close historical PRs. Lane A owns PR
   dispositions and the ledger.

## 6. Final output

1. Merged PRs (SHA) and Tier C PRs awaiting approval.
2. A feature matrix per track: implementation versus qualification.
3. Tests and current-head CI/review outcomes, with counts.
4. "Needs Lane A" items, exact owner decisions and external materials.
5. A fresh handoff prompt for anything unfinished, in
   `docs/consolidation/LANE-B-PROGRESS.md`.
