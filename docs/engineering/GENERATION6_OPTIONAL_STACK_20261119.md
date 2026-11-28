# Generation 6 optional-package stack and local qualification

## Result and exact scope

The nine accepted optional packages are prepared as **nine distinct local integration layers** above published core PR205. The final frozen source passed **2,617/2,617 tests**, with zero failures, skips, cancellations or todo. All requested local qualification gates passed.

**This is local source qualification, not publication or main merge qualification.** No remote branch, PR metadata, workflow setting, release, deployment, credentials or funds were changed. The coordinator subsequently identified a **Medium stale Solana reconciliation-context finding in core205** and is independently checking correction `b67bd81e74b0f58338dc15bc694cd3a22b724cd4`. That correction is not in this frozen stack. These passing tests do not override the finding or the applicable hosted and standalone review requirements.

| Identity | Exact value |
| --- | --- |
| Published core PR205 | `cd7d54ba075118a7ec043788c17718be842ee405` |
| Published core tree | `ce3c69ddc36245f756005c540e521a26a3ce59b8` |
| Rediscovery input | `f7c144846d24fe194ee74172e339c4c2cbeb15e2` |
| **Frozen final stack source** | **`d67e022f71f14d54419bcb6987227b957d80107e`** |
| **Frozen final stack tree** | **`65d567546d93640358be842a71b31fcb445a3851`** |
| Worktree | `/workspace/scratch/6bd6e00af1c0/p2p-offramp-generation6-optional-stack` |
| Report branch | `codex/generation6-optional-stack-20261119` |
| Machine-readable plan | `docs/engineering/generation6-optional-stack-plan.json` |

The worker read the core handoff/state and generation5 rediscovery before modifying its isolated worktree. The coordinator later identified PR200 checkpoint `9d1129f189c2b7e5661384ade94da5270227af2e`; the assigned source baseline remained the published core above. Subsequent coordinator-owned UI/portal/reconciliation repairs require a separately reviewed composition. No uncommitted external change was imported.

## Nine preserved review scopes

Each layer starts from its own original published optional head and merges the preceding layer. The original optional head is the **first parent**; the preceding layer is the **second parent**. The first layer's second parent is core205. Every original head remains an ancestor, supporting a normal expected-head fast-forward of the existing owned remote branch once the coordinator satisfies the remaining gates.

| PR / package | Prepared local head | Exact tree | Paths changed versus preceding layer |
| --- | --- | --- | --- |
| 191 / proof-inputs | `32f14fdfcae37b016d1a2c51a7bee84cbc510cad` | `171e7767629782331493414b39660b4b1cdfe37b` | 12 |
| 192 / liquidity | `11ecc1be4fd32e4a2561da36cf409d46acff57f8` | `9d0157fe96f28be663fad56575a0bac15f0aa315` | 14 |
| 193 / arbitration | `e640faf1e3d4061d7f44178634f3a675760ea029` | `b4a8f621233e53db9a904e4e36e18415e303f8f1` | 20 |
| 194 / privacy-policy | `c55f7763878056f08f998b5112a46fa7b47ec50e` | `cf50c902278d544a508c90ba2ebcc0ac8bf44a5c` | 11 |
| 195 / courier | `325d45aeb16d1cc7c941695b0aac922fafa48655` | `6db48074a56dc325309d926d746ab0cefa67004e` | 24 |
| 196 / meetup | `bc2dd960c57f0678f0248fc32714151d05724c83` | `4b26e709bc8af8b9396874ac806b4aa729f77400` | 39 |
| 197 / privacy-controls | `1e9efb7c19cfdb24e4e7826bbab393d19b6988d1` | `c740f5d8563fb6c709696aa9507ffdc334a6e563` | 16 |
| 198 / stealth | `f6551b172b71fd84f4d9d0a6a6a229fa430d9517` | `11ff8a53ce1b9dd8e8f4566dd032eb70b439df24` | 21 |
| 199 / proof-jobs | `d67e022f71f14d54419bcb6987227b957d80107e` | `65d567546d93640358be842a71b31fcb445a3851` | 22 |

The JSON plan records every original published head/tree, package subtree hash, local branch, ordered parents, intended existing PR/base branch, exact changed paths and nonshared comparisons. Branches follow `codex/generation6-optional-<package>-20261119`. The report branch adds only this report and the JSON plan after the frozen source; it does not move a package layer.

Every layer's changed-path set is contained in that package's original source scope. Every nonshared changed file equals its original published blob. No layer changes another optional package. Previously included package subtrees remain exact, while later packages remain identical to core until their layer. All nine final package subtree hashes equal their separately reviewed published sources.

Only **#196, #197 and #199** needed content resolution, each confined to a `package.json` command-list append. Common command values and all non-script package metadata matched before resolution. The result retains the exact union. No package implementation, test, protocol or dependency was edited.

## Core and workflow preservation

