# Independent optional proof-jobs review — November 19, 2026

## Verdict and exact scope

**PASS for isolated source recovery and public resource conformance. No open High or Medium finding was identified.** This source was authored by another worker. The preserved dedicated hosted browser gate must still qualify the published integration head; no production proof provider is admitted by this review.

| Reference | Exact value |
| --- | --- |
| Reviewed final head | `92d687750062f5b3a68c52a9476eccdcf37b5cdd` |
| Reviewed final tree | `8a9afccdf3e50f9920b40fee00909895529b14da` |
| Integration base | `ac9a4b0ffc3ca50a299398e72554e7964a634cd4` |
| Original PR #162 source | `8decf7f95fd5deb17f814b80deb34f2903fe8e14` |
| Exact extraction checkpoint | `4fbc7feb900ae98cd02c3c3339606386b215ad09` |

The review read all five `src` modules, the public facade, the public-resource Worker, protocol/supervisor tests, native memory probe, real-App fixture, browser harness and dedicated workflow. The three-dot diff against the pinned base was checked against the G29 resource-budget, Worker bridge and session-lifecycle specifications, with the README's explicitly limited public conformance scope. D7 permits this one-package source extraction; it does not enable a default application feature.

All execution used a separate detached verification worktree at the final head with physical in-checkout dependencies. The author's worktree and production source were not modified. This report is the only change in its review commit.

## Standards

No documented-boundary or coding-standard violation requiring repair was found. All 18 package files and the dedicated workflow are byte-identical to the original source. The complete extraction changes 21 paths: those files, three necessary scripts in root `package.json`, and the author's report. Dependency fields and the package lock are unchanged. All prior scripts and all six existing workflows remain byte-identical; the dedicated workflow is additive.

The apparent direct diagnostic reads in `value()` and the supervisor consume fixed `CoreResult` objects produced by `checked()` around `parseBudget`, `parseWorkerReply` and `copyJobBytes`. They do not unwrap an injected provider's failure wrapper. A separate reviewer probe threw an object containing private diagnostic accessors from hostile input reflection at each of those three parsing boundaries. All returned newly constructed `INVALID_INPUT` failures, executed zero diagnostic getters, and leaked no private text. No equivalent returned-vault diagnostic repair is necessary here.

Byte admission uses native typed-array accessors, bounds the logical view before allocating an owned copy, and refuses shared/detached backing stores. Received messages are strictly shaped, identity-checked and counted; result copies remain bounded and unverified. Cleanup clears owned buffers, listeners and timers, while later malformed or stale results cannot publish into another job.

## Spec

No deviation requiring repair was found within the declared provider-independent slice. The public facade has no registration/configuration path: its frozen provider registry is empty and every request returns `UNSUPPORTED_PROVIDER` without touching consent, private input, a collector or a Worker. The constructor-owned internal runner accepts public conformance bytes and does not verify proofs, mint receipts or establish custody authority. Outputs fix `proofVerified:false`, `receiptAuthority:false` and `economicPreparationAllowed:false`.

The runner preserves the G29 ceilings: 1 MiB input, 2 MiB result, 120-second wall deadline, 15-second heartbeat, 256 received messages and one shared document-local job with no queue. Constructor limits can only tighten the supported limits. Scope parsing detaches immutable bindings; opaque consent is single-use and issuance is invalidated by reentrant cancellation, resume or disposal. Admission is reserved before collector/owner/factory callbacks. Every progress/result path rechecks elapsed time, so delayed watchdog dispatch cannot renew an expired job.

Logical cancellation and physical completion remain separate. Ignored collection retains admission until its promise drains. Worker termination must return a real Promise that fulfills with `undefined`; void, thenables, non-void fulfillment, throws or rejection cannot release the shared slot. The acknowledgement is a trusted port contract, not proof supplied by a Worker message. `dispose()` waits for physical drain. Standard browser `Worker.terminate()` alone cannot fulfill this contract, and the source correctly makes no standard-browser physical-close deadline claim.

