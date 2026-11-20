# Opt-in supported asset updates

## Consolidation scope

The November 19 extraction preserves the internal controller, bounded HTTP reader,
origin-local rollback store, and parser-only helpers from historical PR #81
(`a45e932a37153590bc329c1e9012cf18e37fe12c`). It also carries the malformed-envelope
repair `f5b12c6a4a6e59a28b5f522d868bc0c90a4e6532` and fixes failed/blocked IndexedDB
open retry and terminal-close handling. Current source and tests use the existing
transport broker without changing its policy or error types.

This is an internal implementation, not a completed application update feature.
The historical native-browser composition remains in its original branch. No
update UI, trust key, endpoint, gateway or navigation capability is registered by
this extraction, and no public facade export is added.

The generation 9 prerequisite adds current-profile backup verification to the
existing private application runtime. `AppServices.verifyBackup(bytes, passphrase)`
asks the Worker to authenticate the complete file through the maintained
`EncryptedVaultService.verifyBackup`; it returns only the existing scalar receipt.
`AppServices.checkBackupVerification()` freshly checks the persisted vault revision
and returns the Worker-owned fact or `null`. Neither command accepts an imported
receipt or a readiness flag. The fact is tied to the exact selected handle,
generation, profile and revision, and is cleared by a new verification attempt,
saved-review/favorite/template mutation attempt, lock, replacement selection,
timeout or disposal. Export and restore do not create a verification fact.

The document clears its owned verification request copy after `postMessage` has
synchronously cloned it; the Worker clears its separately parsed copy when
dispatch ends, including early refusal. Caller bytes are unchanged. This is
owned-copy cleanup, not a claim to erase all browser or JavaScript string copies.
This prerequisite adds no update UI, trust configuration, transport grant,
navigation adapter or wallet owner. The historical browser harness still needs
selective recovery and qualification against the current runtime.

This internal G15 controller implements local update discovery and explicit origin
transition for the existing asset-only manifest/locator profile. It is absent from
the security facade, default App, public runtime protocol and enabled trading
configuration. Default `trust:null` returns `untrusted/UNCONFIGURED` without
inspecting source ports, fetching, requesting a route or opening accepted storage.
There is no trust/route registration setter.

Contracts: common content-addressed release manifest and G15 IPFS origin/update
policy in `00_PLANNING_AND_THREAT_MODELING/feature_0.3_system_integration/`, actual
G05 broker and T34 current-backup check. Nonempty deployment manifests, key
rotation, archive extraction, installation and bootstrap trust are unsupported.

The two `readUntrustedRelease*` helpers reuse the existing strict parsers only to
schedule bounded reads. They register no live proof and authenticate no key, CID
or executable. Publication requires `verifyRelease` over the complete exact asset
set, then `verifyReleaseLocator` against that SAME identity-branded live manifest
and signer. Outputs retain `releaseEnabled:false/deploymentsVerified:false`.

## Capabilities and bounds

`createAssetUpdateController` takes compiled trust, exact source address mapping,
actual `SessionTransportPolicy`, fetch, accepted store, owner/gesture, current
backup and physical wallet leases, navigation and clocks. These are trusted local
code, never imported configuration or a sandbox for compromised same-origin code.
No production source, gateway, issuer or key is selected. URL naming is constructor
configuration, not a new unsigned feed or signature format.

Every GET needs an existing update/read grant and exact expectedURL capture. The
generic 64KiB driver is unchanged. The new reader omits credentials/referrers,
rejects redirects/response-URL changes and checks declared/streamed byte counts and
at most16,384 reads/request. G05 supplies each30-second deadline. A stricter local
120-second aggregate deadline covers the complete check/accept attempt; monotonic
guards enforce it even if timers are delayed. No retry or route fallback.

Manifest<=1MiB, locator<=4KiB, each detached envelope<=4KiB (local defensive cap),
assets<=10,000 and complete asset bytes<=256MiB. Each asset fetch is bounded by
its index length before full verification. Retained assets total at most256MiB
plus bounded metadata. Assembly and verifier copies can approach twice that total;
these are owned-byte/count bounds, not JS heap/RSS/CPU/mobile feasibility claims.
Native response allocation may precede validation. Owned retained copies are
cleared; universal erasure is not promised.

