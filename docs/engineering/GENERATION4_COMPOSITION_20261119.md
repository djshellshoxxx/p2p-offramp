# Generation 4 source composition and tooling repair — 2026-11-19 series

## Result and exact source

**The final local composition qualification passed.** The actual full npm run reported **2,580 passed, zero failed, zero skipped, zero cancelled and zero todo**. The corrected tooling suite passed **42/42**, all seven TypeScript configurations passed, and default/demo artifacts remain byte-identical to the independently reviewed favorites source. These are actual combined executions, not sums of package results.

**Current-source unsigned distribution remains blocked by the changed draft locale.** The staging guard still refuses stale evidence. The positive distribution tests use the exact historical PR #190 client with current tooling and explicitly identify that scope. No current favorites distribution, hosted Chromium, native validator, release or device qualification is inferred from those tests.

| Binding | Exact value |
| --- | --- |
| Local branch | `codex/generation4-composition-20261119` |
| Isolated worktree | `/workspace/scratch/6bd6e00af1c0/p2p-offramp-generation4-composition` |
| Base, published PR #190 | `2b23ee614ff2dd05bd3a6e79f1278658c30a3909` |
| Reviewed all-nine optional source, including author report | `27fba7450600836b5edc131ae1f4f1744ae96248` |
| Favorites source added | `ea30075d2f0859f6320260a96e93c4ceffc01dcf`, exact tree of published PR #201 `f5241c09f268a7a6841a5760ed0faa90b5b7f005` |
| Solana fixture source added | `499bccd8f621217f1f8d3d2671625d51c3d19709`, exact tree of published PR #202 `d753c0af23ff43743e34679e6b778b9ac0370da2` |
| Favorites integration commit | `f187f860bac86765892cfbaeacec218e386a2a10` |
| Initial composed source | `5ebeaa646d0b6e09a09a9a5852ff2905653f1841` |
| Initial composed tree | `cbf4e03186906f8ccf0c8e23ec1737700dd19952` |
| Narrow failing regressions | `57ef47d60f755284ab0a48e43373a657de0c2f40` |
| Final repaired and qualified source | **`86a2b93666b029ea3bfc3a5e9c1ee3b89bdb6d28`** |
| Final qualified source tree | **`ef66dcdfe3db18ddd9d28a2b61a571fe2b65ef16`** |

The final command sequence ran from 01:29:37 through 01:32:48 UTC on November 20, 2026 (November 19 in Pacific time). This report is added afterward in a documentation-only commit. Executable source stayed frozen throughout the final sequence.

This is a local qualification branch. It does not replace the nine separate optional package PRs or authorize default activation of those packages. No remote write, main merge, deployment, credential, fund or release-setting change was performed by this worker. Templates are a separate active source scope and are absent from this composed application graph.

## Composition and preservation audit

The source audit checked exact content, not only filenames or commit counts:

- All nine package subtrees equal the published and independently reviewed inputs below.
- All 26 non-shared favorites paths and six non-shared Solana repair paths equal their reviewed input blobs. Their independent review reports remain present.
- The original composition is an exact **207-path union**. The subsequent correction changes exactly eight declared tooling/test paths, producing **215 changed paths** against PR #190 before this report.
- All 52 base npm command values and all non-script package metadata are preserved. There are 60 commands: six optional-package additions, the favorites browser command and the Solana acknowledgment diagnostic.
- Removing the five additive foundation blocks reproduces the base workflow bytes. The additions are proof-inputs typechecking, meetup browser checks, privacy-controls browser checks, favorites browser checks and the early Solana acknowledgment diagnostic.
- Five other existing workflows remain byte-identical. The dedicated optional proof-jobs workflow is byte-identical to PR #199.
- Contract source, production Solana package/application source, the strict physical-send observer, the complete native Solana browser harness, both real refund waits, and `package-lock.json` remain unchanged.

The favorites base-to-head patch applied without conflicts. The Solana patch produced one `package.json` append conflict. Its resolution first verified equality of all common script values and all non-script metadata, then retained the union of 59 existing commands and the one exact acknowledgment command. No implementation was reconciled by choosing one side of a conflict.

