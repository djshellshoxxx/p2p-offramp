# Generation10 complete-core optional stack — 2026-11-20

## Result and scope

Worker 39 prepared nine separate optional layers on the final generation10 core report checkpoint. One new full suite passed **2,709/2,709** with no failures, skips, cancellations or todos. All 18 serialized qualification commands passed. Fresh corrected-core default and demo builds matched all 27 optional artifact files byte for byte. This work adds no optional default wiring and no new correction count.

The tested core includes reviewed PR206, PR208, PR209, the original PR210 transport correction and PR211. The optional base also contains the author core report, core plan and independent worker 40 core review. Original PR191–199 source refs and package subtree bytes are preserved. The author made zero remote mutations, opened no PR and performed no main merge. Root owns publication and subsequent exact-head hosted observations.

## Source, report and publication identities

| Identity | Commit | Tree |
| --- | --- | --- |
| Tested core source | `49bcb0f2c63b20ac7878ba4aebd6bc433d44925f` | `81845317f8c1cfe7c76846aa54403fb49cc141b0` |
| Final local core report checkpoint / optional base | `cc178fc653611ae8b6875fa8da371b096d71ba74` | `976a729bc359d331214924abab617969aa066950` |
| Published PR210 core source | `7819b88d32375905c12681e297773c712dabe94a` | `81845317f8c1cfe7c76846aa54403fb49cc141b0` |
| Published PR210 final core checkpoint | `701f3866e60978c945c5a0148dcda5b65f58fdbc` | `976a729bc359d331214924abab617969aa066950` |
| Frozen optional source | `7dc8f486791f8f4a2fa0b9182181354e6b72f188` | `e0826f1f8824f8f1f044e161311432ace6e06254` |

The optional source was frozen at `2026-11-20T04:27:20.302334+00:00` on `codex/generation10-optional-complete-stack-20261120`. The report-only commit is supplied separately in the final author handoff, with this report and `generation10-optional-stack-plan.json` as its only changed paths. Its first parent must be the frozen optional source above.

The immutable published PR210 source and final report trees were fetched and independently compared to the tested/local identities. The first published optional layer can replace local base parent `cc178fc653611ae8b6875fa8da371b096d71ba74` with `701f3866e60978c945c5a0148dcda5b65f58fdbc` without changing the layer tree. Each later layer must use the preceding published layer as second parent. The canonical handoff must record those new publication commit identities.

Read-before-edit authority was PR200 `b01aa60a7eb893d0359449f335f1862864eec179`, tree `86c7f44cd323601ffa9817defdbcabb2ed241054`; local handoff `ac87d6f305e513237b3cefa6b25c1ee35bdecfee` had that same tree. The corrected PR207 ancestor is `df10fe26a308407237f9ccbc636c8bb61f55b84f`.

## Original source leases and package identities

The original pull heads were checked before composition and again at `2026-11-20T04:32:09.386970+00:00` after qualification. All nine remained unchanged. These are expected original source heads, not authority to update their branches.

| Original PR / package | Expected original head / first parent | Exact package subtree |
| --- | --- | --- |
| 191 / proof-inputs | `61f0c6c05d245c4cc7524852224d00693929df3c` | `8ce13a63a8df82b00cea3405d246babfe7f89746` |
| 192 / liquidity | `0fb8452cb38c835e9dccb660f63f6af3156c9f91` | `ef4dace6c26423b61d98c6012e54ab56d714428e` |
| 193 / arbitration | `f7bd867bc1ee15854b36ba268cedc275c2429c28` | `f6a8051adf0c1adeb5b655240ad478c58fac1ac6` |
| 194 / privacy-policy | `a419b420dcee58ce99391a0f73289aa28dc6413b` | `5ab375b6f3b5520bd6059ff858f48699edf53aca` |
| 195 / courier | `8ff5f5c23dcdda88f79d8f54056515635f0b65a1` | `276211811104349ad9431dae3f64f3ea83c299b6` |
| 196 / meetup | `4bc4c7e2833b6b8540b8586624fb1697817e02e2` | `a3fd556fb78cfbf8c0546068db657c4c69a7c9c7` |
| 197 / privacy-controls | `86952b1ccc8eb9c25a3be05d6a32d3c556df8c84` | `21480b1081bf720b21afa8277f2bfe99208790cc` |
| 198 / stealth | `8e46f3ccf6348a953cef177a4ffd6abfb971c31b` | `0a24172c193fc3f7c2f7fd8967f107e2e37b5f73` |
| 199 / proof-jobs | `e7e1aa90072f4b0376820f0e9b28e609707de74f` | `4be7a4564974f96d8396f4901fbeb63789eaed75` |