There is no provider/network driver, actual proof artifact, circuit, notary, verifier or trust-root selection. The Node memory fixture constrains one public WASM module, and browser WASM remains an unsupported path under the unchanged CSP. Network-accounting, mobile feasibility and real cryptographic-provider qualification remain separate gaps. These explicit limits are not replaced by success-shaped stand-ins.

## Dedicated gate preservation

The original `optional-proof-jobs.yml` retains package/workflow path triggers for pull requests and main pushes, a nightly schedule and manual dispatch. It uses pinned Actions, `contents: read`, credential persistence disabled, `npm ci --ignore-scripts`, the dedicated two-project typecheck, actual Node WASM probe and Chromium browser command. It introduces no deployment, secret or write-permission step.

The Worker and real-App fixture TypeScript configs are necessary because those graphs differ from the maintained generic source checks. Their root command still compiles both. The browser fixture composes the actual App and custody Worker only within the package's test graph; the default App does not import this package. Current UI labels referenced by the harness are present in the maintained English locale.

The browser harness checks actual bundled module provenance and the unchanged offline policy, rejects external requests/WebSockets, and provides a test-only native-exit observer. It requires a unique exact observed Worker URL, the correct page-owned CDP target, both Worker close and target destruction, and rejects forged/unobserved URLs. The fixture reports outcomes after that drain while separately retaining logical cancellation timing. Its 100 closure waits of 20 ms are unchanged. The backup flow downloads a non-empty actual export; it explicitly does not claim backup re-verification. This is source inspection, not fresh browser execution.

## Independently executed evidence

Environment: Node 24.22.3, npm 11.19.1. No complete repository baseline, Chromium execution or local socket-policy bypass was performed.

| Check | Observed result |
| --- | --- |
| `node --import ./scripts/test-support/register-tsx.mjs --test packages/proof-jobs/test/*.test.mjs` | 30/30 passed; no failures/skips/cancellations |
| `npm run typecheck:proof-jobs` | Dedicated Worker and real-App fixture configurations passed |
| `npm run test:proof:memory` | Actual Node Worker/WASM: 65,536 initial bytes; 268,435,456 maximum bytes; further growth refused; zero imports |
| Independent hostile diagnostic-origin probe | 3/3 boundaries reconstructed fixed errors; zero private getter calls |
| `npm run check:boundaries` | Passed: 240 production files, 140 core modules |
| Original package/workflow and maintained-root comparisons | Passed |
| Exact-head diff whitespace check | Passed |

The memory module digest is `c834f277a5fac1646aad76810a65d523046ffa04f0c985bf987695fbbd6bcbed`. Its linear-memory result does not qualify browser WASM, total process memory, device peak memory or a proof provider. The package tests exercise malformed termination acknowledgement, retained physical admission, ignored collectors, consent reentry, delayed heartbeat/deadline dispatch and absence of authority imports.

The author's four maintained typechecks and byte-identical default artifact are recorded in `OPTIONAL_PROOF_JOBS_20261119.md`; they were not relabeled as reviewer executions. Original-head hosted results remain historical, and fresh exact-head CI, including the dedicated browser job, remains an integration gate.

## Evidence digests

| Reviewer log | SHA-256 |
| --- | --- |
| `independent-proof-jobs-package.tap` | `f7583dbee0b70eecbadffc7878275916a17f219014b31d4b3d98d95d9db420f0` |
| `independent-proof-jobs-typecheck.log` | `01003589ca24dff5de5e5b62865f20ccb201f4b2a147d91fe1299cd36dfacfb0` |
| `independent-proof-jobs-memory.log` | `c23b861046b8c4db97b176c6021d6defd6cc8163dd0f3a89be90a2536e8cf805` |
| `independent-proof-jobs-diagnostic-origin.log` | `766b45fc5c509587135c70f8ac64fc63549b3489806ddf02d60852086d651cd6` |
| `independent-proof-jobs-boundaries.log` | `38416e9ef2b8bc0ecf6c97064b760b6aface152afbe169ea7b41b2ef87671af0` |

Standards: zero open findings. Spec: zero open findings within the isolated public conformance source scope.
