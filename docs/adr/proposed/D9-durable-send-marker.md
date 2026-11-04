# D9 - Durable send marker on transaction intents (decision packet)

Status: PROPOSED. This packet is for the owner. It does not decide anything, and nothing here changes running behavior.

Paths marked "main" exist on `main` (e9b9db3). Paths marked "PR #26 only" exist only on the PR #26 branch.

## The question

Should a transaction intent durably record that its send marker was written, so that recovery after a restart can tell an intent that was never handed to the wallet from one that may have been broadcast?

## Why it matters now

Qodo finding 1 on PR #26: if the worker stops between preparing an ERC-20 approval and writing its send marker, recovery cancels the approval and then raises `RECOVERY_SELECTION_REQUIRED` on every later attempt. The trade cannot continue. No funds are at risk, because this happens before funding.

A first fix let the trade continue to a fresh approval and funding. An independent review showed that it made a **funded** escrow unrecoverable from the app: on a later restart, `watch` reconciles the cancelled approval natively, and the bounded scan throws. A second investigation showed that no fix inside `apps/web` can be safe, because the durable record cannot distinguish the two cases below. The fix was reverted. The app now fails closed before funding, which is pinned by `apps/web/test/journey-private-trade-recovery.test.mjs` (PR #26 only).

## Current source behavior

- A `failed` intent with a null hash is written in exactly two places:
  - when `recover()` cancels a prepared intent that was never marked for sending (`packages/domain/src/tx-lifecycle.ts:195` and `:442`);
  - when the wallet answers `eth_sendTransaction` with error 4001 **after** the send marker was written (`tx-lifecycle.ts:296` and `:307-309`).
- No other path writes that combination: reverted receipts and native `failed` readings carry a hash (`tx-lifecycle.ts:377`, `:414`, `:432`; `packages/domain/src/intent-journal.ts:255`, `:293`).
- `IntentV1` has no field that records whether the send marker was written (`packages/schemas/src/intent.ts:6-13`). The proof that an intent was never sent exists only in the memory of the journal instance that observed it (`intent-journal.ts:353`, `:365`). The domain already requires restored records to be re-read rather than trusted (`tx-lifecycle.ts:248`, `intent-journal.ts:376`).
- A 4001 answer is the wallet's own claim. It does not prove that nothing was broadcast.

## Options

**Option A - add a durable `sendMarkedAt` field to `IntentV1`.** It is written once, in the same compare-and-swap that moves an intent from `prepared` to `broadcast-unknown` in `markSending` (`intent-journal.ts:228`), and never cleared. A `prepared` to `failed` cancellation keeps it null. `recover()` and `prepare()` read it, and `watch` may then skip only `failed` approvals with a null hash **and** a null `sendMarkedAt`. This is a schema change to a persisted record, so it needs a migration rule for existing records: an existing record without the field is treated as "may have been sent".

**Option B - a separate durable never-sent tombstone.** Recovery writes a tombstone record when it cancels a never-marked intent. The existing intent schema stays unchanged, but there are two records to keep consistent and a crash between them to handle.

**Option C - keep failing closed.** No schema change. The stuck trade must be abandoned and re-created by the user. Funds are never at risk, but the user experience is poor and the Qodo finding stays open.

## Recommendation

Option A, proposed for owner decision. It records the fact where it is created, in the same atomic write, and keeps one source of truth. Existing records default to the safe interpretation.

## Acceptance tests the decision implies

These are the funded-restart cases from the review. Each must reach the normal funded phase (reconcile, payment coordination or settling), with release and the timeout refund still reachable and no transaction re-sent:

1. A cancelled never-sent approval, then a fresh approval and funding, then a restart **more than 64 blocks** after the cancelled approval's `preparedAtBlock`.
2. The same, where the fresh approval used **another nonce** than the cancelled one.
3. The same, where the fresh approval's **calldata differs** (for example, an allowance reset compared with an approve).

Also:

4. A 4001 after the marker is never treated as never-sent: it is reconciled, never resent.
5. An existing record with no `sendMarkedAt` field is treated as possibly sent.
6. A crash between the marker write and the wallet call leaves `sendMarkedAt` set.

## What this unblocks

Closing Qodo finding 1 without risk to funded escrows, and letting a user continue a trade whose approval was interrupted before it was sent.
