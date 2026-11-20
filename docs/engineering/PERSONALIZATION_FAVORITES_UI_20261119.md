# Encrypted saved-review favorites — November 19, 2026

Task date uses America/Los_Angeles; execution continued on November 20 UTC.

## Source and authority

| Reference | Exact checkpoint |
|---|---|
| Published PR #190 base | `2b23ee614ff2dd05bd3a6e79f1278658c30a3909` |
| Isolated branch | `codex/personalization-favorites-ui-20261119` |
| Initial application source | `6a01b49b04d9d49f80ea1c32579f050bfd5f61cc` |
| Initial application tree | `5737fdf585989c121aecf3868d6a7c9426b21efe` |
| Canonical render-fixture correction | `e253544bf82fd17c5835dc9bc24f5a404557bbb8` |
| Independent RED probes, original author | `d5ca7f1e72667331e73cef8376e0799cbb29f3df` |
| Independent RED probes, applied to this branch | `72313503a141a8cb90c0753f8f29a06ed8d95820` |
| Reviewed behavior repair | `677580418fc3dee473702680c29ebb7c2c756e2a` |
| Reviewed repair tree | `01f970f0693f2015c50072de90401e1a5bce18e1` |
| Source qualification checkpoint, comments-only successor | `ed2f19ed27083da9c3411ea74fcd471f07c44c0f` |
| Source qualification tree | `9c084e77b4ed8605d5e9d98fc4d6ca996f859494` |

Accepted D7 already includes personalization. This change composes only the
reviewed favorites consumer recovered in `PERSONALIZATION_EXTRACTION_20261119.md`.
It does not copy the older #42 application, implement trade templates, wire any
of the nine optional reference packages, change cryptography or add a release,
network, wallet, signature, transaction or funds capability. `ReleaseEnabled=0`
remains unchanged. No source was published or merged by this authoring agent.

`packages/personalization/src/favorites.ts` is unchanged from the reviewed base.
The package barrel remains outside the emitted application. A new narrow
`packages/personalization/favorites.ts` entry exports only its constructor.

## Current application behavior

The existing saved-review surface offers **Load favorites** while a profile is
unlocked. This explicit read returns at most eight opaque saved-review IDs and
the observed native vault revision. It neither loads terms nor changes storage.
Once loaded, a saved review can be added to or removed from favorites with an
explicit button click. Controls serialize with other saved-review operations.

The document protocol adds exactly two commands:

| Command | Request fields beyond the common version/request/generation header | Successful projection |
|---|---|---|
| `listFavoriteReviews` | `profileId` | `revision`, unique bounded `recordIds` |
| `setReviewFavorite` | `profileId`, `recordId`, boolean `favorite`, `expectedRevision` | `recordId`, boolean `favorite`, resulting `revision` |

Strict parsers reject extra fields, accessors, malformed or duplicate IDs,
sparse/extended arrays, more than eight IDs, non-boolean membership and invalid
revisions. Pending metadata retains only operation, generation and profile
correlation. The facade never returns a native session, lease or preference
payload. Runtime publication checks the active profile and opaque handle again
after asynchronous settlement, including exact record, membership and revision
matching for a change receipt.

For every command the native Worker captures the selected real vault session and
creates the reviewed consumer with a current-job/profile predicate. The consumer
captures its own native session lease, performs freshness checks and commits via
the actual encrypted vault CAS path. The Worker disposes that consumer when the
operation drains. The constructor and its native storage contract are reused
without a second preference codec or storage backend.

Adding validates an existing compatible saved-review wrapper. Removing an
explicitly loaded favorite can remove a dangling reference after its saved review
has been deleted. Deletion never prunes favorites automatically, and an unknown,
foreign or malformed reserved preference row is retained. This preserves the
reviewed consumer's contract and avoids stranding deleted-review references.

