# P2P-Offramp consolidation handoff

## Current generation 17 — guarded main integration complete (2026-11-20 UTC)

**Qualified source was merged into `main` as `1084a410676bc0658da97f33eba6a059493d74df` at 2026-11-20T12:29:28Z.** Its
complete tree is `7ccc0514c8320314a04fab333d5ebf14294f69dc`; ordered merge parents are the previous main
`5c5a84ef6300330700c8b0ca54d074ac113f08be` and reviewed PR221 source
`24b67bb2db7c74654b9a5b9496279b4d44380d28`. This was a source-only
merge, not a deployment or release. `ReleaseEnabled=0` remains unchanged.

**PR221 exact-source checks: 15/15 completed successfully, plus successful Snyk
status.** Real hosted Chromium, Firefox/WebKit backup, EVM/Foundry/Cast, Nostr,
CodeQL and Solana validator/native browser qualification passed. Solana validator
had 62 checks/13 sends and 1,852 real refund-wait seconds, and the actual
Worker/encrypted IndexedDB browser had five journeys, 2,047-second duration
and zero fixture errors. The Node suite reported 2,362 passed, zero failed,
one skipped Foundry-dependent case; that oracle passed in the provisioned job.
Earlier PR219's failed Chromium check remains failed historical evidence.

See [the current source-bound continuation](CONTINUATION_GENERATION17_20261120.md).
The canonical PR200 historical receipts below remain preserved; this is a
**separate docs-only follow-up**, not a replay of old test approval. The nine
optional PR191–199 remain independent and unwired. Full signed-update trust,
own-lock lifecycle, full Solana negotiation/funding, real devices and distribution
approval remain incomplete; none were authorized or silently promoted.


## Current generation 15 checkpoint — one main-target candidate

**PR219 now contains the reviewed core and completed feature/fix followups in one
frozen, independently reviewed tree. Its exact source passed 2,361/2,361 tests.**
Read the [current generation15 handoff](CONTINUATION_GENERATION15_20261120.md),
[publication map](generation15-publication.json), and
[hosted snapshot](generation15-hosted-snapshot.json) before resuming.
Main remains unchanged; final-candidate CI is queued and must pass before merge.
The six component PRs213–218 are closed as superseded; their source branches
and commit histories remain, verified after closure.
Sixteen workers completed this renewed continuation. The existing hourly task
now points to PR219 and the final evidence. No source worker remains active.

## Previous continuation — generations 12 and 13

The owner renewed consolidation and unfinished-feature engineering. Read the
[current source, qualification and worker handoff](CONTINUATION_GENERATIONS12_13_20261120.md)
before resuming. Main-target PR213 and followups214–218 now exist. The generation11
sections below remain dated historical evidence and do not describe the current
work queue. Applicable native/browser checks remain required.

## Historical generation 11 checkpoint — verified and restartable

**The combined core and nine preserved optional layers are locally qualified,
independently reviewed and published on the exact current core.** All three fresh
generation 11 workers have completed their scopes. A fresh complete repository
delta found no further unowned, safely actionable source task. The source queue
is now quiescent and restartable while current-source hosted and external
qualification conditions remain open. This is not a claim that the entire
product or a production release is complete.

Main remains **5c5a84ef6300330700c8b0ca54d074ac113f08be**. This coordinator performed
**zero main merges and zero explicit merge-API calls**. GitHub separately records
PR212 merged into its stacked target after its exact source was included in210.
There are **44 distinct native workers actually launched** in this root tree;
workers 42, 43, 44 were the three fresh generation 11 workers and are now complete.
External-stream workers are separately attributed. No generation 12 workers have
been launched; a new generation requires concrete new work.

### Current source checkpoints

| Scope | Exact commit | Exact tree |
| --- | --- | --- |
| Tested core212 | 540e1fe2660e0a6084600726d5f6f75fd5c1ee05 | e54743e3dd8cd7f1c8115d8692974ebe34d67405 |
| Published current core210 | d30152336bb687b31ae547ab3fcecb8835a02ef4 | fa0d662c991cb03729ca0a4ea53ef60960b81842 |
| Tested optional source | 97ec6f5a8b8bb811df479bc6f0615d7cdb97ab07 | b43344279e6a6c7acd14e52eafab0aca1ff4bc3d |
| Published equivalent optional source | b40731f82f17ec9119653fc6a21fd26e49e40dff | b43344279e6a6c7acd14e52eafab0aca1ff4bc3d |
| Published optional report checkpoint | db531cb03ad303821a3625f6858941de1ac07606 | e67004acf32a567dfd515e798c46992aca12163d |

