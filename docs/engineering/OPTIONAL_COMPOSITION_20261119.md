# All-nine optional source composition qualification — 2026-11-19 series

## Result and immutable source

**PASS for the executed local composition qualification.** The combined source passed the full available npm suite with **2,553 tests passed, 0 failed, 0 skipped, 0 cancelled, and 0 todo**. All nine package subtrees equal their published and independently reviewed heads. The default build's **13 emitted files are byte-identical** to the preserved generation2 reference. The only conflict resolutions combined package commands; no package source repair was necessary.

| Binding | Exact value |
| --- | --- |
| Base, PR #190 | `2b23ee614ff2dd05bd3a6e79f1278658c30a3909` |
| Qualified merge source | `a2f90cbdac973843e1dc71fe078e9433d66cfa75` |
| Qualified source tree | `aa285f9a8546b1c78bb0bca51c2bc350874b063b` |
| Local qualification branch | `codex/optional-composition-20261119` |
| Working directory for every command below | `/workspace/scratch/6bd6e00af1c0/p2p-offramp-optional-composition` |

The source above remained unchanged throughout the recorded executions. This report is added afterward in a report-only commit; it does not change the qualified executable source. The branch provides local integration evidence while publication remains one optional package per PR. Shared consolidation ledgers remain outside this change.

## Published inputs and independent-review identity

Each published input includes its package qualification and independent review reports. Equality was checked against both the published package subtree and the independently reviewed local source, including the repaired privacy-policy source.

| Package / PR | Published head merged | Equal package subtree in composition |
| --- | --- | --- |
| proof-inputs / #191 | `61f0c6c05d245c4cc7524852224d00693929df3c` | `8ce13a63a8df82b00cea3405d246babfe7f89746` |
| liquidity / #192 | `0fb8452cb38c835e9dccb660f63f6af3156c9f91` | `ef4dace6c26423b61d98c6012e54ab56d714428e` |
| arbitration / #193 | `f7bd867bc1ee15854b36ba268cedc275c2429c28` | `f6a8051adf0c1adeb5b655240ad478c58fac1ac6` |
| privacy-policy / #194 | `a419b420dcee58ce99391a0f73289aa28dc6413b` | `5ab375b6f3b5520bd6059ff858f48699edf53aca` |
| courier / #195 | `8ff5f5c23dcdda88f79d8f54056515635f0b65a1` | `276211811104349ad9431dae3f64f3ea83c299b6` |
| meetup / #196 | `4bc4c7e2833b6b8540b8586624fb1697817e02e2` | `a3fd556fb78cfbf8c0546068db657c4c69a7c9c7` |
| privacy-controls / #197 | `86952b1ccc8eb9c25a3be05d6a32d3c556df8c84` | `21480b1081bf720b21afa8277f2bfe99208790cc` |
| stealth / #198 | `8e46f3ccf6348a953cef177a4ffd6abfb971c31b` | `0a24172c193fc3f7c2f7fd8967f107e2e37b5f73` |
| proof-jobs / #199 | `e7e1aa90072f4b0376820f0e9b28e609707de74f` | `4be7a4564974f96d8396f4901fbeb63789eaed75` |

| Package | Independently reviewed local head | Composed subtree comparison |
| --- | --- | --- |
| proof-inputs | `1eac87a0f604d8903daba6a26a761f005e87b89e` | Equal |
| liquidity | `02e75bf2c7980ac5203a226e6ac23b2b55d296af` | Equal |
| arbitration | `ecbefff46a46ec3608c7c0eac32a5485412d0007` | Equal |
| privacy-policy | `8b04cfc3a03c3bd82618244bba775633174ffb45` | Equal |
| courier | `e7f54bdaf35b0112de0eaaf920e1c143fb7e90fb` | Equal |
| meetup | `e6661b1f103def15c0c019e5a095b8f430facb90` | Equal |
| privacy-controls | `fe14b8f0b4e5be083e886d0c22dd27959423c9e1` | Equal |
| stealth | `ef482997ef75b529e397b171a09a61d72bd4d77d` | Equal |
| proof-jobs | `92d687750062f5b3a68c52a9476eccdcf37b5cdd` | Equal |

## Merge scope and preserved gates

Only two merges conflicted: privacy-controls and proof-jobs, both in `package.json`. The resolutions parsed both sides, verified identical values for all common commands and all non-script fields, and retained the union of commands. All **52** base commands retain their exact values; the composition contains **58** commands. The six additions are:

