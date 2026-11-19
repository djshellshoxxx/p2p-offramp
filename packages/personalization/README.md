# Local personalization consumers

These source modules implement local encrypted preferences using the maintained
vault/session APIs. They are recovered under accepted D7 Option 2. The current
application and Worker do not import them; this extraction does not enable a
favorites or template editor, change the vault schema, or add wallet authority.

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

## Remaining application integration

Future UI/Worker composition must expose narrow purpose-specific commands, bind
requests to the active profile/epoch, clear private projections on retirement,
and use freshly revalidated saved reviews when opening a favorite. Applying a
template is only pre-filling reusable inputs: it must require a new bilateral
agreement and an explicit current transaction review. No source recovery here
qualifies that user-facing flow or physical-browser behavior.
