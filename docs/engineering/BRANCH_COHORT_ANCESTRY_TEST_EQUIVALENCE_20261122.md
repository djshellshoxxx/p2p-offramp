# Immutable ancestry and identical-test-source reconciliation — 2026-11-22

**Repository:** [p2p-offramp](https://github.com/djshellshoxxx/p2p-offramp). **Frozen main:** `01f6f4feca051d68de24a04299cd3bb444bce40c`, tree `437323a382952b9623a875c818f8af005a5d4563`. **Prior evidence-branch tip:** `d13195035061a5ca9f581e0b717fcfe0c9472592`. Authenticated branch pagination was re-read (100+100+57 = **257** branches); PR pagination (100+100+42 = **242** total: 60 open, 124 merged, 58 closed unmerged).

## A. Exact commit ancestry — 22 newly verified branches

Each row was compared using `GET /compare/<exact-main-SHA>...<exact-branch-tip-SHA>`, not historical PR text. GitHub returned `status=behind`, `ahead_by=0`, `merge_base_commit.sha = exact branch tip`, and zero changed files. Therefore its commits are already contained in main; no new merge is needed for this branch tip. This says **nothing about product feature completion or current acceptance tests**.

| Historical branch | Complete immutable tip SHA | Ahead/behind | Verified decision |
|---|---|---:|---|
| `work/p2p-exchange-close-20261030` | `2d3135b646bf99f63935287a082856ea7fe6b74d` | 0 / 697 | tip SHA is exact merge-base; already in main history |
| `work/p2p-exchange-test-repair-20261030` | `adfbec52f964d9b07c571b8924d31fa03d54e03a` | 0 / 700 | tip SHA is exact merge-base; already in main history |
| `work/p2p-relay-lifetime-20261030` | `e0961edc8cb64b466a2a3193aa37158bfc8c3487` | 0 / 698 | tip SHA is exact merge-base; already in main history |
| `work/p2p-gate-reconciliation-20261030` | `e762e649600493221e3bd10f0c3525858722bc94` | 0 / 702 | tip SHA is exact merge-base; already in main history |
| `work/p2p-validation-20261030` | `11ce9e42bea9e5f27e303ee6db66e463d38ebdda` | 0 / 696 | tip SHA is exact merge-base; already in main history |
| `fix/qr-async-expiry-20261120` | `e7397f45f68f18fae8857ea31b58a04e248df404` | 0 / 102 | tip SHA is exact merge-base; already in main history |
| `fix/localnet-readiness-20261119` | `13e0882ab7f7efd9e23a45c8ad5cd6d814a43546` | 0 / 151 | tip SHA is exact merge-base; already in main history |
| `codex/runtime-update-continuation-g22-20261120` | `477777dc152cd3148ba7f25a75ce8f00dc1b03b5` | 0 / 23 | tip SHA is exact merge-base; already in main history |
| `codex/backup-verification-ui-g12-20261120` | `e77a2d3e758ee3b416d8d96ecd979526c7ae78ce` | 0 / 88 | tip SHA is exact merge-base; already in main history |
| `codex/peer-acceptance-20261116` | `b3f508420e63329ab30e1b646f61337020a1ebad` | 0 / 388 | tip SHA is exact merge-base; already in main history |
| `integration/p2p-consolidated-20261109` | `fa28a3702517eb98293b3c5cca5070e74a2e2b57` | 0 / 382 | tip SHA is exact merge-base; already in main history |
| `nodata/youthful-maxwell-uwy8hx-b1b-lifecycle` | `0b0ca2907b372071471d7e060d0a80178d4294c9` | 0 / 270 | tip SHA is exact merge-base; already in main history |
| `chatgpt/zero-codex/qr-display-chunk-regression-20261118` | `5984dc823c25399a001b5f059c79db89f51a1324` | 0 / 233 | tip SHA is exact merge-base; already in main history |
| `chatgpt/zero-codex/review-read-bounds-20261119-119` | `6537693eb526969c46d94cfa7f24a5fe02e82116` | 0 / 144 | tip SHA is exact merge-base; already in main history |
| `codex/personalization-favorites-ui-20261119` | `f5241c09f268a7a6841a5760ed0faa90b5b7f005` | 0 / 112 | tip SHA is exact merge-base; already in main history |
| `codex/personalization-templates-ui-20261119` | `98d33db64622eab3f5f4ece6141d445d255245e7` | 0 / 111 | tip SHA is exact merge-base; already in main history |
| `codex/qr-camera-fixture-20261119` | `9611d6a5cb404fed5d41eeb176dafb31c01de640` | 0 / 122 | tip SHA is exact merge-base; already in main history |
| `codex/transport-qualification-20261120` | `d30152336bb687b31ae547ab3fcecb8835a02ef4` | 0 / 90 | tip SHA is exact merge-base; already in main history |
| `nodata/youthful-maxwell-uwy8hx-b1a-reader` | `37f074dd1d65d5f12b73182420998a152374b813` | 0 / 270 | tip SHA is exact merge-base; already in main history |
| `parallel/browser-runtime-engines-20261113` | `378fdf92c0b9a340dff3587a0b53dd568292f3e6` | 0 / 483 | tip SHA is exact merge-base; already in main history |
| `test/nostr-relay-interop-20261119` | `7fb274ba0380bdf6d750b95fd6aca68db8c7e4c0` | 0 / 157 | tip SHA is exact merge-base; already in main history |
| `integration/m2a-safe-fixes-20261114` | `c0bbfe62951873a0960b4218b9db9b06b616da5a` | 0 / 435 | tip SHA is exact merge-base; already in main history |

## B. Divergent, test-only commits with identical current-main source

- `chatgpt/zero-codex/http-buffer-lifecycle-20261110`: branch vs main compare is 1 ahead / 614 behind and shows only `packages/transport/test/http-driver.test.mjs`. GitHub full-file read of both immutable refs returned identical UTF-8 content and blob SHA `85984e592582ab4700cfc9b4fdc6d8f995e22bcb`.
- `chatgpt/zero-codex/registry-concurrency-20261110`: likewise 1 ahead / 614 behind, only `packages/domain/test/registry.test.mjs`. Branch and main content and blob SHA identical: `2e5ed07bdb76725b64883e48bd7c9580e32a8579`.

The two commits are **not ancestors of main**, and patch-ID / range-diff equivalence is not claimed. Their complete net test files already exist in main, so a second source transplant would duplicate content.

## Updated exclusive inventory classifications

| Classification | Count | Definition |
|---|---:|---|
| A | 66 | Exact historical tip ancestor of main |
| P | 58 | Open unintegrated PR branch head, pending qualification |
| U | 99 | Not yet individually diff-reviewed |
| C | 3 | Divergent historical documentation proven present in main |
| E | 10 | Incomplete static patch/source overlap; further review |
| V | 6 | Other partially reconciled divergent branches |
| F | 14 | Fully contained source or current-main tips; may differ in history |
| B | 1 | Owner/external decision blocked separate custodial ledger |
| **Total** | **257** | No classification implies release eligibility |

All affected individual entries in [BRANCH_INVENTORY.json](BRANCH_INVENTORY.json) preserve the full recorded SHA, existing associated PR and owner, new exact comparison, decision, and clear remaining qualification boundaries.

## Safety and remaining engineering

No direct repository checkout was possible from this runtime (`github.com` DNS resolution failed). No `git patch-id`, `git range-diff`, local workspace tests, real browser/native Solana tests, independent reviewer approvals, funded transactions, merge, deployment, release, branch deletion, optional activation or trust/credential changes occurred. Historical failed and skipped evidence remains intact. `ReleaseEnabled=0` remains required.

**Next:** audit the 99 unassessed branches by risk rather than name order; when a branch is divergent, inspect exact source/test blobs and original ownership. Adapt and execute retained wallet cancellation / prepared-but-unsent recovery scenarios from open #26/#40/#42/#43 against **current main** in an authorized executable environment while retaining `BROADCAST_UNKNOWN` post-marker protections. The financial PR #241/#242/#244 stack still requires current-target native/browser acceptance and matching D8 Tier C authorization, while #237 requires its named Tier B review before stack integration. Preserve separate optional #224–#232 intake. These tasks remain unfinished and the continuation must remain enabled.
