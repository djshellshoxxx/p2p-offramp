# Independent localnet browser integration review — 2026-11-18

## Assessment and qualification boundary

The reviewed candidate is `b74cf599c93a9dd7c2c332eae7404d190a1a07d5` on
`integration/browser-journey-20261118`. Independent source inspection, 42 focused tests, and an
11-check Anvil/relay integration run passed at that exact commit. No confirmed unresolved high- or
medium-priority defect remains in the reviewed scope after the repairs recorded below.

This is a code and native controller assessment. It does **not** qualify a real browser journey.
The native test explicitly reports `browserQualification: false` and `ReleaseEnabled: 0`.
The document client was exercised with a deterministic Worker double, while the native integration
uses the actual controller, cryptography, wallet bridge, relay protocol, deployed escrow, and a
transactional in-memory storage port. It does not substitute for real browser Worker execution,
IndexedDB behavior, rendering, navigation/lifecycle behavior, or wallet-extension interaction.
Local browser execution was blocked by the environment's AF_UNIX policy; the hosted browser gate
and final combined-branch checks remain integration responsibilities.

## Scope and reviewed commits

| Commit | Relationship to this review |
| --- | --- |
| `cad242ae3ddd947bb0872ded13c6d2fdd2cf3a43` | Initial frozen controller/client candidate; source baseline for reproduced defects. |
| `2bda06c5cb9b1dfc9205f17c77fc77e823698d54` | Independent reviewer repair and seven failing-before/passing-after client/bridge regressions. |
| `37b2a17cec70a66e61271fc9310b7cf883902a59` | Implementation branch's cherry-pick of that repair. |
| `4b4d35e84d0c3897bfb47fe36142b5d30a951b3f` | Controller owner repair separating fresh spending admission from restart reconciliation. |
| `82af41b07f34ec7f38cdd3e4bf1797a12535e61d` | Build entry isolation and crypto dependency license inventory; inspected here. |
| `d68edecbdfc9388ee81d74e1bd9eee82cd2217f2` | Shared pinned Anvil/relay/external-wallet fixture; inspected and used in the independent run. |
| `b74cf599c93a9dd7c2c332eae7404d190a1a07d5` | Final reviewed source, canonical block-time fix, and exact independent test target. |

The source review covered `apps/web/src/localnet/` protocol, validation, document client, wallet
bridge, Worker endpoint, private controller, relay routing, exact review-request construction,
and configuration; `LocalnetRoot.tsx` and the compile-time entry selection; and the associated
canonical journal, EVM reader, transaction lifecycle, build policy, and native fixture paths.
Earlier core signer/Solana findings and their evidence are maintained in the separate independent
core review. This document does not requalify optional architectures or the Solana vault follow-up.

## Reproduced findings and repairs

### 1. Lock did not immediately revoke the document's private projection

At the initial candidate, `profile.lock` revoked wallet grants but left decrypted trade/chat
projections visible until a Worker acknowledgement. A queued pre-lock Worker snapshot could also
republish those fields after a local UI clear. Status/opening results had no document profile epoch,
so obsolete requests could affect the current projection.

The repair increments a profile epoch, blocks private projections, publishes a blank projection,
revokes wallet grants, and resolves superseded pending commands when a lock or profile transition
begins. Only a successful, current, explicitly requested create/unlock/restore result can reopen
the private projection. Unsolicited snapshots cannot open that fence, and obsolete request results
cannot resolve into the new profile generation. The final result returned to a document caller
contains the same redacted projection as subscriptions while the fence is closed.

### 2. A full document command queue could prevent locking

Eight pending commands caused the original client to return `BUSY` before posting `profile.lock`.
The repair gives profile transitions their own invalidation path before the ordinary queue limit:
old pending work is canceled and the lock reaches the Worker. Clearing those document promises
does not release an outstanding physical wallet prompt; that slot remains owned by the bridge
until the provider operation settles.