The final delta contains **174 paths**, all within the nine package directories, scoped engineering evidence, the command list or two workflow paths. Exact comparison preserves **652 core source/tooling paths**, including the application, native financial/storage/crypto boundaries, schemas, wallet source, contracts, Solana scripts and dependency lock.

All **56 core commands** retain their values. The exact final union has **62 commands**, adding only:

- `typecheck:proof-inputs`
- `test:meetup:browser`
- `test:privacy-controls:browser`
- `test:proof:memory`
- `test:proof:browser`
- `typecheck:proof-jobs`

Removing exactly seven added foundation lines reproduces all **139 core foundation lines byte for byte**. Additions are one proof-inputs TypeScript line and complete Meetup/Privacy Controls browser blocks, each with its own Chromium environment. All **16 core browser groups** remain; foundation now has **18**. Proof-jobs retains its separate Worker browser workflow.

The complete `.github/workflows/optional-proof-jobs.yml` equals PR199's reviewed source. Five other workflows—EVM escrow, Nostr relay, existing agent inventory, Solana escrow and specifications—are byte-identical to core205. Pins, permissions, triggers and security assertions remain unchanged.

Core's strict physical-send observer, completed-503 fixture, restore ownership, explicit expired replacement, send/signature/marker counts, principal/fee assertions and zero-fixture-error requirement are preserved. Both real 1,800-second native refund minima remain. Optional source acceptance does not add default runtime authority.

## Actual local executions

Environment: Node **24.22.3**, npm **11.19.1**, Python **3.12.14**. Pinned Foundry and SOLC paths were supplied for the full suite. Dependencies are physically present in this checkout, with no cross-worktree dependency-root symlink.

The final complete suite ran **once against the frozen clean source**. Later heavy commands were serialized. Per-layer exact path/subtree/command checks establish individual scopes; the maintained tests of all packages execute together in the full suite. Old component totals were not summed to claim a new pass.

| Executed check | Actual result |
| --- | --- |
| `FOUNDRY_BIN=... FOUNDRY_SOLC=... npm test` | **2,617/2,617 passed**, zero failures/skips/cancellations/todo; **184,931.880803 ms** |
| `npm run test:tooling` | **42/42 passed**, zero failures/skips; **31,741.138316 ms** |
| `npm run typecheck` | All four core configurations passed |
| `npm run typecheck:proof-inputs` | One optional configuration passed |
| `npm run typecheck:proof-jobs` | Both optional Worker/fixture configurations passed |
| `npm run test:build-policy` | **57/57 passed**, zero failures/skips |
| `npm run check:boundaries` | **304 production files /142 core entry modules**, passed |
| `node apps/web/scripts/build.mjs` | Default build passed |
| `node apps/web/scripts/build.mjs demo` | Demo build passed |
| `npm run test:proof:memory` | Actual Node Worker/WASM bound passed |
| `npm run check:docs` | Engineering consistency true; six claims; semantic approval/publication false; locale stale |
| `npm run check:governance` | **12 historical /0 pending /57 rows /13 stale references**; economic preparation false |
| `npm run check:specs` | **173 documents**, zero broken links or unindexed documents |
| `npm run test:specs` | **32/32 passed** |
| Three optional browser-harness syntax checks | All passed; no browser execution |
| Exact source/workflow/package/artifact comparisons | Passed |
| Clean-source diff check | Passed |

The memory receipt reports initial **65,536-byte** WASM linear memory, growth to **268,435,456 bytes (256 MiB)** and refusal beyond the cap, with zero imports. It explicitly leaves browser qualification, provider approval, proof verification and device peak-memory qualification false. This is actual Node Worker/WASM evidence, not browser WASM qualification under the unchanged CSP.

Current locale drift and false semantic approval remain. Current unsigned staging is refused. Positive distribution tests use the explicitly identified historical client with current tooling and `currentSourceDistributionQualified:false`; they do not approve distribution of the new client. No receipt or immutable source binding was rewritten.

### Nonqualifying preparation history

An early full-suite command accidentally began before all nine layers were frozen. It was interrupted with exit code **130** and is retained as `generation6-optional-stack-preliminary-incomplete.log`. It emitted a localnet-readiness failure during unfinished preparation. No result from that attempt is assigned to the final frozen source or counted as qualification.

A later tool interruption left a zero-byte index lock belonging only to this worktree, dated 02:07:41 UTC. Once old process handles were unavailable and six completed refs were inspected, the stale lock was retained in scratch evidence and moved; preparation resumed from existing commits. No completed layer was overwritten or recreated.

The first append resolution also encountered an inherited trailing blank line in `NATIVE_AND_OPTIONAL_CI_20261119.md` during the worker's broad staged whitespace check. That historical blob was preserved. The worker checked its resolved command-list file directly. No repository gate or assertion changed. These preparation issues are not new product defects.

## Emitted artifact evidence

