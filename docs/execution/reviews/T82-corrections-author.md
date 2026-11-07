# T82 correctness repair — repaired source freeze

Root re-transferred only the two reviewed correctness repairs during the CI hold.
Both were reproduced before production edits. No feature behavior was added, no
commits were made, and runtime/schema/AppServices/TradePages remained untouched.
The original `/workspace/work/t82-favorites-receipt.md` remains unchanged, SHA-256
`0b5f0a04460dbb7f9f2312d9ceb697ffbac87f40d6127f5cea8b45f998ff0879`.

## Repairs and reproduced failures

1. Native favorite errors now use guarded exception classification and a bounded
   `VaultErrorCode` allowlist. Own data descriptors supply native error codes;
   inherited values and accessors have no diagnostic or conflict authority.
   Foreign `instanceof`/descriptor traps produce fixed results and release the
   physical slot. Factory failures retain their fixed invalid-input fallback.
2. Favorite UI ownership now includes the exact `TradeReviewController` object,
   alongside store and selection scope. Replacement retires the old view and
   pending open, while ignored old work keeps admission until it drains. The
   replacement controller can then reload and open its own fresh mapping.

Raw RED logs are preserved outside the repository:

- `/workspace/work/t82-corrections-package-red.log`: seven original package cases
  passed; three regressions failed. Foreign exception prototype traps escaped
  `#run` and factory normalization, and an unbounded native code was returned.
- `/workspace/work/t82-corrections-package-accessor-red.log`: four regressions
  failed, including a native code accessor supplying an erroneous `CONFLICT`.
  The embedded `PRIVATE_ERROR` values are synthetic test markers.
- `/workspace/work/t82-corrections-controller-red.log`: a real React hook fixture
  with a held existing `loadSaved` was switched from controller A to B without
  changing store/scope. The old reply navigated to
  `#/trade/AQEBAQEBAQEBAQEBAQEBAQ` instead of staying on `#/offers`.

## Final scoped verification

- `/workspace/work/t82-corrections-focused-green.log`: original 17 focused cases
  plus four new error regressions passed: package 11, Worker/facade 4, UI 6.
- `node_modules/.bin/tsc -p apps/web/tsconfig.ui.json --noEmit`: passed. The native
  fixture also compiled the modified package with strict TypeScript options.
- Scoped `git diff --check`: passed.
- `/workspace/work/t82-corrections-native-green.log`: the single final full
  favorite native harness run passed on Chromium 154.0.8037.57. The additional
  real-React lifetime fixture held the old load, replaced the controller with
  the same store/scope, confirmed replacement work stayed gated until drain,
  suppressed the obsolete route, cleared the previous view, and then opened the
  fresh replacement mapping. The retained `actualDocuments:2` field describes
  the two native-storage documents; this separate hook-lifetime fixture uses an
  additional temporary document with a controlled read-only store.
- The actual emitted App UI/Worker/native IDB/WebCrypto proof then passed
  encrypted reload, fresh-key G03 restore, foreign preference/source preservation,
  current-registry rereview, deleted/unreviewable unavailability, no open write,
  stale native CAS refusal without retry, zero unexpected network requests and
  zero native submissions. No full package suite or hosted CI rerun was performed.

Final native receipt:

```json
{"fixture":"T82-encrypted-saved-review-favorites","browser":"154.0.8037.57","actualUI":true,"actualWorker":true,"actualDocuments":2,"actualIndexedDB":true,"nativeWebCrypto":true,"encryptedReload":true,"freshKeyBackupRestore":true,"foreignPreservation":true,"freshRegistryReviewOnOpen":true,"controllerReplacementSuppressesHeldOpen":true,"deletedAndUnreviewableUnavailable":true,"noOpenWrite":true,"nativeStaleCASRefusesWithoutRetry":true,"nativeSubmissions":0,"unexpectedRequests":0,"tradingEnabled":false,"releaseAcceptance":false}
```

## Repaired frozen files

Only these four files changed in this repair. Ownership is returned to root and
this slice will remain read-only until further coordinated instructions.

```text
57b4681a8e871a4de685e64388e29e30e7294986159c36440a8e3824d7628e72  packages/personalization/src/favorites.ts
28e8cc46cd92042a014b8c2e7e0b0d85182e98805769d585d39381c3a02061cd  packages/personalization/test/favorites.test.mjs
3261acea055de16af9a95ae3bc06e49e793a19318826a70eb1ec9358a79d727c  apps/web/src/ui/FavoriteSavedReviews.tsx
09dca6e98b15ef0dc1c9abbc04a342769f8ce7de37bbc2a502e5d5f3b5a3ef00  scripts/test-review-favorites-browser.mjs
```
