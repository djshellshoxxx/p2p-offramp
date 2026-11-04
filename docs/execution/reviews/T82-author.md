# T82 encrypted saved-review favorites — source freeze

Implementation and focused verification are complete. No commits were made by
this slice. Root owns shared enrollment, CI, coverage/assurance ledgers and merge.

The actual Offers saved-review list now has star/unstar controls and an encrypted
favorite list. A selection-bound G02 consumer stores at most eight existing saved
review IDs in one owned versioned `preference` row. Worker/runtime/AppServices
commands are exactly `listReviewFavorites` and `setReviewFavorite`; the latter
requires the explicitly observed `expectedRevision`. No generic record IPC or
wallet/trade-creation authority was introduced.

Opening invokes the existing `trade.loadSaved(store)` current-registry review,
then resolves only the fresh replaced target object by saved ID. Deleted,
unreviewable and malformed-load-retained old mappings remain unavailable. A
separately refreshed valid target remains usable when another row fails review.
The existing strict legacy saved-review wrapper is accepted read-only without
upgrading its source record.

Native lease revocation is permanent, including observed A -> null -> A. One
physical job stays admitted until actual native work settles; cancellation and
ignored writes cannot admit replacements. Stale revisions refuse without retry.
A completed CAS yields only a scalar durable receipt, with `sessionCurrent:false`
when scope retirement wins publication. Worker/facade discard obsolete replies;
reopening and listing discovers committed membership.

Future/foreign/damaged collisions are retained unchanged. Retention continues its
existing conservative handling of unknown preferences: while the preference row
exists all history remains protected by the native complete-closure guard.
Unstarring removes an ID, including a deleted target's ID, and does not delete the
empty preference or earlier encrypted backups. UI copy discloses this behavior.

## Verification

- RED: initial seven package tests failed for absent consumer; four Worker/facade
  cases failed for absent named commands; initial four UI cases failed for absent
  fresh-open consumer. The malformed fresh-load regression was separately
  reproduced RED before the loader-replacement guard was added.
- GREEN: `node --import ./scripts/test-support/register-tsx.mjs --test
  packages/personalization/test/favorites.test.mjs
  apps/web/test/review-favorites-worker.test.mjs
  apps/web/test/review-favorites-ui.test.mjs` — all three files, 17 cases.
- Existing saved-review Worker/controller cases also passed alongside these
  before the final additional malformed-load regression and guard.
- `npm run typecheck` — passed for package, runtime, Worker and UI targets.
- `npm run check:boundaries` — passed, 223 production source files, 76 core graph
  modules. Earlier T80 WIP `window` identifier findings were reported to its
  owner and are resolved in this final check.
- `git diff --check` — passed.
- `node scripts/test-review-favorites-browser.mjs` — final run passed on Chromium
  154.0.8037.57 with actual emitted demo UI/Worker, two actual documents, native
  IndexedDB/WebCrypto/G02, encrypted reload, fresh-key G03 restore, fresh
  salt/wrap nonce/snapshot nonce, unchanged source ciphertext, foreign future
  preference preservation, fresh current-registry open, deleted/unreviewable
  targets unavailable, unchanged encrypted profile on open, stale native CAS
  refusal without retry, zero unexpected network requests and zero submissions.
  The first sandbox-localhost bind failed EPERM; the authorized local-only
  execution escalation was approved and the fixture passed. One earlier browser
  assertion counted the intentionally displayed unreviewable-ID list as an open
  review; the selector was corrected to count actual review routes.

Native proof emitted:

```json
{"fixture":"T82-encrypted-saved-review-favorites","browser":"154.0.8037.57","actualUI":true,"actualWorker":true,"actualDocuments":2,"actualIndexedDB":true,"nativeWebCrypto":true,"encryptedReload":true,"freshKeyBackupRestore":true,"foreignPreservation":true,"freshRegistryReviewOnOpen":true,"deletedAndUnreviewableUnavailable":true,"noOpenWrite":true,"nativeStaleCASRefusesWithoutRetry":true,"nativeSubmissions":0,"unexpectedRequests":0,"tradingEnabled":false,"releaseAcceptance":false}
```

Root should enroll the native fixture as `test:favorites:browser` (or its chosen
canonical name) in the existing hosted gate. No whole-suite receipt is claimed
here; root coordinates the final combined suite after all source freezes.

## Frozen exact slice files (SHA-256)

The following files are transferred back to root. This slice will make no further
source edits without coordination; no other files or shared ledgers were edited.
Root-owned locale `en.ts`/`messages.ts` provide the typed favorites text and are
dependencies of the demonstrated emitted UI, rather than exclusively owned files.

```text
3a568c1095cca3cff7c9fb06100ac0c8d1bc00681c306229f7347343de47ef70  packages/personalization/index.ts
8a8282db95710702fb73bb580139322a36ed5758ddfa8da21734d93e38ef9387  packages/personalization/README.md
5508b0f0ce37db3fb86c293dd072617608c417db8353e670e9b12eff4d271e27  packages/personalization/src/favorites.ts
aa69efd4c5c2796c6e5001defb329c54e0843afb98a0ba396002cb0f293ce074  packages/personalization/test/favorites.test.mjs
5a81fe4cd89224375b4c2d8f845d2e651132230553cf2419e6a1b733bf70129e  packages/schemas/src/runtime.ts
2c928fae9c3d552cfc1e329e147cfb95ecbfd2a7ad7dc2be0d12fe379271009a  apps/web/src/runtime/app-runtime.ts
a5f5c57f0f73bf44ed80877d4692aeda5dfe4bef24dcb256cf4b8922db611ffc  apps/web/src/runtime/pending-metadata.ts
f54832dfdff45c7a5068fb8e872c75adae5b90bf983e6ab2633ec94a06a3d50e  apps/web/src/runtime/worker-endpoint.ts
c4d5c9dea308501de2bb7c753f3b2479b810698f1f1f4ee4795eb4ee2fca914e  apps/web/src/app-services.ts
5d88371339d645a24ec13b4ded947931c29f483f0bcc6a9bd881be77b6414c2c  apps/web/src/ui/trade/TradePages.tsx
556708259381c4a5bd5795bc233a2a4317eebfbe0be6c0ca6e715b5151bb025a  apps/web/src/ui/FavoriteSavedReviews.tsx
2bd2bfd6e41eccc9aa0976106d124a819cf083eea487ce63c7f7006466142748  apps/web/test/review-favorites-worker.test.mjs
e17c7ba3191560478c955a16a137c9b6a9aa67c9456417f6b3bcf83c3761949d  apps/web/test/review-favorites-ui.test.mjs
bec72f2fa123b02764fdda49c9fb4e1531a260b64f135379c03bfc70e5845819  scripts/test-review-favorites-browser.mjs
```
