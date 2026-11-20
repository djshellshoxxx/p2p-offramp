# Independent generation 24 native update/runtime fixture review

## Result and exact source

**No actionable standards or specification finding remains in the frozen six-file fixture delta.** Independent build-only qualification passed, and the focused Node selection passed **46/46 distinct cases** with no failures, skips, cancellations or todos. **The six native-browser scenarios were not run by this reviewer.** The coordinator reported a managed Unix-socket policy block; the reviewer made no browser launch or bypass attempt. Native Worker and native IndexedDB execution remain an applicable integration gate.

| Checkpoint | Exact identity |
| --- | --- |
| Published-parent source supplied for this review | `477777dc152cd3148ba7f25a75ce8f00dc1b03b5` |
| Reviewed and executed source | `bc330e07b1cad13490bb5b1880f89c55e952f97e` |
| Reviewed complete tree | `bbd84440104f8ae08617a4980bf5970e89cd6aa2` |
| Review branch | `codex/native-update-runtime-review-g24-20261120` |
| Node / npm | `v24.22.3` / `11.19.1` |

The reviewer created an isolated worktree directly at the frozen source and physically copied its dependencies. Source and tree identities and the absence of tracked changes were asserted before every captured command. The source is a direct child of the supplied parent, so the recorded three-dot review comparison and the executed parent-to-source comparison cover the same delta. The [machine-readable receipt](independent-native-update-runtime-review-generation24.json) binds commands, timings, exit codes, source file hashes and the raw logs.

## Standards

**Findings: 0.** The implementation follows the maintained browser-fixture pattern and introduces no production adapter, protocol operation or dependency. The reviewed delta is exactly:

- [update-runtime-browser.ts](../../scripts/fixtures/update-runtime-browser.ts), the native composition fixture;
- [update-attempts.ts](../../scripts/fixtures/update-attempts.ts), its bounded result-correlation helper;
- [test-update-runtime-browser.mjs](../../scripts/test-update-runtime-browser.mjs), artifact preparation and Chromium runner;
- [update-attempts.test.mjs](../../scripts/tests/update-attempts.test.mjs), six correlation cases;
- [package.json](../../package.json), one new browser command and the helper appended to the existing tooling selection;
- [vault-foundation.yml](../../.github/workflows/vault-foundation.yml), one additive step in the existing Chromium job.

All **2,702 parent entries outside the two modified command/workflow files** retain their exact Git mode, type and object identity; the parent contains 2,704 entries in total. The other four files are additions. The source-entry comparison found no production, dependency-lockfile, trust, origin, release-policy or default-activation modification. Restoring the two package-script edits yields the original package object. Removing the single new four-line workflow step yields the original workflow bytes. Existing jobs and assertions remain present.

The attempt ledger admits a frozen pending snapshot synchronously, owns each promise, and attaches success and rejection handlers immediately. There is no public completion setter, caller-selected ID or reusable last-result field. IDs are never reused, and total admission is capped at 32. Tests cover stale results, pending state, out-of-order and late completion, synchronous throws, polled-only rejection, invalid IDs, stable promise identity and the admission cap. The direct `node --test` invocation also passed, matching the loader mode used by the new browser command.

The Worker wrapper forwards original command objects and retains the exact native response data. A held response must match **operation, requestId and generation** captured from its actual dispatched command. The wrapper changes delivery timing only. Releasing an empty gate is an error, a duplicate held reply is an error, and the fixture never constructs a success response. The wrapper bounds response gates and recorded Worker events.

Cleanup is explicit at each level: held responses are released, the controller drains, AppServices disposes, Worker listeners are removed, and the Worker terminates. The IndexedDB row observer closes its independent connection on completion and error, including synchronous transaction/object-store failures; that catch attempts to abort an allocated transaction before closing. The runner closes each isolated browser context and has nested browser/server cleanup. Temporary build output and the TypeScript AST API are closed in `finally` paths. Browser waits use a 30-second default timeout; maintained runtime and updater limits remain in place. No actionable resource-handling or readability issue was found in this bounded test-only scope.

