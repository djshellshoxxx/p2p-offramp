# Changed-lock input verification regression

Base: PR [#155](https://github.com/djshellshoxxx/p2p-offramp/pull/155), branch
`nodata/youthful-maxwell-uwy8hx-b4-intake`, exact head `9f03e0e014bd999c266eee944e46e9be002bdcfc`.
This successor changes the existing input-verification test and records its evidence. It preserves the parent
branch's ancestry and changes no evaluator code, retained production pins or qualification state.

## Problem and completed plan

The test named "input verification refuses changed lock" wrote `{}` to both the package and lock files without
ever changing the lock. Verification checks the package digest first, so the test passed on that earlier failure.
Removing lock verification still left the original test green.

The repaired test follows this sequence:

1. Create public synthetic package, lock, artifact and installed-source bytes. Parse corresponding test pins with
   the real pins parser, preserving all non-null installed-source paths and their digest checks.
2. Require the complete fixture to pass `verifyEvaluationInputs` before any refusal assertion.
3. Change one byte in the lock file, retain the package and all other inputs, and require the exact
   `SEMAPHORE_INPUT_DIGEST` rejection.
4. Restore only the original lock bytes and require complete verification to pass again.
5. Verify the existing absent/extra artifact cases independently with otherwise valid input bytes.

The synthetic artifact and source bytes are used only for input verification. They are not executable
dependencies or valid proof artifacts, and do not claim upstream package or prover qualification.

## Mutation evidence

A temporary Node loader removes only the lock pair from the production package/lock verification loop in memory.
No production file is edited by that experiment.

| Test version | Normal verifier | Lock-check-removal mutant |
| --- | --- | --- |
| Original #155 test | 1 passed | 1 passed; mutation survived |
| Repaired test | 1 passed | 1 failed at the expected digest-refusal assertion |

The failing mutant reports `Missing expected rejection` for `SEMAPHORE_INPUT_DIGEST`, after the positive fixture
check succeeds. This demonstrates that the regression reaches the lock guard rather than an earlier input error.

## Validation

| Gate | Result |
| --- | --- |
| `npm test` | 1,654 passed, 0 failed, 1 existing Foundry-dependent skip |
| `npm run test:reputation:intake` | 8 passed |
| Focused input-verification test | 1 passed |
| Independent focused/mutation rerun | Normal 1 passed; mutant 1 failed as intended |
| `npm run typecheck` | All four TypeScript projects passed |
| `npm run test:specs` | 28 passed |
| `npm run check:specs` | 173 specifications; 0 broken links or unindexed files |
| `npm run check:boundaries` | Passed: 162 production source files, 66 core modules |
| `npm run check:docs` | Engineering consistency passed; no semantic approval or publication |
| `npm run test:tooling` | 19 passed |
| `npm run test:build-policy` | 29 passed |
| `npm run build` | Static release-disabled build passed |

The skipped test compares calldata with `cast calldata`; Foundry is not installed in this environment.

Independent source review found no remaining findings in the final test blob
`44fce4632eee82ae333530ed5d2bfe328f4ecf9c`. The evaluator blob remains
`19ca4cb668e4d029f9aca828d391bea6ed09e1e4`, and the retained pins blob remains
`a39806c99e69d303c2cc6e9356fdf7ea7f90cec4`.

The separate owner decision about verified input isolation versus evaluator archival remains open. This test-only
repair does not decide it or qualify an evaluator run, Docker proof, dependency execution or network operation.
