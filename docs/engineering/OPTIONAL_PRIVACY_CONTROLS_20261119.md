# Optional privacy-controls extraction — task date 2026-11-19

## Exact source and allowed scope

- Integration base: `ac9a4b0ffc3ca50a299398e72554e7964a634cd4`.
- Original single-package PR: [#160](https://github.com/djshellshoxxx/p2p-offramp/pull/160), source `30a38a607a48c630c0eec2aecc2f3a5e49ab7d22`.
- Exact extraction checkpoint: `28105bd48f038051ed22b105145914af21004f8f`.
- Reproduced failing regression: `1d57d9243f4770cc0156b9c976f1cad581d1cfda`.
- Narrow source repair: `c53410eaf3f4b46b6428063bc539f2dbe4f0721e`.
- Branch: `codex/optional-privacy-controls-20261119`.

The extraction checkpoint recovers the complete package subtree byte for byte. It appends the existing `test:privacy-controls:browser` command and its actual Chromium step to the maintained browser job. No old root package or workflow is restored wholesale, no maintained gate is removed, and no redundant unit/typecheck aliases are added. D7's canonical accepted-decision index supersedes the original parking decision on November 18 and permits this independent source extraction. Default application wiring retains its separate gate.

Only `src/shared.ts` and `test/sweep.test.mjs` differ from the original package after the repair described below. Dependency pins, native G02 vault implementation, runtime/trust boundaries and default App/Worker composition remain unchanged.

## Behavior and source finding

The package implements separately encrypted decoy profiles, explicit local duress policy state and local sweep plans/reminders. It uses the existing authenticated G02 lease, revision and compare-and-swap contracts. It provides no hidden credential detection, wallet adapter, timer-driven transfer, signing or transaction authority. Sweep output always requires fresh review and retains `executionSupported:false`; decoy output retains `walletAuthority:false`. The default application does not import the package.

The returned-vault failure mapper previously read `result.error.code` directly. A returned diagnostic accessor therefore executed, inherited wrapper/code properties selected specific outcomes, and a hostile reflection boundary did not produce the intended conservative fallback. This is a defensive adapter-boundary defect: the unchanged native vault currently returns its own fixed data wrappers. The regression does not establish a current imported-data or network exploit.

The regression runs through the public sweep manager with an actual native G02 vault and a substituted failing `list` reply. It covers code/wrapper accessors, inherited properties, throwing descriptor traps, unknown/non-string values and genuine own codes. It asserts zero accessor or coercion calls, unchanged encrypted rows/write count, and successful subsequent native loading to establish that physical admission is released. Before the source change, six scenarios fail (seven failed test results including the parent); both accessor scenarios explicitly observe one forbidden read. Four subcases already pass.

The repair reads only own data descriptors for `error` and `code`, catches reflection refusal, and preserves the existing exact code allowlist and authentication mapping. Unsupported diagnostics resolve to `UNAVAILABLE`. Successful results, native durability handling and admission logic are unchanged.

## Executed qualification

Node `24.22.3`, npm `11.19.1`, existing pinned repository dependencies copied physically into this isolated checkout.

| Check | Observed result |
|---|---|
| Original package on the current base | 36/36 passed before the regression was added |
| `node --import ./scripts/test-support/register-tsx.mjs --test --test-name-pattern='returned vault diagnostics' packages/privacy-controls/test/sweep.test.mjs` before repair | Expected failure: 11 results, 4 passed and 7 failed |
| Same focused command after repair | 11/11 passed; zero failures or skips |
| `node --import ./scripts/test-support/register-tsx.mjs --test packages/privacy-controls/test/*.test.mjs` | 47/47 passed; zero failures or skips |
| `npm run typecheck` | All four maintained TypeScript projects passed |
| `npm run check:boundaries` | 239 production source files; core entry graph visited 140 modules; passed |
| `node apps/web/scripts/build.mjs` | Passed; all 13 emitted files byte-match the generation 2 default artifact; zero privacy-controls modules in document, vault or QR graphs |
| `git diff --check` | Passed |

The maintained root test and TypeScript globs cover this package. The focused run verifies the failure boundary through a native consumer; it does not replace the retained browser test. Static import checks alone do not establish runtime isolation.

## Hosted evidence and remaining gate

The original immutable PR #160 head reports 11 successful checks; its review endpoint returned no reviews. Its historical browser job is [135428134895](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44485592440/job/135428134895). Those results qualify the historical source head, not this new base and repair.

The present environment cannot launch Chromium under its socket policy. No native browser result is claimed locally. The preserved `npm run test:privacy-controls:browser` step must qualify this extraction's exact published head against real documents, IndexedDB and WebCrypto. Independent source review remains a separate pre-merge check. No default emitted-App integration, Worker isolation, physical-device, release or coercion-resistance qualification is claimed.

## Reproducible log digests

Execution logs are transient; these commands, counts and SHA-256 digests record the observed runs without claiming qualification of future heads.

| Log | SHA-256 |
|---|---|
| `optional-privacy-controls-errors-red.tap` | `70dc5528c04db47ab896c85d0b9a58962f7125ec1488ee96c888924bc3b9df51` |
| `optional-privacy-controls-errors-green.tap` | `5342318ad5471face6304e7137c264a6e04673bd29ac89b7c6c0256000bf1b14` |
| `optional-privacy-controls-final.tap` | `cc808b6d913594f17408bf9ee529a29ee6d27121d5f78d8e311e10d27d505b72` |
| `optional-privacy-controls-final-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `optional-privacy-controls-final-boundaries.log` | `0e23b8056e6c5fff551130d3b5f06ca01885474ac2fbf068b3f8baa598a8ca72` |
| `optional-privacy-controls-build.log` | `a844d55ab8a453b0b567bb6a5aeb696fcf3a7efa0ad8531fa7bc320637d552e5` |
