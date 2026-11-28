# Solana withheld acknowledgment fixture repair

## Result and immutable source

The intentional withheld-send fixture now completes an HTTP 503 failure after
the independent durable-marker observer has accepted the signed transaction. It
still returns before forwarding that transaction. Actual HTTP and composed
native-client regressions verify the resulting unknown outcome, preserved
marker, no automatic resend, and explicit replacement after finalized expiry.
The duplicate-signature observer is unchanged.

This is a fixture repair. The repaired source has **not yet passed an actual
Chromium or real-validator/browser execution** in this author's workspace. Both
hosted gates remain required; neither old failing head is reclassified as passed.

| Identity | Exact value |
| --- | --- |
| Starting source: PR190 | `2b23ee614ff2dd05bd3a6e79f1278658c30a3909` |
| Newer state read before implementation: PR200 documentation | `de7c385937dbed27620ab07baf1dc7210f39b700` |
| RED checkpoint, original empty-close behavior extracted unchanged | `ab879ac7c64f9fb1f59e5ec70d9bb3fbf1ee75fd` |
| Repaired source and additive browser gate | `493a6ea55b2eb332dfc8999b117fd7e817428497` |
| Repaired source tree | `3a1e9583b29db88ca73015e2ca35953e41378e0a` |
| Branch | `codex/solana-browser-send-repair-20261119` |

The author worked in a separate worktree based on that exact PR190 head. Active
favorites work and the nine optional package extractions were not edited. The
coordinator separately owns their integration and independent review. This report
is dated November 19 in America/Vancouver; the hosted log timestamps below are
November 20 UTC.

## Observed failure and causal boundary

The coordinator supplied two saved hosted failure excerpts, both inspected here:

| Source | Hosted job | Observed result |
| --- | --- | --- |
| PR188 `a728ce290eb2fcbe9b4a9e857cc84ced401da70f` | Run `44639090596`, job `135965138780` | The real-validator acceptance passed. In the browser stage, the signature observer rejected a repeated physical send at `00:16:03.5476930Z`. Fresh-key recovery and the real refund wait continued; final `fixtureErrors` failed at `00:47:57.5599213Z`. |
| PR189 `9611d6a5cb404fed5d41eeb176dafb31c01de640` | Job `135971622812` | The same observer rejected a repeated signature at `00:29:04.1561607Z`. Fresh-key restore reported preserved unknown state without resending at `00:30:38.0982717Z`; after the real refund wait, final `fixtureErrors` failed at `01:00:54.0047886Z`. |

The first failure is precisely after normal release and payout, when the harness
intentionally withholds the next send. The original proxy calls
`response.destroy()` before returning any response bytes. It has already
accepted the signature into the strict observer's seen set. A repeated request
for those same signed bytes therefore fails the existing assertion rather than
reaching the validator.

The production RPC has a single `fetch` call and no retry loop. The native
`markAndSend` implementation writes the durable marker before that call and
treats an exception or failed acknowledgment as unknown. Inspection found no
production retry defect requiring a runtime, chain, custody, or contract change.

