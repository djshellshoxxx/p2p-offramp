# Generation 24 — native update-runtime fixture preparation

## Result and exact source

The next native qualification fixture is implemented and its bounded local
preparation checks pass. **Native Chromium execution is pending.** No browser was
launched locally because the managed environment prohibits the required Unix
sockets. The passing preparation receipt explicitly reports `nativeExecuted:
false`; it does not stand in for a hosted browser result.

| Checkpoint | Exact identity |
| --- | --- |
| Published generation22/23 base | `477777dc152cd3148ba7f25a75ce8f00dc1b03b5` |
| Frozen generation24 source | `bc330e07b1cad13490bb5b1880f89c55e952f97e` |
| Frozen complete tree | `bbd84440104f8ae08617a4980bf5970e89cd6aa2` |
| Author branch | `codex/native-update-runtime-g24-20261120` |

The source changes six files. Four new files provide the browser fixture,
runner, bounded attempt ledger and six focused ledger tests. `package.json` adds
the browser command and includes those tests in the existing tooling command.
The existing Chromium job receives one additive step. Of the base's 2,704 tree
entries, 2,702 retain their exact mode, type and object ID; only the workflow and
package script entries change, and four files are added. No entry is removed.

Production source, dependencies, lockfile, default updater construction, trust
inputs and build profiles are unchanged. This report, the
[machine receipt](native-update-runtime-generation24.json), replay helper and
compressed outputs are a separate documentation follow-up to the frozen source.

## Requirement and the specific evidence gap

The [G15 origin/update policy](../../00_PLANNING_AND_THREAT_MODELING/feature_0.3_system_integration/module_0.3.3_release_distribution/spec-ipfs-origin-and-update-policy.md)
requires verified backup and an explicit locked/disconnected transition.
The [current updater contract](../../packages/security/README-UPDATES.md)
requires two fresh Worker/storage checks around the accepted-floor advance,
followed by controlled wallet disconnect and the exact acknowledged own lock.

[Generation23](UPDATE_RUNTIME_COMPOSITION_GENERATION23_20261120.md) already
qualifies that composition with the maintained services, runtime, Worker
endpoint, controller, transport policy and complete release verification. Its
Worker delivery and vault persistence are an in-process port and an in-memory
store. The existing
[native backup UI fixture](../../scripts/test-backup-verification-browser.mjs)
exercises authentication, recheck, lock/reload clearing and restore with the
actual app and Worker, but does not construct the update controller or capture
the new owned selection lease.

The new fixture targets that specific execution boundary. It directly binds:

```ts
backup: { capture: services.captureBackupSelection }
```

No new production adapter is needed. It does not calculate ownership from
`selectionScope()` or import a backup receipt as authority. The historical
updater harness and its adapter remain outside this work.

## Fixture assembly and controlled ports

[update-runtime-browser.ts](../../scripts/fixtures/update-runtime-browser.ts)
imports current `AppServices`, the real update controller and the maintained
transport/signature implementation. The Node runner compiles the document-side
fixture strictly and follows actual emitted JavaScript imports with the installed
TypeScript AST. Only 37 reachable fixture modules are served.

The unchanged `buildWeb()` produces the default artifact. The fixture creates
an actual module Worker from that artifact's exact vault Worker asset through
the existing `createWorker` seam. That Worker instantiates the maintained
encrypted vault and backup services with native IndexedDB. The document's row
inspection uses a separate read-only native connection and returns public
revision/identity plus a hash of encrypted-envelope bytes, never private records.

The existing synthetic locator/release generator runs only in Node. An exact
allowlist serializes its public verification key, signed locator/manifest
envelopes and asset bytes. The ephemeral private signer is never exported to the
browser. The configured controller still performs full maintained verification;
no successful proof, backup flag or protocol response is fabricated.

The HTTP bytes and route registry, accepted floor, wallet lease, gesture,
destination observer and release clock are controlled fixture ports. The
destination callback records a verified URL without navigating. A delivery
wrapper can hold a genuine native response only when its operation, request ID
and generation match the selected command. It forwards the real response data
without replacing or approving the result.

