# Verification results

Tests are source-pinned. PASS means the stated invocation actually completed;
FAIL, BLOCKED and NOT RUN are separate. Overlapping suites are not summed into a
fictional count of unique tests. An older successful head never qualifies a newer
head. User date: November 18, 2026 (America/Los_Angeles).

## Combined current main

Source `91ee6991d4527bba0e76b048a76e65ed7693c5a1`, tree
`c494301afcf9577175d68f64dda924d6b8fe3c39`; Node 24.22.3, npm 11.9.0.

| Invocation | Result | Scope / limit |
| --- | --- | --- |
| `npm ci --ignore-scripts --no-fund --no-audit` | PASS | Pinned root dependency installation; no lifecycle scripts |
| `npm test` | **PASS: 1,942 passed, 0 failed, 1 skipped** | 1,943 test declarations; optional `cast calldata` oracle skipped because Foundry was not in that invocation's PATH; duration 332.6 s |
| `npm run typecheck` | PASS | All four configured TypeScript projects |
| `npm run test:specs` | PASS: 32 tests | Python spec/oracle suite, pinned cryptography dependency closure |
| `npm run check:specs` | PASS | Structural/spec inventory; not semantic product completion |
| `npm run check:boundaries` | PASS | Default core import closure and excluded module rules |
| `npm run test:build-policy` | PASS: 50 tests | Artifact, graph, locale, import and retained-inventory verification regressions |
| Default `buildWeb` CLI | PASS | Actual emitted default assets and policy scan; release disabled |
| Demo `buildWeb` CLI | PASS | Actual synthetic demo assets and policy scan |
| `verify-web-artifact` against independent retained inventories | PASS | Default: 10 payload assets; demo: 11. Exact bytes, selected build mode, release-disabled flags and inventory identity verified |
| Foundry `forge test`, pinned Solc 0.8.30 | PASS: 92/92 across 7 suites | Native/ERC-20 contracts, fuzz/invariant and vector tests; 0 failures/skips |
| Direct localnet CLI build | Expected refusal: `LOCALNET_CONFIG_REQUIRED` | Correct boundary: localnet is a library-only fixture requiring an explicit pinned registry/layout/loopback relay, not an env/CLI-enabled production profile |
| Native ERC-20 controller and independent recovery scripts | PASS | Seven main checks (8 sends/8 markers), four independent recovery checks (3 sends/3 markers); separate synthetic fixtures |
| `npm audit --json` | PASS: 0 findings | Fresh root graph; advisory withdrawal verified separately |
| `npm audit --omit=dev --json` | PASS: 0 findings | Production subset only |

## Independently inspected merge gates

| Exact source | Actual evidence | Result |
| --- | --- | --- |
| #169 `db319837…` | Full 15-file docs diff; seven required checks plus CodeQL; four original source heads preserved | PASS; merged `9620890…` |
| #166 `9bc9aa83…` | Independent full 38-file change review; 124 affected local tests; all seven required jobs, CodeQL, Snyk | PASS; merged `22711c1…` |
| #166 hosted | [Vault run 44319524969](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44319524969), [EVM 44319525005](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44319525005), [inventory 44319525033](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44319525033) | Hosted package 1,764 pass / 1 optional skip, 50 build-policy tests, 22 formal unit tests, real Chromium 158; exact checkout tree matched head |
| #167 `c277a938…` | Independent 79-file scope review; 277 local Solana/schema/encrypted-journal/Worker restore tests | PASS: 277/277, no skips |
| #167 native validator | [run 44320268431, job 134857043246](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44320268431/job/134857043246) | PASS: Agave 4.1.2, SBF/Clippy/fmt/IDL, 48 Rust/LiteSVM tests, actual 1,800-second refund wait, native payout, frozen SPL retry, durable send reconciliation |
| #167 actual browser/package | [browser job 134857047469](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44320268589/job/134857047469), [schemas job 134857046920](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44320268589/job/134857046920) | PASS: real Chromium 158; hosted package 1,901 pass / 1 optional skip |
| Repaired #168 tree `3f905948…` | Typecheck, 30 local focused regressions; native controller unchanged retry; [hosted local-trade job 135387774673](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44473318787/job/135387774673) | PASS for stated checks; original failure and retry below; incorporated through independently qualified #170 |
| #170 `189f7b1…` | Independent authorizer/observer review and 11 local tests; every applicable hosted gate | PASS; merged `91ee699…` |
| #170 real native/ERC-20 browser | [run 44468884732, job 135373246270](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44468884732/job/135373246270) | PASS in Chromium 158.0.8127.36. Native: 5 checks, 4 sends, 4 durable markers. Token: 3 original checks, 7 sends, 7 markers |
| #170 remaining workflows | [Vault 44468884764](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44468884764), [inventory 44468884720](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44468884720), [Solana 44468884759](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44468884759/job/135373344902) | PASS at exact source head; Solana program job finished before merge |
| #171 `5984dc82…` / #172 `56b904e5…` | Small complete diffs independently reviewed; recorded RED/GREEN, seven required checks and CodeQL/Snyk | Technical PASS; mandatory Tier B automated review BLOCKED |
| #174 tree `5284fb94…` | 30 focused docs/lab/tool-path/claims tests; full typecheck, strict current docs and boundaries | Local PASS; current-head CI and required automated review pending |

