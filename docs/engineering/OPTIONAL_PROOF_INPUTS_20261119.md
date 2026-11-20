# Optional proof-inputs extraction — November 19, 2026

## Identity and accepted scope

- Stable task: `EXTRACT-OPTIONAL-PROOF-INPUTS`.
- Source PR: [#144](https://github.com/djshellshoxxx/p2p-offramp/pull/144), exact head `0b681ed42330b9129502eb0097783cf5995e8382`.
- Integration base: `ac9a4b0ffc3ca50a299398e72554e7964a634cd4`.
- New local source commit: `1c27ac821e54bf782a6f1f5b1e1fee51c9792af5`.
- Source tree: `f98c073b6b9b17a6dab5dccd9ad9170a574fa9f1`.
- Exact package subtree, identical at both original and recovered source commits: `8ce13a63a8df82b00cea3405d246babfe7f89746`.
- Isolated branch: `codex/optional-proof-inputs-20261119`.

D7's canonical accepted-decision index records the November 18 supersession of earlier parking: optional source is accepted as one package per PR with import-boundary checks. This extraction does not authorize default application wiring.

Detached structural proof-input parsing with bounded native buffer admission and permanently unverified outputs. Catalogs remain empty; this adds no verifier, source, provider, rail, circuit, network, receipt or settlement authority.

Only `packages/proof-inputs/` was recovered from the historical branch. No whole old stack or superseded application code was merged. The only changes outside the package and this report add the existing `typecheck:proof-inputs` command and its separate `schemas-and-crypto` CI step. The own tsconfig checks the facade as well as source. All maintained commands and gates remain intact.

## Source review

The recovered implementation, tests and package documentation are byte-identical to the accepted source subtree. Existing hostile-input, authority and boundary cases remain intact. No new source defect was reproduced in this scoped extraction, so no implementation change or manufactured regression was added.

The package's existing static isolation suite probes forbidden imports, re-exports, dynamic imports and configurations, checks the actual tracked repository, and verifies that the maintained import-boundary scanner rejects this optional package from a default entry graph. These checks have explicit static limits; the default emitted build was also examined below.

## Executed verification

Node `24.22.3`, npm `11.19.1`. Each worktree uses a physical copy of the generation2 pinned dependency installation, not a symlink. No package installation, lockfile or version change was introduced by this extraction.

| Check | Result |
|---|---|
| `node --import ./scripts/test-support/register-tsx.mjs --test packages/proof-inputs/test/*.test.mjs` | **21/21 passed**, zero failures, cancellations or skips; includes the package isolation suite |
| `npm run typecheck` | All four maintained TypeScript projects passed |
| `npm run check:boundaries` | Passed: **238 production files / 140 core entry modules** |
| `npm run build` | Passed with the maintained default static profile |
| Emitted document, vault Worker and QR decoder graphs | Respectively 91, 26 and 4 source modules; **zero `proof-inputs` imports** |
| Emitted bytes compared with the generation2 default artifact | All **13 regular files** byte-identical, including generated evidence |
| Original versus recovered package subtree | Exact tree identity shown above |
| `git diff --check` | Passed |
| `npm run typecheck:proof-inputs` | Passed; separate maintained CI step restored |

The complete sorted mapping of output relative paths to SHA-256 digests hashes to `31442e38d1f0e8d3d8a3b41d2a197b1716c1241acce678b1b348ae3f0e435519` when serialized as compact JSON with sorted keys. The generation2 base's default artifact was the comparator. This checks emitted-byte identity and does not imply browser, native-device or production privacy qualification.

## Hosted status and review boundary

The original PR head above was read during this extraction. Its seven original required Actions contexts and CodeQL checks were completed successfully; its GitHub reviews array was empty. Those checks qualify that historical head only. The recovered source commit still needs its own hosted exact-head checks and independent review before integration under D8. This report is implementing-worker evidence, not an independent review.

No actual browser, chain transaction, deployed-host behavior, production proof/provider, release, funds, credentials or settings action was performed. The larger generation2 baseline's 2,152-test full suite is separate evidence and was not rerun or relabelled as this package's full combined result.

## Local evidence digests

The following logs are transient execution evidence; this repository report preserves their commands, results and SHA-256 digests for the source checkpoint above.

| Log | SHA-256 |
|---|---|
| `optional-proof-inputs-baseline.log` | `3bf50fa3fa0ed8db3df0828baba499cdb795c70f9f9595140b64c87dd2c90c28` |
| `optional-proof-inputs-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `optional-proof-inputs-boundaries.log` | `641bb7a0bcdfc9d521ae1e031197b1f2128be6d411f2d933f1ccd9a530f0cc95` |
| `optional-proof-inputs-build.log` | `ef961f62d1c54b1ebf5165a8408ae7dc42273222524e680920982dcfa72c34cd` |
| `optional-proof-inputs-own-typecheck.log` | `1e305eb1bfb14f1b5f68a29cd70d3d9dd040f5dd119fbbc45d75ca92a7e97e00` |
