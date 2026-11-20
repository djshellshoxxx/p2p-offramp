# Generation 10 combined core qualification

## Result and exact source

The reviewed relay, backup-verification, dependency and QR followups are composed on exact PR210. The frozen source passed **2,309/2,309 full tests**, **44/44 tooling tests**, **57/57 build-policy tests**, all **four TypeScript configurations** and **32 Python specification tests**. All twelve serialized local commands exited zero. The full suite ran once with zero failures, skips, cancellations or todos; its actual runner duration was **94149.503811 ms**. Independent worker40 separately passed **54/54 focused tests** and found no open High/Medium integration finding.

This is a new combined execution. Component and ancestor totals were not summed or transferred. Composition adds no new product cause. Hosted CI, actual Chromium, the long native financial harness and SBPF qualification were not executed by this worker. This is isolated preparation for the existing root-owned PR210 descendant; no remote ref, main branch, optional activation, deployment or release was changed.

| Identity | Exact value |
| --- | --- |
| Input PR200 handoff | `b01aa60a7eb893d0359449f335f1862864eec179` / tree `86c7f44cd323601ffa9817defdbcabb2ed241054` |
| Existing210 expected head | `cff9eb05d77c82c82a5d22a5395b0ce63b02b265` |
| Corrected207 ancestor | `df10fe26a308407237f9ccbc636c8bb61f55b84f` |
| **Frozen tested source** | **`49bcb0f2c63b20ac7878ba4aebd6bc433d44925f`** |
| **Frozen tested tree** | **`81845317f8c1cfe7c76846aa54403fb49cc141b0`** |
| Author branch | `codex/generation10-combined-core-20261120` |
| Author checkout | `/workspace/scratch/6bd6e00af1c0/p2p-offramp-generation10-core` |

The machine-readable plan is `generation10-core-plan.json`. New author and independent reports are appended after the tested source. The final handoff supplies the resulting report/base checkpoint. Report-only additions receive documentation and whitespace validation, without repeating the core full suite.

## Input preservation and composition

All five input PR heads, the 210 branch and main were checked before composition. Main remained `5c5a84ef6300330700c8b0ca54d074ac113f08be`. Every input descends from corrected207. The complete resulting tree equals the union of their individual deltas against207, including file modes and blob IDs.

| Input | Exact head | Exact tree | Paths versus207 |
| --- | --- | --- | ---: |
| PR210 | `cff9eb05d77c82c82a5d22a5395b0ce63b02b265` | `47f982cf20cd123df45805597b266f1f5ab98259` | 6 |
| PR206 | `825a85a55a1e0a43d6f416696fabee94913a2f18` | `243d178ac6a3822f71ddf3ad3073cc1d8020b864` | 7 |
| PR208 | `0e148564743b1ee353abdbdf8931fec464f09870` | `6a4417741c0b399dde894773f29854f7a2d36228` | 17 |
| PR209 | `c8695278c3b85ac75fc2ad3318830aa8a08f4d50` | `e7aba3833fa52c6eda7a23cd6d1301cadc610355` | 4 |
| PR211 | `e7397f45f68f18fae8857ea31b58a04e248df404` | `224341968be39c6de7874b34a1f7fd6eefa19857` | 3 |

There are **37 distinct changed paths** and **zero pairwise overlaps**. Existing210 contributes six paths; the four additional inputs contribute 31. Four ordinary local merges completed without conflicts. No implementation, test or dependency source required a manual edit.

| Added input | Local merge head | First parent: preceding composition | Second parent: original input |
| --- | --- | --- | --- |
| PR206 | `fe5c3639f821b6697bdbfd1594b45e4600a0e255` | `cff9eb05d77c82c82a5d22a5395b0ce63b02b265` | `825a85a55a1e0a43d6f416696fabee94913a2f18` |
| PR208 | `b239034c35ecc797ed81e150aa90e76ee0fe22ad` | `fe5c3639f821b6697bdbfd1594b45e4600a0e255` | `0e148564743b1ee353abdbdf8931fec464f09870` |
| PR209 | `bbc12f0412df319168bcdb7c02a358e09793db0f` | `b239034c35ecc797ed81e150aa90e76ee0fe22ad` | `c8695278c3b85ac75fc2ad3318830aa8a08f4d50` |
| PR211 | `49bcb0f2c63b20ac7878ba4aebd6bc433d44925f` | `bbc12f0412df319168bcdb7c02a358e09793db0f` | `e7397f45f68f18fae8857ea31b58a04e248df404` |

The tested source has **2,486 tracked entries**. All **2,449 base210 entries outside the component delta set** remain exact; every entry inside that set matches its reviewed input. This includes the four corrected-core repairs and 210's measured-warmth transport qualification. Nine changed or added component test files are selected by the unchanged full-suite globs; their tests are included in the 2,309 total and are not additional counts.

## Preserved contracts and gates

All **158 existing scripts**, all **six workflows**, the complete npm manifest/lock and all **56 npm commands** remain byte-identical to 210. All **64 contract entries except the intended Cargo lock** remain exact. The socket-warmth, application-call, fetch, physical-POST, complete503, completion/error and teardown checks remain unchanged. Every native financial assertion, durable intent marker, signature/principal/fee check and both actual 1,800-second refund minima remain intact.

The backup prerequisite retains 208's current profile, Worker generation and storage-revision ownership, retirement on mutation, lock/cancellation and copy cleanup. No signed-update UI or trust root is activated. QR211 retains public-review `authority: none` and post-await expiry/clock checks. Relay guards equal 206. No screened historical updater-browser adaptation or optional default wiring is added.

