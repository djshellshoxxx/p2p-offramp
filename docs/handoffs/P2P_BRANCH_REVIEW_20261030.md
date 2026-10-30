# Independent branch review and restart — 2026-10-30

## Source, ownership and disposition

This checkpoint records a separate review of the exchange and relay writers' work. The owner authorized autonomous development and subsequently confirmed review of PRs #14/#15. This reviewer owns only this uniquely named handoff and `docs/evidence/P2P_BRANCH_REVIEW_20261030/`. No other writer's source, tests or branch was edited. No PR approval was submitted.

Live observations:

| Branch / PR | Observed head | Disposition |
|---|---|---|
| main | `c8547859f603f04d3df92e68925b99162594c39d` | Preserved |
| claude/sweet-noether-arf6ne / #10 | `47f9bbee455e7affbc39539489227228eb346a0f` | Integration source; parent Sonar security/reliability gate fails E/E |
| claude/sweet-shannon-grykla / #12 | `7165626c17d8afb7ad7fce461ae7df9cbfcdba07` | Included in #10 ancestry; Sonar E/E fails |
| work/p2p-exchange-close-20261030 / #14 | `0054543f81f48e928a46bd58c1dab14f91d0edeb` | Keep unmerged: six new tests fail during setup; Sonar D security; further lifecycle defects reproduced below |
| work/p2p-relay-lifetime-20261030 / #15 | `e0961edc8cb64b466a2a3193aa37158bfc8c3487` | Active writer repaired predecessor CI failure; latest Sonar passes; remaining exact-head jobs were still queued when sampled |

PRs #14/#15 both target the integration branch. Their production changes are disjoint (`packages/exchange/src/exchange.ts` versus `packages/relay/src/pool.ts`), and their test/evidence paths do not overlap. This is file-scope compatibility, not combined-build or merge acceptance. Retain original commits when eventually consolidating. PR #12 remains the coordinator's prerequisite before #10; do not merge the incompatible custodial-ledger branch.

The current relay writer advanced from `b5c0a46` through source `0859ea76ab813b5a8dacea51d4c5e5ca3b59e50f` to documentation head `e0961ed`; this is direct evidence of active ownership. Exchange ownership remains reserved by its handoff. Historical app/runtime/Worker/schemas reservations are not resolved by this review or by the owner's review confirmation. Do not duplicate those implementations. Read `COORDINATOR_NOTES.md`, `LEAN_RELEASE_SCOPE.md`, `P2P_EXCHANGE_CLOSE_20261030.md` and `P2P_RELAY_LIFETIME_20261030.md` at their current heads before resuming.

## Exchange findings, all open at the reviewed head

### P1 — A completed review can attach old buyer terms to a replacement session

At `packages/exchange/src/exchange.ts:320–326`, `receive(terms-offer)` validates against the captured session, awaits review, then reloads a session by string ID and checks only `state === 'taken'`. During the await, cancel the original session and take the same ad again with a different buyer wallet address. The pending offer is then applied to the replacement.

Executed outcome: the current session's buyer address was `0x2222…2222`, its reviewed terms named `0x1111…1111`, and its state became `offered`. This violates the specification's buyer/session binding and late-generation rejection. It is a negotiation-state defect; the harness does not demonstrate funded value movement or bypass of escrow signatures.

Repair packet: retain a captured session object/token or monotonic generation, require the same current session after every asynchronous review/build boundary, and revalidate its state and bindings before mutation. Add cancellation/re-take schedules with different buyer addresses and with the same address but a different generation. Refuse stale results without altering the replacement. Review outbound operations for detached-session success too.

### P2 — Expiry is checked against a clock captured before asynchronous work

`take`, `accept`, `build` and review/receive paths reuse the initial `now`. The isolated harness paused signer lookup, moved time from 100 to 200, then resumed:

- Ad expiry 150: `take` returned success and admitted one expired session.
- Terms acceptance deadline 150 with a still-live ad: `accept` returned success and set the session to `accepted`.

Repair packet: read and validate the trusted clock at commit/return boundaries after awaits; recheck ad expiry, message expiry and the relevant terms acceptance deadline. Do not mutate state or return publishable success after expiry. Include delayed review, seal/wrap and unwrap schedules, invalid clocks, exact-boundary equality and unchanged-state assertions. Keep error codes fixed and preserve unknown-outcome semantics.

### P2 — Outgoing messages bypass the configured replay-memory bound

`sent()` writes directly to `seen`, whereas the capacity check is on incoming messages. Ten take/cancel cycles for one ad produced 20 distinct successful outgoing messages with `maxSeenMessages: 1`; no expiry or capacity rejection occurred. The same path bypasses the default 1024-id bound. The specification promises bounded remembered rumor IDs and no eviction of live replay evidence.

Repair packet: make replay capacity admission common to incoming and outgoing results. Check/reserve capacity before committing session state, recheck after awaits, prune only expired IDs, and account for concurrent pending admissions. Refuse with `LIMIT_EXCEEDED` without state changes; do not evict live IDs or silently remove replay protection. Add maximum-capacity, repeated terminal/re-take and concurrent-send regressions.

### P2 validation blocker — Six added close tests fail before exercising closure

Hosted [schemas-and-crypto job 124005094082](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/41038479148/job/124005094082) at PR #14's exact head reports **783 tests: 776 pass, 6 fail, 1 skip**. All six new tests fail constructing the exchange because their proxy returns a replacement for the frozen provider's non-configurable, read-only `publicKey` property. The closure checks are not reached. The skip remains the Foundry-dependent calldata check in this Node job; separate EVM jobs do not turn that skip into a local pass.

