# Independent HTTP preflight-copy review — generation 11

## Result

**No open High/Medium or other actionable integration finding.** Independent original regressions produced **0 pass / 2 failures**; the identical corrected tests passed **2/2**. The maintained HTTP, encoding and policy selection passed **44/44**, including those two tests, with zero failures, skips, cancellations or todos.

This is **one Low implementation cause with two refusal variants**: an internal POST-body copy was not erased when cancellation or capacity refused admission. No network leakage, financial effect or authority bypass was demonstrated. The observed JavaScript byte-array erasure does not establish complete process-memory sanitization.

Root worker 42 reviewed independently of the external PR212 author and worker 43's later qualification. PR200 handoff/state and generation10 author/independent core reports were read first. No source/test changes, dependency installs, additional workers, remote mutations or external-owner edits were made.

## Exact identities

| Identity | Value |
| --- | --- |
| root_handoff_source | `b01aa60a7eb893d0359449f335f1862864eec179` |
| root_handoff_tree | `86c7f44cd323601ffa9817defdbcabb2ed241054` |
| base | `701f3866e60978c945c5a0148dcda5b65f58fdbc` |
| base_tree | `976a729bc359d331214924abab617969aa066950` |
| source | `540e1fe2660e0a6084600726d5f6f75fd5c1ee05` |
| source_tree | `e54743e3dd8cd7f1c8115d8692974ebe34d67405` |
| test_first | `56e1ae0fd50c40109aea3f40ce8505e85fc1a5c2` |
| test_first_tree | `08e845c7e3bb383876c551f13f36a27fc0b274ac` |
| runtime_original_blob | `eeb37ae3cd01d991d02a9c28c7794a9b9d7f3fd4` |
| runtime_corrected_blob | `bfef9101941de5a2a0cf1ed932e6847e643809a6` |
| test_blob_equal_original_fixed | `31be680e50959e9e6bba0aba449da1b343acaeb0` |

## Standards

No documented-standard violation or actionable maintainability issue was found. Both additions use the existing `payload?.fill(0)` ownership convention; no abstraction, feature or interface changes. No standalone coding-standards/issue-tracker file was present. Current transport contracts, existing tests, accepted decisions and the author report provide the requirements. Both review axes were assessed within this assigned scope without further workers.

The comparison is `git diff 701f3866e60978c945c5a0148dcda5b65f58fdbc...540e1fe2660e0a6084600726d5f6f75fd5c1ee05`; its stated base is the actual merge base. The test-first commit parents 701f and adds only the regression; corrected 212 parents that test-first commit. The reviewer reconstructed exactly two cleanup insertions and no other runtime change. The final three paths are the HTTP driver, its new regression file, and the external author report. All **2,488 other base entries**, all 56 commands and the protected 231 script/workflow/contract/manifest/lock entries remain exact. Source whitespace passed. The base/source entry totals are 2,489 / 2,491.

## Specification and behavior

The driver owns a bounded detached upload copy before checking cancellation and its eight-operation cap. Neither refusal branch has acquired a physical slot or invoked `scope.run()`. Clearing its copy leaves caller bytes and admitted operations untouched, preserving `CANCELLED` and `LIMIT_EXCEEDED`. Existing native-operation and never-invoked cleanup remain unchanged. No dispatch, deadline, redirect/credentials, retry, fallback or registry/consent authority changed.

The test-only constructor instrumentation preserves intrinsic typed-array prototypes and brands, allocates caller input through the saved intrinsic, and restores the global in `finally`. It observes the actual driver copy rather than substituting copy/wipe logic. The serialized runner uses public bytes and injected local fetch. Original failures were the intended actual-byte assertions, not loading failures.

Cancellation checks zero dispatches/pending slots, one cleared copy and unchanged caller input. Capacity checks eight held operations, no ninth dispatch, unchanged pending slots and cleared ninth copy. Its `finally` drains all eight operations successfully and verifies pending returns to zero. Adjacent maintained tests cover uploaded-copy isolation and post-dispatch cleanup, destination binding, byte/read bounds, encoded lengths, aborts, slot retention and policy generation/invalidation behavior.

## Executed checks and evidence

Node v24.22.3 ran directly with native TypeScript support, without node_modules. Both owned worktrees remained clean. The external author's Node22 results are separate. Exact source worktrees, commands, times, exits, counts and byte lengths are recorded in the receipt files below. The 44-test run elapsed 2.073783 seconds; its count includes the two regressions and is not added to them.

Original and corrected command:

```sh
node --test --test-reporter=tap --test-concurrency=1 packages/transport/test/http-driver-preflight-zeroization.test.mjs
```

Affected command:

```sh
node --test --test-reporter=tap --test-concurrency=1 packages/transport/test/http-driver-preflight-zeroization.test.mjs packages/transport/test/http-driver.test.mjs packages/transport/test/http-driver-encoding.test.mjs packages/transport/test/policy.test.mjs
```

Evidence under `/workspace/scratch/6bd6e00af1c0/verification/generation11-transport-independent/`:

