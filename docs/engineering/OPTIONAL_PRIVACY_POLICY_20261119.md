# Optional privacy-policy extraction — November 19, 2026

## Identity and accepted scope

- Stable task: `EXTRACT-OPTIONAL-PRIVACY-POLICY`.
- Source PR: [#148](https://github.com/djshellshoxxx/p2p-offramp/pull/148), exact head `7c1f3441fcaa45f076957633b2005bd5c1e25e9e`.
- Integration base: `ac9a4b0ffc3ca50a299398e72554e7964a634cd4`.
- Initial extraction commit: `066508b4926a38fcbf73b38f04315972b9d10255`, tree `9ca15b9c3aa83cd27dcb2f11b9d55045645ce8b8`.
- Initial package subtree, identical to the original source: `3d85dc5a444f5546f966d778da14c22eab3a260d`.
- Regression-only RED commit: `613328a4773d58bce856926df3bcc257ac6e7ece`.
- Repaired source commit: `599fb729d4c02b7a50746268454ec9208bd8e2a8`.
- Repaired source tree: `3f7938309474fd7789129c1790b237cf721933a5`.
- Repaired package subtree: `5ab375b6f3b5520bd6059ff858f48699edf53aca`.
- Isolated branch: `codex/optional-privacy-policy-20261119`.

D7's canonical accepted-decision index records the November 18 supersession of earlier parking: optional source is accepted as one package per PR with import-boundary checks. This extraction does not authorize default application wiring.

Inert policy parsing, plan evaluation and scoped mode orchestration over constructor-owned G05/G14 services. The application does not import it. Configuration prerequisites never grant economic authority; provider catalogs and browser privacy qualification remain separate.

Only `packages/privacy-policy/` was recovered from the historical branch. No whole old stack or superseded application code was merged. No root script, workflow, configuration, dependency or lockfile change is needed: maintained `npm test` and the root TypeScript source glob already include this package.

## Source review

The initial extraction was byte-identical to the accepted source subtree and passed its existing 21 tests. Subsequent independent review found a Medium final-plan consistency defect. The repaired source changes only `src/plan.ts`, adds `test/atomic-pruning.test.mjs`, and documents the behavior in the package README. The other original package files remain byte-identical. Existing hostile-input, authority and boundary cases remain intact.

The package's existing static isolation suite probes forbidden imports, re-exports, dynamic imports and configurations, checks the actual tracked repository, and verifies that the maintained import-boundary scanner rejects this optional package from a default entry graph. These checks have explicit static limits; the default emitted build was also examined below.

## Independent finding and local repair

The evaluator checked atomic G14 manifests and dependencies before pruning unused dependencies. A real two-capability module could therefore be admitted with one required capability while its companion, initially selected only as a dependency of an unavailable optional module, was subsequently disabled. The controller still initialized the complete two-capability module and reported active preparation. This was an actual local configuration/activation defect; the package remains unwired and no production provider activation or peer exploit was demonstrated.

The new regression uses the actual `createExtensionRegistry`, `createModeController`, and G05 fixture broker. With a required `local:primary`, its atomic `local:companion`, and missing optional `local:absent` depending on the companion, the unrepaired controller initialized the paired module despite the final plan disabling that companion. The tests also cover an optional primary and a consumer/dependency cascade. The valid control explicitly retains both atomic capabilities and requires exactly one module initialization.

The repair moves orphan pruning into the existing monotonic group/dependency closure and marks a pass changed when pruning disables an enabled node. A subsequent pass rechecks atomic siblings and downstream dependencies, then removes newly orphaned dependencies. Every changing pass removes at least one enabled node, so there are at most 64 changing passes over the bounded catalog and no external work or retry in that loop. Disabled or blocked nodes are never promoted and no authority is added.

The required-primary case now returns `UNSUPPORTED_PROVIDER` before any native initializer runs and keeps preparation frozen. With wholly optional affected modules, core-only preparation remains active while those modules and newly orphaned dependencies never initialize. An explicitly retained complete pair continues to initialize once. Native custody, preflight, consent, economic-authority and exit behavior are unchanged.

| Regression checkpoint | Result |
|---|---|
| RED `613328a4773d58bce856926df3bcc257ac6e7ece` | **1 passed / 3 failed**: each adverse case demonstrated actual unwanted initialization; the explicitly retained-pair control passed |
| GREEN `599fb729d4c02b7a50746268454ec9208bd8e2a8` | **4/4 passed**, zero failures or skips |

Reproduction command at either checkpoint: `node --import ./scripts/test-support/register-tsx.mjs --test packages/privacy-policy/test/atomic-pruning.test.mjs`.

## Executed verification

Node `24.22.3`, npm `11.19.1`. Each worktree uses a physical copy of the generation2 pinned dependency installation, not a symlink. No package installation, lockfile or version change was introduced by this extraction.

| Check | Result |
|---|---|
| `node --import ./scripts/test-support/register-tsx.mjs --test packages/privacy-policy/test/*.test.mjs` | **25/25 passed** on the repair, zero failures, cancellations or skips; includes the original 21 cases, four regressions and package isolation |
| `node --import ./scripts/test-support/register-tsx.mjs --test packages/extensions/test/*.test.mjs packages/transport/test/*.test.mjs` | **56/56 passed**, zero failures, cancellations or skips; adjacent native G14/G05 behavior |
| `npm run typecheck` | All four maintained TypeScript projects passed |
| `npm run check:boundaries` | Passed: **238 production files / 140 core entry modules** |
| `npm run typecheck`, followed by `node apps/web/scripts/build.mjs` | Both maintained build stages passed on the repair with the default static profile |
| Emitted document, vault Worker and QR decoder graphs | Respectively 91, 26 and 4 source modules; **zero `privacy-policy` imports** |
| Emitted bytes compared with the generation2 default artifact | All **13 regular files** byte-identical, including generated evidence |
| Original versus recovered package subtree | Exact initial identity; final differences limited to the three repaired/documented package paths listed above |
| `git diff --check` | Passed |

The complete sorted mapping of output relative paths to SHA-256 digests hashes to `31442e38d1f0e8d3d8a3b41d2a197b1716c1241acce678b1b348ae3f0e435519` when serialized as compact JSON with sorted keys. The generation2 base's default artifact was the comparator. This checks emitted-byte identity and does not imply browser, native-device or production privacy qualification.

## Hosted status and review boundary

The original PR head above was read during this extraction. Its seven original required Actions contexts and CodeQL checks were completed successfully; its GitHub reviews array was empty. Those checks qualify that historical head only. The repaired source was handed back to the independent reviewer for closure of the reproduced Medium finding. Integration still requires the final exact head's hosted checks and independent review under D8. This report is implementing-worker evidence, not an independent review.

No actual browser, chain transaction, deployed-host behavior, production proof/provider, release, funds, credentials or settings action was performed. The larger generation2 baseline's 2,152-test full suite is separate evidence and was not rerun or relabelled as this package's full combined result.

## Local evidence digests

The following logs are transient execution evidence; this repository report preserves their commands, results and SHA-256 digests. The original baseline remains separate from the post-repair results.

| Log | SHA-256 |
|---|---|
| `optional-privacy-policy-baseline.log` | `c1dee2c8b462542bc835f111e2155c87f7eeca238e10447d29d8379c5f70f403` |
| `optional-privacy-policy-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `optional-privacy-policy-boundaries.log` | `641bb7a0bcdfc9d521ae1e031197b1f2128be6d411f2d933f1ccd9a530f0cc95` |
| `optional-privacy-policy-build.log` | `0a7fe1debfa728d5de2cf1c1690a0430e757ea4005c5b0c9daf29c994b72fd5f` |
| `optional-privacy-policy-atomic-red.log` | `12e7c67c90425ee7f8b69639c1050aa4aa6ce1770c4f5d5f0bdddeeb36037921` |
| `optional-privacy-policy-atomic-green.log` | `f0125c8986f546fa9e83b43ef5ac0aba8433de08f4bc2292e64f54dc621941d5` |
| `optional-privacy-policy-repair-package.log` | `d527d9ae2b6d6558111b92427f03966e093816d252ec1cee1062293d0844d004` |
| `optional-privacy-policy-repair-adjacent.log` | `139a8d5dda6cc3c29f119de3128d61df4e8bb8760fc4e07177ed94a2dd25777a` |
| `optional-privacy-policy-repair-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `optional-privacy-policy-repair-boundaries.log` | `641bb7a0bcdfc9d521ae1e031197b1f2128be6d411f2d933f1ccd9a530f0cc95` |
| `optional-privacy-policy-repair-build.log` | `c04a5d9bde5f75c3d886b973a4dba852c6e822189c7f2bb802ecf7ccaba5355f` |
