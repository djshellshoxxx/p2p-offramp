# Generation 31 — offline startup compatibility

## Result and source boundary

**The ordinary offline application now connects the maintained API presence
probe, startup guard and compatibility notice.** Missing or unavailable required
APIs prevent service initialization and receive read-only recovery guidance.
Optional camera, sharing and clipboard APIs remain optional. Actual runtime
initialization remains authoritative; presence does not establish device,
storage or wallet support.

The combined source passed **2,604/2,604 tests**, with zero failures, skips,
cancellations or todos, plus all six additional qualification commands.
Independent source and combined-provenance reviews found no actionable findings.
Generation 31 is a separate unpublished follow-up above published PR238 at this
checkpoint; local qualification does not establish later hosted acceptance.

| Checkpoint | Exact identity |
| --- | --- |
| Published parent, [PR238](https://github.com/djshellshoxxx/p2p-offramp/pull/238) | `1c658181fb2bd04ffc4df0d0fbdf6735da3e7fce` |
| Published parent tree | `bc470673a26f2e7d18eb55f72e2e15ddc7c5d803` |
| Combined tested source / tree | `8d566f0e46ee76ee35a957cab0a4358a3da4aeb3` / `99047cf4675fbc299d700eec51d9b388da6707fe` |
| Intended continuation branch | `codex/startup-compatibility-continuation-g31-20261120` |
| Author source / tree | `9c9b16b7e96737115f5fc61bddf8c31e277dd6f4` / `9eb643f1871e2e257cfdb37e3cfe6c95e46e86bd` |
| Author evidence | `faf70e3afadbeadd27106139ef2a5e3adf9197fb` |
| Independent source-review evidence | `d1559e721d80eceb6fde94a02f6c903ce8311481` |
| Independent combined-source supplement | `63ca004aa92b70f4032e6f8e0c2a97ad407062de` |
| Root qualification packaging | `4e546f0286e1a7ca5174fa3cbd7f07a2843e0b98` |

The exact delta changes two production files, `OfflineRoot.tsx` and `ui/App.tsx`,
updates the adjacent sharing composition fixture, and adds one startup
composition test. Of PR238's 1,028 non-documentation entries, 1,025 remain exact;
three existing entries change, one is added and none are removed. All **1,029**
resulting entries equal independently reviewed author source. Every parent
entry outside those four paths is preserved. Evidence commits remain separate
from the tested source, whose entries must stay exact through publication.

## Behavior and lifecycle

The [cross-device specification](../../00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion/module_0.12.2_cross_device/spec-responsive-mobile-wallet-and-browser-compatibility.md)
requires a local startup probe and an unsupported/read-only path. Existing
helpers and the notice had isolated coverage but lacked an ordinary application
consumer. This change supplies that composition, leaving wider mobile and
wallet-handoff requirements separate.

`OfflineRoot` stores the real probe result in lazy state and calls the existing
initializer through `startWithRequiredApis`. Rerenders and controlled effect
replay retain the stable snapshot. The probe observes secure context, WebCrypto,
the bounded Worker interface, IndexedDB, file import and file export. Missing
or throwing required observations stop initialization; optional API absence or
denial does not. The probe reads local properties without constructing a Worker,
opening storage, requesting permissions, invoking optional APIs or networking.

App receives the optional snapshot and renders the existing notice after startup
finishes. Missing APIs receive named capability guidance; an actual service
refusal or thrown initializer retains existing fixed error handling and distinct
recovery explanation. Successful startup adds no compatibility notice.
Compositions that provide no snapshot retain their prior behavior.

Original service ownership, pagehide, unmount and late-success disposal handling
remain intact. The current owner alone can publish its service; controlled
reverse completion and page-exit cases verify disposal of retired results.
Locale changes resolve the selected catalog without repeating the probe or
restarting services. G30 app-link propagation and actual native EVM/Solana entry
branches are unchanged.

The probe, model, guard, notice, locale catalogs, generic sharing helper/leaf,
runtime/storage implementations and configuration retain their exact source.
The snapshot remains untested and uncertified, with unverified storage and no
economic-action permission. Controlled fixtures and static artifacts do not
establish native browser events, durable storage or physical-device acceptance.

## Evidence and failure attribution

The [author report](STARTUP_COMPATIBILITY_GENERATION31_20261120.md) and
[receipt](../execution/startup-compatibility-generation31-20261120/receipt.json)
retain complete command output, exact source patches and artifact records.

| Author evidence | Actual outcome and cause |
| --- | --- |
| Corrected final fixture on original production | 23 cases: **4 lifecycle controls pass / 19 missing-integration assertions fail** |
| First wired composition and sharing | **21 pass / 11 fail**: five sharing-scope failures plus six VM getter-classification failures |
| First fixture correction | **26 pass / 6 fail**: only the VM getter-classification issue remains |
| Corrected wired composition and sharing | **32/32 pass** |
| Frozen focused and adjacent selection | **77/77 pass**, including all 23 new cases |
| Frozen UI TypeScript, boundaries and build policy | Passed; 242/155 boundary counts and **58/58** policy cases |

The existing sharing-only fixture already controls startup and skips effects.
Its approved, labeled inert probe replacement excludes newly legitimate API
presence reads from that fixture while retaining every sharing assertion. The
new startup fixture executes the actual probe, guard, notice and effects.
A retained minimal diagnostic identifies Node's contextified-global behavior:
throwing host getters can appear missing. A separate descriptor-preserving
browser object lets the actual probe distinguish missing from unavailable.
Both failed wired outputs and pre-correction patches remain fixture evidence;
assertions and production helpers were not weakened.

The [independent source review](INDEPENDENT_STARTUP_COMPATIBILITY_REVIEW_GENERATION31_20261120.md)
and [receipt](startup-compatibility-independent-review-generation31.json) record
**53 maintained passing cases** within an initial mixed command that also had
one reviewer module-load failure before its four probes registered. A subsequent
probe attempt lacked standard VM text-codec globals. After those retained setup
corrections, the separate **four-probe command passed**, and UI TypeScript passed.
This is not a claim of one successful 57-case command. Original scripts and
complete failed outputs remain preserved.

The review also retained an artifact-checker failure that treated ignored
dependency files as tracked Git blobs. Its correction hashes actual immutable
dependency bytes while keeping tracked-module Git identity checks. All **45
author-indexed artifacts**, the actual ordinary assets and graph references
were verified without dropping a hash assertion. Author, adjacent, reviewer and
full-suite selections overlap and must not be added together.

## Combined-source qualification

The seven-command coordinator batch ran on the clean frozen combined source
from **2026-11-20 19:09:48.549256 UTC** through **19:11:50.934764 UTC**.

| Qualification | Actual result |
| --- | --- |
| Full Node suite | **2,604/2,604**, zero other outcomes |
| TypeScript | All four configured projects passed |
| Build policy | **58/58** |
| Import boundaries | 242 production files / 155 core modules |
| Default build | 12 files / 817,257 bytes; document/vault-Worker/QR graphs **102/30/4** |
| Demo build | 13 files / 829,355 bytes; graphs **104/30/4** |
| Native updater fixture preparation | Strict 37-module compilation reported; **build only**, `nativeExecuted=false` |

The full-suite raw log is 264,227 bytes, SHA-256
`a069a1b3de4b56b14628764005a10ddef45eb1b9641464bc6041cf46c952f039`.
The [combined qualification](qualification-generation31.json) and
[retained-log index](retained-logs-generation31.json) bind exact source,
commands, times and complete outputs. Deterministic gzip uses `mtime=0` and
retains both raw and compressed hashes.

The [independent composition supplement](INDEPENDENT_STARTUP_COMPOSITION_REVIEW_GENERATION31_20261120.md)
and [receipt](startup-compatibility-composition-review-generation31.json) verified
the finalized root receipt, seven logs, **25 asset entries, six graphs and 274
module references** without repeating the suite or builds. The ordinary artifact
matches the independently checked author artifact. Four maintained compatibility
modules join the document graph and remain outside the vault Worker graph.

Both builds retain `assets/vault.worker-yOnLqpF_.js`, SHA-256
`d3bc5bf253cf1e30914a932e126d2d41bedc19d217d9baa94748975243c04165`.
The native preparation command removed its temporary fixture modules; retained
log, Worker and graphs were verified, without an independent rehash claim for
those 37 temporary modules or a native execution claim. Immutable physical
dependency hardlinks were reused without installation or mutation.

## Integration and remaining gates

**PR236 remains the frozen main-target aggregate for PR233–235**, head
`d9ddcf53d82100f05de7346143a0ad00d43c2c1a`. Preserve those original heads and
branches. Its current-target qualification, expected-head guarded merge and
main/tree/ordered-parent/ancestry readback precede reconciliation of the
contained PRs. This plan supersedes their older sequential merge instructions.

PR237 is the published retention child, head
`33232f62dc9cd250528ef3eb0313c0c319d99495`; PR238 is its published sharing
child. PR238's verified proposed merge is
`db7c4858ad708234d285c1b19cf35d339546e2df`, with PR238's complete tree and
ordered parents PR237 head then PR238 head. At 19:11 UTC the coordinator read
12 PR238 checks queued and Snyk successful. PR236 still had 14 queued checks at
19:14 UTC. These dated observations do not establish merge qualification.

Publish G31 separately above PR238 with a source/evidence mapping and actual
head/base/proposed-merge readback. After each parent merge, retarget or reconcile
against actual main and refresh applicable qualification. Parent checks,
earlier targets and Worker byte identity do not qualify the child.

This standalone integration is **D8 Tier B**. The
[accepted index](../adr/ACCEPTED-DECISIONS-2026-11-04.md) keeps the
[detailed D8 packet](../adr/proposed/D8-merge-policy-and-branch-protection.md)
authoritative. A **CodeRabbit or Qodo pass with findings answered** remains
required alongside applicable green checks and completed independent review.
The named review and hosted acceptance remain unclaimed at this checkpoint.

G32 native prepared funding has separate author/reviewer ownership. Its planned
explicit native preparation entry preserves the browser's exit-only contract;
no source completion or native acceptance is claimed here. Optional PR224–232
and audits184–186 retain their owners. Production trust remains unset, connection
origins remain empty and `ReleaseEnabled=0`; no deployment or release acceptance
follows from this work.

## Historical handoff preservation

New overlays preserve prior files byte-for-byte as suffixes. At documentation
base `0c8f4133c99c9fc44bc0f50d57eac06ca52c69db`:

| File | Preserved bytes | SHA-256 |
| --- | ---: | --- |
| `CONSOLIDATION_HANDOFF.md` | 87,376 | `92638629c72735bc92582d5a06e7421fe54d5b79fab27a08baf2443f8f7fffa1` |
| `FEATURE_MATRIX.md` | 55,096 | `0353df6543965bbe95ca568845f8d8f3bf83a89bfe382c929bed79a5823ce7e6` |

Older present-tense statements remain dated assessments. This checkpoint and
later exact-source receipts govern current coordination.
