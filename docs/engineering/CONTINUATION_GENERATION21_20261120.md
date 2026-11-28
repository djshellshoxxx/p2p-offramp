# Generation 21 — locale completion and consolidation handoff

## Result and dated integration state

**The combined locale and recovery-documentation changes are implemented,
independently reviewed and locally qualified.** The frozen composed source
passed **2,430/2,430 tests**, with zero failures, skips, cancellations or todos.
The new integration branch is `codex/continuation-g21-20261120`. At this
prepublication checkpoint, its final published-head hosted checks and guarded
merge remain pending; no PR number or remote source identity is inferred.

Main was independently read back at
`8e836baa877b676a863c877003e277b638fc5061` after the guarded merge of
[PR223](https://github.com/djshellshoxxx/p2p-offramp/pull/223) at
2026-11-20T16:25:14Z. That one-file state reconciliation completed **14/14
checks plus Snyk**. It follows the reviewed runtime merge in
[PR221](https://github.com/djshellshoxxx/p2p-offramp/pull/221) and canonical
documentation merge in
[PR222](https://github.com/djshellshoxxx/p2p-offramp/pull/222).
The new generation 21 feature changes are not part of that main snapshot.

This is source engineering. `ReleaseEnabled=0`, default optional-package
isolation and existing release/trust requirements remain unchanged.

| Checkpoint | Exact identity |
| --- | --- |
| Source base / PR222 main | `388526a474aea0e08f9c04178c2b7f9e1d4bee3f` |
| Fully tested composed source | `758936c54d0b823b96bad99ccfa93520ee175ae6` |
| Fully tested complete tree | `dfd6384a913552c6dc7bb3c2a8bce1b815fa903d` |
| Verified evidence-packaging correction | `dd2aa39c43f4ca2ff2e7afad57415556a59842ca` |
| Packaging complete tree | `762aaf83805abbb6ebf7d1e9b9acd015cf05dc6f` |
| PR223 source head | `7f1c6d6b851926111accaaf3376320b44fcd138b` |
| Read-back main after PR223 | `8e836baa877b676a863c877003e277b638fc5061` |
| Read-back main complete tree | `9693f90d2ef73a06b3557d57ddc2239ae65065f5` |

The [qualification receipt](qualification-generation21.json) binds the exact
source, commands, timestamps, eleven changed code/test blobs, retained log
hashes, artifact hashes and build graphs. Subsequent report and packaging
changes preserve all **1,013 non-documentation entries** from the tested source.
Before publication, the coordinator must confirm that equivalence for the
actual final head and read back its published tree.

## Completed engineering scope

The composition changes exactly **six production UI files and five UI test
files** outside documentation. The **67 added cases** comprise nine backup,
ten shell, ten export-panel, twenty-one vault-form and seventeen QR cases.
All **1,002 other existing non-documentation entries** match the main base.
Packages, contracts, workflows, dependency files, catalogs, services, Workers
and controllers retain their existing implementation.

| Scope and author evidence | Frozen implementation | Result |
| --- | --- | --- |
| [Backup verification](BACKUP_NOTICE_LOCALE_GENERATION20_20261120.md) | `c5908d04c4216fcfbf24485070f81ce7f5bfc440` | Existing verification and recheck notices resolve the selected catalog during rendering; receipt identity and operation ownership remain intact. |
| [App shell](APP_SHELL_LOCALE_GENERATION21_20261120.md) | `6be8acc9f45f5b9036989b380ca537084094faa4` | Navigation, pending text and errors follow the selected catalog. Lock availability uses the pending command kind. The existing ref already suppressed duplicate lock service calls. |
| [Diagnostics and recovery references](EXPORT_PANEL_LOCALE_GENERATION21_20261120.md) | `0046c8288ea18c219c4cc7be79c94d86134d56cf` | Clear, download and refusal notices update while consent, selection, fresh revision reads and exact exported bytes remain intact. |
| [Vault forms](VAULT_FORMS_LOCALE_GENERATION21_20261120.md) | `08acab8908fb9878e91aa2d87d652e8a245051e3` | Unlock, create, unchecked export, restore and reconciliation notices retain semantic values; restored profile IDs and counts remain exact. |
| [QR notices](QR_NOTICE_LOCALE_GENERATION21_20261120.md) | `946c26a28822c4950cf69072d1d445042797c850` | Completed copy and error notices use the selected catalog without repeating camera, decoder, controller, clipboard or download operations. |

The forms now retain existing message keys, error codes or restore-result
parameters instead of already-rendered strings. The original action, consent,
cancellation, retirement, focus, notice-role and byte-preservation behavior
remains. Each author retained the actual failing ordinary regression run and
the corrected result; those counts are source-scoped and overlap later checks.

The tests compile the maintained locale runtime, message views and error mapper
with an explicitly enabled synthetic draft fixture. **Production remains
English-only and draft.** Fixture text is not a translation or semantic
approval. These Node tests qualify component behavior; they do not establish
native browser, screen-reader, physical-wallet or camera acceptance.

## Documentation completed

Six version-controlled pages under `docs/wiki-source` now describe the actual
workflows: User Guide, Developer Guide, Privacy and Recovery, Home, Getting
Started, and Wallet and QR Safety. The
[three-guide author report](USER_WORKFLOWS_DOCUMENTATION_GENERATION20_20261120.md)
and [independent review](INDEPENDENT_USER_WORKFLOWS_REVIEW_GENERATION20_20261120.md)
record the first slice; the
[shell/export/entry-guide review](INDEPENDENT_SHELL_EXPORT_DOCS_REVIEW_GENERATION21_20261120.md)
records the later entry pages.

The guides place backup verification on **Recovery**, describe **Verify this
backup file** and **Recheck verified revision**, and distinguish unchecked
export, point-in-time verification, fresh recheck and separate fresh-key restore.
They explain that creating a profile opens it unlocked, while restoring creates
a separate locked profile that needs its own exported and verified backup.
Public Solana recovery JSON remains distinct from the encrypted private backup
and belongs to the isolated localnet funded-recovery client. Explicit EVM
resumption remains a separate recheck before subsequent wallet review.

The manifest changes only four document hashes and its aggregate link digest.
All source pins, reviewers, approvals, capabilities and claim evidence remain
unchanged. Inspection passes for **seven manifested documents and 191 links**,
with `semanticApproval=false`, `published=false` and the existing six stale
claims still visible. The evidence source remains
`84814328f5534d6fceb2bbe74509fe37c5b48689`. No live GitHub Wiki publication is
claimed.

Useful content from PR178 was selectively retained after checking its pinned
source. Its unique historical work and branch remain preserved; this does not
establish complete incorporation or justify closing that PR.

## Actual combined qualification

One complete `npm test` invocation ran on the frozen composed source from
16:18:41 to 16:24:21 UTC, using Node 24.22.3 and the provisioned pinned Foundry
tools. It reported **2,430 passes and zero failures/skips/cancellations/todos**.
Its decoded log SHA-256 is
`3f2d6f15309b381a03d41dd592d5065d9bb100a3d52abdb93345b162d6a92e48`.

Ten additional commands on the same source completed successfully:

| Executed command or scope | Result |
| --- | --- |
| `npm run typecheck` | All four projects passed |
| `npm run test:build-policy` | 58/58 passed |
| `npm run check:boundaries` | 241 production sources / 148 core entry modules |
| `node apps/web/scripts/build.mjs` | 12 payload files / 794,399 bytes |
| `node apps/web/scripts/build.mjs demo` | 13 payload files / 806,309 bytes |
| `npm run test:tooling` | 44/44 passed |
| `npm run check:docs` | Seven documents / 191 links; semantic approval and publication false |
| `npm run check:governance` | Passed |
| `npm run check:specs` | 173 indexed documents; zero broken links or unindexed documents |
| `npm run test:specs` | 32 Python tests passed |

Build payload counts exclude the separate local build-evidence metadata file.
Default document/vault-Worker/QR-Worker graph counts are **95/30/4**; demo
counts are **97/30/4**. All graphs exclude the asset-update implementation and
optional extension modules. Both builds retain `ReleaseEnabled=0`,
`signedRelease=false`, `releaseAcceptance=false`, empty connection origins and
`connect-src 'none'`. The optional update view remains null by default.

Component and independent selections overlap the complete suite; they are not
added to the 2,430 total. No local browser or unchanged long native financial
journey was repeated. Applicable hosted checks must execute on the final
published source; prior main's passing checks do not qualify this candidate.

## Independent review and preserved evidence

The backup review passed **83/83** focused tests and all four TypeScript
projects. The separate user-workflow documentation review passed the maintained
**16-test** validator suite and checked immutable implementation links and
manifest structure. The combined shell/export/entry-guide review passed
**81/81** focused tests, TypeScript, documentation validation and specification
inspection. The final vault/QR/composition review passed **114/114** focused
tests and verified all eleven composed implementation/test blobs.

Two Low findings raised during combined review were resolved and independently
rechecked:

1. Getting Started incorrectly asked the user to unlock immediately after
   creating a profile. Commit `d72015a90705fed73f2c94ec316ef1fe5c662218`
   corrects the sequence and updates only that page's integrity bookkeeping.
2. The complete branch whitespace check failed on retained raw execution logs
   and one report's final blank line. Commit
   `dd2aa39c43f4ca2ff2e7afad57415556a59842ca` preserves the exact raw log bytes
   in gzip files and removes that one extra newline. The complete check then
   passes; the original failed evidence remains available.

See the [independent backup review](INDEPENDENT_BACKUP_LOCALE_REVIEW_GENERATION20_20261120.md),
[independent shell/export review](INDEPENDENT_SHELL_EXPORT_DOCS_REVIEW_GENERATION21_20261120.md)
and [independent vault/QR/composition review](INDEPENDENT_VAULT_QR_LOCALE_REVIEW_GENERATION21_20261120.md).
No open finding remains in their assigned scopes.

The [retained-log index](retained-logs-generation21.json) verifies **46** gzip
entries against 21 previously committed raw logs and 25 separately captured
execution logs. Both compressed and decoded hashes and lengths are recorded.
The [QR receipt](qr-notice-locale-generation21.json) separately retains five
compressed author logs. Original source/report identities remain in their
receipts; an applied documentation commit may have a different identity after
cherry-picking, so remote reachability must be checked rather than assumed.

## Branch consolidation completed

The [independent dated census](live-consolidation-review-generation19.json)
enumerated **234 branches and 54 open PRs** at its original observation. Those
are historical census counts, not an assertion about the current live totals.
The [contained-PR reconciliation](contained-pr-reconciliation-generation20.json)
records closure of **PR189, 190, 201, 202, 203, 204, 206, 208, 209, 210 and 211**
after verifying each exact head was already in main. All eleven remote source
heads were read back unchanged after closure. This required no further source
merge or branch deletion.

The [PR223 completion receipt](consolidation-completion-generation20.json)
records the final exact-source checks and guarded merge. Its initial WebKit
attempt was canceled during Ubuntu package installation; the same-head targeted
retry executed the actual backup journey successfully. The earlier canceled
attempt remains in the evidence. Existing job aliases in the retry do not prove
that already-completed jobs executed again.

PR178 and PR200 retain unique historical content and remain preserved. Audit
PR184–186 retain their separate ownership. Original optional PR191–199 remain
separate and unwired. A subsequent root refresh also observed nine main-target
optional staging PR224–232; these are separately owned scopes, not part of this
locale integration. No bulk optional merge or substitute review approval is
implied. The dated `consolidation-state.json.main_sha` records PR222. PR223's
new merge SHA alone is not a reason to open another state-only reconciliation PR.

## Remaining work and restart procedure

The preceding source, documentation, census and review scopes used eleven
completed native workers. Further workers should own concrete, nonoverlapping
tasks and report exact source and actual execution, rather than repeat completed
qualification or maintain competing status stamps.

| Scope | Concrete remaining condition |
| --- | --- |
| Generation 21 integration | Publish the frozen composition and evidence, read back its exact head/tree, inspect applicable current-head hosted logs, then use an expected-head guarded source merge when all required gates pass. |
| F19 localization/accessibility | Complete supported translations and semantic review; qualify zoom, RTL, keyboard, screen-reader and mobile behavior on the relevant browsers/devices. Synthetic draft fixtures supply no such approval. |
| F24 signed update | Complete the trusted runtime composition and exact own-lock lifecycle/backup adapter under the accepted contract. Owner-controlled trust and origin configuration remain separate inputs; do not invent them or enable the default updater. |
| F16 Solana | Existing funded exits and public recovery export are the implemented UI scope. Full discovery, negotiation and funding require accepted protocol/carrier scope and their own implementation/qualification. |
| F22 optional packages | Preserve each separate package and review it on the intended current core with applicable standalone review and native/provider/device evidence. Keep default imports disabled. |
| F25 documentation | Retain source-bound claim limitations, complete genuine remaining drift and publish the live Wiki only through an available authorized path with read-back evidence. |
| F10 / F18 / F27 external acceptance | Physical wallets/cameras/mobile devices, deployment trust and production release remain separate qualification or owner-controlled decisions. Release stays disabled. |

Resume by reading this report and its qualification, review and consolidation
receipts, then refresh main, the integration branch/PR, live CI and active
ownership. A newer PR body or source-bound hosted receipt supplies publication
status after this prepublication snapshot. Confirm all 1,013 non-documentation
entries still match the tested source before reusing the local evidence.

Read actual completed hosted logs and their executed checkout/tree. Preserve
the existing financial assertions, send accounting, real refund waits and
browser fixture-error checks. Do not rerun unchanged 1,800-second local journeys
or weaken CI to manufacture completion. Keep failed attempts source-bound.
If a genuine new defect requires changes, freeze a new source, run the affected
checks and obtain applicable independent review before renewing integration.

After a successful guarded merge, read back main, its tree and ordered parents
and record that concrete result in the PR/continuation handoff. Preserve original
branches and the historical evidence below the current overlays. Source merge
authorization does not change release, deployment or real-funds constraints.