## Specification

**Findings: 0 in the assigned fixture scope.** The source was checked against the [G22–G23 handoff](CONTINUATION_GENERATIONS22_23_20261120.md), the [updater contract](../../packages/security/README-UPDATES.md), and the [G15 origin/update policy](../../00_PLANNING_AND_THREAT_MODELING/feature_0.3_system_integration/module_0.3.3_release_distribution/spec-ipfs-origin-and-update-policy.md).

The composition binds `backup: { capture: services.captureBackupSelection }` directly. It uses maintained AppServices, AppRuntime, the actual default-build `vault.worker.ts` artifact, the encrypted vault/backup implementation, update controller, transport policy and release/locator signature verification. Build preparation resolves and hashes the exact default Worker output. The browser fixture is designed to execute that module Worker against native encrypted vault IndexedDB; this review's build-only run did not execute either native surface.

The following are **assertions reviewed in the six native scenarios**, not native execution results:

| Scenario | Meaningful expected assertions |
| --- | --- |
| Missing proof / export only | Two distinct acceptance attempts each perform a fresh Worker check and refuse with `BACKUP_REQUIRED`; export reports `not-checked`; no floor, lock, wallet disconnect or destination occurs. |
| Verified success | Exactly two fresh checks surround the floor write; the full request/reply, disconnect, lock, destination and release order is asserted; ciphertext is unchanged; a consumed candidate cannot navigate twice. |
| Persisted mutation | Maintained `saveTermsReview` commits a real vault revision change between checks; the independent native-row observer requires revision +1 and changed envelope hash; acceptance refuses and retains the written floor. |
| Held own-lock acknowledgment | A previous failed attempt remains complete while the new attempt stays pending; the public locked snapshot is insufficient; only delivery of the genuine matching lock response completes acceptance. |
| Cancellation / drain | Cancellation returns `CANCELLED` while the wallet lease remains held and a new check is `BUSY`; releasing the genuine late acknowledgment drains and releases once without destination observation or floor rollback. |
| Competing admitted opening | The genuine lock reply is delivered first, then reopening is admitted synchronously before the old continuation resumes; the old acceptance refuses, the actual successful opening response is held and then released, and the retained floor produces no destination. |

The outer runner checks scenario names, exact attempt IDs and result codes, native check/lock counts, floor-write counts, revision/ciphertext changes, pending/drain/opening observations and destination counts. It requires one Worker URL equal to the prepared default artifact. Its browser-surface checks require an unchanged page URL, zero wallet prompts, no local/session/cache/service-worker entries and only the vault database. Network routing admits only explicit same-origin fixture assets and rejects other requests and WebSockets. These assertions have observable failure conditions and do not replace backup verification with a readiness boolean.

HTTP bytes and route registry, accepted floor, wallet lease, owner gesture, destination observation, release time and reply delivery scheduling are controlled ports. Synthetic signing keys remain in the Node fixture; only an explicit public corpus is serialized. The accepted floor is a controlled store, and navigation is an observer. The fixture does not qualify native accepted-floor durability, actual origin transition, physical wallet/provider behavior, browser activation, production trust, IPFS availability, device support or release acceptance. Those boundaries are represented explicitly in the runner output. `ReleaseEnabled=0` remains unchanged.

## Independent execution

The strict fixture and focused selection ran concurrently at the exact frozen source. A direct helper invocation then verified the unregistered Node loader path used by the npm browser command. The six helper cases are a repeated subset of the focused selection and are not added to its 46 distinct cases.

