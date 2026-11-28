# Independent review: retained asset-update source

## Source and verdict

Reviewed source: `d73d6e09c68a482d56cd37b2c809869b473e656b`, compared with
`84814328f5534d6fceb2bbe74509fe37c5b48689` in a separate worktree with a fresh,
physical dependency installation. The delta contains nine files and 942 added
lines. The reviewer did not modify implementation files or inherit the
implementer's test results as independent evidence.

**No blocking defect was confirmed in the retained internal-module scope.**
This verdict qualifies the selective source extraction for combined staging
verification. It does not qualify a shipping update feature or enable a trust
root, transport endpoint, route, application control, release or installation.

## Independently reviewed boundaries

- The two `readUntrustedRelease*` helpers call the existing strict manifest and
  locator parsers. They do not register live release proofs. Existing facade
  exports and application imports are unchanged; the internal controller and
  helpers remain absent from `packages/security/index.ts`.
- An unset compiled trust returns `UNCONFIGURED` before source, storage or
  network ports are consulted. Trust and capabilities are constructor-owned
  composition, not imported configuration.
- Every update read uses an existing `SessionTransportPolicy` grant and exact
  expected URL. HTTPS, credentials/referrer omission, redirect refusal,
  response-URL identity, decoded byte caps, fragment count and physical read
  ownership remain enforced. Compressed/CORS-filtered lengths do not substitute
  for streamed decoded bounds or signed asset digests.
- A parsed index only schedules bounded reads. A candidate requires complete
  asset verification plus a same-key locator bound to the identity-branded live
  manifest proof. A clone of the candidate token grants no acceptance authority.
- Acceptance requires a current owner and gesture, a current backup selection,
  a physical wallet lease, current route generation, an authenticated release
  proof and a monotonic accepted-release floor. It checks those conditions across
  storage, backup, disconnect and lock awaits. Direct destination navigation is
  refused outside ordinary transport mode.
- Logical cancellation does not release shared physical admission while an
  ignored native operation remains unsettled. Late results cannot publish a
  current candidate. Failed navigation retains the durable rollback floor and
  does not trigger an automatic retry.
- IndexedDB open failures are retryable by a later explicit operation. Obsolete
  open results close their own connection without displacing a newer one.
  Synchronous open exceptions are normalized. Terminal close settles pending
  open work and prevents reopening. Existing CAS idempotence, conflicts,
  monotonic sequence checks and strict durability remain intact.

## Independently executed verification

Runtime: Node `v24.22.3`, npm `11.19.1`.

| Source | Command / scope | Result |
|---|---|---|
| `d73d6e09` | Fresh `npm ci --ignore-scripts` | Passed |
| `d73d6e09` | Update controller, update HTTP encoding, accepted store, manifest and locator tests | **94 passed**, zero failed/skipped/cancelled |
| Regression checkpoint `8f510855071515a0cbec42bb3b3619299c04acf5` | Accepted-release store lifecycle tests | **2 passed, 4 expected failures**, zero skipped/cancelled |
| Fixed `d73d6e09` | Same accepted-release store lifecycle tests | **6 passed**, zero failed/skipped/cancelled |
| `d73d6e09` | `npm run check:boundaries` | Passed: 228 production source files, 140 core modules |
| `d73d6e09` | `git diff --check` | Passed |

The four independently reproduced failures are failed-open retry, a late blocked
open arriving after a retry, synchronous driver-error normalization, and close
leaving an open promise unresolved. The fixed checkpoint was restored before
this report was written.

Reproduce the focused final checks:

```sh
npm ci --ignore-scripts
node --import ./scripts/test-support/register-tsx.mjs --test \
  packages/security/test/release-update*.test.mjs \
  packages/security/test/release-manifest.test.mjs \
  packages/security/test/release-locator.test.mjs
npm run check:boundaries
git diff --check
```

Execution log digests, retained by the coordinating session:

| Log | SHA-256 |
|---|---|
| `extraction-independent-update-tests.tap` | `b9d3b04eec376989dee4b39e96c8001cd82cc7aa84bae3c9d17b92e7f820c1c7` |
| `extraction-independent-store-red.tap` | `919221971a2daa64118bb5a85561664cbfcbbed5c721426ed07828f2b56b43b8` |
| `extraction-independent-store-green.tap` | `0a318150deac832bf1d229bb56c2360e8a915503814d66e5322b94dc2a7f3939` |
| `extraction-independent-boundaries.log` | `d1a048ee08fb1b83af20b94d47e2b5af27b4fa84ddd02b969e7fa6878011649e` |

## Remaining qualification

The store lifecycle tests use a deterministic injected IndexedDB driver. They do
not establish real-browser IndexedDB behavior. No browser or physical-device
execution was claimed by this reviewer; local Chromium remains blocked by the
execution environment's Unix-socket policy. The controller is not wired into the
application, so its retained historical browser flow remains separate.

The existing byte and count limits bound owned inputs, not peak heap usage or
mobile-device performance. Production trust/bootstrap and actual update-origin
qualification remain unselected. Future app wiring must retain backup and wallet
lease contracts and independently qualify native cancellation, route changes,
fresh origins and destination navigation. The final combined head still requires
its own applicable CI and D8 review gates.
