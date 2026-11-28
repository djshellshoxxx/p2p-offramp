# Proposed bounded retention of local Solana cancellations

Status: **OWNER-APPROVED DESIGN DIRECTION — implementation in progress; qualification and Tier C integration remain gated.**

On 2026-11-28, after the recommendation explicitly identified both narrow
cancellation-history retirement and the requirement for upgraded native readers
after migration, the owner replied: "go wit recommendations". This accepts those
two policy tradeoffs and authorizes preparing the bounded implementation. It
does not waive the acceptance evidence or the D8 integration gate. Migration
remains an explicit action; opening or restoring a profile does not authorize it.

Source baseline for the 2026-11-28 design addendum: [`main@f4dc63569b906de9a7832f78f46b2368533e6241`](https://github.com/djshellshoxxx/p2p-offramp/commit/f4dc63569b906de9a7832f78f46b2368533e6241).
The initial proposal used `main@fdf346ab8e6aacc60b501007ec10ec7ee840a701`.
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
history under the owner-approved direction recorded above.

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
is fenced by immutable reservation identity, live session authority, CAS and
terminal-state rules. A freshly loaded revision alone is insufficient. If those properties
cannot be established, or positive proof that no wallet signature ever existed
is required, retain the record. Current fields do not provide that stronger
proof. No claim is made about an external wallet independently broadcasting.

Sources: [signing and durable marker order](../../packages/chain-solana/src/submit.ts),
[cancellation and prepared-review lifecycle](../../packages/chain-solana/src/compose.ts).

## Required eligibility

All conditions must hold on a completely parsed, trade-bound current record:

- The v2 reservation has a validated, immutable allocation generation.
- State is `cancelled`.
- `signature`, `sendMarkedAt` and `outcome` are explicitly `null`.
- `originProfileId` equals the live current profile and is not `UNKNOWN_ORIGIN`.
- `replacementOf` is `null`, and no retained record references this `intentId`.
- It is not the current latest record for its action, using the existing
  `createdAt` ordering and the vault's `intentId` tie order.
- No field is missing, malformed, inconsistent, from a future format, or bound
  to another trade. Unknown-provenance legacy records and foreign-profile
  restored records stay ineligible. An unmigrated v1 journal cannot retire
  records; the explicit migration below must establish identity first.

Preserve all prepared, signed, sendMarked, sent, unknown, finalized, failed and
dropped records; signed cancellations; replacement participants; and records
with uncertain provenance. Existing [intent invariants](../../packages/chain-solana/src/intent.ts)
remain mandatory.

## Atomic interface and implementation boundary

The recommended v2 capability separates reservation from updating an existing
reservation. Illustrative signatures are design requirements, not implemented APIs:

```text
reserve(binding, expectedRevision, newPrepared, retireIdentity?, signal?)
  -> { reservationIdentity, record, revision }
update(binding, expectedRevision, reservationIdentity, transition, signal?)
  -> revision
```

Every v2 preparation uses the reservation allocator, including when there is
space. A v2 update cannot insert an absent record, allocate a generation, change
an identity, or accept an identity-free v1 handle. Keep the ordinary v1 behavior
for unmigrated journals, with retirement disabled.

Inside the existing vault transaction boundary, revalidate the whole journal,
live session/profile, expected trade revision and any retirement candidate.
Check new `intentId` uniqueness and every non-capacity admission/replacement
rule against the **complete pre-retirement history**, including the candidate.
A caller cannot reuse the candidate's ID in the same retirement transaction.

If full, retire exactly one eligible cancellation and insert the new preparation
in the same replacement payload. If no candidate qualifies, refuse without
mutation. With space available, reserve without retiring. Commit once through
the existing vault session/CAS guard. There is no separate deletion window,
automatic retry, background cleanup or generic delete permission. Conflicts
and uncertain persistence allow no signing or sending.

## Design addendum — 2026-11-28

This addresses the [independent review of the original proposal](https://github.com/djshellshoxxx/p2p-offramp/pull/281#issuecomment-7217172048).
It is a prospective retirement design, not a claim that a new defect has been
reproduced on main. It supersedes the original assumption that the unchanged
v1 payload shape would suffice. The owner subsequently approved the compatibility
tradeoff recorded above; runtime qualification remains required.

### Identity and durable allocation

| Term | Proposed meaning |
| --- | --- |
| Trade revision | Monotonic, nonnegative safe integer stored inside the native journal; current-state CAS fence and allocation high-water mark. |
| Allocation generation | Immutable positive safe integer assigned to a reservation by its durable journal transaction. It is never a wall-clock timestamp. |
| Reservation identity | Full trade binding, original `originProfileId`, `intentId` and allocation generation. |
| Live authority | Current profile/session lease plus the caller's original reservation identity; refreshing a revision never refreshes that identity. |
| Outer vault revision | The encrypted-container CAS revision. It is separate from the embedded trade revision and can reset on fresh-key restore. |

For a new reservation at embedded revision `r`, allocate generation `r + 1`
and commit the new aggregate at revision `r + 1`. Updates advance the revision
but preserve the reservation generation. Check integer headroom before addition.
Never reset or wrap the counter, delete/recreate the aggregate to regain capacity,
or recycle a committed generation. Treat an uncertain allocation as possibly
committed; only a confirmed durable reread can establish the next allocation.

At integer exhaustion, refuse before wallet access or broadcast. Subsequent
explicit recovery must reread durable state; it cannot assume that a failed
response means allocation did not commit.

Random IDs remain useful and must be unique among retained records, but random
collision probability is not the identity argument. If a previously retired
ID appears in a later reservation, its generation differs. Identical message
bytes and timestamps do not make it the old reservation.

### Proposed format and stable lookup

Recommend an explicitly versioned native aggregate: outer private-record
`schemaVersion: 2`, native `format: p2p-offramp/solana/vault-journal/v2`, the
existing full `binding` and embedded `revision`, and at most 32 entry wrappers.
Each wrapper contains `generation`, the unchanged canonical v1 `intent`, and
`replaces`: either null or the predecessor's complete identity within that
binding. All keys and numeric ranges must be parsed strictly. Generations are
unique among retained entries and never greater than the embedded revision.

Keep the **established v1 vault record ID** for a trade. Separate this permanent
locator namespace from the versioned payload format. Today the locator hashes
the format string together with the binding; changing that string in the
locator would create a second journal and allow old code to see an absent
record. Parallel writable copies, an empty fallback and downgrade to v1 are
not permitted.

The current native decoder rejects outer schema versions other than 1 and
requires exact v1 fields. Thus an older native reader encountering v2 at the
same locator must refuse it. An older cached writer must lose the encrypted
vault CAS. Generic vault acceptance of opaque version-2 payloads is a different
capability from interpreting them for native trade recovery.

Sources: [native decoder and locator](../../packages/chain-solana/src/vaultjournal.ts),
[generic private-record schema](../../packages/schemas/src/vault.ts).

### Explicit migration, without retirement

Migration is a separate atomic operation, permitted only after the compatibility
policy and implementation are approved. It must:

1. Completely parse and trade-bind the v1 aggregate and all retained intents,
   validate the live session and original provenance, and preserve every intent
   field. Migration must not convert foreign or unknown origins into local ones.
2. For `n` retained records at revision `r`, require
   `r <= Number.MAX_SAFE_INTEGER - (n + 1)` before arithmetic. In the existing
   intent-ID order, assign generations `r + 1` through `r + n`; commit embedded
   revision `r + n + 1`. These are new registration identities, not assertions
   about original creation order. The outer vault advances by one CAS commit.
3. Resolve each non-null legacy `replacementOf` to exactly one retained
   predecessor and bind its full identity, including its actual origin profile.
   Require matching legacy ID/full reference, same action, a dropped predecessor,
   no competing successor and a consistent graph. Unresolved references refuse
   migration without changing v1.

4. Check the complete encoded payload against `MAX_PAYLOAD_BYTES` before commit.
   Preserve all records: migration cannot free space by discarding history.
   Insufficient counter or byte headroom leaves the original journal intact.
5. Commit at the stable locator and invalidate all pre-migration capabilities.
   No read or update may look up an old `intentId` and attach the current
   generation to turn it into a new authority-bearing handle.
6. On interruption or an uncertain result, require explicit rereading and
   reconciliation. Reopening committed v2 retains its generations; it must not
   run migration again, assign new identities or automatically invoke a wallet.

A predecessor may have a larger migration generation than its successor because
assignment uses ID order. Generation must not replace the existing action-order
comparator or be interpreted as historical chronology.

Here, **legacy protection** means unknown or unverifiable original provenance,
not every valid record encoded by the current v1 implementation. A completely
validated current-origin v1 record may become eligible only after this explicit
identity migration and only if it independently satisfies every eligibility
condition. Protecting every migrated v1 record forever would leave existing
saturated journals unresolved. Migration itself retires nothing.

### Operations and stale authority

Every authority-bearing handle, lookup, comparison and continuation must carry
the original complete reservation identity. This includes prepared review,
explicit cancellation, cleanup, signing results, marking, dispatch, recovery
updates and replacement selection. Reloading state can refresh the expected
write revision; it cannot change the captured reservation identity.

| Situation | Required behavior |
| --- | --- |
| Review or cancellation outlives retirement | Identity absent or different generation: refuse; do not act on a later record with the same random ID. |
| Two clients reserve from one revision | At most one CAS wins; the loser gets no usable reservation and cannot automatically retry into a wallet operation. |
| Wallet completes after cancellation or migration | Preserve original identity and lease checks; refuse stale persistence, marking and dispatch. A returned signature does not authorize a newer reservation. |
| Lock/cancel or ambiguous commit response | Preserve durable uncertainty; reread through an explicit recovery flow. Do not infer that a signature or marker was never stored. |
| A marker already committed before migration | Preserve it and the full signed record; reconcile under existing rules. Migration cannot undo a broadcast or authorize a resend. |
| Recovery/replacement after reopening | Construct new live authority from validated current state for explicit user action, not by upgrading an old handle. Replacement references must match the protected predecessor's full identity. |

The existing `samePreparation` comparison and fresh-revision reloads in
[compose.ts](../../packages/chain-solana/src/compose.ts) must be audited together
with [signing/marker persistence](../../packages/chain-solana/src/submit.ts).
Existing CAS tests alone do not establish the proposed identity invariant.
Migration cannot revoke a signature already produced by an external wallet;
the signature-persistence limitation above still applies.

### Preserve later admission and replacement behavior

Before selecting a candidate, protect the current latest record for each action
(`fund`, `release`, `refund`, `payout`). Use `createdAt` and the existing
vault `intentId` tie order, not generation or insertion order. This protects
at most four action heads in addition to the other protected history.

Removing a non-head cancellation leaves each action's current latest record
unchanged. Reapplying this rule on every later reservation preserves that
property even with tied timestamps or a clock that moves backward. Keep every
dropped record and both sides of every replacement relationship. Otherwise,
retirement could expose an older unsucceeded dropped record and change later
admission. Checking only the immediate pre-retirement admission is insufficient.

Preserve all non-capacity terminal-state and replacement rules on every
reservation. Resolve a new replacement's reference against the full retained
history before retiring anything, and preserve the predecessor's actual
identity. All simultaneously retained `intentId` values remain unique.
The policy intentionally allows a retired random ID to appear later with a
different generation; it does not claim permanent uniqueness of that string.

Source: [current admission and latest-action logic](../../packages/chain-solana/src/journal.ts),
[canonical vault ordering](../../packages/chain-solana/src/vaultjournal.ts).

### Backup, restore and compatibility

Fresh-key restore changes the current profile/key IDs and resets the **outer**
vault revision. It preserves native payloads, so the embedded trade revision,
every generation, replacement reference, original provenance, signature, marker
and outcome must survive exactly. Never reconstruct the high-water mark from
record count or remaining generations.

Restored records remain foreign to the destination profile and cannot qualify
for local retirement. Source-profile/session capabilities remain unusable
there. New local reservations continue above the preserved embedded revision
and carry the new profile's provenance. Repeated supported restores must
preserve this separation, including restoration of a pre-migration v1 backup.

The inspected storage boundary has no independent high-water mark that survives
arbitrary replacement of all local storage. This design does not claim
monotonicity across arbitrary same-profile rollback. Such rollback is outside
the supported fresh-key restore contract and cannot be silently treated as
proved safe; any detected inconsistent state must refuse mutation.

| Reader/writer | Journal | Required result |
| --- | --- | --- |
| Existing native v1 client | Unmigrated v1 | Existing behavior and recovery; no retirement. |
| Upgraded native client | v1 | Full recovery support; retirement disabled until explicit successful migration. |
| Upgraded native client | v2 | Validate identities and all retained metadata; permit only qualified v2 operations. |
| Existing native v1 client | v2 at the established locator | Refuse unsupported version; no empty fallback or overwrite. |
| Generic vault backup/restore | Opaque v2 private record | Preserve payload and metadata; this does not make an old native reader capable of recovery. |

**The original requirement that existing native readers decode the retained
format is not met by this recommendation.** Approval of v2 must explicitly
amend that requirement, require upgraded clients to read both versions, and
provide truthful upgrade/backup/help wording before users migrate funded
trades. If old native recovery must remain supported, keep retirement disabled
until a different compatible design is proved against all permitted writers.

Sources: [backup implementation](../../packages/storage/src/backup-service.ts),
[vault session/CAS boundary](../../packages/storage/src/vault-service.ts),
[current native restore tests](../../packages/chain-solana/test/vaultjournal.test.mjs).

### Bounded storage and refusal

The design retains one aggregate, at most 32 complete intent wrappers and one
safe-integer high-water mark. Replacement references are bounded by retained
records; no retired-ID list, tombstone log or unbounded action summary is added.
Protecting the four action heads consumes existing slots rather than adding
history. The complete encoded payload must remain within `MAX_PAYLOAD_BYTES`;
a count bound alone is not sufficient.

A full journal with no eligible candidate, counter exhaustion, insufficient
payload headroom, unknown format, invalid reference, foreign retirement candidate, stale
authority or conflicting CAS refuses without a deliberate history mutation.
An ambiguous persistence result is handled as uncertainty, not as proof of an
unchanged journal. Ordinary recovery of protected history must remain available
through the appropriate supported reader.

## Acceptance required before a Tier C patch can qualify

These are implementation acceptance gates. Completion evidence must identify the
exact tested implementation; the earlier documentation review did not execute them.
Use the real encrypted-journal boundary; the lifecycle fake's revision checks
and map replacement are insufficient. Deterministically control IDs, clocks
and concurrency instead of relying on the current fixtures' advancing defaults.

1. **Pressure and protected history:** repeated cancellation/rejection followed
   by explicit release, refund and payout; count and byte bounds; exactly one
   eligible retirement when full; none when space remains; complete preservation
   of every protected intent field, reference and marker. An all-protected full
   journal refuses unchanged. No cancellation-triggered wallet or broadcast.
2. **Identity reuse:** fixed random-ID bytes, identical timestamps/message bytes
   and several retirements; reject IDs present in the complete pre-retirement
   history, including the candidate. A later reuse of a retired ID gets a
   different generation. Old review, cancellation, cleanup and wallet results
   cannot act on that reservation, even after reloading a current revision.

3. **Action and replacement equivalence:** preserve the latest action heads
   before and after retirement and on subsequent actions; tied timestamps,
   backward clocks, reversed predecessor/successor ID order, dropped heads,
   one-successor constraints and complete-reference mismatch. Test all four
   actions and preserve the established tie comparator.
4. **Concurrency and lifecycle:** two clients sharing a snapshot, stale handles,
   held wallet completion and lock/cancel before and after persistence. No stale
   signature/marker writes or dispatch. Already committed signatures/markers
   remain exact; uncertain writes permit no automatic retry or resend.
5. **Migration and mixed versions:** all retained v1 fields preserved; fresh
   registration generations and embedded revision correct; one outer CAS;
   same locator; old pending writes lose; old readers refuse v2 explicitly;
   upgraded readers recover both formats. Test unresolved replacement graphs,
   missing identity, interrupted/uncertain migration and reopening committed v2.
   No silent handle upgrade, second journal or downgrade path.
6. **Backup and restore:** v1 and v2 fresh-key restores, repeated restores, an
   older snapshot and profile/session changes. Preserve embedded revision,
   generations, complete references and protected metadata; refuse
   foreign-profile retirement and source-session continuations. Verify funded
   release/refund/payout recovery with the required upgraded reader.
7. **Bounds and unchanged failure state:** allocation/migration arithmetic at
   the safe-integer boundary, full wrapped-payload limit, malformed/future
   identity data and ordinary-update insertion bypass. Definite refusals leave
   state unchanged; ambiguous results retain uncertainty without issuing a
   usable reservation or invoking the wallet.
8. **Delivery gates:** independent review of the complete implementation,
   applicable D8 checks on its current head, owner approval of both policies
   below, and truthful upgrade, backup and recovery instructions.

Sources for current test scope: [vault regressions](../../packages/chain-solana/test/vaultjournal.test.mjs),
[lifecycle fixture defaults](../../packages/chain-solana/test/lifecycle-support.mjs).

## Owner decision and implementation limits

**Accepted direction:** implement the versioned identity design above, preserving
all eligibility and acceptance requirements. The owner accepted both the narrow
history-loss policy and the native-reader compatibility amendment on 2026-11-28.
Existing native v1 clients must refuse migrated journals; upgraded readers must
support both versions. Until a trade is explicitly migrated, existing v1 history
and capacity behavior remain unchanged.

A sidecar counter or a new-client naming convention alone does not prove that
permitted old writers preserve reservation identity. Identity fencing, stable
lookup, atomicity and protected-history preservation remain engineering
requirements. The accepted policy authorizes preparation of the implementation;
it does not substitute for tested evidence or final D8 integration approval.

This proposal addresses cancellation-driven saturation only. It does not solve
saturation by signed, marked, restored or successor-linked history, nor promise
protection against arbitrary same-profile storage rollback. It does not change
the Solana shared adapter, registry trust, public-cluster profiles or the
separately owned #278/#279 work. A final implementation remains subject to
[D8 Tier C](../adr/proposed/D8-merge-policy-and-branch-protection.md).
