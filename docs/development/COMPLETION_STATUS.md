# Development completion status

Updated: 2026-11-16

## Current checkpoint

- D1 candidate branch: `codex/peer-acceptance-20261116` (PR #124)
- Base branch: `claude/confident-fermi-g6wjp3` at `174308d`
- D1 source commits: `4f0b17b` and `adc3448`
- Validation used a local assembled tree containing the base source plus the D1
  candidate and this run's documentation/test-runner updates.
- Source includes latest D9/G3 continuation and D1 private candidate.
- Release branch `main` was not changed. `ReleaseEnabled=0` remains unchanged.
- Feature-level evidence and remaining acceptance work: see
  [`FEATURE_COMPLETION_MATRIX.md`](FEATURE_COMPLETION_MATRIX.md).

## Verification in this run

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

## Branch intake

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
3. Specify bounded v2 transport and authenticated receive/cancel/reject wiring.
4. Qualify the integrated buyer/seller journey in browser with real wallet prompts,
   IndexedDB races, crash/reload and malicious-peer cases.
5. Re-run Foundry and exact-head hosted checks.
6. Complete independent security, cryptography and contract review.
7. Obtain required release trust, testnet and release-signing decisions.

## Restart instructions

```sh
git fetch origin codex/peer-acceptance-20261116
git switch -c codex/peer-acceptance-20261116 --track origin/codex/peer-acceptance-20261116
npm ci --ignore-scripts
```

Run the four-worker suite with:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=4 packages/*/test/*.test.mjs apps/web/test/*.test.mjs scripts/tests/research-evidence.test.mjs scripts/tests/npm-registry-signatures.test.mjs
```
