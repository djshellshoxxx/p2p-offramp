# Independent generation 4 composition and tooling review

## Verdict and exact scope

No open High or Medium finding in the reviewed optional/favorites/Solana acknowledgment composition or its eight-file tooling correction. This is source and executed local qualification. It does not qualify unexecuted hosted browsers, a release, current unsigned distribution, or the separate Solana restore correction and template editor.

| Identity | Exact value |
| --- | --- |
| Baseline | `2b23ee614ff2dd05bd3a6e79f1278658c30a3909` |
| Original combined source | `5ebeaa646d0b6e09a09a9a5852ff2905653f1841`, tree `cbf4e03186906f8ccf0c8e23ec1737700dd19952` |
| Narrow regression checkpoint | `57ef47d60f755284ab0a48e43373a657de0c2f40` |
| Repaired author source | `86a2b93666b029ea3bfc3a5e9c1ee3b89bdb6d28` |
| Repaired source tree | `ef66dcdfe3db18ddd9d28a2b61a571fe2b65ef16` |
| Independent equivalent checkout | `fdb67edef06608a3473f44f5d11923f0de14c81c`, exact same tree |

The coordinator reviewed in an isolated `codex/generation4-tooling-independent-20261119` worktree with physical dependencies. No author worktree, source ref, deployment or release was changed during review.

## Reproduced findings and correction

Two independently executed cases fail on the regression checkpoint: a stale working catalog permitted a forged recorded copy-text hash, and the distribution source inventory rejected the exact two newly reviewed Favorites modules. The earlier whole tooling run additionally exposed two aggregate assertions that assumed no pre-existing stale locale. Hosted favorites PR201 independently reproduced the same four failures in job136005796681; its distribution browser job136005796688 failed before the favorites browser step could run. Those results remain failures.

The correction derives recorded text from the already hash-verified immutable catalog bytes. A bounded literal scanner reads maintained definitions without importing or executing historical code. Recorded copy-text hashes must always match those immutable definitions. Current source drift remains separately stale; none of the six draft claims becomes semantically approved or current through this correction. The generator consumes the same immutable bytes.

Distribution admission adds exactly `packages/personalization/favorites.ts` and `packages/personalization/src/favorites.ts`; broad barrels, template source and other private paths remain refused in this source scope. New helper bytes are included in the recipe inventory.

The production `stage.mjs` and both maintained wiki receipt files are byte-identical to the original composition. Current favorites source must still fail with `DISTRIBUTION_SOURCE_CHANGED` because its locale differs from the recorded immutable binding. The negative test checks that no output directory survives. No stale binding is waived or rewritten.

Positive staging and tamper checks run against an explicitly identified historical client: commit `2b23ee614ff2dd05bd3a6e79f1278658c30a3909`, tree `a3701267756596e833247f50614c5ddc32f2cce0`, with five current tooling files copied into a temporary worktree. The resulting manifest marks the worktree dirty and binds the actual scoped file hashes. This historical-client/current-tooling result does not qualify distribution of the new favorites client. The actual browser harness preserves that distinction in its receipt, and still stages current source when all immutable evidence actually matches. Browser execution of this changed harness remains pending.

Both foundation jobs that use the historical fixture already specify `fetch-depth: 0`; the historical commit is an ancestor. No workflow fetch change or unpinned fallback is required. The fixture checks the exact tree and copies physical dependencies into its own checkout.

## Independent executions

| Check | Actual result |
| --- | --- |
| Two regression cases at original checkpoint | **0/2 passed**, two expected failures, no skips |
| Corrected cases plus immutable extraction/current-drift cases | **4/4 passed**, no failures/skips |
| Complete corrected tooling suite | **42/42 passed**, no failures/skips/cancellations; 33,114.584428 ms |
| Nine optional package subtree comparison | Every subtree equals its separately reviewed published source |
| Shared package metadata and npm commands | All 52 baseline commands preserved; exact union totals 60; non-script metadata unchanged |
| Favorites and Solana non-shared paths | Exact source bytes preserved from PR201 and PR202 |
| Protected production stage, immutable receipts, dependency lock, Solana workflow, native send observer and full native harness | Byte-identical to original composition |
| Actual emitted artifacts compared to preserved favorites output | All 13 default and 14 demo files, including build evidence, byte-identical |

An initial test-name filter matched only the hash regression and produced one empty-file wrapper pass. That partial attempt is retained as preliminary evidence and is not the two-case RED result. The corrected filter executed both named regressions and produced exactly zero passes/two failures.

The author independently executed the full repaired source suite: **2,580/2,580**, zero failures/skips/cancellations, plus seven TypeScript projects, 56 policy tests, native WASM cap, boundaries, builds, docs/governance and specs. Those broad author results are source-bound in `GENERATION4_COMPOSITION_20261119.md`; this report does not claim the coordinator reran that full unit suite.

## Reproduction and log identities

Use Node24 and checkout the exact source with physical node_modules. The two-case command is:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-name-pattern 'stale catalog bytes never permit|personalization source inventory admits' scripts/docs/validate.test.mjs scripts/distribution/stage.test.mjs
npm run test:tooling
```

| Independent log | SHA-256 |
| --- | --- |
| `independent-generation4-tooling-red-two-cases.log` | `e1f1ceee5b1af7b4eecc70f32efa1ad65664b5561ed072f66017fa0a77cf66f1` |
| `independent-generation4-tooling-green.log` | `979ec66170c71b881c2c8b284bf393e161b43be0f4964b3d8587ce9f8f9f83c1` |
| `independent-generation4-tooling-full.log` | `ad01f66ace09c04944ae98dbf8c4f5fda13885cf5007e8ac2706c77b2d836b10` |

Review also inspected exact source diffs, literal-parser bounds/duplicate/accessor refusal, subprocess argument ownership, fixed historical tree identity, manifest hashes, unchanged security guards and preserved browser assertions. Local Chromium was not launched because the managed environment blocks its required socket behavior. No hosted or device qualification is inferred from local unit/build results. Nine optional packages remain separate source PRs; this local composition does not activate them in the default application.
