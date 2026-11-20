# Generation 9 optional packages on corrected PR210

## Result and scope

The nine reviewed optional packages are prepared as **nine distinct local layers on exact PR210**. The frozen source passed **2,681/2,681 tests**, **44/44 tooling tests**, **57/57 build-policy tests**, **seven TypeScript configurations** and **32/32 Python specification tests**. Every authorized local command exited zero. All **13 default files and 14 demo files**, including local build evidence, match fresh exact-PR210 builds byte for byte. All six emitted module graphs have **zero optional-package imports**.

This is local composition evidence. There is no new hosted CI, Chromium, extended native financial, main-merge, release or deployment qualification from this worker. Original PR191–199 refs are unchanged by this work. The applicable standalone CodeRabbit/Qodo condition remains unwaived.

| Identity | Exact value |
| --- | --- |
| Input PR200 | `5cc2843dc1bcb70c21f6e52fcfefd1c2f715f6eb` |
| Input PR200 tree | `44a16a83c4d115a4c5df3de83d9ebd839ea71a41` |
| Corrected base PR210 | `cff9eb05d77c82c82a5d22a5395b0ce63b02b265` |
| Corrected base tree | `47f982cf20cd123df45805597b266f1f5ab98259` |
| Corrected core parent PR207 | `df10fe26a308407237f9ccbc636c8bb61f55b84f` |
| Frozen tested source | `390e6685bdf2ba098bc2908183fe5e38442d18cc` |
| Frozen tested tree | `19e8952f7786cae85c661457c0e1545da4f8b758` |
| Frozen at UTC | `2026-11-20T03:44:36.192824+00:00` |
| Report branch | `codex/generation9-optional-corrected-stack-20261120` |
| Worktree | `/workspace/scratch/6bd6e00af1c0/p2p-offramp-generation9-optional-corrected` |

The machine-readable plan is `docs/engineering/generation9-optional-stack-plan.json`. The report-only commit adds this report and that plan after the frozen source; its identity is supplied in the final author handoff. Full qualification remains bound to the source above. Generation6 source `d67e022f71f14d54419bcb6987227b957d80107e` remains historical PR205 evidence and is not relabeled as corrected-core qualification.

## Nine preserved single-package layers

Each layer has two ordered parents: **its original published optional head first**, followed by **the preceding corrected layer second**. The first layer's second parent is exact PR210. The plan records every original expected remote head, original base/tree, package subtree, ordered parent, exact path set and intended single-package PR base. Local branches follow `codex/generation9-optional-<package>-20261120`.

| PR / package | Prepared local head | Exact tree | Paths versus preceding layer |
| --- | --- | --- | ---: |
| 191 / proof-inputs | `6a1e7531897fe0fd5614c982819cf311880abad4` | `dede27391324a45b90b14ef163d837ab89671176` | 12 |
| 192 / liquidity | `0dffe8fe89ad7cd2cc34b77855ded9da8f1b413c` | `9b1240f3989c7890e791d90f5856b615ce5314d8` | 14 |
| 193 / arbitration | `7a74b21b0756e61409af65a882eabd5ca6dc6730` | `25f1127915573b966dc8bb2023128a934501dc19` | 20 |
| 194 / privacy-policy | `ff37386467b64f6ed140cdb88b29f640d29275e4` | `494266ad9d72c2e3532e749a297f81293ef4cb93` | 11 |
| 195 / courier | `d4382044b4b98d5fd472a381004b82999f07d1fd` | `08f6a31c7f2a1657efc8dacffde72d3ee6e96eca` | 24 |
| 196 / meetup | `df84b5ff0419a5f5e71f97aa0389a46ed646a0fb` | `74ed0ac99237c9c0b196b4159edfb2ab44c649c5` | 39 |
| 197 / privacy-controls | `e703ed725205a7dacbd5c61b588c0cf6fc2f582a` | `f21e1b5fc8cf2db82df14246e574ec0c163b0e36` | 16 |
| 198 / stealth | `1b173518f5ce2c5f1da01496d0901d377e698915` | `f343acb7c517b2118ff6c9037be4dec34a40e21d` | 21 |
| 199 / proof-jobs | `390e6685bdf2ba098bc2908183fe5e38442d18cc` | `19e8952f7786cae85c661457c0e1545da4f8b758` | 22 |

Each exact reviewed generation6 layer delta was applied mechanically to the corrected preceding tree. All nine applied without content conflicts. The union contains **174 paths: 172 additions and two shared modifications**. All 172 nonshared files equal their original published blobs. All nine package subtrees match reviewed originals exactly, including privacy-policy's already reviewed atomic-pruning correction. Earlier packages stay unchanged in every layer; later packages remain absent until their own layer. No optional implementation, test, protocol, dependency pin or default import was edited.

