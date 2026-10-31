# Exchange close lifecycle — 2026-10-30
Source baseline: 47f9bbee455e7affbc39539489227228eb346a0f.
Owner subsequently confirmed and approved continuation after the request for worker clearance. This session claims only packages/exchange/src/exchange.ts and packages/exchange/test/exchange.test.mjs plus its uniquely named evidence/handoff files. No other worker branch was modified.
The earlier access/gate reconciliation is committed at e762e649600493221e3bd10f0c3525858722bc94 on work/p2p-gate-reconciliation-20261030.

## Demonstrated defect
An async take paused at provider.publicKey, followed by close(), then completion of crypto, returned success and recreated one session on the closed exchange. Root cause: async continuations did not recheck closure before admitting or returning results.
Focused patch rechecks close after signing/review/unwrap await boundaries and before publishing successful sends. This refuses results after logical disposal; it does not cancel underlying crypto or claim physical erasure.

## Files and evidence
- packages/exchange/src/exchange.ts: closure checks only.
- packages/exchange/test/exchange.test.mjs: six real-provider regression schedules (take, offer, accept, reject, cancel, receive) paused at signer lookup.
- docs/evidence/p2p-exchange-close-20261030/{repro.mjs,red.log,green.log}: isolated source-evaluation harness and original observations.
- This handoff.
Harness executes actual stripped exchange source, substituting module imports with test doubles. It is supplemental lifecycle evidence, NOT cryptographic qualification or full-project validation.
On unmodified baseline, first take assertion FAILS with ok:true and sessionCount:1. On patched source, take and receive both return CLOSED with sessionCount:0; exit 0. Node 24.22.1 emits the preserved experimental stripTypeScriptTypes warning.
The six newly added real-provider tests are NOT locally run: no authenticated full checkout or installed project dependencies in this executor. Exact-head hosted CI must qualify them before merge. No original suite thresholds/skips were changed.

## Remote and remaining gates
main remains c8547859f603f04d3df92e68925b99162594c39d; testnet remains 7165626c17d8afb7ad7fce461ae7df9cbfcdba07; integration remains 47f9bbee455e7affbc39539489227228eb346a0f at pre-edit check.
This atomic commit's SHA identifies the proposed source and documentation; read the work/p2p-exchange-close-20261030 ref after publication for its exact identity.
Draft PR targets integration; no approval or merge is submitted.
SonarCloud E security/E reliability failure on both upstream heads remains unresolved; no claim that this defect is a Sonar finding. Detailed issue access remains unavailable. Substantive review and exact-head full CI remain required.
Checkout authentication is still unavailable; connected GitHub file/Git-data operations are authorized and succeed. No auth denial was bypassed.
Named local preservation branches are absent in this fresh scratch executor and untouched wherever they exist. G16 extraction not imported. saved-review.ts export untouched. No custodial branch incorporation.
ReleaseEnabled=0/client-side/noncustodial gates, connectOrigins and all dependencies unchanged. No deployment, credential creation, live funds, paid Claude invocation or cache-usage claim.

## Restart
1. Verify draft branch SHA and changed files, then exact-head CI (full unit, typecheck, boundaries/build policy/spec/browser and applicable EVM gates).
2. Obtain substantive review of close semantics, including delayed review/crypto completion; inspect clock-expiry and session-replacement races as separate hypotheses before expanding scope.
3. Obtain permitted Sonar issue details; reproduce findings before fixes. Keep upstream PRs unmerged until all required gates pass.
4. Restore authorized original checkout for local branches and full tests; preserve local G16 and validation commits. Continue accepted unowned product work in small tested slices.
