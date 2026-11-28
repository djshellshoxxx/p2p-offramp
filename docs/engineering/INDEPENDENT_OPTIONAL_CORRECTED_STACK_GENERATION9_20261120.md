# Independent review of the corrected optional stack — generation 9

## Result and exact scope

**No open High or Medium finding was identified in the reviewed integration delta.** The nine local layers preserve their original package sources and the complete corrected core210 base. The independent review found the expected source union, additive commands and qualification workflow steps, with no optional default-application wiring.

This is an independent review of local preparation. It is not a main merge, a combined optional PR, an optional activation approval or a substitute for exact-source hosted/native/browser qualification. The earlier generation6 stack on core205 and its 2,617-test result do not qualify this corrected source.

| Identity | Exact value |
| --- | --- |
| Published input handoff, PR200 | `5cc2843dc1bcb70c21f6e52fcfefd1c2f715f6eb` / tree `44a16a83c4d115a4c5df3de83d9ebd839ea71a41` |
| Corrected base, PR210 | `cff9eb05d77c82c82a5d22a5395b0ce63b02b265` / tree `47f982cf20cd123df45805597b266f1f5ab98259` |
| **Independently reviewed source** | **`390e6685bdf2ba098bc2908183fe5e38442d18cc`** |
| **Independently reviewed tree** | **`19e8952f7786cae85c661457c0e1545da4f8b758`** |
| Reviewer checkout | `/workspace/scratch/6bd6e00af1c0/p2p-offramp-generation9-optional-independent` |
| Reviewer branch | `codex/generation9-optional-corrected-independent-20261120` |
| Author checkout | `/workspace/scratch/6bd6e00af1c0/p2p-offramp-generation9-optional-corrected` |

The reviewer is a separate native worker from the composing author. The input handoff was read from the local handoff checkout at `0e718023c1b744dc55d062eb6bcf47b65e1ba258`, whose tree equals the published input tree above. The review read accepted D7/D8, the earlier plan/report and the original optional source objects. It did not repeat the closed package vulnerability audits. The review checkout was created directly from the frozen source after the coordinator recovered scratch space. No source file was edited, no dependency tree was copied into this checkout, and no existing worktree or remote ref was modified.

## Separate PR scopes and original source preservation

The independent verifier derives each original package delta directly from its published head and original base `ac9a4b0ffc3ca50a299398e72554e7964a634cd4`. It then builds the expected cumulative union over core210 in memory and compares complete Git tree entries, including file modes and blob identities, at every new layer. It does not rely solely on the author's assertion that the old generation6 patches were reapplied.

| Existing PR / package | Original published head retained as first parent | New local layer | Paths versus preceding layer |
| --- | --- | --- | ---: |
| #191 / proof-inputs | `61f0c6c05d245c4cc7524852224d00693929df3c` | `6a1e7531897fe0fd5614c982819cf311880abad4` | 12 |
| #192 / liquidity | `0fb8452cb38c835e9dccb660f63f6af3156c9f91` | `0dffe8fe89ad7cd2cc34b77855ded9da8f1b413c` | 14 |
| #193 / arbitration | `f7bd867bc1ee15854b36ba268cedc275c2429c28` | `7a74b21b0756e61409af65a882eabd5ca6dc6730` | 20 |
| #194 / privacy-policy | `a419b420dcee58ce99391a0f73289aa28dc6413b` | `ff37386467b64f6ed140cdb88b29f640d29275e4` | 11 |
| #195 / courier | `8ff5f5c23dcdda88f79d8f54056515635f0b65a1` | `d4382044b4b98d5fd472a381004b82999f07d1fd` | 24 |
| #196 / meetup | `4bc4c7e2833b6b8540b8586624fb1697817e02e2` | `df84b5ff0419a5f5e71f97aa0389a46ed646a0fb` | 39 |
| #197 / privacy-controls | `86952b1ccc8eb9c25a3be05d6a32d3c556df8c84` | `e703ed725205a7dacbd5c61b588c0cf6fc2f582a` | 16 |
| #198 / stealth | `8e46f3ccf6348a953cef177a4ffd6abfb971c31b` | `1b173518f5ce2c5f1da01496d0901d377e698915` | 21 |
| #199 / proof-jobs | `e7e1aa90072f4b0376820f0e9b28e609707de74f` | `390e6685bdf2ba098bc2908183fe5e38442d18cc` | 22 |

