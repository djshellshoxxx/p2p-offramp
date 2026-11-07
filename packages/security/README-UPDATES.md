# Opt-in supported asset updates

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
node --import ./scripts/test-support/register-tsx.mjs --test packages/security/test/release-update.test.mjs packages/security/test/release-manifest.test.mjs packages/security/test/release-locator.test.mjs packages/security/test/release-registry.test.mjs
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/tsc --ignoreConfig --target ES2023 --module ESNext --moduleResolution Bundler --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --allowImportingTsExtensions --noEmit --lib ES2023,DOM scripts/fixtures/release-update-browser.ts
P2P_CHROMIUM=/usr/bin/chromium node --import ./scripts/test-support/register-tsx.mjs scripts/test-release-update-browser.mjs
```

Ordinary Node/browser checks require managed IPC/loopback capability. The finite
native fixture generates an ephemeral local TLS certificate, pins its exact SPKI
to Chromium, compiles an ephemeral public release key and uses two actual
CID-shaped `.ipfs.localhost` HTTPS origins. There is no logical HTTPS-to-HTTP
remapping. Actual G05/native fetch, signed full assets/same-key locator, native
accepted IDB CAS, real AppServices/native vault Worker/T34 and actual
EvmWalletAdapter with a synthetic physically held EIP1193 source are exercised.
Accounts, direct consent, certificate and gateway are explicitly local fixture
inputs, not production wallet/private-route/IPFS/TLS/provider qualification.

The destination independently verifies its signed artifact, starts locked with no
wallet requests, and explicitly restores a source file with fresh keys. Source
ciphertext remains exact. Source file cannot verify current destination backup;
a fresh destination export/authentication is required. Native negatives cover
null/strict no-fetch, changed assets/signature/key, two-document CAS/idempotency,
corrupt floor refusal without reset, foreign namespace preservation and pending
wallet refusal through abort. Focused tests add hostile records, streamed caps,
physical drain, callback reentry and durable-floor navigation failure.

Distinct exact-source review remains required. No first hostile visit, production
trust/source/route/wallet integration, nonempty deployment wire, archive,
rotation, actual IPFS pin/retrieval, supported physical device or default update
UI is qualified. Trading stays disabled.