| Command | Exact script |
| --- | --- |
| `typecheck:proof-inputs` | `tsc --noEmit -p packages/proof-inputs/tsconfig.json` |
| `test:meetup:browser` | `node packages/meetup/test/origin-ledger-browser.mjs` |
| `test:privacy-controls:browser` | `node packages/privacy-controls/test/native-browser.mjs` |
| `test:proof:memory` | `node packages/proof-jobs/test/node-wasm-memory.mjs` |
| `test:proof:browser` | `node --import ./scripts/test-support/register-tsx.mjs packages/proof-jobs/test/browser.mjs` |
| `typecheck:proof-jobs` | `tsc --noEmit -p packages/proof-jobs/tsconfig.worker.json && tsc --noEmit -p packages/proof-jobs/tsconfig.fixture.json` |

The foundation workflow merged without a manual resolution. Its only additions are the proof-inputs custom typecheck, the meetup native-browser step, and the privacy-controls native-browser step, with the existing `P2P_CHROMIUM` setup retained. Removing these additions reproduces the base workflow byte-for-byte. All five other pre-existing workflows are unchanged. The added `.github/workflows/optional-proof-jobs.yml` is byte-identical to reviewed PR #199 and retains its dedicated Worker/fixture TypeScript, Node/WASM, and Chromium checks.

The source audit covers **174 changed paths** before this report: the nine package directories, their qualification/review reports, the root command union, and the additive workflow gates. `apps/`, `contracts/`, `scripts/`, `package-lock.json`, non-script package metadata, dependency declarations, and source outside the nine package directories remain unchanged from the base. No default application or Worker imports were added. The audited merge sequence and its two conflict resolutions are recorded in `optional-composition-merges.json`.

## Executed commands and observed exit codes

These are actual executions on the qualified source. Exit codes were observed at process completion; the command groups ran sequentially with fail-on-error behavior. Counts below come from the individual runner summaries. In particular, **2,553 is the full runner's observed total**, not a sum of individual PR results. No broad suite was repeated during report finalization.

The full-suite command was:

```sh
FOUNDRY_BIN=/workspace/scratch/6bd6e00af1c0/toolchain \
FOUNDRY_SOLC=/workspace/scratch/6bd6e00af1c0/toolchain/solc-0.8.30 \
npm test
```

