# Proposed bounded retention of local Solana cancellations

Status: **PROPOSED — owner decision required; no behavior change or implementation approval.**

Source baseline: [`main@fdf346ab8e6aacc60b501007ec10ec7ee840a701`](https://github.com/djshellshoxxx/p2p-offramp/commit/fdf346ab8e6aacc60b501007ec10ec7ee840a701).
This addresses B1b F1 in the [current Lane B handoff](../consolidation/LANE-B-PROGRESS.md).
It is a source-reviewed design candidate. No new runtime reproduction or qualification is claimed.

## Problem and recommendation

The handoff records that repeated wallet rejection leaves cancelled native
Solana intents until the 32-record journal cap prevents later release/refund
admission. Both the client and encrypted journal enforce that cap, and the
current capacity test explicitly requires preserving all 32 cancelled records.
Generic retention does not decode this native aggregate journal.

Recommend a narrow, pressure-triggered operation: while an explicit new action
reserves its preparation, atomically retire **one eligible local cancelled
record** if the journal is full. Preserve the existing bound and ordinary
write semantics. This deliberately gives up a limited class of cancellation
history; that policy requires the owner's choice before implementation.

Sources: [journal admission](../../packages/chain-solana/src/journal.ts),
[encrypted journal](../../packages/chain-solana/src/vaultjournal.ts),
[capacity regression](../../packages/chain-solana/test/vaultjournal.test.mjs),
[generic retention classification](../../packages/storage/src/retention-service.ts).

## Signature-persistence limitation

**A null stored signature does not prove the wallet never signed.**
`signIntent` invokes the sign-only wallet before storing its response. A late
result or failed persistence can leave a null-signature preparation that the
client later cancels. The proposed class is therefore "locally cancelled, with
no stored signature or marker," not "proven never signed."

Qualification must establish that every stale signing or marker continuation
is fenced by the existing CAS and terminal-state rules. If those properties
cannot be established, or positive proof that no wallet signature ever existed
is required, retain the record. Current fields do not provide that stronger
proof. No claim is made about an external wallet independently broadcasting.

Sources: [signing and durable marker order](../../packages/chain-solana/src/submit.ts),
[cancellation and prepared-review lifecycle](../../packages/chain-solana/src/compose.ts).

## Required eligibility

All conditions must hold on a completely parsed, trade-bound current record:

- State is `cancelled`.
- `signature`, `sendMarkedAt` and `outcome` are explicitly `null`.
- `originProfileId` equals the live current profile and is not `UNKNOWN_ORIGIN`.
- `replacementOf` is `null`, and no retained record references this `intentId`.
- No field is missing, malformed, inconsistent, from a future format, or bound
  to another trade. Legacy and foreign-profile restored records stay ineligible.

Preserve all prepared, signed, sendMarked, sent, unknown, finalized, failed and
dropped records; signed cancellations; replacement participants; and records
with uncertain provenance. Existing [intent invariants](../../packages/chain-solana/src/intent.ts)
remain mandatory.

## Atomic interface and implementation boundary

Add an explicit journal capability, for example:

```text
reserveWithRetirement(binding, expectedRevision, newPrepared, retireIntentId, signal?)
```

Keep ordinary `write` behavior unchanged. Revalidate the complete journal,
live session/profile, expected trade revision and candidate eligibility inside
the existing vault transaction boundary. Check new-ID uniqueness and every
non-capacity admission/replacement rule against the **complete pre-retirement
history**. Retire one eligible record and insert the new preparation in the
same replacement payload, preserving the maximum record count.

Commit once through the existing vault revision/CAS guard. Increment the trade
revision monotonically; never delete the aggregate or reset its revision. There
is no separate deletion window, automatic retry, background cleanup or generic
delete permission. Conflicts and uncertain persistence allow no signing or
sending. The existing v1 payload shape can remain unchanged, subject to the
compatibility tests below.

## Acceptance required before a Tier C patch can qualify

1. Repeated ordinary cancellation/rejection followed by explicit release,
   refund and payout: bounded record count, correct existing action rules,
   and no cancellation-triggered broadcast.
2. Exact preservation of every disqualifying record and successor reservation;
   duplicate IDs rejected even when they match the proposed retired record.
3. Held wallet completion, stale prepared-review handle and two-session CAS
   conflict: stale continuations cannot persist a signature/marker or send.
4. Lock/cancel before and after atomic persistence, plus uncertain write and
   subsequent recovery: preserved uncertainty and no automatic resend.
5. Fresh-key backup restore: protected metadata remains exact, foreign-profile
   retirement is refused, and existing readers can decode the retained format.
6. A full journal containing only protected history refuses without mutation.

## Decision and limits

The owner may approve the narrow loss of eligible local cancellation history,
with truthful backup/help wording, or retain complete history and the current
refusal. CAS fencing, marker preservation and the acceptance criteria are
engineering requirements, not optional policy choices.

This proposal addresses cancellation-driven saturation only. It does not solve
saturation by signed, marked, restored or successor-linked history. It does not
change the Solana shared adapter, registry trust, public-cluster profiles or
the separately owned #278/#279 work. A final implementation remains subject to
[D8 Tier C](../adr/proposed/D8-merge-policy-and-branch-protection.md).