| File | SHA-256 |
| --- | --- |
| `original.log` | `53ed70f0ccbb0beb001755f3d1f6ed64cab5f543b355af71f68fae7eec6d1d8d` |
| `fixed.log` | `b38ffcd3441b910636bdc4bad59d7f37c3859e10310ba3e63a4815a89fd67892` |
| `affected.log` | `dd099fa5aa1f3b7ed52bdb15c2adf50cdc7ce8562018ce79e1b20a2c4654966e` |
| `regression-results.json` | `b5216f80090628e0c2feb246805fa1a735ba37ba359cdc1a322cdfdd42847c8d` |
| `affected-results.json` | `9a957b9b46713938c8e66304fb47d547cb207bf34bf053b65630c5f94652dfa0` |
| `source-check.json` | `8c2fbdf298920f4f9fddaa309743267b2858f1c6365c4c0c4c0627533c09a7f7` |

## Handoff and limits

This source review is clear for worker 43's exact-source qualification. Its full tests, artifacts and optional composition are separate executions. Earlier 2,309-core and 2,709-optional results do not transfer to 212. This reviewer repeated no full suite. A report-only supplement can verify the new author evidence while preserving the original review commit and execution identity.

This commit adds only this report directly on reviewed 212. Root alone publishes after checking report blobs, tree equality and ancestry. Original 212, component and optional 191–199 refs remain unchanged. Applicable hosted/browser/native financial/SBPF and standalone named-review conditions remain. Both actual 1,800-second refund minima, physical sends, durable markers, principal/fees, retained crypto-bigint advisory and release restrictions are unchanged. No release, distribution, trust-root or optional-default activation follows.

Standards: 0 actionable findings. Specification: 0 open findings in the reviewed delta. Root owns counting this one Low cause after required composition and independent evidence checks.

## Supplement: independent verification of new author qualification

This section was appended after the source-only review commit `c2d77ffce27253c14f7ebce16aecfb07ec92b0b5`. It changes only this report and preserves all earlier source identities and independent executions.

Worker 43 completed one new full run on exact reviewed PR212 source `540e1fe2660e0a6084600726d5f6f75fd5c1ee05`, tree `e54743e3dd8cd7f1c8115d8692974ebe34d67405`: **2,311/2,311**, with zero failures, skips, cancellations or todos. Actual runner duration was 103,011.796034 ms. All 12 serialized commands passed: 44 tooling, 57 policy, all four core TypeScript configurations, 32 Python specification tests, 238 production/142 core-entry boundaries, default/demo builds, docs/governance/specification checks and whitespace. These are independently checked author executions, not additional reviewer executions or transferred generation10 counts.

The reviewer rehashed every one of the 12 raw logs and checked exact recorded byte lengths and exits. Full/tooling/policy totals were parsed directly from their actual Node summaries; the Python log contains 32 tests and OK. All **27 actual emitted files** were independently hashed, every listed build-evidence asset matched bytes/hash, and all **256 graph-module source hashes** matched physical files in the author's clean source checkout.

Default/demo graph module counts remain 93/95 document, 30/30 private Worker and 4/4 QR Worker. Every graph has zero optional-package imports. The changed HTTP driver is absent from all six graphs, and both complete output maps equal the retained generation10 maps. That byte equality establishes the limited default-artifact scope; the new full source execution independently qualifies the changed maintained module. Only the private Worker graph contains the four accepted personalization modules. QR authority stays none, privateRuntime/network stay false. Both builds retain ReleaseEnabled 0, false release acceptance/signed release/testnet, empty connection origins and CSP connect-src 'none'.

The check added **zero new product executions**. It establishes local evidence/source/artifact correspondence, not runtime browser isolation, current-source distribution acceptance, native financial execution or a waiver of any remaining gate.

### New author raw-log digests checked

| Command | Bytes | SHA-256 |
| --- | ---: | --- |
| `full` | 232920 | `3487749188993e24278195714ac5e9c5279cb4a918f94647db852701ecb2bcb5` |
| `tooling` | 5739 | `933f784932834412adc0a77c465a3a925659d9955f7c1412d273d09b0ce7423a` |
| `typecheck` | 341 | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `policy` | 7495 | `fdb9c627c5361d9ff80b0874dfbe4bce71e19f37a79f8f8defa93a2b191a20ce` |
| `boundaries` | 392 | `a2afff1ba06119367082cb0aec36223a649eae2fcc0580855c50a042cf9f7684` |
| `build` | 1026 | `7ca541327da9491fad262a0850575e4e48b6ad858ff954957e2660deb4822f9b` |
| `build-demo` | 1174 | `60457443897be590f2d7cc48cf64339ccf26f72009e2ac7ee20d92ce741cb4a3` |
| `docs` | 33780 | `daf413a4cebdd09e5376e2b1c01e17243116981faa90927bdb4a9935032f02c4` |
| `governance` | 1118 | `42f9556636da25ed29969162b2b491dc3b013911d5d1488a709864b931dd7194` |
| `specs` | 349 | `25a3cbad6db1d8c778d8964481e666c962f5802d482d42d41ea0945dcd4290b9` |
| `spec-tests` | 4721 | `e22e5f50be28983fdadc402611d43d4b43f54023fed7a558c236bda2943adadb` |
| `source-whitespace` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