| Optional package | Published reviewed head | Equal subtree |
| --- | --- | --- |
| proof-inputs | `61f0c6c05d245c4cc7524852224d00693929df3c` | `8ce13a63a8df82b00cea3405d246babfe7f89746` |
| liquidity | `0fb8452cb38c835e9dccb660f63f6af3156c9f91` | `ef4dace6c26423b61d98c6012e54ab56d714428e` |
| arbitration | `f7bd867bc1ee15854b36ba268cedc275c2429c28` | `f6a8051adf0c1adeb5b655240ad478c58fac1ac6` |
| privacy-policy | `a419b420dcee58ce99391a0f73289aa28dc6413b` | `5ab375b6f3b5520bd6059ff858f48699edf53aca` |
| courier | `8ff5f5c23dcdda88f79d8f54056515635f0b65a1` | `276211811104349ad9431dae3f64f3ea83c299b6` |
| meetup | `4bc4c7e2833b6b8540b8586624fb1697817e02e2` | `a3fd556fb78cfbf8c0546068db657c4c69a7c9c7` |
| privacy-controls | `86952b1ccc8eb9c25a3be05d6a32d3c556df8c84` | `21480b1081bf720b21afa8277f2bfe99208790cc` |
| stealth | `8e46f3ccf6348a953cef177a4ffd6abfb971c31b` | `0a24172c193fc3f7c2f7fd8967f107e2e37b5f73` |
| proof-jobs | `e7e1aa90072f4b0376820f0e9b28e609707de74f` | `4be7a4564974f96d8396f4901fbeb63789eaed75` |

The relevant source and workflow facts are recorded in `generation4-source-audit.json`. The later `generation4-repaired-source-audit.json` proves that the correction leaves every reviewed input path intact and adds only the eight named repair paths. It also checks that command/workflow bytes, production staging logic and maintained evidence records have not changed after the initial composition.

## Reproduced tooling defects and correction

### Initial failures retained as failures

The initial source `5ebeaa6` passed its actual full suite, **2,580/2,580**, and seven TypeScript configurations, 56 build-policy tests, native WASM and import-boundary checks. Its tooling run then returned **32 passed / 4 failed**, exit 1:

| Failing case | Actual cause and disposition |
| --- | --- |
| Actual two-pass distribution staging | `DISTRIBUTION_SOURCE_PATH`: the new exact favorites facade was not an admitted source input. Repaired with a narrow two-file admission. |
| Current evidence drift fixture | The test assumed exactly one stale file; the current locale was already correctly stale. Repaired by asserting the exact union of baseline stale paths and the intentionally changed evidence path. |
| Symlinked evidence fixture | The same absolute-count assumption ignored the already stale locale. Repaired with the exact union assertion; symlinked bytes remain non-current. |
| Immutable copy text negative case | A forged recorded `sourceTextSha256` was accepted when the current catalog was stale because validation skipped text-hash equality in that state. Repaired by deriving text from the immutable catalog bytes. |

The two isolated regression cases at `57ef47d` both failed against the original behavior: **0 passed / 2 failed**, without skips. They specifically test the forged recorded copy-text hash under stale current source and exact favorites source admission, including rejection of the personalization barrel and unrelated paths.

The coordinator separately corroborated the four original failures on PR #201's actual [hosted docs job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44651072999/job/136005796681). Its [browser job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44651072999/job/136005796688) failed in distribution staging before the new favorites browser step, which was skipped. These are coordinator-observed hosted failures, not browser execution by this composing worker.

### Immutable copy text stays strict while current drift stays stale

`scripts/docs/copy-source.mjs` reads a bounded literal `definitions` profile using the already pinned TypeScript scanner. It does not import or execute historical catalog code. It rejects executable expressions, getters, spreads, duplicate keys, unsupported literal shapes, malformed UTF-8 and oversized input. The parser bounds source bytes, token count, property count, recursion and string lengths.

The validator hashes each recorded copy text from the same immutable bytes whose whole-file digest matches `copySource.sha256`. Current working-tree changes remain in `stale`, all affected claims remain non-current, and a malformed recorded text hash is refused even when the current catalog has drifted. The generator now derives text from those same selected immutable bytes rather than importing a later working-tree catalog.

Tests independently exercise current label edits, malformed recorded hashes, nonexecution of appended source statements, refusal of executable definitions, and generation in an isolated fixture. The generator test changes a current label, invokes the actual generator against the selected immutable source, and verifies that both generated record files remain byte-identical to the original fixture records. It does not rewrite maintained repository records.

