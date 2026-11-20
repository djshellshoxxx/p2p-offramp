# Personalization trade templates: current runtime composition

Date: 2026-11-19 (America/Vancouver task date).

## Scope and source identity

This change composes the accepted native encrypted template store into the maintained offline App. It starts at published favorites PR201, `f5241c09f268a7a6841a5760ed0faa90b5b7f005` (tree `2e88aa8eec7a6e609ca113d35a36177c40bf156d`), which is the published tree corresponding to the reviewed local favorites head `ea30075d2f0859f6320260a96e93c4ceffc01dcf`.

Worktree: `/workspace/scratch/6bd6e00af1c0/p2p-offramp-templates-ui`.
Branch: `codex/personalization-templates-ui-20261119`.

| Checkpoint | Commit | Meaning |
| --- | --- | --- |
| Published favorites base | `f5241c09f268a7a6841a5760ed0faa90b5b7f005` | Independently reviewed favorites tree; inherited hosted qualification remains required. |
| Isolated browser harness author | `fc74d0b63486c524d32912682c303951387b7ae8` | One new browser script, authored in a separate worktree. |
| Harness cherry-pick | `29af97a84c5f2090c7f596136c606238f4dc8ede` | Same one-file browser harness on this branch. |
| Product checkpoint | `3a933c256f2ad14055e2dc2dfe6e2cf2bd2db2fb` | Product implementation, focused tests, exact graph policies and additive browser workflow. Tree `058396bef6d29d60c7ab4376c9b4ddf143d373be`. |
| Independent workflow fix | `88c39c92d93722d65bcfb5c3b0eb2b0e62e24823` | Preserve favorites' original Chromium environment and give the new browser step its own environment. |
| Inherited tooling RED | `f2a5b26917fafbe8ec9d773c28df4fa87daf2d1a` | Cherry-pick of `57ef47d60f755284ab0a48e43373a657de0c2f40`. |
| Inherited tooling repair | `21b5d22d5d031243e6aeae9000ed0693b257ea9f` | Cherry-pick of `86a2b93666b029ea3bfc3a5e9c1ee3b89bdb6d28`. |
| Final tested source | `45a4905368bc3acb2c87d9f9c5d33fee4197e3e1` | Exact two-path template distribution admission and explicit same-slot browser update coverage. Tree `8cfb5b137a4797d5089ffa2204347f9e4358fe27`. |

The maintained `packages/personalization/src/trade-draft-store.ts`, native favorites implementation, seven-field template schema, package lock, contracts and wallet code are unchanged from PR201. No historical App implementation was copied. No remote branch, release, deployment, credential, funds or root coordination ledger was changed by this author.

The final author validation table below was completed on the final tested source checkpoint. Earlier and independent results identify their own checkpoints. Later author/reviewer report commits are documentation-only unless explicitly identified. Product runtime code remains identical to `3a933c2`; the later source changes are the reviewed workflow correction, inherited tooling corrections and bounded distribution/harness qualification additions.

## Runtime and UI behavior

`packages/personalization/templates.ts` exports only the native factory and its type. The private vault endpoint retains one native store across preview and commit. That instance is disposed on selection retirement and cannot cross a profile/session lease. Four purpose-specific commands extend the existing schema, AppRuntime and AppServices:

| Command | Authority |
| --- | --- |
| `loadTradeTemplates` | Return the strict bounded library and observed native revision. |
| `previewTradeTemplateChange` | Plan one strict put/remove/default-selection change at that exact revision. |
| `commitTradeTemplateChange` | Commit the matching one-use preview with exact explicit consent. |
| `cancelTradeTemplateChange` | Discard an idle native preview. An active document operation uses existing abort/lock semantics. |

No generic preference or record IPC, arbitrary payload, wallet, signing, negotiation, funding or submission method was added. Pending metadata retains only operation, generation and profile ID, excluding defaults, preview tokens and consent objects.

