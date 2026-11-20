# Independent Solana expiry review — generation 8

Reviewed November 20, 2026 UTC / November 19, 2026 Pacific. This is an independent, narrow review of the finalized expiry correction and its deterministic local tests. It is not a whole-application security clearance or a native/browser acceptance receipt.

## Disposition and immutable scope

**No blocking defect was found in the corrected expiry evidence collector.** The independent reviewer reproduced the original stale-absence failure, verified the correction, and added five passing tests for second-response freshness, newly appearing status, rejected-network height-floor isolation, and the actual application RPC serializer. Production source, network allowlists, workflows, and coordinator records were not changed by this review.

| Item | Exact identity |
| --- | --- |
| Starting PR 205 source | `cd7d54ba075118a7ec043788c17718be842ee405` |
| Regression-only predecessor | `b0e3cc0baafbade3d5712d90e2705d4ec1693042` |
| Corrected production source | `dde7345e1ee2e722344d6f27dd8bd952c285d520` |
| Corrected source tree | `cc83de50382ef9328da314305b6318ad789e9b40` |
| Independent tests | `26276d4c0dd81e29f073519a89c5139ee9b1136d` |
| Independent test tree | `dd1799c9f25ec831e984ecf298078ecce219b230` |

The production delta from the starting source is confined to `packages/chain-solana/src/submit.ts`; the author's regression file is `packages/chain-solana/test/reconciliation-context.test.mjs`. The independent additions are `packages/chain-solana/test/independent-expiry-context.test.mjs` and `apps/web/test/solana-expiry-rpc.test.mjs`. Both are discovered by the existing `npm test` globs without changing test commands.

The reviewer used an isolated Git worktree, read the consolidation handoff and state, and found no `AGENTS.md` in the worktree's ancestry. Node was `v24.22.3`; npm was `11.19.1`. Physical dependencies were copied only after confirming the lockfile matched the existing local checkout. No dependency or lockfile change is part of this review.

## Confirmed defect and correction

The original implementation could combine a fresh finalized height with an absent signature response whose context was older than the finalized expiry block. It discarded the absent response's context and could persist `dropped` for an uncertain, durably marked transaction. The two original regressions independently fail with the old `submit.ts`: a null response at the original blockhash slot and a null response 25 slots later both incorrectly produce a successful reconciliation.

The correction requires a concrete sequence of consistent evidence:

1. Every signature response must cover at least the prepared blockhash slot, including a null response.
2. An initial finalized height must exceed `lastValidBlockHeight` before attempting expiry settlement.
3. `isBlockhashValid` at finalized commitment must report false with a sufficiently new context. `getBlock` for that exact context slot must provide a finalized block height at least as high as the prior observed height and strictly beyond the intent's expiry height.
4. The processed validity check must also report false at a context no older than that finalized anchor. The existing history reach requirement remains in place.
5. The second signature response must cover the finalized anchor. A newly appearing processed status remains open; a newly appearing finalized status is retained as its landed outcome. Only a covering null response can finish the expiry decision.
6. Matching genesis checks surround the observations, including rejected evidence. The per-network height floor is raised only after the final identity check succeeds.

This construction closes the reproduced stale-context mismatch without adding a send, retry, marker deletion, or implicit replacement. A missing finalized block, stale context, contradictory block height, or invalid response leaves the uncertain journal entry unchanged. A ledger whose available history starts after preparation leaves the observation open.

The new catch-path identity check gives a changed genesis precedence over an intermediate integrity error and does not commit a height observed on the rejected network. The independent floor test also restores the correct provider afterward and succeeds, demonstrating that the rejected high value did not poison later observations.

## Official RPC contract and application composition

The review checked the current official RPC documentation on November 20 UTC:

- [`getSignatureStatuses`](https://solana.com/docs/rpc/http/getsignaturestatuses) exposes a response context and a status array, and supports `searchTransactionHistory`. The client explicitly enforces the returned context bound; it does not assume a nonexistent status-query `minContextSlot` parameter.
- [`isBlockhashValid`](https://solana.com/docs/rpc/http/isblockhashvalid) accepts commitment and `minContextSlot`, returning a context and boolean validity value. This provides the finalized slot used by the correction.
- [`getBlock`](https://solana.com/docs/rpc/http/getblock) accepts an exact slot and commitment. Its result may be null and its block height may be null; the correction rejects those unavailable anchors rather than treating them as expiry proof.
- [`getBlockHeight`](https://solana.com/docs/rpc/http/getblockheight) returns a scalar height. It cannot by itself bind a cached signature absence to a particular finalized block, which is why the additional anchor is necessary.

All methods already exist in `apps/web/src/solana-localnet/rpc.ts`'s allowlist. The independent application test runs the real `createSolanaLocalRpc` and `observeIntent` through a mocked `fetch`, verifies JSON request serialization and returned-response handling, and checks both commitment/minimum-context configurations plus the exact-slot block request. It also verifies POST, omitted credentials, rejected redirects, and no-store caching remain active. No network connection, HTTP server, real wallet, validator, or funds are involved. The fixture's single simulated initial send creates the uncertain journal state; all observation requests are read-only and add no send.

The official documentation is an API contract check, not execution against the repository's pinned validator. The documentation-linked Agave source currently points to v3.1.8; this report does not claim a complete v4.1.2 RPC implementation audit or infer a native pass from that link.

## Independently executed verification

| Execution | Result |
| --- | --- |
| Original `submit.ts` from `b0e3cc0`, two selected stale-null regressions | **0 passed / 2 failed**, expected RED; zero skipped; 3,507.763333 ms |
| Corrected source: reconciliation-context, lifecycle, and existing independent-review-regressions files | **30/30 passed**, zero failed/skipped/cancelled; 11,090.579667 ms |
| Five new independent package/application tests | **5/5 passed**, zero failed/skipped/cancelled; 3,679.039294 ms |
| Corrected production source restoration and diff checks | `submit.ts` exactly matches `dde7345`; `git diff --check` passed |

The RED assertion is specifically `stale absence is not terminal evidence`: the original reconcile result was successful when rejection was required. It is not a setup or import failure. The old source was restored only temporarily in the isolated review worktree and was replaced with exact corrected source before the green executions.

The five added cases establish:

- A current first null response does not make a stale second null response usable; the journal remains unknown, no write occurs, and the send count stays fixed.
- A processed status appearing only in the final query remains unknown, preserving its durable marker without a journal write.
- A finalized error status appearing only in the final query becomes failed with its marker retained, one outcome write, and no new send.
- A genesis switch during finalized-block evidence cannot update the height floor, and a subsequent correct observation remains usable.
- The actual local RPC implementation admits and serializes the added read sequence without any allowlist change or physical network access.

Commands were run separately and serially; these are two green executions, not a claimed combined full-suite run:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 --test-name-pattern='stale absent signature context' packages/chain-solana/test/reconciliation-context.test.mjs
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 packages/chain-solana/test/reconciliation-context.test.mjs packages/chain-solana/test/lifecycle.test.mjs packages/chain-solana/test/independent-review-regressions.test.mjs
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 packages/chain-solana/test/independent-expiry-context.test.mjs apps/web/test/solana-expiry-rpc.test.mjs
git diff --exit-code dde7345 -- packages/chain-solana/src/submit.ts
git diff --check
```

Logs were retained under `/workspace/scratch/6eace968c0df/verification-solana-review-g8` for coordinator review:

| Evidence | SHA-256 |
| --- | --- |
| `original-red.log` | `6c1ebc0863d2fae6d31c5375c8392d267afea19bcb51eea78410920610788873` |
| `repaired-focused.log` | `be5a1c838e96a9ce3a52a76b9cb5df65dc33a09d7814a0c6436be70cc74fb373` |
| `independent-probes-final.log` | `c857bafcb428c6e7093bd878eb8df1f1376bcf1d8ef58f39a50c0b4db9318d17` |

## Limits and fresh-worker handoff

The collector checks consistency among RPC claims. It does not cryptographically prove absence or protect against a provider fabricating mutually consistent data under the expected genesis. The existing trust assumptions about ledger history, backend consistency, and honest finalized responses remain. Conservative refusal when an exact finalized block is unavailable is acceptable for this correction but remains an operational case for the pinned native validator to qualify.

This worker did not execute the full repository suite, TypeScript build, Chromium, an actual RPC endpoint, encrypted browser recovery, or native financial flows. Those results belong to their actual execution owners and exact source trees. No release or deployment authorization is added; `ReleaseEnabled=0` remains required.

A fresh worker should review the final integrated source/tree and its actual hosted receipts, then qualify the added finalized anchor against the pinned validator. Preserve the existing browser restore/replacement journey, single-send/unique-signature observations, durable markers, exact principal and fee assertions, both real 1,800-second native refund minima, and zero fixture errors. Do not transfer an ancestor's hosted pass to this corrected source. Continue from concrete remaining qualification or a new defect, rather than repeating the same passing deterministic audit without a new question.