### 3. Reviewed-method validation was too permissive

The original bridge accepted an arbitrary method in an exact review request list. A directly
constructed `personal_sign` review reached the provider despite the intended localnet protocol
using only `eth_signTypedData_v4` and `eth_sendTransaction`. The controller did not generate such
a review, so this was an additional protocol-boundary guard rather than a demonstrated normal-UI
path. The bridge now checks that method allowlist both when accepting a review and when consuming
its next request. Read-only calls and account connection retain separate authority paths.

### 4. A provider accessor could invalidate a grant before physical dispatch

A `provider.request` getter could revoke the bridge while returning a callable function. The old
code checked invalidation only after awaiting that function, allowing the physical prompt to begin.
The repair captures the function, then checks disposal and generation immediately before invoking
it. The regression proves zero physical calls when the getter revokes the grant. Post-result
generation checks and physical-slot lifetime remain in place.

All seven independent client/bridge regression cases failed against the initial production files
and passed after the repair. They cover immediate redaction, queued snapshots, the method allowlist,
the accessor race, explicit opening authority, lock overtaking an opening result, and queue-full
lock behavior. The combined client/boundary run passed 17 tests with zero skips. See the committed
[RED log](independent-browser-evidence-2026-11-18/browser-client-independent-red.log) and
[GREEN log](independent-browser-evidence-2026-11-18/browser-client-independent-green.log).

### 5. Restart reconciliation incorrectly required a lost D1 session

A prepared funding intent persisted before wallet submission. After lock/reopen, the restored
trade correctly lacked an ephemeral D1 session. The original canonical validator nevertheless
applied fresh-funding authorization while canceling/reconciling that prepared intent, causing
`wallet.connect`/refresh to fail with `UNAUTHORIZED`. That blocked recovery even though no new
spending was requested. A related abandoned release review needed a safe route to a later funded
exit after restart.

The controller owner reproduced the funding case with the real native fixture, then moved fresh
D1/time spending admission to wrappers around journal `reserve` and `markSending`. Canonical
validation still checks exact transaction encoding, registry binding, and live native runtime,
but can classify already durable intents without a lost D1 session. A bounded second reconciliation
pass handles the prepared-to-reorged-to-expired classification. A later explicit exit review names
the superseded intent and uses the canonical lifecycle's permitted same-nonce successor.

The independent final native run reproduced the repaired funding restart and abandoned release
restart paths without resubmitting the old request. The owner's original failure is preserved as
[owner RED admission log](independent-browser-evidence-2026-11-18/owner-localnet-controller-red-admission.log).

### 6. Exit eligibility depended on document time and allowed expired release review

The integration coordinator independently identified refund eligibility using the browser clock;
this review also identified release eligibility/admission remaining open at or after the contract
deadline. The controller owner reproduced both with a native fixture, including a restored party
whose clock is two minutes behind native time.

The final candidate returns a frozen `EvmEscrowSnapshot.anchor` from the same already rechecked
canonical block header used for the state read. The controller derives refund eligibility from
native time at or beyond expiry and release eligibility from native time strictly before expiry.
Fresh spending admission also rejects an expired release with `EXPIRED`. This keeps display
eligibility and pre-dispatch admission aligned with the native contract; a stale display alone
cannot authorize an otherwise expired release.

Both original failures are preserved as owner-run evidence:
[clock RED](independent-browser-evidence-2026-11-18/owner-localnet-controller-red-clock.log) and
[release-expiry RED](independent-browser-evidence-2026-11-18/owner-localnet-controller-red-release-expiry.log).
The independent final native run passes the clock-skew assertions, release refusal, and restored
refund through a newly reviewed safe successor.

## Security and lifecycle observations