Every layer has exactly two ordered parents: the recorded original optional head first, and the preceding new layer second. The first layer's second parent is exact core210. Its intended PR base is `codex/transport-qualification-20261120`; subsequent intended bases are the preceding existing `codex/optional-<package>-20261119` branches. This preserves the one-package-per-PR mapping and permits expected-head, ordinary fast-forward publication after the remaining conditions are met. No remote head was advanced by this reviewer.

Each layer's changed-path set equals its own original package extraction scope. No layer edits another optional package. All earlier optional package subtrees remain exact; every later package remains absent as in core210 until its own layer. In total, **172 added nonshared files** match their original published blobs exactly, and the two shared files contain only the verified union described below. The final delta is **174 paths**; its tree has **2,637 entries** versus **2,465** in core210.

| Package | Exact subtree shared by original head and all applicable new layers |
| --- | --- |
| proof-inputs | `8ce13a63a8df82b00cea3405d246babfe7f89746` |
| liquidity | `ef4dace6c26423b61d98c6012e54ab56d714428e` |
| arbitration | `f6a8051adf0c1adeb5b655240ad478c58fac1ac6` |
| privacy-policy | `5ab375b6f3b5520bd6059ff858f48699edf53aca` |
| courier | `276211811104349ad9431dae3f64f3ea83c299b6` |
| meetup | `a3fd556fb78cfbf8c0546068db657c4c69a7c9c7` |
| privacy-controls | `21480b1081bf720b21afa8277f2bfe99208790cc` |
| stealth | `0a24172c193fc3f7c2f7fd8967f107e2e37b5f73` |
| proof-jobs | `4be7a4564974f96d8396f4901fbeb63789eaed75` |

The preserved privacy-policy subtree includes the previously reviewed atomic-group planning correction. Package implementation, tests, data fixtures, package-local configuration and package review reports were not changed by recomposition. A read-only `git ls-remote` observation completed before 03:44:27 UTC confirmed all nine original optional remote heads and core210 still matched these recorded identities. Later publication must resolve them again and use the recorded expected-head leases.

## Standards: protected core and qualification union

**No documented-standard violation or open High/Medium finding was found in the shared integration changes.** Every one of the **2,463 core210 entries outside `package.json` and `vault-foundation.yml` is identical at every layer**, not merely at the final head. This includes all application, contract, storage, wallet, cryptographic, schema, script, dependency-lock, policy and existing evidence files.

The review separately compared the implementation blobs of the four repairs added after core205: Solana reconciliation context, pending IndexedDB open ownership, portal cleanup directory identity, and late review-navigation ownership. It also verified all six PR210 delta paths, including both transport test files, the qualification helper, the browser diagnostic and both reports. Their exact core210 blobs remain in the reviewed stack.

The command and workflow comparisons established:

- All **56 core commands** retain their exact values. The final command map is the exact **62-command union**, with no duplicate JSON keys or altered non-script package metadata. The six additions are `typecheck:proof-inputs`, `test:meetup:browser`, `test:privacy-controls:browser`, `typecheck:proof-jobs`, `test:proof:memory` and `test:proof:browser`.
- The foundation workflow is precisely the original **139 lines plus seven reviewed lines** in their intended locations: proof-inputs typechecking and the complete Meetup/Privacy Controls browser steps, including their own Chromium environments. Removing those three complete additions reproduces core210 byte for byte. Every original action pin, job, permission, trigger, existing command and failure rule remains.
- The five other existing workflows are unchanged. The sole new workflow, `optional-proof-jobs.yml`, equals the original PR199 blob, including its typecheck, real Worker/WASM memory check and separate browser job.
- Existing transport send-count, completed-503, warmed-connection, completion/error and teardown assertions remain intact. The financial native harness and both real refund waits are unchanged.
- `package-lock.json` and the Solana Cargo lock are unchanged. Separate relay206, backup208, ctutils209 and later QR211 work is excluded from this fixed-base review.

## Spec: accepted D7/D8 and default-build isolation

**No missing requirement or unrequested behavior was found in the integration delta.** Accepted D7, as superseded on November 18 in `docs/adr/ACCEPTED-DECISIONS-2026-11-04.md` and the consolidation gameplan section 5, authorizes separate optional source extractions with import boundaries. It does not authorize default-build activation. The nine-layer mapping, unchanged core sources and package boundary checks preserve that separation.

