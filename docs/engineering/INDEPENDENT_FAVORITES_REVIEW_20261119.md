# Independent favorites composition review — November 19, 2026

## Verdict and source identity

**PASS after repair of the reproduced stale-route finding. No open High or Medium finding remains in the reviewed favorites scope.** Fresh exact-head hosted checks, including the real browser journey, remain required. This review does not claim browser execution, deployment, physical-device acceptance or transaction qualification.

| Reference | Exact value |
| --- | --- |
| Integration base, PR #190 | `2b23ee614ff2dd05bd3a6e79f1278658c30a3909` |
| Initial implementation reviewed | `6a01b49b04d9d49f80ea1c32579f050bfd5f61cc` |
| Independent failing regression | `d5ca7f1e72667331e73cef8376e0799cbb29f3df` |
| Author's copy of that regression | `72313503a141a8cb90c0753f8f29a06ed8d95820` |
| Production repair | `677580418fc3dee473702680c29ebb7c2c756e2a` |
| Repaired source tree | `01f970f0693f2015c50072de90401e1a5bce18e1` |
| Reviewed comments/README successor | `ed2f19ed27083da9c3411ea74fcd471f07c44c0f` |
| Successor tree | `9c084e77b4ed8605d5e9d98fc4d6ca996f859494` |
| Independent checkout before this report | `774a68bbc8c8a5c2c81a41427a918c50c14a35f9`, exact tree equality with the successor |

The reviewer read the previous handoff and state, reconstructed the unchanged native favorites and runtime contracts, and inspected the new schema, runtime/facade, Worker, controller, UI, build boundaries, tests and hosted harness. All reviewer execution used a separate worktree with physical in-checkout dependencies. The author's worktree and production source were not modified by the reviewer.

The successor changes only the personalization README and top-of-file scope comments in the runtime schema and Worker endpoint. Its diff was inspected; the repaired behavior is unchanged. Tests below remain bound to the source where they actually ran.

## Medium finding — reproduced and closed

**An aborted fresh saved-review load could reopen an older accepted favorite.** The initial `openFavorite` treated either successful load status or `INVALID_SAVED_REVIEW` as evidence that current-registry loading completed. The latter also describes generic failures before the checked list publishes, when an older accepted review may still be cached.

Two independent tests failed at the initial implementation: **0 passed, 2 failed**.

1. A fresh trusted-port list with duplicate IDs was refused, but the cached favorite route was returned.
2. A structurally valid list contained a favorite that now failed review and another new valid row. Local route-ID generation failed before publication completed, yet the previously accepted favorite route was returned.

These tests model trusted-port and infrastructure faults. They do not demonstrate a peer-controlled exploit through the native Worker protocol or a signing, settlement or funds-authority bypass. The Medium assessment concerns the explicit guarantee that this action opens only a freshly revalidated saved review.

The repair introduces a private completed-load generation. New loading and session retirement clear it. Only complete checked publication sets it, while the originating generation remains current. Opening now requires that exact completion generation, the expected saved-load increment, the original favorite generation/selection and a matching saved ID. General failure cannot reuse a cached result. A completed mixed list can still open its freshly valid requested favorite when a different row is rejected.

Both reproductions now pass. A separate four-case probe used actual digest-first `RegistryService` through `syntheticDemoSource`, default `reviewTermsBytes` and generated synthetic terms. It confirmed failed-publication refusal, mixed-list opening, synchronous forget during publication and silent selection retirement. Neither retirement returned a route. Its complete source is preserved below.

## Boundary and lifecycle assessment

The runtime parser requires exact own-data fields, 32-lowercase-hex profile/record IDs, a boolean membership value and a nonnegative safe integer observed revision. Revision zero remains valid for fresh/restored profiles. List replies contain at most eight distinct detached IDs and a revision; change replies contain the requested ID, boolean and incremented revision. Accessor-bearing, sparse, duplicate, oversized and extra-field replies are refused. There is no generic record IPC or free-form diagnostic channel.

Both commands retain the runtime's selected profile/generation binding and primitive-only pending metadata. The runtime validates exact mutation receipts and rejects a success settled just before lock through its post-await handle check. Cancellation uses the existing selection-retirement path.

Each Worker request constructs and disposes the unchanged native lease-bound consumer. Native freshness/CAS, the Worker deadline and physical admission remain enforced. Independent native tests exercised stale revisions, foreign reserved preferences, lock before commit and a write that became durable before timeout suppressed its success reply. Reconciliation requires explicit reload; no automatic retry is introduced.

