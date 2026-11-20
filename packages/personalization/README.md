# Local personalization consumers

These source modules implement local encrypted preferences using the maintained
vault/session APIs. They are recovered under accepted D7 Option 2. The current
application composes saved-review favorites through the narrow `favorites.ts`
entry in its native vault Worker. Templates remain uncomposed. Neither consumer
changes the vault schema or adds wallet authority.

## Saved-review favorites

This local consumer stars existing saved terms-review IDs in one versioned G02
encrypted `preference` record. It stores at most eight IDs, no labels or terms.
The native session lease binds every operation to its original selection. Writes
require an explicit previously observed revision, refuse stale CAS without retry,
and retain physical admission until cancelled or ignored native work drains.
Completed native writes return only a scalar durable receipt, even after locking.

Unknown, damaged, future or foreign collisions remain unchanged. Missing targets
cannot be starred; their IDs can be unstarred. The read-only legacy saved-review
wrapper recognized by the existing Worker is also accepted without rewriting it.
Opening a favorite must run the existing current-registry saved-review load and
resolve its ID only in that fresh result; this preference never grants validity.
The document receives only bounded IDs and the observed revision. Its explicit
star/unstar commands bind that revision to the active profile and generation.
Opening requires a completed fresh load; an interrupted or malformed load cannot
reuse a previously accepted session route. Lock and profile changes clear the
projection. Deleting a saved review does not automatically prune the preference.

G03 full-profile backup already preserves this encrypted row and restores it
under fresh keys. Retention deliberately continues treating preferences as
unknown: while this row exists its conservative dependency guard keeps history.
Unstarring removes membership without deleting the preference or historical
backups. There is no generic record IPC, nonce, signature, payment or send API.

## Trade templates

`createTradeDraftStore` maintains the existing versioned trade-template schema in
one purpose-bound encrypted preference record. A library has at most eight
templates and an optional default-template slot. Each template contains only the
seven reusable network/deployment/asset/amount/fiat defaults; it never preserves
counterparty addresses, payment instructions, deadlines, accepted terms, a salt,
signatures, or permission to submit a transaction.

Call `load` for a current revision, `plan` for an explicit change preview, then
`commit` with that exact preview, revision and acknowledgement of logical deletion
limits. Previews expire after five minutes of the constructor-owned monotonic
clock. Lock, cancellation, profile retirement, changed data or stale CAS refuse
the operation. A failed commit is not retried automatically. A durable write
returns a scalar receipt even when the session becomes unavailable afterward.

Complete-profile backup and fresh-key restore preserve these preference rows.
Current retention keeps preferences outside its known deletion purposes. Do not
import the historical retention implementation over the current union of intent
versions; it contains no distinct runtime improvement.

## Remaining application qualification

The favorites application integration and its exact qualification status are
recorded in `docs/engineering/PERSONALIZATION_FAVORITES_UI_20261119.md`. Its hosted
browser gate exercises the emitted UI, actual Worker and encrypted IndexedDB;
the existence of that harness is not evidence that it has run.

Any future template UI/Worker composition must separately bind requests to the
active profile/epoch and clear private projections on retirement. Applying a
template only pre-fills reusable inputs: it must require a new bilateral agreement
and an explicit current transaction review. Templates remain outside the emitted
application and Worker graphs.