The dedicated draft controller and `TradeDraftPanel` expose an explicit load, eight numbered slots, new blank draft, explicit template application, explicit repeat-default application, and put/remove/default-selection preview. Previews show old/new values or default selection, affected count, whether removal clears the selected default, five-minute expiry, and logical deletion/backup limits. Confirmation is disabled until the acknowledgement is selected. A successful commit retires the observed library; another explicit load is required before the next change. There is no automatic CAS retry.

The saved library contains exactly these reusable fields:

| Field | Preserved value |
| --- | --- |
| `networkId` | Current registry network selector |
| `deploymentId` | Current registry escrow selector |
| `assetId` | Current registry asset selector |
| `amountBaseUnits` | Canonical positive integer crypto amount |
| `fiatCurrency` | Three-letter uppercase currency code |
| `fiatMinorUnits` | Canonical positive integer fiat amount |
| `fiatScale` | Integer decimal scale from zero through six |

Counterparty addresses, instructions, accepted terms, order identity, nonces, salts, signatures, deadlines and transaction authority are never copied into the template payload. The native maximum remains eight templates in the existing bounded purpose record.

Applying either kind of template is an explicit action. It resolves the selected network, deployment and asset through the current maintained registry, then copies only the seven primitives. It clears seller, buyer, instructions and both deadlines; resets the checkbox generation; removes and wipes the controller's previous local draft review. No review, agreement, transaction or signing action happens automatically. Fresh full parties, instructions (or an explicit empty-instructions acknowledgement), canonical windows and amount/identity checks are required before the user selects **Review fresh draft**.

The maintained domain builder generates new random order ID, seller nonce and private-agreement salt and runs the usual current-registry terms review. Builder-owned intermediate bytes and retired review byte views are cleared. The resulting review is labelled a newly entered local draft and remains session-only, preserving the existing saved-review file/sample schema. It confers no authenticated counterparty acceptance. A new bilateral agreement and normal explicit transaction review remain prerequisites for any future economic flow; this change adds neither.

## Lifetime and persistence fences

Revision zero is valid, including the empty library and a native unchanged receipt at revision zero. Strict own-data parsers reject extra authority fields, accessors, invalid slots, malformed revisions and invalid consent without reading getters. Native planning/commit preserves five-minute monotonic expiry, exact preview identity, one-use consumption, original-row comparison, native CAS and no retry.

The native store is bound to the selected profile, session lease and epoch. Each physical endpoint job retains the existing deadline/cancellation admission guard. The controller independently captures selection scope and operation generation, including silent selection changes, before publishing results or returning a route. Lock, profile replacement and disposal discard the private library, preview, inputs and owned review. A reproduced observer-retirement case was fixed specifically for local drafts: if selection retires while the trade controller publishes an accepted draft, that just-created private projection is removed even though the outer controller has not yet received its route ID. The dedicated regression was RED before the fix and GREEN afterward; favorites' completed-load-generation fence is unchanged.

Cancellation is not rollback. Tests distinguish a held pre-write commit (aborted, physical admission remains busy until drain, no retired reply) from a durable native commit whose acknowledgement is later suppressed. Lock during an in-flight commit retains only a generic `UNKNOWN_OUTCOME` notice; all private fields are discarded. Reopening and explicitly loading reconciles the committed case. No automatic write retry occurs.

Removal and default clearing are logical changes to the selected encrypted profile. Older backup or remote copies are unaffected and may restore removed templates. Complete-profile backup and fresh-key restore remain the native mechanisms. Conservative retention treatment of unknown preference rows is unchanged. Foreign, future and malformed reserved rows are refused without mutation. JavaScript immutable strings, caller-retained references and physical memory erasure are outside a claim of dropping UI/controller projections.

## Build and qualification boundaries

The exact private Worker personalization graph is:

- `packages/personalization/favorites.ts`
- `packages/personalization/src/favorites.ts`
- `packages/personalization/templates.ts`
- `packages/personalization/src/trade-draft-store.ts`