The UI explicitly loads membership before enabling a usable observed revision. Save/delete retires that revision; unsuccessful membership changes discard the ready projection. Adding requires an existing saved review. Removing requires explicitly loaded membership and still permits a dangling reference after review deletion. Deleting a review does not silently prune its preference. Favorites use recheck buttons, not persisted record-to-route links. Lock/profile changes clear projections, and navigation also checks component mount and the surviving saved ID.

The independently built default artifact includes exactly two personalization modules, both in the private vault Worker:

- `packages/personalization/favorites.ts`
- `packages/personalization/src/favorites.ts`

The emitted document and QR graphs contain no personalization module. The template-store implementation and package barrel are absent. Existing domain trade-draft helpers and schemas are separate pre-existing modules, not template-store composition. The build emitted 13 files including local evidence and retained `ReleaseEnabled:0`, `signedRelease:false`, `releaseAcceptance:false` and physical QR qualification false.

## Gate and source preservation

The reviewer independently compared the successor with PR #190:

- All **52 original scripts** are unchanged; only `test:favorites:browser` is added.
- Dependency fields and `package-lock.json` are unchanged.
- Removing the one additive favorites browser step yields the exact original `vault-foundation.yml` bytes. Prior steps, permissions, pins and timeouts are preserved.
- The other five workflows are byte-identical.
- Contracts, storage, domain, wallet, security, transport and native personalization implementation paths are unchanged.
- Source/artifact policies allow only the two exact favorites paths in the private Worker. Negative cases retain document/QR, private/barrel and transitive optional-module refusal.

The new hosted harness builds the emitted synthetic-demo app and uses the actual module Worker and encrypted IndexedDB. Its source covers explicit loading, encrypted persistence/reload, lock/profile retirement, current-registry opening, dangling removal and structurally saved but invalid terms. Its setup fixture uses the same emitted Worker and existing narrow commands, not a substituted runtime. **Inspection of that harness is not a browser pass.** No local Chromium launch or socket-policy bypass occurred.

## Independent execution

Environment: Node 24.22.3 with physical in-checkout pinned dependencies.

| Check | Observed result |
| --- | --- |
| Independent stale-open regression at initial source | **0/2 passed**, expected RED |
| Adjacent native/runtime/schema/consumer tests at initial source | **68/68 passed**, zero failures/skips |
| Import/artifact/QR policy tests at initial source | **37/37 passed**, zero failures/skips |
| Repaired controller, independent regressions, prior saved-review controller and UI render tests | Repair tree `01f970f…`: **39/39 passed**, zero failures/skips |
| Separate real-registry/default-review probe | Repair tree: **4/4 checks passed** |
| `node apps/web/scripts/build.mjs` | Comments/README successor `ed2f19e…`: passed |
| Actual emitted graph inspection | Exact private-Worker favorites pair; no document/QR personalization or template store |
| `node scripts/check-import-boundaries.mjs` | Successor: passed, **235 production source files / 140 core entry modules** |
| Source/gate preservation and whitespace checks | Passed |

Initial adjacent command:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test \
  apps/web/test/saved-review-favorites-worker.test.mjs \
  apps/web/test/saved-review-favorites-controller.test.mjs \
  apps/web/test/app-services.test.mjs apps/web/test/app-runtime.test.mjs \
  apps/web/test/pending-metadata.test.mjs packages/schemas/test/runtime.test.mjs \
  packages/personalization/test/favorites.test.mjs
```

Final repaired command:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test \
  apps/web/test/saved-review-favorites-independent.test.mjs \
  apps/web/test/saved-review-favorites-controller.test.mjs \
  apps/web/test/saved-reviews-controller.test.mjs \
  apps/web/test/saved-review-favorites-ui.test.mjs
```

Policy command: `node --test scripts/tests/import-boundaries.test.mjs apps/web/scripts/artifact-policy.test.mjs apps/web/scripts/qr-build-policy.test.mjs`.

The full repository suite, four maintained typechecks and hosted browser outcomes belong to their separately identified implementing/CI reports. This report does not relabel them as reviewer executions.

## Evidence digests

