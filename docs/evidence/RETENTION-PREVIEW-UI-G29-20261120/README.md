# G29 offline retention preview: UI evidence

## Frozen source and integration

The UI source and test commit is `0d1d929d8bfb97b9772f84eb5fa3425de6fd3602`, with tree `a9010c02a383346ab7041d5549b9cb09eb7f2471`. This evidence is committed separately.

The worktree starts at `76d107e4e0ca1a2533636a6057d9d603861668e1` (tree `437323a382952b9623a875c818f8af005a5d4563`). Published base `d9ddcf53d82100f05de7346143a0ad00d43c2c1a` has that same tree. Backend source `5ad059fa8b77cfb8beffcf2f1889e5f19d727ea4` was cherry-picked locally as `26c91f1408800e75ed50443a0bb9ee04d7c95d89` before UI typechecking. Integrators should apply the backend source and then the UI source commit; they should not duplicate the local backend cherry-pick.

The UI commit changes only:

- `apps/web/src/ui/Pages.tsx`
- `apps/web/src/ui/RetentionPreviewPanel.tsx`
- `apps/web/src/ui/locale/en.ts`
- `apps/web/test/retention-preview-ui.test.mjs`

## Result and limits

Settings now exposes one explicit offline preview action. It displays the bounded counts and local revision returned by the real `AppServices.planRetention(nowMs, signal)` contract. The preview approves zero records for deletion. Archive-review suggestions are a subset of protected records, and the UI explains this overlap. The existing RetentionService owns the 30-day suggestion rule; the UI reads the clock only when the user starts a preview.

The UI issues no automatic preview on render, effect, selection or locale change. It offers no native dependency check, deletion control or new consent. It leaves saved-review deletion behavior unchanged. The two inaccurate saved-review messages now identify the existing “Delete from profile” control and explain checking the saved list after an interrupted save or deletion. Explanatory retention copy describes the read-only action available now and states that records, backups and remote copies remain unchanged.

Pending work has immediate ref ownership before React renders the disabled state. Requests and visible results bind the service instance, selection scope and profile. Selection invalidation clears counts and aborts pending work; live render guards suppress stale results before layout cleanup. Lock, same-profile reopen, replacement facade, unmount and explicit cancellation cannot publish an old result. A late response from a cancelled job cannot release a newer job's busy ownership. Status keys, runtime error codes and numeric result values are retained semantically, so locale changes resolve fresh display text without a new inspection.

The source preserves `ReleaseEnabled: 0`. It makes no changes to active audits 184–186 or optional audits 224–232, native providers, deployment, release trust or financial execution.

## Verification scope

The final source passed 31 focused UI cases and 22 adjacent locale, Settings and route cases, with zero skipped or cancelled tests. Five focused cases execute the maintained AppServices and AppRuntime with a controlled Worker reply port; the remaining cases use controlled facade responses or static rendering. All handler tests execute the maintained component and locale code with controlled React hook scheduling. The complete draft marker catalog is fixture display text, not a reviewed translation.

These tests establish the bounded component/facade/runtime behavior described here. They do not establish native browser event reachability, native Worker storage/crypto behavior, a native retention provider, chain truth, financial readiness, deployment readiness or production translation approval. No browser suite, full repository suite, native financial test or remote operation was run by this UI task. Backend/storage verification is recorded by the separately owned backend evidence.

| Check | Result |
| --- | --- |
| Focused retained component/UI tests | 31/31 pass |
| Adjacent locale source/runtime, Settings rendering and routes | 22/22 pass |
| UI TypeScript check against the actual backend export | Exit 0 |
| Import boundaries | Exit 0 |
| Full whitespace check over base through frozen backend/UI source | Exit 0, no path exclusions |
| Full whitespace check including staged evidence | Exit 0, no path exclusions |

### Preserved first attempt

