# P2P-Offramp consolidation handoff

## Current source and authority

Read this file and `consolidation-state.json` before changing code. The current user authorizes autonomous source engineering, qualified integration and successive native-worker generations. Keep `ReleaseEnabled=0`; deployment, releases, real funds, credentials and settings changes are outside this task.

| Reference | Exact value |
|---|---|
| Starting and latest observed main | `5c5a84ef6300330700c8b0ca54d074ac113f08be` |
| Primary consolidation PR | #188, `codex/max-consolidation-20261119`, observed head `a728ce290eb2fcbe9b4a9e857cc84ced401da70f` |
| Generation 1 source | `84814328f5534d6fceb2bbe74509fe37c5b48689`, tree `0d6d70bb4465c2ce6e9395b602dc3e59a91869b2` |
| Qualified QR browser repair | #189, head `9611d6a5cb404fed5d41eeb176dafb31c01de640`, tree `938b76f923df166717ef522666575e37a0623825` |
| Generation 2 initial source | `ac9a4b0ffc3ca50a299398e72554e7964a634cd4`, tree `f3ee86ab68eb60e4ab516037c58c9c498fc30ff4` |
| Generation 2 final source | `ef9d74258de63e98917c7a34a9392076ff86c35c`, tree `0fadc2154399d6bd70f6d988fa2670a84fa8c74b` |
| Generation 2 branch | `codex/historical-recovery-20261119`, a child of the primary consolidation branch |
| Local tree-identical final source | `f29422b6afdf7973e102edaed3a83bd48671bbde` |

Resolve live branch heads and open PRs before continuing. This handoff is committed before opening the generation 2 PR; find that PR by its head branch. Later metadata commits do not change the qualified source tree recorded above. **No main merge has been performed by this operation.**

The generation 2 source commit retains generation 1, the complete historical audit stack `06c6b9ab3728fcf743b2c003dd69b0310078b0ad`, and QR repair `9611d6a` as parents. Selective historical extractions preserve original source IDs and exact blob comparisons in their reports; whole obsolete runtime stacks were not merged.

## Inventory and completed source

`branch-inventory.json` and `BRANCH_INVENTORY.md` retain the immutable 192-branch baseline: A108 integrated, B20 duplicated, C41 partial/cumulative, D5 ready candidates, E2 defective candidates, F11 optional/experimental, G5 obsolete, H0 confirmed active writers. The initial inspection covered 184 PRs, including 41 open PRs at 40 distinct heads, with no tags or releases.

`REDISCOVERY_20261119.md` records a later 194-branch/186-PR snapshot: every original branch still had its original head; only owned #188/#189 source branches were new. The subsequently published historical-recovery branch is another owned addition. Do not rewrite the baseline counts as if they were live counts. No external active writer was confirmed.

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

Stable completed IDs and full SHAs are in the state file. Twelve newly reproduced repair cases are tracked separately from the recovered upstream fixes: two control-label defects, four updater lifecycle cases, two governance snapshot cases, current distribution artifact-role drift, template diagnostics, synthetic camera frame production and the trusted-activity browser oracle. The additional QR/Solana profile isolation assertion is an integration check, not a separately counted defect.

## Executed verification

Environment: Node 24.22.3, npm 11.19.1, Python 3.12.14. Foundry 1.5.1 and solc 0.8.30 were obtained with repository-pinned hashes verified. Runtime and framework dependencies remain pinned; no dependency version changed in these generations.

| Scope | Actual result |
|---|---|
| Starting `npm test` | 1,964 passed, 0 failed, 1 skipped |
| Generation 1 `npm test` | 2,072 passed, 0 failed, 1 skipped |
| Subsequent cast-dependent wallet oracle | 14/14 passed, zero skips; this is separate evidence, not a rewrite of the original skip |
| Generation 2 initial full suite | 2,152/2,152 passed, zero failures/skips |
| Generation 2 final full suite, including recovered vector generator | **2,153/2,153 passed, zero failures/skips** |
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

The full final command was `FOUNDRY_BIN=<verified-toolchain> FOUNDRY_SOLC=<verified-solc-0.8.30> npm test`. Use physical dependencies within each checkout: a symlink to another checkout's node_modules violates the maintained source-bound build policy. Source-specific reports include reproduction commands and log digests; the state file also retains main verification-log hashes.

Independent review documents include `INDEPENDENT_SECURITY_REVIEW_20261119.md`, `INDEPENDENT_TOOLING_REVIEW_20261119.md`, `INDEPENDENT_INTEGRATION_REVIEW_20261119.md`, `INDEPENDENT_EXTRACTION_REVIEW_20261119.md`, `INDEPENDENT_HISTORICAL_TOOLING_REVIEW_20261119.md`, `INDEPENDENT_PERSONALIZATION_REVIEW_20261119.md` and `GENERATION2_INTEGRATION_REVIEW_20261119.md`. No open High or Medium finding remains in these reviewed integration scopes. New optional extractions need their own reviews.

## Hosted qualification and current gates

`HOSTED_QUALIFICATION_20261119.md` records actual hosted evidence, not a local-browser claim. PR #189 at `9611d6a` passed all seven original required contexts plus docs-tooling and native Nostr. Browser run `44640970749`, job `135971620360`, completed all ten maintained browser command groups. Its QR receipt records six journeys, real module Workers and bitmap decoding, real stream capture/cleanup using a synthetic camera source, actual encrypted vault lock clearing, and zero unexpected requests. It does not qualify a physical camera. Native EVM and ERC-20 browser steps also passed.

The hosted checkout `0b4567e88048d52a8ae4bd0c7d8ca4b23006f079` and head `9611d6a` have the exact same tree `938b76f9…`. Their identity was checked through GitHub Git-commit responses.