### Shared manifest and workflow additions

All **56 core npm commands** retain their values; the final union has **62**. PR191 adds `typecheck:proof-inputs`; PR196 adds `test:meetup:browser`; PR197 adds `test:privacy-controls:browser`; PR199 adds `test:proof:memory`, `test:proof:browser` and `typecheck:proof-jobs`. Non-script manifest metadata is unchanged.

All **139 corrected-core foundation lines** remain. Exactly seven reviewed lines add the proof-inputs TypeScript step and complete Meetup/Privacy Controls browser steps with their Chromium environments. All 16 core browser groups remain; foundation now has 18. The separate proof-jobs workflow equals PR199 byte for byte. Five other workflows are byte-identical to PR210. The plan records all seven shared-file additions with original, preceding and prepared blob IDs, inserted commands or workflow lines, and preservation checks. Generation6 append resolutions were reused as reviewed deltas; this preparation had no new content conflict.

## Corrected core and fixture preservation

PR210 tracks 2,465 entries. **All 2,463 outside the two allowed shared files are preserved exactly**, including modes and object IDs. The protected source/tooling subset contains 784 entries under application/contracts/packages/schemas/scripts plus the npm lock. This is broader than generation6's 652-path subset; the exhaustive 2,463-entry comparison establishes preservation of the whole current base.

All six PR210 source/report paths and the navigation ownership, portal directory identity, pending IndexedDB opening cancellation and finalized Solana reconciliation corrections remain exact. Mandatory measured socket warmth, every per-trial call/fetch/POST/503/completion/error assertion, isolated cleanup, strict physical-send observation, durable intent markers, signature counts, principal/fees, zero fixture errors and both real 1,800-second refund minima remain unchanged.

**PR206 relay, PR208 backup verification and PR209 ctutils remediation remain separate.** Their changes were not incorporated. This work adds zero product causes, fixture corrections or dependency remediations. The coordinator's 31-cause ledger is unchanged and includes separate scopes such as relay206; it does not mean every ledger repair is in this composition.

## Actual serialized local execution

The full suite ran **once**, after all nine layers were frozen and clean. Later heavy commands and reference builds were serialized. No preliminary or interrupted qualification attempt was used. Actual exits, elapsed times, Node/Python totals and raw-log SHA-256 values are recorded in the plan. Old component totals were not summed to manufacture a new pass.

Environment: Node **24.22.3**, npm **11.19.1**, Python **3.12.14**, Foundry **1.5.1** commit `b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2`, and solc **0.8.30**. Full version strings and binary hashes are in the plan. `FOUNDRY_BIN=/workspace/scratch/6bd6e00af1c0/toolchain` and `FOUNDRY_SOLC=/workspace/scratch/6bd6e00af1c0/toolchain/solc-0.8.30` were supplied. Dependencies were physically copied from a matching pinned dependency tree; the dependency root was never a symlink. Pinned Python oracle dependencies cryptography 50.0.0, cffi 2.1.1 and pycparser 3.0 were already present.

| Executed check | Actual result |
| --- | --- |
| `npm test` with pinned Foundry/solc | **2,681/2,681**, zero fail/skip/cancel/todo; **119,698.008254 ms** |
| `npm run test:tooling` | **44/44**, zero fail/skip/cancel/todo; **27,405.59822 ms** |
| `npm run typecheck` | Four core configurations passed |
| `npm run typecheck:proof-inputs` | One optional configuration passed |
| `npm run typecheck:proof-jobs` | Both optional Worker/fixture configurations passed |
| `npm run test:build-policy` | **57/57**, zero fail/skip/cancel/todo |
| `npm run check:boundaries` | **304 production files /142 core entry modules**, passed |
| `node apps/web/scripts/build.mjs` and `... build.mjs demo` | Both composed-source builds passed |
| Same build commands in exact PR210 reference checkout | Both fresh corrected-base builds passed |
| Complete default/demo directory comparisons | **13/13 and 14/14 files byte-identical** |
| `npm run test:proof:memory` | Actual Node Worker/WASM cap passed |
| `npm run check:docs` | Engineering consistency true; six claims; semantic approval/publication false; locale stale |
| `npm run check:governance` | **12 historical /0 pending /57 rows /13 stale references**; economic preparation false |
| `npm run check:specs` | **173 documents**, zero broken links or unindexed documents |
| `npm run test:specs` | **32/32 passed** |
| Three optional browser-harness `node --check` commands | Passed; browser executions **0** |
| `git diff --check` from base to source | Passed |

