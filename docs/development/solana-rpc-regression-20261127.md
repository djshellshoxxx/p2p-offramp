# Solana hostile RPC accessor regression — 2026-11-27

Baseline: `fdf346ab8e6aacc60b501007ec10ec7ee840a701`. This addresses the hostile-RPC test lead in the B1b low findings in [Lane B progress](../consolidation/LANE-B-PROGRESS.md).

## Finding and change

The `accessor in response` fixture in `hostile-rpc-status-and-heights` called `assert.fail` from a response getter. A parser that incorrectly invoked that getter could catch the assertion and convert it to the same `INTEGRITY_FAILURE` that the test expected. The test therefore did not establish that the provider getter stayed uncalled.

The fixture now increments an external invocation counter and throws an ordinary error. After the existing reconciliation error assertion, the test independently requires that counter to remain zero. The unchanged journal state and single-send assertions remain in place. Production parsing and transaction behavior are unchanged.

## Verification

A temporary Node module loader replaced only the `own()` descriptor check in `submit.ts` with direct property access. The mutation was applied in memory, with no production source edit retained.

| Check | Result |
| --- | --- |
| Original focused test with the direct-read mutation | 1 passed; the bad implementation survived |
| Strengthened focused test with the same mutation | 1 failed at `accessor in response: provider getters must not execute`, actual 1 versus expected 0 |
| Complete lifecycle suite with unchanged production code | 18 passed, zero failures or skips |
| Combined Solana package and Solana app suites | 383 passed, zero failures or skips |
| Full `npm test` | 2,506 passed, zero failures, one existing Foundry-dependent skip |
| Tooling suite | 57 passed, zero failures or skips |

All four TypeScript configurations, import boundaries, build policy, Python specification tests, specification inventory, docs consistency, governance consistency, formal unit tests, acceptance CLI tests, agent tests, diagnostics, fuzz tests and the default build also passed.

The normal commands were:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test packages/chain-solana/test/lifecycle.test.mjs
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=4 packages/chain-solana/test/*.test.mjs apps/web/test/solana-*.test.mjs
```

An independent reviewer reran the complete lifecycle suite (18 passed) and the direct-read mutation (one intended failure) with no findings. These are local source-test results; they do not add native-validator, physical-wallet, browser, deployment or release qualification.
