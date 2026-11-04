# Optional local meetup primitives

This package implements the local parts of MEET01/02/03/08 and G31. Nothing
registers it in the app. Importing it starts no sensor, permission prompt, Worker,
network connection, proof or wallet operation. Coordinates remain untrusted
browser reports or manual input; output proves no GPS truth, human presence,
physical safety, anonymity or settlement rights.

The frozen facade exports an explicit consent controller, claim plausibility
checks, standard geohash math/coarse regions, and an encrypted disclosure-budget
consumer. There is no send, publish, signing, reset or whole-profile-delete API.
Consent objects and distance reservations are recognized by identity, not their
JSON fields. Copies/imports cannot become live local capabilities. Owner hooks
and cleanup callbacks are trusted bundled composition, not a sandbox for hostile
same-origin JavaScript.

`createLocationConsentController` requires trusted user-gesture, foreground and
owner-generation hooks. `explain` produces the recipient/precision/frequency and
retention disclosure; `grant` accepts only that exact object on a gesture. A
collection-enabled grant awaits the owner's actual permission outcome. Separate
collection, coarse-sharing, map and direct-network permissions stay separate.
The controller itself never calls `navigator.geolocation`. Sensor owners use the
exported conservative options and register their synchronous clearWatch/job/channel
cleanup. Hide/lock/account/trade/permission loss must call `revoke`; expiry,
revocation or owner loss aborts scoped work. Restart restores no active consent.
Manual claims stay uncertain and cannot establish sensor-based presence.

`encodeGeohash`/`decodeGeohash` use the conventional longitude-first base32 grid.
`regionFor` consumes only an already blurred marker, chooses a coarse length 4..7,
and retains its complete sorted 3x3 neighborhood. Dateline wrapping is local.
Enclosing parallel-arc width, meridian height and their diagonal are display
geometry, not an anonymity radius. Imported regions are bounded and their extent
is recomputed. There is no automatic finer-query or geocoder fallback. Manual
selection must be passed explicitly with `regionFor(marker, nowMs, 'manual')`;
a marker alone carries no authenticated sensor provenance.

`createDisclosureBudget` captures an actual live G02 session lease and uses only
structural read/list/commit ports. A supplied native exclusive coordinator must
hold the fixed `BUDGET_LOCK_NAME` through its callback and honor cancellation. No
local-only locking fallback exists. Its trusted profile-binding function must
designate **one durable ledger profile for the origin**, shared by all tabs,
trades and participants. This application composition is not implemented or
activated here. A profile-scoped G02 session alone cannot establish an origin-wide
budget. New profiles, restored old copies, browser clearing, reinstalling or a
malicious origin can defeat local counters; no global privacy guarantee is made.

Ordinary operations refuse missing, corrupt, future-version or inaccessible
ledger state. `provisionFreshLedger` is a separate trusted fresh-install operation:
it requires a user gesture, the designated profile, explicit fresh-provisioning
capability, revision 0 and a completely empty authenticated G02 profile. It never
overwrites an existing record, initializes after loss, acknowledges a reset or
changes KDF/AAD/record kinds. There is no reset-by-acknowledgment flow.

The coordinate-free budget occupies one versioned `preference` record. The only
location cache is a separate encrypted `preference` consumer holding the blurred
marker and creation generation; it contains no source coordinate or sampling
randomness. A region unit is persisted before sampling and its output is
persisted/consumed before returning. One epoch reuses identical bytes across
counterparties. A changed radius or fresh-noise request needs explicit new-epoch
choice and another quota unit. Clearing the cache leaves all counters intact and
cannot implicitly resample a still-live epoch. Owned raw numeric buffers are
cleared on managed completion/cancel; JavaScript/browser memory erasure is not
promised. Expired markers are never returned; logical expiry cannot erase copies.

Limits are 4 region epochs per rolling hour, 12 per rolling day, 12 distance units per day and
3 distance units per trade lifetime. Detailed events expire after 24h + 15min; a
separate coordinate-free lifetime map retains at most 128 trade hashes/counters.
At capacity new trades fail closed, with no reset or eviction. The event log is
also capped at 128 entries. These are local resource limits, not interoperability
claims. Cancellation releases only a live, locally owned, still-reserved distance
unit. Once consumed or restored with uncertain outcome it cannot be cancelled.
The caller must consume before disclosing; this module has no transport authority
and cannot police an independent caller that bypasses its contract. Cached
Booleans are caller claims for the fixed 50m predicate, not proof-verifier results.
The missing evaluated distance proof/provider remains unsupported elsewhere.

Each operation checks session, owner, exclusive-lock and consent generations
across awaits and at durable CAS. A 5-second local deadline bounds logical waiting;
noncooperative underlying work keeps the physical slot until it drains. Lock,
cancel, timeout or an uncertain commit never proves that a reservation rolled
back. Reopen and reconcile; no automatic retry or replacement disclosure occurs.

Focused verification:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test packages/meetup/test/*.test.mjs
```

The focused tests use actual G02/WebCrypto over a synthetic encrypted memory store
and an explicit exclusive coordinator. The independent Python integer-grid oracle
supplies 1,024 fixed points / 4,096 geohashes and conventional public examples; its
generator in `test/fixtures` does not reuse the midpoint implementation. The MEET01
diagnostic draws 100,000 native WebCrypto samples, checks independent spherical
displacement and requires mean squared radius within 0.01 of 0.5. This is a
statistical diagnostic, not a privacy proof. Separately,
`node packages/meetup/test/origin-ledger-browser.mjs` exercises actual Chromium,
IndexedDB and native Web Locks with two concurrent documents sharing one explicitly
designated local fixture ledger. It checks sticky reuse, the 20-request last-unit
race, conservative document-loss recovery, hourly/daily/lifetime caps, queued-lock
cancellation, foreign-record preservation and refusal to reset corrupt state.
Reopening is explicit; stale native sessions are not automatically retried and no
instant write broadcast is claimed. Manual claims, clocks and consent ports remain
synthetic. This local proof does not qualify production origin binding, location
truth, sensors, TURN, maps, proof providers, other browsers or physical devices.
Core trading and default application features stay disabled as configured.