The actual Node Worker/WASM receipt records **65,536 initial bytes**, growth to **268,435,456 bytes (256 MiB)**, refusal beyond that cap and **zero imports**. Browser qualification, provider approval, proof verification and device peak-memory qualification remain explicitly false. This is not Chromium WASM qualification under the unchanged CSP.

Docs/governance preserve stale immutable evidence: locale drift, six stale claims, false semantic approval and economic-preparation refusal remain visible. Engineering consistency does not authorize current-client distribution. No immutable receipt, source binding, repository assertion or gate was rewritten.

## Fresh corrected-base artifacts

The reference checkout `/workspace/scratch/6bd6e00af1c0/p2p-offramp-generation9-optional-reference` is detached at exact PR210. After source tests, the author-owned physical dependency directory moved there for two serialized builds and then returned. Both tracked trees remained clean, and both fresh output sets are retained.

The plan embeds all SHA-256 maps for both sides of the **13 default /14 demo file** comparisons, including `local-build-evidence.json`. Scanner public-file counts are 12/13 because local evidence is written afterward; complete-directory counts are 13/14.

| Graph | Default modules | Demo modules | Optional hits |
| --- | ---: | ---: | ---: |
| Document | 93 | 95 | 0 |
| Private Worker | 30 | 30 | 0 |
| QR Worker | 4 | 4 | 0 |

The private Worker retains exactly the favorites/templates facades, `src/favorites.ts` and `src/trade-draft-store.ts`. The document and QR graphs contain no personalization. QR graph/decoder bytes equal corrected core exactly. Both variants retain **ReleaseEnabled:0**, false release acceptance, empty external connection origins and `connect-src 'none'`.

## Independent review

Independent reviewer `/root/generation9_optional_independent` completed review with no open High/Medium finding in the corrected optional integration delta. Report-only commit `479e0e9fe95420699f1f0e24208751712bd68239`, tree `b0afe0e4ebe40ea41a6c65ee11e5fe219dad2cb6`, has the frozen source as its sole parent and adds `docs/engineering/INDEPENDENT_OPTIONAL_CORRECTED_STACK_GENERATION9_20261120.md`. The reviewer independently verified all nine original-delta unions, original package subtrees and ordered parents, all 2,463 protected base entries in every layer, and the exact command/workflow unions; ran its own 16/16 bounded tests; and rehashed all 20 author logs, 54 actual artifact files and 256 graph-module hashes. All matched the recorded evidence and fresh PR210 reference, with zero optional graph imports. The 2,681-test full result remains attributed to the author. Exact-source hosted/native/browser and named standalone review gates remain open.

## Evidence digests

All raw logs remain under `/workspace/scratch/6bd6e00af1c0/verification`. The committed plan preserves command arrays, tested source identities, timestamps, exits, byte counts and digests.

| Execution log | Exit | SHA-256 |
| --- | ---: | --- |
| `generation9-optional-corrected-full.log` | 0 | `b4b365820bc81f572118982248629e7fc7bd121dd7d7abfb68b1445cc0e824b4` |
| `generation9-optional-corrected-tooling.log` | 0 | `2acb999a87073007003f6b06c0aa1b8ca4b7451139b58d69d51d29f60b4848ae` |
| `generation9-optional-corrected-typecheck.log` | 0 | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `generation9-optional-corrected-proof-inputs-typecheck.log` | 0 | `1e305eb1bfb14f1b5f68a29cd70d3d9dd040f5dd119fbbc45d75ca92a7e97e00` |
| `generation9-optional-corrected-proof-jobs-typecheck.log` | 0 | `01003589ca24dff5de5e5b62865f20ccb201f4b2a147d91fe1299cd36dfacfb0` |
| `generation9-optional-corrected-policy.log` | 0 | `b3ddc3eb5caf032004e0041b251e0ba350a7b7109d83919904244dd7cb33fb9b` |
| `generation9-optional-corrected-boundaries.log` | 0 | `62ff0a9ff83e69b28299389c00aed569fc8ea560697e46cfee47bdbd60734adc` |
| `generation9-optional-corrected-build.log` | 0 | `e2dc50f8af3b11ce0f53b3c90a8a4fb7aa10b84e53373e5a2a90fa587cb29080` |
| `generation9-optional-corrected-build-demo.log` | 0 | `6596240ac2a4b3b28f4cc1f5abf4339b478ffc9a05c50f6d536855ccb3d7b821` |
| `generation9-optional-corrected-proof-memory.log` | 0 | `c23b861046b8c4db97b176c6021d6defd6cc8163dd0f3a89be90a2536e8cf805` |
| `generation9-optional-corrected-docs.log` | 0 | `daf413a4cebdd09e5376e2b1c01e17243116981faa90927bdb4a9935032f02c4` |
| `generation9-optional-corrected-governance.log` | 0 | `42f9556636da25ed29969162b2b491dc3b013911d5d1488a709864b931dd7194` |
| `generation9-optional-corrected-specs.log` | 0 | `25a3cbad6db1d8c778d8964481e666c962f5802d482d42d41ea0945dcd4290b9` |
| `generation9-optional-corrected-spec-tests.log` | 0 | `0491de738bc08adc7ef11d5da06f833332016a8b1fc890b1b7da3caf34b46dc7` |
| `generation9-optional-corrected-meetup-browser-syntax.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `generation9-optional-corrected-privacy-controls-browser-syntax.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `generation9-optional-corrected-proof-jobs-browser-syntax.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `generation9-optional-corrected-source-whitespace.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `generation9-optional-corrected-reference-build.log` | 0 | `c89ec3fcf659451f73b2941b24dbb2fa248979c475047d5b67b2c0f6a7e14c5e` |
| `generation9-optional-corrected-reference-build-demo.log` | 0 | `c3f3af010d0d30016661660796a78beb76ab38c1dac5ac76ffb3885e4fadc4cc` |

