# P2P-Offramp consolidation handoff

## Verified starting point and ownership

Read this file and `consolidation-state.json` before modifying code. The user authorizes autonomous source engineering, safe integration and fresh-worker handoffs. Deployment, releases, real funds, credentials and release-setting changes are outside this task. Preserve `ReleaseEnabled=0`.

- Starting/current observed main: `5c5a84ef6300330700c8b0ca54d074ac113f08be`.
- Published combined source: `84814328f5534d6fceb2bbe74509fe37c5b48689`.
- Integration branch: `codex/max-consolidation-20261119`.
- Combined source tree: `0d6d70bb4465c2ce6e9395b602dc3e59a91869b2`, identical to locally tested integration `b13a01b`.
- No main merge has been performed by this generation. Source integration preserves all seven original PR heads as commit parents. The final documentation commit may be newer; resolve the branch before continuing.

## Inventory and integration ledger

`branch-inventory.json` and `BRANCH_INVENTORY.md` classify all 192 branches at the immutable starting main: A108 integrated, B20 duplicate, C41 partial/cumulative, D5 scoped candidates, E2 defective candidates, F11 experimental, G5 obsolete/incompatible, H0 confirmed active writers. 184 PRs were inspected, including 41 open PRs at 40 distinct source heads. No tags/releases existed. These are snapshot counts, not a claim that future branches cannot appear.

All seven D/E candidates are now integrated on staging: #171 QR grouping bounds; #172 typed JCS failure; #174 docs/lab tooling and bounded claims; #179 funded Solana browser recovery; #181 relay readiness; #183 public QR capture/review; #187 pre-copy review bounds. Exact source SHAs and stable completed IDs are in `consolidation-state.json`.

The repair changes add fixed sibling labels to all six QR controls and four Solana controls. Existing strict browser locators remain unchanged. Three Solana/QR build conflicts and the tooling script conflict were resolved by retaining both features and all existing checks. The dedicated QR decoder remains unavailable to private runtime Workers in default, EVM and Solana profiles. A new cross-profile test covers this boundary.

## Independent evidence and tests

The independent bounds/readiness review is in `INDEPENDENT_SECURITY_REVIEW_20261119.md`; tooling review is in `INDEPENDENT_TOOLING_REVIEW_20261119.md`. Source reviewers found no blocking defect in their scopes. QR source tests reproduced the label defect before its correction; another worker reviewed the Solana label correction.

Executed on Node 24.22.3/npm 11.19.1/Python 3.12.14:

| Command / scope | Result |
|---|---|
| Baseline `npm test` | 1,964 passed, 0 failed, 1 skipped |
| Combined `npm test` | 2,072 passed, 0 failed, 1 skipped |
| `npm run typecheck` / `npm run build` / `npm run build:demo` | All four projects and both final artifacts passed |
| `npm run test:build-policy` | 54/54 passed |
| Solana controller/policy/wallet/RPC/prepared-actions | 63/63 passed |
| QR plus bounded review/readiness | 129/129 passed |
| `npm run test:specs` | 32/32 passed |
| `npm run check:specs` / `check:boundaries` | Passed |
| `npm run test:fuzz` | 26/26 passed |
| `npm run test:tooling` | 22/22 passed |
| `npm run test:formal:unit` | 22/22 passed |
| Foundry 1.5.1 / solc 0.8.30, CI profile | 92/92 passed; 4,096 fuzz runs and 256 invariant runs at depth 100 |

The one Node-suite skip requires Foundry cast. Pinned Foundry 1.5.1 and solc 0.8.30 have since been downloaded with their repository-pinned SHA-256 verified; contract CI-profile qualification passed 92/92, with zero failed or skipped tests.

Local Chromium fails before UI initialization because Unix sockets are forbidden by this execution environment. Hosted browser qualification is required, not replaced by source/unit results. Local Solana CLI/validator is absent. Preserve the actual validator/browser workflow. Its two real minimum-duration refund waits each take 1,800 seconds; the hosted gate can take over an hour and must not be weakened to shorten execution.

## CI and policy

Issue #130 concerns orphaned November 11 runs with zero jobs, not a current repository-wide outage. Recent exact source heads pass normal workflows. #181 independently fixes the inherited restored-profile wallet-connect race. Original #183 fails at the changing Selected file format label; original #179 reaches its actual browser then fails at Recovery JSON. These failures are preserved as evidence, not relabelled passes.

Repository workflow sources run tests on main push and PRs; no automatic deployment/release workflow was found, and repository metadata reports Pages disabled. External hooks were not inspected. Do not invoke deployment commands.

D8 accepted tiered policy remains: required checks must pass. Tier B calls for CodeRabbit or Qodo review with findings addressed; an advisory status or skipped review does not demonstrate that review. Source integration is authorized by the current user; do not ask them again merely because an older handoff says approval is pending. Do not weaken gates.

## Retained work and architectural limits

`FEATURE_MATRIX.md` and `feature-matrix.json` map 27 capabilities to source/test paths at starting main. Staging changes above are an overlay, not already-merged main features. Native EVM trading, ERC-20 exits, same-terms resumption, native Nostr interoperability and Solana native recovery already exist on main; older docs describing them as drafts are historical.

Retain distinct source for signed asset update (#40/#56/#81), personalization/drafts/retention, portal/distribution tooling and inert intake/governance (#155/#156). They need selective extraction, not whole old-stack merging. Nine optional reference-package branches remain isolated. Do not restore the old custodial ledger. Solana #179 covers funded exits, not discovery/negotiation/funding parity. BasicEscrow has no arbitration settlement. QR decoding does not authenticate an invite.

## Next worker generation

Three fresh workers were actually launched after this handoff was written: `successor_integration_audit`, `successor_historical_tooling` and `successor_asset_update`. They own isolated review/extraction work. The coordinator owns hosted qualification and this state file.

1. Fetch main and integration refs; compare against exact SHAs above and inspect active changes.
2. Independent auditor: review conflict resolutions in `apps/web/scripts/build.mjs`, `static-build-plugin.mjs`, package scripts and changed UI labels; validate profile isolation and retained gates.
3. Historical extraction worker: review remaining portal/distribution and inert intake/governance source. Own a separate branch/worktree; implement only supported unique work and run its meaningful tests.
4. CI worker: inspect the newly opened integration PR at its exact head; fix actual failures, preserving financial invariants and strict browser assertions.
5. Coordinator: rerun affected combined checks after accepted patches, update stable state IDs and this handoff, and hand the verified result to another fresh worker. No arbitrary iteration count defines completion.

Never overwrite another worker's worktree or source branch. Do not run paid OpenAI/Codex services. Native session workers and direct GitHub tools are available. If shell git push is unauthenticated, GitHub tree/commit/ref tools can preserve the exact local tree and source parents. Verify SHA equality before publishing. Continue other tasks when one gate blocks.
