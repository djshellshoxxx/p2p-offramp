# Optional proof-jobs extraction — task date 2026-11-19

## Exact source and allowed scope

- Integration base: `ac9a4b0ffc3ca50a299398e72554e7964a634cd4`.
- Original single-package PR: [#162](https://github.com/djshellshoxxx/p2p-offramp/pull/162), source `8decf7f95fd5deb17f814b80deb34f2903fe8e14`.
- Recovered source checkpoint: `4fbc7feb900ae98cd02c3c3339606386b215ad09`.
- Branch: `codex/optional-proof-jobs-20261119`.

The complete package subtree and dedicated `.github/workflows/optional-proof-jobs.yml` byte-match the original source. Three existing custom qualification scripts are appended to the current package scripts; no historical root package or workflow is restored wholesale. D7's canonical accepted-decision index supersedes the original parking decision on November 18 and permits this independent package extraction. Default application wiring remains outside this source change.

## Behavior and review

The public factory has an empty provider registry and refuses unsupported providers before inspecting request data or calling a collector. The internal constructor-owned runner covers public conformance bytes only: finite message/byte/time budgets, one physical admission slot, opaque single-use consent, cancellation, heartbeat/deadline checks, owned buffer cleanup and actual termination acknowledgement. Outputs remain unverified and carry no receipt or economic authority. No TLS/circuit/notary provider, proof verifier, wallet, storage, transport grant, trust root or release capability is added.

The default application and its vault Worker do not import the package. A separate test fixture composes the current real App and an isolated public resource Worker for hosted qualification; the dedicated workflow is preserved with read-only repository permissions. All maintained root commands are preserved.

Direct diagnostic reads in the resource supervisor were traced to `parseWorkerReply`, `parseBudget` and `copyJobBytes`: these functions reconstruct their own fixed `CoreResult` objects through `checked`, rather than returning an injected vault adapter's failure wrapper. No equivalent external returned-diagnostic defect was found, and no production source repair was made in this extraction.

## Executed qualification

Node `24.22.3`, npm `11.19.1`, existing pinned repository dependencies copied physically into this isolated checkout.

| Check | Observed result |
|---|---|
| `node --import ./scripts/test-support/register-tsx.mjs --test packages/proof-jobs/test/*.test.mjs` | 30/30 passed; zero failures or skips, including optional and authority isolation |
| `npm run typecheck` | All four maintained TypeScript projects passed |
| `npm run typecheck:proof-jobs` | Both dedicated Worker and real-App fixture configs passed |
| `npm run test:proof:memory` | Actual Node Worker and WASM probe passed: 65,536 initial bytes, 268,435,456 maximum bytes, further growth refused, no imports |
| `npm run check:boundaries` | Passed; see exact output below |
| `node apps/web/scripts/build.mjs` | Default artifact passed; all 13 emitted files are byte-identical to the generation 2 default artifact; zero proof-jobs modules in document, vault or QR graphs |
| `git diff --check` | Passed |

The WASM module digest is `c834f277a5fac1646aad76810a65d523046ffa04f0c985bf987695fbbd6bcbed`. The probe qualifies this module's linear-memory maximum in Node, not browser WASM, total process memory, device limits or a proof provider.

Boundary output: `PASS: 240 production source files; core entry graph visited 140 module(s). Static boundary checks do not prove runtime isolation or complete the bundler graph.`

## Hosted evidence and remaining gate

The original immutable PR #162 head reports all seven original required contexts and its dedicated proof-jobs job successful; the review endpoint returned no reviews. Its dedicated historical job is [135438437981](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44488664472/job/135438437981). Those original-head outcomes do not qualify the new combined base.

The present local environment cannot launch Chromium because of its socket policy. Neither the public-resource browser harness nor current application/browser composition was executed here. The restored dedicated workflow must qualify this extraction's exact published head. Its native physical-close observations remain fixture-only; no standard-browser hard physical-close guarantee or production proof implementation is claimed.

## Reproducible log digests

The execution logs are transient; these hashes and commands preserve the reviewed observation, not a claim about future heads.

| Log | SHA-256 |
|---|---|
| `optional-proof-jobs-baseline.tap` | `f55283a6c705b5722ca6d6090e500f61ae051d8d85b01585f173b87b1d670507` |
| `optional-proof-jobs-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `optional-proof-jobs-custom-typecheck.log` | `01003589ca24dff5de5e5b62865f20ccb201f4b2a147d91fe1299cd36dfacfb0` |
| `optional-proof-jobs-memory.log` | `c23b861046b8c4db97b176c6021d6defd6cc8163dd0f3a89be90a2536e8cf805` |
| `optional-proof-jobs-boundaries.log` | `38416e9ef2b8bc0ecf6c97064b760b6aface152afbe169ea7b41b2ef87671af0` |
| `optional-proof-jobs-build.log` | `f9651b3c116928b86e4b0786e2fe637a99354b09bca2951ba753f024367d5dbb` |
