# Independent Solana withheld-acknowledgment review — 2026-11-19

## Result and scope

**No open High or Medium finding in the reviewed fixture correction.** The independent review accepts the source change for its stated, limited purpose: withhold a transaction from the validator, complete an HTTP 503 response, retain the production client's durable unknown intent, and require finalized expiry plus a new explicit operation before a replacement can be sent.

The corrected source still requires its own hosted Chromium diagnostic and complete native Solana browser qualification. This report records no local Chromium launch, actual-validator execution, new refund-wait execution, deployment approval, or general guarantee against browser transport retransmission. The two old hosted runs remain failures.

Review completed at 2026-11-20 01:11 UTC / 2026-11-19 17:11 Pacific by the separate `solana_send_independent_review` worker. The reviewer created `codex/solana-send-independent-review-20261119` from the exact PR #190 base, copied physical dependencies into its own checkout, and tested immutable RED and repaired commits. No author's working files, remote refs, application source, or existing tests were edited. This report is the reviewer's only repository change; no new regression was necessary because no additional concrete flaw was found.

| Role | Commit | Tree |
| --- | --- | --- |
| PR #190 review base | `2b23ee614ff2dd05bd3a6e79f1278658c30a3909` | `a3701267756596e833247f50614c5ddc32f2cce0` |
| Original behavior extracted into helper; RED tests | `ab879ac7c64f9fb1f59e5ec70d9bb3fbf1ee75fd` | `9d7835636ade95516e815a02ddc061b63d25dd22` |
| Repaired source reviewed and executed | `493a6ea55b2eb332dfc8999b117fd7e817428497` | `3a1e9583b29db88ca73015e2ca35953e41378e0a` |

The spec and authority inputs were the coordinator's explicit repair assignment and the PR #200 handoff/state at `de7c385937dbed27620ab07baf1dc7210f39b700`. That dated handoff's running-job status was superseded, for this review only, by the two subsequently captured failure excerpts below. The standing merge requirement remains exact-head green CI, applicable native/browser qualification, and independent review with no open High/Medium finding. `ReleaseEnabled=0` and source-only authority remain unchanged.

## Observed failure and diagnosis limits

The reviewer inspected the saved excerpts from both actual hosted jobs:

| Old source and job | Observed sequence, UTC November 20 |
| --- | --- |
| PR #188, `a728ce290eb2fcbe9b4a9e857cc84ced401da70f`; [run 44639090596, job 135965138780](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44639090596/job/135965138780) | Duplicate signed-wire assertion at 00:16:03; fresh-key restore and explicit expired replacement checks complete at 00:17:38; real refund wait reports 1,776 seconds remaining; final retained `fixtureErrors` assertion fails at 00:47:57. |
| PR #189, `9611d6a5cb404fed5d41eeb176dafb31c01de640`; [run 44640971208, job 135971622812](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44640971208/job/135971622812) | Same duplicate signed-wire refusal at 00:29:04; restore/replacement checks complete at 00:30:38; real refund wait reports 1,780 seconds remaining; final retained `fixtureErrors` assertion fails at 01:00:54. |

Both failures reach `assertSolanaSendMarked` through the fixture's physical-send observer. The observer continues to reject a second use of an already observed signature. The old `withholdNextSend()` branch then used `response.destroy()` before providing response headers; it deliberately did not forward the first transaction to the validator. The later failure is the retained original observer error, not evidence that the refund duration was skipped.

The reviewer separately opened Chromium's [current `http_network_transaction.cc`](https://chromium.googlesource.com/chromium/src/+/HEAD/net/http/http_network_transaction.cc), observed blob `c092bbcc8d5bc696759f6c9253accf960b76e136`, and inspected `ShouldResendRequest`, `HasReceivedResponse`, and the connection-error handling. That source permits retry on a reused connection before a response is received; the inspected predicate has no request-method guard. This supports transport replay as the explanation for the empty-reset failure. It is an inference about the hosted Chrome 158.0.8127.36 execution: this review did not obtain the exact binary's source tag or a network trace proving its retry path. The new Node RED tests reproduce the missing HTTP response, not Chromium's transport internals.

## Standards review

No documented-standard violation or actionable code-smell finding was identified in the six changed files. The helper is fixture-only, shared by the native fixture and the small transport diagnostic, and has one purpose. Its fixed body, explicit byte length, preserved caller CORS headers, and `Cache-Control: no-store` produce a completed failure response without a valid transaction acknowledgment. The new test accurately labels its scripted wallet, journal, and cluster components.

There are no runtime dependency or lockfile changes, production imports of the helper, new application commands, endpoint fallback, retries, wallet authority, release authority, or source-authority changes. The added npm command is a test command. All validation described here ran with physical in-checkout dependencies.

