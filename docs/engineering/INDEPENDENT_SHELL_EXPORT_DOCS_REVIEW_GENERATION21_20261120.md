# Generation 21 — independent shell, export-panel and entry-guide review

## Result and scope

**One Low documentation finding was corrected; no actionable finding remains
in this review's assigned scope.** This is a fresh independent source review of
the App shell, diagnostics/recovery-reference presentation and three entry
guides. It does not claim review of the separately assigned VaultForms or QR
implementation changes, or approval of the complete final integration.

| Checkpoint | Exact identity |
| --- | --- |
| Base main | `388526a474aea0e08f9c04178c2b7f9e1d4bee3f` |
| Initially reviewed and executed composition | `0457f0bac49276eb82ec0677b0c96ce226de1d45` |
| Initial composition tree | `4cc1e43b65d8349b242bca18b77d5db70ed91d66` |
| App author source | `6be8acc9f45f5b9036989b380ca537084094faa4` |
| Export-panel author source | `0046c8288ea18c219c4cc7be79c94d86134d56cf` |
| Initial entry-guide change | `c73555deec80bc8b8afd8cf270d915ba3f959f92` |
| Corrected review source | `d72015a90705fed73f2c94ec316ef1fe5c662218` |
| Corrected source tree | `7cabddd6233c40d35ef00be48cfb7f789b3f3053` |

The reviewer used a separate worktree at each immutable checkpoint. Only
`Getting-Started.md` and its document/link integrity hashes change between the
initial and corrected compositions. All executed application and test bytes
remain identical. This receipt is a subsequent documentation-only commit.

## Resolved Low finding

The new getting-started sequence initially told the reader to create a profile
and then unlock it. Successful `AppServices.create` returns an unlocked profile,
and Home displays that state. The redundant unlock instruction did not match
the actual first-session flow.

The coordinator corrected step 1 in `d72015a`: creation opens the new profile
unlocked; an existing profile uses **Unlock existing profile**. The reviewer
checked the correction against `CreatedProfile`, the create facade and Home,
then reran the documentation inspector. Only the intended wording, that page's
SHA-256 and `linkReportDigest` changed. This review is not a clean-from-start
claim.

## Source findings

The App stores the pending command kind and completed error code. Existing
messages resolve during rendering, and navigation uses the same four routes
with render-time labels. The Lock button uses the command kind for its disabled
state. Command sequencing, the duplicate-lock ref, lock preemption, mounted
checks, route focus and service calls remain intact. Locale selection changes
presentation without issuing another command.

Diagnostics retains a `downloaded`/`cleared` key; recovery references retain
their existing error code or download key. Rendering resolves the selected
catalog. Selection and consent, preview bytes, canonical export data, explicit
download, revision-pinned fresh reads, cancellation, retirement and focus
behavior are unchanged. The tests check byte correspondence and operation
counts alongside the visible notice changes.

Both new test files bundle the maintained locale runtime, live message views
and fixed error mapping with explicitly compiled synthetic draft copy. Their
controlled hook/service harnesses qualify component handlers and presentation;
they do not constitute DOM, native browser or durable Worker qualification.
Production still configures no translated fixture, and the catalogs and locale
eligibility rules are unchanged.

The entry guides now describe the actual Recovery/backup controls and public
QR review. They keep local confirmation separate from wallet, trade and restore
authority, preserve the physical-device limitation, and distinguish the isolated
Solana recovery client from the default artifact. The prior Home checkpoint
paragraphs are byte-preserved under explicit historical headings. The earlier
three-guide review remains separately recorded in
[its generation 20 receipt](INDEPENDENT_USER_WORKFLOWS_REVIEW_GENERATION20_20261120.md).

## Structural verification

The following blobs match both their author sources and the initial/corrected
review compositions:

| Path | Git blob |
| --- | --- |
| `apps/web/src/ui/App.tsx` | `dbe9409c37ee813e77262cfbaa948d00c6dfa886` |
| `apps/web/test/app-shell-locale.test.mjs` | `93f73f9cdab1b6792efabd92cad0fb4599c27e89` |
| `apps/web/src/ui/DiagnosticsPanel.tsx` | `bcac237d9be90909d4d425067a5bfd51efe931a6` |
| `apps/web/src/ui/RecoveryReferencesPanel.tsx` | `99e24e5dd2a49852af2725a052c192c00c1cdf6e` |
| `apps/web/test/export-panels-locale.test.mjs` | `b4f45a453d747f4985c32a1867767beda26d66ea` |

Against base main, the documentation manifest changes only the Home,
Getting-Started, Privacy-and-Recovery and Wallet-and-QR-Safety document hashes,
plus `linkReportDigest`. Restoring those five values produces structural
equality with the original manifest. The prior Privacy change belongs to the
separately reviewed generation 20 work. `sourceCommit`, reviewers, approvals,
capabilities and all other metadata remain identical. The claims register,
catalogs, locale runtime, error mapper, AppServices and npm manifests/lock are
byte-identical to base main.

## Independently executed checks

| Check | Result and source |
| --- | --- |
| Eleven affected shell/export/locale/navigation/render suites | **81 passed**, 0 failed/skipped/cancelled/todo, on `0457f0b` |
| TypeScript | All four projects passed on `0457f0b` |
| Maintained documentation-validator tests | **16 passed**, 0 failed/skipped/cancelled/todo, on `0457f0b` |
| Specification audit | **173 indexed documents**, 0 broken links or unindexed documents, on `0457f0b` |
| Documentation inspection | Passed on initial and corrected sources: 7 documents and 191 links |
| Exact-source comparison and whitespace | Passed on corrected `d72015a` |

The focused command selected `app-shell-locale`, `export-panels-locale`,
`locale-runtime`, `locale-catalog`, `locale-source`, `locale-selector.render`,
`locale-stress`, `ui-routes`, `trade-ui-navigation-lifecycle`,
`recovery-references-ui-lifecycle` and `panels-misc.render` test files under
`apps/web/test`, using the maintained TypeScript loader. Documentation checks
used `inspectDocs`, `scripts/docs/validate.test.mjs` and
`python scripts/spec_audit.py --check`. No full suite or long native journey was
repeated by this reviewer.

Raw local review evidence is retained in
`/workspace/scratch/dcf03ef9bee8/shell-export-docs-review-g21-evidence`:

| File | SHA-256 |
| --- | --- |
| `focused.log` | `6e6646b03d85f9e3f08b1cf3cda905aa5280d9503b98611cd3c6962c7b4a8f19` |
| `typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `docs-tests.log` | `638572f8c20880619d927e708f3c9a53e6f7f4408a36f0251ecf0b28a2ed289e` |
| `specs.log` | `2cf32f195ca4fb478a4387e1998b6948d74ba38dfa9770e75658bb01c6410f10` |
| `docs.json` | `73cd41a6b63351804ac8f40be3d1e2e01f3f237e04fc3b174b38de28b3e771b4` |
| `corrected-docs.json` | `c412e159fb55287541e62b7d12f68516743e09108fce56e7fd8cdeec57c5179f` |
| `structural.json` | `bd590704bec31a3440c3bfa86f13bb0c6ef8577feaa2903c4008f88cbec77e5d` |

The corrected inspector retains source pin
`84814328f5534d6fceb2bbe74509fe37c5b48689`, `semanticApproval=false`,
`published=false`, English-source drift and the same six stale claim rows.
Manifest hashing is integrity bookkeeping. No semantic translation approval,
deployment, release, physical-device acceptance or remote mutation occurred.
The coordinator owns final combined-source qualification and must verify these
assigned blobs remain unchanged after the disjoint work is composed.
