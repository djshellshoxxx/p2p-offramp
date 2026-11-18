# Development completion status

Updated: 2026-11-16

## Current checkpoint

- Review/consolidation branch: `codex/review-consolidate-20261116`.
- Combines PR #124 source `b3f5084`, latest development `174308d` and remaining
  Wiki-source changes `c14cfd0` while preserving source ancestry.
- Adds a private bounded v2 EOA carrier, offline context verification, actual
  browser replay qualification fixture/CI step and Solidity/EVM vector checks.
- Current verification and full branch intake:
  [carrier review](../consolidation/2026-11-16-carrier-review.md).
- Main is unchanged; `ReleaseEnabled=0`. D1 is still a candidate, not a completed
  live trading protocol. See [feature matrix](FEATURE_COMPLETION_MATRIX.md).

## Previous checkpoint evidence (before carrier continuation)

- `npm ci --ignore-scripts`: passed; no lockfile changes.
- Full Node package/UI suite via `npm test`: 1,315 passed, 0 failed, 1 skipped.
  Skip requires Foundry/cast, which is not installed in this host.
- Before limiting test concurrency, Node's default worker setting produced 8
  file-level failures. Cause was not confirmed. Setting concurrency to four made
  the standard `npm test` command pass without changing assertions or exclusions.
- D1 peer-binding and replay tests: 18/18 passed.
- Four TypeScript projects: passed.
- Specification audit: 173 documents, zero broken links.
- Import boundaries: 128 production files and 64 core-graph modules passed.
- Default production build: passed; artifact scan reported 9 files and 468,307
  bytes. Build output does not claim signed release or release acceptance.
- Foundry suite, browser tests, physical-device tests, hosted CI, testnet and
  independent security review: not run or not verified in this run.

## Previous checkpoint branch intake

- Selected latest functional lineage from `claude/confident-fermi-g6wjp3`.
- Preserved unique D1 work from `codex/peer-acceptance-20261116` and validated
  it against the latest source lineage.
- `codex/continue-completion-20261116` supplies the immediately preceding
  locally qualified source checkpoint; latest confidential branch adds the
  security/ledger update.
- PR #118 remains draft. PR #124 remains a D1 candidate. Neither is release
  approval. No unrelated historical branch was merged in this checkpoint.

## Active gates

1. Independently review D1 EIP-712 field order, vectors and account classification.
2. Resolve contract/delegated-account verification and old-backup freshness policy.
3. Review the bounded v2 EOA carrier and implement authenticated receive/cancel/reject wiring.
4. Qualify the integrated buyer/seller journey in browser with real wallet prompts,
   IndexedDB races, crash/reload and malicious-peer cases.
5. Re-run Foundry and exact-head hosted checks.
6. Complete independent security, cryptography and contract review.
7. Obtain required release trust, testnet and release-signing decisions.

## Restart instructions

```sh
git fetch origin codex/review-consolidate-20261116
git switch -c codex/review-consolidate-20261116 --track origin/codex/review-consolidate-20261116
npm ci --ignore-scripts
```

Run the four-worker suite with:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=4 packages/*/test/*.test.mjs apps/web/test/*.test.mjs scripts/tests/research-evidence.test.mjs scripts/tests/npm-registry-signatures.test.mjs
```