## Spec and behavior review

### Controlled failure and durable uncertainty

The native fixture's sole behavioral change replaces the empty reset with `rejectWithheldSolanaSend(response, cors)`. It still awaits the independent marker observer, validates the exact send configuration, records the withheld attempt, and returns before the forwarding `fetch`. Neither the marker nor the signed wire is rewritten. The helper returns HTTP 503 with a fixed text body; it never returns a successful JSON-RPC signature.

The unchanged production `apps/web/src/solana-localnet/rpc.ts` performs one fetch and rejects the non-success HTTP status as `RPC_UNAVAILABLE`. The unchanged native `markAndSend` classifies that failure as `unknown` after the marker. It does not infer that a 503 proves non-broadcast, clear the marker, or permit immediate reuse of the same signed transaction. Although the fixture knows it withheld forwarding, the application retains its conservative uncertainty.

The added actual-HTTP regression exercises the production RPC implementation, composed native client, actual Ed25519 signing, and independent signed-wire oracle. On the repaired source it observes:

- One application send fetch and one physical HTTP send with status 503, zero cluster forwarding, and journal writes `prepared`, `signed`, `sendMarked`, `unknown`.
- A restored profile retaining the original signature, marker time, and origin profile. Recovery and three reconciliation passes issue no additional send.
- Expiry evidence allowing a dropped outcome without a send, followed by a separately invoked replacement using a new signature, different message, new profile provenance, and the original intent reference. The original marker and provenance remain intact.

The journal backup/restore and height advance in this focused test use the repository's existing scripted unit fixtures. They are not encrypted browser storage or elapsed real chain time. The unchanged full browser harness supplies those separate gates.

### Strict observer and native financial assertions

Byte comparisons against PR #190 confirmed no change to:

- `scripts/lib/solana-localnet-send-evidence.mjs`, including exact matching of one durable marker, profile/program/genesis pins, independent Ed25519 verification, and unconditional rejection of any previously observed signature.
- `scripts/lib/solana-localnet-browser-fixture.mjs`, including observation of the actual encrypted vault, actual module Worker, and external sign-only fixture wallet.
- `scripts/test-solana-localnet-browser.mjs`, including explicit cancellation and wallet revocation, separate release/payout actions, exact buyer principal, fresh-key encrypted restore, finalized blockhash expiry, fresh-signature explicit replacement, real refund deadline, idle lock, and seller principal minus actual transaction fees.
- All `apps/web/src`, `packages`, and `contracts` source; the dependency lockfile; and `.github/workflows/solana-escrow.yml`.

The full browser harness still requires seven observed app sends with seven unique signatures, exactly one withheld send, eight wallet prompts including the revoked prompt, and empty unexpected-request, page-error, and fixture-error arrays. Its final `fixtureErrors` assertion is intact. The Solana workflow retains both real 1,800-second minimum refund cases, the 150-minute job limit, the 50-minute validator step, and the 60-minute native browser step. No warp, reduced wait, exception allowance, retry allowance, or observer bypass was introduced.

The guarantee being exercised changes from an empty transport reset to a completed HTTP failure. The application no-resend and unknown-recovery requirements remain strict. Physical non-retransmission under arbitrary pre-header connection loss remains unqualified and is explicitly outside the new helper's claim.

### Additive Chromium diagnostic

`scripts/test-solana-withheld-send-browser.mjs` builds the actual production local RPC module and checks that `rpc.ts` and `config.ts` are present with no external or dynamic chunk imports. It serves that artifact locally, issues eight actual RPC reads, makes one application send call, and then performs a follow-up read. It independently records application calls, native fetch calls, HTTP status, server-side POST count, completed response status, and server socket identity. Acceptance requires the send to use a socket already used by a warm RPC read.

The fetch wrapper delegates to the original browser fetch and observes its response. It does not fabricate rejection or status. A second physical send records a fixture error and fails the check. The diagnostic blocks unexpected HTTP and WebSocket destinations and service workers. It has no validator forwarding capability, wallet, signed transaction, module Worker, or funds; its `validatorForwards: 0` field describes that absent capability, not a real-validator packet observation.

Its output expressly leaves `rawResetQualified`, `generalBrowserRetransmissionGuarantee`, and `nativeChainQualified` false. Independently building the diagnostic produced 4,812 bytes with SHA-256 `8e1d06fb99e221589dfdd888a8b120ac45195dc63535a39de1f000f7b835cb0a`. Building and syntax checking succeeded; the browser entry point was not invoked locally. Hosted execution must establish the warmed-connection result on the selected actual Chromium binary.

### Exact gate preservation

An independent structural comparison establishes this precise union relative to PR #190:

