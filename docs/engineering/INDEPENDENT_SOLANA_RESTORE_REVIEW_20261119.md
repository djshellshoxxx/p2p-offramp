# Independent Solana restore lifecycle review — 2026-11-19

## Verdict and exact scope

**No open High or Medium finding in the reviewed restore lifecycle repair.** The change closes the independently reproduced input-readiness race while preserving immediate private-data redaction. It also prevents obsolete file-read continuations from installing or retaining their returned byte views after the input scope has changed. The restore payload remains intact in the Worker command before the document's selected buffer is cleared.

This is a separate review from `INDEPENDENT_SOLANA_SEND_REVIEW_20261119.md`. It accepts the source correction subject to the new exact-head hosted browser and native qualification gates. No local Chromium, native Worker, IndexedDB, real validator, real refund wait, or full `npm test` execution is claimed here. No remote write, retry, cancellation, merge, deployment, release or source-authority change was performed.

The separate `solana_send_independent_review` worker created `codex/solana-restore-independent-20261119` in a new isolated checkout from the immutable repaired source and copied physical dependencies into that checkout. RED was executed on a detached immutable checkpoint, then the repaired branch was restored. The reviewer's only repository change is this report. Three supplemental probes were kept in scratch verification files; no product code, author file, or maintained test was changed.

| Identity | Commit | Tree |
| --- | --- | --- |
| Published PR #202 base | `d753c0af23ff43743e34679e6b778b9ac0370da2` | `25d637fa5d6596e44cdae060ccc407f0c23186ee` |
| Original product with four RED regressions | `3ebb2e7c4c742812858b3c542ef4387a7d5d799d` | `a3eb6a82e2be2805347b51f4ef92d078139c7979` |
| Repaired source reviewed and executed | `6207d14bf83213847620b0dd1541f2c7d2e3b893` | `75d068cc66e3138c89542550d2d6909600f1f68a` |
| Separately inspected author report | `da931533df5f77b6eaa810ac35c18659b99374cc` | Report-only successor; not substituted for the tested source |

Checks completed at 2026-11-20 01:41 UTC / 2026-11-19 17:41 Pacific. Environment: Node 24.22.3, npm 11.19.1. The authority input was the coordinator's explicit independent-review assignment, together with the previously inspected consolidation handoff/state. Source-integration authorization, `ReleaseEnabled=0`, and the exact-head CI/native/browser merge gates remain unchanged.

## Hosted observation and reproduction boundary

The reviewer read `verification/pr197-solana-restore-failure.log` from job `135987836079`. It shows release plus separate payout passing at `01:11:37.5766232Z`, the already known empty-reset duplicate-signature assertion at `01:11:38.3990201Z`, and a distinct failure at `01:12:23.9931616Z`: the Restore button remains disabled throughout a 45,000 ms click wait at the old browser harness's line 126. The browser did not reach its later refund journey in that run. The coordinator/author bind the log to PR #197 head `86952b1ccc8eb9c25a3be05d6a32d3c556df8c84` and merge checkout `3847e6f49337317a2c402e2f4eb94730959fcf12`.

The excerpt does not expose every Worker-message delivery or identify which restore field was lost. The deterministic regression establishes a component/client/controller race capable of producing that disabled-button outcome; it is not a fabricated trace of the hosted scheduling.

On RED, calling the real document client's lock operation publishes an immediately blank private projection before the actual controller response is delivered. The old component reports `aria-busy=false` and allows backup/passphrase input in this interval. Delivering the real lock response clears those newly entered fields and disables Restore. The independent run reproduced this exact witness. All three additional RED cases also reproduce returned backup buffers remaining nonzero after visibility lock, unmount, or profile opening.

The coordinator separately reported that the earlier PR #202 foundation run passed its thirteen browser groups, including the completed-503 send diagnostic, on its own source tree. That observation is not transferred to this new product and harness source. At assignment, the PR #202 full Solana job was still running and PR #190's browser step had failed; this review neither reclassified nor altered either run.

## Standards review

No actionable documented-standard violation or code-smell finding was identified. Production changes are confined to `apps/web/src/solana-localnet/SolanaLocalnetRoot.tsx`. The component owns its local request and file-read generations without moving financial or vault authority out of the existing client and controller. The native protocol, document client, controller, RPC transport, validation, chain packages, contracts, and dependency lock remain unchanged.

The regression harness accurately distinguishes render-only hook stubs and controlled Worker-message delivery from DOM or browser execution. It executes the maintained component handlers, real document client, real controller, actual cryptography and encrypted backup operations, with a memory VaultStore and zero wallet/RPC calls. The browser diagnostic is separately named and gated. No execution claim depends on treating the hook harness as React DOM, IndexedDB, or a native Worker.

## Spec and implementation review

### Pending command ownership and interruption

The component sets `pendingRequest` synchronously before invoking the existing client and includes local pending state in `aria-busy`. It therefore cannot mistake the client's immediate locked/redacted projection for a completed lock operation. Profile selection, profile passphrase, file selection, and both restore passphrases remain disabled during the pending operation.