This is an internal evidence-consistency correction. A stale claim was already projected as non-current; no peer exploit, transaction authority or funds loss was demonstrated. The two stale-count fixes are test maintenance, not additional product vulnerabilities.

### Exact source admission and preserved staging refusal

The distribution source inventory admits only:

- `packages/personalization/favorites.ts`
- `packages/personalization/src/favorites.ts`

The namespace is checked before the broader package-path rules. The barrel, templates, other implementations and personalization test files remain refused in this source scope. A later template integration must separately add its exact reviewed pair with corresponding negative tests.

**`scripts/distribution/stage.mjs` is byte-identical to the pre-repair source.** Both `docs/wiki-source/claims-register.json` and `docs/wiki-source/docs-manifest.json` are likewise byte-identical. The immutable source mismatch guard is not relaxed, and no historical receipt is rebound.

With the missing facade admitted, actual current staging reaches the existing stale-evidence check and refuses with `DISTRIBUTION_SOURCE_CHANGED`, leaving no output directory. The test suite asserts that refusal explicitly. It does not report the current favorites client as distributed.

For the positive staging and nested-browser fixture, a temporary detached worktree uses exact PR #190 commit `2b23ee614ff2dd05bd3a6e79f1278658c30a3909`, tree `a3701267756596e833247f50614c5ddc32f2cce0`. Five current tooling files are copied into that worktree with their SHA-256 identities recorded. The client/evidence source remains historical and the resulting source manifest accurately reports the tooling overlay as dirty. Physical dependencies are copied within the checkout; there is no cross-checkout node_modules symlink.

The positive local tests execute actual repeated two-pass builds, exact artifact verification and retained tamper/symlink/nonregular/unexpected-file cases on that fixture. The browser harness preserves its existing three journeys and explicitly labels a historical fallback, reporting `currentSourceDistributionQualified:false`. When current evidence matches in a future source state, the browser harness still stages and exercises the actual current client instead of selecting the historical fixture. Both fixture-using foundation jobs already retain `fetch-depth: 0`; no checkout or CI gate was weakened.

## Final executed qualification

Every command below completed with exit code **0** on frozen source `86a2b93`. The original failure logs remain separate and unchanged. The full suite was rerun after the correction; its result is not transferred from the initial composition.

| Command | Actual result |
| --- | --- |
| `npm run test:tooling` | **42/42** passed, zero failures/skips/cancellations; includes actual current-source refusal, historical two-pass staging/tamper checks and immutable generator regression |
| `npm test` with pinned Foundry variables below | **2,580/2,580** passed, zero failures/skips/cancellations/todo; runner duration **143725.172842 ms** |
| `npm run typecheck` | Four maintained TypeScript configurations passed |
| `npm run typecheck:proof-inputs` | Dedicated configuration passed |
| `npm run typecheck:proof-jobs` | Worker and real-App fixture configurations passed |
| `npm run test:proof:memory` | Actual native Node Worker/WASM memory-cap probe passed |
| `npm run check:boundaries` | **301** production files; **140** core-entry modules |
| `npm run test:build-policy` | **56/56** passed, zero failures/skips/cancellations |
| `node apps/web/scripts/build.mjs` | Default artifact built; the four maintained typechecks ran separately above |
| `node apps/web/scripts/build.mjs demo` | Synthetic demo artifact built |
| `npm run check:docs` | Engineering consistency true; six claims/seven pages; locale and all six claims remain stale; semantic approval/publication false |
| `npm run check:governance` | 12 historical, zero pending, 57 evidence rows, 13 stale references retained; manifest check passed |
| `npm run check:specs` | 173 documents, zero broken links, zero unindexed documents |
| `npm run test:specs` | **32/32** Python tests passed |
| `node --check scripts/distribution/browser.test.mjs` | Syntax passed; browser entry point was not executed |

The full-suite command was:

```sh
FOUNDRY_BIN=/workspace/scratch/6bd6e00af1c0/toolchain \
FOUNDRY_SOLC=/workspace/scratch/6bd6e00af1c0/toolchain/solc-0.8.30 \
npm test
```

The runtime was Node **24.22.3**, npm **11.19.1**, Python **3.12.14** and TypeScript **7.0.2**. Foundry is **1.5.1**, commit `b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2`, and solc is **0.8.30**, binary SHA-256 `f3e987dc6ecebd4bd350c48edcbc320b46cf9e3109bd3fc3d88f1acaf4c428f7`. No dependency version changed. This execution does not claim a separate fresh Foundry contract suite or real-validator acceptance run.

