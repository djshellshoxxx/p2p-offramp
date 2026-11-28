# Explicit native journal migration and cancellation retention

The native client supports a versioned journal with immutable reservation
identities. The owner accepted this policy direction on 2026-11-28; the
[design and acceptance criteria](../../../docs/engineering/SOLANA_CANCELLATION_RETENTION_PROPOSAL_20261127.md)
remain the implementation contract. This document describes the package API.
Application migration controls are a separate integration boundary and are not
added by this native-package change.

## Compatibility and user choice

An unmigrated v1 journal retains its current format and capacity behavior.
Opening a profile, restoring a backup and preparing a transaction do not migrate
it. Migration is a separate per-trade confirmation that preserves every existing
intent field, signature, send marker, outcome and original profile ID.

Before confirmation, the host must explain that older native clients cannot
recover the migrated journal and that subsequent explicit preparations may
retire narrowly eligible cancellation history when full. Keep encrypted-backup
export available. A backup preserves the payload; it does not make an older
native reader understand v2. The permanent vault locator remains unchanged, so
older native code refuses the version instead of seeing an empty parallel journal.

## Host API

1. Call `client.journalState(trade)` to inspect the version, revision, migration
   capability and current entries. Each v2 entry includes its complete identity.
2. Call `client.prepareJournalMigration(trade)` only for an explicit migration
   request. Display the returned trade binding, record count, version change
   and `requiresUpgradedReader` consequence, plus the history-retention policy.
3. In the user's confirmation handler, call
   `client.confirmJournalMigration(review.value)` with that exact opaque review.
   Copies and serialized objects have no authority. Confirmation is one-shot
   and checks the captured revision and profile before its atomic commit.
4. Reload state after completion. On conflict, reopen and reconcile; on an
   uncertain result, inspect durable state explicitly. Do not automatically
   retry migration or open a wallet request.

These three methods make no RPC or wallet calls. A port without the migration
capability reports it unavailable; the host must not simulate migration with
ordinary writes. Unlock and restore retain their existing recovery behavior.

## Reservation and rebuild identity

Every v2 reservation has a generation allocated from the embedded trade revision.
The identity also binds the trade, original profile and random intent ID. Updates
retain this captured identity while refreshing only the expected write revision.
A later record with the same random ID is a different reservation.

For an explicit v2 rebuild, select a dropped predecessor from a fresh
`journalState` result and pass its complete `identity` as `rebuildOf`. The existing
string form remains available for v1 only. Do not replace an old handle's
generation by looking up its random ID in a newer snapshot. Migration assigns
registration identities, so generation order does not describe historical time.

Migration invalidates this client's earlier transaction reviews. Cross-client
identity changes detected before dispatch refuse continuation. Vault state and
network dispatch are separate operations: migration cannot revoke an already
initiated broadcast. Durable signed records and markers remain for reconciliation;
no migration or recovery step automatically resends them.

## Retirement and backup limits

The journal keeps at most 32 entries. Only a new explicit v2 reservation at
capacity may retire one cancellation in the same atomic write. Eligibility
requires current-profile provenance, no stored signature, marker or outcome,
no replacement relationship, and no role as the latest record for its action.
Null stored signature does not prove that a wallet never produced one.

Migration itself removes nothing. Protected-only saturation, counter exhaustion
and encoded-payload limits refuse admission. There is no growing retired-ID log,
counter reset, generic deletion or background cleanup.

Fresh-key restore preserves generations, the embedded revision, complete
predecessor references and all intent fields. The outer vault revision resets
and the destination profile changes; restored history remains foreign and cannot
qualify for local retirement. The design does not provide an external high-water
mark surviving arbitrary same-profile storage rollback.

The upgraded pure recovery-summary reader recognizes v2 without exposing
generation, provenance, message bytes or replacement metadata. It still emits
an unverified offline hint and grants no transaction authority. An empty migrated
journal has no hint and remains counted in the opaque/unsupported total.

## Application integration handoff

The current localnet application has no migration controls. Its existing v1
browser acceptance remains regression evidence, not qualification of a v2
migration journey. Lane A owns the following application changes:

| File and entry point | Proposed change and purpose |
| --- | --- |
| `apps/web/src/solana-localnet/protocol.ts`: `SolanaCommand`, `SolanaSnapshot`, `SolanaTradeView` | Add separate `journal.migration.prepare`, `journal.migration.confirm`, and `journal.migration.cancel` commands. Carry only a bounded display review and a one-shot review ID across the Worker boundary. Extend the private intent view and rebuild command to preserve a complete v2 reservation identity, while accepting the existing v1 string form only for v1. Keep the generic recovery-reference DTO unchanged. |
| `apps/web/src/solana-localnet/validation.ts`: command and snapshot parsers | Admit exact fields for the new commands and display DTO; validate the version pair, record count, bounded revision, binding, review ID and literal upgraded-reader warning. Reject transaction or wallet-grant fields in migration messages. Validate complete v2 rebuild identities without reducing them to random IDs. |
| `apps/web/src/solana-localnet/controller.ts`: controller state, command dispatch and disposal | Retain the actual `PreparedSolanaJournalMigration` only in the Worker, paired with its public review ID, current profile/epoch and bounded expiry. Prepare and confirm through the new native methods. Clear migration authority on lock, profile replacement, disposal, expiry and completion. Refuse an overlapping transaction review until the user explicitly cancels it. Refresh only `journalState` after migration; do not invoke an RPC-producing general refresh automatically. |
| `apps/web/src/solana-localnet/client.ts`: request and snapshot lifecycle | Dispatch migration commands without `bridge.beginReview` or any wallet grant. Revoke and hide stale migration displays when the private profile or request epoch changes, including before a delayed Worker reply. Keep transaction review capability handling separate. |
| `apps/web/src/solana-localnet/SolanaLocalnetRoot.tsx`: trade controls and review panel | Add explicit per-trade migration review and confirmation, the upgraded-native-reader and bounded-history-retirement consequences, and access to the existing encrypted-backup export. Do not attach migration to unlock, restore, funding or ordinary preparation. Pass the captured complete v2 identity when rebuilding a dropped intent. |

Before claiming application integration, test actual compiled document/Worker
messages, encrypted IndexedDB persistence and fresh-key restore with a populated
v2 journal. Migration prepare/confirm/cancel must cause zero RPC and wallet calls;
stale replies, duplicate confirmations, lock, profile changes and expiry must not
restore review authority. Keep the existing v1 browser journeys and fund,
release/refund and separate payout behavior. Update the browser evidence oracle
to validate both exact journal formats without weakening marker/provenance
checks. The current v1-only oracle must not silently accept v2 as v1.

The separately owned seller-funding work in PR #290 also extends the native
composition entry point. When composing that change, `fundingReviewOptions`
must use the same synchronous full-identity rebuild capture as the other review
paths, preserving its canonical seller token-account validation. Preserve both
sets of public exports in `localnet.ts`.
