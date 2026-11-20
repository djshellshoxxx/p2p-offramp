# Independent QR asynchronous-expiry review — generation 9

Date: 2026-11-20 UTC. Independent root worker 38; report-only review of [PR211](https://github.com/djshellshoxxx/p2p-offramp/pull/211).

## Result

**The isolated correction passes this scoped independent review. No open High, Medium, or Low finding was identified in its three-path diff.** The supplied regressions actually reproduced the stale decoder behavior: the exact test-only predecessor passed one control and failed three tests; the published correction passed all four. A single combined execution of 16 maintained QR test files passed **112/112**, with zero failures, skips, cancellations, or todos. The root package TypeScript project and import-boundary check also passed.

This establishes one locally reproduced and corrected public-review timing cause, with asynchronous hash, verifier, and unavailable-clock variants. It does not establish three separate product causes or financial impact. The affected review still has `authority: 'none'`. The coordinator's cause ledger and canonical handoff were not edited; this report supplies evidence for its decision. The author had explicitly reported no test execution before this review.

The reproduced cause is assessed **Low** within this review-only scope. Commit-time admission and explicit confirmation remain separate checks; the existing synthetic fixtures exercised no financial execution.

## Exact source and ownership

| Reference | Commit | Tree |
| --- | --- | --- |
| Corrected-core base PR207 | `df10fe26a308407237f9ccbc636c8bb61f55b84f` | `4b694124197ae8ce271f14307d12abc43c719406` |
| Supplied regression-only predecessor | `84ae862381446e60cdf33da58aadb277321c5f7c` | `05e923804d76f853ecbcd768a129ce00250dbd0f` |
| Author runtime correction | `3afe1504556466d9a22ad4f2d69826b6d68a78bf` | `5abb6748c2a77d248bec83aa0a67ae10453f2ba7` |
| Reviewed and tested published PR211 | `e7397f45f68f18fae8857ea31b58a04e248df404` | `224341968be39c6de7874b34a1f7fd6eefa19857` |
| Observed GitHub synthetic merge | `7c766ec7608fe530015b30f011e19e37baf754ab` | `224341968be39c6de7874b34a1f7fd6eefa19857` |

Live GitHub metadata was checked before checkout and again at **03:52:55 UTC**. PR211 remained draft at the exact head/base above, with three changed files. GitHub's merge object has parents base207 and head211 and the same complete tree. The local executions used head211, not a hosted merge checkout; the matching merge tree is identity evidence only.

The review read the canonical PR200 handoff and state at `5cc2843dc1bcb70c21f6e52fcfefd1c2f715f6eb`, tree `44a16a83c4d115a4c5df3de83d9ebd839ea71a41`. Its source integration, hosted qualification, ownership, and release limits remain in force.

Worktree: `/workspace/scratch/6bd6e00af1c0/p2p-offramp-generation9-qr-independent`.
Local review branch: `review/qr-async-expiry-generation9-20261120`.

The reviewer created this new worktree from verified head211 after the coordinator's space-clear message. Only this worktree was switched temporarily to the exact regression-only predecessor and restored to the review branch in a `finally` block. No author ref, canonical handoff, optional stack, external-owner worktree, or screened updater source was changed. No remote mutation occurred.

The actual comparison was `git diff df10fe26a308407237f9ccbc636c8bb61f55b84f...e7397f45f68f18fae8857ea31b58a04e248df404`. The base is the merge base. Exactly these paths differ; every other tracked base path is preserved:

| Path | Verified Git blob | SHA-256 of file bytes |
| --- | --- | --- |
| `packages/qr/src/text-codec.ts` | `cd6d3763785a7e5152592aa560df3c9f55c570fc` | `f07bcb03a724fe95e07b3549e11445704ee0c8cb8e0584abd73aed231dfc3ace` |
| `packages/qr/test/async-expiry.test.mjs` | `f72c715d4f3f9c7da4e3415c7ab1688c7ff261ec` | `ecc580fb3de3f530a3f3a081a425571bfc7c31d35b6b3cad1a69490572e30d11` |
| `docs/engineering/QR_ASYNC_EXPIRY_RECHECK_20261120.md` | `4c95b940190de0be09328ffc03a9257a63523cbd` | `b741568e251deca14a032eb92b2eea350d56d21fb01e72e769999b6a2813a9f4` |

The fetched local Git blobs equal the live changed-file API blobs. The saved complete source diff has SHA-256 `ccaaee961664eb9dc6f21c6f9cf195e5cb880c7edb8bc82281fdbbc001eb5c61`.

## Standards and specification review

Standards review found no actionable deviation. The small helper retains typed failures and the existing dependency-injection model, adds no dependency or global state, and makes no public export or format change. No project-specific `AGENTS.md` or applicable standalone coding-standards file was present in the reviewed repository tree; the QR README, public interfaces, and existing implementation conventions supplied the relevant contract. The two review axes were performed by this independent worker without launching further workers.

Specification review used the accepted [D6 decision packet](../adr/proposed/D6-qr-payload-profiles.md), [QR design specification](../../00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion/module_0.12.4_qr_interchange/spec-qr-everywhere-secure-sharing-and-import-export.md), [package contract](../../packages/qr/README.md), and the author's focused correction report. The stale-invite refusal, safety margin, unsigned-review labeling, and explicit confirmation boundaries remain consistent with those contracts.

### Clock and acceptance boundaries

The retained clock is the injected UTC-seconds callback. The application defaults to `Math.floor(Date.now() / 1000)`; this change does not substitute a chain clock, timer duration, or browser performance clock. Entry validation remains, and each refresh validates a nonnegative safe integer before use. Exceptions, nonfinite values, negative values, and fractional values fail with `UNAVAILABLE`.

The decoder refreshes after payload hashing, checks the existing 60-second expiry margin and 120-second future skew, awaits signature processing, then refreshes and checks again before building the review. The final refresh also covers time spent hashing the domain-separated signing message inside signature processing. There is no further asynchronous operation inside `buildReview`.

Each successful refresh uses the maximum of the previous accepted observation and the new observation. Consequently, a backward observation within this decode cannot increase `secondsUntilExpiry`. This is a clamp over observed wall-clock samples within one invocation; it is not an independent trusted clock or a guarantee across separate decodes. Neither the replay ledger's clock nor the application lifecycle clock was changed.

### Hash, signature, and trust boundaries

Strict text/byte limits, canonical parsing, envelope schema, chain allowlists, expected-chain comparison, and payload hash verification remain before acceptance. The correction changes no canonical bytes, hash algorithm, signing domain, signature profile, key-size checks, advertisement binding, or verifier verdict requirements.

The valid-verifier regression uses the existing synthetic HMAC helper and its own key-to-author registry. It actually invokes the verifier once before expiry refusal. This test fixture does not select a production invite-signing profile. A matching payload hash still authenticates no sender; unsigned and unverified imports retain their existing warnings. A verified invite still produces a frozen review with no signing, transaction, network, storage, or navigation authority.

### Lifecycle ownership and adjacent behavior

The surrounding QR controller still checks its cancellation epoch, abort signal, and trusted context after awaited decoding. The pending physical job slot remains owned until the existing `finally` path releases it. The correction introduces no replacement task, detached continuation, timeout, or resource owner.

Confirmation re-decodes the selected text and calls the unchanged replay ledger, which checks expiry at admission. Public copy/display gestures retain their synchronous current-context and expiry checks. The review object stays memory-only and frozen. Maintained controller tests exercised late hash completion, cancellation, owner changes, replay, and commit-time expiry alongside the new codec behavior.

## Actual executions

Environment: Node `v24.22.3`, npm `11.19.1`. The dependencies were physically copied into this new checkout from the coordinator's preserved cache; the root dependency directory is not a symlink. Both source and review `package-lock.json` files have SHA-256 `9099553922da18ffb1847f2af0780add27c422ecdcbb00b1050503ffb2e4dd72`. No dependency installation, version change, or test-time network access was needed.

All raw logs and machine-readable execution records are preserved under:
`/workspace/scratch/6bd6e00af1c0/verification/generation9-qr-review/`.

| Execution | Exact source | Result | Duration |
| --- | --- | --- | --- |
| Supplied regressions, original implementation | `84ae862381446e60cdf33da58aadb277321c5f7c` | exit 1; 1 passed, 3 failed, 0 skipped/cancelled | 0.331 s |
| Same regressions, corrected implementation | `e7397f45f68f18fae8857ea31b58a04e248df404` | exit 0; 4 passed, 0 failed/skipped/cancelled | 0.323 s |
| Maintained affected QR selection, 16 files | same published head | exit 0; 112 passed, 0 failed/skipped/cancelled | 11.490 s |
| Root package TypeScript project | same published head | exit 0 | 1.201 s |
| Import boundaries | same published head | exit 0; 238 production source files, 142 core modules | 1.122 s |
| Changed-source whitespace check | exact base-to-head diff | exit 0 | not timed |

The 112-test selection includes the four regressions; these counts must not be added together as separate unique tests. Nine QR package files, six application QR files, and one QR build-policy file ran together. The browser-oracle-named unit test is a Node fixture check; no browser was launched.

### Original versus corrected behavior

The regression-only predecessor differs from base207 only by the supplied test file. Its test blob is byte-identical to the published head. No new test, fixture, payload, or runtime patch was authored by this reviewer.

On the predecessor, both the delayed-payload-hash case and the valid delayed-verifier case returned a review with 61 seconds remaining even though the test clock had reached the 60-second refusal margin. The invalid-clock test returned a review after the first late `NaN` sample and failed at that first assertion. Its later loop cases were not reached on the original run. The steady-clock/backward-clock control already passed and is not counted as a newly repaired behavior.

On the corrected source, all four tests passed. The invalid-clock test completed all four late values (`NaN`, `Infinity`, `-1`, `1.5`) and its throwing-clock case. The supplied tests cover invalid-clock and rollback behavior after payload hashing, and expiry after successful signature verification; the shared clock helper and final call site were additionally inspected directly.

The initial evidence recorder assumed TAP summaries, but this environment emitted Node's spec reporter for the two exact author commands. Its count assertion failed after both test executions had completed. The untouched logs were then parsed using their actual summary prefix. Neither test run was repeated, overwritten, or reclassified; `recorder-note.txt` records this evidence-bookkeeping correction.

### Commands

The exact regression command was run once on each source:

```sh
node --test packages/qr/test/async-expiry.test.mjs
```

The original run followed `git switch --detach 84ae862381446e60cdf33da58aadb277321c5f7c`. The checkout was restored using `git switch review/qr-async-expiry-generation9-20261120` before the corrected run. Both the restored head and clean status were asserted.

The actual combined affected selection was:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-reporter=tap --test-concurrency=1 \
  packages/qr/test/async-expiry.test.mjs \
  packages/qr/test/base45.test.mjs \
  packages/qr/test/codec.test.mjs \
  packages/qr/test/display-group-size.test.mjs \
  packages/qr/test/envelope.test.mjs \
  packages/qr/test/jcs-array-proxy-error.test.mjs \
  packages/qr/test/jcs.test.mjs \
  packages/qr/test/qr-matrix.test.mjs \
  packages/qr/test/vectors.test.mjs \
  apps/web/test/qr-browser-oracle.test.mjs \
  apps/web/test/qr-camera.test.mjs \
  apps/web/test/qr-decoder-oracle.test.mjs \
  apps/web/test/qr-image.test.mjs \
  apps/web/test/qr-review.test.mjs \
  apps/web/test/qr-ui.test.mjs \
  apps/web/scripts/qr-build-policy.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node scripts/check-import-boundaries.mjs
git diff --check df10fe26a308407237f9ccbc636c8bb61f55b84f...e7397f45f68f18fae8857ea31b58a04e248df404
```

### Raw-log SHA-256

| Log | SHA-256 |
| --- | --- |
| `async-expiry-original.log` | `9be5463ff8fee66092efaf6c64055966a103bcbfdf3b630a9f00b2fb80266a7e` |
| `async-expiry-fixed.log` | `436bed04c8b444957125d9bd881eb8558618fb29d3b3039a2914967899f108b6` |
| `affected-qr.log` | `5880e2e0e6fe4ffa928f3784873ff9d8208a7e5a3f91137f62d151d2666f928e` |
| `typecheck-root.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (empty success log) |
| `import-boundaries.log` | `5254263f82db056f8b7b8e5b03552f31bd0bf37901f9955cd5d5dff27709cc2d` |
| `source-whitespace.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (empty success log) |

## Scope and remaining qualification

This review covers the small asynchronous-expiry correction, its maintained fixtures, and directly adjacent QR behavior. It does not qualify the entire application. Only the root TypeScript project was executed here; no four-project aggregate typecheck, broad full suite, application build, actual Chromium run, physical camera/print test, native validator, chain operation, or financial-impact experiment was performed.

PR210's transport correction, generation9 optional composition on210, relay206, backup208, dependency209, and the excluded screened updater remain separate. PR211 is not implicitly included in those candidates. A composed successor needs its own source-bound integration checks and applicable hosted/browser/native evidence. No prior ancestor result is transferred to this source, and this report does not waive merge policy or authorize deployment/release.

The reviewer changed no runtime or test file. The sole review commit adds this report. Existing release settings and all source-owner branches remain unchanged.