The native WASM probe reported 65,536 initial bytes, a 268,435,456-byte maximum, zero imports, and refusal to grow beyond the maximum. Its module SHA-256 remains `c834f277a5fac1646aad76810a65d523046ffa04f0c985bf987695fbbd6bcbed`; it explicitly does not qualify browser/device peak memory or proof/provider authority.

The actual Solana acknowledgment diagnostic bundle was also built and syntax-checked before the tooling-only correction. Its unchanged runtime source produced SHA-256 `8e1d06fb99e221589dfdd888a8b120ac45195dc63535a39de1f000f7b835cb0a`, matching its independently reviewed input. No Chromium invocation was made.

## Emitted artifact and authority checks

The fresh final artifacts were compared with a preserved hash manifest of the qualified favorites worktree at `ea30075d2f0859f6320260a96e93c4ceffc01dcf`. All path sets and SHA-256 values match:

| Artifact | Complete emitted files, including build evidence | Scanner public-file count | Equality to favorites reference |
| --- | --- | --- | --- |
| Default | **13** | 12 | Every file byte-identical |
| Synthetic demo | **14** | 13 | Every file byte-identical |

The earlier generation-2 byte-equivalence claim is not reused after favorites changes the application. The correct comparison here is to the reviewed favorites source.

| Graph | Default module count | Demo module count | Personalization / optional package result |
| --- | --- | --- | --- |
| Document | 91 | 93 | No personalization or any of the nine optional packages |
| Private Worker | 28 | 28 | Exactly the favorites facade and implementation; none of the nine optional packages |
| Public QR Worker | 4 | 4 | No personalization or optional packages; exact original decoder graph |

The private Worker graph SHA-256 is `fc6e294f349a00ce7df83f322f4a6feaba1e507039a7d57bbadf2c414132f98e`. The unchanged QR graph SHA-256 is `2ac8e09215fa502063726b0e10c0091585dd710c9b507d9bbadaa142036e53ce`; its decoder bytes retain SHA-256 `ad0ef65d9c94c186d2734390499811d003a77818e3b2ebc049528d425e56f5ef`. Both artifacts retain `ReleaseEnabled:0`, empty external connection origins, and false signed-release, release-acceptance and physical-device flags.

The docs receipt remains bound to `84814328f5534d6fceb2bbe74509fe37c5b48689`. The only stale source is `apps/web/src/ui/locale/en.ts`; all six claims remain non-current. Governance retains immutable source `8649b7a1994ec21fe5557179d44e861b746bcda8` and `economicPreparationAllowed:false` / `inert-record-only`. Passing their checks does not promote these records to current semantic approval.

## Independent review and continuation

The coordinator independently reproduced the two-case RED checkpoint, then applied the correction in a separate checkout. Its source tree exactly matched `ef66dcdfe3db18ddd9d28a2b61a571fe2b65ef16`. It independently executed **4/4** focused cases and **42/42** tooling tests and reported **no open High or Medium finding** in the eight-file correction or preserved composition. The independent tooling log SHA-256 is `ad01f66ace09c04944ae98dbf8c4f5fda13885cf5007e8ac2706c77b2d836b10`; the coordinator owns the separate review report and publication decision.

To transfer only the narrow correction to the favorites or templates branch, cherry-pick `57ef47d60f755284ab0a48e43373a657de0c2f40` followed by `86a2b93666b029ea3bfc3a5e9c1ee3b89bdb6d28`. These commits do not contain the optional-package integration. The templates author has already received them and must retain its separately reviewed exact source admissions. Keep the nine optional source PRs separate.

The final source still needs applicable exact-head hosted qualification before remote integration. In particular, the revised distribution browser harness and actual favorites browser gate have not been executed locally. The local Unix-socket restriction was not bypassed. Native Solana validator/encrypted-Worker/refund qualification remains with the coordinator's hosted repair sequence. The current unsigned distribution remains explicitly blocked until its current source/evidence binding is separately resolved; no claim of distribution readiness is made here.

## Evidence digests