D8 still requires green applicable exact-source checks and an independent review without open High/Medium findings. The detailed accepted packet at `docs/adr/proposed/D8-merge-policy-and-branch-protection.md` also retains the standalone Tier B CodeRabbit-or-Qodo review condition, with findings answered. This review obtained no named-service pass and grants no waiver. An advisory server-check classification does not erase that written condition. The reviewer did not infer inaccessible branch-protection details or change repository settings.

## Checks executed by this independent reviewer

The reviewer used Node `24.22.3` and Python `3.12.14`. The independent execution was intentionally limited to integration preservation and the affected static boundary surface; the author owns the full combined execution.

| Own check | Actual result |
| --- | --- |
| Complete immutable-object reconstruction across all nine layers | Passed; exact original scopes, original blobs, ordered parents, package subtrees, all protected core entries, command union and foundation placement |
| `git diff --check` from core210 to frozen source | Passed |
| Four existing optional boundary files, executed serially with Node's test runner | **16/16 passed**, zero failures, skips, cancellations or todo; **821.027123 ms** |
| Clean checkout before and after own source/boundary checks | Passed |
| Independent verification of author logs and fresh core210 reference artifacts | All 20 logs, 54 artifact files and 256 graph module hash records matched |

The 16 executed tests are `packages/{meetup,privacy-controls,stealth,proof-jobs}/test/optional-boundary.test.mjs`. They scan tracked outside imports and configuration, exercise positive resolver probes and check the advanced-package classification. This count is limited to those four files; it is not represented as execution of all package tests or as a browser result. The complete nine-package source union was checked independently, and the author's full suite separately covers the maintained package tests.

The recorded independent evidence is in `/workspace/scratch/6bd6e00af1c0/verification/`:

| Evidence | SHA-256 |
| --- | --- |
| `generation9-optional-independent-source-check.py` | `c8abd1a80fa5f5715ab12cc5368d0b7c087e52fda056b01c5d64f20fe766279e` |
| `generation9-optional-independent-source-check.json` | `b3715ed4db29a828a52c7a9a91b226699c717ed6a0453db7699ed436d0d766be` |
| `generation9-optional-independent-boundaries.log` | `68eef7a6240c5ddd7357fad402d61c9fd8f0caa465a4a0ae37544d3623278013` |

## Artifact and author execution verification

### Independent artifact and receipt checks

The reviewer independently rehashed **all 20 retained command logs**: the author's 18 qualification commands and two fresh reference builds. Every observed byte count and SHA-256 equals its source-bound receipt; all receipts record exit zero. The reviewer also parsed the raw Node summaries for the full, tooling and build-policy runs and matched their actual totals, rather than trusting a copied table. The author command timestamps are serialized. These are independently checked author executions, not reviewer executions.

The reference checkout `/workspace/scratch/6bd6e00af1c0/p2p-offramp-generation9-optional-reference` was verified at exact core210, with clean tracked source. The author moved its physical dependency directory between its two owned checkouts for the serialized reference builds, then returned it. The reviewer observed a physical, nonsymlink dependency root in the source checkout and matching lock bytes. No older core205 artifact was used for this comparison.

The reviewer hashed every actual file in both source and reference output directories: **13 default files and 14 demo files per checkout, 54 files in total**. Both complete hash maps match each other and the author comparison receipt, including `local-build-evidence.json`. The reviewer additionally checked all **256 graph module hash records** against the actual source files in the author's checkout and checked every asset listed in the local build evidence.

| Graph | Default modules | Demo modules | Optional package hits |
| --- | ---: | ---: | ---: |
| Document | 93 | 95 | 0 |
| Private Worker | 30 | 30 | 0 |
| Public QR Worker | 4 | 4 | 0 |

Only the private Worker graph contains the four accepted personalization modules: the favorites/templates facades and their two implementation files. The document and QR graphs contain none. Both variants preserve `ReleaseEnabled: 0`, false release acceptance, false signed-release status, empty `connectOrigins` and `connect-src 'none'`. Default `syntheticDemo` is false; only the demo variant sets it true. These checks establish emitted graph/source and artifact correspondence, not runtime sandboxing or a complete XSS proof.

### Author executions, separately attributed

The full source run began at **03:49:40 UTC** and completed at **03:51:40 UTC**. All 18 qualification commands were complete by **03:52:32 UTC**; the two fresh reference builds completed by **03:52:50 UTC**. The author's receipt records one full-suite invocation with the pinned Foundry directory and `solc-0.8.30`. No prior source's test count was added to these totals.