## Nine prepared layers and ordered ancestry

Every layer has exactly two parents: its original optional source head from the preceding table first, then the base or preceding new layer listed below. Each layer introduces exactly one original optional package scope. Existing original refs are not advanced.

| PR / package | New layer head | New layer tree | Second parent |
| --- | --- | --- | --- |
| 191 / proof-inputs | `c1a01830105e2de83342fbfe5ae186e25b84f8c7` | `42323f8ab566ce72208d9e6f91bba7b053b0bb15` | `cc178fc653611ae8b6875fa8da371b096d71ba74` |
| 192 / liquidity | `1b059bdc91097686b2c5d21eaa28ffe9d87f30d6` | `6b4c21fce978c045f87c1282a178316ca5663073` | `c1a01830105e2de83342fbfe5ae186e25b84f8c7` |
| 193 / arbitration | `8729fcad8af422ed91a84969311542d63a31c8d4` | `9037354e7f203afc614d4e038aa97cb985fde127` | `1b059bdc91097686b2c5d21eaa28ffe9d87f30d6` |
| 194 / privacy-policy | `f71b45d947a0510897b30d25d03faf06859e7f60` | `058b0a069bacff67cad52a1f042d4a2e07feb052` | `8729fcad8af422ed91a84969311542d63a31c8d4` |
| 195 / courier | `1293ae763ee8174a73f09a1370407c2051848a24` | `09d0d6864cb38534d1ea5aa5eba34693ba164322` | `f71b45d947a0510897b30d25d03faf06859e7f60` |
| 196 / meetup | `8756a903e26bde486db3bee125a6d9b01a81dca2` | `b53ba4400fbd31915a253693d6825ad92e1eb2f1` | `1293ae763ee8174a73f09a1370407c2051848a24` |
| 197 / privacy-controls | `da3acb45fff2b3d1679ad2df5e2befec5451a065` | `da6add848e50044d003bc3d23ae210f9864cd9be` | `8756a903e26bde486db3bee125a6d9b01a81dca2` |
| 198 / stealth | `615737caa784b1897ef888f89e9c71d8b50cce99` | `239eeb96261aa8dbac504957dc3627d4df608297` | `da3acb45fff2b3d1679ad2df5e2befec5451a065` |
| 199 / proof-jobs | `7dc8f486791f8f4a2fa0b9182181354e6b72f188` | `e0826f1f8824f8f1f044e161311432ace6e06254` | `615737caa784b1897ef888f89e9c71d8b50cce99` |

The companion plan records the local branch, intended per-package base, original branch, original source base and tree, generation9 delta SHA256, complete changed paths, shared-file blob identities and ordered parents for every layer. Generation6 fields and resolution labels retain historical provenance for the additive changes; this execution reapplies the exact reviewed generation9 deltas.

## Exact source preservation

The final optional delta contains 174 paths: 172 additions and two modified shared files, `package.json` and `.github/workflows/vault-foundation.yml`. All 172 nonshared original blobs and all nine original package subtrees are exact. All 2,487 core-base entries outside the two additive shared files are unchanged at every layer, including the 790-path protected source/tooling subset, all 158 existing scripts, the current financial/transport fixtures and all three generation10 core reports.

All 56 core npm commands remain byte-identical; the original package scopes add six commands for a total of 62. All 139 foundation workflow lines remain in order with seven added lines. The other five core workflows are unchanged. The proof-jobs workflow is an exact original PR199 blob. There were no content conflicts, implementation rewrites, dependency changes, gate removals or default imports introduced while composing.

The PR209 Cargo.lock correction is preserved exactly: ctutils 0.4.4 with checksum `12218662ccac37d9714f2191252553d67585b97df8c839cbe49e0bde278dc865`; all 411 other Cargo package records remain as in the reviewed source. The crypto-bigint 0.5.5 advisory RUSTSEC-2026-0387 and existing maintenance findings remain retained. This work claims no new Cargo audit, upstream dependency test or SBPF qualification, incompatible upgrade or waiver.