The Solana Cargo lock equals209 exactly. It contains 412 package records;411 remain unchanged from 210. Its sole changed record moves ctutils0.4.2 to 0.4.4, with checksum `12218662ccac37d9714f2191252553d67585b97df8c839cbe49e0bde278dc865`. The retained crypto-bigint0.5.5 advisory and maintenance warnings remain in 209's source-bound reports. No incompatible upgrade, new dependency-audit pass, host-to-SBPF inference or owner waiver is claimed. The prior 150 upstream library tests were not rerun here.

## Actual execution and artifacts

Node `v24.22.3`, npm `11.19.1` and `Python 3.12.14` were used. Pinned Foundry1.5.1 and solc0.8.30 were supplied through `FOUNDRY_BIN` and `FOUNDRY_SOLC`; full binary versions/hashes are in the plan. Existing Python oracle dependencies were present. A matching pinned dependency tree was physically copied into this new checkout; its root was not a symlink. No dependency installation or network resolution was needed.

| Executed gate | Actual result |
| --- | --- |
| Full `npm test` | **2,309/2,309**, zero failures/skips/cancellations/todos |
| `test:tooling` | **44/44** |
| Core typecheck | All **four configurations** passed |
| `test:build-policy` | **57/57** |
| `check:boundaries` | **238 production files /142 core modules**, passed |
| Default and demo builds | Both passed;13 and 14 complete files retained |
| `check:docs` | Engineering consistency true; six claims; semantic approval/publication false |
| `check:governance` | 12 historical,0 pending,57 rows,13 stale references; economic preparation false |
| `check:specs` | 173 documents, zero broken links or unindexed specifications |
| `test:specs` | **32/32 Python tests** |
| Exact source whitespace | Passed |

Both artifact variants retain `ReleaseEnabled:0`, false release acceptance, empty connection origins and `connect-src 'none'`. All six document/private-Worker/QR-Worker graphs have zero optional imports. Complete file hash maps and graph counts are embedded in the plan. These changed core artifacts are not claimed identical to 210: the backup and QR implementations intentionally change the reviewed core. The later optional isolation comparison instead uses fresh artifacts from the final composed core.

Docs preserve stale immutable source evidence and false semantic approval. Engineering consistency does not approve current-client distribution or release. No browser-named Node fixture is counted as an actual browser run. All original failures and prior source scopes remain recorded.

## Independent review and final base

Independent worker40 reviewed the exact frozen source, reconstructed its complete tree and ordered parents, and ran **54/54 focused maintained tests** with zero failures, skips, cancellations or todos. The scoped review found no open High/Medium integration finding. It also independently rehashed all 12 author logs,27 actual artifact files and 256 graph-module hashes. These checks are distinct from the author's2,309-test full execution.

Its separate report-only commit is `ce4be00e2ca4c0825f3226ed5b035cd2237ea11d`, tree `e7accc8a91b97499d7092cd37a2900ba5093361b`, with the frozen source as sole parent. It adds `INDEPENDENT_GENERATION10_CORE_REVIEW_20261120.md`. The report has SHA-256 `16f6ce67b5cc77a4d6b4c82566f78477e1d24e9de9317c1dbaef3f109c60c57d`. Its focused log digest and actual 54-pass summary were verified before this author report was finalized.

The final core report checkpoint includes this author report/plan and that independent review. The nine optional layers must start from that exact checkpoint. Root will preserve its tree when publishing210 and place any later publication mapping in PR200, so optional layer source and parent identities remain aligned. The frozen execution source above remains the test identity.

## Execution digests

Raw logs and structured evidence are under `/workspace/scratch/6bd6e00af1c0/verification/`. Every byte length and digest was checked before preparing this report. The plan embeds exact commands, source/tree, times, exits and parsed counts. The full suite was invoked once.

| Command record | Exit | Raw-log SHA-256 |
| --- | ---: | --- |
| full | 0 | `d72d4686bb1568a437ec6a12667730b84b8b86772cdb561a115392812bf5d00c` |
| tooling | 0 | `90e7f51970c1f2a5169dabff9d75cdba7b79e6ce1a0b149c7e259cd58af593e3` |
| typecheck | 0 | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| policy | 0 | `74b536ca0261b2ea4495806f24bd315d090f9feaaf6e5d6d502da9b77ee92a7a` |
| boundaries | 0 | `a2afff1ba06119367082cb0aec36223a649eae2fcc0580855c50a042cf9f7684` |
| build | 0 | `3afc8ae008321b743e6ca474df66cae86252277aec91a4f6b07567c0c9721775` |
| build-demo | 0 | `e2dc1489b78d2a471fd94103cdd041b8b4f77cd57b9815eabffd8a3f34fcf083` |
| docs | 0 | `daf413a4cebdd09e5376e2b1c01e17243116981faa90927bdb4a9935032f02c4` |
| governance | 0 | `42f9556636da25ed29969162b2b491dc3b013911d5d1488a709864b931dd7194` |
| specs | 0 | `25a3cbad6db1d8c778d8964481e666c962f5802d482d42d41ea0945dcd4290b9` |
| spec-tests | 0 | `4113a2adaabe80dc0bf492950de2e11bc156045557f7c19391a9d2eaafd4b11d` |
| source-whitespace | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

## Continuation limits

Root alone publishes using the current expected210 head, reviewed final tree and original source provenance. Original207,206,208,209 and 211 owner refs remain unchanged. Applicable exact-source hosted/native/browser checks and independent review remain merge gates; individual component passes do not qualify the combined source.

The optional continuation keeps nine separate packages and their expected original heads. It runs a new full combined suite and a fresh artifact comparison to the final core. Accepted standalone named-review conditions remain open. No optional default imports, release authority or deployment approval follow from this composition.