| Log | SHA-256 |
| --- | --- |
| `favorites-independent-stale-open-red.tap` | `a5cb2ce878d09c2f4844e67d75d25d575cb7143efcef9cdf50cabce72cb8d4a7` |
| `favorites-independent-adjacent.tap` | `3fdb218afb881ce7ca0a42091919fd81dbdf1f2714ed709d31ce5cb467fee189` |
| `favorites-independent-boundaries.tap` | `0ca9369e3f49b315f7a912cc8d16b030d266ec1c99fb34e965e7ec305e183490` |
| `favorites-independent-repaired.tap` | `4df899c0460e59b2a6fc2a192ff050abe214bef21e8f9f2f556f522fb0475d45` |
| `favorites-independent-native-review.log` | `0a0ea56f07bc14ba9a5e842eadacd9c304b90f3690a1fce8cf96eecd4f112c89` |
| `favorites-independent-build.log` | `1b41e0a15d6ddce5762978d500cfde413617341a6774b46ac82170f60cb43b03` |
| `favorites-independent-current-boundaries.log` | `871ed40847646f3989401f9dcf5d9f513df4443b71c9c6024c1103c912d57413` |

## Reproduce the separate real-review probe

Run from the repository root with `node --import ./scripts/test-support/register-tsx.mjs --input-type=module`, supplying this code on standard input. It creates no persisted profile, wallet, network or transaction operation.

```javascript
import assert from 'node:assert/strict';
import { createTradeReviewController } from './apps/web/src/trade/review-controller.ts';
import { syntheticDemoSource, freshCoreNativeDocument } from './apps/web/src/demo/synthetic-local.ts';

const id = '1'.repeat(32), other = '2'.repeat(32), ok = value => ({ ok: true, value });
const valid = await freshCoreNativeDocument(BigInt(Math.floor(Date.now() / 1000)));
const bad = JSON.parse(new TextDecoder().decode(valid)); bad.terms.deploymentId = 'unrecognized-deployment';
const invalid = new TextEncoder().encode(JSON.stringify(bad));
const row = (recordId, bytes) => ({ recordId, source: 'file', bytes });
async function setup() {
  let rows = [row(id, valid)], failRandom = false, scope = 1, state = { state: 'unlocked' };
  const trade = createTradeReviewController({ source: syntheticDemoSource,
    randomBytes: length => { if (failRandom) throw new Error('LOCAL_RANDOM_UNAVAILABLE'); return crypto.getRandomValues(new Uint8Array(length)); } });
  const store = { getSnapshot: () => state, selectionScope: () => scope, subscribe: () => () => {},
    listTermsReviews: async () => ok({ items: rows.map(value => ({ ...value, bytes: value.bytes.slice() })), skipped: 0 }),
    listFavoriteReviews: async () => ok({ revision: 1, recordIds: [id] }) };
  trade.setPersistence(store); await trade.loadRegistry(); await trade.loadSaved(store); await trade.loadFavorites(store);
  assert.equal(trade.getSnapshot().reviews.length, 1); assert.equal(trade.getSnapshot().saved.kind, 'done');
  return { trade, store, change(next, fail = false) { rows = next; failRandom = fail; }, switchSilently() { scope++; state = { state: 'locked' }; } };
}

{
  const s = await setup();
  try {
    s.change([row(id, invalid), row(other, valid)], true);
    assert.equal(await s.trade.openFavorite(id, s.store), null);
    assert.equal(s.trade.getSnapshot().saved.code, 'INVALID_SAVED_REVIEW');
    assert.equal(s.trade.getSnapshot().reviews.length, 1, 'old session review remains but does not authorize a favorite open');
  } finally { s.trade.dispose(); }
}
{
  const s = await setup();
  try {
    s.change([row(id, valid), row(other, invalid)]);
    const route = await s.trade.openFavorite(id, s.store); assert.ok(route); assert.equal(s.trade.find(route).savedId, id);
    assert.deepEqual(s.trade.getSnapshot().unreviewable, [{ recordId: other, code: 'UNKNOWN_DEPLOYMENT' }]);
  } finally { s.trade.dispose(); }
}
for (const retire of ['forget', 'silent-switch']) {
  const s = await setup(); let armed = true;
  try {
    s.trade.subscribe(() => {
      if (!armed || s.trade.getSnapshot().saved.kind !== 'done') return;
      armed = false; if (retire === 'forget') s.trade.forgetSaved(); else s.switchSilently();
    });
    assert.equal(await s.trade.openFavorite(id, s.store), null, retire);
  } finally { s.trade.dispose(); }
}
console.log(JSON.stringify({ actualRegistryAndReview: true, checks: 4, staleFailure: 'refused', mixedValidFavorite: 'opened', synchronousForget: 'refused', silentSelectionRetirement: 'refused' }));
```
