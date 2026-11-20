# Generation 5: maintained core composition

Date: 2026-11-19 (America/Vancouver task date).

## Outcome and exact source

The maintained core composition passed **2,217/2,217 tests**, **42/42 tooling tests**, **57/57 build-policy tests**, all four TypeScript configurations, default/demo builds, import boundaries, documentation/governance checks and the specification checks. Every reported execution below is bound to source commit `de5bb8aadadd9b76099110262b2f7beb123f9421`, tree `ff1028ddc6c90119e38be7ca8fe3e007fb525b06`. Later commits add reports only.

This is a local integration and qualification checkpoint. It combines the independently reviewed favorites/templates runtime, immutable-copy/distribution tooling repair, Solana withheld-acknowledgment fixture repair and Solana restore-lifetime repair. The nine optional packages retain their separately reviewed PRs and are not integrated into this core candidate.

| Checkpoint | Commit or tree |
| --- | --- |
| Published generation-2 base, PR190 | `2b23ee614ff2dd05bd3a6e79f1278658c30a3909` |
| Templates author/report input, including favorites | `540bbba01a0d97d2481fc73fef4a6e0ba7046f7a` |
| Templates independently reviewed source | `45a4905368bc3acb2c87d9f9c5d33fee4197e3e1` |
| First merge, templates into generation 2 | `feaa27990d1b024c1fba148dbc5a6760f81b925b` |
| Restore author/report input, including acknowledged-send repair | `da931533df5f77b6eaa810ac35c18659b99374cc` |
| Restore independently reviewed source | `6207d14bf83213847620b0dd1541f2c7d2e3b893` |
| **Final qualified source** | **`de5bb8aadadd9b76099110262b2f7beb123f9421`** |
| **Final qualified source tree** | **`ff1028ddc6c90119e38be7ca8fe3e007fb525b06`** |

Worktree: `/workspace/scratch/6bd6e00af1c0/p2p-offramp-generation5-core`.
Branch: `codex/generation5-core-20261119`.
The base already contains the generation-1 and generation-2 recovery; neither is replaced by a competing implementation.

Both source merges used Git's normal merge strategy and completed without conflicts. No manual source edit was needed for composition. Only `package.json` and `.github/workflows/vault-foundation.yml` are shared changed paths between the two inputs. Their additions merged without replacing any existing command or workflow block.

## Exact preservation checks

The source audit compared immutable Git bytes, rather than relying on a clean merge result:

- All **46 non-shared paths** changed by the templates input exactly equal that input.
- All **11 non-shared paths** changed by the restore input exactly equal that input.
- Every one of the **52 baseline npm commands** retains its exact value. The final map is the exact **56-command union**: favorites, templates, withheld-acknowledgment browser and restore browser are the four additions. All non-script package metadata and dependency pins are unchanged.
- Removing exactly the four new browser step blocks reproduces all **125 baseline foundation-workflow lines** byte-for-byte. Each new block has its own Chromium environment. Five other existing workflows are unchanged.
- All **16 browser command groups** coexist: the 12 baseline groups plus the four additions. The actual acknowledged-send and restore diagnostics precede the existing browser groups. The favorites and templates groups retain their intended environments and positions after the existing web-browser group.
- `package-lock.json`, contracts, `packages/chain-solana`, `packages/wallet`, production distribution staging, both maintained wiki evidence records and the governance evidence manifest remain byte-identical to the base.
- The nine optional package subtrees are unchanged from generation 2. No optional package source, default wiring or dedicated optional-package workflow was introduced by this composition.

The Solana-specific script/UI paths equal the reviewed restore input exactly. The fixture retains its strict pre-forward physical-send oracle, uses the reviewed complete HTTP 503 response only for the withheld-acknowledgment branch, and retains zero automatic send retries. The full native browser script differs from generation 2 only in waiting for acknowledged `aria-busy:false` and waiting for that acknowledgement after locking. The financial assertions and real refund waits remain present and unchanged. Production Solana client/controller/chain source remains unchanged.

This audit establishes source preservation and tested local compatibility. It does not infer independent review of a new behavioral change: no new behavioral source change was made by this integration author.

## Executed local qualification

Environment: Node `v24.22.3`, npm `11.19.1`, the existing pinned dependency set physically copied into this checkout, and the shared pinned Foundry/SOLC toolchain. `node_modules` is not a cross-checkout symlink. Native-dependent commands used:

```sh
FOUNDRY_BIN=/workspace/scratch/6bd6e00af1c0/toolchain \
FOUNDRY_SOLC=/workspace/scratch/6bd6e00af1c0/toolchain/solc-0.8.30 \
npm test
```

| Command or check | Actual result on the frozen source |
| --- | --- |
| `npm test` with the toolchain environment above | **2,217/2,217 passed**; zero failures, skips, cancellations or todo; `114779.278434 ms`. |
| `npm run test:tooling` with the same environment | **42/42 passed**; zero failures, skips, cancellations or todo; `41469.666286 ms`. |
| `npm run typecheck` | All four configurations passed: root, runtime, Worker and UI. |
| `npm run test:build-policy` | **57/57 passed**; zero failures, skips, cancellations or todo. |
| `npm run check:boundaries` | Passed: **238 production source files / 142 core graph modules**. |
| `npm run build` | Passed: 12 scanned assets, 772,283 bytes; signed release and release acceptance false. |
| `npm run build:demo` | Passed: 13 scanned assets, 784,191 bytes; signed release and release acceptance false. |
| `npm run check:docs` | Passed with `engineeringConsistency:true`; six claims remain draft/stale, `semanticApproval:false`, `published:false`, `approvedRelease:null`. |
| `npm run check:governance` | Passed: 12 historical records, zero pending, 57 evidence rows, 13 retained stale references; `economicPreparationAllowed:false`, `authority:inert-record-only`; manifest current. |
| `npm run check:specs` | Passed: 173 documents, zero broken links and zero unindexed documents. |
| `npm run test:specs` | **32/32 Python tests passed**. |
| Browser script syntax | Favorites, templates, acknowledged-send, restore and revised distribution scripts passed `node --check`. This is not browser execution. |
| `buildSolanaRestoreArtifact()` without running its browser entry point | Passed: 11 emitted assets and actual Solana document/Worker graph assertions; release enabled remains zero. |
| Source/command/workflow/artifact comparisons | Passed as detailed in this report. |
| `git diff --check` | Passed. |

No failing test was ignored, converted to a skip or removed by this author. No dependency, lockfile, native compiler, workflow timeout, economic threshold, immutable receipt or acceptance gate was changed.

## Emitted artifact checks

All **13 default files** and **14 demo files**, including `local-build-evidence.json`, are byte-identical to the artifacts emitted from the final templates source. The scanner's 12/13 asset counts exclude that evidence file, explaining the different file totals.

Both private Worker graphs contain exactly four personalization modules:

- `packages/personalization/favorites.ts`
- `packages/personalization/src/favorites.ts`
- `packages/personalization/templates.ts`
- `packages/personalization/src/trade-draft-store.ts`

Neither document nor QR graph contains personalization. None of the nine optional packages appears in any of those graphs. Both artifacts retain `ReleaseEnabled:0`, `signedRelease:false`, `releaseAcceptance:false` and an empty connection-origin list. QR files and evidence are covered by the complete artifact byte comparison.

The build-only Solana artifact has **11 assets** and asset-list digest:

`ba257e8b5178c52014e4eb4c00a3047cb71cb63d33ed395add6dc7754497a7a4`

That digest is distinct from the standalone restore artifact digest `54937986dbf48ed92cb1ebf72ad1a003ba95f7283514f1ecd8f21de58201a946`. The integrated source also contains the reviewed template changes in shared `app.css` and `packages/schemas/src/runtime.ts`; those paths occur in the Solana source graphs. The standalone and integrated build logs retain the same content-addressed Solana Worker filename. Complete Solana artifact equality is **not** claimed, and the integrated artifact needs its own hosted execution. No browser, RPC endpoint, wallet prompt or financial transaction was run by this artifact-only build.

A preliminary scratch artifact checker requested an incorrect graph filename and stopped before graph inspection. The checker was corrected to the emitted `qr-graph-worker.json` and `local-build-evidence.json`, then the full comparisons above passed. A separate exploratory assertion that only CSS could differ in the Solana source graph correctly failed when the shared runtime schema was also observed; the report above includes both paths and makes no standalone-equivalence claim. Neither exploratory check changed source or weakened a gate.

## Distribution and immutable evidence remain explicit

The tooling suite now passes the current graph's exact favorites/template source admission and immutable copy-text hash negatives. It does **not** qualify this new App as a currently publishable distribution. Current locale bytes differ from the immutable draft wiki binding, so production staging continues to reject current source with `DISTRIBUTION_SOURCE_CHANGED` and no output directory.

