# Saved-review favorites

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