Each admitted request owns a command generation. An older completion cannot publish an error/download or clear a newer pending state. Lock and review cancellation remain permitted to interrupt pending work. The visibility handler uses the same component request owner, so it retains immediate redaction while waiting for its own actual completion. The Worker working phase remains part of `busy`, even if an interrupt acknowledgment precedes settlement of the earlier physical operation.

Unmount marks the component inactive, advances the command generation, clears private state, disposes the client, and removes the visibility listener. The configuration-loading continuation checks activity and existing client ownership before creating a client. The unchanged document client continues to revoke wallet/private authority and cancel old jobs synchronously; these authority fences were not replaced by UI state.

An independent supplemental probe starts export, interrupts it with visibility lock, and then delivers the older actual export result before the lock response. Private projection remains blank, restore inputs remain disabled, and `aria-busy` stays true through the older completion. Only the newer lock completion clears the local pending state.

### File-read scope and refusal

Each file selection advances an input generation, clears the previous selected byte view, and captures its owning client. Its completion must still belong to the active component, current input generation and client, a locked profile, and an idle command scope. Otherwise its returned byte view is zeroed and never installed as the selected backup. Private-state clearing also clears the native file-input value. Visibility locking, profile operations and unmount invalidate pending reads.

The independent authored-case replay verifies disposal after visibility lock, unmount, and profile opening. Supplemental probes also verify that a slower older selection cannot replace a newer valid selection; the older returned buffer is zeroed while the current selection remains intact. Two immediate calls through the captured Restore handler produce exactly one restore command.

Zero-length and declared-oversized files are refused without calling their read function. A declared/returned length mismatch clears the actual returned view and leaves Restore disabled. A bounded but malformed three-byte backup reaches the unchanged controller, is refused, creates no profile, leaves the original encrypted row unchanged, and completes with the document buffer cleared. These are fixture-driven edge checks, not claims about a hostile browser `File` implementation or physical storage erasure.

### Restore payload ownership

The handler detaches the selected view from `backupBytes.current` before clearing private form state. It then invokes the existing client's request synchronously and clears its submitted document view after that call. Rejection and exceptional paths also clear the view. Source inspection confirms that the client posts inside the synchronous Promise executor and passes no transfer list.

This ordering agrees with the HTML Standard's [Worker messaging](https://html.spec.whatwg.org/multipage/workers.html) and [message-port posting algorithm](https://html.spec.whatwg.org/multipage/web-messaging.html): Worker posting delegates immediately to its port, whose serialization precedes queued delivery. The owned `ArrayBuffer` is cloned rather than transferred or shared. The independently executed ownership regression separately checks that the captured cloned command retains the exact original bytes while the document view is already zero, then completes a real cryptographic restore into a different profile through the controller.

The zeroing guarantee covers the application-owned byte views examined here. It does not claim erasure of immutable `File` contents, passphrase strings, operating-system buffers, or every runtime copy. The new hosted diagnostic is required to exercise this same ownership order with an actual native Worker.

### New browser diagnostic

`scripts/test-solana-restore-browser.mjs` builds the actual maintained Solana artifact and verifies graph inclusion of the component, client and controller. It serves those emitted assets with the maintained local content policy, creates a real Chromium module Worker, and uses real encrypted IndexedDB profiles and cryptography. Its instrumentation subclasses the native Worker and delays delivery of actual lock snapshots/results. It does not manufacture a result or replace the Worker/controller.

The gate requires immediate private redaction plus disabled restore inputs while those responses are held, then a successful intact-payload restore into a different profile and key after delivery. Independent decryption checks the restored empty profile; the original encrypted row must remain byte-for-byte unchanged. A wrapper holds one actual native `File.arrayBuffer()` result while explicit profile opening supersedes it, then verifies that the released obsolete buffer is cleared.

The test has no funded trade, validator, permitted RPC call or wallet-signing flow. Requests outside the allowed local GETs, all WebSockets, wallet calls, wallet requests, extra restore commands, disallowed command types, page errors, or unexpected worker counts fail its assertions. Its receipt leaves native-chain qualification false and release disabled. The source meaningfully separates the short profile lifecycle proof from the retained full financial proof.

The reviewer built this artifact without invoking its browser entry point: eleven emitted assets, asset-list SHA-256 `54937986dbf48ed92cb1ebf72ad1a003ba95f7283514f1ecd8f21de58201a946`, matching the author. Syntax checking also passed. No local browser was launched and no socket restriction was bypassed; actual browser behavior remains a hosted gate.

### Preserved send, financial, and CI gates

An independent exact comparison against published PR #202 establishes:

| Surface | Verified result |
| --- | --- |
| Package commands | All 53 prior commands and every prior value preserved; only `test:solana:restore:browser` added |
| Package metadata and lock | Unchanged |
| Foundation workflow | All 129 original physical lines restored byte-for-byte by removing the one exact four-line addition; new mandatory restore step follows the existing send-ack diagnostic |
| Five other workflows | EVM, Nostr, OpenAI agents, Solana escrow, and specifications files byte-identical |
| Production scope | Only `SolanaLocalnetRoot.tsx` differs under `apps/web/src`; all packages and contracts unchanged |
| Send evidence and fixture | Strict duplicate-signature oracle, durable-marker observation, 503 helper, native fixture, browser fixture, and existing transport diagnostic byte-identical |
| Full native browser harness | Exactly two stronger synchronization changes: `aria-busy === 'false'` for idle and an additional acknowledgment wait after explicit lock |