The independent worker observed the fresh 277-test run in execution session 6319 (exit 0, 125.4 s); no separate portable log of that particular run was retained, and earlier committed Solana logs are not relabelled as that execution.

Native Solana fixture recovery uses an injected CAS journal. It does not by itself
prove actual encrypted-vault restore; the separate 277-test local suite covers that
storage composition. Neither proves the missing Solana browser/wallet journey.

## Later exact-source checkpoints

- Main `80375193…` adds only #138's 218-line audit-ledger append to `91ee699…`.
  Its merge tree matches prediction and current-main spec inventory passes; no
  product test count is reattributed to a different invocation.
- #175 `ba90ad4c…`, tree `bc0b0700…`: 35 core/external-wallet tests plus 93 affected
  app/legacy-exchange/red-team tests pass (128 across the two disjoint final runs).
  The separate 9 app/UI tests are already included in the 93. Four typechecks,
  default and explicit localnet artifact gates pass; independent review found no
  confirmed High/Medium blocker. Real hosted browser is pending.

## Failures, blocked execution and retries

| Source / attempt | Status | Observation and disposition |
| --- | --- | --- |
| Original #168 real browser | FAIL | Duplicate profile selector from React key collision; repaired and actual hosted browser subsequently passed |
| First repaired-parent typecheck under parallel load | FAIL: exit 137 | Serialized same-source retry PASS; no compiler options changed |
| First repaired-parent native controller | FAIL | Timeout waiting for second negotiation after five checks; unchanged retry PASS with 12 checks, 12 signatures, 4 sends/markers; cause remains unconfirmed |
| New #173 original head `7a85ccbe…` | FAIL | [Hosted local-trade job 135388826982](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44473637320/job/135388826982) timed out before disconnect case because wrong-chain cancellation left a durable prepared lease; no automatic send observed |
| #173 correction `2edda4e5…` | FAIL at later restored-release stage | [Actual local-trade job 135394487370](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44475364446/job/135394487370) passed the explicit block 11/12 lease, wallet-event revocation and fresh-profile/unknown-approval assertions, then timed out before the restored release checkbox. Staged native reconciliation versus production recovery defect is being investigated; no GREEN claimed |
| Local #173 real Chromium | BLOCKED | Chromium 156 aborts with Unix socket `Operation not permitted` before opening a browser context. No sandbox bypass attempted; hosted real Chromium used |
| First local extension fixture cold compile | BLOCKED attempt | 120-second fixture timeout; standalone exact compiler cold build completed 44 files; no fixture timeout weakened |
| Shared dependency symlink during isolated build | Expected rejection | Artifact graph correctly refused `NON_CORE_MODULE`; isolated pinned dependency install fixed worktree resolution, then 47-module localnet build passed |
| Original #154 manifest | FAIL | Strict `DOCS_STALE`; regenerated against actual maintained pages |
| Initial #154 docs fixtures | FAIL | Seven missing-link fixture failures; bounded target discovery repaired fixtures |
| New #154 claims bounds regression on old source | FAIL as intended (RED) | Reproduces changing-array-length bound bypass; fixed source's 30-test suite GREEN |

## Toolchain and evidence integrity

Foundry v1.5.1 was obtained from its official release; release tar SHA-256
`73640b01bd9ed29fdb4965085099371f8cf0dbbec3e2086cf54564efc4dcfe88` was verified.
Solc 0.8.30 matches the repository pin
`f3e987dc6ecebd4bd350c48edcbc320b46cf9e3109bd3fc3d88f1acaf4c428f7`.
EVM submodules were initialized at recorded gitlinks. No production signing keys
or real assets were used. The existing paid-agent workflow is manual dispatch only
and was not dispatched.

Raw logs and immutable hashes from this run are indexed under
[evidence](evidence/README.md). Hosted links identify the actual runner, source and
result. Package, browser, native and release qualifications remain distinct.

## Not run / not established

Physical wallets/mobile devices; public-testnet or production deployments/trades;
new owner trust roots; production release signing/publication; supported-browser
matrix beyond the stated Chromium runs; independent professional audit;
SonarCloud Security Rating A; full Solana browser flow; full optional D7 program;
pinned developer-container/Codespaces acceptance. Those are not reported as PASS.