The positive staging/browser fixture deliberately uses historical client `2b23ee614ff2dd05bd3a6e79f1278658c30a3909`, tree `a3701267756596e833247f50614c5ddc32f2cce0`, with current tooling copied into a temporary checkout and the mixture recorded as dirty. The revised browser harness reports `currentSourceDistributionQualified:false` for this path. Production `stage.mjs` and both immutable evidence records were preserved; no approval, receipt or source hash was rebound to conceal drift. When current evidence matches source, the harness retains its actual current-source staging path.

## Component reviews and report-only additions

The favorites and acknowledged-send review reports are already present in the two input heads. After freezing and qualifying the source, this branch appended the following reports only:

| Cherry-pick commit | Added report |
| --- | --- |
| `26f1a2918c33d1091e958eb8898f1c81999693b6` | `docs/engineering/INDEPENDENT_TEMPLATES_REVIEW_20261119.md` |
| `55d506a8c0817b4940558814e3f6148b592e5bc7` | `docs/engineering/INDEPENDENT_SOLANA_RESTORE_REVIEW_20261119.md` |
| `73ed719d8347b21004e1f047c8c08f8f24c25246` | `docs/engineering/INDEPENDENT_GENERATION4_COMPOSITION_REVIEW_20261119.md` |
| `043b24d809a264b16db6536b0f53e7fba80fc721` | `docs/engineering/GENERATION4_COMPOSITION_20261119.md` |

The templates review closes its workflow-environment finding and reports 80 affected checks, 38 policy checks, four TypeScript configurations/builds and nine final distribution cases, with no open High or Medium finding. The restore review independently reproduced RED 0/4, then GREEN 4/4 and the ownership case, all 339 affected tests plus three independent probes, four TypeScript configurations and 54 policy cases, with no open High or Medium finding. The generation-4 records document the independently closed immutable-copy/distribution repair and the separate all-nine optional composition. Adding those reports does not add their optional package source.

These independent component results keep their original source identities. The 2,217-test result in this report is an actually executed combined suite, not a sum substituted for execution. Independent review of this final composition and exact-head hosted checks remain the coordinator's next gates.

## Retained evidence and remaining execution gates

The coordinating workspace retains this run's logs and JSON comparisons under `/workspace/scratch/6bd6e00af1c0/verification-generation5-core`. The following hashes bind the actual local executions:

| Log | SHA-256 |
| --- | --- |
| `generation5-boundaries.log` | `a2afff1ba06119367082cb0aec36223a649eae2fcc0580855c50a042cf9f7684` |
| `generation5-build-demo.log` | `98696cd74ff6d79969c02786f7d990a36283c2101af1aa88c06fee04e494c360` |
| `generation5-build-policy.log` | `8d805ff15aa535680761b5de7f12acba3a2d400c2df0a186e6e118968daf9d97` |
| `generation5-build.log` | `ade830922784685ac4935d88a3c2ebb8b04e3a7b06da778e642aef36b22893e0` |
| `generation5-docs.log` | `daf413a4cebdd09e5376e2b1c01e17243116981faa90927bdb4a9935032f02c4` |
| `generation5-full.log` | `36626a89af28233901be3550f2ffb7c1e74743968b38b39b02f1e7a3977961af` |
| `generation5-governance.log` | `42f9556636da25ed29969162b2b491dc3b013911d5d1488a709864b931dd7194` |
| `generation5-solana-artifact.log` | `d652221682eceafa8584607b4feacfad65a7a2ce22405afcf4348eca327b6911` |
| `generation5-spec-audit.log` | `25a3cbad6db1d8c778d8964481e666c962f5802d482d42d41ea0945dcd4290b9` |
| `generation5-spec-tests.log` | `d220829e6b7c76ee5248777f4da9b2ef4dd9b044960a948692f3fd474f3b27d3` |
| `generation5-tooling.log` | `4f121ba387f78be9502e3e0b47083f5b6cd238fa43c9ffddd922ff64f4a467a4` |
| `generation5-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |

No local Chromium launch or socket-policy bypass was attempted. The new favorites/templates/restore browser scripts, revised distribution browser path, all retained browser groups and the complete native financial flows still require hosted execution on the published integrated source and its actual merge tree. Earlier component runs do not establish those integrated results. The real native-chain refund waits are retained and must complete; no local model or test clock is substituted for them.

The author made no remote writes, PR mutation, main merge, deployment, release, credential/settings change or real-funds action. The root coordinator owns publication, final composition review and the global consolidation handoff/state. This report does not modify that ledger or turn local qualification into release authority.