Completed logs and audit manifests are under `/workspace/scratch/6bd6e00af1c0/verification/`. The command-results manifest binds every final command to the frozen source/tree, UTC start/end, observed exit code, duration and log hash. The initial 32/36 failure and isolated 0/2 RED files are retained alongside the successful final results. One newly authored extraction test initially used the wrong quote style in its fixture marker; that test setup was corrected before the final source was frozen, without a production change or an additional claimed product defect.

| Evidence file | SHA-256 |
| --- | --- |
| `generation4-final-tooling.tap` | `feef460647581a17e0140b12aa6ca305ce76b492dad17d70e8e2446e8207cc55` |
| `generation4-final-full.tap` | `2ebf8eda8fcb0e4a1389d7caf097372319c4c874c01c7c34b807abb0a3d6e507` |
| `generation4-final-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `generation4-final-proof-inputs-typecheck.log` | `1e305eb1bfb14f1b5f68a29cd70d3d9dd040f5dd119fbbc45d75ca92a7e97e00` |
| `generation4-final-proof-jobs-typecheck.log` | `01003589ca24dff5de5e5b62865f20ccb201f4b2a147d91fe1299cd36dfacfb0` |
| `generation4-final-proof-memory.log` | `c23b861046b8c4db97b176c6021d6defd6cc8163dd0f3a89be90a2536e8cf805` |
| `generation4-final-boundaries.log` | `489cd2664c03e70d21b310fb4e43fbd185703c890bcfb2b12456c093c89e4d9f` |
| `generation4-final-build-policy.tap` | `1cdfcb33834b9b62289ef82d99b9572cb5daa93925fb613b1a099da26638059c` |
| `generation4-final-build.log` | `b3be519316eaaa415697318052b631c4f5bebf2a148813aabfa225dbfacaa98f` |
| `generation4-final-build-demo.log` | `cbda2fabbdd0d764fba2e9cc0cd9e59c5600e8931a87141e49e9f95aa98e3e64` |
| `generation4-final-docs.log` | `daf413a4cebdd09e5376e2b1c01e17243116981faa90927bdb4a9935032f02c4` |
| `generation4-final-governance.log` | `42f9556636da25ed29969162b2b491dc3b013911d5d1488a709864b931dd7194` |
| `generation4-final-spec-audit.log` | `25a3cbad6db1d8c778d8964481e666c962f5802d482d42d41ea0945dcd4290b9` |
| `generation4-final-spec-tests.log` | `335ecfb03c990c9568e5b16815e07fe62d68692fc269692c109f5bc5aec009dd` |
| `generation4-final-browser-harness-syntax.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `generation4-final-command-results.json` | `fceea923c899e0b15a4935f6f1b61d6cbd8972793a6d63d188b611ac6cf95b85` |
| `generation4-source-audit.json` | `6c06d8ea92202afd383007817aa998132c7e3d2114c0e05d4b015ae09fbe7c6c` |
| `generation4-repaired-source-audit.json` | `3f8d51876d056a9f5f8939686c36c3fabdf89109093a82f397aee6510fb1f57d` |
| `generation4-artifact-audit.json` | `fcd2a01e634c51184d9898c2e9911a52dac33a4312314afd7d52089cf7baabed` |
| `generation4-favorites-artifact-reference.json` | `5cf4b6557df82fc773e0d4cc4a4db2f39784eff5c92e8590dc318888bb3d7802` |
| `generation4-environment.json` | `477e392b5ef048e5cf43dd685f3e21d2865d0cfb3b9ede752032b88d554867b9` |
| `generation4-full.tap` | `02e1f06bed7e8fd5efcbcbc696e4a6d30829f73463ae9e1335da5077975470e6` |
| `generation4-tooling.tap` | `6ddaf8b7f15bf8abf7d254c7c2296980308f0a86e0f9051114a902dc51ea39ad` |
| `generation4-tooling-red.tap` | `b63f65c81907552d3cf481bcb72e35dd8a8122c02e79a3db81876940c87ee54f` |
| `generation4-tooling-focused-green2.tap` | `6a0e258bb02ac25166b7ded7da1f65d828db9cd79b40866a4bba9d4790d91c71` |
| `generation4-generator-green.tap` | `7ca0ed43616276e6ceb818e5a57527a5a3d21d13b7d33fc6b878ee07fe11b11e` |
| `generation4-browser-diagnostic-static.log` | `eff070ee7856535c4e8803ab212f7f199fbd6db5451fffe55c4f9fdd0ab03db0` |
