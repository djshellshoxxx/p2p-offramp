# Local decoy controls and sweep reminders

T59 implements the independently specified local parts of the duress, decoy and
sweep designs. It has no default application, UI, Worker, wallet, network, deletion
or transaction integration. Trading stays disabled. This is a local storage and
state component, not a security sandbox, a hidden credential detector, an on-chain
timelock or a coercion-resistance claim.

The public entry point is `index.ts`. All operations return the existing G13
`CoreResult`; errors contain fixed codes and correlation metadata. Inputs reject
unknown fields/versions, getters, unsafe numbers and oversized arrays before
expensive work. One operation owns each controller's physical slot, with no queue.
Cancellation or disposal prevents new work and late view publication while an
ignored native operation retains admission until it actually drains. Completed
native writes return scalar persistence receipts even if a later lock retires
the session. An ambiguous write reply requires reopening and inspecting actual
encrypted state; no rollback or automatic retry is assumed.

Lease disposal clears local ownership before invoking cleanup, and a throwing
cleanup cannot skip the remaining owned lock or admission cleanup. Guards consult
the actual native G02 lease after awaits and before private publication, including
hash completion when an idle timer has not yet fired. The intentional normal-to-
decoy switching gap is explicit; a provisional decoy lease guards the rest of the
switch, and idle decoy inspection refreshes its native lease as well.

Each operation also retains its authenticated snapshot revision through later
awaits and the final publication guard. Only its own confirmed durable CAS advances
that revision; an intentional profile switch clears and rebinds it explicitly.
Hashing a plan and validating a decoy finish with an actual native freshness CAS,
so concurrent destination or record replacement cannot publish an old review.

## Independent decoy profile

`createDecoyProfile(vault, passphrase, signal?)` uses unchanged G02 native creation,
random profile/key identifiers, independent random DEK/salt and the separate
passphrase. It writes one versioned internal `preference` marker. It never copies
real identities, trades, journals or arbitrary records. The creation result
contains an opaque branded `DecoyProfile` descriptor and public profile locator,
never a native session or key. Cloning/importing the descriptor cannot enroll a
profile. A cancelled marker initialization can leave a new encrypted row: its
scalar receipt has `persisted:true`, `initialized:false` and no descriptor.

`createDuressController({vault, normalSession, isCurrent, now})` first captures a
genuine G02 normal-session lease. `enrollDuress(decoy, consent)` and
`disableDuress(consent)` require that live normal profile and explicit explained
consent. Their versioned policy is encrypted in that profile and uses only this
ordered action allowlist: lock real sessions, open the independent decoy, hide
local notifications. Future/unrelated preference records are preserved; a
collision or incompatible own record fails closed.

`enterCredential({purpose:'decoy', passphrase}, expectedPolicyRevision)` is an
explicit local route. It first refreshes the policy through native revision CAS,
detaches only the normal lease being intentionally retired, locks all native real
sessions, and then unlocks the decoy using its own G02 passphrase. A later external
native lock changes the native opening epoch; an ignored late decrypt cannot
publish a new session. The decrypted decoy must contain exactly the package's
marker. Real, future or imported records cause refusal, not silent filtering.

The result is read-only demo metadata with `walletAuthority:false`; it requests
that a future UI hide local notifications. No production UI behavior is claimed.
The decoy's native lease remains subscribed during idle time and wipes the local
view on lock. `lockAll()` is explicit; `dispose()` drops this controller's leases
and locks only an opened decoy it owns. It does not delete any record or profile.

Decoy credential attempts are limited to five per minute per profile/native vault
instance, bounded by G02's sixteen-profile maximum. Replacing the controller does
not reset that local counter. An overbudget recognized duress action still locks
the real vault before refusing the decoy unlock. Ordinary G02 unlock, backup and
release/refund recovery are outside this counter. Reload, another vault instance,
offline attacks or attacker-controlled JavaScript can bypass local UX limits.
There is no PIN verifier, password-derived substitute DEK or spending credential.