Reversing only those two harness edits reproduces the prior harness byte-for-byte. All existing transaction and signature counts, explicit cancellation/replacement checks, marker and original-profile provenance, release/payout ordering, exact principal/actual fee checks, fixture-error checks, and real refund waits therefore remain intact. The native workflow's 150-minute job limit and 50/60-minute validator/browser limits are unchanged. The new gate has no skip or `continue-on-error` condition and adds no retry or network permission.

The existing full financial gate must still run on the repaired exact source. The old send fixture review and its earlier hosted pass do not qualify this new component or the modified harness.

## Independently executed checks

| Check | Actual result |
| --- | --- |
| RED at `3ebb2e7` | **0/4 passed**, four expected failures, zero skips |
| Same four regressions at `6207d14` | **4/4 passed**, zero failures/skips |
| Complete focused suite including ownership | **5/5 passed**, zero failures/skips |
| All chain-Solana and application Solana tests | **339/339 passed**, zero failures/skips/cancellations; 22,871.308239 ms |
| Three independent supplemental probes | **3/3 passed**, zero failures/skips |
| Build policy | **54/54 passed**, zero failures/skips |
| Typecheck | All four configured TypeScript projects passed |
| Boundaries | Passed; 234 production files, 140 core entry modules |
| Actual emitted artifact build | Passed; eleven assets and matching asset-list digest, browser not invoked |
| Browser script syntax, exact preservation and diff checks | Passed |

The five focused tests are included in the 339 affected-test total. The three supplemental probes reuse the immutable regression file's maintained-component/client/controller harness with rebased imports; their additional assertions are independently authored and remain scratch verification material. They are not three new browser journeys or maintained repository tests.

Reproduction commands for the maintained tests and gates:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test apps/web/test/solana-localnet-restore-lifecycle.test.mjs
node --import ./scripts/test-support/register-tsx.mjs --test --test-name-pattern='^(immediate profile redaction|a late backup file read)' apps/web/test/solana-localnet-restore-lifecycle.test.mjs
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=4 packages/chain-solana/test/*.test.mjs apps/web/test/solana-*.test.mjs
npm run typecheck
npm run test:build-policy
npm run check:boundaries
node --check scripts/test-solana-restore-browser.mjs
```

The first command at RED gives the four expected failures; at the repaired source it executes all five focused cases. The filtered command isolates the original four on the repaired source. The artifact-only check imports `buildSolanaRestoreArtifact(outDir)` with the existing TypeScript loader, builds to a temporary directory, hashes `JSON.stringify(evidence.assets)`, and removes the temporary output without invoking `runSolanaRestoreBrowser`.

## Evidence digests

These reviewed excerpts and independently executed logs are retained in the session's `verification/` directory. They bind this review to the tested checkpoints; they do not assert a later composition's execution.

| Evidence file | SHA-256 |
| --- | --- |
| `pr197-solana-restore-failure.log` | `7ef3b69ed62c822e58ed0eafd52d392ba37cbaf3d6606a9df9f46b4a548fe3ba` |
| `independent-solana-restore-red.tap` | `b6768f72b60940b66dfaf475381fa74f2a6cc5cf24b37cba1dd74b2a7112276d` |
| `independent-solana-restore-green-four.tap` | `d4393859975d1185833e54554d91650c8e1fdb9846fcf2b9385dcef64811f887` |
| `independent-solana-restore-ownership-green.tap` | `5a964b87694133a8bde5ea92e11834c732e63329c7172cf5be8f687c82e6b441` |
| `independent-solana-restore-affected.log` | `1659f78e935a9701b211a6685bddf7ecfadbb54f0ed043ff19ff1c1cbccd3bec` |
| `independent-solana-restore-probes.mjs` | `eb490d57e630503a917b2de855ecdefc0dde7d78445f805462790cd5b146b035` |
| `independent-solana-restore-probes.tap` | `5c76b974a93054997c2bb8d7f28398de8ae37e397bddae6fb58ecfca0f1cbb86` |
| `independent-solana-restore-build-policy.log` | `b9fa33a0ea911efdbccd3e8f13afbdf8d6ad31efd6d927dc953436769f7ed39a` |
| `independent-solana-restore-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `independent-solana-restore-boundaries.log` | `59a6aa06bcd62b7c1e9f0529431e1941bd12f845e9d8884c86a9deee74ff3e91` |
| `independent-solana-restore-preservation.json` | `035443b38f611ad5413ccfae292058d6432e64fdddd883b392012661fa323513` |
| `independent-solana-restore-artifact.log` | `e237f9fe4b1b21c091078963abbb055d0d3a2e48f9394a87e779f3c7cd6fec71` |

Standards findings: **0**. Spec/implementation findings: **0**. New-source hosted profile and native financial/browser qualification remains outstanding.
