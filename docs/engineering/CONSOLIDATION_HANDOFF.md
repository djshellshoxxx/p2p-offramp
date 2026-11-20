# P2P-Offramp consolidation handoff

## Current source and authority

Read this file and `consolidation-state.json` before changing code. The current user authorizes autonomous source engineering, qualified integration and successive native-worker generations. Keep `ReleaseEnabled=0`; deployment, releases, real funds, credentials and settings changes are outside this task.

| Reference | Exact value |
|---|---|
| Starting and latest observed main | `5c5a84ef6300330700c8b0ca54d074ac113f08be` |
| Primary consolidation PR | #188, `codex/max-consolidation-20261119`, observed head `a728ce290eb2fcbe9b4a9e857cc84ced401da70f` |
| Generation 1 source | `84814328f5534d6fceb2bbe74509fe37c5b48689`, tree `0d6d70bb4465c2ce6e9395b602dc3e59a91869b2` |
| Qualified QR browser repair | #189, head `9611d6a5cb404fed5d41eeb176dafb31c01de640`, tree `938b76f923df166717ef522666575e37a0623825` |
| Generation 2 initial source | `ac9a4b0ffc3ca50a299398e72554e7964a634cd4`, tree `f3ee86ab68eb60e4ab516037c58c9c498fc30ff4` |
| Generation 2 final source | `ef9d74258de63e98917c7a34a9392076ff86c35c`, tree `0fadc2154399d6bd70f6d988fa2670a84fa8c74b` |
| Generation 2 published PR | [#190](https://github.com/djshellshoxxx/p2p-offramp/pull/190), `codex/historical-recovery-20261119`, head `2b23ee614ff2dd05bd3a6e79f1278658c30a3909`, tree `a3701267756596e833247f50614c5ddc32f2cce0` |
| Local tree-identical final source | `f29422b6afdf7973e102edaed3a83bd48671bbde` |
| All-nine optional local composition | `a2f90cbdac973843e1dc71fe078e9433d66cfa75`, tree `aa285f9a8546b1c78bb0bca51c2bc350874b063b`; local qualification only |
| Current favorites review checkpoint | `6a01b49b04d9d49f80ea1c32579f050bfd5f61cc`; held for the independently reproduced finding below |

Resolve live branch heads and open PRs before continuing. PR #190 includes the generation 2 source and later report-only metadata. The nine optional source children are #191–#199. This newer coordination handoff is maintained separately to preserve the running source heads. **No main merge has been performed by this operation.**

The generation 2 source commit retains generation 1, the complete historical audit stack `06c6b9ab3728fcf743b2c003dd69b0310078b0ad`, and QR repair `9611d6a` as parents. Selective historical extractions preserve original source IDs and exact blob comparisons in their reports; whole obsolete runtime stacks were not merged.

## Inventory and completed source

`branch-inventory.json` and `BRANCH_INVENTORY.md` retain the immutable 192-branch baseline: A108 integrated, B20 duplicated, C41 partial/cumulative, D5 ready candidates, E2 defective candidates, F11 optional/experimental, G5 obsolete, H0 confirmed active writers. The initial inspection covered 184 PRs, including 41 open PRs at 40 distinct heads, with no tags or releases.

`REDISCOVERY_20261119.md` retains the earlier 194-branch/186-PR snapshot. The fresh `inventory-delta-generation3.json` observed **204 branches and 196 PRs** at 00:37 UTC November 20 / 16:37 Pacific November 19: 53 open, 105 merged and 38 closed-unmerged. All original 192 heads remain unchanged and present; the twelve additions are owned #188–#199 branches. Their actual main merge bases and divergence are recorded. Preserve these dated overlays and the original classifications; no external active writer was confirmed.

Generation 1 integrated seven source PRs, containing 20 distinct upstream commits:

- #171 bounded QR grouping and #172 typed hostile JCS descriptor failures.
- #174 repaired docs/lab/claims tooling.
- #179 funded Solana exit and encrypted browser recovery composition.
- #181 restored-profile and relay readiness correction.
- #183 public QR image/camera capture and review.
- #187 actual-byte bounds before retained review copies.

Generation 2 adds the following scoped work:

| Area | Original source | Completed scope |
|---|---|---|
| Asset update | #81 `a45e932a…`, with later malformed-envelope correction | Internal controller, HTTP and storage source; four reproduced IndexedDB open/close lifecycle repairs. Unexported and absent from application imports. |
| Personalization | #81 `a45e932a…` | Encrypted favorites and bounded reusable templates, with returned-error own-data normalization. No App/Worker wiring. Current retention is already equivalent after five `IntentV1` → `Intent` type adaptations and was not replaced. |
| Scriptless portal | #44 `f8a9aa14…` | Static source/recovery references, strict local headers and exact downloads. No executable recovery bundle or release approval. |
| Unsigned distribution | #44 `f8a9aa14…` | Two-pass reproducible local staging, tamper rejection, pinned current QR decoder graph and exact `OfflineRoot` artifact role. Approval flags remain false. |
| Inert governance | #156 `7a60893c…` | Historical records and source-bound assurance checks; status getter and inconsistent double-read regressions fixed using one detached snapshot. |
| Peer vector reproduction | #159 `1d3f59a9…` | Exact independent viem generator plus frozen-SHA and complete-byte regression for the already maintained v1 fixture. No protocol or fixture change. |
| Historical audit records | `06c6b9ab…` | Six dated audit entries retained as historical observations, without turning them into new execution or instructions. |

Stable completed IDs and full SHAs are in the state file. **Eighteen newly reproduced repair cases** are tracked separately from recovered upstream fixes: the previous twelve cases plus five returned-adapter diagnostic sites and one privacy-policy atomic-group composition defect. The five sites are courier secrets, meetup disclosure budgeting and policy storage, privacy-controls, and stealth storage. Their native vault already returns plain data; the repairs do not establish demonstrated network exploits. The separate QR/Solana profile isolation assertion is an integration check. The currently open favorites finding is not counted as fixed.

## Executed verification

Environment: Node 24.22.3, npm 11.19.1, Python 3.12.14. Foundry 1.5.1 and solc 0.8.30 were obtained with repository-pinned hashes verified. Runtime and framework dependencies remain pinned; no dependency version changed in these generations.

| Scope | Actual result |
|---|---|
| Starting `npm test` | 1,964 passed, 0 failed, 1 skipped |
| Generation 1 `npm test` | 2,072 passed, 0 failed, 1 skipped |
| Subsequent cast-dependent wallet oracle | 14/14 passed, zero skips; this is separate evidence, not a rewrite of the original skip |
| Generation 2 initial full suite | 2,152/2,152 passed, zero failures/skips |
| Generation 2 final full suite, including recovered vector generator | **2,153/2,153 passed, zero failures/skips** |
| Build policy | 54/54 passed |
| Maintained recovered tooling suite | 36/36 passed, including real two-pass distribution builds and tamper refusal |
| Generation 2 typecheck/default build | All four TypeScript projects and the default artifact passed |
| Generation 2 boundaries | 234 production files; 140 core entry modules; recovered modules remain outside the default core graph |
| Independent updater review | 94/94 affected tests; original lifecycle 2 pass/4 fail → repaired 6/6 |
| Independent historical tooling review | 31/31; governance 8 pass/2 fail → 10/10; distribution role 0/1 → 1/1 |
| Independent personalization review | 65/65 affected tests; final diagnostic RED 4 pass/6 fail (five scenarios plus parent) → GREEN 10/10 |
| QR/runtime repair checks | 29/29; independent QR oracle 3/3 |
| Peer-vector recovery | Independent worker 44/44 affected tests; coordinator generator `--check` and 9/9 acceptance tests |
| Foundry CI profile | 92/92 passed, 4,096 fuzz runs; 256 invariant runs at depth 100 |
| Actual local Anvil controller | 12 checks, 12 wallet prompts, 4 sends, 4 durable markers |
| Actual independent ERC-20 recovery proof | 4 checks, 8 signatures, 3 sends, 3 exact durable markers |
| Specifications / agreement fuzz / formal harness | 32/32, 26/26 and 22/22 passed respectively |

The full final command was `FOUNDRY_BIN=<verified-toolchain> FOUNDRY_SOLC=<verified-solc-0.8.30> npm test`. Use physical dependencies within each checkout: a symlink to another checkout's node_modules violates the maintained source-bound build policy. Source-specific reports include reproduction commands and log digests; the state file also retains main verification-log hashes.

Independent review documents include `INDEPENDENT_SECURITY_REVIEW_20261119.md`, `INDEPENDENT_TOOLING_REVIEW_20261119.md`, `INDEPENDENT_INTEGRATION_REVIEW_20261119.md`, `INDEPENDENT_EXTRACTION_REVIEW_20261119.md`, `INDEPENDENT_HISTORICAL_TOOLING_REVIEW_20261119.md`, `INDEPENDENT_PERSONALIZATION_REVIEW_20261119.md` and `GENERATION2_INTEGRATION_REVIEW_20261119.md`. No open High or Medium finding remains in generation 1/2 or the separately reviewed nine optional source scopes. The new favorites composition is a separate active review and has an open finding below.

## Hosted qualification and current gates

`HOSTED_QUALIFICATION_20261119.md` records actual hosted evidence, not a local-browser claim. PR #189 at `9611d6a` passed all seven original required contexts plus docs-tooling and native Nostr. Browser run `44640970749`, job `135971620360`, completed all ten maintained browser command groups. Its QR receipt records six journeys, real module Workers and bitmap decoding, real stream capture/cleanup using a synthetic camera source, actual encrypted vault lock clearing, and zero unexpected requests. It does not qualify a physical camera. Native EVM and ERC-20 browser steps also passed.

The hosted checkout `0b4567e88048d52a8ae4bd0c7d8ca4b23006f079` and head `9611d6a` have the exact same tree `938b76f9…`. Their identity was checked through GitHub Git-commit responses.

`GENERATION2_HOSTED_QUALIFICATION_20261119.md` records PR #190's actual **twelve passed browser groups**, including five portal checks and three unsigned-distribution journeys over 42 assets and two build passes. QR's six journeys passed again. The head and actual merge checkout `966fa1bc6d0ec840dde5f529183763bbc8d4a1f5` have the same `a3701267…` tree. All seven original required contexts plus docs-tooling and native Nostr passed; actual EVM and ERC-20 browser flows passed. Deployed-host, physical-device, signed-release and independent-distribution-witness claims remain false.

`NATIVE_AND_OPTIONAL_CI_20261119.md` records the 00:31 UTC / 16:31 Pacific snapshot:

| PR | Native Solana progress | Exact job |
| --- | --- | --- |
| #188 | Real-validator acceptance passed; actual encrypted Worker/browser refund step 16 running | run `44639090596`, job `135965138780` |
| #189 | Real-validator acceptance and Chromium setup passed; actual browser/refund step 16 running | run `44640971208`, job `135971622812` |
| #190 | Real-validator acceptance step 14 running | run `44644082116`, job `135982126950` |

Each workflow contains two real 1,800-second minimum-duration refund waits. Preserve those waits and avoid changing source heads merely to refresh documentation. Read current statuses before acting; do not infer completion from elapsed time. PR #188's old browser failure is already fixed and qualified on #189/#190; no new failure was observed on the latter heads.

Optional source heads parent `ac9a4b0…`, while their target is PR #190 at `2b23ee6…`. Their actual hosted merge trees therefore differ from their source-head trees. The native/optional CI report binds inspected merge checkouts to both ordered parents. Do not transfer a historical source-head pass or falsely assert tree equality. All optional PRs still had unfinished checks at that observation, including the dedicated proof-jobs browser/Worker gate. At the later 00:45 UTC / 16:45 Pacific read, liquidity #192 had passed every triggered workflow, including all five foundation jobs and twelve browser groups. Its package-only paths do not trigger the unchanged Solana workflow. It remains unmerged to preserve the parent's running native source head.

Local Chromium cannot launch because the execution environment forbids the required Unix socket behavior. Do not bypass that control or relabel source tests as browser passes. Issue #130's zero-job November 11 runs are historical; actual hosted jobs are executing now. No deployment or release workflow was added or invoked.

## Policy and historical evidence

Use the canonical accepted-decision index with the current user directive. Both combined integrations contain Tier C recovery/release-verification paths. Current source-integration authorization is already provided; do not ask for it again. Required exact-head checks, applicable native/browser qualification and independent review with no open High/Medium finding remain mandatory. The accepted Tier C text does not separately establish the older Tier B named-bot condition as an additional gate for these combined PRs; assess any standalone Tier B change and actual server-enforced rules on their own terms.

**D7 parking was superseded on November 18.** The nine optional packages are accepted for independent, one-package-per-PR source extraction with import-boundary checks. They are not rejected merely because their default app composition remains incomplete. No source acceptance activates financial, network, device or release authority.

Governance currently checks 12 historical records, zero pending records, and 57 assurance rows. Thirteen non-owned references are stale after current changes; this is reported explicitly. The original immutable assurance source remains `8649b7a1994ec21fe5557179d44e861b746bcda8`. Do not promote historical receipts to current execution, remove stale rows, or rebind them to make a check green.

## Nine optional source PRs and composition

All nine extractions have separate published PRs, author qualification and independent source review with no open High or Medium finding in their declared scope. Their default 13-file app artifact matched the generation 2 base exactly. Full original source IDs, remote/local heads, subtree hashes, report names and custom gates are in `optional_queue`.

| Package | PR | Published head | Executed package tests |
| --- | --- | --- | --- |
| proof-inputs | [#191](https://github.com/djshellshoxxx/p2p-offramp/pull/191) | `61f0c6c05d245c4cc7524852224d00693929df3c` | 21/21 |
| liquidity | [#192](https://github.com/djshellshoxxx/p2p-offramp/pull/192) | `0fb8452cb38c835e9dccb660f63f6af3156c9f91` | 28/28 |
| arbitration | [#193](https://github.com/djshellshoxxx/p2p-offramp/pull/193) | `f7bd867bc1ee15854b36ba268cedc275c2429c28` | 38/38 |
| privacy-policy | [#194](https://github.com/djshellshoxxx/p2p-offramp/pull/194) | `a419b420dcee58ce99391a0f73289aa28dc6413b` | 25/25 |
| courier | [#195](https://github.com/djshellshoxxx/p2p-offramp/pull/195) | `8ff5f5c23dcdda88f79d8f54056515635f0b65a1` | 61/61 |
| meetup | [#196](https://github.com/djshellshoxxx/p2p-offramp/pull/196) | `4bc4c7e2833b6b8540b8586624fb1697817e02e2` | 95/95 |
| privacy-controls | [#197](https://github.com/djshellshoxxx/p2p-offramp/pull/197) | `86952b1ccc8eb9c25a3be05d6a32d3c556df8c84` | 47/47 |
| stealth | [#198](https://github.com/djshellshoxxx/p2p-offramp/pull/198) | `8e46f3ccf6348a953cef177a4ffd6abfb971c31b` | 55/55 |
| proof-jobs | [#199](https://github.com/djshellshoxxx/p2p-offramp/pull/199) | `e7e1aa90072f4b0376820f0e9b28e609707de74f` | 30/30 |

Privacy-policy's Medium planning defect is fixed and independently closed: atomic-group validation now remains coherent after dependency/orphan pruning. Reproduced failing native cases no longer start a partial optional module; a retained complete pair still starts correctly. Do not reinstate the obsolete held status. The repaired source is in #194.

The local all-nine composition preserves every reviewed package subtree, all 52 existing npm commands and five unchanged workflows. It adds exactly six commands, three foundation steps and the original dedicated proof-jobs workflow. Only two append conflicts in `package.json` required a script union. `OPTIONAL_COMPOSITION_INDEPENDENT_REVIEW_20261119.md` records the coordinator's independent immutable-source checks. The actual combined full suite passed **2,553/2,553 tests with zero failures, skips or cancellations** in 245,457 ms. Seven TypeScript projects, native WASM cap, boundaries (300 production files / 140 core modules), 54 build-policy tests, 36 tooling tests, docs, governance and specs passed. All 13 default output files are byte-identical to the generation 2 reference, with zero optional-package graph hits. These are actual combined executions; individual package totals were not used as a substitute. Keep this local qualification branch separate from the nine reviewable package PRs.

## Active successor work and remaining functionality

Seventeen distinct native workers have actually been launched across these generations, with identities and finished scopes in the state file. Generation 2's five source/review workers are complete. Generation 3's rediscovery, source extraction and package cross-reviews are complete; optional_source_b now owns combined qualification. Two fresh generation 4 workers are implementing and independently reviewing favorites.

| Current owner | Isolated branch | Active responsibility |
| --- | --- | --- |
| optional_source_b | `codex/optional-composition-20261119` | Local all-nine qualification passed; finish source-bound evidence report; no remote integration write |
| personalization_favorites_ui | `codex/personalization-favorites-ui-20261119` | Current profile/generation/revision-bound Worker commands and saved-review favorites UI; repair review findings and qualify |
| favorites_independent_review | `codex/favorites-independent-review-20261119` | Independent native/runtime/registry/lifecycle review and reproduced regressions |
| coordinator | `codex/consolidation-handoff-20261119` | Durable handoff, state and inventory overlays; preserve running qualified source refs |

Favorites checkpoint `6a01b49…` passes seven actual native encrypted-vault cases, 56 build-policy tests, four typechecks, default build and boundaries. Its full suite found three new static-render test failures, which the author is investigating. Independent review also reproduced **two failing cases for a Medium stale-review reopening defect** at regression commit `d5ca7f1e72667331e73cef8376e0799cbb29f3df`: an aborted fresh load could reopen an older cached accepted route. The author is repairing this distinction; publication remains held until independent closure. This is a review-UI guarantee failure under trusted-port/infrastructure faults, not a demonstrated peer or funds exploit. No browser success is claimed; the new actual `test:favorites:browser` gate must run after publication.

Preserve the native contract: revision zero is valid for fresh/restore profiles; adding a favorite validates its current compatible review, while explicitly removing a loaded dangling favorite may succeed after review deletion. A dangling entry has no open authority; current-registry review must succeed before opening.

Remaining application work is explicit: favorites is active, template UI remains absent, and the updater has internal source but no active update UI or trust-root configuration. Solana funded exits are not full discovery/negotiation/funding parity. BasicEscrow has no arbitration settlement, and diagnostic arbitration cannot create it. QR decoding does not authenticate an invite. Physical wallets, camera/print/device coverage and owner-controlled trust inputs remain separate.

#155 intake remains preserved at its immutable source with its Waku signed-64-bit regression, mobile-wallet roundtrip failure, incoherent XMTP snapshot and unexecuted pinned-container qualification. These are concrete limits, not reasons to drop supported optional source packages.

## Exact continuation

1. Fetch main and all owned source branches. Read current handoff/state, latest PR heads, checks and active ownership. Keep the original inventory as a dated baseline and record only new deltas.
2. Preserve the passed all-nine combined qualification and finish current-head hosted checks for #191–#199. Independent package reviews are complete. Preserve every custom gate and the verified command/workflow union; merge only qualified packages in the required separate PR scopes.
3. Inspect PR #190's remaining native Solana gate. Its twelve browser groups and other listed contexts already passed. Preserve all running heads/waits; repair only a reproduced new failure in an isolated branch and continue independent work.
4. Integrate only qualified source. Recheck the combined tree after significant batches; do not transfer old-head checks to changed code. Main remains unchanged until applicable gates are satisfied.
5. Close the favorites review finding independently, resolve its actual test failures, publish its separate reviewed source and execute the actual hosted browser gate. Keep partial UI scopes and known experimental limits explicit; source acceptance does not invent trust roots, counterparties, custody or settlement authority.
6. Update the ledger with exact commits/tests/PRs and hand it to fresh workers. Continue the accepted-scope feature gaps after source recovery; do not restart solved D9/retention work or manufacture tasks.

Existing hourly continuation automation `Automation_ab68cc67e6ac8191bd31dc2d84a085e1` remains enabled; its prompt was refreshed at `2026-11-20T00:36:20Z` with all nine PRs and current ownership. Its 00:30 UTC run completed actual source/check inspection without changing source. Scheduled resumption is not an assertion that completed workers run permanently. Keep its prompt aligned with live source/PR heads without duplicating the schedule. Native agents and GitHub tools are available; do not invoke paid OpenAI/Codex services. If shell push lacks authentication, create Git blobs/trees/commits through the connector and verify exact local/remote tree equality before updating only the owned ref with an expected-head lease.