Each scenario uses a fresh browser context. The runner applies the existing
loopback conventions: exact asset routes, no external connection permission,
blocked service workers, unchanged standard browser timeout, and assertions
against unexpected HTTP/WebSocket use, wallet calls, browser errors or dialogs.
Controller drain, held responses, services, Worker, transport, browser contexts,
server and temporary artifacts all have explicit cleanup paths.

## Native assertions implemented; execution still pending

| Scenario | Assertions to execute in hosted Chromium |
| --- | --- |
| Missing and export-only proof | Two separately identified attempts each fail with `BACKUP_REQUIRED`; export does not establish verification; no floor, disconnect, lock or destination effect occurs. |
| Verified acceptance | Actual-file authentication precedes two fresh native Worker checks. Exact order is check 1, floor write, check 2, disconnect, own lock acknowledgment, destination observation. The encrypted vault row stays unchanged and the consumed candidate cannot replay. |
| Persisted vault mutation | A normal maintained saved-review operation advances the actual encrypted IndexedDB revision between checks. The second check refuses, the controlled floor remains recorded, and no lock or destination follows. |
| Held own-lock acknowledgment | A completed earlier failed attempt remains separately addressable while the new attempt stays pending. Public locked state cannot complete acceptance; releasing the genuine matching acknowledgment permits the current transition. |
| Cancelled held lock | Logical cancellation preserves the floor while the actual lock call still drains. A new check remains `BUSY`; delivering the late acknowledgment releases the controlled wallet without destination observation. |
| Admitted competing opening | The actual lock acknowledgment is delivered before an opening is synchronously admitted. The old continuation fails with the maintained `UNAVAILABLE` mapping; the opening's genuine held reply cannot resume the old destination observation. |

The [attempt ledger](../../scripts/fixtures/update-attempts.ts) gives both the outer
scenario and every acceptance a fresh, bounded identity and an owned promise.
The six [Node tests](../../scripts/tests/update-attempts.test.mjs) verify pending
admission, prior-result isolation, out-of-order completion, rejection handling,
unknown IDs, stable owned promises and the 32-attempt limit. There is no sticky
`lastAccept` oracle. This addresses the harness result-oracle requirement
identified by the [generation10 report](SECURITY_REVIEW_UPDATER_COMPOSITION_GENERATION10_20261120.md).

## Executed bounded checks

All eight executions below ran against the exact frozen source and exited zero.
The receipt records their commands, source/tree, UTC starts, durations, counts,
raw/compressed lengths and SHA-256 hashes. Gzip decompression was verified
byte-for-byte against the retained original output.

| Check | Result | Retained output |
| --- | --- | --- |
| New browser command with explicit `--build-only` | 6/6 ledger tests; strict fixture emit, reachable module graph and default artifact preparation pass; native execution false | [build-only.log.gz](../execution/native-update-runtime-generation24-20261120/build-only.log.gz) |
| Existing runtime lease, current composition and updater selection | 59/59; no failures or skips | [selection-composition.log.gz](../execution/native-update-runtime-generation24-20261120/selection-composition.log.gz) |
| Type check | All four existing TypeScript projects pass | [typecheck.log.gz](../execution/native-update-runtime-generation24-20261120/typecheck.log.gz) |
| Import boundaries | 241 production files; 148 core-entry graph modules; pass | [boundaries.log.gz](../execution/native-update-runtime-generation24-20261120/boundaries.log.gz) |
| Build policy | 58/58; no failures or skips | [build-policy.log.gz](../execution/native-update-runtime-generation24-20261120/build-policy.log.gz) |
| Existing tooling, including new ledger tests | 50/50; no failures or skips | [tooling.log.gz](../execution/native-update-runtime-generation24-20261120/tooling.log.gz) |
| Unchanged demo build isolation | Demo build passes; executable updater excluded from document/vault/QR graphs; `ReleaseEnabled=0` | [demo-isolation.log.gz](../execution/native-update-runtime-generation24-20261120/demo-isolation.log.gz) |
| Complete base-to-source whitespace check | Pass | [whitespace.log.gz](../execution/native-update-runtime-generation24-20261120/whitespace.log.gz) |

