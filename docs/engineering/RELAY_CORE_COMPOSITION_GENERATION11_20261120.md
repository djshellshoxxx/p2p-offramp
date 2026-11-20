# Relay and corrected-core composition — generation 11

## Result and exact source

The reviewed relay repair is composed onto corrected core PR207 with no conflicts or additional production edits. The actual final combined suite passed **2,265/2,265 tests**, with zero failures, skips or cancellations. All four TypeScript projects, 57/57 build-policy tests, import boundaries and the default build passed serially. This is new combined-source execution; ancestor CI is not transferred.

| Identity | Exact value |
| --- | --- |
| Shared base | `cd7d54ba075118a7ec043788c17718be842ee405` |
| Relay parent, PR206 | `e848ae19574e8b7f4cb040082df5255ee5a63f1e` |
| Corrected core parent, PR207 | `df10fe26a308407237f9ccbc636c8bb61f55b84f` |
| Two-parent merge | `4d498e1f8456e493e1db6684ec9ba5355fd2b3bd` |
| Frozen tested source | `46727d2a8ee1fd58cde15dcc252e1692408830f4` |
| Frozen tested tree | `6745c3b148aed3e13c092cc1d917541c24a9a482` |
| Local branch | `codex/p2p-relay-composition-g11-20261120` |

The ordered merge parents are PR206 then PR207. Independent test/report commits `6a6030cd3df9b770f0db3adcf90997dccbedaa96` and `14ab05b57ff84160b8ada310c17fa53402338ac9` were then cherry-picked as `04c4e16` and `46727d2`. Both parent histories remain intact. Only this report and its JSON companion follow the tested source.

## Exact union

PR206 changes three paths from the shared base; PR207 changes 34. Their changed-path sets are disjoint. The composition exactly equals both source trees combined, plus the two independent review additions. The three relay paths match PR206 byte for byte; independent files match their review commits. Worker `publication_audit_g11` independently confirmed the complete Git-tree union.

All 56 core npm commands, package metadata, lockfile, six workflows, 65 contract entries and 157 core script entries match PR207 byte for byte. Both real 1,800-second Solana refund waits and all strict financial/send/signature/marker/principal/fee assertions remain unchanged. The only production delta from PR207 is `packages/relay/src/ad.ts`, blob `514578ee28454f368157ba22eaccadbb1c61cfe4`, exactly the independently reviewed repair.

The repair rejects malformed standalone advertisement clocks and configured capacity outside the documented 1–1000 bound. Generation10 independently reproduced both original Low API/configuration defects, checked positive controls and actual default retention, and found no open High/Medium in the six added production lines. Maintained application callers already use guarded clocks and capacity 32; no default financial impact is established. This integration adds no new product defect or production correction.

PR208's backup-verification prerequisite and the incomplete updater browser composition are not included here. Optional packages remain separate and unwired. No dependency, endpoint, financial authority or default release setting changes.

## Actual checks

| Check | Result |
| --- | --- |
| Full `npm test`, pinned Foundry available | **2,265/2,265**, zero failures/skips/cancellations; 121539.850093ms test-runner duration |
| `npm run typecheck` | All four projects passed |
| `npm run test:build-policy` | 57/57 passed |
| `npm run check:boundaries` | 238 production source files; 142 core entry modules |
| `npm run build` | Passed; signedRelease=false, releaseAcceptance=false |
| Source-union and preservation comparison | Passed, including independent Git-tree comparison |
| `git diff --check` | Passed |

Environment: Node 24.22.3/npm 11.19.1 with physical repository-pinned dependencies. `FOUNDRY_BIN=/workspace/scratch/6bd6e00af1c0/toolchain` and `FOUNDRY_SOLC=/workspace/scratch/6bd6e00af1c0/toolchain/solc-0.8.30` were supplied. No package version changed.

Full-suite SHA-256: `9b87a3b14cf90fdabb0f8218712ff1583bdf3fe64c918d3d4f08653eb259cfd5`. The companion `relay-composition-generation11.json` records commands, exit statuses, durations, log digests and exact union metadata. Logs remain in `/workspace/scratch/6eace968c0df/verification-relay-composition-g11/`.

## Handoff and limits

The coordinator may publish the exact final tree as a fast-forward descendant of PR206 with PR207 ancestry, using the expected-head lease and retargeting the draft to PR207. Fetch and verify the published tree and actual hosted merge checkout. This worker performed no remote writes, PR mutations, deployment or release.

The pinned nak/Khatru executable is unavailable locally. Native Nostr acceptance, actual browser execution and hosted qualification were not executed or claimed. Maintained loopback package tests are separate evidence. No download, restriction bypass, gate relaxation or predicate-smoke substitution occurred. Exact-source hosted/native gates remain required before merge. Keep `ReleaseEnabled=0`, both actual financial waits and all prior dated failure records.