Its maintained script was:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=4 packages/*/test/*.test.mjs apps/web/test/*.test.mjs scripts/tests/research-evidence.test.mjs scripts/tests/npm-registry-signatures.test.mjs
```

Log names in the following table have prefix `optional-composition-` and reside in the evidence directory recorded below.

| Executed command | Exit code | Observed result | Log suffix |
| --- | --- | --- | --- |
| Full-suite command above | 0 | 2,553 passed; 0 failed/skipped/cancelled/todo; duration 245457.647485 ms | `full.tap` |
| `npm run typecheck` | 0 | All four maintained TypeScript configurations passed | `typecheck.log` |
| `npm run typecheck:proof-inputs` | 0 | Dedicated proof-inputs configuration passed | `proof-inputs-typecheck.log` |
| `npm run typecheck:proof-jobs` | 0 | Dedicated Worker and real-App fixture configurations passed | `proof-jobs-typecheck.log` |
| `npm run test:proof:memory` | 0 | Actual Node Worker/WASM linear-memory cap check passed | `proof-memory.log` |
| `npm run check:boundaries` | 0 | 300 production source files; core graph visited 140 modules | `boundaries.log` |
| `npm run test:build-policy` | 0 | 54 passed; 0 failed/skipped/cancelled/todo; duration 15445.311272 ms | `build-policy.tap` |
| `npm run test:tooling` | 0 | 36 passed; 0 failed/skipped/cancelled/todo; duration 29911.230385 ms | `tooling.tap` |
| `node apps/web/scripts/build.mjs` | 0 | Default static build completed; typechecks were executed separately above | `build.log` |
| `npm run check:docs` | 0 | Engineering consistency true; 6 claims, 7 documents; no stale claims or documents | `docs.log` |
| `npm run check:governance` | 0 | 12 checked, all historical, 0 pending; evidence manifest current | `governance.log` |
| `npm run check:specs` | 0 | 173 spec documents; 0 broken links; no unindexed documents | `spec-audit.log` |
| `npm run test:specs` | 0 | 32 Python tests passed in 11.873 seconds | `spec-tests.log` |

There are **seven TypeScript configurations** across the three typecheck commands. The actual WASM check reported initial memory of 65,536 bytes, a 268,435,456-byte maximum, refusal to grow beyond that maximum, zero imports, and `nativeWorker: true`. Its module SHA-256 is `c834f277a5fac1646aad76810a65d523046ffa04f0c985bf987695fbbd6bcbed`. Its `browserQualified`, `devicePeakMemoryQualified`, `providerApproved`, and `proofVerified` flags remain false. This is linear-memory evidence; the static boundary check likewise does not establish complete runtime isolation.

The docs receipt remains `dirtyDraft: true`, `semanticApproval: false`, `published: false`, and `approvedRelease: null`. Governance retains the existing immutable evidence binding `8649b7a1994ec21fe5557179d44e861b746bcda8`, with 57 rows (12 owned and 45 bound) and 13 stale non-owned historical references explicitly reported. Its authority remains `inert-record-only`, with `economicPreparationAllowed: false`. The spec categories remain 171 design-review-pending, one catalog, and one planning document. Passing these checks does not promote their authority or readiness state.

### Execution environment

The execution environment was Node 24.22.3, npm 11.19.1, and Python 3.12.14. Dependencies were copied into this isolated worktree without an installation or upgrade. The verified tool paths used Foundry forge/cast 1.5.1 (`b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2`) and solc 0.8.30 (`0.8.30+commit.73712a01`). The solc binary SHA-256 was `f3e987dc6ecebd4bd350c48edcbc320b46cf9e3109bd3fc3d88f1acaf4c428f7`, matching the repository's pinned checksum. The available Foundry archive SHA-256 was `73640b01bd9ed29fdb4965085099371f8cf0dbbec3e2086cf54564efc4dcfe88`. The full npm execution above used the supplied tool paths; this report does not claim a separate fresh contract-suite execution.

## Default artifact comparison

The fresh composed default build was compared with the preserved 13-file hash manifest from the qualified arbitration default build, which had already been byte-compared with the coordinator's generation2 default output. The reference was preserved before the composition build. All 13 path sets and hashes match, with no differences. The build receipt counts 12 public files and 715,318 bytes; the complete comparison includes its emitted build metadata as the thirteenth file.

The document, vault Worker, and QR Worker dependency graphs contain none of the nine optional packages. The six scanned metadata files (`local-build-evidence.json`, `core-graph-document.json`, `core-graph-worker.json`, `qr-graph-worker.json`, `content-policy.json`, and `third-party-licenses.json`) also have no optional-package hits. The default output retains `localStaticBuild: true`, `syntheticDemo: false`, `signedRelease: false`, and `releaseAcceptance: false`.

| Emitted path, relative to `apps/web/dist` | Equal SHA-256 in composed build and preserved reference |
| --- | --- |
| `_headers` | `9e80afba810ea8db85ab27c8eb231aa294884197614c0236d1319085d7b56ee1` |
| `assets/OfflineRoot-DuRsKSMI.js` | `2bdc1058c5ed4400aaabd4b74d19de512a09438f8ef9074ffe98b251842431c5` |
| `assets/decode.worker-DGcSBxfL.js` | `ad0ef65d9c94c186d2734390499811d003a77818e3b2ebc049528d425e56f5ef` |
| `assets/index-BIlszxx3.js` | `5095947ce20fcd4c738a58dba427120c493b98a287ebdb9a082dbb8c8262bd87` |
| `assets/index-MQunfNpA.css` | `f0c8bbd13617b1a1eb74815028de2f96626c19ebc1aae609d6cc29f903a86098` |
| `assets/vault.worker-DeA1P_KX.js` | `f5320c214603cd4e36e673d4c0212ed16230131c77b5fb6708cbf1abb8601c3e` |
| `content-policy.json` | `0794c4ac577faa97424f0d7a56ab234d910491810ceba30e6eb34b54736a8f9b` |
| `core-graph-document.json` | `09ffd653b231f55a063800b1c14a3201735bdce5ab05cf564c842cf43342d4d9` |
| `core-graph-worker.json` | `430b53f569726ae648d5571f757d8305163cf85add79baa7ab0afad9b8462fd1` |
| `index.html` | `c331806e97bf5677250b5821d5b5695e824ffc6ab3981ff2f3567db1181d49d2` |
| `local-build-evidence.json` | `0b2e97395b54bdfab807c6e4395e9ef32ecbb4df37364e7e8b25bbe2bd9cb003` |
| `qr-graph-worker.json` | `2ac8e09215fa502063726b0e10c0091585dd710c9b507d9bbadaa142036e53ce` |
| `third-party-licenses.json` | `acf888ada680137d8da6331000eae95a49224f77f8acf718a0099cde8f5e66ca` |

## Independent review and limits of this result

The coordinator separately reviewed the exact source/command/workflow union at the qualified merge head and recorded no open High or Medium integration findings in [the independent composition review](https://github.com/djshellshoxxx/p2p-offramp/blob/de7c385937dbed27620ab07baf1dc7210f39b700/docs/engineering/OPTIONAL_COMPOSITION_INDEPENDENT_REVIEW_20261119.md). That independent review and this executing worker's results have separate attribution.

The local result establishes compatibility of the reviewed optional source with the maintained suite, checks, and default artifact. Actual browser execution remains hosted; no local browser or socket-policy bypass was used. Dedicated browser and custom Worker gates remain preserved. Individual PR CI results are not attributed to this composed tree. No deployment, release, provider, financial, or credential authority is created by this qualification. No remote write or shared-ledger edit was made by this composition task.

## Evidence files and source/log binding

The following completed run logs and audit manifests are located at `/workspace/scratch/6bd6e00af1c0/verification/`. They are execution artifacts outside the repository; their exact content hashes are preserved here. `optional-composition-source-audit.json` binds the qualified base/head/tree, all nine published and independently reviewed subtrees, command union, path closure, and workflow equality. `optional-composition-merges.json` records the nine source inputs and local merge commits. The artifact-comparison and generation2-reference manifests bind the file hashes above. All command logs listed here were produced from the immutable qualified source specified at the start of this report.

| Evidence file | SHA-256 |
| --- | --- |
| `optional-composition-full.tap` | `d80cb2293a85b22e3618dce1e48ed797394bc8a1e8ab32a9dcd8c8abfd842903` |
| `optional-composition-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `optional-composition-proof-inputs-typecheck.log` | `1e305eb1bfb14f1b5f68a29cd70d3d9dd040f5dd119fbbc45d75ca92a7e97e00` |
| `optional-composition-proof-jobs-typecheck.log` | `01003589ca24dff5de5e5b62865f20ccb201f4b2a147d91fe1299cd36dfacfb0` |
| `optional-composition-proof-memory.log` | `c23b861046b8c4db97b176c6021d6defd6cc8163dd0f3a89be90a2536e8cf805` |
| `optional-composition-boundaries.log` | `a944fc8a95ecff4212e15f25f2fd2640826b9181bb575537268ac67c0b29ed90` |
| `optional-composition-build-policy.tap` | `4263e77d6f024ef15fffbca476fe3682b93b14ea4488374e2c5e6b58390b3b55` |
| `optional-composition-tooling.tap` | `92bf3d7d77eab4715c19796ad2b14af59f9ffb4d411bcb1cba34a0938567a299` |
| `optional-composition-build.log` | `d2f15f4a326aff0a9e5ba646c09da9f3a398834aee9fb8402aa6d045e87fa63e` |
| `optional-composition-docs.log` | `ac8481319318f368052ce8cb10fe5d9c1bff19aae21e0bb7fdbadd898fb68c47` |
| `optional-composition-governance.log` | `42f9556636da25ed29969162b2b491dc3b013911d5d1488a709864b931dd7194` |
| `optional-composition-spec-audit.log` | `25a3cbad6db1d8c778d8964481e666c962f5802d482d42d41ea0945dcd4290b9` |
| `optional-composition-spec-tests.log` | `07ac734ffb9a327db8420c6d83d5b550ec3b9df94fd491aef0efc215e28d432d` |
| `optional-composition-source-audit.json` | `fa50af9204c3168e9da269824e2ab9f8e2deabbcb986961b098526ab6adb41cd` |
| `optional-composition-artifact-comparison.json` | `f5ba73d4cdcbb6c8f6e20880db1009b22aba8d0a2ba6354ce402e1f8c2db1e52` |
| `optional-composition-generation2-reference.json` | `fb9cd3ce27d9ac680bcbcfddcfda32a6efde688494dd18ab13460a081264f7f8` |
| `optional-composition-merges.json` | `66206c736c2cb3b899725e6b667fb2ef4de02fcab8208254b805ff72f29198c8` |