| Surface | Preserved | Added |
| --- | --- | --- |
| `package.json` | All 52 existing npm scripts, every prior command value, and all non-script metadata | `test:solana:ack:browser` = `node scripts/test-solana-withheld-send-browser.mjs` |
| `vault-foundation.yml` | The full original file is byte-identical after removing the one exact insertion | Four lines for one mandatory step immediately after Chromium setup, with the existing `P2P_CHROMIUM` output |
| Other workflows | `evm-escrow.yml`, `nostr-relay.yml`, `openai-agents.yml`, `solana-escrow.yml`, and `specifications.yml` are byte-identical | None |

The diagnostic has no skip or `continue-on-error` condition. The original foundation browser command groups remain after it, and the separate native Solana gate remains mandatory when triggered. Any later composition with favorites or other independently owned changes must preserve their additional commands and steps as well; this review establishes the exact Solana delta, not a future merged tree's qualification.

## Independently executed verification

Environment: Node 24.22.3, npm 11.19.1, physical copied dependencies; isolated review checkout at the immutable commits above.

| Execution | Result |
| --- | --- |
| Focused tests at RED `ab879ac7` | **0 passed / 2 failed**, zero skipped; the raw fetch fails with an empty socket response and the native case has no observed 503 response |
| Same focused tests at repaired `493a6ea` | **2/2 passed**, zero failures/skips |
| All `packages/chain-solana/test/*.test.mjs` and `apps/web/test/solana-*.test.mjs` | **334/334 passed**, zero failures/skips/cancellations; 20,664.590145 ms |
| `npm run test:build-policy` | **54/54 passed**, zero failures/skips |
| `npm run typecheck` | All four TypeScript projects passed |
| `npm run check:boundaries` | Passed; 234 production files and 140 core entry modules |
| Diagnostic bundle build and `node --check` | Passed; artifact digest recorded above; no browser execution |
| Exact preservation comparison and `git diff --check` | Passed |

The affected native tests include the unchanged duplicate-signature refusal, crash-after-marker recovery without resend, thrown/timeout/odd send outcomes remaining unknown, restored marked records, finalized height and hostile-status checks, and disposal/vault revocation before physical dispatch. The focused two cases are included in the 334 total and are not counted as additional distinct suite coverage.

Reproduction commands, run separately at their indicated commits:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test apps/web/test/solana-localnet-withheld-send.test.mjs
node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=4 packages/chain-solana/test/*.test.mjs apps/web/test/solana-*.test.mjs
npm run test:build-policy
npm run typecheck
npm run check:boundaries
node --check scripts/test-solana-withheld-send-browser.mjs
node --input-type=module -e 'const { buildSolanaRpcDiagnostic } = await import("./scripts/test-solana-withheld-send-browser.mjs"); const artifact = await buildSolanaRpcDiagnostic(); console.log(artifact.sha256);'
```

No full `npm test`, local Chromium, real-validator or native refund execution is claimed by this review. Source acceptance here does not transfer a historical hosted pass to the repaired head.

## Evidence digests

The following independent logs and reviewed hosted excerpts were retained under the session's `verification/` directory. Their content hashes bind the observations above; the report itself does not turn those excerpts into new executions.

| Evidence file | SHA-256 |
| --- | --- |
| `independent-solana-withheld-send-red.tap` | `f4af6654f46e552544bb2b578011ab8b33616d7111e8bd1ed1d6d4eab9a2e07c` |
| `independent-solana-withheld-send-green.tap` | `de44a2821ee5d657b30d470b358d0bd0b2f9a3a3f7c600e323dcf703facdd94b` |
| `independent-solana-send-affected-tests.log` | `b82a8668b9fe2faa891b1b48fe566337a4ce30f9b9e2c626ee651447d3de5c20` |
| `independent-solana-send-build-policy.log` | `eb742cbb1a6d8f8bbda2b8fffaf6c2a760c91f29ae097b8a549f968d4091a500` |
| `independent-solana-send-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `independent-solana-send-boundaries.log` | `59a6aa06bcd62b7c1e9f0529431e1941bd12f845e9d8884c86a9deee74ff3e91` |
| `independent-solana-send-preservation.json` | `1c5debbcbae175a5c3ac0d39037188992191a269cb3e1639b06d1dd9ff879fa5` |
| `pr188-solana-browser-failure.log` | `830877409ef537213d881d859234f3a169ea707fcef91e3eec0c6414ee4a169a` |
| `pr189-solana-browser-failure.log` | `4151e89930b9fff75dbf9b66eab3dfef49549d9107568b68b25993ee463dd339` |

Standards findings: **0**. Spec/implementation findings: **0**. Hosted qualification remains outstanding for the repaired source.