Repair packet: use a separate delegating provider object with an overridden `publicKey`, preserving the original provider and method semantics, instead of a get trap that violates Proxy invariants. Re-run all six real-provider schedules and the full exact-head suite. The isolated close harness does not substitute for these failing tests.

## Relay review

The predecessor `b5c0a46` failed TS2379 because `capture(permit, { signal })` explicitly passed undefined under `exactOptionalPropertyTypes`. The active writer fixed this by omitting the absent property and also addressed broker revocation from the open-status callback. No duplicate repair was made here.

Source review of `e0961ed` checks ownership of pending sockets, publication cancellation, post-callback revocation, late ACK handling, CLOSED subscription IDs and cleanup. Three independently written lifecycle checks passed against its exact `pool.ts` and the unchanged actual transport policy/schema dependencies:

1. Abort between open resolution and continuation closes the socket and sends no EVENT.
2. Broker revocation from the open-status observer closes before REQ.
3. Close after send resolves unknown, and a late ACK cannot upgrade the result.

No additional defect was confirmed in this bounded relay review. It does not certify all relay behavior, cryptography, network interop or the complete project. The writer's recorded 61-test result remains its own evidence. At the latest sample, Sonar and inventory passed at `e0961ed`; full exact-head schemas/browser/spec/EVM checks were still queued. No merge acceptance is claimed until those complete and integration ownership/gates are reconciled.

## Executed evidence and reproduction

Local Node: v24.19.0. The snapshot is `/workspace/p2p-offramp-review-20261030`, not a Git checkout. `source-manifest.json` records 29 verified Git blob hashes across the specified integration/exchange/relay heads. This mixed-head snapshot supports separate focused reviews, not a combined application build.

Artifacts under `docs/evidence/P2P_BRANCH_REVIEW_20261030/`:

- `async-repro.mjs`, `exchange-async-red.log`: actual exchange/messages/state-machine modules loaded natively; deterministic crypto/review providers substituted through scoped module hooks. No source stripping or dynamic Function evaluation. Four asserted contracts fail (expiry twice, replacement generation and replay capacity); exit 1 is the preserved RED result.
- `relay-review.test.mjs`, `relay-review-green.tap`: actual pool, policy and schemas; signature verification is a fixture. Three tests pass, zero skips, exit 0.
- `exchange-ci-failure-excerpt.log`: selected lines from the exact hosted job, not a replacement for the full job log.
- `source-manifest.json`: source provenance, excluding locally authored harness files.

Run from the relevant complete checkout or the verified partial snapshot, with the evidence directory accessible:

```sh
node docs/evidence/P2P_BRANCH_REVIEW_20261030/async-repro.mjs --assert-safe
node --test --test-isolation=none --test-reporter=tap docs/evidence/P2P_BRANCH_REVIEW_20261030/relay-review.test.mjs
```

The exchange command must use PR #14's recorded source; the relay command must use PR #15's recorded source. Native module stripping is not TypeScript typechecking. No npm install, pinned full typecheck/build, browser, Foundry or parser-fuzz campaign ran locally here. The owner's 776-pass/one-skip and 4096-case/26-self-test results at `47f9bbe` remain historical source-specific evidence. No thresholds, original failures or skips were changed.

## Access, publication and next steps

Authorized GitHub REST/connector reads, PR listing, exact-head checks and job logs work. The earlier GraphQL Forbidden was not retried. The managed environment is running with restricted networking. A normal `git clone https://github.com/djshellshoxxx/p2p-offramp.git` failed because the configured proxy could not be reached at port 8080. No proxy, credentials or security policy was changed. The earlier handoff records that the Sonar check-run annotations URL was rejected by the connector as an unsupported endpoint; this action was not retried or bypassed. Sonar issue locations/rules remain inaccessible here, and its host is outside the selected environment's allowed list. Do not speculate that fixture keys explain the failures or suppress the gate.

The selected environment holds circuitdriftFX, not the original p2p executor. The local branches `work/p2p-restore-commit-reconciliation-test-2026-10-26` at `beb9866ed39452b603554d364c98fe025372da3a` and `work/p2p-validation-20261030` at `9eed65dabb2437b87270dab3f676133a063b5bef` were not present here and were not modified wherever they exist. Their unique work is not claimed consolidated. The schema facade still exports `saved-review.ts` and matches blob `ddd40bc997865d91b357611eb4503bc0857dafa3`; no G16 extraction was incorporated.

1. Have the exchange owner apply the bounded packets above, retaining these RED observations and adding real-provider regressions. Obtain current writer clearance before editing its reserved files.
2. Recheck PR #15's current head and all exact-head CI. If substantive review, required checks and integration ownership are clear, consolidate the compatible relay repair through the coordinator without overwriting its branch.
3. Obtain authorized Sonar rule/location evidence and resolve the parent and exchange gates. Preserve failures while inaccessible. Do not merge #10/#12 or the unqualified #14 based on ancestry or earlier green checks.
4. Recover the original p2p executor and inspect preserved local branches before claiming all work is integrated. Coordinate schemas/runtime ownership before G16 extraction; retain `saved-review.ts` exports.
5. Resume lean dependency-ready product work once ownership is clear. Keep app wiring, source-bound recovery and signed trust paths distinct from the already implemented package primitives.

This documentation/evidence milestone is published on a new review branch; its exact documentation SHA is the commit containing this file and is verified by reading the remote ref and blobs after creation. No runtime fix, approval, merge, deployment, live-fund use, credential creation, security-setting change or paid infrastructure occurred. ReleaseEnabled=0, connectOrigins:[] and the client-side/noncustodial architecture remain unchanged. No paid Claude call was made. This model interface exposes no prompt-cache setting or measured cache usage, so none is claimed.
