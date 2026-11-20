# Optional liquidity extraction — November 19, 2026

## Identity and accepted scope

- Stable task: `EXTRACT-OPTIONAL-LIQUIDITY`.
- Source PR: [#145](https://github.com/djshellshoxxx/p2p-offramp/pull/145), exact head `f03ebbfb395128f839fbe069226e6d79bc143258`.
- Integration base: `ac9a4b0ffc3ca50a299398e72554e7964a634cd4`.
- New local source commit: `a55c5ccc8a9aca85e0699ac0c71258ee4aa78cdd`.
- Source tree: `2e403b332cf28f0f93a0305cb1c1829ccd37d752`.
- Exact package subtree, identical at both original and recovered source commits: `ef4dace6c26423b61d98c6012e54ab56d714428e`.
- Isolated branch: `codex/optional-liquidity-20261119`.

D7's canonical accepted-decision index records the November 18 supersession of earlier parking: optional source is accepted as one package per PR with import-boundary checks. This extraction does not authorize default application wiring.

Diagnostic integer conservation and a bounded in-memory exact-fill reservation model. Simulation results do not authenticate custody or move funds. Native quote signing, atomic consume/fund, terminal-return authentication and reorg/intent contracts remain explicitly undefined.

Only `packages/liquidity/` was recovered from the historical branch. No whole old stack or superseded application code was merged. No root script, workflow, configuration, dependency or lockfile change is needed: maintained `npm test` and the root TypeScript source glob already include this package.

## Source review

The recovered implementation, tests and package documentation are byte-identical to the accepted source subtree. Existing hostile-input, authority and boundary cases remain intact. No new source defect was reproduced in this scoped extraction, so no implementation change or manufactured regression was added.

The package's existing static isolation suite probes forbidden imports, re-exports, dynamic imports and configurations, checks the actual tracked repository, and verifies that the maintained import-boundary scanner rejects this optional package from a default entry graph. These checks have explicit static limits; the default emitted build was also examined below.

## Executed verification

Node `24.22.3`, npm `11.19.1`. Each worktree uses a physical copy of the generation2 pinned dependency installation, not a symlink. No package installation, lockfile or version change was introduced by this extraction.

| Check | Result |
|---|---|
| `node --import ./scripts/test-support/register-tsx.mjs --test packages/liquidity/test/*.test.mjs` | **28/28 passed**, zero failures, cancellations or skips; includes the package isolation suite |
| `npm run typecheck` | All four maintained TypeScript projects passed |
| `npm run check:boundaries` | Passed: **238 production files / 140 core entry modules** |
| `npm run build` | Passed with the maintained default static profile |
| Emitted document, vault Worker and QR decoder graphs | Respectively 91, 26 and 4 source modules; **zero `liquidity` imports** |
| Emitted bytes compared with the generation2 default artifact | All **13 regular files** byte-identical, including generated evidence |
| Original versus recovered package subtree | Exact tree identity shown above |
| `git diff --check` | Passed |

The independent Python generator was executed with `python packages/liquidity/test/fixtures/generate_conservation.py`; `git diff --exit-code -- packages/liquidity/test/fixtures/conservation-python-v1.json` remained empty. Its four deterministic scenarios contain 160 transitions. Fixture SHA-256: `b7806481972963f3e9d295a9929424695332a1e67f619447a374f53f10572631`. This is a numerical simulation oracle, not a chain or custody witness.

The complete sorted mapping of output relative paths to SHA-256 digests hashes to `31442e38d1f0e8d3d8a3b41d2a197b1716c1241acce678b1b348ae3f0e435519` when serialized as compact JSON with sorted keys. The generation2 base's default artifact was the comparator. This checks emitted-byte identity and does not imply browser, native-device or production privacy qualification.

## Hosted status and review boundary

The original PR head above was read during this extraction. Its seven original required Actions contexts and CodeQL checks were completed successfully; its GitHub reviews array was empty. Those checks qualify that historical head only. The recovered source commit still needs its own hosted exact-head checks and independent review before integration under D8. This report is implementing-worker evidence, not an independent review.

No actual browser, chain transaction, deployed-host behavior, production proof/provider, release, funds, credentials or settings action was performed. The larger generation2 baseline's 2,152-test full suite is separate evidence and was not rerun or relabelled as this package's full combined result.

## Local evidence digests

The following logs are transient execution evidence; this repository report preserves their commands, results and SHA-256 digests for the source checkpoint above.

| Log | SHA-256 |
|---|---|
| `optional-liquidity-baseline.log` | `fad0e35200ee2c6cff28d2c275c6573809b1ed01ddb4f609c905481459f58335` |
| `optional-liquidity-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `optional-liquidity-boundaries.log` | `641bb7a0bcdfc9d521ae1e031197b1f2128be6d411f2d933f1ccd9a530f0cc95` |
| `optional-liquidity-build.log` | `aea1be750d09bb9decb9ddc9b84e1cb77e972d410b901d5f3b75f6c99eeaa169` |