Actual default and demo emitted graph inspection found those four modules in the private Worker and none in document or QR graphs. The broad barrel, unknown/private imports, look-alike paths and transitive optional packages remain denied. No dependency, CSP/network allowance, contract, wallet or release state changed. Default builds still have no approved registry; creating/applying a review requires a ready registry from the maintained demo/testnet composition. Existing deployment and fund-enablement gates remain unchanged.

The new `npm run test:templates:browser` is one additive step in the existing foundation browser job. Existing favorites behavior and its browser step are retained, with its exact graph assertion updated to the four-module union. The browser harness uses the emitted App, actual module Workers and IndexedDB, pass-through observation only, and synthetic profile data. It covers explicit load/consent/cancel, seven-field persistence, same-slot update and restore, transient clearing, fresh identities twice, lock/reload/profile changes, repeat selection/removal, native eight-slot admission, extra-field refusal and a two-Worker stale write. Stale writes may be refused by CAS (`CONFLICT`) or earlier storage invalidation (`LOCKED`); the unchanged final revision and contents still prove one winner and no second write. Five-minute expiry is tested with the native injected monotonic clock, not claimed as a timed browser result.

Local Chromium execution remains blocked by the environment's Unix-socket policy. No launch or bypass was attempted. Syntax-checking and committing this harness are not browser execution, visual QA, exact-head hosted qualification or release acceptance.

## Inherited tooling corrections

The wider integration independently found documentation/distribution tooling failures after favorites changed the current graph/catalog. They were reproduced on this branch before repair: `npm run test:tooling` passed 32/36 and failed four checks. Two tests assumed that no inherited locale source was stale; the immutable recorded copy-text hash negative could be accepted while the current copy source was stale; distribution source admission omitted the exact favorites pair.

Both the independent RED and repair commits were cherry-picked, then only the two exact template paths were added beside the favorites pair in `scripts/distribution/manifest.mjs`. Its regression retains broad-barrel, unknown implementation and test-file negatives. The documentation validator now statically reads the selected immutable literal definitions to check recorded copy hashes even when today's catalog is stale. The generator uses those same selected immutable bytes. Maintained copy records, approvals and receipts were not rebound or rewritten.

The positive distribution fixture explicitly uses historical client `2b23ee614ff2dd05bd3a6e79f1278658c30a3909`, tree `a3701267756596e833247f50614c5ddc32f2cce0`, plus current tooling in an owned temporary worktree with a real dependency copy. It records that mixture as dirty. The actual current source retains its stale-copy refusal; the positive fixture does **not** qualify the new template App as a published distribution. Both existing fixture-using workflow jobs already use `fetch-depth: 0`; the historical commit is an ancestor of this branch. No fetch change was needed.

## Final validation record

Environment: Node `v24.22.3`, npm `11.19.1`, with the existing locked dependency set. No dependency pin changed.

