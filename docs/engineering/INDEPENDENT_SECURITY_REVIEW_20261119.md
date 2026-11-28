# Independent review: bounded imports and relay readiness

Date: 2026-11-19 (America/Vancouver). Review worker: `bounded_security`.

This review was performed separately from the workers implementing and integrating the changes. It is an internal engineering review, not an external security audit or release approval. No live wallet, public chain, deployment, release setting, or real funds were used.

## Baseline and disposition

The observed `main` baseline was `5c5a84ef6300330700c8b0ca54d074ac113f08be`.

| Change | Reviewed fix | Finding | Disposition |
| --- | --- | --- | --- |
| [PR #187](https://github.com/djshellshoxxx/p2p-offramp/pull/187): bound actual review bytes | `6537693eb526969c46d94cfa7f24a5fe02e82116` | No blocking defect found in the scoped patch. Independent failing-baseline and passing-fix execution completed. | Qualified for staging integration; rerun applicable gates on the combined result. |
| [PR #181](https://github.com/djshellshoxxx/p2p-offramp/pull/181): relay readiness projection | `13e0882ab7f7efd9e23a45c8ad5cd6d814a43546` | No blocking defect found in the runtime patch. Independent failing-baseline and passing-fix execution completed. | Qualified for staging integration; retain later `main` changes when integrating this older branch. |

## PR #187: actual-byte admission

Reviewed `apps/web/src/trade/review-controller.ts`, its regression tests, saved-review lifecycle, the domain terms validator, and adjacent HTTP body admission.

The controller checks the returned byte count before either additional plaintext copy, before invoking its validator, and before retaining a review. Oversized file reads and generated samples are rejected with `TOO_LARGE` and their returned byte views are cleared. Reported file sizes must be nonnegative safe integers; invalid metadata is refused before reading. Existing generation checks continue to discard and clear superseded reads. The change preserves the existing 64 KiB document limit and does not change trade terms, signatures, escrow behavior, or network policy.

The domain validator independently bounds the intrinsic typed-array byte count before copying or decoding. The HTTP driver separately caps decoded streamed response bytes at 64 KiB and bounds read attempts at 1,024; its content-encoding tests preserve the distinction between encoded `Content-Length` and decoded bytes. These controls were inspected and their targeted suites executed; no new transport finding was established.

### Executed failing-baseline evidence

At regression-only commit `fd36d7b7996f7c9e83c3b71b71ef6c4c89d32d03`, using Node `v24.22.3`:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test \
  apps/web/test/review-controller.test.mjs
```

Result: **23 tests; 21 passed; 2 failed; 0 skipped; exit 1**. The two failures were exactly:

- `actual bytes are bounded after a FileLike read and after a generated sample, despite claimed metadata`
- `invalid claimed FileLike lengths fail closed without reading file contents`

This supplies executed failing-baseline evidence that the original connector-only PR handoff explicitly lacked.

### Executed passing-fix evidence

At fixed commit `6537693eb526969c46d94cfa7f24a5fe02e82116`, using the same runtime:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test \
  apps/web/test/review-controller.test.mjs \
  apps/web/test/saved-reviews-controller.test.mjs \
  packages/domain/test/terms-review.test.mjs \
  packages/transport/test/http-driver.test.mjs \
  packages/transport/test/http-driver-encoding.test.mjs
```

Result: **75 tests; 75 passed; 0 failed; 0 skipped**.

### Assurance limits

The post-read check cannot prevent an injected `arrayBuffer()` implementation from allocating memory before returning. Native browser `File.size` remains the pre-read bound for normal file selection. The registry and sample implementations are trusted composition inputs. This review does not claim that hostile executable JavaScript implementations of those ports form a sandboxed security boundary, or that the original defect was remotely exploitable.

## PR #181: current readiness after relay work

Reviewed the two runtime changes in `apps/web/src/localnet/controller.ts` and `apps/web/src/localnet/localnet.worker.ts`, the existing command dispatch and snapshot paths, and the new readiness regressions.

The relay drain now publishes `working` before awaiting its first receive. Empty queues no longer emit a transient working state. After a synchronous observer locks the controller, the loop checks its current epoch before receiving any queued event. The Worker recomputes the snapshot after command dispatch completes, preventing an older command result from overwriting a newer relay, lock, or profile-selection projection. The change grants no wallet or settlement authority.

### Executed failing-baseline and passing-fix evidence

Using Node `v24.22.3`, execute at each listed commit:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test \
  apps/web/test/localnet-readiness.test.mjs
```

| Commit | Result |
| --- | --- |
| Regression-only `18094a0772e8e602f118af6c1c094058a3afb3ff` | **4 tests; 0 passed; 4 failed; 0 skipped; exit 1** |
| Fixed `13e0882ab7f7efd9e23a45c8ad5cd6d814a43546` | **4 tests; 4 passed; 0 failed; 0 skipped; exit 0** |

The tests cover a held relay storage read, busy refusal without a wallet call, recovery to explicit connection, reentrant locking, and Worker completion after relay work, locking, or profile selection has changed the current snapshot.

The reviewed branch predates later `main` work. Integrate the two unique regression/fix commits, or merge while preserving the newer changes. A direct replacement of current files with the older branch tree is not qualified by this review.

## Integration handoff

The integration worker must retain the exact source commit references above and execute the affected tests on the resulting combined staging commit. These individual-source results do not prove that an arbitrary later combination passes. No external audit, deployment readiness, full-product completion, or release authorization is asserted.