| Author check | Result read from retained log and matched to receipt |
| --- | --- |
| Full `npm test` | **2,681/2,681 passed**; zero failures, skips, cancellations or todo; **119,698.008254 ms** |
| `test:tooling` | **44/44 passed**; zero failures, skips, cancellations or todo |
| Core typecheck plus proof-inputs and proof-jobs typechecks | All **seven configurations** passed |
| `test:build-policy` | **57/57 passed**; zero failures, skips, cancellations or todo |
| `check:boundaries` | **304 production files /142 core entry modules**; passed |
| Default and demo builds, then fresh core210 reference builds | All four commands passed; complete output equality independently checked above |
| `test:proof:memory` | Native Node Worker grew WASM linear memory from **65,536 to 268,435,456 bytes**, refused further growth, and retained zero imports |
| `check:docs` | Engineering consistency true; six claims; semantic approval and publication false |
| `check:governance` | **12 historical /0 pending /57 rows /13 stale references**; economic preparation false |
| `check:specs` and `test:specs` | **173 documents**, no broken links or unindexed specifications; **32 Python tests passed** |
| Three optional browser harness syntax checks and source whitespace | Passed; syntax checks are not browser executions |

The memory receipt explicitly leaves browser qualification, provider approval, proof verification and device peak-memory qualification false. Documentation still records draft/stale evidence and no semantic approval. Positive historical distribution checks do not qualify distribution of this current client, and no immutable receipt binding was rewritten. The review adds no browser or long native financial execution claim.

| Rehashed author log | SHA-256 |
| --- | --- |
| `generation9-optional-corrected-full.log` | `b4b365820bc81f572118982248629e7fc7bd121dd7d7abfb68b1445cc0e824b4` |
| `generation9-optional-corrected-tooling.log` | `2acb999a87073007003f6b06c0aa1b8ca4b7451139b58d69d51d29f60b4848ae` |
| `generation9-optional-corrected-policy.log` | `b3ddc3eb5caf032004e0041b251e0ba350a7b7109d83919904244dd7cb33fb9b` |
| `generation9-optional-corrected-proof-memory.log` | `c23b861046b8c4db97b176c6021d6defd6cc8163dd0f3a89be90a2536e8cf805` |
| `generation9-optional-corrected-reference-build.log` | `c89ec3fcf659451f73b2941b24dbb2fa248979c475047d5b67b2c0f6a7e14c5e` |
| `generation9-optional-corrected-reference-build-demo.log` | `c3f3af010d0d30016661660796a78beb76ab38c1dac5ac76ffb3885e4fadc4cc` |

The independent evidence receipt records all 20 log digests, both complete artifact maps and the checked metadata digests. Additional independent evidence:

| Evidence | SHA-256 |
| --- | --- |
| `generation9-optional-independent-evidence-check.py` | `58e0865a04647cffee9720b092cd6ab343d6616a9f2128bad83733f2b26d013f` |
| `generation9-optional-independent-evidence-check.json` | `b76acca6086db40fbba99a04dbb37aa14d4c103440f77806361d84ef7fc8e8a7` |
| `generation9-optional-corrected-execution.json` | `f516a66add33b21b37a4f427068cddce80085e96d9247930adac68e0b088eecf` |
| `generation9-optional-corrected-reference-builds.json` | `c57e24082ec1d43e7781b7603f2845d22fc968b05926d09a129058fe80d4eb8f` |
| `generation9-optional-corrected-artifacts.json` | `0059400ce62d5a69171d5e238c36548687ab0d7969cbaf438d0ed0d789828dbd` |

## Remaining integration conditions

The prepared source remains local and unmerged. The coordinator plans a dedicated evidence branch that preserves the original #191–#199 refs; this report does not authorize replacing those nine PRs with a bulk optional PR. The coordinator must preserve the separate PRs and original-head leases, set each intended base before advancing its head, and verify the actual published tree and ordered parents. Connector-created commit IDs can differ from the local IDs; tree and parent identity must be checked explicitly.

Each new published source/actual merge checkout needs its applicable hosted, native and browser qualification. Successful ancestor checks, including core205, cannot be transferred to core210 or this optional stack. The last input handoff's core207 browser failure remains historical evidence; its PR210 correction still requires actual source-bound qualification. This reviewer did not run Chromium, the long native financial harness, or another full suite, and did not bypass the local Chromium restriction.

Applicable standalone CodeRabbit/Qodo review remains required unless an actual accepted policy change is recorded. Future default-application composition would require its own gate. No release, deployment, secret, funds, contract authority, proof-provider approval or main merge is established by this report.