One module-owned physical admission covers all controller instances per document,
before callbacks. Cancel can return early, but ignored fetch/read/storage retains
the slot until actual drain. No hidden queue. At most one opaque candidate is
retained; JSON/clones/imported `verified` flags and adjacent keys cannot accept it.
Original verifier leases expire/revoke normally.
Jobs and live proofs also bind the exact broker generation. A mode/route change
during an await or between discovery and acceptance requires a new check. Native
browser navigation is unsupported in strict mode until a separately reviewed
private-navigation profile exists; acceptance refuses rather than falling back
to a direct navigation. Discovery itself still uses the actual G05 policy.

## Floor and transition

`IndexedDbAcceptedReleaseStore` uses public origin-local
`p2p-offramp-accepted-releases`, separate from the encrypted vault so accepting a
floor does not invalidate a backup revision. Internal record:
`{v:1,channel,keyId,sequence,manifestSha256}`. The channel/compiled-key namespace
has one strict-durability atomic read/compare/write transaction. Same digest at
the same sequence is idempotent; malformed/foreign/lower/conflicting state refuses
without reset. Missing state means fresh-origin uncertainty. Effective rollback
floor includes the authenticated installed release. Another origin's maximum is
not known automatically.

A failed or blocked open is evicted only from its own connection slot, so a later
explicit operation can retry after remediation. A late result closes itself and
cannot replace a newer connection. Terminal close rejects pending open callers,
aborts active transactions and closes native connections that arrive afterward.
These paths do not clear or rewrite the accepted rollback record.

Review includes current/candidate fingerprints, sequence, source commit,
predecessor, storage schema, asset identities, destination and recovery need.
There is no signed human release-notes field, and the view states its absence.
Target must be the verified CID's subdomain under the exact compiled HTTPS
gateway/root, without credentials/query/hash; no path gateway or fallback.

Acceptance needs a real gesture, exact candidate, compatible schema, exclusive
physical wallet lease and actual current T34 backup. The backup adapter captures
the real profile/generation and calls `AppServices.checkBackupVerification`
afresh, with no receipt parameter. Its current() stays valid after its own lock()
only for that exact expected locked generation. Another lock/switch/unlock must
invalidate it. This is one owned final transition, not an ignore-selection flag.
The separate owner tracks document/trust/config lifetime; cancellation stays fatal.

Wallet owner returns no lease while any actual provider promise physically waits,
including after logical abort, and blocks new prompts while leased. It disconnects
the actual owner. No public pending-state setter exists. Wiring a common owner
into a future enabled trading App is separate; default App has no such wallet.

Persist floor BEFORE navigation; recheck owner/backup/wallet around awaits, then
lock/disconnect and open only the verified public URL. Failure/cancellation after
a durable write retains that floor, with no rollback/automatic retry. No profile,
passphrase, key, receipt or session transfers via URL/postMessage/clipboard. New
origin starts locked/disconnected and recovery is explicit with fresh keys.
Reconciliation never automatically submits a transaction.

## Local verification

```sh
node --import ./scripts/test-support/register-tsx.mjs --test packages/security/test/release-update*.test.mjs packages/security/test/release-manifest.test.mjs packages/security/test/release-locator.test.mjs packages/security/test/release-registry.test.mjs
npm run typecheck
npm run check:boundaries
npm run build
```

Current focused tests use the real transport broker and release verification with
synthetic signed fixtures. IndexedDB lifecycle tests model native event ordering;
they do not claim a real browser or native database execution. They cover retry,
late blocked success, disposal, fixed errors, unchanged rollback state, CAS
idempotence/conflicts, monotonic sequence and strict transaction durability.

The historical browser harness at `a45e932a37153590bc329c1e9012cf18e37fe12c`
(`scripts/test-release-update-browser.mjs` and its fixture) uses synthetic HTTPS
origins, actual native fetch/IndexedDB, AppServices and a held synthetic EIP-1193
provider. Adapting and qualifying that composition is a separate integration gate;
its earlier results are not new evidence for this extraction.

Distinct exact-source review remains required. No first hostile visit, production
trust/source/route/wallet integration, nonempty deployment wire, archive,
rotation, actual IPFS pin/retrieval, supported physical device or default update
UI is qualified. Trading stays disabled.
