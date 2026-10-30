# Consolidated P2P development candidate — 2026-10-30

This handoff supersedes historical instructions to investigate Sonar details: the owner expressly asked to disregard them, review/consolidate branches where possible, then produce a detailed development prompt. Check enforcement is unchanged.

## Exact source and disposition

Source merge: e2abbfc2c0cb3e9cf7ee882a477ceb70d92de42d
Source tree: 79cf57c834b54b1bdfdca0d78cd590e661882e15
First parent: 47f9bbee455e7affbc39539489227228eb346a0f.
Documentation: the subsequent commit containing this handoff and P2P_CONTINUE_TO_SPEC_20261030.md; its exact SHA is recorded in the candidate PR and verified remote ref.
New branch: work/p2p-consolidated-20261030. This is an unmerged development candidate, not promotion to main, full CI acceptance, an audit or release acceptance.

Additional parents retained verbatim:
- Relay #15: e0961edc8cb64b466a2a3193aa37158bfc8c3487
- Exchange close/test repair #14/#17: adfbec52f964d9b07c571b8924d31fa03d54e03a (contains 0054543f81f48e928a46bd58c1dab14f91d0edeb)
- Independent review #16: 9f80c9b27b943b30409710dea76a53d97a761832
- Validation: cc9a0a4baa2ad11b9efe4ada639a809542a7c5c9 (contains preserved 9eed65dabb2437b87270dab3f676133a063b5bef)
- Gate notes: e762e649600493221e3bd10f0c3525858722bc94
- Synthetic demo screenshots #13: c1e31918ed5e4e370e7217a6a654ea360c71f4b4

All original branch refs/main remain untouched. No PR approval or accepted-branch merge was submitted. The merge commit exists only to retain ancestry within the new draft candidate. The incompatible custodial branch remains excluded.

## Review and consolidation

Remote three-way blob/mode comparisons found 52 distinct incoming paths, zero overlapping deltas, zero conflicts and zero deletions. The screenshot delta used main c854785 as its base; the other five used integration 47f9. The combined product changes are exactly:
- packages/relay/src/pool.ts
- packages/relay/test/pool-lifetime.test.mjs
- packages/exchange/src/exchange.ts
- packages/exchange/test/exchange.test.mjs

Everything else is inherited documentation/evidence/screenshots plus this consolidation's new evidence and instructions. The full candidate tree is built on the exact integration tree; unchanged app/runtime/schemas/dependency files retain their blobs/modes. No blind cherry-pick or source conflict resolution was required. Two read-only reviewers independently verified all 105 materialized package files and found no new preservation/compatibility issue; they explicitly retained the known exchange defects and partial-checkout limitations.

Live ancestry checks verified main, testnet #12, recovery #11, prior client-shell/trade-review/post-merge/integration branches and older noncustodial/spec branches are already ancestors of 47f9. They need no second import. The local-only G16 branch beb9866ed39452b603554d364c98fe025372da3a is not consolidated; another executor's validation handoff reports it preserved, and it remains inaccessible in this executor. Current schema facade keeps saved-review.ts.

## Validation and open findings

Node 24.22.1, existing pinned Noble 2.4.0 dependencies. Combined command:
node --test --test-reporter=tap packages/exchange/test/exchange.test.mjs packages/relay/test/*.test.mjs packages/nostr-crypto/test/*.test.mjs packages/transport/test/*.test.mjs
117 pass, 0 fail, 0 skipped, 0 cancelled. The 105 package files were Git-blob verified against the candidate before running. Evidence: docs/evidence/P2P_CONSOLIDATION_20261030/manifest.json and combined-green.tap.
This executor has a materialized subset, not a full authenticated checkout; no full candidate build/browser/Foundry/CI result is claimed.

Known exchange findings remain OPEN: replacement-session identity across review, stale time after async work, outgoing replay-capacity bypass. The five real-provider RED cases and their original failures remain in P2P_EXCHANGE_TEST_REPAIR_20261030 evidence. They are not included in the normal test globs and have not been fixed by consolidation. Prior source-specific skips, setup failures and thresholds remain preserved.

At review time, relay #15 had one browser job still running; other core jobs passed. #17 and review/validation branches had pending jobs. #13's checks passed. These are parent observations, not candidate-head CI. Candidate CI must run after publication. Visible historical Sonar state is preserved in inherited records; no new detail retrieval or security-setting change occurred.

## Ownership, access and continuation

This session owns the new consolidation branch and its new evidence/handoff/prompt files. Existing relay/exchange/app/runtime/schemas reservations remain; no source ownership is transferred by inclusion. Reconcile those reservations before new implementation. Do not edit another worker branch.

Authorized GitHub connector file/Git-data/PR operations work. Prior denied GraphQL/annotations operations were not retried; no alternate access, credentials or replacement paid infrastructure was created. Original local branches/worktrees were not modified. Main remains c8547859f603f04d3df92e68925b99162594c39d at the prepublication checkpoint.

Next: read P2P_CONTINUE_TO_SPEC_20261030.md, recheck live refs/ownership, fix the three reproduced exchange classes in separate tested slices, qualify the combined source, then complete dependency-ready app/chain composition to the approved lean EVM acceptance criteria. No deployment or live funds authority. Keep ReleaseEnabled=0/connectOrigins=[] and the client-side/noncustodial boundary.

Use actual configurable prompt caching only when exposed, with measured usage claims. No paid Claude invocation or cache telemetry in this work. The following documentation publication and remote-tree/parent/ref readbacks are recorded in the candidate PR.
