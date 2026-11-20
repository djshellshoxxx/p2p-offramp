# Generation 13 optional signed-update review interface

November 20, 2026 UTC.

## Result and source

The optional F24 review interface is implemented and locally checked. The default
application exposes an unconfigured panel with no controller. This is a UI slice,
not a completed signed-update operation or trusted runtime composition. F24
remains partial. Independent exact-source review and publication belong to the
coordinator; this author report does not claim that review has passed.

| Identity | Value |
| --- | --- |
| Base with current backup-verification UI | `bad3b708bb6528cfdc7b1e65e8f29727ad4bbe6e` |
| Implementation commit | `723b8d105a185f3c84130d1ccd5c9a907ff13153` |
| Implementation tree | `5813c5bbc09900698ce7a79ca44383adb149c8e8` |
| Local branch | `codex/update-ui-g13-20261120` |
| Historical source inspected | PR81 `a45e932a37153590bc329c1e9012cf18e37fe12c` |

The historical donor contains a browser fixture with a small imperative DOM
control, not a reusable application panel. This change uses the maintained
`AssetUpdateController` interface and review fields. It does not restore the
historical fixture or introduce an alternative updater protocol.

## Implemented behavior

`SignedUpdatePanel` appears in Settings. `AppProps.updates` is optional and defaults
to `null`; the default entry supplies nothing. Rendering initiates no check,
accepted-state read, network request, wallet operation or navigation. The
unconfigured panel explains its state, disables checking and links to existing
local backup/recovery tools.

The new `packages/security/update-view.ts` entry exports only existing types.
There is no emitted constructor or configuration setter. The boundary exception
is exact to that file; direct application imports of the internal updater remain
private. The facade has no executable exports when loaded by the test runtime.

An explicitly supplied trusted controller follows these UI steps:

1. The user requests a check. A previous review and consent are discarded.
2. A candidate displays full current and candidate key fingerprints and manifest
   SHA-256 values, sequence, release ID, source commit, predecessor, supported
   schema range, full destination and every asset's path, length and SHA-256.
   The destination and asset paths are plain text. Signed human release notes
   are explicitly absent. Fresh-origin rollback uncertainty and fresh-key
   recovery requirements are visible.
3. The user acknowledges the review and selects a separate confirmation button.
   Its handler requires a trusted click and immediately passes the original
   opaque candidate object to `acceptUpdate`, before awaiting another action.
   The controller's real gesture check remains authoritative.
4. All outcomes use fixed locale-owned copy. A failed acceptance states that its
   accepted sequence may already be durable and requires a new check. The panel
   does not schedule a retry, restore old floors or make a direct destination
   link available after refusal.

Explicit discard, document hiding, pagehide, unmount and controller replacement
abort the UI request, retire the opaque candidate and invoke controller
cancellation. Delayed replies cannot repopulate the retired review. Immediate
duplicate click handlers dispatch at most one request while that UI request is
pending. The existing controller retains physical-operation admission after a
logical cancellation; the view does not replace that mechanism or claim it can
observe physical provider drain.

The injected controller has one exclusive UI consumer. Its constructor owner
retains disposal, transport grants, exact backup ownership, wallet lease and
navigation responsibilities. A profile lock alone does not cancel the UI's
acceptance: the controller intentionally locks its own selected profile before
navigation, and must distinguish that exact transition using its runtime lease.
No UI scope counter substitutes for that lease.

## Preserved boundaries and unresolved composition

No code in `packages/security/src`, `apps/web/src/app-services.ts`, the private
runtime or `apps/web/src/main.tsx` changed from the base. The optional panel adds
no trust key, endpoint, gateway, transport grant, wallet provider, backup fact,
archive installer, service worker, release configuration or deployment authority.
No imported receipt is accepted. `ReleaseEnabled=0` remains in the actual build
evidence, with `signedRelease:false` and `releaseAcceptance:false`.

The exact-own-lock capability mismatch recorded in
`SECURITY_REVIEW_UPDATER_COMPOSITION_GENERATION10_20261120.md` remains an open
composition requirement. That historical adapter and its screened work were
not resumed or reproduced. A configured origin transition still needs a
separately reviewed runtime-owned lease, complete trusted constructor services,
synthetic browser composition and current-source native execution. Production
trust/source/gateway/wallet inputs require owner decisions; completing this UI
does not supply them.

## Executed checks

The implementation was frozen as commit `723b8d1` after the focused checks. The
default build and build-policy invocation ran against that frozen commit.
Report-only changes follow separately. Test counts describe separate
invocations; the build-policy invocation also includes the import-boundary suite
and should not be added to it as a distinct coverage total.

| Check | Result | Scope |
| --- | --- | --- |
| `apps/web/test/signed-update-ui.test.mjs` | 20/20 | Maintained TSX handlers, ordinary synthetic delayed replies, consent, exact token identity, cancellation, default rendering and unset-trust controller result |
| Locale source/catalog/runtime suites | 25/25 | Catalog metadata, variables, source ownership and current locale behavior |
| Backup-verification UI, trade navigation lifecycle and locale stress suites | 34/34 | Neighboring recovery/navigation and layout-source behavior |
| Import-boundary suite | 15/15 | Exact type-only side entry and continued private constructor path |
| `npm run typecheck` | Passed | Package, runtime, Worker and UI TypeScript projects |
| `npm run check:boundaries` | Passed | 241 production source files; 148 visited source modules |
| `npm run test:build-policy` | 58/58 | Existing static artifact, source, import and verification policy gates |
| `node apps/web/scripts/build.mjs` | Passed | Default static build: 12 scanned assets, 794,354 bytes |
| `git diff --check` | Passed | Whitespace/error check |

Commands used for the focused source checks:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test apps/web/test/signed-update-ui.test.mjs
node --import ./scripts/test-support/register-tsx.mjs --test apps/web/test/locale-source.test.mjs apps/web/test/locale-catalog.test.mjs apps/web/test/locale-runtime.test.mjs
node --import ./scripts/test-support/register-tsx.mjs --test apps/web/test/backup-verification-ui.test.mjs apps/web/test/trade-ui-navigation-lifecycle.test.mjs apps/web/test/locale-stress.test.mjs
node --test scripts/tests/import-boundaries.test.mjs
npm run typecheck
npm run check:boundaries
npm run test:build-policy
node apps/web/scripts/build.mjs
```

The UI tests use dependency-aware hooks and synthetic controller responses.
Those are interface evidence, not native React browser event scheduling,
physical gesture attestation, real Worker/IndexedDB, wallet/provider or origin
transition evidence. The real controller exercised by this UI test suite is
only its inert `trust:null` branch. No new configured signed-release operation,
browser matrix or physical-device result is claimed. The managed native-browser
restriction was not retried or bypassed.

### Actual default build graphs

The generated module inventories were parsed and asserted to contain none of
`packages/security/update-view.ts`, `release-update.ts`, `release-update-http.ts`
or `release-update-store.ts`.

| Graph | Modules | Contains panel | Updater modules |
| --- | --- | --- | --- |
| Document | 95 | Yes | 0 |
| Native vault Worker | 30 | No | 0 |
| QR Worker | 4 | No | 0 |

This is actual default-bundler evidence: the type-only facade is erased and the
new view does not activate updater construction. Source-boundary traversal is a
different measurement and includes type dependencies.

Raw author logs and the full generated inventory are in
`dist/update-ui-evidence/` in this worktree. The adjacent JSON report preserves
their SHA-256 values, graph hashes, counts and release flags. These are local
author checks, not hosted attestations, independent review or release approval.
