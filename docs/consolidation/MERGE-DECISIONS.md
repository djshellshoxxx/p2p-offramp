# Merge decisions and policy

## Decision rule

The active owner instruction authorizes merging reviewed, qualified source into
main, subject to existing protection, reviews and verification. It does not
authorize deployment, release enablement, live funds or production trust changes.
`ReleaseEnabled=0` remains enforced.

[D8's accepted tiered policy](../adr/proposed/D8-merge-policy-and-branch-protection.md)
requires `forge`, `local-trade`, `local-evm`, `schemas-and-crypto`, `browser`, `specs`
and `inventory`. Tier B additionally needs CodeRabbit or Qodo review with findings
answered. Tier C requires the owner's written authorization in the PR. The active
owner instruction and exact-source review evidence were recorded in each Tier C
PR before merging. Native independent worker review does not silently replace a
specifically required external review.

The live branch API reported `main.protected=false`; the rulesets API returned an
empty list. The detailed protection endpoint returned 403 with this connector, so
no hidden admin settings are claimed to have been inspected. The written D8 policy
was applied even where hosting did not enforce it automatically.

## Current execution decisions

| PR / branch | Decision | Evidence and reason |
| --- | --- | --- |
| [#169](https://github.com/djshellshoxxx/p2p-offramp/pull/169), documentation reconciliation | **Merged** | Full 15-file documentation diff reviewed; seven required jobs and CodeQL passed; four source heads preserved by ancestry; Tier A |
| [#166](https://github.com/djshellshoxxx/p2p-offramp/pull/166), core hardening | **Merged** | Full changed-production review, 124 local affected tests, exact-head CI, owner authorization, combined tree matched prediction |
| [#167](https://github.com/djshellshoxxx/p2p-offramp/pull/167), Solana client/recovery | **Merged** | Independent 79-file scope review, 277 local tests, actual native validator/Rust evidence, hosted browser/package checks; encrypted recovery and native-validator claims kept separate |
| [#168](https://github.com/djshellshoxxx/p2p-offramp/pull/168), browser parent | **Repaired; closed as incorporated through #170** | React keys and Worker request shape repaired; exact resulting bytes already in #170; unchanged-main merge-tree proof before closing; source branch retained |
| [#170](https://github.com/djshellshoxxx/p2p-offramp/pull/170), ERC-20 browser stack | **Merged** | All applicable hosted checks passed at `189f7b1…`; actual native and ERC-20 Chromium runs; independent token authorizer/observer review; resulting main tree verified |
| [#171](https://github.com/djshellshoxxx/p2p-offramp/pull/171), QR grouping | **B: review gate blocked** | Three regression cases, independent review and seven required jobs pass; Tier B automated review absent, despite ready-for-review status |
| [#172](https://github.com/djshellshoxxx/p2p-offramp/pull/172), JCS descriptor traps | **B: review gate blocked** | RED/GREEN evidence and exact-head required checks pass; Tier B automated review absent |
| [#138](https://github.com/djshellshoxxx/p2p-offramp/pull/138), audit ledger | **Merged** | Head advance to `6fbb087…` was reviewed separately; all seven required and three CodeQL checks then passed. Merge `80375193…` matches the predicted tree. Ledger remains historical evidence, not professional certification |
| [#173](https://github.com/djshellshoxxx/p2p-offramp/pull/173), recovery repair and tests | **B: Tier C repair awaiting real-browser GREEN** | Second hosted failure exposed restored cancelled exits blocked despite a finalized same-nonce consumer. Narrow production repair `c7f462c…` independently reviewed; 31 affected tests and native release/refund diagnostic pass. Current owner source-merge authorization recorded in PR; fresh exact-head browser gates remain |
| [#174](https://github.com/djshellshoxxx/p2p-offramp/pull/174), historical tooling repair | **B: automated review gate** | Full #154 ancestry preserved; stale strict docs repaired; evidence-overwrite and claims-bounds regressions fixed; local checks and all seven required hosted jobs plus docs-tooling pass; Tier B CodeRabbit/Qodo review still absent |
| [#175](https://github.com/djshellshoxxx/p2p-offramp/pull/175), explicit unfunded resumption | **B: hosted qualification pending** | 128 affected tests, typechecks/artifacts and independent review pass; real Worker/browser GREEN required; original consent is reverified, no fresh peer signing epoch claimed |
| #155 → #156 | **B: dependent inert stack** | Keep distinct from #174; intake/container and historical governance records need current-main qualification; only independent tool-path test extracted |
| #26, #28, #35, #37–48, #56/#81 | **C except scoped D/E decisions** | Cumulative branches retain useful unique runtime, personalization, journey, signed-update and portal work; do not infer full incorporation from selected merged features |
| #159 / #84 D1/localnet cumulative branch | **C: retained source/evidence** | Main retains and hardens the signer/build capabilities, but four scoped test/vector-generator paths are absent and all four commits remain patch-distinct. Full branch equivalence is unproven; no closure |
| #142 retirement scripts | **C: selective extraction** | `lines_on_main` ignores ordering, multiplicity and deletions; it is not a complete equivalence proof. No branch/PR retirement based on it |
| Optional #144–148, #160–163 | **B: isolated intake accepted; qualification pending** | The November 18 owner decision supersedes D7's earlier parking option. Each package may integrate through its own reviewed PR with import-boundary checks; default-build wiring requires a separate gate. Current-head source, integration and applicable D8 review still need qualification |
| `feat/custodial-ledger-foundation` | **F: rejected architecture** | Authoritative server PostgreSQL balances/holds conflict with noncustodial client/external-wallet architecture; source retained |

## Preserved history and selective extraction

The [accepted-decision index](../adr/ACCEPTED-DECISIONS-2026-11-04.md) explicitly
supersedes D7's original parking decision with the November 18 acceptance in
[the consolidation gameplan, section 5](2026-11-18-branch-consolidation-gameplan.md#5-decisions-needed-from-the-owner).
Optionality alone is not a rejection or deferral reason. These packages remain
outside the mandatory MVP dependency set, but their isolated source intake is
authorized. Core release completion is not a prerequisite for that source review.

The [historical review](HISTORICAL-BRANCH-REVIEW.md) examines complete relevant
content, not merely commit subjects or test names. #78–80 have identical changed
test files and patch-equivalent changes. Nine full D9 test bodies from #69–75 and
#91–93 are preserved, along with `BROADCAST_UNKNOWN` handling when marking a send
fails. #67's complete ledger matches; #66's complete earlier content remains in
order with a historical banner and appended status. Those are D decisions with
specified scopes, not permission to discard other cumulative branches.

Selected historical value actually ported by this run: #28 commit
`53142afe05912d21bf0b482d859912ba4b5926ab` (lab evidence isolation) and #156's standalone
tool-path regression. Other C candidates remain preserved with exact paths and
dependencies. No ambiguous full-content decision was converted into a closure.

## Traceability and stop conditions

Each merge uses the expected source head, and the actual resulting main tree is
compared with a locally computed merge tree. An external head movement restarts
qualification. Conflicts are recorded in [CONFLICT-RESOLUTIONS.md](CONFLICT-RESOLUTIONS.md).
Public-network trust/deployment, paid agent workflows, physical-wallet access,
professional security signoff and release approval were not manufactured to pass
a gate. Their status remains explicit in [REMAINING-WORK.md](REMAINING-WORK.md).