[PR210](https://github.com/djshellshoxxx/p2p-offramp/pull/210) remains open/draft on
corrected207. It preserves reviewed206 relay guards,208 backup verification,209
ctutils,210 strict transport qualification,211 QR expiry, all four earlier207
repairs and the new212 temporary-copy cleanup. The current source and reports
have46 changed paths versus207. Tested 212 follows its original test-first56e1ae0
and old 701f core; published d301 adds only three evidence documents. Local final
core4b42a58f5ae37207a7188e518295065f8d00c7e0 has the same fa0d tree.

The [current optional evidence branch](https://github.com/djshellshoxxx/p2p-offramp/tree/codex/optional-current-core-evidence-g11-20261120)
contains nine separate source layers, then only three report files. Local final
report5ec0798620e426f0f3758f5c81df5233bff58ae7 has the same e670 tree as published
db531. Every original-head first parent, preceding-layer second parent and full
tree was individually verified. Original PR191–199 refs remain unchanged;
there is no bulk optional PR and no default activation. The exact local-to-remote
mapping is [generation11-published-checkpoints.json](generation11-published-checkpoints.json).
Commit metadata can differ while the entire verified tree remains identical.

### Actual execution and independent evidence

| Executed scope | Current core | Current optional source |
| --- | ---: | ---: |
| New full suite, one invocation per frozen source | **2,311/2,311** | **2,711/2,711** |
| Tooling / policy tests | 44/44 and57/57 | 44/44 and57/57 |
| TypeScript configurations | 4 | 7 |
| Python specification tests | 32 | 32 |
| Production files / core entry modules | 238/142 | 304/142 |
| Independent maintained tests | **44/44** | **16/16** |

Both full suites had zero failures, skips, cancellations and todos. Independent
44 includes the two new regressions; it is not added to the full suite or to its
own two-test run. Earlier2309/2709/2681/2617 counts remain source-bound history.
Core author 43 ran12 serialized commands. Optional qualification ran18 commands
plus two fresh final-core reference builds. Root rehashed12 core logs, three
independent regression/affected logs,20 optional/reference logs, the independent
optional log and both pairs of report checks. Independent reviewer 42 checked all author
logs,27 core files,54 optional/reference files and complete graph-source records.
No open High/Medium or other actionable integration finding remains in scope.

The new correction is **one Low implementation cause with two refusal variants**.
The identical original tests produced 0 passes and 2 failures; the fixed tests
passed 2/2. The HTTP driver
now erases its owned POST-body copy on cancellation/capacity refusal, preserving
caller bytes, admitted requests, error results and slot accounting. No network
leak, financial effect, authority bypass or whole-process memory sanitization was
established. The corrected library is absent from all six default/demo graphs;
all 27 new core artifacts therefore remain byte-identical to generation10.

Optional preparation preserves all 172 original nonshared blobs, all 2,492 protected
core entries at every layer, all 56 core commands in the 62-command union and all 139
foundation lines plus seven reviewed additions. All 13 default and 14 demo outputs
match fresh builds of the exact final core. Zero optional imports occur in any
of the graphs. Release remains disabled, release acceptance false, external
origins empty and CSP connect-src 'none'. Node/WASM memory reaches its256MiB cap
and refuses further growth; browser/device/provider qualification stays separate.
All strict financial/send assertions and both real1800-second refund minima are
preserved. No local Chromium or extended native financial execution was added.

Read the [core author report](GENERATION11_TRANSPORT_CORE_QUALIFICATION_20261120.md),
[core independent review](INDEPENDENT_TRANSPORT_PREFLIGHT_REVIEW_GENERATION11_20261120.md),
[core plan](generation11-core-plan.json),
[optional author report](GENERATION11_OPTIONAL_COMPLETE_STACK_20261120.md),
[optional independent review](INDEPENDENT_GENERATION11_OPTIONAL_REVIEW_20261120.md)
and [optional plan](generation11-optional-stack-plan.json).

### Fresh census, PR accounting and current hosted gates

The complete **04:56:14–04:56:50 UTC** census found **221 branches /209 PRs**:
**65 open,106 merged,38 closed unmerged**, zero tags/releases. Complete API and
Git head maps agree. All original192 branch heads and184 PR records remain exact;
original classification is A108/B20/C41/D5/E2/F11/G5/H0. Only two known branches
and PR212 were new since generation10; only200/210 had the already recorded head
advances. No original branches disappeared or moved. The later generation 11
optional evidence branch above is one separately verified addition; it does not
change the dated complete census into a claimed222-branch enumeration.

GitHub records212 closed/merged at04:52:43 UTC with source/merge commit540e1fe
unchanged, targeting the stacked transport branch. The closed PR retains old 701f
base metadata; current target d301 directly parents212. This explains106 merged
records. The exact server closure mechanism is not inferred. It is separate from
zero main merges and from explicit merge operations. Original212 ref is preserved.

At **04:57:18 UTC**, all **ten checks** on exactd301 were queued. Current browser
job136092099829, native Nostr136092098664 and native program136092098296 had no
completed logs or actual executed checkout. The single04:59:49 program-step
inspection returned an empty list. No old 701f or component pass was transferred.
See the [final rediscovery report](GENERATION11_FINAL_REDISCOVERY_AND_GATES_20261120.md),
[complete inventory](inventory-delta-generation11.json) and
[current-head gate snapshot](hosted-snapshot-generation11.json).

Historical203/205 real-refund receipts and206/208/209 component browser results
remain intact at their original sources. They do not qualify d301. Historical205
still lacks four later corrected207 repairs. Current-source distribution remains
refused where immutable locale evidence is stale; documentation consistency does
not grant semantic or release approval.

### Corrections, remaining work and exact restart procedure

The ledger contains **33 reproduced corrections:32 implementation defects and
one historical acknowledgment-fixture defect**. Its35 rows also include one
integration-boundary check and one workflow-gate correction. Compatible ctutils
remediation and the later strict transport qualification correction are tracked
separately. Among implementation rows, five are rated Medium and five Low ; 22 have
no severity rating. These are source-scoped implementation findings, not 33 proven
financial exploits. Optional recomposition adds zero causes.

Remaining work has explicit status and next actions in the machine state:

1. **Current-source hosted/native/browser/SBPF gates:** read completed logs and
   actual checkout/tree/ordered-parent receipts. Keep financial sends, markers,
   signatures, principal/fees, measured warmth, zero fixture errors and real waits.
   Coordinate qualification of the combined source with the207 owner before any
   main integration; green ancestor status is insufficient.
2. **Nine optional PRs:** preserve separate package scopes. Obtain applicable
   standalone CodeRabbit-or-Qodo review and exact proposed-source hosted/native
   checks before advancing each original ref. Re-resolve ownership and leases;
   future default composition remains a separate gate.
3. **Dependencies:** exact ctutils0.4.4 correction is present. Retain
   crypto-bigint0.5.5/RUSTSEC-2026-0387 and five maintenance warnings; a compatible
   upstream path and applicable native/SBPF evidence remain. No incompatible
   major, suppression or waiver was introduced.
4. **Broader feature/external qualification:** full Solana discovery/negotiation/
   funding UI, signed-update UI and owner trust/transport choices remain partial.
   Physical wallets, cameras, print, mobile/accessibility and real-device matrices
   remain separate. Experimental155 and proof/provider/model decisions stay
   preserved outside default activation. The screened historical updater-browser
   adaptation remains excluded.

The existing hourly automation is enabled with schedule, timezone, environments
and triggers unchanged. Its last observed04:30 run completed04:40:11.519165 UTC
and produced212; this generation reviewed and qualified that source. The task's
05:06:54 UTC prefix records completed44-worker accounting and this restartable
state. Root appends the exact final PR200 pointer after publication; continuation
must always resolve livePR200 and current source refs before editing.

Do not launch another audit merely to keep a loop alive. Resume a fresh generation
when a concrete new source, completed relevant gate, compatible dependency update,
required owner/device input or accepted feature specification provides actionable
work. Read this handoff and machine state first, assign isolated ownership and
preserve every prior source-bound result. No generation 12 worker is currently
running. Source, raw logs, artifacts, toolchains and external-owner data remain
preserved; dependency-transfer receipts locate the reused physical cache.

## Historical generation 10 checkpoint and generation 11 ownership

This section is a dated checkpoint. Current source, evidence, counts and worker
completion are stated above; older present-tense text below is preserved history.


**The combined reviewed core and all nine preserved optional layers are locally
qualified, independently reviewed and published.** Main remains
5c5a84ef6300330700c8b0ca54d074ac113f08be; this coordinator has performed **zero main
merges**. A later candidate from the scheduled continuation is now owned by two
fresh generation11 workers. **43 distinct native workers have actually launched
in this root tree**: workers39–41 completed generation10; workers42/43 are active.
The external coordinator's workers remain separately attributed.

### Published source and evidence

| Checkpoint | Commit | Tree |
| --- | --- | --- |
| Tested combined core | 49bcb0f2c63b20ac7878ba4aebd6bc433d44925f | 81845317f8c1cfe7c76846aa54403fb49cc141b0 |
| Published equivalent core source | 7819b88d32375905c12681e297773c712dabe94a | 81845317f8c1cfe7c76846aa54403fb49cc141b0 |
| Current PR210 / final core report base | 701f3866e60978c945c5a0148dcda5b65f58fdbc | 976a729bc359d331214924abab617969aa066950 |
| Tested complete optional source | 7dc8f486791f8f4a2fa0b9182181354e6b72f188 | e0826f1f8824f8f1f044e161311432ace6e06254 |
| Published equivalent optional source | f96d439b66775a5cc86dbefd02dba45fdc90c072 | e0826f1f8824f8f1f044e161311432ace6e06254 |
| Published optional report checkpoint | cf827ee5a86b28b11d6f2bba7c21f60f3d2153e3 | 08c42c12a1cdb1dc81fc0c8422ec58a923e05733 |

[PR210](https://github.com/djshellshoxxx/p2p-offramp/pull/210) remains draft and based
on externally owned corrected207. It now includes reviewed206 relay guards,208
backup verification,209 ctutils, the210 strict transport qualification correction
and211 QR timing correction. The complete union has37 paths versus207; all
unaffected baseline source,56 commands and six workflows remain exact. Remote
source7819 has ordered parents old210,206,208,209,211. Only three reports follow
it to701f. Local final core cc178fc653611ae8b6875fa8da371b096d71ba74 has the same
976a729b tree and is the optional preparation base. Connector commit metadata
changes commit IDs; complete source and report trees are verified equal.

The [new optional evidence branch](https://github.com/djshellshoxxx/p2p-offramp/tree/codex/optional-complete-evidence-g10-20261120)
retains nine separate source layers, followed by three report files. Every layer
has its original optional PR head as first parent and the preceding published
layer, or701f, as second parent. All nine trees and ordered parents were fetched
and verified. Original component and optional refs remain unchanged; there is
no bulk optional PR or default activation. Exact local-to-published mappings are
in [generation10-published-checkpoints.json](generation10-published-checkpoints.json).

### Actual qualification and independent review

| Executed scope | Combined core | Complete optional source |
| --- | ---: | ---: |
| Full suite, one invocation per frozen source | 2,309/2,309 | 2,709/2,709 |
| Tooling / policy | 44/44 and57/57 | 44/44 and57/57 |
| TypeScript configurations | 4 | 7 |
| Python specification tests | 32 | 32 |
| Production files / core modules | 238/142 | 304/142 |
| Independent focused tests | 54/54 | 16/16 |

Both full suites had zero failures, skips, cancellations and todos. These are
separate executions and are not summed. Earlier2681/2617 optional results remain
historical. Core author39 ran12 serialized commands. Optional qualification ran18
commands plus two fresh core reference builds. Root hash-verified all12 core logs
and all20 optional/reference logs plus two report checks. Independent40 verified
all logs,27 core outputs,54 optional/reference outputs and exact graph records.
No open High/Medium integration finding remains in either review scope.

Optional preparation preserves172 nonshared original blobs, all2487 protected
core entries at every layer, the56-to62 command union and139 foundation lines plus
seven reviewed additions. Every one of13 default and14 demo files equals a fresh
final-core build. The document/private-worker/QR graphs contain zero optional
imports. Node-WASM linear memory reached256MiB and refused further growth; its
browser/provider/device qualification fields remain false. Browser harness syntax
checks are not browser executions. All financial assertions and real1800-second
refund waits remain intact.

Read the [core author report](GENERATION10_COMBINED_CORE_20261120.md),
[core independent review](INDEPENDENT_GENERATION10_CORE_REVIEW_20261120.md),
[core plan](generation10-core-plan.json),
[optional author report](GENERATION10_OPTIONAL_COMPLETE_STACK_20261120.md),
[optional independent review](INDEPENDENT_GENERATION10_OPTIONAL_REVIEW_20261120.md)
and [optional plan](generation10-optional-stack-plan.json).

### Complete census and source-bound hosted observations

The fresh complete census at04:13:15–04:13:45 UTC found **219 branches and208 PRs**:
65 open,105 merged and38 closed unmerged; zero tags/releases. All original192
branch heads and184 PR records remain unchanged. Original classification is
A108/B20/C41/D5/E2/F11/G5/H0. Seven new branches since the prior212/203 census were
known derivatives; five new PRs were207–211. The only other PR changes were the
known handoff200 advance and206 recomposition. No additional unowned source work
was identified at that snapshot. Later212 and the new optional evidence branch
are individually observed additions, not a relabelled complete census.

Worker41 read complete browser logs for206/208/209: each24 workflow steps,
16 browser command groups and23 structured receipts. The actual executed trees
were verified against ordered base/source parents. It also read206's completed
native Nostr log:3/3 tests. Root checked all four raw-log hashes. These executions
use pre210 diagnostics and do not qualify new701f, laterQR211, or financial refund.
The [rediscovery report](GENERATION10_REDISCOVERY_AND_GATES_20261120.md),
[inventory delta](inventory-delta-generation10.json) and
[hosted snapshot](hosted-snapshot-generation10.json) retain exact identities.
Three whitespace errors in the worker report's job URLs were corrected by root;
its machine evidence remains byte-identical and no product cause was added.

The final single observation at04:40:36 UTC verified current701f and unchanged
main, with **ten queued checks**. Browser136083554377, native Nostr136083554245
and native program136083640534 had no completed execution evidence; the native
step list was empty. Read [the dated record](generation10-final-current-gates.json).
Source parent metadata is not an executed checkout. Historical203/205 complete
financial receipts remain source-bound;205 still lacks the four corrected207
repairs. Applicable current-source browser/native/SBPF gates remain required.

### New work, accounting and continuation

The existing04:30 scheduled run completed at04:40:11.519165 UTC and published
[PR212](https://github.com/djshellshoxxx/p2p-offramp/pull/212), head
540e1fe2660e0a6084600726d5f6f75fd5c1ee05, tree
e54743e3dd8cd7f1c8115d8692974ebe34d67405. It follows test-first56e1ae0fd50c40109aea3f40ce8505e85fc1a5c2
on701f and changes only transport HTTP driver cleanup, two regression tests and
an author report. Fresh worker42 independently reproduced original0/2, fixed2/2
and passed44 maintained tests including those two. It identified oneLow temporary
POST-copy cleanup cause with two refusal variants, with no demonstrated network
leak or financial effect. Worker43 is performing new full source qualification;
its exact outputs and independent report must precede publication or ledger count.

The current completed ledger remains **32 reproduced corrections:31 implementation
defects and one historical acknowledgment-fixture defect**. Two other ledger rows
are an integration-boundary check and a workflow correction. Compatible dependency
remediation and the later transport qualification correction remain separate.
Pure composition, report corrections and resource management add no defect cause.
The exact ctutils lock update is composed; crypto-bigint0.5.5/RUSTSEC-2026-0387 and
five maintenance warnings remain without incompatible upgrade or waiver.

Worker42 owns independent212 and subsequent composition evidence review. Worker43
owns new isolated core/optional checkouts and the serialized full-test slot. Root
alone may normally advance its210 and200 branches after review and exact tree/ref
checks. Preserve external212,207,208,209,206 and all original optional refs. Do not
repeat completed audits, bypass managed Chromium, resume the screened updater
adaptation, invent trust inputs, or waive standalone named optional review.

The hourly automation remains enabled with schedule, environment and triggers
unchanged. Its prompt was refreshed at04:44:51 UTC with generation11 ownership and
all newer external addenda preserved; root will append this durable checkpoint's
published pointer. Completed workers are not permanently active. After the
concrete212 work and its necessary source preservation finish, inspect genuinely
new source or completed-gate evidence. If none creates safely actionable work,
leave a verified restartable state rather than manufacture another audit cycle.

Generation10 recovered space by moving one completed matching dependency cache
for review and removing one verified ignored completed cache. Source, logs,
artifacts, toolchains and external-owner data were preserved. Worker43's later
physical cache transfer is recorded separately; old graph receipts can resolve
that identical dependency tree at its new owned location.

## Historical generation 9 coordination checkpoint

The section below is retained as dated evidence. Current source, qualification,
ownership and counts are given above; earlier present-tense statements do not
supersede the current checkpoint.


**The nine optional packages are now independently reviewed and locally qualified on corrected PR210, and the separate QR211 correction has completed focused independent validation.** Main remains `5c5a84ef6300330700c8b0ca54d074ac113f08be`; this coordinator has performed **zero main merges**. Exact-source hosted/native/browser gates remain open. All three generation9 workers completed their assigned scopes; **38 distinct native workers** have actually launched in this root tree. The external coordinator's workers remain separately attributed.

### Corrected optional composition, preserved as nine layers

The tested source is `390e6685bdf2ba098bc2908183fe5e38442d18cc`, tree
`19e8952f7786cae85c661457c0e1545da4f8b758`, based on exact PR210
`cff9eb05d77c82c82a5d22a5395b0ce63b02b265`. Its single full execution passed
**2,681/2,681**, zero failures, skips, cancellations or todos. The same frozen
source passed 44 tooling tests,57 policy tests,seven TypeScript configurations,
32 specification tests,304/142 import boundaries,docs/governance and native
Node Worker/WASM memory-cap checks. No local Chromium or extended native
financial execution was added.

The published source-layer equivalent is `c4c640aff58c1bcaf3b80875d121b8a95245ab36`
with the exact tested tree. The dedicated evidence branch
[`codex/optional-corrected-evidence-g9-20261120`](https://github.com/djshellshoxxx/p2p-offramp/tree/codex/optional-corrected-evidence-g9-20261120)
now ends at **`8af4dbc2b60b106ec80a2417ddf78d487c3f3586`**, tree
`6a9eb6f25ea0568daa80b928408c958356a3db59`. That descendant adds only four
evidence documents. All nine remote layer trees and ordered parents were
individually verified. Each retains its original optional head as first parent
and the preceding prepared layer, or210, as second parent. **Original PR191–199
refs remain unchanged; no bulk optional PR was created.**

The author preserved all 2,463 base entries outside the two permitted shared
files at every layer, exact original package subtrees, all 56 core commands in
the 62-command union, and all 139 foundation lines plus seven reviewed additions.
All 13 default and 14 demo files match fresh210 builds byte for byte, with zero
optional graph imports. Independent reviewer37 ran16/16 boundary tests and
separately checked all 20 author/reference logs,54 actual artifact files and 256
graph-module hashes. Root read the actual full summary and hash-verified all 18
author qualification logs. These are distinct evidence scopes, not additive test
counts. No open High/Medium integration finding remains.

Read the [author report](GENERATION9_OPTIONAL_CORRECTED_STACK_20261120.md),
[independent review](INDEPENDENT_OPTIONAL_CORRECTED_STACK_GENERATION9_20261120.md),
[complete source-bound plan](generation9-optional-stack-plan.json) and
[local-to-published layer mapping](generation9-optional-published-layers.json).
The old2617-test205-based stack remains historical. The new stack excludes
separate relay206,backup208,dependency209 and QR211. Per-source hosted/native/
browser checks and the accepted standalone CodeRabbit/Qodo review condition
remain required. No default activation or policy waiver is established.

### QR211: one independently corrected review-timing cause

[PR211](https://github.com/djshellshoxxx/p2p-offramp/pull/211) remains at
`e7397f45f68f18fae8857ea31b58a04e248df404`, tree
`224341968be39c6de7874b34a1f7fd6eefa19857`, based on 207. Independent worker 38
ran the supplied tests on the exact original test-only predecessor: **1 passed,
3 failed**. The identical tests on 211 passed **4/4**. Its combined maintained
QR/application/policy selection passed **112/112**, including those four tests,
with zero skips or cancellations. The root TypeScript project and 238/142 import
boundary check also passed; root hash-verified the five execution logs.

The correction refreshes clock validity and expiry after awaited hashing and
signature verification and clamps observed time within a decode. This is **one
Low implementation cause**, with several asynchronous variants. The public review
retains `authority: none`; no payment or signing authority was added. No open
High,Medium or Low finding remained in the reviewed diff. Report-only review
`49761aac1b2868a39ff0e80317f9d8c070660de9` is preserved in the
[independent QR report](INDEPENDENT_QR_ASYNC_EXPIRY_REVIEW_GENERATION9_20261120.md).
Actual new-source browser and applicable composed-source qualification remain.

### Counting, hosted state and continuation

The exact ledger now has **32 reproduced corrections:31 implementation defects
and one previously reproduced acknowledgment-fixture defect**. Two other ledger
rows are an integration-boundary check and a workflow gate correction. The
compatible ctutils remediation and later210 transport qualification correction
are separately tracked. This refines earlier loose product-cause wording;
no earlier repair identity, original failure or test count was changed.

The [03:52:02 UTC hosted snapshot](hosted-snapshot-generation9.json) observed207
with 11 successful records,one failed foundation-browser diagnostic and one
running native job;210 had10 queued records and 211 had9 queued records. These
are selected-source observations, not a full inventory or new test executions.
Completed203/205 validator/browser receipts remain bound to those ancestor
sources, and 205 still lacks the four later core corrections. Both real refund
waits, every financial assertion and the actual transport-warmth requirement
remain intact.

Scratch exhaustion was resolved by removing only ignored dependency caches from
seven completed root-owned worktrees. Source, reports, logs, toolchains and active
work were preserved, Git status remained unchanged, and 1,865,625,600 bytes were
free immediately afterward. The state includes the cleanup receipt. No other
owner's checkout was modified.

The existing hourly automation remains enabled with its schedule and environment
unchanged. Its 03:30 run actually completed at 03:42:26 UTC and published211;
worker 38 subsequently closed that candidate's local review gap. The task prompt
will be refreshed to this published checkpoint before the next continuation.

**Useful remaining integration work is identified:** compose the reviewed206,
208,209,210 and 211 followups on corrected207, preserving exact source unions,
then perform new combined execution and independent review. The root-owned210
descendant is the candidate for an ordinary leased advance after qualification;
207 and other source-owner refs must remain untouched. Fresh workers must read
this checkpoint and live ownership before beginning. Optional layers remain
separate and would require fresh rebinding if that core changes. Do not rerun
closed package audits, transfer ancestor passes, or manufacture new work.

## Historical generation 8 coordination checkpoint

**Corrected core [PR207](https://github.com/djshellshoxxx/p2p-offramp/pull/207) remains held after its actual browser diagnostic failed the mandatory warmed-connection precondition.** Head `df10fe26a308407237f9ccbc636c8bb61f55b84f`, tree `4b694124197ae8ce271f14307d12abc43c719406`, directly descends from PR205. The remote tree equals the external successor's local report checkpoint. PR205 remains draft/held because it lacks four corrected defects. Main remains `5c5a84ef6300330700c8b0ca54d074ac113f08be`; this coordinator has merged zero PRs into main. Resolve live refs before acting; all status below is dated evidence.

The completed browser job `136044687707` ran exact merge checkout
`0aba9abd40c39920b8c1cfe9a94fd5870d01f1f9`. Its one application call, one fetch,
one physical POST, zero fetch failures and HTTP503/RPC_UNAVAILABLE assertions
passed before the socket assertion failed at 03:03:18 UTC. Later completed-response,
fixture-error and unexpected-request checks were not reached. The diagnostic is
byte-identical to the earlier passing PR202/205 version; the precise connection-pool
cause is unproven. The independently reviewed correction is now separately
published as [PR210](https://github.com/djshellshoxxx/p2p-offramp/pull/210), head
`cff9eb05d77c82c82a5d22a5395b0ce63b02b265`, tree
`47f982cf20cd123df45805597b266f1f5ab98259`, based on207. All28 combined
author/independent/adjacent tests passed on source
`53bb347d830796998cb7e10781d0ab82df263fde`; no open High/Medium remains in
the scoped independent review. Every trial retains all behavior assertions and
mandatory server-observed warmth; only a completely clean cold trial permits
another sample, up to eight. Execution, assertion and teardown errors abort.
The version2 receipt reports all trials and aggregate counts. No local browser
was executed; all ten initial hosted contexts were queued. This is a separate
fixture qualification correction, not another product defect. See
[completed-log triage](HOSTED_FAILURE_TRIAGE_GENERATION8_20261120.md),
[author and combined evidence](TRANSPORT_WARM_CONNECTION_QUALIFICATION_GENERATION8_20261120.md)
and [independent review](INDEPENDENT_TRANSPORT_FIXTURE_REVIEW_GENERATION8_20261120.md).

The corrected core's tested source `7e8f93a02d6ffb98164ed3b09ba3db5b44bd9390`, tree `b330e1ca3a8a22598197bdd5de9532a0c56a917b`, passed **2,259/2,259 full tests**, 44 tooling, 57 policy, four TypeScript projects, 32 specification tests, boundaries 238/142, default/demo, docs and governance. This coordinator read and hash-verified all eleven recorded logs. Root also independently reproduced the four original failures and ran **97/97 affected tests** on `b67bd81e74b0f58338dc15bc694cd3a22b724cd4`; its production bytes equal the final tested source. A fresh RPC review inspected the Solana correction against pinned Agave. The earlier 2,244-pass/1-fail full run remains a failure: two overlong new test lines were corrected before final qualification.

The four corrected causes are Solana reconciliation context (Medium), accepted-release opening cancellation (Medium), portal cleanup ownership (Medium), and late review navigation (Low). Together with the separately reviewed relay fixes below, the ledger now contains **31 reproduced locally corrected causes**, plus two separate non-defect integration checks. Dependency remediation is counted separately.

| Current source | Exact identity and next gate |
| --- | --- |
| Corrected core PR207 | `df10fe26a308407237f9ccbc636c8bb61f55b84f`; at 03:05–03:06 UTC, three check records succeeded, browser failed, eight were queued and aggregate CodeQL was neutral. Exact financial/browser execution remains required. |
| Transport diagnostic [PR210](https://github.com/djshellshoxxx/p2p-offramp/pull/210) | `cff9eb05d77c82c82a5d22a5395b0ce63b02b265`, tree `47f982cf20cd123df45805597b266f1f5ab98259`, on207. Independent review and actual combined28-test selection passed; exact hosted Chromium and applicable native gates remain. |
| Compatible dependency [PR209](https://github.com/djshellshoxxx/p2p-offramp/pull/209) | `c8695278c3b85ac75fc2ad3318830aa8a08f4d50`, tree `e7aba3833fa52c6eda7a23cd6d1301cadc610355`, stacked on 207. Only ctutils version/checksum plus three reports change. Ten check records were queued at02:55 UTC. |
| Relay [PR206](https://github.com/djshellshoxxx/p2p-offramp/pull/206) | Now `825a85a55a1e0a43d6f416696fabee94913a2f18`, tree `243d178ac6a3822f71ddf3ad3073cc1d8020b864`, based on 207 and preserving old206 ancestry. External combined source passed 2,265 tests. Root's original-module RED0/2, repaired2/2 and affected140/140 are separate evidence. Current-source hosted/native gates remain. |
| Backup prerequisite [PR208](https://github.com/djshellshoxxx/p2p-offramp/pull/208) | `0e148564743b1ee353abdbdf8931fec464f09870`, tree `6a4417741c0b399dde894773f29854f7a2d36228`, stacked on 207. External author reports 2,277/2,277 and independent reviews; its own hosted gates remain. No signed-update UI activation or invented trust root. |

PR202's **complete native run passed** on exact checkout `32f7353551660a6c1e3e9302eecf3647b482c0c3`, tree `25d637fa5d6596e44cdae060ccc407f0c23186ee`: 62 validator checks, 1,851 seconds of actual refund waiting, and five emitted-app browser recovery/refund checks with a real module Worker/encrypted IndexedDB and zero fixture errors. The browser ran 2,045 seconds using real chain time. Root read the finalized log and complete browser receipt. This closes the acknowledgment-fixture execution gate on that source; it does not qualify207's changed reconciliation logic.

PR203 and204 each passed 14 foundation browser groups; PR205 passed all 16,
including encrypted Favorites/Templates and acknowledged restore. PR204's later
native browser job `136023880105` failed after a duplicate physical-send assertion
and disabled restore-control timeout. Its actual checkout
`c579e9a646855b5d821caf97249df9872b3e98e1` retains the older `response.destroy()`
fixture, while corrected207 already contains the complete503 replacement. This
is preserved failed historical source, not a newly counted product cause.
Native203/205 were running their second gate at 03:05–03:06 UTC. Dated generation7
snapshots remain unchanged; the generation8 triage records the newer results.
Preserve both real 1,800-second refund minima and every strict financial assertion.

The nine-layer optional stack `d67e022f71f14d54419bcb6987227b957d80107e`, tree `65d567546d93640358be842a71b31fcb445a3851`, passed **2,617/2,617**, 42 tooling, 57 policy, seven TypeScript configurations, boundaries 304/142, 32 specification tests, native Worker/WASM cap, docs/governance and builds. It preserves 652 protected core paths, all 56 core commands within an exact 62-command union, all 13 default/14 demo files, and zero optional graph imports. Published optional evidence `db9eb94356b4a2efd2b82bc2a0b67ab2e56795b2` has the exact same complete tree; it adds no functionality. Both predate the four core corrections. Recompose against the reviewed corrected base, retaining one-package PRs and applicable standalone review conditions.

Fresh inventory from 02:39:46–02:41:07 UTC observed **212 branches and 203 PRs: 60 open, 105 merged, 38 closed-unmerged**. API and CLI heads agree; all 192 original heads and 184 original PR metadata records remain unchanged. Tags/releases are empty. PR207–209 were individually verified after that snapshot; derived totals are not a fresh full enumeration. Preserve the original classification ledger and dated overlays.

The dependency audit returned zero npm findings but two Cargo advisory matches on the old lock. PR209 removes the ctutils match through compatible 0.4.4 resolution; author 150/150 upstream library tests and root's independent exact-lock/native audit are recorded. **One crypto-bigint 0.5.5 advisory and five maintenance warnings remain**, and the audit correctly exits 1. Its parent requires 0.5 while the patched range starts 0.7.6; no compatible patched 0.5 release was found. Host normal/build graphs contain neither affected crate, but that is not an SBPF artifact proof or owner waiver. Read both dependency reports and independent review before deciding integration.

**Thirty-five distinct native workers have actually launched in this coordination tree.** This includes the fresh generation8 transport-fixture worker; resuming the existing independent reviewer and inventory worker does not increase the count. Completed workers are not permanently active. The external successor's 19 workers are separately attributed and excluded. All deployment, release, funds, credential and settings limits remain. The existing automation carries the next bounded cycle after the durable checkpoint.

The external successor separately published its documentation checkpoint at
`3b538fd4586b6fc00846262d67956a2125b6c9f1`, tree
`c7323a825a19aa8cff7b4b24ae5ebe7a129fafcf`, on
`codex/successor-handoff-20261120`. Its earlier workflow-level queue observation
does not supersede the later per-job failures above. Preserve both source owners;
PR200 remains this coordinator's documentation-only branch.

### Final completed ancestor receipts, observed 03:30:50 UTC

The completed native logs for PR203 and205 were subsequently retrieved and their
structured validator/browser receipts parsed. These supersede the earlier running
statuses without changing the source holds. The
[receipt and status record](native-final-receipts-generation8.json) preserves
exact checkouts, log hashes, artifact identities and the complete check snapshot.

| Exact source | Completed validator proof | Completed actual browser proof |
| --- | --- | --- |
| PR203, checkout `8e2cd7b6ed1c907127b2e35e8b8826f59c039d90` | 62 successful checks,13 sends,1,852 seconds of real refund waiting | Five checks over2,051 seconds; actual Worker/encrypted IndexedDB,8 prompts,7 distinct recorded signatures,zero fixture errors |
| PR205, checkout `3dbe6ac3994c56bf2e6424676c6dc034ecc9a9b4` | 62 successful checks,13 sends,1,850 seconds of real refund waiting | Five checks over2,059 seconds; actual Worker/encrypted IndexedDB,8 prompts,7 distinct recorded signatures,zero fixture errors |

Both browser receipts retain actual genesis and real chain time, no clock warp or
browser genesis rewriting, and explicit principal/fee/unknown-marker/replacement
checks. Their validator-client receipts separately retain the localnet-only
synthetic-genesis shim. No public-network or fresh-negotiation qualification is
claimed. PR203 has ten successful check records; PR205 has thirteen including the
aggregate CodeQL record. **PR205 remains held because its source lacks the four
corrections in207, despite the now-completed ancestor proof.**

At that same final snapshot,207 had eleven successful check records, its failed
browser diagnostic and one running native job.208 had one success,one running
and eight queued;209 had one success and nine queued;210 had ten queued. The next
meaningful execution evidence is210's exact-source browser diagnostic and the
corrected core's own complete native result. Do not transfer these older passes.

## Historical generation 5 source and authority

Read this file and `consolidation-state.json` before changing code. The user authorizes autonomous engineering, qualified source integration and successive native-worker generations. Deployment, release, real funds, credentials and settings changes remain outside this task. Keep `ReleaseEnabled=0`.

**Historical generation 5 publication checkpoint; superseded by the current hold and corrected-source requirements above. No main merge has occurred.** The coordinator published [PR205](https://github.com/djshellshoxxx/p2p-offramp/pull/205), `codex/generation5-core-20261119`, toward `main`: head `cd7d54ba075118a7ec043788c17718be842ee405`, tree `ce3c69ddc36245f756005c540e521a26a3ce59b8`. Remote parent/tree equality is verified; actual merge checkout is `3dbe6ac3994c56bf2e6424676c6dc034ecc9a9b4`. Resolve live heads before acting; keep the core source head stable while checks run.

| Reference | Exact identity |
| --- | --- |
| Starting/latest observed main | `5c5a84ef6300330700c8b0ca54d074ac113f08be` |
| Historical generation1 PR188 | `a728ce290eb2fcbe9b4a9e857cc84ced401da70f` |
| QR repair PR189 | `9611d6a5cb404fed5d41eeb176dafb31c01de640` |
| Historical generation2 PR190 | `2b23ee614ff2dd05bd3a6e79f1278658c30a3909`, tree `a3701267756596e833247f50614c5ddc32f2cce0` |
| Favorites PR201 | `f5241c09f268a7a6841a5760ed0faa90b5b7f005` |
| Solana acknowledgment PR202 | `d753c0af23ff43743e34679e6b778b9ac0370da2` |
| Reviewed restore PR203 | `2245b3bfb462eca468b4cf759fdc12fa49c5cd3a`, tree `412efa7b9534cc182d05d2b97830d5f6ff09944e` |
| Reviewed templates/tooling PR204 | `98d33db64622eab3f5f4ece6141d445d255245e7`, tree `f5c5bb060732a892ba4eb91532e82ed79f64f2c4` |
| **Generation5 tested core source** | **`de5bb8aadadd9b76099110262b2f7beb123f9421`, tree `ff1028ddc6c90119e38be7ca8fe3e007fb525b06`** |
| Core author report | `e3098d9b420b1982f715d5a6de11af59ee0609ec` |
| Core independent report | `468a7a3d7451ad8be065cc790ebe2fca127b9e28` |
| Prior durable coordination checkpoint | PR200 `f0773c2c91ec271b86c84baf3745c9cd56d1cf36`, tree `a3c94e992597a84a5603a16527156c0c934a762e`; resolve live ref |

Generation5 combines reviewed templates/favorites/tooling and Solana acknowledgment/restore onto PR190. Both source merges were conflict-free. It **excludes the nine optional package extractions**. The exact source union preserves46 nonshared template paths,11 nonshared restore paths, all52 baseline commands, all125 baseline foundation lines and five other workflows. It has56 commands and16 browser groups, each addition with its own Chromium environment. Independent review found no open High/Medium.

Reports and coordination files appended after the tested source change no runtime code. Publish with traceable source parents PR204/203 and coordination ancestry; verify full local/remote tree equality. Preserve the nine separate optional PRs. The prior generation1/2 ancestry retains all original source IDs and historical audit records; obsolete runtime stacks were not wholesale merged.

## Inventory and completed source

`branch-inventory.json` and `BRANCH_INVENTORY.md` retain the immutable 192-branch baseline: A108 integrated, B20 duplicated, C41 partial/cumulative, D5 ready candidates, E2 defective candidates, F11 optional/experimental, G5 obsolete, H0 confirmed active writers. The initial inspection covered 184 PRs, including 41 open PRs at 40 distinct heads, with no tags or releases.

`REDISCOVERY_20261119.md` retains the earlier 194-branch/186-PR snapshot. The fresh `inventory-delta-generation3.json` observed **204 branches and 196 PRs** at 00:37 UTC November 20 / 16:37 Pacific November 19: 53 open, 105 merged and 38 closed-unmerged. All original 192 heads remain unchanged and present; the twelve additions are owned #188–#199 branches. Their actual main merge bases and divergence are recorded. Preserve these dated overlays and the original classifications; no external active writer was confirmed.

`inventory-delta-generation4.json` records **207 branches and 199 PRs** at 01:16 UTC November 20 / 17:16 Pacific November 19: 56 open, 105 merged and 38 closed-unmerged. All original 192 heads are still unchanged and present. The fifteen owned additions are #188–#202; #200–#202 are new since the preceding overlay. Actual merge bases/divergence and all owned heads are retained. This is a dated observation, including the then-current coordination head.

Generation 1 integrated seven source PRs, containing 20 distinct upstream commits:

- #171 bounded QR grouping and #172 typed hostile JCS descriptor failures.
- #174 repaired docs/lab/claims tooling.
- #179 funded Solana exit and encrypted browser recovery composition.
- #181 restored-profile and relay readiness correction.
- #183 public QR image/camera capture and review.
- #187 actual-byte bounds before retained review copies.

Generation 2 adds the following scoped work:

| Area | Original source | Completed scope |
|---|---|---|
| Asset update | #81 `a45e932a…`, with later malformed-envelope correction | Internal controller, HTTP and storage source; four reproduced IndexedDB open/close lifecycle repairs. Unexported and absent from application imports. |
| Personalization | #81 `a45e932a…` | Encrypted favorites and bounded reusable templates, with returned-error own-data normalization. No App/Worker wiring. Current retention is already equivalent after five `IntentV1` → `Intent` type adaptations and was not replaced. |
| Scriptless portal | #44 `f8a9aa14…` | Static source/recovery references, strict local headers and exact downloads. No executable recovery bundle or release approval. |
| Unsigned distribution | #44 `f8a9aa14…` | Two-pass reproducible local staging, tamper rejection, pinned current QR decoder graph and exact `OfflineRoot` artifact role. Approval flags remain false. |
| Inert governance | #156 `7a60893c…` | Historical records and source-bound assurance checks; status getter and inconsistent double-read regressions fixed using one detached snapshot. |
| Peer vector reproduction | #159 `1d3f59a9…` | Exact independent viem generator plus frozen-SHA and complete-byte regression for the already maintained v1 fixture. No protocol or fixture change. |
| Historical audit records | `06c6b9ab…` | Six dated audit entries retained as historical observations, without turning them into new execution or instructions. |

Stable completed IDs and exact source SHAs remain in state. **Twenty-five reproduced repair cases** were recorded by generation 5: the prior twenty plus immutable copy hash, exact personalization distribution admission, restore acknowledgment admission, restore byte ownership and template accepted-review retirement. Late-read variants are grouped as one ownership cause. Two additional rows are integration/qualification checks: QR/Solana policy and preservation of the favorites Chromium environment beside the template gate. New test-fixture mistakes and adjusted stale aggregate assertions are not counted as product defects. Defensive returned-diagnostic cases are not demonstrated peer exploits.

Generation5 adds current-runtime favorites and templates UI/Worker composition, completed-503 acknowledgment withholding, restore acknowledgment/byte ownership and immutable copy-text validation. Templates persist only seven defaults in eight bounded slots; explicit preview/consent/native expiry/CAS remain. Applying defaults clears parties/instructions/deadlines and prior consent, creates fresh identity, and requires current registry review. No wallet or funding authority is added. Restore preserves immediate private redaction while awaiting actual acknowledgment and clones intact Worker bytes before zeroing the document buffer.

Fresh generation5 rediscovery at **01:50:42 UTC November20 / November19 Pacific** observed **209 branches and201 PRs:58 open, 105 merged, 38 closed-unmerged**. All original192 heads are unchanged/present; new refs since generation4 are owned PR203/204. CLI tags and API releases remain empty. Preserve the dated overlays; core publication will add another owned branch/PR.

## Executed verification

Environment: Node 24.22.3, npm 11.19.1, Python 3.12.14. Foundry 1.5.1 and solc 0.8.30 were obtained with repository-pinned hashes verified. Runtime and framework dependencies remain pinned; no dependency version changed in these generations.

| Scope | Actual result |
|---|---|
| Starting `npm test` | 1,964 passed, 0 failed, 1 skipped |
| Generation 1 `npm test` | 2,072 passed, 0 failed, 1 skipped |
| Subsequent cast-dependent wallet oracle | 14/14 passed, zero skips; this is separate evidence, not a rewrite of the original skip |
| Generation 2 initial full suite | 2,152/2,152 passed, zero failures/skips |
| Generation 2 final full suite, including recovered vector generator | **2,153/2,153 passed, zero failures/skips** |
| All-nine optional source composition | **2,553/2,553 passed**, zero failures/skips/cancellations; exact source `a2f90cbd…` |
| Favorites final full suite | **2,178/2,178 passed**, zero failures/skips/cancellations; tested source `ed2f19ed…` |
| Independent favorites closure | 39/39 affected tests, 4/4 real-registry probes; two reproduced stale-open failures closed |
| Solana acknowledgment repair | Independent RED 0/2 → GREEN 2/2, affected **334/334**, 54/54 policy and all four TypeScript projects; hosted pending |
| Build policy | 54/54 passed |
| Maintained recovered tooling suite | 36/36 passed, including real two-pass distribution builds and tamper refusal |
| Generation 2 typecheck/default build | All four TypeScript projects and the default artifact passed |
| Generation 2 boundaries | 234 production files; 140 core entry modules; recovered modules remain outside the default core graph |
| Independent updater review | 94/94 affected tests; original lifecycle 2 pass/4 fail → repaired 6/6 |
| Independent historical tooling review | 31/31; governance 8 pass/2 fail → 10/10; distribution role 0/1 → 1/1 |
| Independent personalization review | 65/65 affected tests; final diagnostic RED 4 pass/6 fail (five scenarios plus parent) → GREEN 10/10 |
| QR/runtime repair checks | 29/29; independent QR oracle 3/3 |
| Peer-vector recovery | Independent worker 44/44 affected tests; coordinator generator `--check` and 9/9 acceptance tests |
| Foundry CI profile | 92/92 passed, 4,096 fuzz runs; 256 invariant runs at depth 100 |
| Actual local Anvil controller | 12 checks, 12 wallet prompts, 4 sends, 4 durable markers |
| Actual independent ERC-20 recovery proof | 4 checks, 8 signatures, 3 sends, 3 exact durable markers |
| Specifications / agreement fuzz / formal harness | 32/32, 26/26 and 22/22 passed respectively |

### Historical locally qualified source executions

| Source | Actual result |
| --- | --- |
| Corrected generation4 optional/favorites/ack source `86a2b93` | 2,580/2,580 full;42/42 tooling;seven TS;56 policy; independent tooling RED0/2 then GREEN4/4 and42/42 |
| Templates source `45a4905` | 2,210/2,210 full;32/32 focused;42/42 tooling;57/57 policy;four TS; default/demo and boundaries238/142 |
| Independent templates | 80/80 affected;38/38 policy;four TS;both builds;final9/9 distribution |
| Independent restore source `6207d14` | RED0/4 then same GREEN4/4;focused5/5;affected339/339;three extra probes;54/54 policy;four TS |
| **Core source `de5bb8a`** | **2,217/2,217 full**, zero failures/skips/cancellations;**42/42 tooling**, **57/57 policy**, four TS |
| **Independent core composition** | **506/506 affected**, **38/38 policy**, **3/3 new cross-feature probes**, boundaries and builds |
| Core specs/builds | 238 production/142 core modules; default/demo;173 spec documents;Python specs32/32 |

The new independent probes verify reciprocal stale-revision refusal between favorites and templates, and actual encrypted backup restoration of both records plus the saved-review reference at revision zero into a fresh profile without changing original ciphertext. All13 default and14 demo files, including evidence, match independently built final templates artifacts. Exactly four personalization modules occur only in the private Worker; document/QR and all nine optional graphs remain clear. Release flags remain false/0 and external connection origins empty.

Core's actual eleven-asset Solana artifact digest is `ba257e8b5178c52014e4eb4c00a3047cb71cb63d33ed395add6dc7754497a7a4`. It differs from standalone restore because shared schema/style source changed. Do not transfer artifact identity or browser results. Full commands, RED evidence, log digests and portable independent probes appear in `GENERATION5_CORE_COMPOSITION_20261119.md`, `INDEPENDENT_GENERATION5_CORE_REVIEW_20261119.md`, component reports and `INDEPENDENT_GENERATION4_COMPOSITION_REVIEW_20261119.md`. Counts are actual combined executions, not summed old results.

The full final command was `FOUNDRY_BIN=<verified-toolchain> FOUNDRY_SOLC=<verified-solc-0.8.30> npm test`. Use physical dependencies within each checkout: a symlink to another checkout's node_modules violates the maintained source-bound build policy. Source-specific reports include reproduction commands and log digests; the state file also retains main verification-log hashes.

Independent review documents include `INDEPENDENT_SECURITY_REVIEW_20261119.md`, `INDEPENDENT_TOOLING_REVIEW_20261119.md`, `INDEPENDENT_INTEGRATION_REVIEW_20261119.md`, `INDEPENDENT_EXTRACTION_REVIEW_20261119.md`, `INDEPENDENT_HISTORICAL_TOOLING_REVIEW_20261119.md`, `INDEPENDENT_PERSONALIZATION_REVIEW_20261119.md` and `GENERATION2_INTEGRATION_REVIEW_20261119.md`. Those dated reviews found no open High/Medium in their stated scopes. The later four reproduced findings supersede any blanket clearance of PR205; three are Medium and one is Low. Exact source-bound reports establish the review; they do not override a failed or pending hosted gate.

## Historical hosted snapshots and current gates

Local Chromium cannot launch under the managed Unix-socket restriction. Do not bypass it or label source/build checks as browser executions. Hosted jobs are actually executing; issue130's zero-job November11 history is not the current runner state.

The table below preserves earlier dated observations. The current checkpoint and
generation8 triage above supersede its pending statuses without rewriting failures
or transferring a passing result to another tree.

| PR/source | Actual observed result |
| --- | --- |
| PR189 | Ten foundation browser groups and six QR journeys passed; native EVM/ERC20/Nostr passed. Native Solana later failed duplicate physical signature and final fixtureErrors after the real wait. |
| PR190 | Twelve foundation browser groups, including portal and42-asset/two-pass distribution, passed on exact treea3701267. Native job135982126950 failed: duplicate00:53:27, restore/replacement passed00:55:01, final fixtureErrors01:25:17 after real wait. |
| PR191/196/199 | Fresh rediscovery read completed old-baseline native failures: duplicate, successful restore/replacement, then final fixtureErrors. Other checks passed. |
| PR197 | Duplicate01:11:38 then disabled restore timeout01:12:23; other checks passed. |
| PR192/193/194/195/198 | All nine triggered old-source checks passed; unchanged Solana path filters did not trigger on those package-only paths. |
| PR201 | Docs/tooling32/36 with four failures; distribution browser failed SOURCE_PATH; Favorites step skipped. Repairs are in PR204/core. |
| PR202 | **All13 foundation browser groups passed**, job136009252921. Early receipt proves one application call/fetch/physical POST on a warmed connection, complete503, zero forwarding/unexpected requests. Native job136009253374 remained in progress at01:52 UTC; last observed validator step14. |
| PR203 | Reviewed restore source published; all10 contexts queued at01:52 UTC. Browser136022950072/native136022950914. |
| PR204 | Reviewed templates/tooling source published; all10 contexts queued at01:52 UTC. Browser136023879924/native136023880105. |
| Core generation5 PR205 | Twelve contexts queued at02:02 UTC, including both CodeQL analyses. Foundation run44657477341/browser136027175362; native run44657477232/program136027174510. All16 browser groups and complete native flows must execute. |

PR202's merge checkout32f7353551660a6c1e3e9302eecf3647b482c0c3 equals its head tree25d637fa and has verified PR190/202 parents. Its short diagnostic is scoped to the controlled failed acknowledgment. Earlier duplicate transport replay is an inference supported by current Chromium source, not a pinned-build trace or a general arbitrary-reset guarantee.

Preserve both real 1,800-second native refund minima, signature uniqueness, send counts, durable markers, exact principal/fees, explicit expired replacement and zero fixture errors. Do not merge a failing ancestor because unrelated contexts passed. The current descendant must qualify its actual source/tree and checkout parents.

`HOSTED_QUALIFICATION_20261119.md`, `GENERATION2_HOSTED_QUALIFICATION_20261119.md` and `HOSTED_PROGRESS_GENERATION4_20261119.md` preserve dated exact checkout evidence. Dedicated meetup/privacy-controls/proof-jobs browser receipts passed with their stated limits; they do not qualify physical location, instant cross-document privacy revocation, arbitrary providers, browser WASM under unchanged CSP or standard-browser physical termination deadlines.

Current locale drift and all six draft claims remain stale with semantic approval false. Production staging and both maintained evidence records are unchanged. **Current unsigned staging remains refused.** The historical-client/current-tooling positive fixture names PR190's exact client tree and reports `currentSourceDistributionQualified:false`; it does not qualify this new client.

## Policy and historical evidence

Use the canonical accepted-decision index with the current user directive. The combined integrations, including generation5, contain Tier C recovery/release-verification paths. Current source-integration authorization is already provided; do not ask for it again. Required exact-head checks, applicable native/browser qualification and independent review with no open High/Medium finding remain mandatory. The accepted Tier C text does not separately establish the older Tier B named-bot condition as an additional gate for these combined PRs; assess any standalone Tier B change and actual server-enforced rules on their own terms.

**D7 parking was superseded on November 18.** The nine optional packages are accepted for independent, one-package-per-PR source extraction with import-boundary checks. They are not rejected merely because their default app composition remains incomplete. No source acceptance activates financial, network, device or release authority.

Governance currently checks 12 historical records, zero pending records, and 57 assurance rows. Thirteen non-owned references are stale after current changes; this is reported explicitly. The original immutable assurance source remains `8649b7a1994ec21fe5557179d44e861b746bcda8`. Do not promote historical receipts to current execution, remove stale rows, or rebind them to make a check green.

## Nine optional source PRs and composition

All nine extractions have separate published PRs, author qualification and independent source review with no open High or Medium finding in their declared scope. Their default 13-file app artifact matched the generation 2 base exactly. Full original source IDs, remote/local heads, subtree hashes, report names and custom gates are in `optional_queue`.

| Package | PR | Published head | Executed package tests |
| --- | --- | --- | --- |
| proof-inputs | [#191](https://github.com/djshellshoxxx/p2p-offramp/pull/191) | `61f0c6c05d245c4cc7524852224d00693929df3c` | 21/21 |
| liquidity | [#192](https://github.com/djshellshoxxx/p2p-offramp/pull/192) | `0fb8452cb38c835e9dccb660f63f6af3156c9f91` | 28/28 |
| arbitration | [#193](https://github.com/djshellshoxxx/p2p-offramp/pull/193) | `f7bd867bc1ee15854b36ba268cedc275c2429c28` | 38/38 |
| privacy-policy | [#194](https://github.com/djshellshoxxx/p2p-offramp/pull/194) | `a419b420dcee58ce99391a0f73289aa28dc6413b` | 25/25 |
| courier | [#195](https://github.com/djshellshoxxx/p2p-offramp/pull/195) | `8ff5f5c23dcdda88f79d8f54056515635f0b65a1` | 61/61 |
| meetup | [#196](https://github.com/djshellshoxxx/p2p-offramp/pull/196) | `4bc4c7e2833b6b8540b8586624fb1697817e02e2` | 95/95 |
| privacy-controls | [#197](https://github.com/djshellshoxxx/p2p-offramp/pull/197) | `86952b1ccc8eb9c25a3be05d6a32d3c556df8c84` | 47/47 |
| stealth | [#198](https://github.com/djshellshoxxx/p2p-offramp/pull/198) | `8e46f3ccf6348a953cef177a4ffd6abfb971c31b` | 55/55 |
| proof-jobs | [#199](https://github.com/djshellshoxxx/p2p-offramp/pull/199) | `e7e1aa90072f4b0376820f0e9b28e609707de74f` | 30/30 |

Privacy-policy's Medium planning defect is fixed and independently closed: atomic-group validation now remains coherent after dependency/orphan pruning. Reproduced failing native cases no longer start a partial optional module; a retained complete pair still starts correctly. Do not reinstate the obsolete held status. The repaired source is in #194.

`OPTIONAL_COMPOSITION_20261119.md` now preserves the completed author report at `27fba745…`. The local all-nine composition preserves every reviewed package subtree, all 52 existing npm commands and five unchanged workflows. It adds exactly six commands, three foundation steps and the original dedicated proof-jobs workflow. Only two append conflicts in `package.json` required a script union. `OPTIONAL_COMPOSITION_INDEPENDENT_REVIEW_20261119.md` records the coordinator's independent immutable-source checks. The actual combined full suite passed **2,553/2,553 tests with zero failures, skips or cancellations** in 245,457 ms. Seven TypeScript projects, native WASM cap, boundaries (300 production files / 140 core modules), 54 build-policy tests, 36 tooling tests, docs, governance and specs passed. All 13 default output files are byte-identical to the generation 2 reference, with zero optional-package graph hits. These are actual combined executions; individual package totals were not used as a substitute. Keep this local qualification branch separate from the nine reviewable package PRs.

## Active workers and remaining functionality

**Thirty-five distinct native workers have actually launched in this coordination tree.** Resuming a worker does not increase the count. Generation6 optional-stack, dependency/pin and independent Solana RPC reviews are complete. Generation7 Cargo remediation, inventory/hosted review and relay review are complete. Generation8 transport correction, independent review and completed-job triage are now committed; the correction is published as210 with28 combined affected tests passing. These workers completed their scoped tasks; hosted execution remains pending. The coordinator independently reproduced the four core causes and ran97 affected tests. External coordinators/workers are excluded from this count; their worktrees and publication refs remain owned by them. PR200 is this coordinator's documentation-only checkpoint.

The detailed accepted D8 packet has a named CodeRabbit/Qodo condition for standalone Tier B PRs. Fresh rediscovery found no named review on the nine optional PRs and is documenting applicability separately from server rules. Do not impose that condition on the combined Tier C core, silently remove an applicable standalone rule, or infer inaccessible protection settings. Optional source integration remains one package per PR with absent default imports.

Favorites' cached-reopening Medium is independently closed. Templates have maintained UI/Worker composition, independent local qualification and passing actual hosted browser execution on PR204/205. Restore's acknowledgment and stale-read races are independently closed; early actual encrypted-Worker browser gates passed on PR203/205. Complete native refund/recovery execution still needs its own final result. Generation4 tooling is repaired and independently closed, preserving current stale-evidence refusal.

The updater remains internal/unexported with no active update UI or owner-selected trust roots. Full Solana discovery/negotiation/funding parity, physical wallets/cameras/print/devices, authenticated QR invite keys and owner trust inputs remain separate. BasicEscrow has no arbitration settlement; diagnostic arbitration cannot create it. Preserve PR155's Waku signed64-bit regression, mobile-wallet roundtrip failure, incoherent XMTP snapshot and unexecuted pinned-container qualification as concrete limits.


### Newly refreshed dependency and external ownership evidence

Fresh advisory queries on exact PR205 locks returned zero npm findings for the root, its production subset and isolated escrow tool. GHSA-fc5q-39xc-vjpf is withdrawn upstream; preserve the earlier executed Picomatch assessment and bounded timing observation as historical evidence. This is not a software repair or owner waiver.

The bounded native RustSec follow-up completed with exit 1 and valid JSON: two version matches, crypto-bigint 0.5.5 / RUSTSEC-2026-0387 and ctutils 0.4.2 / RUSTSEC-2026-0385, against pinned database 074ea9a7ed619f511b5b7374c7a97e98d1e98be4. Neither record provides CVSS in that snapshot. Five unmaintained-package warnings are separate. The completed generation7_cargo_remediation report records feature resolution, compatible ctutils repair and the remaining bigint compatibility boundary. The compatible ctutils correction is independently reviewed and published in PR209; its exact native application qualification remains. Do not describe the Rust dependency audit as clean. Whole-tree npm signatures did not run after preparatory installation exited 137; Python advisory and yanked-Cargo checks are unqualified.

External `/workspace/scratch/6eace968c0df/p2p-offramp` owns the four corrected core paths and publication on `codex/generation8-core-20261120`. Its tested source is 7e8f93a02d6ffb98164ed3b09ba3db5b44bd9390; local report head observed d82d5282bfc78e46ccb34d9c700cf1b59dc8b23a. Its separate backup-verification prerequisite is published as PR208 and remains outside the frozen core. Do not modify, reset or duplicate those active sources. PR206 is a separate relay correction on `codex/relay-freshness-capacity-20261120-auto2`; it is not the four-fix core successor.

## Exact continuation

1. Resolve live main, PR200, the corrected core publication, PR206 and active ownership. Read current state and dated inventory overlays; do not substitute older snapshots for live refs.
2. Keep original PR205 unmerged. Its actual foundation/browser passes remain source-bound. Obtain hosted execution of independently reviewed PR210 on its exact source, preserving mandatory measured socket warmth and every behavior assertion. Qualify the actual corrected composition on its own full native/browser checks, preserving strict sends, durable markers, principal/fees and both real 1,800-second waits.
3. Qualify independently reviewed dependency PR209 on its exact native source. Preserve the remaining bigint advisory and scope; do not force an incompatible major or infer a waiver.
4. PR206 is already composed on207 at825a85a with2,265 external combined tests; do not duplicate that work. Preserve the root140-test and external98-test review scopes, PR208 backup-verification ownership and all exact gates. Do not aggregate unreviewed changes merely because a new branch exists.
5. Recompose optional one-package layers only against the reviewed corrected base. Keep the tested d67e022f composition as historical exact-source evidence, all default imports absent, and the applicable standalone CodeRabbit/Qodo condition unwaived.
6. After the applicable gates pass, merge the already authorized source using expected head/base/tree checks. No force push, branch deletion, deployment or release.
7. Update PR200 with exact source identities, current CI evidence, stable repair IDs and ownership. Continue independently actionable work with fresh native workers; avoid repeated closed work and invented trust inputs.

Hourly automation `Automation_ab68cc67e6ac8191bd31dc2d84a085e1` remains enabled with unchanged schedule/environment. Refresh its existing prompt from this published checkpoint; do not create a duplicate schedule. Completed workers do not remain running permanently.

Use native agents and existing GitHub tools; no paid OpenAI/Codex services. If shell push lacks authentication, publish exact Git blobs/trees/commits through the connector, verify full tree equality and lease only owned refs.
