# Local messaging identity lifecycle

The vault-backed `MessagingIdentityService` remains an internal composition service.
The package facade exposes only the test-enabled provider boundary. It has no
wallet-spending, generic signing or decryption API, and its cryptographic review
remains a separate gate.

## Explicit adoption after encrypted restore

G03 backup restore preserves each record's payload bytes, including the original
profile binding. Consequently, an imported identity cannot simply be unlocked in
the fresh-key destination profile. An internal consumer can explicitly call:

```ts
identity.adoptRestored(destinationSession, identityRecordId, expectedSourceProfileId, signal)
```

The method requires a live authenticated destination session, the caller's expected
original profile binding and a configured provider. It parses the identity record,
checks the keypair and active-identity uniqueness, then commits one destination CAS
that changes only the embedded profile ID. Record ID, key material, public key and
retirement state are preserved. The source profile is never written or deleted.

Success returns only `{profileId, identityRecordId}`. It does not create a handle,
unlock an identity, publish a network event or establish that the backup is current.
Unlock is a separate explicit operation; a retired identity remains unusable.
A copied identity may still exist in the source profile and elsewhere. Adoption is
not key rotation or proof of network revocation.

Cancellation or lock before the commit suppresses the migration. If the commit
wins a late cancellation, the durable reference is returned without a handle. An
uncertain storage error does not claim that no write occurred; reopen the profile
and reconcile the record before retrying. Concurrent destination changes conflict
rather than silently overwriting other work. The method is not wired to the browser
Worker or UI and does not enable trading.
