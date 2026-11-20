# Independent Solana reconciliation RPC review — generation 6

Reviewed November 20, 2026 UTC / November 19, 2026 America/Vancouver.

## Disposition and exact scope

**No additional High or Medium defect was identified in the reviewed correction.**
This is a narrow source, specification and RPC-contract review of the finalized
expiry context repair. It does not qualify the complete application or substitute
for the final source's hosted validator/browser execution.

| Identity | Value |
| --- | --- |
| Published comparison baseline, PR205 | `cd7d54ba075118a7ec043788c17718be842ee405` |
| Exact reviewed combined source | `b67bd81e74b0f58338dc15bc694cd3a22b724cd4` |
| Exact reviewed source tree | `f2476312544b27fc5d8c44dcc16a30857e4e7381` |
| Author's corrected implementation | `dde7345e1ee2e722344d6f27dd8bd952c285d520` |
| Corrected `submit.ts` Git blob | `f8800065f34e9a74bfbf9ec51b5530a6209be63a` |
| Corrected `submit.ts` SHA-256 | `575e9f79e96c41c010591eba001f87eab0d04d197c3bb16495213037fe7c3856` |

The reviewer read the consolidation handoff/state, the author's
`SOLANA_RECONCILIATION_CONTEXT_20261119.md`, the transaction-lifecycle specification
section 4.5, the maintained Solana lifecycle documentation, the production diff,
the new regression file and adjacent existing lifecycle tests. The external
review at `6d06916` was read as separately attributed evidence. That review's
tests and results are not new executions by this worker.

All work is isolated on `codex/generation6-solana-context-review-20261119`. This
commit adds only this report. No external coordinator tree or source branch was
modified.

## Standards

No documented-standard violation or material maintainability concern was found
in the changed code. The implementation follows the surrounding own-property
descriptor parsing and safe nonnegative integer checks. It reuses the bounded
RPC call helper, existing error vocabulary and existing read methods. The final
height-floor mutation remains after successful evidence and network checks.

The unchanged intent parser admits u64 decimal fields, while RPC values are
limited to safe JavaScript integers. A restored blockhash slot outside that safe
RPC range cannot satisfy the new context bound and therefore cannot become
terminal through this path. The expiry comparison continues to use exact
`BigInt` values. No new numeric truncation path was identified.

No repository `AGENTS.md`, `CONTRIBUTING.md`, dedicated standards file or issue
tracker instruction file was found by the scoped file inventory. The supplied
task scope and existing lifecycle specification provide the review baseline.

## Specification and behavior

The transaction-lifecycle specification requires finalized reconciliation and
available history before expiry can permit a newly signed Solana intent; absent
evidence must leave the outcome uncertain. The repair strengthens that existing
requirement without changing replacement authorization or economic thresholds.

The initial status query now rejects a context before the prepared blockhash
slot even when its value is null. Once finalized height exceeds the original
validity window, the collector obtains an invalidity response at finalized
commitment and reads the exact returned slot as a finalized block. That block's
height must cover the earlier scalar height and exceed the recorded expiry.
The processed invalidity check and the final history-enabled status query must
then have contexts at least as new as this finalized anchor.

An unavailable block, null/invalid block height, regressing height, stale context
or contradictory validity fails before an observation is applied. A history
lower bound after preparation retains the existing open outcome. A status that
appears in the final query still follows the existing open/finalized/failed
classification. These conclusions come from source inspection; this worker did
not count a new malformed-response test execution.

On both successful and rejected evidence, the new identity handling checks the
expected genesis before a height floor can be raised. If the identity read also
fails, reconciliation still fails conservatively; it does not apply the partial
observation. The extra read can affect error precedence or latency, but adds no
send, implicit retry, journal transition or retained financial authority.

## Primary RPC evidence

The current official method pages were checked directly:

| Method | Contract relevant to this change |
| --- | --- |
| [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses) | A contextual status array with explicit history lookup. The API has no status-query commitment or minimum-context parameter; the client checks the returned context itself. |
| [isBlockhashValid](https://solana.com/docs/rpc/http/isblockhashvalid) | A contextual boolean with commitment and minimum-context configuration. |
| [getBlock](https://solana.com/docs/rpc/http/getblock) | An exact slot and commitment select a block. The result and its height can be unavailable. |
| [getBlockHeight](https://solana.com/docs/rpc/http/getblockheight) | A scalar height, which cannot alone connect another response's context to the same observation. |

The review also retrieved the actual pinned Agave RPC source through the GitHub
connector, beyond the documentation's older v3.1.8 source link. The live
[`v4.1.2` tag reference](https://api.github.com/repos/anza-xyz/agave/git/ref/tags/v4.1.2)
resolved to **`182084b82aae88b1b0731540f63bf7416f27773a`**. The relevant implementation
is [rpc/src/rpc.rs at that immutable commit](https://github.com/anza-xyz/agave/blob/182084b82aae88b1b0731540f63bf7416f27773a/rpc/src/rpc.rs).

The inspected functions establish these implementation details:

- `is_blockhash_valid` obtains the bank using the supplied configuration; the
  shared bank selection enforces `min_context_slot`. Its response context is
  that bank's slot.
- For a finalized block, `get_block` calls
  `check_blockstore_writes_complete(slot)` before reading the rooted block. An
  incomplete transaction-status writer returns an error. This supports the
  conservative behavior of the added anchor against the pinned implementation.
- `get_signature_statuses` chooses a **processed** bank for its response context,
  checks the status cache and, when enabled, rooted/history storage. The context
  is therefore not itself a finalized-history completeness certificate.

The engineering conclusion is bounded: the new comparisons close the reproduced
older-context mismatch and make the separate RPC observations more consistent.
They do not prove absence cryptographically, prove a continuous historical
index, or establish that independently routed backends share a complete history.
Successful rooted-block retrieval on one backend does not certify another
backend's signature index. The existing assumptions about an honest and
consistent configured RPC service remain; this report does not broaden them.

## Executed verification and preservation

This worker performed source-preservation assertions, not another functional
suite. The coordinator was already independently reproducing the RED cases and
running focused GREEN, and the external reviewer had added five scoped tests.
Repeating those executions would not resolve a distinct remaining question.

The completed Python/Git assertions verified:

1. The reviewed `submit.ts` is byte-identical to the author's frozen correction.
2. It is the only changed file beneath `packages/chain-solana/src` relative to
   PR205.
3. The submission functions before the status collector and the observation
   application/cancellation code after it are byte-identical to PR205.
4. Twelve selected source/subtree boundaries retain identical Git objects:
   `contracts/solana`, intent, journal, plan, wallet, composition, reader, the
   application RPC serializer, the Solana workflow, the full native browser
   harness and both native/browser fixture helpers.
5. `git diff --check` passed and the isolated tree was clean before adding this
   report.

The machine-readable local receipt is
`verification/generation6-solana-context-review/source-preservation.json` in the
coordinator's scratch workspace. An initial helper attempt named a nonexistent
`src/client.ts` path and aborted; it supplied no qualification. The corrected
inventory uses the actual `src/compose.ts` and native browser script paths and
completed successfully.

No unit/full suite, TypeScript build, real RPC endpoint, Chromium, native
validator, wallet or funds were exercised by this worker. No source, dependency,
lockfile, allowlist, test command or workflow was changed. The additional exact
finalized-block read still needs the final integrated source's native hosted
qualification, including the existing recovery/replacement journey, strict
physical-send and principal/fee assertions, and both real refund waits.

**Review totals:** Standards: zero findings. Specification: zero additional
High/Medium findings in this correction; the RPC-history trust limit above and
final native qualification remain explicit.