| Command or verification | Final result at `45a4905` |
| --- | --- |
| `FOUNDRY_BIN=/workspace/scratch/6bd6e00af1c0/toolchain FOUNDRY_SOLC=/workspace/scratch/6bd6e00af1c0/toolchain/solc-0.8.30 npm test` | **2210/2210 passed**, 0 failed, 0 skipped; 101.1 seconds. |
| Focused command below | **32/32 passed**, 0 failed, 0 skipped. |
| `FOUNDRY_BIN=/workspace/scratch/6bd6e00af1c0/toolchain FOUNDRY_SOLC=/workspace/scratch/6bd6e00af1c0/toolchain/solc-0.8.30 npm run test:tooling` | **42/42 passed**, 0 failed, 0 skipped; 33.7 seconds on the frozen head. |
| `npm run typecheck` | All four TypeScript configurations passed: root, runtime, Worker and UI. |
| `npm run build` | Default static build passed: 12 files, 772283 bytes; `signedRelease:false`, `releaseAcceptance:false`. |
| `npm run build:demo` | Demo static build passed: 13 files, 784191 bytes; `signedRelease:false`, `releaseAcceptance:false`. |
| `npm run check:boundaries` | Passed: 238 production source files; 142 core graph modules. |
| `npm run test:build-policy` | **57/57 passed**, 0 failed, 0 skipped. |
| `npm run check:docs` | Passed engineering consistency; `semanticApproval:false`, `published:false`, `approvedRelease:null`; current `apps/web/src/ui/locale/en.ts` remains explicitly stale. |
| `npm run check:governance` | Passed and evidence manifest current; 12 historical records checked, `economicPreparationAllowed:false`, authority `inert-record-only`. Existing stale historical evidence remains labelled stale. |
| `node --check scripts/test-trade-templates-browser.mjs` | Passed; syntax only. |
| `node --check scripts/test-saved-review-favorites-browser.mjs` | Passed; syntax only. |
| `git diff --check` | Passed. |
| Native/contract/wallet comparison below | No differences from the published favorites base. Dependency/devDependency JSON maps also compare equal. |
| Default/demo graph inspection | Exactly four intended personalization modules in private Worker; zero in document and QR graphs. |
| Workflow byte comparison | Removing only the full new three-line template browser step exactly reproduces the PR201 workflow bytes, including favorites' original environment. |

Focused command:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test \
  packages/schemas/test/runtime-templates.test.mjs \
  apps/web/test/trade-templates-worker.test.mjs \
  apps/web/test/trade-templates-runtime.test.mjs \
  apps/web/test/trade-templates-controller.test.mjs \
  apps/web/test/trade-templates-ui.test.mjs
```

Unchanged source comparison:

```sh
git diff --exit-code f5241c09f268a7a6841a5760ed0faa90b5b7f005 -- \
  packages/personalization/src/trade-draft-store.ts \
  packages/personalization/src/favorites.ts \
  packages/schemas/src/trade-drafts.ts package-lock.json contracts packages/wallet
```

The focused tests exercise the actual native encrypted vault service and Worker endpoint through an in-process test transport, strict schema parsing, controller lifetimes and static React rendering. They do not substitute for a real module Worker/IndexedDB browser run. Covered negatives include valid revision-zero no-op receipts; malformed/excess fields and accessors; eight-slot bounds; expired and cancelled previews; stale revisions; foreign rows; profile/epoch replacement; held pre-write cancellation; durable-write timeout; held response suppression; explicit empty-instructions consent; immutable projection shapes; current registry retirement; fresh identities; private-byte cleanup; and reentrant accepted-review retirement.

The initial pre-final full suite was 2203/2203. It is retained as historical context only; the 2210/2210 frozen-head result above supersedes it. The inherited 32/36 tooling failure is superseded by the exact-head 42/42 result, without weakening stale-copy or immutable-hash semantics.

## Independent review and remaining qualification

Root independently reviewed immutable product checkpoint `3a933c256f2ad14055e2dc2dfe6e2cf2bd2db2fb` in a separate audit worktree. Reported independent results include 80/80 template/native/favorites-adjacent checks and 38/38 artifact/QR/import-policy checks. The review found a concrete workflow preservation issue: the inserted browser step initially took the existing favorites step's Chromium environment block. Commit `88c39c92d93722d65bcfb5c3b0eb2b0e62e24823` fixes that with two added lines. Root closed the finding by exact comparison against the original workflow. No runtime/product code changed for that fix.

Final independent closure of the inherited tooling and `45a4905` policy/harness delta is recorded in the separate reviewer handoff when complete; the author does not infer that closure from local tests or from the harness author's work. Actual exact-head hosted browser/CI qualification is still required. No local Chromium execution, visual screenshot qualification, deployment, publication, release acceptance, authenticated bilateral agreement or funds enablement is claimed by this report.
