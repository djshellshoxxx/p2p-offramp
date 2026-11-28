# Branch consolidation ledger (living)

This is the one living ledger for branch and PR consolidation. It supersedes the dated ledgers in this folder
(`branch-ledger-2026-11-04.md`, the gameplan's appendices) for current dispositions; those stay as history.
Regenerate the table with `python3 scripts/consolidation/branch-ledger.py <candidate> out.json out.md` on a full,
unshallowed fetch. The script is read-only.

## Current recorded disposition — November 18, 2026

Pinned main: `6c38e641e24abcfdcf645f864bd64c9645836d75`, after merged #137. The
[documentation reconciliation](2026-11-18-documentation-reconciliation.md) is the current
checkpoint for merged #135/#140/#150/#141/#149/#151/#143/#137 and draft stack #166–#168.
It also preserves the exact heads of documentation PRs #136/#139/#164/#165 as merge
ancestors. The combination is a candidate until its own integration is qualified;
source PR closure is not inferred from its local existence.

The earlier #159/#157 overlap warning below now has a partial disposition: #166
selectively extracts #159's external-wallet signer and localnet build support while
retaining main's D1 exchange; #167 consolidates #152/#153/#157/#158 native work. These
are still draft-source outcomes. Preserve unconsumed deltas, and do not classify the
whole original PR as superseded merely because one capability was extracted.
Audit PR #138 remains an independent active lane; its ledger is untouched here.

All branch counts, ahead/behind values, “live” labels and pending-route instructions in
the following inventory are historical to its original `6ef9a261` checkpoint. They are
not a fresh full-ref scan. Original qualification counts retain their original sources.

## Historical snapshot (2026-11-18, before Phase 2 consolidation)

| Ref | SHA |
| --- | --- |
| `main` (live) | `6ef9a2614b237d855a91cf14fb5df112ffc6cd76` |
| PR #133 `nodata/epic-goldberg-sg8n96` (base: #132's branch) | `1df700355e5199c69e84d5b41b12005677b5f5ee` |
| PR #132 `nodata/affectionate-ritchie-xq4bon` (base: `main`) | `86224cfb4abe19c266cf99d441bd64d52f5c57b4` |
| PR #128 `claude/confident-fermi-g6wjp3` | `64c7c1861779ea34632f2f800b80bdaecbaefa03` |
| Integration candidate for this ledger | #133 head `1df7003` (main, #132 and #128 are all ancestors) |

145 remote branches including `main`; 51 open PRs. 89 branches are ancestors of the candidate (52 of them already
ancestors of `main`). The other 56 are dispositioned below.

## Historical integration route

This session can push only `nodata/epic-newton-7bowm4`, so it cannot update #133's or #132's branches. Per the
fallback rule, `nodata/epic-newton-7bowm4` is the single replacement integration branch: it starts at #133's exact
head (a descendant of current `main` with #132 and the confident-fermi tip), adds the EX2/EX3 repair and the loose-end
extractions below, and goes to `main` through one PR that supersedes #132 and #133. No other umbrella branch exists.

## Repairs made on the integration branch

| Item | Change | Evidence |
| --- | --- | --- |
| REDTEAM-P2-EX3 (Medium) | Admission policy: only idle untrusted intake whose take-request expired, with no send in flight and no replay id, can be displaced; selected (`select`), offered, accepted, pinned and buyer-side sessions never are. Newcomers are refused instead. | Former `todo` repro is an ordinary test and passes; it fails on pre-fix `exchange.ts` (16 sybil takes all admitted). |
| REDTEAM-P2-EX2 (Low–Medium) | Sessions keep their slot (as tombstones) until their last replay id expires, so no retained id outlives its capacity; intake capped per advert and in total (`maxIntakeSessions`, default ¾ of `maxSessions`). | Former `todo` repro is an ordinary test; on pre-fix code the honest take on a second advert is refused `LIMIT_EXCEEDED`. |
| Semantics change | Four pass-1 tests that asserted "newest take displaces oldest" now assert the new preconditions: the flood is refused while its takes are live and the advert recovers once they expire. | `packages/exchange/test/*.test.mjs`, 43/43. |

## Loose ends integrated without replaying stale bases

- #129: one line in `docs/OPERATOR.md` (Python 3.12+). Its stale base would have deleted
  `docs/future-features/PRIVACY-ENHANCEMENTS.md`; that deletion is not taken.
- #131: `docs/handoffs/CHATGPT_GITHUB_COLLABORATION_LATEST.md` (point-in-time record; same stale-base deletions dropped).
- #66 / #67: final file content only (30 status commits each not replayed):
  `docs/handoffs/CHATGPT_ZERO_CODEX_LATEST.md`, `docs/audits/CHATGPT_RANDOM_AUDIT_LEDGER.md`.
- #31: historical review imported as `docs/reviews/2026-11-04-codebase-review/` (findings F01–F08). Not current proof.
- `claude/compassionate-gauss-uyhfih`: T41–T47 admission appended to `tasks/todo.md` as history.
- `docs/offramp-research-tools-execution-plan-20261106`: `docs/research/2026-11-06-tooling-execution-plan.md`.

## Content checks behind "contained" dispositions

- D9 stack (#69–#75, #91–#93): all nine regression tests the stack adds exist by exact name, once each, in the
  candidate's `packages/domain/test/intent-journal.test.mjs` / `packages/wallet/test/evm-execution.test.mjs`, and pass
  in `npm test`. The stack's code fix is superseded by the trunk's CAS lifecycle and is not reapplied.
- #100: its blank-warning cases (`''`, `' \t\n'`, `' '`) are a strict subset of the trunk's list.
- #57: patch-equivalent; the trunk later extended the same README paragraph.
- #65: T33 (malformed legacy saved-review wrapper) and T34 (unquoted meta refresh) are present on the trunk; only a
  comment line differs. T35 is patch-equivalent. T36–T40 are open tasks, tracked in the handoff, not code.

## Historical branch table

Disposition vocabulary: already integrated · integrate (via the integration PR) · contained by content ·
selectively extracted · preserved/historical · excluded.

| Branch | Head | Open PR (-> base) | ahead/behind main | In main | In candidate | Unique / equivalent commits | Files differing from candidate | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `autonomous/completion-20261031` | `b3519180eb` | - | 0/71 | yes | yes |  |  | already integrated (ancestor of main) |
| `autonomous/completion-20261102` | `94554ecf98` | #26->main | 68/44 | no | no | 68 / 0 | 540/617 (469 absent) | historical quarry: selective extraction (Phase 3); keep open/preserved until each delta has an outcome |
| `autonomous/continuation-20261031` | `320fc4bcc9` | - | 0/55 | yes | yes |  |  | already integrated (ancestor of main) |
| `autonomous/guidance-20261101` | `c8494b05e3` | - | 0/51 | yes | yes |  |  | already integrated (ancestor of main) |
| `autonomous/journey-20261101` | `3947074c95` | - | 0/45 | yes | yes |  |  | already integrated (ancestor of main) |
| `chatgpt/zero-codex-continuation-spec-20261109` | `62c6c14539` | #63->main | 1/32 | no | no | 1 / 0 | 1/1 (1 absent) | close as superseded (owner-approved) |
| `chatgpt/zero-codex/acceptance-cli-input-bounds-20261110` | `2ba1a4e18f` | - | 0/30 | yes | yes |  |  | already integrated (ancestor of main) |
| `chatgpt/zero-codex/acceptance-review-boolean-20261110` | `08a9cf1e9a` | - | 0/30 | yes | yes |  |  | already integrated (ancestor of main) |
| `chatgpt/zero-codex/audit-evm-schema-20261110` | `353b3d18ee` | #67->main | 30/32 | no | no | 30 / 0 | 1/1 (1 absent) | integrated: final ledger file imported as one commit |
| `chatgpt/zero-codex/d9-cross-deployment-nonce-20261111` | `c153a99dd5` | - | 0/30 | yes | yes |  |  | contained by content: all 9 D9 regression tests present by name and passing; superseded fix not reapplied |
| `chatgpt/zero-codex/d9-marker-failure-20261110` | `44ca5fcf5e` | #69->integration/p2p-consolidated-20261109 | 37/32 | no | no | 2 / 0 | 16/162 (0 absent) | contained by content: all 9 D9 regression tests present by name and passing; superseded fix not reapplied |
| `chatgpt/zero-codex/d9-restore-regression-20261110` | `78af7214a1` | #70->chatgpt/zero-codex/d9-marker-failure-20261110 | 38/32 | no | no | 3 / 0 | 17/163 (0 absent) | contained by content: all 9 D9 regression tests present by name and passing; superseded fix not reapplied |
| `chatgpt/zero-codex/d9-restored-account-isolation-20261111` | `b19ae46375` | #92->chatgpt/zero-codex/d9-restored-cross-network-nonce-20261111 | 48/32 | no | no | 13 / 0 | 17/163 (0 absent) | contained by content: all 9 D9 regression tests present by name and passing; superseded fix not reapplied |
| `chatgpt/zero-codex/d9-restored-casefold-20261110` | `f393c36593` | #75->chatgpt/zero-codex/d9-restored-hash-conflict-20261110 | 44/32 | no | no | 9 / 0 | 17/163 (0 absent) | contained by content: all 9 D9 regression tests present by name and passing; superseded fix not reapplied |
| `chatgpt/zero-codex/d9-restored-cross-network-nonce-20261111` | `dd5cf16da0` | #91->chatgpt/zero-codex/d9-restored-casefold-20261110 | 46/32 | no | no | 11 / 0 | 17/163 (0 absent) | contained by content: all 9 D9 regression tests present by name and passing; superseded fix not reapplied |
| `chatgpt/zero-codex/d9-restored-hash-conflict-20261110` | `146d06d814` | #74->chatgpt/zero-codex/d9-restored-pending-20261110 | 43/32 | no | no | 8 / 0 | 17/163 (0 absent) | contained by content: all 9 D9 regression tests present by name and passing; superseded fix not reapplied |
| `chatgpt/zero-codex/d9-restored-pending-20261110` | `94778c3282` | #73->chatgpt/zero-codex/d9-restored-prepared-20261110 | 42/32 | no | no | 7 / 0 | 17/163 (0 absent) | contained by content: all 9 D9 regression tests present by name and passing; superseded fix not reapplied |
| `chatgpt/zero-codex/d9-restored-prepared-20261110` | `92cc054ce9` | #72->chatgpt/zero-codex/d9-restored-terminal-20261110 | 40/32 | no | no | 5 / 0 | 17/163 (0 absent) | contained by content: all 9 D9 regression tests present by name and passing; superseded fix not reapplied |
| `chatgpt/zero-codex/d9-restored-race-20261111` | `e8afa6af3d` | #93->chatgpt/zero-codex/d9-restored-account-isolation-20261111 | 49/32 | no | no | 14 / 0 | 17/163 (0 absent) | contained by content: all 9 D9 regression tests present by name and passing; superseded fix not reapplied |
| `chatgpt/zero-codex/d9-restored-terminal-20261110` | `06305ebacc` | #71->chatgpt/zero-codex/d9-restore-regression-20261110 | 39/32 | no | no | 4 / 0 | 17/163 (0 absent) | contained by content: all 9 D9 regression tests present by name and passing; superseded fix not reapplied |
| `chatgpt/zero-codex/docs-collaboration-20261117` | `e21a58e6a4` | #131->main | 1/2 | no | no | 1 / 0 | 1/1 (1 absent) | integrated: handoff file imported (stale-base deletions dropped) |
| `chatgpt/zero-codex/docs-python-baseline-20261116` | `75a5e35b56` | #129->main | 1/2 | no | no | 1 / 0 | 1/1 (0 absent) | selectively extracted: one-line OPERATOR.md change (stale-base deletions dropped) |
| `chatgpt/zero-codex/docs-static-offers-status-20261116` | `30efa0e158` | - | 0/30 | yes | yes |  |  | already integrated (ancestor of main) |
| `chatgpt/zero-codex/docs-wiki-20261110` | `c14cfd07a4` | #68->main | 69/32 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `chatgpt/zero-codex/g05-transport-path-binding-20261111` | `053056975e` | - | 0/30 | yes | yes |  |  | already integrated (ancestor of main) |
| `chatgpt/zero-codex/g12-erc20-withdraw-binding-20261111` | `9786b22155` | - | 0/30 | yes | yes |  |  | already integrated (ancestor of main) |
| `chatgpt/zero-codex/g12-native-withdraw-recipient-20261111` | `84bb67f6e4` | - | 0/30 | yes | yes |  |  | already integrated (ancestor of main) |
| `chatgpt/zero-codex/g12-recovery-cli-file-identity-20261111` | `619fc7413f` | - | 0/28 | yes | yes |  |  | already integrated (ancestor of main) |
| `chatgpt/zero-codex/g16-bilateral-replay-20261111` | `969d02aecf` | - | 0/30 | yes | yes |  |  | already integrated (ancestor of main) |
| `chatgpt/zero-codex/g18-final-chain-recheck-20261111` | `921f067769` | - | 0/30 | yes | yes |  |  | already integrated (ancestor of main) |
| `chatgpt/zero-codex/g18-receipt-own-data-20261111` | `c16e7617f0` | - | 0/30 | yes | yes |  |  | already integrated (ancestor of main) |
| `chatgpt/zero-codex/g20-chat-scope-regression-20261111` | `a5c74990f0` | - | 0/30 | yes | yes |  |  | already integrated (ancestor of main) |
| `chatgpt/zero-codex/g25-public-endpoint-regression-20261110` | `e0a9033158` | - | 1/31 | no | no | 0 / 1 | 0/1 (0 absent) | already integrated (patch-equivalent; PR #79 closed) |
| `chatgpt/zero-codex/g26-clear-reentrancy-20261111` | `548495515c` | - | 0/30 | yes | yes |  |  | already integrated (ancestor of main) |
| `chatgpt/zero-codex/http-buffer-lifecycle-20261110` | `5f2381ab42` | - | 1/31 | no | no | 0 / 1 | 0/1 (0 absent) | already integrated (patch-equivalent; PR #80 closed) |
| `chatgpt/zero-codex/qualify-pr61-20261110` | `a1930a3596` | #66->main | 30/32 | no | no | 30 / 0 | 1/1 (1 absent) | integrated: final handoff file imported as one commit |
| `chatgpt/zero-codex/recovery-reference-identity-20261115` | `85849f7b26` | - | 0/28 | yes | yes |  |  | already integrated (ancestor of main) |
| `chatgpt/zero-codex/registry-concurrency-20261110` | `a213166ea8` | - | 1/31 | no | no | 0 / 1 | 0/1 (0 absent) | already integrated (patch-equivalent; PR #78 closed) |
| `claude/adoring-wozniak-850ue6` | `81c2dc889f` | - | 0/226 | yes | yes |  |  | already integrated (ancestor of main) |
| `claude/compassionate-gauss-uyhfih` | `970ac80f08` | - | 1/31 | no | no | 1 / 0 | 2/2 (0 absent) | preserved: T41-T47 admission appended to tasks/todo.md as history |
| `claude/confident-fermi-g6wjp3` | `64c7c18617` | #128->integration/p2p-consolidated-20261109 | 254/14 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `claude/docs-screenshots` | `c1e31918ed` | - | 0/200 | yes | yes |  |  | already integrated (ancestor of main) |
| `claude/friendly-dijkstra-nsi310` | `bd26833555` | #65->main | 6/32 | no | no | 4 / 2 | 5/10 (2 absent) | partially integrated: T33-T35 fixes present; T36-T40 open tasks recorded; keep preserved |
| `claude/gifted-faraday-73kydc` | `8fb081b492` | - | 13/44 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `claude/loving-einstein-xgzvdy` | `e82f1b5f96` | #28->autonomous/completion-20261102 | 92/44 | no | no | 92 / 0 | 547/632 (479 absent) | historical quarry: selective extraction (Phase 3); keep open/preserved until each delta has an outcome |
| `claude/loving-einstein-xgzvdy-decisions` | `89d0a928e9` | #29->main | 11/44 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `claude/loving-einstein-xgzvdy-journey` | `4c5d01c639` | #35->claude/loving-einstein-xgzvdy | 103/44 | no | no | 100 / 0 | 547/632 (479 absent) | historical quarry: selective extraction (Phase 3); keep open/preserved until each delta has an outcome (F01/F03/F06 attempts) |
| `claude/loving-einstein-xgzvdy-m0-s01-tooling` | `81a295d5cd` | #37->main | 3/43 | no | no | 3 / 0 | 16/20 (8 absent) | historical quarry: selective extraction (Phase 3); keep open/preserved until each delta has an outcome (reviewed m0 split) |
| `claude/loving-einstein-xgzvdy-m0-s02-core-contracts-storage` | `71a56d1040` | #38->claude/loving-einstein-xgzvdy-m0-s01-tooling | 7/43 | no | no | 5 / 0 | 23/62 (8 absent) | historical quarry: selective extraction (Phase 3); keep open/preserved until each delta has an outcome (reviewed m0 split) |
| `claude/loving-einstein-xgzvdy-m0-s03-core-messaging` | `404dc3daa8` | #39->claude/loving-einstein-xgzvdy-m0-s02-core-contracts-storage | 11/43 | no | no | 7 / 0 | 27/73 (8 absent) | historical quarry: selective extraction (Phase 3); keep open/preserved until each delta has an outcome (reviewed m0 split) |
| `claude/loving-einstein-xgzvdy-m0-s04-wallet-release` | `7706859d23` | #40->claude/loving-einstein-xgzvdy-m0-s03-core-messaging | 14/43 | no | no | 8 / 0 | 43/91 (16 absent) | historical quarry: selective extraction (Phase 3); keep open/preserved until each delta has an outcome (reviewed m0 split) |
| `claude/loving-einstein-xgzvdy-m0-s05-web-locale-leaf` | `dd2a648140` | #41->claude/loving-einstein-xgzvdy-m0-s04-wallet-release | 18/43 | no | no | 10 / 0 | 45/131 (16 absent) | historical quarry: selective extraction (Phase 3); keep open/preserved until each delta has an outcome (reviewed m0 split) |
| `claude/loving-einstein-xgzvdy-m0-s06-web-runtime-ui` | `58b3c876ae` | #42->claude/loving-einstein-xgzvdy-m0-s05-web-locale-leaf | 23/43 | no | no | 13 / 0 | 99/185 (46 absent) | historical quarry: selective extraction (Phase 3); keep open/preserved until each delta has an outcome (reviewed m0 split) |
| `claude/loving-einstein-xgzvdy-m0-s07-native-journey` | `bc549f477f` | #43->claude/loving-einstein-xgzvdy-m0-s06-web-runtime-ui | 28/43 | no | no | 16 / 0 | 120/206 (67 absent) | historical quarry: selective extraction (Phase 3); keep open/preserved until each delta has an outcome (reviewed m0 split) |
| `claude/loving-einstein-xgzvdy-m0-s08-portal-lab-docs` | `f8a9aa1430` | #44->claude/loving-einstein-xgzvdy-m0-s07-native-journey | 33/43 | no | no | 19 / 0 | 159/245 (97 absent) | historical quarry: selective extraction (Phase 3); keep open/preserved until each delta has an outcome (reviewed m0 split) |
| `claude/loving-einstein-xgzvdy-m0-s09-intake` | `5a9997485b` | #45->claude/loving-einstein-xgzvdy-m0-s08-portal-lab-docs | 37/43 | no | no | 21 / 0 | 186/272 (124 absent) | historical quarry: selective extraction (Phase 3); keep open/preserved until each delta has an outcome (reviewed m0 split) |
| `claude/loving-einstein-xgzvdy-m0-s10-optional-packages` | `0baa3c1ae5` | #46->claude/loving-einstein-xgzvdy-m0-s09-intake | 43/43 | no | no | 24 / 0 | 320/406 (258 absent) | historical quarry: selective extraction (Phase 3); keep open/preserved until each delta has an outcome (reviewed m0 split) |
| `claude/loving-einstein-xgzvdy-m0-s11-governance-ci` | `14d7c5e267` | #47->claude/loving-einstein-xgzvdy-m0-s10-optional-packages | 49/43 | no | no | 27 / 0 | 354/440 (292 absent) | historical quarry: selective extraction (Phase 3); keep open/preserved until each delta has an outcome (reviewed m0 split) |
| `claude/loving-einstein-xgzvdy-m0-s12-evidence` | `494703e837` | #48->claude/loving-einstein-xgzvdy-m0-s11-governance-ci | 53/43 | no | no | 28 / 0 | 544/630 (477 absent) | historical quarry: selective extraction (Phase 3); keep open/preserved until each delta has an outcome (reviewed m0 split) |
| `claude/loving-einstein-xgzvdy-s00-ci-triggers` | `a88560741e` | - | 0/43 | yes | yes |  |  | superseded by the reviewed m0 split (no PR); historical only |
| `claude/loving-einstein-xgzvdy-s01-tooling` | `4e319013ea` | - | 1/43 | no | no | 1 / 0 | 16/20 (8 absent) | superseded by the reviewed m0 split (no PR); historical only |
| `claude/loving-einstein-xgzvdy-s02-core-contracts-storage` | `01344cbd66` | - | 2/43 | no | no | 2 / 0 | 25/60 (8 absent) | superseded by the reviewed m0 split (no PR); historical only |
| `claude/loving-einstein-xgzvdy-s03-core-messaging` | `5a747ded35` | - | 3/43 | no | no | 3 / 0 | 28/68 (8 absent) | superseded by the reviewed m0 split (no PR); historical only |
| `claude/loving-einstein-xgzvdy-s04-wallet-release` | `4ebe660f05` | - | 4/43 | no | no | 4 / 0 | 43/85 (15 absent) | superseded by the reviewed m0 split (no PR); historical only |
| `claude/loving-einstein-xgzvdy-s05-web-locale-leaf` | `72bdf9f521` | - | 5/43 | no | no | 5 / 0 | 47/125 (15 absent) | superseded by the reviewed m0 split (no PR); historical only |
| `claude/loving-einstein-xgzvdy-s06-web-runtime-ui` | `14be5a1c1e` | - | 6/43 | no | no | 6 / 0 | 100/178 (44 absent) | superseded by the reviewed m0 split (no PR); historical only |
| `claude/loving-einstein-xgzvdy-s07-native-journey` | `8f0e5e245e` | - | 7/43 | no | no | 7 / 0 | 121/199 (65 absent) | superseded by the reviewed m0 split (no PR); historical only |
| `claude/loving-einstein-xgzvdy-s08-portal-lab-docs` | `c950dad4b3` | - | 8/43 | no | no | 8 / 0 | 160/238 (95 absent) | superseded by the reviewed m0 split (no PR); historical only |
| `claude/loving-einstein-xgzvdy-s09-intake` | `389c0ea69e` | - | 9/43 | no | no | 9 / 0 | 186/264 (121 absent) | superseded by the reviewed m0 split (no PR); historical only |
| `claude/loving-einstein-xgzvdy-s10-optional-packages` | `c696c02b94` | - | 10/43 | no | no | 10 / 0 | 320/398 (255 absent) | superseded by the reviewed m0 split (no PR); historical only |
| `claude/loving-einstein-xgzvdy-s11-governance-ci` | `789b2b2c26` | - | 11/43 | no | no | 11 / 0 | 351/429 (286 absent) | superseded by the reviewed m0 split (no PR); historical only |
| `claude/loving-einstein-xgzvdy-s12-evidence` | `001c31cc86` | - | 12/43 | no | no | 12 / 0 | 541/619 (471 absent) | superseded by the reviewed m0 split (no PR); historical only |
| `claude/p2p-offramp-evm-escrow-vc7stk` | `edc8a69718` | #84->main | 6/31 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `claude/p2p-offramp-integration-aan57u` | `48074e750c` | - | 0/222 | yes | yes |  |  | already integrated (ancestor of main) |
| `claude/p2p-offramp-prompt-lqcgno` | `25a0198738` | #64->main | 3/32 | no | no | 3 / 0 | 11/11 (2 absent) | close as superseded (owner-approved) |
| `claude/post-merge-followups` | `ec65012dbb` | - | 0/202 | yes | yes |  |  | already integrated (ancestor of main) |
| `claude/quirky-knuth-3s6ysy` | `2f839b1276` | #27->main | 1/44 | no | no | 1 / 0 | 1/1 (1 absent) | close: stale next-run prompt, not executed |
| `claude/recovery-consolidation` | `7586b5fd0a` | - | 0/190 | yes | yes |  |  | already integrated (ancestor of main) |
| `claude/sleepy-fermat-4s6ocx` | `e2e25cf0f5` | #50->main | 14/31 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `claude/sweet-noether-arf6ne` | `391653eaba` | - | 0/113 | yes | yes |  |  | already integrated (ancestor of main) |
| `claude/sweet-shannon-grykla` | `7165626c17` | - | 0/127 | yes | yes |  |  | already integrated (ancestor of main) |
| `claude/tender-goodall-db3cot` | `8783636e7a` | - | 0/28 | yes | yes |  |  | already integrated (ancestor of main) |
| `claude/trade-review-integration` | `1450c537de` | - | 0/207 | yes | yes |  |  | already integrated (ancestor of main) |
| `claude/vibrant-cray-ny4gum` | `a45e932a37` | #81->integration/p2p-consolidated-20261109, #56->codex/core-continuation-20261104 | 55/32 | no | no | 11 / 2 | 114/302 (68 absent) | historical quarry: selective extraction (Phase 3); keep open/preserved until each delta has an outcome (modern extraction of #37/#38/#40-#43; #56 and #81 share this head) |
| `codex/completion-20261116` | `88f9e40bbf` | - | 197/15 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `codex/consolidation-20261116` | `274d4fe533` | - | 201/15 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `codex/consolidation-ledger-20261104` | `d5b959b5ed` | - | 0/38 | yes | yes |  |  | already integrated (ancestor of main) |
| `codex/continue-completion-20261116` | `e7506c22e6` | - | 204/14 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `codex/core-continuation-20261104` | `edc66f6a50` | #54->main | 16/39 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `codex/d9-migration-20261116` | `c1f8e750be` | - | 200/15 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `codex/foundation-gates-20261104` | `77fb7c52dc` | #53->main | 2/39 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `codex/peer-acceptance-20261116` | `b3f508420e` | - | 209/14 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `codex/post-send-reconcile-20261109` | `af0e178988` | - | 25/32 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `codex/review-consolidate-20261116` | `5eadddd54f` | #127->claude/confident-fermi-g6wjp3 | 214/14 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `codex/rq00-evidence-20261109` | `a136909721` | - | 25/32 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `codex/setup-autonomous-agent-20261104` | `54e632f8f4` | - | 2/40 | no | no | 2 / 0 | 1/2 (0 absent) | excluded: weaker predecessor of the hardened openai-agents.yml (write token, no default-branch guard); paid-agent automation not revived |
| `codex/solana-payout-docs-20261109` | `7e8d571ae3` | #57->claude/sleepy-fermat-4s6ocx | 7/44 | no | no | 0 / 1 | 1/37 (0 absent) | already integrated (patch-equivalent; README later extended on trunk) |
| `consolidation/qualified-regressions-20261116` | `f2375dba1b` | - | 0/7 | yes | yes |  |  | already integrated (ancestor of main) |
| `docs/lean-release-handoff-2026-10-24` | `474f0505a4` | - | 0/244 | yes | yes |  |  | already integrated (ancestor of main) |
| `docs/offramp-research-tools-execution-plan-20261106` | `0f1792f589` | - | 2/32 | no | no | 2 / 0 | 1/1 (1 absent) | integrated: research plan imported |
| `docs/security-spec-expansion-20261021` | `0ea82ded18` | - | 0/277 | yes | yes |  |  | already integrated (ancestor of main) |
| `docs/spec-readiness-and-foundations` | `6b6004bdf3` | - | 0/274 | yes | yes |  |  | already integrated (ancestor of main) |
| `feat/custodial-ledger-foundation` | `52e6987e77` | - | 16/335 | no | no | 16 / 0 | 12/12 (12 absent) | excluded: custodial ledger contradicts the noncustodial client-side ADR (owner-approved archive/delete) |
| `fix/remediation-09f20d73-9524c0` | `9f5201dd44` | - | 0/62 | yes | yes |  |  | already integrated (ancestor of main) |
| `fix/remediation-f84468d6-0a97ed` | `dba5072d7a` | - | 0/48 | yes | yes |  |  | already integrated (ancestor of main) |
| `gpt/p2p-beta-spec-20261109` | `c4fb7b5906` | #60->codex/rq00-evidence-20261109 | 32/32 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `integration/all-compatible-work` | `dce515996f` | - | 0/74 | yes | yes |  |  | already integrated (ancestor of main) |
| `integration/m2a-safe-fixes-20261114` | `c0bbfe6295` | - | 163/15 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `integration/p2p-consolidated-20261109` | `fa28a37025` | #61->main | 215/14 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `integration/pages-beta-qualification-20261112` | `4dcddf2b4b` | - | 156/15 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `integration/pages-offline-recovery-20261112` | `9550d4b182` | - | 118/15 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `integration/privacy-endpoint-disclosures-20261109` | `07b3b2abfc` | - | 37/32 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `main` | `6ef9a2614b` | - | 0/0 | yes | yes |  |  | already integrated (ancestor of main) |
| `nodata/affectionate-ritchie-xq4bon` | `86224cfb4a` | #132->main | 220/0 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `nodata/epic-goldberg-sg8n96` | `1df700355e` | #133->nodata/affectionate-ritchie-xq4bon | 266/0 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `nodata/epic-newton-7bowm4` | `6ef9a2614b` | - | 0/0 | yes | yes |  |  | already integrated (ancestor of main) |
| `parallel/accessibility-recovery-panels-20261113` | `db38fba65b` | - | 118/18 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `parallel/browser-cold-nonce-20261113` | `2cacd1d521` | - | 132/15 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `parallel/browser-cold-recovery-20261113` | `65efc3428f` | - | 133/15 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `parallel/browser-peer-offer-20261113` | `d6d65a47b9` | - | 133/15 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `parallel/browser-runtime-engines-20261113` | `378fdf92c0` | - | 118/18 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `parallel/cli-argument-regression-20261113` | `605bcd24ef` | #102->chatgpt/zero-codex/g12-recovery-cli-file-identity-20261111 | 1/28 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `parallel/diagnostics-20261113` | `330fa1ede8` | - | 37/32 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `parallel/docs-web-profile-recovery-20261113` | `3524096c0f` | - | 120/18 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `parallel/locale-20261113` | `c4b13ddccc` | - | 36/32 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `parallel/localization-blank-warning-20261113` | `718208880b` | #100->claude/loving-einstein-xgzvdy-m0-s05-web-locale-leaf | 19/43 | no | no | 11 / 0 | 46/132 (16 absent) | contained by content: its blank-warning cases are a strict subset of trunk locale-catalog tests |
| `parallel/portable-recovery-guide-20261113` | `05794e754c` | - | 36/32 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `parallel/recovery-builder-help-20261113` | `4f75e00d0c` | - | 36/32 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `parallel/spec-tool-20261113` | `6d48c9b069` | - | 38/32 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `parallel/tooling-source-correspondence-20261113` | `32a4052163` | - | 105/28 | no | yes |  |  | integrate: ancestor of the integration candidate |
| `research/code-reuse-2026-11-03` | `5fec2c6db0` | - | 0/43 | yes | yes |  |  | already integrated (ancestor of main) |
| `research/remaining-gaps-20261103` | `922a391e42` | - | 0/43 | yes | yes |  |  | already integrated (ancestor of main) |
| `research/security-addendum-20261103` | `3a523a11a8` | - | 0/42 | yes | yes |  |  | already integrated (ancestor of main) |
| `research/upstream-reuse-20261103` | `977b36654b` | - | 0/43 | yes | yes |  |  | already integrated (ancestor of main) |
| `review/codebase-security-20261104-94554ec` | `6e9c0c5ea8` | #31->main | 2/44 | no | no | 2 / 0 | 5/5 (5 absent) | preserved historical review: files imported under docs/reviews |
| `work/noncustodial-reconstruction-2026-10-24` | `bc996aac82` | - | 0/258 | yes | yes |  |  | already integrated (ancestor of main) |
| `work/p2p-client-shell-2026-10-24` | `8a88d11d8e` | - | 0/251 | yes | yes |  |  | already integrated (ancestor of main) |
| `work/p2p-consolidated-20261030` | `68fb469204` | - | 0/100 | yes | yes |  |  | already integrated (ancestor of main) |
| `work/p2p-exchange-close-20261030` | `2d3135b646` | - | 0/114 | yes | yes |  |  | already integrated (ancestor of main) |
| `work/p2p-exchange-test-repair-20261030` | `adfbec52f9` | - | 0/117 | yes | yes |  |  | already integrated (ancestor of main) |
| `work/p2p-gate-reconciliation-20261030` | `e762e64960` | - | 0/119 | yes | yes |  |  | already integrated (ancestor of main) |
| `work/p2p-independent-branch-review-20261030` | `9f80c9b27b` | - | 0/119 | yes | yes |  |  | already integrated (ancestor of main) |
| `work/p2p-pr14-finish-handoff-20261030` | `8c8911e2dd` | - | 0/111 | yes | yes |  |  | already integrated (ancestor of main) |
| `work/p2p-relay-lifetime-20261030` | `e0961edc8c` | - | 0/115 | yes | yes |  |  | already integrated (ancestor of main) |
| `work/p2p-validation-20261030` | `11ce9e42be` | - | 0/113 | yes | yes |  |  | already integrated (ancestor of main) |

## Recorded merges after Phase 2 (earlier November 18 checkpoint)

| PR | Merge commit | Content | Gates |
| --- | --- | --- | --- |
| #135 | `af4835b` | Locale root lang/dir and selector; Phase 2 outcome; Phase 3 quarry plan; Lane B prompt | 10/10 CI + Snyk; locale review clean |
| #140 | `8649b7a` | D3 Option A release-trust unification; D6 `packages/qr` codec | 10/10 CI + Snyk; local 1,648/1,648; reviews clean; owner Tier C approval |
| #150 | `97ce6a4` | D1 peer acceptance (Option B) | 10/10 CI + Snyk; local 1,698/1,698, forge 92/92; review clean; owner Tier C approval |

Overlap to resolve (not Lane A's PRs, left untouched): #159 (`claude/p2p-offramp-evm-escrow-vc7stk`, D1 in exchange v2)
duplicates D1 already on `main` via #150; #157 (`claude/sleepy-fermat-4s6ocx`, chain-solana planner/reader) overlaps
Lane B track B1 (#151, #152, #158). Lane B PRs #136–#163 are drafts owned by Lane B.