The encrypted policy cannot be discovered before normal authentication after a
reload. A fresh normal unlock and `load()` are required to restore the controller;
no public hidden-credential routing format or secret persistence was invented.
After a failed/finished duress switch, returning to normal use likewise requires
ordinary G02 authentication and a fresh controller. Profile count, ciphertext
size, timing, browser artifacts and public wallet history remain observable.

## Local EVM sweep plan and reminder

`validateLocalSweepPlan()` validates a detached, frozen LOCAL EVM data record. It
binds exact account/generation, network locator, destination, policy revision,
one to sixteen sorted unique asset IDs with positive uint256 base-unit caps,
uint256 fee cap, expiry milliseconds and a 32-byte nonce. The native creator
generates that nonce afresh. This local profile uses canonical lowercase EVM
addresses and refuses zero addresses and unknown chain families. It is not a
network, token-admission, available-balance or wallet-consent proof.

`createSweepReminders({vault, session, scope, isCurrent, clock})` captures an actual
G02 lease and supports one current plan/reminder per profile. `createPlan()` needs
explicit explained consent; it binds a SHA-256 digest of the exact internal
canonical plan and persists the plan encrypted before returning a handle. This
hash/namespace is private app data, not an interoperable signature or G08 intent.
Replacing a destination/plan changes the nonce/hash and invalidates old handles
in the same CAS. Arbitrary imported or copied handles cannot inspect or cancel.

`schedule(handle, notBefore, expiry)` persists bounded millisecond values, with
expiry no later than the plan's expiry. Clock/current-scope checks run again at
the actual native write guard after storage waits. `inspect()` projects draft,
scheduled, ready, cancelled or expired from the authenticated record and current
local clocks. `prepareReady()` returns the exact plan for fresh review, always
with `requiresFreshWalletConsent:true` and `executionSupported:false`. There is no
timer, background job, `executeNext`, authorization, approval or send method.

Wall rollback, monotonic rollback or a wall/monotonic delta disagreement exceeding
one second marks the current controller's clock uncertain. It cannot produce
ready review until the user starts a fresh locally reviewed controller. Reloaded
records always require new review; browser close/suspend may prevent reminders.
The inspection is point-in-time local information, not chain-time enforcement.
`cancel()` persists a generation change and is idempotent on its returned handle.
Future transfer submission/unknown/finalized states are intentionally unavailable
until a separate standalone monetary intent and reconciliation profile exists.

The plan does not enumerate, approve or withdraw escrow balances and accepts no
escrow trade/ABI/allowance fields. Future execution must separately reconcile
spendable balances, supported asset behavior, pending native intents, exact fees
and fresh external wallet consent. It cannot reuse basic escrow actions or fake
`TradeBinding` as a transfer shortcut. Basic signed/funded terms and exits are
outside this component.

## Native evidence and retained gaps

Focused tests use actual G02/WebCrypto with a controlled ciphertext store for
failure interleavings. The separate finite browser proof uses two real Chromium
documents, native IndexedDB and WebCrypto. It verifies independent profiles/keys,
lock-before-decoy view, unchanged source ciphertext, reload authentication,
encrypted reminder maturity and actual other-tab CAS conflict. G02 has no write
broadcast: another tab is detected on an explicit freshness check, not by an
instantaneous global lock. This is not default emitted-app, Worker isolation,
physical-device or independent specialist qualification.

Run from the repository root:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test packages/privacy-controls/test/*.test.mjs
node packages/privacy-controls/test/native-browser.mjs
```

Managed environments need native child IPC/loopback capability for these checks.
No provider account, production key, deployment or external service is required.
The browser fixture closes owned pages, servers and temporary files.

Exact predecessor decisions and source anchors are in `DECISIONS.json`. No new
G02 envelope/KDF/record kind, G03 restore procedure, credential bootstrap, whole
profile deletion or monetary wire format is introduced. Memory cleanup is best
effort; JavaScript strings, native crypto/runtime copies and OS remnants cannot
be promised physical erasure.
