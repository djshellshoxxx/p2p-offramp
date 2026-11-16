# D9 persisted intent migration

This implements the accepted Option A at the schema, encrypted journal and EVM lifecycle boundaries. It does not establish release acceptance or replace the two-wallet browser journey qualification.

## Format and authority

New lifecycle preparations use inner intent version 2 with `sendMarkedAt: null` and `originProfileId` from the active vault lease. The encrypted record wrapper remains version 1. The marker timestamp is written atomically with the prepared-to-broadcast-unknown transition, before wallet entry, and preserved by every later transition. Reconciliation can discover a transaction in a restored pre-send snapshot; it records the observation without inventing a historical send timestamp.

Version 1 remains readable and round-trips byte for byte. Missing legacy metadata is unknown, never inferred as null. Existing records are not rewritten on open. Older readers reject version 2 with an unsupported-version error; rolling back the application does not downgrade or delete private records. Use a compatible reader to reopen a profile containing version 2 records. Restoring an older backup does not prove no transaction occurred since that backup.

Only failed approvals with a null marker, null transaction hash, and matching originating profile gain durable never-sent verification. Backup restoration creates a new profile ID, so imported metadata cannot supply that proof. Prepared local approvals can be cancelled on recovery. Prepared value-moving actions and legacy/imported preparations remain unresolved and keep their nonce holds. Live-session cancellations retain their existing in-memory proof. A post-marker wallet rejection never grants never-sent authority.

The journal validates the complete snapshot before hydrating durable approval verification. Sending a previously prepared entry requires either this journal's live reservation or matching version 2 provenance, in addition to canonical validation and a successful compare-and-swap. Concurrent sessions retain exactly one marker winner.

## Verification

Regression coverage includes unchanged v1 bytes, malformed v2 provenance, atomic permanent markers, marker preservation through finality, same/different nonce and calldata approval recovery beyond 64 blocks, value-moving action recovery, legacy records, fresh-key restoration of a backup taken before a subsequently sent transaction, and concurrent marker writers. The real encrypted backup and restore services are used in the restore tests.

The integration remains gated on hosted checks and broader release acceptance. Production deployment, signed release approval, and independent security review are not asserted by these tests.
