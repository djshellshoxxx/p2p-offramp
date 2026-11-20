# Solana reconciliation: bind absence to finalized expiry

Date: November 19, 2026 (America/Los_Angeles); execution November 20 UTC.

## Outcome and source

The coordinator reproduced and repaired a false terminal-state transition in the
maintained Solana client. An absent-signature response from an older RPC context
could be combined with a newer finalized block height, causing an uncertain
intent to be recorded as `dropped` without absence evidence covering expiry.

This is a **Medium transaction-state integrity finding**, identified as
`G6-SOLANA-CONTEXT-001`. It can incorrectly admit a later explicit replacement
review. The client does not automatically resend, and this report does not claim
an on-chain double settlement or theft. The original durable send marker remained
present even in the reproduced erroneous terminal state.

| Source | Identity |
| --- | --- |
| Published starting candidate | PR205, `cd7d54ba075118a7ec043788c17718be842ee405` |
| Regression checkpoint | `b0e3cc0baafbade3d5712d90e2705d4ec1693042` |
| Corrected implementation and expanded tests | `dde7345e1ee2e722344d6f27dd8bd952c285d520` |
| Corrected tree | `cc83de50382ef9328da314305b6318ad789e9b40` |

The preliminary lead came from a worker that ended with an automated screening
block before producing a verified result. The coordinator independently executed
the reproductions and implementation described here. No completed security audit
is attributed to that interrupted worker. A new independent reviewer separately
reviews the frozen correction.

## Reproduction and intended behavior

The regression uses the existing composed client and deterministic local cluster:
create a funded-intent request with an unacknowledged send, retain its `unknown`
journal state, advance the finalized height beyond the original validity window,
then return an absent signature at either the preparation slot or 25 slots later.
Both absence contexts precede expiry.

On the original implementation both cases return a successful terminal observation
instead of refusing the inconsistent evidence: **0/2 pass, 2 fail**. The test also
checks the retained marker, journal write count and physical send count. No public
endpoint, real wallet, live funds or deployed contract participates.

Correct behavior is to preserve uncertainty until evidence is sufficiently fresh.
The rejection is `INTEGRITY_FAILURE`; no terminal journal write or additional send
occurs. Coherent current evidence still permits the existing `dropped` transition.

## Correction

`packages/chain-solana/src/submit.ts` now:

1. Rejects a status context older than the original blockhash slot, including a
   null status whose context was previously discarded.
2. After the existing finalized-height expiry check, requests
   `isBlockhashValid` at **finalized** commitment with the preparation slot as the
   minimum context. Its returned slot must be current enough and the original
   blockhash must be invalid.
3. Reads `getBlock` for that exact slot at finalized commitment. Its block height
   must cover the preceding observed height and exceed the intent's original
   `lastValidBlockHeight`.
4. Preserves the separate **processed** invalidity check, now requiring a context
   at least as new as the finalized expiry block.
5. Preserves the complete-history lower-bound check. A final absent status must
   likewise cover the finalized expiry slot before absence becomes terminal.
6. Rechecks genesis identity after rejected evidence as well as accepted evidence.
   A network change cannot poison the correct network's height floor, and the
   original wrong-network classification remains covered by existing tests.

No new RPC method or endpoint is admitted. The maintained local RPC allowlist
already contains all methods used. Preparation, signing, durable marker writes,
one-send behavior, explicit replacement, contracts and economic thresholds are
unchanged. Missing/pruned blocks or inconsistent responses fail conservatively.

## Protocol basis and limits

The implementation was checked against the official Solana RPC documentation:

- [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses):
  status results have a response context; history lookup is explicitly requested.
- [isBlockhashValid](https://solana.com/docs/rpc/http/isblockhashvalid): a contextual
  boolean response supports commitment and minimum-context configuration.
- [getBlock](https://solana.com/docs/rpc/http/getblock): a selected slot can be read
  at finalized commitment and includes its block height; an unavailable result is
  not evidence of expiry.
- [getBlockHeight](https://solana.com/docs/rpc/http/getblockheight): the result is a
  block-height scalar, so it does not alone bind a separate cached status response
  to the same finalized prefix.

The conclusion that evidence must cover a common finalized prefix is the
engineering inference applied here. These checks detect stale/inconsistent
responses; they do not provide a cryptographic proof against an RPC service that
fabricates a mutually consistent chain history.

## Executed verification

The initial regression checkpoint failed **0/2**. The first correction passed
**25/25** existing lifecycle, independent-review and new regression tests. The
expanded frozen correction passed **30/30**, zero failures/skips/cancellations:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=1 \
  packages/chain-solana/test/reconciliation-context.test.mjs \
  packages/chain-solana/test/lifecycle.test.mjs \
  packages/chain-solana/test/independent-review-regressions.test.mjs
```

The added cases cover two stale absence contexts, an old finalized context, an old
processed context, a missing finalized block, a status context before preparation,
and successful current-context expiry without another send or marker removal.
Existing real-controller tests retain explicit replacement, history gaps,
height regression, wrong-network refusal and rejection without floor mutation.

| Local log | SHA-256 |
| --- | --- |
| Original two-case regression | `6f6f8d9afe8295ce92094f9fa29857a45752fb01ec21edb4e7332775b6c735be` |
| Expanded 30-case execution | `8574e2e64be27e4a23b74f9a2e8728eaf680cbab6fc172fa78c22cceb7a1c0e8` |

Logs were retained under `verification-g6` in the coordinating workspace. This
report does not claim the combined core suite, final TypeScript/build checks or
actual hosted validator/browser qualification. Those must be recorded against the
final integrated source. Both real 1,800-second native refund waits and the strict
physical-send/principal/fee assertions remain unchanged. No main merge or release
approval is established by these local results.