[Chromium's primary networking source](https://chromium.googlesource.com/chromium/src/+/HEAD/net/http/http_network_transaction.cc)
supports transport replay as the explanation: connection-close/reset/empty-response
errors can reach `ShouldResendRequest`, whose predicate requires a reused
connection and no received response. It does not restrict that predicate to a
particular HTTP method. Parsed headers or an informational response satisfy its
response check. The inspected HEAD page identified blob
`c092bbcc8d5bc696759f6c9253accf960b76e136`. This is supporting source evidence,
not a network trace or a verified source mapping for hosted Chrome
`158.0.8127.36`. The hosted logs alone do not count JavaScript fetch invocations.

## Chosen failure and preserved semantics

`scripts/lib/solana-localnet-withheld-send.mjs` contains a small fixture-only
helper shared by the real-validator proxy, the HTTP regression, and the new
browser diagnostic. It returns status 503, the fixed body `Acknowledgment
unavailable.`, its exact byte length, `Cache-Control: no-store`, and the caller's
CORS headers. It completes the response; it does not close an empty socket or
send a successful transaction signature.

For the native client, a complete HTTP failure still supplies no successful
transaction acknowledgment. The production RPC refuses it with
`RPC_UNAVAILABLE`; the existing native client records unknown. The server-side
fixture knows it withheld forwarding, but the application receives no new
authority to assume non-broadcast. It must preserve the marker, reconcile chain
evidence, and wait for expiry before an explicit replacement. This is the
required unknown-broadcast/drop flow at the client boundary.

The complete failure deliberately changes the transport fault model. It does
not qualify a raw connection reset, prove that arbitrary browsers never replay
a POST, or establish exactly-once delivery across every network failure. Browser
transport retry policy remains outside this repository's source control. The
strict physical-send observer remains responsible for rejecting duplicates in
the maintained native/browser gate.

## Focused RED and GREEN evidence

The same two tests in
`apps/web/test/solana-localnet-withheld-send.test.mjs` ran before and after the
helper correction:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test apps/web/test/solana-localnet-withheld-send.test.mjs
```

At the RED checkpoint, both failed. Actual Node HTTP fetch reported
`UND_ERR_SOCKET` with zero response bytes; the native client correctly reached
unknown but no HTTP status was observed. This reproduces the defective
acknowledgment boundary, not Chromium's internal replay behavior.

With the corrected helper, both passed. The first test receives the complete
503 and exact fixed body after one physical POST. The second combines actual
HTTP, the actual production RPC, the composed native client, real Ed25519
signing, and the unchanged independent physical-send oracle. Its wallet,
journal, and cluster are existing scripted unit fixtures; it is not an Agave,
encrypted IndexedDB, or browser execution. It verifies:

- One fetch and one physical signed send produce unknown with zero upstream
  forwarding. Durable writes are `prepared`, `signed`, `sendMarked`, then
  `unknown`.
- A restored journal under a fresh profile retains the original signature,
  origin profile, and non-null send marker. Three reconciliations perform no
  additional send.
- Advancing only the scripted unit cluster beyond the recorded block-height
  expiry permits reconciliation to dropped, without a send.
- A new explicit release rebuild produces a different message and signature
  under the new profile. It forwards once, becomes sent, and leaves the old
  signature, origin, and marker intact. Total physical sends are two distinct
  signed attempts; only the explicit replacement reaches the scripted cluster.

No real chain clock is advanced or shortened by these unit fixtures. The full
native/browser gate still waits for actual finalized expiry and the contract's
1800-second minimum refund duration.

## Additive actual-browser diagnostic

`npm run test:solana:ack:browser` runs
`scripts/test-solana-withheld-send-browser.mjs`. It is inserted after Chromium
installation at the beginning of the existing foundation browser job. Every
prior command remains. The Solana workflow and its expensive validator/browser
steps are unchanged.

The diagnostic builds the actual `apps/web/src/solana-localnet/rpc.ts` and
`config.ts` into a self-contained browser module, with no synthesized fetch
result. After eight actual RPC reads it invokes `sendTransaction` once and
observes the native fetch result. The local HTTP server independently counts
physical POSTs, records connection identity, and uses the same 503 helper. It
requires the send's socket to have carried a prior RPC read, a complete 503,
one application call, one fetch call, one physical send POST, and the fixed RPC
refusal. One follow-up read checks that normal RPC remains usable.

The public diagnostic body is explicitly not a valid signed transaction. There
is no validator forwarding capability, wallet, custody material, Worker, or
financial operation in this quick transport check. Unexpected HTTP and
WebSocket traffic, page exceptions, duplicate send POSTs, and fixture errors
remain failures. Its output explicitly sets `rawResetQualified`,
`generalBrowserRetransmissionGuarantee`, and `nativeChainQualified` to false,
with `ReleaseEnabled: 0`.

This separates application retry from physical transport duplication for the
chosen complete-failure scenario. The unchanged full browser gate separately
checks actual signed bytes against the decrypted durable IndexedDB marker,
fresh-key recovery, validator state, and financial outcomes.

## Executed checks and scope preservation

Node was `v24.22.3`, npm `11.19.1`. This worktree used its own physical copy of
the existing installed dependencies; dependency manifests and lockfiles were
not changed apart from the single new npm script.

| Check actually executed | Result |
| --- | --- |
| Focused command above at RED checkpoint | 2 tests, 0 passed, 2 failed, 0 skipped; expected missing acknowledgment |
| Same focused command after repair | 2/2 passed, 0 failed, 0 skipped |
| `node --import ./scripts/test-support/register-tsx.mjs --test --test-concurrency=4 packages/chain-solana/test/*.test.mjs apps/web/test/solana-*.test.mjs` | 334/334 passed, 0 failed, 0 skipped; includes duplicate-send refusal and recovery suites |
| `npm run typecheck` | All four configured TypeScript checks passed |
| `npm run check:boundaries` | Passed; 234 production files and 140 core-entry modules |
| `npm run test:build-policy` | 54/54 passed, 0 failed, 0 skipped |
| `node --check scripts/test-solana-withheld-send-browser.mjs` | Passed |
| Imported and executed `buildSolanaRpcDiagnostic()` only | Passed; 4,812-byte actual RPC bundle, SHA-256 `8e1d06fb99e221589dfdd888a8b120ac45195dc63535a39de1f000f7b835cb0a`; no browser launched |
| Protected source comparison against exact PR190 base | No changes in `apps/web/src`, `packages`, `contracts`, `package-lock.json`, the physical-send oracle, full browser fixture/harness, or `solana-escrow.yml` |
| npm/workflow preservation comparison | All 52 existing npm commands and all 126 original foundation lines preserved; one command and four workflow lines added; package metadata unchanged |
| `git diff --check` | Passed |

The full browser assertions still require seven physical signed sends, seven
distinct signatures, exactly one withheld send, eight wallet prompts, exact
release/refund payouts and fees, fresh-key recovery without resends, explicit
expiry replacement, and empty fixture errors. The durable-before-send observer,
RPC `maxRetries: 0`, real waits, timeouts, pinned dependencies, permissions,
workflow gates, and release posture are unchanged.

### Retained execution logs

The coordinating workspace retains these logs in its `verification` directory.
Hashes bind observed outputs to this report; they are not claims about a later
integrated source or hosted run.

| Log | SHA-256 |
| --- | --- |
| `pr188-solana-browser-failure.log` | `830877409ef537213d881d859234f3a169ea707fcef91e3eec0c6414ee4a169a` |
| `pr189-solana-browser-failure.log` | `4151e89930b9fff75dbf9b66eab3dfef49549d9107568b68b25993ee463dd339` |
| `solana-withheld-send-red.tap` | `8dfad5b41713aa27f5d3b703b7ba8a77d78638727d9a24a4851270d4e8d945d9` |
| `solana-withheld-send-green.tap` | `f7cfbecfa2efcfb00bff89049b0baae30493309920e6e649cc3af26fc3b92258` |
| `solana-send-affected-solana-tests.log` | `66e5cbc30ede7610e0129c0d6e7fbbf14843f254cc24f363b8924dcae6f64d39` |
| `solana-send-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `solana-send-boundaries-and-build-policy.log` | `9d4d7d551fa9dca17bdfb0413b7a9afc1f0da3071c8c8ed7c5bd888277c672be` |

No remote writes, workflow retries, cancellation, merge, deployment, release
change, dependency change, local Chromium launch, or socket-policy bypass was
performed by this author. The remaining qualification is execution of the
additive actual-Chromium diagnostic and the retained real-validator/encrypted
Worker browser gate on the repaired exact head. Independent review and
publication are owned by the coordinator.