All **13 default files** and **14 demo files**, including `local-build-evidence.json`, are byte-identical to the preserved core205 artifact reference. Scanner public-file counts are 12/13 because local evidence is outside that scanner count; complete directory comparisons are 13/14.

| Graph | Default modules | Demo modules | Optional hits |
| --- | ---: | ---: | ---: |
| Document | 93 | 95 | 0 |
| Private Worker | 30 | 30 | 0 |
| Public QR Worker | 4 | 4 | 0 |

The private Worker retains exactly four personalization modules: the favorites and templates facades, plus `src/favorites.ts` and `src/trade-draft-store.ts`. Neither document nor QR graph contains personalization. Exact QR graph/decoder bytes are preserved. Both variants retain `ReleaseEnabled:0`, false release acceptance, empty external connection origins and `connect-src 'none'`.

Source-audit and full artifact hash maps remain in scratch verification, with their SHA-256 values bound by the plan. This worker did not rerun the long native validator/browser or claim a new Solana browser qualification. The coordinator reported all five core205 foundation jobs and sixteen browser groups passed; those results are not transferred to this nine-package source.

## Evidence digests

| Actual log | SHA-256 |
| --- | --- |
| `generation6-optional-stack-full.log` | `c04e6b923f790bc0da21b5b449570ffae81e56141df66f292f2a04edcc1d02e3` |
| `generation6-optional-stack-tooling.log` | `90d54f6471d0c09335490344e2bb4c7c14fe8838fa9195842efe662e1533372e` |
| `generation6-optional-stack-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `generation6-optional-stack-proof-inputs-typecheck.log` | `1e305eb1bfb14f1b5f68a29cd70d3d9dd040f5dd119fbbc45d75ca92a7e97e00` |
| `generation6-optional-stack-proof-jobs-typecheck.log` | `01003589ca24dff5de5e5b62865f20ccb201f4b2a147d91fe1299cd36dfacfb0` |
| `generation6-optional-stack-policy.log` | `a0e3b95c40a9ff9d498a694c7dd2b475464629d451de5bd492a9acedb6c28272` |
| `generation6-optional-stack-boundaries.log` | `62ff0a9ff83e69b28299389c00aed569fc8ea560697e46cfee47bdbd60734adc` |
| `generation6-optional-stack-build.log` | `f0d89e21c8921e9c0dad98f76e3d7b3ca407fdba0e3743319c2839c00614bfe8` |
| `generation6-optional-stack-build-demo.log` | `ec557ca87a8eb6b46cc57eb155636ff9b80401dd70847d9f6f65c2050332fee7` |
| `generation6-optional-stack-proof-memory.log` | `c23b861046b8c4db97b176c6021d6defd6cc8163dd0f3a89be90a2536e8cf805` |
| `generation6-optional-stack-docs.log` | `daf413a4cebdd09e5376e2b1c01e17243116981faa90927bdb4a9935032f02c4` |
| `generation6-optional-stack-governance.log` | `42f9556636da25ed29969162b2b491dc3b013911d5d1488a709864b931dd7194` |
| `generation6-optional-stack-specs.log` | `25a3cbad6db1d8c778d8964481e666c962f5802d482d42d41ea0945dcd4290b9` |
| `generation6-optional-stack-spec-tests.log` | `aa191d491b95185a38182444bb6ccfd8ca8e6bb984376192a95d082f357b4ca7` |

The plan also binds source-audit/artifact-comparison JSON digests and the excluded preliminary log. Exact source/toolchain identities and command names permit repetition; hashes do not replace the observed process exits and assertions.

## Publication and integration continuation

The JSON is a prepared local stack. It does not waive current source findings or qualification.

1. Resolve live core, optional heads, active ownership and current handoff. Every proposed update must match its recorded original optional head; preserve other writers.
2. Close and independently qualify the coordinator's new core findings, including the reported reconciliation Medium. Recompose against the reviewed corrected descendant. These results stay bound to `d67e022f71f14d54419bcb6987227b957d80107e`.
3. Satisfy applicable standalone review conditions, including the accepted Tier B CodeRabbit/Qodo condition where applicable. This worker obtained no named-service pass and waived no condition.
4. Keep the existing one-package PRs. Set the intended base before advancing its head. Publish each exact tree with original optional head as first parent and the actual published preceding head as second parent. Connector-created IDs may differ from local IDs; require exact tree and ordered-parent equality.
5. Use expected-head leases and normal fast-forwards. Observe new actual workflow execution, checkout tree and parents. Do not transfer old-head checks or assume a base-only edit ran qualification.
6. Merge only after exact-source gates and independent review. In dependency order, verify current main matches the intended preceding tree and the prospective merge tree equals the qualified tree. Preserve historical failures and every native wait/assertion.
7. Maintain coordination records separately from source qualification. This local preparation establishes no main merge, deployment, release or optional default activation.

The package scopes remain accepted reference implementations. This work adds no default wallet, network, proof-provider, dispute-settlement, physical location, release or custodial authority.