| Structured local evidence | SHA-256 |
| --- | --- |
| `generation9-optional-corrected-freeze.json` | `7348b80965dc12c239d19d513ceea6c79b7f9019bda13d53130763d4a6ff293a` |
| `generation9-optional-corrected-layers.json` | `fb8b9319f73d26700572a7c5806eede035865cc1064e9a87d80f7a15e0960d75` |
| `generation9-optional-corrected-source-audit.json` | `b625e76edc7af8b2758a5eb8485c27606298df362c8de4eb6d63b4f00b292984` |
| `generation9-optional-corrected-execution.json` | `f516a66add33b21b37a4f427068cddce80085e96d9247930adac68e0b088eecf` |
| `generation9-optional-corrected-artifacts.json` | `0059400ce62d5a69171d5e238c36548687ab0d7969cbaf438d0ed0d789828dbd` |
| `generation9-optional-corrected-reference-builds.json` | `c57e24082ec1d43e7781b7603f2845d22fc968b05926d09a129058fe80d4eb8f` |
| `generation9-optional-corrected-environment.json` | `fc0b9a0266a8b707b573159a3fb80581c757864b9a8b71629dec3005b4988dcb` |
| `generation9-optional-corrected-dependencies.json` | `5ef580c14a191f8d9453e6216320be6f1744f14d2921aa9116039af0000c9c07` |

## Publication and integration continuation

The coordinator plans a **dedicated evidence branch** containing nine durable ordered layer commits. Original PR191–199 refs stay unchanged; there is no bulk optional merge PR.

1. Preserve every local layer tree and original optional first parent. Use the actual published preceding layer as second parent, or exact PR210 for layer one. Record local-to-published IDs because connector-created commit IDs may differ.
2. Preserve stable per-package PR mappings and expected original heads. Do not advance existing optional refs merely to publish evidence. Later separate-package integration must resolve live heads, ownership and intended base.
3. Retain the applicable accepted standalone Tier B **CodeRabbit or Qodo automated review pass with findings answered**. No named-service pass or policy waiver is established here; combined Tier C authorization does not remove a standalone condition.
4. Require exact-source hosted CI, applicable native/browser execution, independent review and no open High/Medium finding. Observe actual checkout and merge identities. PR203/205 native passes and old optional/core checks remain bound to their original sources.
5. Preserve the historical PR207 warmed-connection precondition failure and reviewed PR210 correction. PR210 hosted/native checks were pending in the supplied coordinator snapshot; this worker made no new hosted-status observation. Keep PR206/208/209 separate until explicitly composed and qualified.
6. Keep optional default imports absent, release authority disabled, every strict native assertion intact and both actual refund waits unchanged. This preparation establishes no optional activation, release or deployment authority.

The initial low-space pause occurred before any qualification command. The coordinator recovered space from its completed, ignored dependency caches, recorded in `verification/generation9-owned-cache-cleanup.json`. This author deleted no other worker's files and changed no external `/workspace/scratch/6eace968c0df` worktree, existing optional branch, remote ref, PR metadata, workflow setting, credential or fund.
