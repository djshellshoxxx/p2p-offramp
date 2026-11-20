# Generation 15: consolidated source and continuation

## Current decision

**Use [PR219](https://github.com/djshellshoxxx/p2p-offramp/pull/219) as the single
main-target integration candidate.** Its complete tree equals the source that
passed the final 2,361-test invocation. All component and final composition
reviews are complete with no actionable finding. Applicable current-target
hosted/native/browser gates remain pending. Main is unchanged and no main merge
was performed in this continuation.

Sixteen native workers completed bounded scopes in this renewed request,
including one read-only workflow helper. The earlier 44-worker root is separate.
No source owner remains active after this handoff. Fresh contexts can resume
from these durable refs without duplicating completed work.

## Frozen identities

| Checkpoint | Identity |
| --- | --- |
| Current main | 5c5a84ef6300330700c8b0ca54d074ac113f08be |
| Tested local source | 430fbcaa6eff20dcd869d30a73e6a2ca6add0f0c |
| Published PR219 head | 8537d07bf0e67715b881065fa3d6a634a34a70d7 |
| Identical complete tree | 768be48cf8b349b3d124f580c59a73c3a0db93e3 |
| Proposed main merge checkout | 0dad3d1bab9b868ab7ee7e8a8565075bf6990452 |
| Published branch | codex/reviewed-main-consolidation-g15-20261120 |

The proposed merge has the same tested tree and ordered parents main then
candidate. PR219 spans 64 commits and 379 changed paths against main.
Root and independent reviewer read back the published source, complete tree
and parent identities. Mergeability is not a substitute for completed CI.

The candidate retains eight ordered parents:

| Order | Reviewed source | Exact parent |
| --- | --- | --- |
| 1 | Main | 5c5a84ef6300330700c8b0ca54d074ac113f08be |
| 2 | Combined core, PR213/210 | d30152336bb687b31ae547ab3fcecb8835a02ef4 |
| 3 | Required Cast oracle, PR214 | 24378d91682f7ee2957e1237aefcdb2ed062962b |
| 4 | Backup verification UI, PR215 | e77a2d3e758ee3b416d8d96ecd979526c7ae78ce |
| 5 | Compatible dependency update, PR216 | 9dd01b199a3448a7654c4719d226ec01eb93eecc |
| 6 | Backup browser engines, PR217 | 973d7b046df54856e0f71688db7a3efd879e7c2d |
| 7 | Optional signed-update UI, PR218 | 7d40620c8320945750bd51bf865226dadde998ca |
| 8 | Public Solana recovery export | 09c3d94aedab3c78a4397e3cb80786fb5eb4fd4a |

Original refs remain intact. PR213–218 were closed as superseded at07:07UTC
after each exact head was verified as a parent of219; each was explicitly
closed with merged=false. Their descriptions point to219. Root then read back
all six branch refs unchanged. These closures are not main merges. See the
[closure receipt](generation15-superseded-prs.json). Do not integrate intermediate
component states separately during final qualification.
The export branch is `codex/solana-public-export-g14-20261120`; no redundant
standalone export PR was opened.

## Completed engineering

**Backup verification:** Settings exposes selected encrypted-file authentication,
exact current-profile revision binding, file digests and explicit fresh recheck.
Exported backups remain unchecked until authenticated. Fresh-key restored profiles
need their own backup. Independent final UI 17/17; the actual app/Worker/IndexedDB
journey is scheduled on Chromium, Firefox and WebKit. All 18 existing assertions
remain. Read the [author report](BACKUP_VERIFICATION_UI_GENERATION12_20261120.md),
[independent review](INDEPENDENT_BACKUP_VERIFICATION_UI_REVIEW_GENERATION12_20261120.md)
and [browser scope](BACKUP_CROSS_BROWSER_GENERATION13_20261120.md).

**Optional signed-update view:** Settings supports explicit check, full public
verified-candidate review, consent and acceptance through the existing injected
controller. The opaque candidate stays local and lifecycle cleanup retires UI
work. Default injection is null and executable updater code stays outside
default builds. Independent UI 23/23 and UI/locale 55/55 are overlapping counts.
Trusted composition, the exact-own-lock backup lease adapter and native origin
transitions remain incomplete. Read the
[author report](SIGNED_UPDATE_UI_GENERATION13_20261120.md) and
[independent review](INDEPENDENT_SIGNED_UPDATE_UI_REVIEW_GENERATION13_20261120.md).

**Public Solana recovery export:** An explicit per-trade action downloads the
existing validated public document from an unlocked selected profile through a
typed read-only Worker command. The canonical document is bounded to 16 KiB and
excludes private profile/journal data. No wallet, signature, RPC, transaction or
durable write is added. The independent 21-case execution includes an ordinary
round trip into a separate fresh profile. Root reapplied the reviewed slice to
d301, ran 21/21 plus four TS/default build/boundaries, and published the exact
ddd3f4b29c5690c240c092ae8915d80342d503a1 tree as parent 09c3d94.
The actual browser fixture adds six download assertions and no deleted baseline
line. Read the [author report](SOLANA_PUBLIC_RECOVERY_EXPORT_GENERATION14_20261120.md)
and [independent review](INDEPENDENT_SOLANA_PUBLIC_EXPORT_REVIEW_GENERATION14_20261120.md).

**Dependency and CI:** Compatible Cargo updates remove the remaining RustSec
vulnerability match: audit 1 to 0, with the same five maintenance warnings.
Independent replay reproduces the lock exactly, SHA-256
`b9596088f7a28dccf465f5165eade7a9c02ea73a5734e38005be5e3b1b830039`.
Host compilation passed but defined zero tests. Correct pinned local SBPF
attempts were SIGKILLed in unchanged anchor-lang-idl; cause remains unproven.
The final updated-lock hosted native gates are required. The EVM Foundry job
now requires Cast availability and the existing independent calldata test;
author/root exact-step executions passed 14/14 without skips. Read the
[dependency report](GENERATION12_SOLANA_DEPENDENCY_REMEDIATION_20261120.md),
[dependency review](INDEPENDENT_DEPENDENCY_REVIEW_GENERATION12_20261120.md)
and [oracle report](GENERATION12_CI_ORACLE_COVERAGE_20261120.md).

## Final observed qualification

| Check on source 430fbc / tree 768be48c | Result |
| --- | --- |
| One full npm invocation | 2,361/2,361; zero failures, skips, cancellations or todos |
| Build policy | 58/58 |
| TypeScript | Four configurations passed through builds |
| Source boundaries | 241 production files / 148 core modules |
| Default / demo artifacts | 13 / 14 actual files |
| Documentation | Engineering consistency true; semantic approval false |
| Governance, specs and whitespace | Passed; 173 specs, zero broken links/unindexed |

The full command took 103.281 seconds with the verified pinned Foundry binary.
Full log SHA-256:
`74f612915a534d96a0a850496b4ad761f2e81fe868c04abd8e8e0eb3339ca404`.
Root rehashed the log and read its final counters. Earlier 2,325 and 2,351 runs
remain bound to their earlier sources and are not added together.

The [final author report](FINAL_INTEGRATION_QUALIFICATION_GENERATION15_20261120.md)
and [independent final review](INDEPENDENT_FINAL_COMPOSITION_REVIEW_GENERATION15_20261120.md)
record exact commands, hashes, source correspondence and observations.
The independent reviewer reproduced both final merge trees, checked all 42
changed core-delta paths, preserved all 2,476 other core entries and found no
deletions. Every changed blob matches its reviewed source except the README,
which preserves the original content and exact 17-line new section.

All nine execution logs, 27 artifact hashes and 260 graph source records were
independently rehashed. Default graphs are 95 document/30 vault Worker/4 QR;
demo graphs 97/30/4. All 27 outputs match the preceding qualified G14 hashes
byte-for-byte. Six graphs exclude executable updater/facade, optional-package
and Solana runtime modules. Release remains 0, signed release and release acceptance
false, external origins empty, and CSP connect-src none.

The existing stale `en.ts` reference and six associated claims remain explicit.
No semantic approval or evidence repinning was performed. Report commits are
kept in canonical PR200 so they do not restart frozen PR219's source CI.

## Hosted qualification

At 2026-11-20 07:02:57 UTC, all 14 PR219 jobs were queued.
The [source-bound snapshot](generation15-hosted-snapshot.json) contains every
workflow and job identity. Refresh live state before decisions.

| Workflow | Run |
| --- | --- |
| CodeQL / PR219 | 44691373175 |
| Specification inventory | 44691373288 |
| Nostr relay | 44691373330 |
| Vault foundation, including three backup engines | 44691373279 |
| EVM, including mandatory Cast oracle | 44691373312 |
| Updated-lock Solana, including public download | 44691373403 |

Original PR210's core-only Solana job 136092098296 / run 44677307772 completed
successfully. Root downloaded and read its completed checkout/log: actual
checkout 65f9739d, tree fa0d, native test groups 0/8/20/15/5/0, all 62 validator
checks and five actual browser journeys passed. Validator/browser receipts
took 1906/2047 seconds; browser completed 06:45:14 UTC. Actual module Worker and
encrypted IndexedDB were used, with no rewritten genesis, clock warp or fixture
errors. This evidence applies to d301, before the new dependency and export.
See [its completion receipt](hosted-core-native-completion-generation15.json).

The final candidate still requires its own actual current-target logs and
checkout/tree binding. All 56 original npm commands, financial assertions,
both real 1,800-second refund minima and 150/50/60-minute timeouts are unchanged.
Local managed Chromium launch was denied by Unix socket restrictions; that
restriction was not bypassed and no substitute local browser pass is claimed.

## Continue from fresh context

1. Read live PR219, main, its actual merge checkout and current CI. Preserve the
   frozen head unless a concrete failure requires a reviewed correction.
2. Review completed logs for all 14 applicable jobs, including updated native
   compilation, validator/browser, three backup engines, new public download
   and mandatory Cast. A queue, skip, cancellation or ancestor pass is not a pass.
3. Once current-source gates and independent review are satisfied, refresh
   main/head/merge tree and perform the already-authorized guarded merge with
   expected head 8537d07. Reassess changed refs or source. Do not merge old 207,
   old 213 or individual followups to bypass final qualification.
4. After verified main inclusion, accurately reconcile superseded PRs while
   retaining original branches. Distinguish GitHub automatic closure from an
   explicit merge. There has been no main merge in this continuation.
5. Use fresh workers for concrete failures or newly actionable features.
   Full Solana negotiation/funding needs its accepted protocol scope; full F24
   needs the maintained own-lock adapter and trusted composition; physical
   wallets/devices and semantic release approval remain external prerequisites.
6. Keep optional 191–199 separate under their existing gates. Their latest
   preserved current-old-core evidence is db531cb03ad303821a3625f6858941de1ac07606;
   do not claim requalification on final tree 768be48c or activate them by default.

The existing hourly automation
`Automation_ab68cc67e6ac8191bd31dc2d84a085e1` remains enabled. Its prompt now
points to frozen PR219 and these final reports, replaces obsolete active-owner
notices, and preserves prior constraints. Schedule and environment selection
were unchanged. It can continue inspection, corrections and the authorized
merge without a new approval request.

No deployment, release, real-fund operation, invented trust root, gate weakening,
force push or original-branch deletion occurred. `ReleaseEnabled=0` remains.