Save/delete operations retire the UI's previously observed favorites revision.
Stale CAS and other failed changes clear the projection and require a new explicit
load; no automatic retry or silent overwrite occurs. Lock, cancellation, disposal
and profile changes abort pending work and suppress late projections. A native
commit that already won remains durable even if its UI acknowledgement is later
suppressed by lock or timeout. The UI explains that an interrupted change must be
checked by unlocking and loading favorites again.

**Open and recheck favorite** invokes the existing `loadSaved` path, which checks
the original stored terms against the current registry. The controller resolves
the requested record to a session route only after that fresh load completed and
published while its selection and generation were still current. IDs in the
preference never grant review validity. Invalid or missing saved terms cannot
produce a favorite route; their reference remains explicitly removable.

## Independent finding and repair

The initial implementation inferred fresh-load completion from the public saved
status. `INVALID_SAVED_REVIEW` covers both a completed load containing rejected
rows and a generic failure before all fresh results were published. Consequently,
a previous accepted route could be returned after the new load failed while the
old review remained cached.

The independent reviewer supplied two reproducible RED cases: a malformed fresh
trusted-port listing, and a fresh review that rejected the requested favorite but
then failed while generating another row's session ID. Both initially returned
the cached route. This was rated **Medium** for violating the fresh-review opening
guarantee. No peer exploit, signing bypass or financial authorization was
demonstrated.

The repair adds an internal completed-load generation. It is cleared at the start
of a load and during session cleanup, and set only after complete fresh result
publication while that generation remains current. `openFavorite` requires this
token along with its existing selection/generation checks. A completed mixed load
can still open its freshly valid requested favorite when another row is invalid;
a generic failure cannot supply the token.

Independent re-review on tree
`01f970f0693f2015c50072de90401e1a5bce18e1` closed the Medium: 39 adjacent
controller/saved-review/UI tests passed, and four additional probes using the real
synthetic registry source and default terms-review function passed. Those probes
cover failed publication, a valid favorite in a mixed list, synchronous session
cleanup and silent profile retirement during publication. Initial independent
adjacent runtime/schema/native-consumer checks passed 68 tests and the selected
source/artifact/QR boundary checks passed 37. No open High or Medium finding was
reported. The independent report retains its own exact commands and scope.

## Boundary preservation

Source admission permits the new favorites facade only from the current native
vault endpoint. Other app and package consumers are refused. The emitted build
admits exactly the facade and `src/favorites.ts` in a native Worker; the document,
QR decoder, package barrel, templates, unreviewed siblings and nested look-alike
paths are rejected. Negative tests preserve transitive optional-module refusal.

The emitted ordinary build contains both allowed favorites modules in
`core-graph-worker.json`, none in `core-graph-document.json`, and none in the
dedicated QR graph. Existing QR decoder pinning and dependency isolation, private
Worker separation, CSP, offline configuration, localnet-only restrictions and
all previous browser gates remain in place. No dependency or lockfile changed.

## Executed local qualification

Final commands ran from the isolated worktree using Node 24.22.3 and npm 11.19.1.
The complete full-suite receipt was observed at `2026-11-20T00:59:53Z`.
The broad final run supplies the existing verified native tools through:

```sh
FOUNDRY_BIN=/workspace/scratch/6bd6e00af1c0/toolchain \
FOUNDRY_SOLC=/workspace/scratch/6bd6e00af1c0/toolchain/solc-0.8.30 \
npm test
```

`cast --version` reports Foundry 1.5.1 at
`b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2`; solc reports
`0.8.30+commit.73712a01.Linux.g++`.

