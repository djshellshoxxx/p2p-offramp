# Generations 24–25 — native updater preparation and privacy locale repair

## Result and frozen source

**The native backup-selection/updater fixture is prepared, and privacy
observations now render through the selected locale.** The frozen combined
source passed **2,478/2,478 tests**, with zero failures, skips, cancellations or
todos, plus all eleven additional qualification commands. Native browser
execution remains pending. Production trust remains unset, the default updater
remains unconfigured and `ReleaseEnabled=0`.

| Checkpoint | Exact identity |
| --- | --- |
| Observed main | `8e836baa877b676a863c877003e277b638fc5061` |
| Published [PR233](https://github.com/djshellshoxxx/p2p-offramp/pull/233), targeting main | `92663e46508b06645111d9c713beb82d3a6d1a0f` |
| Published [PR234](https://github.com/djshellshoxxx/p2p-offramp/pull/234), targeting PR233's branch | `477777dc152cd3148ba7f25a75ce8f00dc1b03b5` |
| Frozen combined child source | `1a52c1c4f53a97cbbd0937f14a4379b88fd249b8` |
| Frozen combined child tree | `26938456c4924e4792a5671183a0879e86f8b7a2` |

The child branch is `codex/native-update-locale-continuation-g24-20261120`.
Relative to PR234, it changes eight non-documentation paths, of which only
[PrivacyStatusPanel.tsx](../../apps/web/src/ui/PrivacyStatusPanel.tsx) is production
code. The other changes are tests, isolated fixtures, their command and one
additive CI step. Evidence commits follow the frozen implementation separately.

## Generation 24: native composition fixture

Author source `bc330e07b1cad13490bb5b1880f89c55e952f97e` changes six
test/harness/CI paths and no production source. The
[author report](NATIVE_UPDATE_RUNTIME_GENERATION24_20261120.md) and
[independent review](INDEPENDENT_NATIVE_UPDATE_RUNTIME_REVIEW_GENERATION24_20261120.md)
retain the exact delta and preparation results.

The [fixture](../../scripts/fixtures/update-runtime-browser.ts) binds
`backup: { capture: services.captureBackupSelection }` directly. No extra
production backup adapter is missing. Hosted execution will use the exact
default artifact's module Worker, maintained encrypted vault and native
IndexedDB with the actual runtime, controller, transport and signature checks.
HTTP bytes, accepted-floor storage, wallet ownership, gesture, destination,
release time and response scheduling remain controlled fixture ports. The
destination callback observes a verified URL without navigating.

Six scenarios implement missing/export-only proof refusal, verified acceptance,
persisted vault mutation between fresh checks, held own-lock acknowledgment,
cancellation while that lock drains, and an admitted competing opening. The
bounded attempt ledger gives each acceptance its own identity and promise; six
Node cases cover result isolation and the 32-attempt limit.

**No native scenario executed locally.** Managed Unix-socket policy blocks the
required browser launch. Passing `--build-only` preparation explicitly reports
`nativeExecuted: false`. The existing Chromium job adds the full browser command;
build-only success does not qualify that gate. Existing jobs, timeouts and
financial assertions are preserved.

Independent preparation and **46 distinct Node cases** passed with no findings.
The separate six-case helper invocation repeats its helper subset. Author
59-case runtime/updater and 50-case tooling selections retain separate receipts.
Initial preparation errors concerned an import-parser false match; their retained
file contains **partial captured error excerpts**, not complete original logs.
Complete corrected-run logs remain separately identified.

## Generation 25: selected-catalog privacy observations

Author source `ad7d5bb1487f6ce612a8ac2a69058e21b27aec1b` repairs the panel and
adds [eight regression cases](../../apps/web/test/privacy-status-locale.test.mjs).
The [author report](PRIVACY_STATUS_LOCALE_GENERATION25_20261120.md) records the
test-only baseline `cc395f47cd4db5f5e15eba54fd1cce00b95c65af`: all eight fail
against the original panel, then the identical cases pass after correction.
These reproduce one display defect across eight observation states.

The panel uses maintained runtime message views. State, reason, source and
channel maps retain semantic message keys and resolve them during rendering.
Reader, effect and transport code is unchanged; the existing App subscription
owns locale rerenders. Fixed-clock cases preserve mounted resources. The panel
already samples observations on every render, so this does not establish zero
inspections or an unchanged deadline when time advances.

The frozen author selection passed 51/51, including the eight new cases, plus
four TypeScript projects and import boundaries. The
[independent review](INDEPENDENT_PRIVACY_STATUS_LOCALE_REVIEW_GENERATION25_20261120.md)
reproduced the eight-failure baseline and passed 51/51 plus the UI TypeScript
project, with no standards or specification findings.
The controlled fixture switches English, a synthetic development catalog, and
English again without remounting. Its Arabic tag wraps English draft text;
production remains English-only/draft, without translation approval. Two earlier
harness failures remain separate from the authoritative eight-failure baseline.

## Combined qualification and retained evidence

The single full-suite invocation ran from 17:44:55 to 17:46:36 UTC. Its raw log
SHA-256 is `af8a94d0ffb79c6974287e394b4015426069e2795bbf7b959a154232e5b7f87f`.
All twelve commands completed by 17:47:32 UTC on exact `1a52c1c`.

| Additional command | Actual result |
| --- | --- |
| Type check | Four projects passed |
| Build policy | 58/58 passed |
| Import boundaries | 241 production sources / 148 core modules |
| Default / demo builds | 12 files / 795,653 bytes; 13 files / 807,751 bytes |
| Native fixture preparation | 37 modules; `nativeExecuted: false` |
| Tooling | 50/50 passed |
| Documentation | Seven documents / 191 links; semantic approval and publication false |
| Governance | Passed |
| Specification inventory | 173 documents; zero broken links or unindexed documents |
| Python specification tests | 32/32 passed |

The [combined receipt](qualification-generations24-25.json) and
[retained-log index](retained-logs-generations24-25.json) bind commands, timings,
source and hashes. Focused selections overlap the full suite; the helper cases
also overlap tooling/build-only preparation. Counts are not added together.
The prepared fixture modules and emitted vault Worker match generation 24;
document bundles change with the privacy repair. No claim of wholly unchanged
production artifacts follows.

Dependency locks, privacy policy, vault/updater implementation, production locale
configuration and default optional-package isolation retain their base source.
Evidence-only followups must preserve every tested non-documentation blob.

## Integration order and remaining work

At the dated 17:42 UTC snapshot, PR233 had fourteen queued checks and PR234 had
twelve; earlier snapshots recorded Snyk success. Current-target hosted acceptance
remained pending. The child is not published or merged at this checkpoint;
subsequent exact-source publication receipts supersede this status.

1. Keep both parent heads frozen. Read completed applicable logs and verify their
   checkout and proposed-merge tree. Merge qualified PR233 using its exact expected
   head, then read back main and ordered parents.
2. Retarget PR234 to main and requalify that target before its guarded merge.
   While PR234 remains open, publish this child against its branch; verify the
   remote source/tree mapping and require the child's current-target gates.
3. Revalidate source and target after each retarget. Preserve failed attempts,
   gate strength and financial assertions. Update concrete PR results without
   starting an endless sequence of state-only PRs.

A successful hosted fixture would qualify only its bounded native composition.
Native accepted-floor durability, physical wallet quiescence, trusted activation,
actual navigation, destination startup, cross-origin storage/restore and trusted
application configuration remain separate requirements. Supported-locale review,
assistive technology, physical devices and full Solana negotiation/funding remain
unfinished. Do not repeat unchanged long financial journeys or bypass the local
browser restriction.

Optional PR224–232 and audits 184–186 remain with their separate owners. Preserve
their histories and default exclusions. No deployment, release, live-funds
operation, trust provisioning or default activation follows from this work.