The document/Worker protocol exposes purpose-specific commands, not arbitrary vault access or raw
wallet forwarding. Input validation rejects raw vault/wallet commands, accessors, unexpected fields,
and oversized input. The controller owns its vault, lease, canonical messaging identity, crypto
copies, D1 ports, replay handling, stored trade bytes, and canonical journal inside the Worker-side
implementation. The inspected public projection contains intentional UI fields; it contains no
private messaging key or vault decryption key. Backup export returns encrypted backup data.

Wallet authority is explicit and finite. Connecting grants account access; a review grants one
exact serialized request list with an expiry and at most two requests. Confirmation consumes that
list in order. Relay events, read-only wallet RPC, preparation, cancellation, and refresh do not mint
new signing or sending authority. Account/chain/disconnect events revoke the document grant. The
bridge retains physical exclusivity across cancellation until the pending provider operation drains.

Fresh funding requires the current D1 peer acceptance and explicit reviewed wallet requests.
Chat content, relay delivery, and a displayed trade do not prove fiat payment or authorize funding.
Release additionally requires explicit manual bank-receipt confirmation. Durable broadcast markers
precede each native send. An ambiguous wallet result preserves the marker and null transaction hash;
fresh-key restore reconciles native effect without replaying that send.

Restore binds the messaging identity only after an authenticated backup restore receipt. Restored
trades do not inherit a fresh D1 session, so they cannot acquire fresh-funding permission through
restore. Already funded trades retain native release/refund recovery paths. Lock disposes the
controller's owned crypto copies and clears decrypted projections; the document-side repair makes
projection revocation immediate without waiting for that Worker acknowledgement.

The relay route accepts the fixed logical endpoint and maps it only to the validated loopback
destination. Native fixture inspection found public advertisements and ciphertext on that relay,
not decrypted payment instructions or chat. Native state evidence still relies on the configured
RPC/provider trust model and canonical identity/anchor checks; this integration is not a light client.

## Independent execution evidence

The following commands ran in an isolated worktree at the final source commit. The normal Node
dependency installation and pinned contract submodules were available. Foundry and solc came from
the integration coordinator's officially checksum-verified toolchain.

```sh
node --import ./scripts/test-support/register-tsx.mjs --test \
  apps/web/test/independent-localnet-client.test.mjs \
  apps/web/test/localnet-boundary.test.mjs \
  packages/chain-evm/test/reader.test.mjs
```

Result: **42 passed, zero failed, zero skipped**, process exit 0. The run includes all seven
independent regressions, ten localnet boundary tests, and the EVM reader suite. Evidence:
[exact-head focused log](independent-browser-evidence-2026-11-18/browser-independent-units-b74cf599.log).

```sh
FOUNDRY_BIN=/workspace/scratch/07167523f342/toolchain/foundry \
FOUNDRY_SOLC=/workspace/scratch/07167523f342/toolchain/solc-0.8.30 \
node --import ./scripts/test-support/register-tsx.mjs scripts/test-localnet-controller.mjs
```

Result: **11 real native checks passed**, process exit 0, with **12 typed-data signatures, four
sends, and four durable send markers**. The log's historical `walletPrompts` field counts the
fixture's signatures; sends are recorded separately. Evidence:
[exact-head native log](independent-browser-evidence-2026-11-18/browser-independent-native-b74cf599.log).
This covers distinct encrypted identities and external wallets, real D1 exchange, encrypted chat,
cancel-without-send, funding, release, ambiguous broadcast, fresh-key restore, prepared-intent
restart recovery, native expiry under clock skew, and restored refund.

The independent client repair also passed the repository's full `npm run typecheck` command before
the final native-time/reader addition. Its
[typecheck log](independent-browser-evidence-2026-11-18/browser-client-independent-typecheck.log)
is evidence for that repair, not an independent exact-final-head typecheck claim. The implementation
owner separately reported full typecheck and actual localnet artifact build success at the final
candidate. Those reports are not relabeled as independent runs here.

No remote CI success, actual browser success, production release approval, or completeness of the
whole application is inferred from these local results. The candidate is ready for combined-branch
and hosted browser qualification with the identified repairs retained.
