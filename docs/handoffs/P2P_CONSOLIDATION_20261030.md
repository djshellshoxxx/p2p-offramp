# Consolidated P2P development candidate — 2026-10-30

Latest source merge: eeb2a81323b9093864d6ec53b113949dbb710d25
Latest source tree: 4ee8c3b84d6b559770177b4a61f5b731e5324350
Predecessor documentation head: 31bbab0db07163c61b31dab75733e711440372b7.
Current documentation: the commit containing this updated handoff/prompt; its exact SHA is recorded in draft PR #18 and verified from the remote ref.
Branch: work/p2p-consolidated-20261030
Draft: https://github.com/djshellshoxxx/p2p-offramp/pull/18

The owner asked to disregard Sonar details, review/consolidate work where possible, then provide a detailed continuation prompt. Historical requests to investigate inaccessible Sonar details are superseded. No checks/security settings were disabled or bypassed.

## Consolidation and preservation

Initial source merge e2abbfc2c0cb3e9cf7ee882a477ceb70d92de42d retained first parent integration 47f9bbee455e7affbc39539489227228eb346a0f and six additional parents:
- Relay #15 e0961edc8cb64b466a2a3193aa37158bfc8c3487
- Exchange test repair #17 adfbec52f964d9b07c571b8924d31fa03d54e03a, including #14 original 0054543f81f48e928a46bd58c1dab14f91d0edeb
- Independent review #16 9f80c9b27b943b30409710dea76a53d97a761832
- Validation cc9a0a4baa2ad11b9efe4ada639a809542a7c5c9, preserving 9eed65dabb2437b87270dab3f676133a063b5bef
- Gate notes e762e649600493221e3bd10f0c3525858722bc94
- Screenshots #13 c1e31918ed5e4e370e7217a6a654ea360c71f4b4

The first intake had 52 distinct incoming paths, no overlapping deltas/conflicts/deletions. Complete remote-tree readback verified all 1,445 retained files/modes and only two new evidence files. Two read-only reviewers independently checked 105 materialized package blobs and found no new preservation/compatibility issue. Source tests were 117/117 with zero skips.

During final ref verification, the active exchange owner independently advanced #14 to f379dc243cd9164da076c69702c2b5c21898f520. Its handoff confirms exchange implementation/integration ownership and preserves #17/#16 parents. We did not advance that branch. The second candidate source merge has parents 31bbab0db07163c61b31dab75733e711440372b7 and f379dc243cd9164da076c69702c2b5c21898f520. Fourteen incoming paths applied without conflict, preserving all previous work and original RED logs; three new intake evidence files record verification.

Main c8547859f603f04d3df92e68925b99162594c39d, testnet/integration and all original work refs were not advanced by this session. No original branches were deleted, no force-push, no PR approval and no accepted-branch merge occurred. These merge commits exist only within the unmerged development candidate. The custodial-ledger branch remains excluded.

Live ancestry reads establish main, testnet #12, recovery #11 and older compatible client-shell/trade-review/spec/noncustodial branches are already in 47f9 ancestry. No second import is necessary. Local G16 beb9866ed39452b603554d364c98fe025372da3a is not incorporated; another executor reports it preserved. Compare with current source and coordinate schemas/runtime before extraction. saved-review.ts remains exported.

## Current product source and validation

Only five product paths differ from integration:
- packages/relay/src/pool.ts
- packages/relay/test/pool-lifetime.test.mjs
- packages/exchange/src/exchange.ts
- packages/exchange/test/exchange.test.mjs
- packages/exchange/test/async-boundaries.test.mjs

No app/runtime/schemas/dependency changes were authored or resolved here. Existing source was included byte-for-byte.

The owner's exchange repair adds commit-time session identity, fresh-clock/deadline and replay-capacity checks, latest-take tokens, accepted-session retention and pre-copy offer bounds. The three previously reproduced defect classes are repaired for the observed cases; all five formerly RED real-provider schedules now pass. They are no longer instructions to duplicate a fix. Original failing artifacts remain historical evidence.

On the updated combined snapshot:
node --test --test-reporter=tap packages/exchange/test/*.test.mjs packages/relay/test/*.test.mjs packages/nostr-crypto/test/*.test.mjs packages/transport/test/*.test.mjs docs/evidence/P2P_EXCHANGE_TEST_REPAIR_20261030/open-findings.test.mjs
Result: 134 pass, 0 fail, 0 skipped, 0 cancelled. This includes twelve new normal-suite tests plus the five earlier failing schedules.
All 106 materialized package files match proposed Git blobs. Node 24.22.1, Noble 2.4.0. Available TypeScript 5.9.3 passes the actual root configuration on this subset; no full pinned TS7/app/build/browser/Foundry acceptance is claimed.
Evidence: docs/evidence/P2P_CONSOLIDATION_20261030/{f379-intake.json,f379-combined-green.tap,f379-types.log}. Earlier manifest.json/combined-green.tap remain exact initial-source evidence.
A read-only compatibility review found no substantive blocker to including f379dc2 in this unmerged candidate. This does not replace the exchange coordinator's substantive review or full candidate-head CI.

## Ownership, gates and restart

Coordination: https://github.com/djshellshoxxx/p2p-offramp/pull/14#issuecomment-6520937849.
The active exchange coordinator retains runtime/test/integration ownership. This session owns only the candidate branch and its new documentation/evidence. Relay and app/trade/runtime/Worker/schemas reservations remain. Inclusion does not transfer ownership.

Candidate #18 and incoming f379dc2 required hosted jobs were pending at publication. The earlier 782/one-skip, 787/one-skip and 47f9 parser-campaign evidence stays source-specific. No full candidate CI success, independent audit, release or trading acceptance is claimed.
Authorized connector publication works; earlier denied operations were not retried or bypassed. The original executor/local worktrees are not available here. No new credentials, paid infrastructure or paid Claude calls; no measurable cache telemetry.

Next:
1. Read P2P_CONTINUE_TO_SPEC_20261030.md and recheck live refs/owner progress.
2. Qualify the repaired combined source with pinned full tests/CI and the owner's remaining review. Fix demonstrated remaining gaps only, preserving RED/GREEN provenance.
3. Continue accepted dependency-ready app/chain composition, recovery/trust/G16 interfaces and two-party local EVM evidence per lean scope.
4. Promote only after required exact-head checks/review and ownership are clear. Keep main protected by its existing gates.
5. At each milestone record source/documentation SHAs, files, checks/skips, open failures, ownership, remote verification and next steps.

ReleaseEnabled=0, connectOrigins=[] and client-side/noncustodial architecture remain unchanged. No deployment or live funds authority.