### Actual emitted file maps checked

| Variant / file | SHA-256 |
| --- | --- |
| `dist/_headers` | `9e80afba810ea8db85ab27c8eb231aa294884197614c0236d1319085d7b56ee1` |
| `dist/assets/OfflineRoot-CiDlmcyX.js` | `582c708e43d298d39ac6061815a402c1e51e628cd84a034fa8189be4d9dd48d8` |
| `dist/assets/decode.worker-DGcSBxfL.js` | `ad0ef65d9c94c186d2734390499811d003a77818e3b2ebc049528d425e56f5ef` |
| `dist/assets/index-D52zOAdh.js` | `bfcc10705d8a8fcc2fa1f78184fbd8cbe659b9f163106bdee97413fb78fa91f6` |
| `dist/assets/index-rPDFZ4F5.css` | `21ee28132e951fa1fbbc48c450587ebd6e2c86ab5305e3ef98a317466cdad932` |
| `dist/assets/vault.worker-BFynfgnx.js` | `a872b4c6d91e8a8b2178561bdf8a9e1b03035199cca98ad3374f6fe4fc87d044` |
| `dist/content-policy.json` | `0794c4ac577faa97424f0d7a56ab234d910491810ceba30e6eb34b54736a8f9b` |
| `dist/core-graph-document.json` | `131121aa23e31955bc9d4658fb943f5a833cbabb4f819b0b5e380e1f51f24809` |
| `dist/core-graph-worker.json` | `d57812e5fd8080fd2df700f03998b30a9adad4228629b80e49089c783c800834` |
| `dist/index.html` | `59e42cbf39a51b9f103a6d09a5eebe2c0909415b1f7d7dd622a76beafb68a668` |
| `dist/local-build-evidence.json` | `ac7281eb9018b6b96594ddc4f1e5e7ca99e9650f7fe03c3bd01e2b7f20f7347a` |
| `dist/qr-graph-worker.json` | `2ac8e09215fa502063726b0e10c0091585dd710c9b507d9bbadaa142036e53ce` |
| `dist/third-party-licenses.json` | `acf888ada680137d8da6331000eae95a49224f77f8acf718a0099cde8f5e66ca` |
| `dist-demo/_headers` | `9e80afba810ea8db85ab27c8eb231aa294884197614c0236d1319085d7b56ee1` |
| `dist-demo/assets/OfflineRoot-CtvUViRk.js` | `d0f0aef8f084c0fdb0d14c40682f872f24f812a4a1c96bd68e03906e4a300f09` |
| `dist-demo/assets/decode.worker-DGcSBxfL.js` | `ad0ef65d9c94c186d2734390499811d003a77818e3b2ebc049528d425e56f5ef` |
| `dist-demo/assets/index-e-EtuZnC.js` | `20db5c79c87a225e7bb7ef419c250b14fd2c79161be282363155236c78ab0be7` |
| `dist-demo/assets/index-rPDFZ4F5.css` | `21ee28132e951fa1fbbc48c450587ebd6e2c86ab5305e3ef98a317466cdad932` |
| `dist-demo/assets/synthetic-local-v50TqsuT.js` | `e631e04e99c27db24aa9b25e9b0ebd4e2fdc3d1a1f30cc95f05d52eed39f8389` |
| `dist-demo/assets/vault.worker-BFynfgnx.js` | `a872b4c6d91e8a8b2178561bdf8a9e1b03035199cca98ad3374f6fe4fc87d044` |
| `dist-demo/content-policy.json` | `0794c4ac577faa97424f0d7a56ab234d910491810ceba30e6eb34b54736a8f9b` |
| `dist-demo/core-graph-document.json` | `75d0a95a86c25a9c24470b85628ffb73d086e2686ac610a2f4b52fdb1bab9a66` |
| `dist-demo/core-graph-worker.json` | `d57812e5fd8080fd2df700f03998b30a9adad4228629b80e49089c783c800834` |
| `dist-demo/index.html` | `5be2b50432e1d70dc694b5d33f6a4823546f9350e97498487f962eea07bff192` |
| `dist-demo/local-build-evidence.json` | `5db41a227a6bcce8c4245ec7217e367b678da4231b3f7ef1e4d3780ac7bb9f17` |
| `dist-demo/qr-graph-worker.json` | `2ac8e09215fa502063726b0e10c0091585dd710c9b507d9bbadaa142036e53ce` |
| `dist-demo/third-party-licenses.json` | `acf888ada680137d8da6331000eae95a49224f77f8acf718a0099cde8f5e66ca` |

### Evidence bindings

| File | SHA-256 |
| --- | --- |
| `core-evidence-check.json` | `489345f98d4a82d8671e063e8d4da18ece83852a2aabc109dbab4f81b1a55f04` |
| `generation11-core-execution.json` | `9019ad5430ddc45dcfd7e0a678a7a1e89faef90c3f4cb204a793e659bc35b23b` |
| `generation11-core-artifacts.json` | `bc90b46d1ebdcc91ded5cc99404cb2a2e14fdc646ed0cc7336fd3b61c2375bd4` |