| Check | Result |
|---|---|
| Independent RED probes at the applied RED checkpoint | Exit 1; 0/2 passed |
| Repaired independent probes plus favorites controller suite | 10/10 passed; zero failed/skipped |
| Corrected static-render favorites UI suite | 4/4 passed; zero failed/skipped |
| Native Worker favorites cases using the real encrypted vault and a controlled CAS adapter | 7/7 passed; zero failed/skipped |
| Final full `npm test` with the pinned native toolchain | 2,178/2,178 passed; zero failed/cancelled/skipped; 98.34 seconds |
| Final `npm run build` including all four TypeScript projects | Passed; ordinary offline static artifact, 12 files, release acceptance false |
| Final `node apps/web/scripts/build.mjs demo` | Passed; synthetic demo artifact, 13 files, release acceptance false |
| Final `npm run test:build-policy` | 56/56 passed; zero failed/skipped |
| Final `npm run check:boundaries` | Passed; 235 production files, core entry graph remains 140 modules |
| Actual default and demo emitted graphs | Exactly two favorites modules in each private Worker; zero in either document or QR graph |
| `node --check scripts/test-saved-review-favorites-browser.mjs` | Passed; syntax evidence only |
| `npm run check:docs` | Engineering consistency passed; semantic approval remains false |
| `git diff --check` | Passed |

The docs validator still marks the changed locale catalog and its six existing
claims as draft/stale. It does not grant semantic claim approval, publication or
release approval. This change does not replace those separate decisions.

Historical qualification is kept separate. The first full run had 2,175 tests:
2,171 passed, three newly authored render-fixture cases failed, and one Foundry
comparison was skipped because the toolchain environment was not supplied. The
render fixture used a noncanonical HTML-like order ID, correctly refused by the
existing locale identifier formatter; the fixture-only correction uses a valid
canonical-shaped ID. A subsequent preliminary full run lost its process during
agent continuity recovery and is incomplete; it supplies no pass claim. Final
qualification includes both the production repair and the pinned native tools.

Execution logs are transient workspace evidence. These digests bind the reported
completed outputs; none is a browser receipt or evidence for a later source:

| Log | SHA-256 |
|---|---|
| `favorites-final-suite.log` | `365154aea4fe5078c9d9620029bb9ca9f864c04cd0d4a8fb6e0e74397d277561` |
| `favorites-final-build.log` | `f9988dd8a66c7405cbdda042ee00aac97c918314a83e64430e971f3020d51b9c` |
| `favorites-final-demo-build.log` | `9179d343439275725479befd8b9172b8b503f21d9135308a05da905357339554` |
| `favorites-final-policy.log` | `b017350eb3630c2a3d488ea5fe654f675d24f5e7ec6dc01b7abbc92bf31d10c6` |
| `favorites-final-boundaries.log` | `8e0dc6ab807dee6ecc8466d833551e6413ccc40d6f1c83ea680593f09876e6c4` |
| `favorites-final-graphs.log` | `e422c903ccc6a1c3bbb7cfd131df03ee9332497193c4948c96ab20e0c997099a` |
| `favorites-final-docs.log` | `daf413a4cebdd09e5376e2b1c01e17243116981faa90927bdb4a9935032f02c4` |
| `favorites-independent-red.log` | `29a2977bacdabf7b448d9cbac2d8b056f0948f1599bcc0d393dafddc576777a7` |
| `favorites-independent-green.log` | `cf35cd40ed982477520db8681301d4f988a22e6a17624fee8666537675bf777a` |

## Hosted browser gate and remaining qualification

`npm run test:favorites:browser` is a separate new step in the existing hosted
browser job and receives the same existing Chromium setup output as the existing
gates. Its new harness builds the emitted demo app and exercises actual UI clicks,
the real native Worker, and encrypted IndexedDB. It checks explicit revision
loading, star/unstar persistence, reload, current-registry opening, route revocation
on lock, profile isolation, retained dangling references and explicit cleanup.
The negative terms fixture also uses the same emitted native Worker and existing
saved-review commands; opening its favorite must fail the current review.

The harness additionally checks the actual document/private/QR graphs, encrypted
at-rest content, empty local/session storage, and unexpected network requests.
It is fixture evidence for an offline development build and does not qualify
device behavior, deployment or release acceptance.

**The new browser harness has not been launched locally. Actual hosted execution
on the published source is required before integration, together with the
preserved existing hosted gates.** No local Chromium/socket bypass was attempted.
The agent did not publish source, merge, deploy, change remote settings or access
credentials or funds.
