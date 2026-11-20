# Generation 13: backup verification browser coverage

November 19 Pacific / November 20 UTC, 2026.

## Scope and source

The accepted browser-compatibility specification requires measured engine
coverage for encrypted export/import, native Workers and IndexedDB. This change
adds Firefox and WebKit qualification for the existing backup verification
journey. It changes no application, Worker, vault, cryptographic or financial
implementation and does not add a package dependency.

- Local base: `bad3b708bb6528cfdc7b1e65e8f29727ad4bbe6e`.
- Exact remote base equivalent, PR215: `e77a2d3e758ee3b416d8d96ecd979526c7ae78ce`.
- Shared base tree: `af568d385edf9792f6e602d864e4c6d3d9a2d64a`.
- Test-source commit: `1280eb2f377d1ceff88352479d4ff830fb551379`.
- Test-source tree: `709dc2eb86dc1abce679a1a5e77ec8ae846af9be`.

Later changes in this branch only clarify developer documentation and record
this report/evidence. The test fixture and workflow remain those of the source
commit above.

## Behavior and CI wiring

`P2P_BACKUP_BROWSER` accepts exactly `chromium`, `firefox` or `webkit`. Omitting
the variable preserves the current Chromium executable resolver and launch
arguments. An unknown or empty value fails before the temporary directory,
application build, HTTP listener or browser launch. Other engines use the
browser binaries selected by the already-locked `playwright-core 1.64.1`.

The existing Chromium job is unchanged. A separate two-engine matrix installs
Firefox or WebKit with the installed Playwright CLI and runs the same maintained
`test:backup:browser` command. Both matrix results are required: there is no
`continue-on-error`, and `fail-fast: false` allows the second result to complete
if the other engine fails. Existing action pins, workflow permissions, source
commands, timeouts and assertion bodies are preserved.

The fixture receipt now includes its actual engine name and host platform along
with the existing browser version. It still requires explicit authentication,
matching file digest, wrong-passphrase refusal, lock/reload cleanup, separate
fresh-key profile verification, three responsive widths, zero wallet prompts,
zero unexpected network requests and `ReleaseEnabled=0`.

## Actual verification

| Check | Result |
| --- | --- |
| JavaScript syntax | Passed with `node --check` |
| Existing workflow preservation | Parsed original/new YAML structures are identical after removing the single new matrix job |
| Fixture preservation | Reversing only the four intentional import/selection/launch/receipt edits reproduces the entire original fixture byte for byte |
| Existing assertions and page timeout | All 18 assertion calls and the 30,000 ms page timeout are unchanged |
| Invalid engine configuration | Unsupported and empty values both exit 1 with `UNSUPPORTED_BACKUP_TEST_BROWSER` before resource setup |
| Installed browser API and CLI | All three engine exports resolve; CLI reports version 1.64.1 and supports engine-specific `install --with-deps` |
| Browser install planning | CLI `install --dry-run firefox webkit` resolves both engines; it performs no installation or launch |
| Documentation consistency and whitespace | Passed; semantic approval remains false |
| Actual Chromium/Firefox/WebKit execution | Not executed by this worker |

A preparatory inspection attempted TypeScript's former `createPrinter` API.
The installed TypeScript 7 package does not expose that function, so that
inspection exited with `TypeError: ts.createPrinter is not a function`.
The corrected exact-source comparison above passed. No product code, test
assertion or compiler dependency was changed to address the inspection failure.

No local browser launch was attempted. The previously observed managed socket
restriction remains in force. Source inspection, syntax and install planning
are not browser acceptance. Existing `security/browser-support.json` and
`security/release-browser-support.json` remain unchanged; Firefox/WebKit,
Safari, mobile and physical-device qualifications are not promoted by this
change. This scope also does not qualify other application journeys or wallets.

## Required continuation

Publish the exact reviewed source, then inspect all three actual backup-journey
receipts on that source: Chromium in the existing job and both new matrix
engines. Preserve failures and repair their concrete causes without weakening
the shared journey. Record executed browser versions, host platform and checkout
tree. Merge only after applicable checks and independent review pass.

The [machine evidence](backup-cross-browser-generation13-evidence.json) records
the scoped checks and retained limitations. No remote ref, hosted workflow,
deployment or release was changed by this worker.

Primary references: the repository's
[accepted compatibility specification](../../00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion/module_0.12.2_cross_device/spec-responsive-mobile-wallet-and-browser-compatibility.md),
[Playwright browser installation](https://playwright.dev/docs/browsers), and
[Playwright CI guidance](https://playwright.dev/docs/ci-intro).