| Command | Actual result |
| --- | --- |
| `node scripts/test-update-runtime-browser.mjs --build-only` | Passed; strict fixture compilation, 37 reachable fixture modules, exact Worker hash and all three default graph checks. No server or browser launcher is called on this branch. |
| `node --import ./scripts/test-support/register-tsx.mjs --test scripts/tests/update-attempts.test.mjs apps/web/test/runtime-backup-selection.test.mjs apps/web/test/update-runtime-composition.test.mjs` | 46/46 passed: 6 helper, 28 runtime lease and 12 maintained composition cases. |
| `node --test scripts/tests/update-attempts.test.mjs` | 6/6 passed, overlapping the selection above. |
| `git diff --check 477777dc152cd3148ba7f25a75ce8f00dc1b03b5 bc330e07b1cad13490bb5b1880f89c55e952f97e` | Passed; empty output. |
| `git diff --name-status 477777dc152cd3148ba7f25a75ce8f00dc1b03b5 bc330e07b1cad13490bb5b1880f89c55e952f97e` | Exactly the six reviewed files. |

The build-only branch compiles and inspects artifacts before the explicit conditional dispatch to the native runner. Browser binary resolution, server startup and `chromium.launch` occur only inside `runUpdateRuntimeBrowser`. Its preparation receipt reports `nativeExecuted:false`. The complete native command was deliberately not run under the coordinator-reported environment restriction. No full suite or unchanged long financial journey was repeated for this test-only delta.

The emitted Worker was `assets/vault.worker-BFynfgnx.js`, SHA-256 `a872b4c6d91e8a8b2178561bdf8a9e1b03035199cca98ad3374f6fe4fc87d044`. The reachable fixture-module digest was `b26c6c3fbac298902bb2c3c345d25ce7a1bc4b5298864d3179a7eec1ea157c28`. Default application graphs excluded the executable updater and retained `ReleaseEnabled=0`:

| Default graph | Modules | SHA-256 |
| --- | ---: | --- |
| `core-graph-document.json` | 95 | `45f1f07f356ba6316a6e6474f77610dceffa94e5a0ad31bd5b53b5ad6e0671c4` |
| `core-graph-worker.json` | 30 | `d57812e5fd8080fd2df700f03998b30a9adad4228629b80e49089c783c800834` |
| `qr-graph-worker.json` | 4 | `2ac8e09215fa502063726b0e10c0091585dd710c9b507d9bbadaa142036e53ce` |

The build-only run's public-corpus digest is retained in the JSON receipt. Its ephemeral signer makes that corpus run-specific; it is not a deterministic build artifact or production key.

## Retained evidence and remaining gate

All logs below are the exact captured combined stdout/stderr bytes, copied without filtering. The empty whitespace-check log is intentional. The receipt retains the exact argv, working directory, frozen source/tree, start/end timestamps, duration, exit code, byte count and SHA-256 for each command. This evidence covers reviewer executions after the freeze; it does not reconstruct pre-freeze development output.

| Raw log | Bytes | SHA-256 |
| --- | ---: | --- |
| [build-only.log](evidence/native-update-runtime-review-generation24/build-only.log) | 2,194 | `e890a8684b67b54082d87515d94bc33d8ca56c37f118980831ad0ee10c5880fa` |
| [focused-tests.log](evidence/native-update-runtime-review-generation24/focused-tests.log) | 4,854 | `82fbd041fb47b40c275f2f95d99176cd905e56642d40ecb580438e6528da0d03` |
| [helper-direct.log](evidence/native-update-runtime-review-generation24/helper-direct.log) | 641 | `ec3c375a8427abc197ab0a93cfdc5329b486ba5b37728de4fbe2d751c6aac59c` |
| [diff-check.log](evidence/native-update-runtime-review-generation24/diff-check.log) | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| [source-diff.log](evidence/native-update-runtime-review-generation24/source-diff.log) | 222 | `5236ec9e1f9aced005322d212fca172fa53c6d3cee7d43ae7c7faadf6b5e2af6` |

The review adds only this report, its JSON receipt and these raw logs. No reviewed source file or remote branch/PR was changed. The required next qualification is execution of the six native scenarios on the exact proposed integration source in an allowed Chromium runner, with its actual source and results retained. This source review and local build/Node success do not substitute for that gate.

Standards: **0 findings**. Specification: **0 findings within the assigned fixture scope**. Native-browser execution: **blocked locally and pending**.