## Fresh execution evidence

The optional run started `2026-11-20T04:28:17.021556+00:00` and completed `2026-11-20T04:31:01.238754+00:00`. Exactly one full suite was invoked. Its reported duration was 117690.781423 ms, with 118.104044 s elapsed. Earlier 2,681 and 2,617 totals remain historical and were not transferred or added to this result.

| Command | Actual result | Raw log | SHA256 |
| --- | --- | --- | --- |
| `npm test` | 2709/2709; fail 0, skip 0, cancel 0, todo 0 | `generation10-optional-full.log` | `04fc4d28cb0b13774e85f5666cc5d0748228e7054df62b6acb169cde8fef5e54` |
| `npm run test:tooling` | 44/44; fail 0, skip 0, cancel 0, todo 0 | `generation10-optional-tooling.log` | `f2087067c3b9bad6c6dbfc2e390a90c46b7fe62ff35604b96ee3e2328b4fbbd7` |
| `npm run typecheck` | exit 0 | `generation10-optional-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `npm run typecheck:proof-inputs` | exit 0 | `generation10-optional-proof-inputs-typecheck.log` | `1e305eb1bfb14f1b5f68a29cd70d3d9dd040f5dd119fbbc45d75ca92a7e97e00` |
| `npm run typecheck:proof-jobs` | exit 0 | `generation10-optional-proof-jobs-typecheck.log` | `01003589ca24dff5de5e5b62865f20ccb201f4b2a147d91fe1299cd36dfacfb0` |
| `npm run test:build-policy` | 57/57; fail 0, skip 0, cancel 0, todo 0 | `generation10-optional-policy.log` | `2d12393c0d420a22a96c93a3dd52eda43a760abcd80239106130a3ed1363d1bf` |
| `npm run check:boundaries` | exit 0 | `generation10-optional-boundaries.log` | `62ff0a9ff83e69b28299389c00aed569fc8ea560697e46cfee47bdbd60734adc` |
| `node apps/web/scripts/build.mjs` | exit 0 | `generation10-optional-build.log` | `0d7306a28c1de94203c036c3051b4e7ed65e2c2044aee7ac5610ee1a74cc421e` |
| `node apps/web/scripts/build.mjs demo` | exit 0 | `generation10-optional-build-demo.log` | `168b08d7ddecc019279d2617355b59fda60896d887762e32b0fe775ddb65eb4e` |
| `npm run test:proof:memory` | exit 0 | `generation10-optional-proof-memory.log` | `c23b861046b8c4db97b176c6021d6defd6cc8163dd0f3a89be90a2536e8cf805` |
| `npm run check:docs` | exit 0 | `generation10-optional-docs.log` | `daf413a4cebdd09e5376e2b1c01e17243116981faa90927bdb4a9935032f02c4` |
| `npm run check:governance` | exit 0 | `generation10-optional-governance.log` | `42f9556636da25ed29969162b2b491dc3b013911d5d1488a709864b931dd7194` |
| `npm run check:specs` | exit 0 | `generation10-optional-specs.log` | `25a3cbad6db1d8c778d8964481e666c962f5802d482d42d41ea0945dcd4290b9` |
| `npm run test:specs` | 32 Python tests; OK | `generation10-optional-spec-tests.log` | `b455d0dc6fca7626cd29796e915f858bcf8c400e314469a5b4f0df5a90568f2a` |
| `node --check packages/meetup/test/origin-ledger-browser.mjs` | exit 0 | `generation10-optional-meetup-browser-syntax.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `node --check packages/privacy-controls/test/native-browser.mjs` | exit 0 | `generation10-optional-privacy-controls-browser-syntax.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `node --check packages/proof-jobs/test/browser.mjs` | exit 0 | `generation10-optional-proof-jobs-browser-syntax.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `git diff --check cc178fc653611ae8b6875fa8da371b096d71ba74 7dc8f486791f8f4a2fa0b9182181354e6b72f188` | exit 0 | `generation10-optional-source-whitespace.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

The `typecheck` command covers four existing configurations; proof-inputs adds one and proof-jobs adds two, for seven total. Boundaries checked 304 production files and 142 core-entry modules. Three optional browser harnesses passed syntax checks only. Node/npm emitted the existing unknown `http-proxy` configuration warning; commands still exited 0.

Documentation validation reports engineeringConsistency=true, semanticApproval=false, published=false, approvedRelease=null and six claims. Historical claim evidence remains stale rather than being silently reissued. Governance checked 12 historical rows, zero pending, 57 evidence rows and 13 stale references; economicPreparationAllowed=false. Specifications cover 173 documents with zero broken links and zero unindexed files; all 32 Python specification tests passed.

The native Node-WASM memory probe started with 65,536 bytes and reached its 268,435,456-byte linear-memory maximum; growth beyond it was refused and memory remained capped. The probe had zero imports. Its own fields remain browserQualified=false, providerApproved=false, proofVerified=false and devicePeakMemoryQualified=false. It does not qualify browser runtime behavior or whole-device memory.

## Fresh corrected-core artifact comparison

After optional qualification, a new author-owned detached reference worktree was created at the exact final local core report checkpoint. The author-owned physical dependency directory was moved into it for two serialized builds, then returned to the optional worktree. Both tracked source trees remained clean. This produced fresh reference artifacts and did not overwrite the retained Stage A artifacts.

| Variant | Optional files | Fresh reference match | Document / private worker / QR modules |
| --- | --- | --- | --- |
| dist | 13 | Every file byte-identical | 93 / 30 / 4 |
| dist-demo | 14 | Every file byte-identical | 95 / 30 / 4 |

The maps include `_headers`, content policy, graph documents, local build evidence and generated assets. Both fresh reference maps also equal the retained Stage A core artifact maps. Across optional and reference builds, 54 actual files are represented. No optional package appears in any graph. The four existing personalization modules remain in the private worker only; none appears in the document or QR graph. Both variants retain ReleaseEnabled=0, releaseAcceptance=false, empty connectOrigins and CSP `connect-src 'none'`.

| Fresh reference command | Actual result | Raw log | SHA256 |
| --- | --- | --- | --- |
| `node apps/web/scripts/build.mjs` | exit 0 on core `cc178fc653611ae8b6875fa8da371b096d71ba74` | `generation10-optional-reference-build.log` | `6fbab54a624e4c48f99482c5848efe7673b656431a275a9bf1cb2a693524dabe` |
| `node apps/web/scripts/build.mjs demo` | exit 0 on core `cc178fc653611ae8b6875fa8da371b096d71ba74` | `generation10-optional-reference-build-demo.log` | `bb80466a3557bfc5ee2fe927ed3dfc8042c569be04a5f35d2ec144ee825e7fe0` |

The companion plan embeds complete optional/reference artifact hash maps. `generation10-optional-artifacts.json` and `generation10-optional-reference-builds.json` bind them to both frozen source identities.

## Independent review

Independent worker 40, `/root/generation10_independent`, completed report-only review commit `079f801b0af9019bf32d03a3a8e5452659efbe1e`, tree `e3377e2d923a573ba5ae064983db51287e2de59a`, sole parent `7dc8f486791f8f4a2fa0b9182181354e6b72f188`. It adds only `docs/engineering/INDEPENDENT_GENERATION10_OPTIONAL_REVIEW_20261120.md`. Report SHA256: `8da9ac6abd52c14f8640daadae1213b9f102b2b0a8c0465a933303dd0470b868`.

The reviewer independently reconstructed the nine package scopes and ordered parents; verified the exact core report base; checked all 20 raw execution logs, 54 source/reference artifact files and 256 source graph records; and ran 16/16 maintained optional boundary tests. It checked 234 tracked reference graph records and matched the other 22 dependency records against the returned physical cache. No open High/Medium integration finding remains in that review scope. These 16 tests are separate from the author full-suite count.

An initial reviewer-only path assertion expected dependencies to remain in the reference checkout. The reviewer corrected that assertion to follow the recorded cache return; no source, author log or artifact changed. The independent report retains the same hosted/native/browser, named-service review and release limitations. Its complete binding and raw focused-test digest are in the companion plan.

## Environment and resources

The same pinned tools used for Stage A were reused: Node v24.22.3, npm 11.19.1, Python 3.12.14, Foundry 1.5.1 commit `b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2`, and solc 0.8.30. Python oracle dependencies were cryptography 50.0.0, cffi 2.1.1 and pycparser 3.00. The exact executable hashes, paths and FOUNDRY_BIN/FOUNDRY_SOLC variables are in the plan; the npm lock SHA256 is `9099553922da18ffb1847f2af0780add27c422ecdcbb00b1050503ffb2e4dd72`.

Physical matching dependencies were moved only between this author's new core, optional and reference worktrees. No node_modules root symlink was used. The optional preparation receipt recorded 961,859,584 free bytes. No other worker's source, evidence or cache was deleted. Heavy/full qualification remained serialized; the core and optional suites each ran once on their own frozen source.

## Remaining gates and accounting

This is local integration qualification. Exact proposed-source and merge-tree hosted CI, applicable browser/native financial runs, SBPF qualification where required and applicable standalone Tier B CodeRabbit or Qodo review remain scoped gates. No named-service pass, waiver, runtime browser pass, long financial test or release approval is claimed here. Historical native passes and CI conclusions remain bound to their original source trees. Root maintains subsequent published-head observations separately.

No optional bulk PR or default activation is prepared. Source integration remains one optional package per review scope after fresh ownership/lease resolution. Strict physical send counts, zero fixture errors, principal/fee assertions and actual 1,800-second refund waits are preserved. There was no deployment, release, real-funds action, settings change or remote mutation by this author.

The coordinator ledger remains 32 reproduced corrections: 31 implementation defects and one historical acknowledgment-fixture defect. Two other ledger rows and the separate dependency and transport qualification corrections remain distinct. This composition contributes zero new defects, fixture corrections or dependency remediations. Worker 39 authored the composition; worker 40 reviewed it; root owns overall worker accounting.

## Durable evidence index

The companion plan embeds the full provenance, source-preservation checks, command arguments, exact log hashes and complete artifact maps. Raw logs and scratch receipts are retained at `/workspace/scratch/6bd6e00af1c0/verification`; their content digests below allow exact verification.

| Receipt | Bytes | SHA256 |
| --- | --- | --- |
| `generation10-optional-freeze.json` | 719 | `69eb0fb435551a0a6ee13ca70356d107b01e0e859d0a016181fbebb25e9a5161` |
| `generation10-optional-layers.json` | 50388 | `118aae4a962e3a085cccc3f08293bb32d3bdf3fd921b609da7d171a3301b69d5` |
| `generation10-optional-source-audit.json` | 49363 | `4acf735c76a9c33684d82119f66fcecf4e36146b365d38bcfdb1446e97ad7b5f` |
| `generation10-optional-execution.json` | 12995 | `bdc33558a95fb2c4a7376fab1418c5afb34008a52be48a2b45c809d49b1f2f80` |
| `generation10-optional-artifacts.json` | 8368 | `64f8dde7c3fa7a3ac35090e1c5c0c34d2f08274d2ffe73ea9c6298ad2e74c21f` |
| `generation10-optional-reference-builds.json` | 1987 | `6b5720def9e393617256634f33b9b84f92751bfcff24030ccabf047400ec1c75` |
| `generation10-optional-dependencies.json` | 436 | `1a534339c9afc077b295cf1c380a5c6cf8ab9cc70d86411e62e0d06938767022` |
| `generation10-optional-live-originals.json` | 844 | `ea11d055e13ef6ebef3fb6386bb2995deee9d002f4f77e9f469ae2b8073217a6` |
| `generation10-optional-final-leases.json` | 1238 | `16ecf7a9fe786cab41c6cf5684169d2eadcd92ea617f7cb89cf0bd27b777b23d` |
| `generation10-optional-core-publication-binding.json` | 1306 | `872edbd2f851a5de3763d2c339060c2f0582bcb8e567bb6ab7c94771bfd7e65a` |
| `generation10-optional-independent-binding.json` | 1707 | `cb6fbf49ffea936234cd68357754b0b906829b0a805516d37a27291ea3636e60` |
| `generation10-environment.json` | 1726 | `49eda72a51cecafc915b0d406e65e7602703017686efb90ec1c52fbb23d0c71c` |
| `generation10-core-freeze.json` | 11984 | `715539dae7fd75733a2f89f38a6c25d3ef8aac3b74123a5c6e371f123a4aba08` |
| `generation10-core-preservation-artifacts.json` | 5297 | `9cda50e1598caecfe3687dd413127f9e22dcbcf8ecc76777703405b7a1ebb68a` |
| `generation10-core-report-binding.json` | 2049 | `8bb3501d67841fd28a957154ad9ec1eee8fc732196e18892e2720e4d46582443` |