At the retained observation, both Solana jobs had passed vectors, tool setup, build, lint, LiteSVM and IDL verification, and were still at real-validator acceptance step 14:

- #188: run `44639090596`, job `135965138780`.
- #189: run `44640971208`, job `135971622812`.

Their subsequent real browser refund step remained pending. Each workflow contains two real 1,800-second minimum-duration refund waits. Preserve those waits and avoid changing qualified heads merely to refresh documentation. Read current statuses before acting; do not infer completion from elapsed time.

Generation 2 still needs its own exact-head hosted qualification, including the newly restored portal and distribution browser steps. The browser checkout now fetches full history because unsigned staging verifies immutable documentation source bytes. Existing checks, permissions and fail-closed behavior remain intact.

Local Chromium cannot launch because the execution environment forbids the required Unix socket behavior. Do not bypass that control or relabel source tests as browser passes. Issue #130's zero-job November 11 runs are historical; actual hosted jobs are executing now. No deployment or release workflow was added or invoked.

## Policy and historical evidence

Use the canonical accepted-decision index with the current user directive. Both combined integrations contain Tier C recovery/release-verification paths. Current source-integration authorization is already provided; do not ask for it again. Required exact-head checks, applicable native/browser qualification and independent review with no open High/Medium finding remain mandatory. The accepted Tier C text does not separately establish the older Tier B named-bot condition as an additional gate for these combined PRs; assess any standalone Tier B change and actual server-enforced rules on their own terms.

**D7 parking was superseded on November 18.** The nine optional packages are accepted for independent, one-package-per-PR source extraction with import-boundary checks. They are not rejected merely because their default app composition remains incomplete. No source acceptance activates financial, network, device or release authority.

Governance currently checks 12 historical records, zero pending records, and 57 assurance rows. Thirteen non-owned references are stale after current changes; this is reported explicitly. The original immutable assurance source remains `8649b7a1994ec21fe5557179d44e861b746bcda8`. Do not promote historical receipts to current execution, remove stale rows, or rebind them to make a check green.

## Active successor work and remaining functionality

Generation 2 actually launched five fresh workers for combined review, historical tooling, asset update, personalization and independent extraction review. Generation 3 actually launched rediscovery, a new integration audit and hosted qualification, followed by three optional-source workers. The integration auditor is now independently reviewing the first optional group.

| Owner | Package scope | State at this handoff |
|---|---|---|
| optional_source_a | proof-inputs, liquidity, privacy-policy | Three separate clean local branches qualified; cross-review running. Package tests 21/21, 28/28 and 21/21. Default output remains byte-identical to the generation 2 base. |
| optional_source_b | arbitration, courier, meetup | Final package tests 38/38,61/61 and95/95 passed. Courier/meetup returned-adapter diagnostic regressions were reproduced and repaired; separate clean branches await independent review. |
| optional_source_c | privacy-controls, stealth, proof-jobs | Proof-jobs source passed30/30 and its real Node Worker memory cap check; browser remains pending. Privacy-controls and stealth diagnostic repairs are active. Retain all custom gates. |

Each uses base `ac9a4b0…` and its own `codex/optional-<package>-20261119` branch/worktree. Full original source IDs and current known local heads are in `optional_queue`. Do not edit another worker's worktree. Publish and qualify each package separately; old source-head green checks are not new extraction-head qualification.

Remaining application work is explicit: personalization has internal encrypted consumers but no current UI/Worker composition; the updater has internal source but no active update UI or trust-root configuration. Solana funded exits are not full discovery/negotiation/funding parity. BasicEscrow has no arbitration settlement, and optional diagnostic arbitration cannot create it. QR decoding does not authenticate an invite. Physical wallets, camera/print/device coverage and owner-controlled trust inputs remain separate.

#155 intake remains preserved at its immutable source with its Waku signed-64-bit regression, mobile-wallet roundtrip failure, incoherent XMTP snapshot and unexecuted pinned-container qualification. These are concrete limits, not reasons to drop supported optional source packages.

## Exact continuation

1. Fetch main and all owned source branches. Read current handoff/state, latest PR heads, checks and active ownership. Keep the original inventory as a dated baseline and record only new deltas.
2. Finish independent reviews and any reproduced repairs in the nine optional package branches. Preserve current runtime, dependencies, old gates and one-package-per-PR review scope. Run their custom qualifications and verify absent default imports.
3. Resolve the generation 2 child PR by head branch; inspect its actual portal/distribution, existing browser and native gates. Preserve the still-running Solana heads/waits. Repair any real failure in an isolated branch and continue unrelated source work.
4. Integrate only qualified source. Recheck the combined tree after significant batches; do not transfer old-head checks to changed code. Main remains unchanged until applicable gates are satisfied.
5. Keep explicit partial UI scopes and known experimental limits. Source acceptance does not invent missing trust roots, counterparties, custody or settlement authority.
6. Update the ledger with exact commits/tests/PRs and hand it to fresh workers. Continue the accepted-scope feature gaps after source recovery; do not restart solved D9/retention work or manufacture tasks.

Existing hourly continuation automation `Automation_ab68cc67e6ac8191bd31dc2d84a085e1` is enabled and was updated for this operation. It supplies scheduled resumption, not an assertion that completed workers run permanently. Keep its prompt aligned with live source/PR heads without duplicating the schedule. Native agents and GitHub tools are available; do not invoke paid OpenAI/Codex services. If shell push lacks authentication, create Git blobs/trees/commits through the connector and verify exact local/remote tree equality before updating only the owned ref with an expected-head lease.