The first focused run reported 13 passes and 18 failures. Every failure came from the test's expected-count helper passing a host-realm values object into the strict VM-realm locale formatter. The maintained panel already constructed its values in the correct realm. The assertion was changed to call the maintained `messages.retentionCounts` scalar adapter. No production lifecycle behavior was changed to resolve this fixture error. The original TAP output and complete pre-correction UI source patch are retained losslessly. A separate requested copy simplification was completed before the source freeze.

The first typecheck ran on the pre-freeze UI working tree atop the local backend cherry-pick and passed. The final checks ran on the frozen source commit named above. Each final command receipt includes the source commit, source tree and SHA-256 of all four UI source/test files. Runtime: Node `v24.22.3`; dependency versions were unchanged.

## Raw artifacts

Every command's combined stdout/stderr is preserved byte for byte in its gzip file, including the failed first attempt and empty successful output. Per-command JSON records retain argv, timestamps, exit code, byte counts and both hashes. `manifest.json` groups the identities and artifact receipts. Gzip output is deterministic with timestamp zero. Every retained gzip was decompressed and both SHA-256 values recomputed before handoff.

| Artifact | Raw bytes | Raw SHA-256 | Gzip SHA-256 |
| --- | ---: | --- | --- |
| `01-retention-preview-ui.log.gz` | 23541 | `d3e131e75a6a0d9b37729b258ca7c1782e0f0dd59e7c1cd67486f8b0bd0ce7c6` | `7345c42173690823802e6891cc6013651c0e1cd53fb036fcd28cfe75366296b7` |
| `01-source-before-fixture-correction.patch.gz` | 40297 | `b33386bed4243fe117968fef64d886450e73765764c8ff42b4ec9e9b5039badc` | `c2005f53ae2cbfb28e813bf8a19de84c4a9227d9a3b683c734b0bed4f10919c4` |
| `02-ui-typecheck.log.gz` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `f61f27bd17de546264aa58f40f3aafaac7021e0ef69c17f6b1b4cd7664a037ec` |
| `03-retention-preview-ui.log.gz` | 7210 | `6d9cb24af3d256d1b4e65aeb7eb2e7158266d80ac4f06f572d45afbf45f48a8c` | `60ef2b3ba5bd8faa084f6171aa9cd9600126ccf0ca623254cebae5f763098053` |
| `04-settings-locale-adjacent.log.gz` | 5905 | `043ed05997b980e9509941934d0d33b2731e8d72d01e5592b3307080163754b3` | `3010a8a51ccac94cc38a489d7c37d667f917ccb284c8f3216199f3f9fda5526a` |
| `05-frozen-ui-typecheck.log.gz` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `f61f27bd17de546264aa58f40f3aafaac7021e0ef69c17f6b1b4cd7664a037ec` |
| `06-import-boundaries.log.gz` | 160 | `0b2551a58aa1f3a155b21de2e4771b9b2c5e2cee91e0fd866c5fffaa158a9cbd` | `f3b98c6f6522852ed46d8c9e94ad8ce0d31f10990c876a0aa42f4eb79c1ca093` |
| `07-full-whitespace.log.gz` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `f61f27bd17de546264aa58f40f3aafaac7021e0ef69c17f6b1b4cd7664a037ec` |
| `08-source-and-evidence-whitespace.log.gz` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `f61f27bd17de546264aa58f40f3aafaac7021e0ef69c17f6b1b4cd7664a037ec` |

## Reproduction commands

Run from the repository root with the unchanged physical dependency installation:

```bash
node --import ./scripts/test-support/register-tsx.mjs --test --test-reporter=tap apps/web/test/retention-preview-ui.test.mjs
node --import ./scripts/test-support/register-tsx.mjs --test --test-reporter=tap apps/web/test/locale-source.test.mjs apps/web/test/locale-runtime.test.mjs apps/web/test/panels-misc.render.test.mjs apps/web/test/ui-routes.test.mjs
node_modules/.bin/tsc -p apps/web/tsconfig.ui.json --noEmit
node scripts/check-import-boundaries.mjs
git diff --check 76d107e4e0ca1a2533636a6057d9d603861668e1..0d1d929d8bfb97b9772f84eb5fa3425de6fd3602
```