The six helper tests also appear in the 50-test tooling result; those counts are
not added as unique coverage. This author slice did not rerun the full project
suite or any native financial workflow. Combined-source qualification belongs
to the integrating candidate.

The [demo replay helper](../execution/native-update-runtime-generation24-20261120/demo-isolation-check.mjs)
can be run with Node from the repository root at the frozen source. It also
asserts no change under `apps/web`, `packages`, `contracts` or `package-lock.json`
relative to the published base.

### Exact prepared artifacts

| Artifact | SHA-256 or inventory |
| --- | --- |
| Reachable compiled fixture module inventory | `b26c6c3fbac298902bb2c3c345d25ce7a1bc4b5298864d3179a7eec1ea157c28` — 37 modules |
| Default emitted vault Worker | `assets/vault.worker-BFynfgnx.js`; `a872b4c6d91e8a8b2178561bdf8a9e1b03035199cca98ad3374f6fe4fc87d044` |
| Default document graph | `45f1f07f356ba6316a6e6474f77610dceffa94e5a0ad31bd5b53b5ad6e0671c4` — 95 modules |
| Default/demo vault Worker graph | `d57812e5fd8080fd2df700f03998b30a9adad4228629b80e49089c783c800834` — 30 modules |
| Default/demo QR Worker graph | `2ac8e09215fa502063726b0e10c0091585dd710c9b507d9bbadaa142036e53ce` — 4 modules |
| Demo document graph | `80f56c4d303f6f7f3b33864ed10731074d642bfe0c2e4071d446fc2c67ab1baa` — 97 modules |

Both ordinary build profiles exclude `release-update.ts`, its HTTP reader and
the accepted-store implementation from their executable document/Worker/QR
graphs. The additional controller imports exist only in the isolated test
fixture. The receipt includes the exact public synthetic-corpus hash for this
execution; fresh runs intentionally generate another ephemeral signing key.

## Preparation failure and correction

The first build-only invocation failed after compilation and default artifact
creation because an initial text regex mistook an intent-journal data string
containing `import` for a module import. A diagnostic rerun identified that
specific false match. The corrected source follows actual JavaScript imports
with the repository's installed TypeScript AST convention and passes.

These were harness-preparation failures, not native browser failures or product
defects. The original scratch output was overwritten by subsequent runs. The
[retained failure file](../execution/native-update-runtime-generation24-20261120/preparation-failure-excerpts.txt.gz)
therefore contains explicitly labeled exact error excerpts returned by the tool,
not a claimed complete original log. The frozen corrected execution has its
complete output retained separately above.

An author-scope read-through also found synchronous native IDB transaction/setup
errors could leave the inspection connection pending until context teardown.
The fixture now closes that connection and rejects deterministically; no
production code changed. The separate independent frozen-source review is not
represented as a native execution result by this report.

## Hosted gate and remaining limits

The new `test:update:runtime:browser` command first runs the ledger tests, then
prepares and executes the native fixture. The existing Chromium job supplies
its existing browser path. Its new additive step is **Verify native
backup-selection lease and controlled updater composition**. Existing backup
tests, the Firefox/WebKit matrix, browser flags, operation bounds, and prior
assertions are unchanged. The build-only path cannot silently substitute for
that CI step.

Even a successful hosted run would establish native Worker delivery and native
encrypted-vault persistence for this bounded composition. It would not establish
native accepted-floor durability, physical wallet quiescence, trusted browser
activation, actual origin transition, destination startup, cross-origin storage
isolation, changed-origin restore, production trust integration or release
acceptance. Those remain separate G15 and integration obligations. Default
updating remains unconfigured and `ReleaseEnabled` remains zero.
