# Foundation gate consolidation — 2026-11-04

## Baseline and scope

Refreshed remote refs and inspected GitHub PRs, issues, workflows, source diffs and decision records. Main is `a7e3062cb0412be4ee5e3491198ee4089a32e23f`. GitHub returned no open issues. Work branch: `codex/foundation-gates-20261104`. The pre-existing four-line `package-lock.json` modification belongs to the starting workspace and is excluded from this work.

PR #52 (`d5b959b`) already inventories cumulative ancestry. Its ledger is useful planning evidence, not integrated implementation. PR #26 (`94554ec`) is the cumulative candidate; #28 contains repairs; #37–#48 split that work into a dependency stack. These are not twelve independent patches. Compare each stage with its predecessor and current main before extracting further changes. Original contributor branches and PRs remain intact.

## Completed consolidation

Extracted the import-boundary and independent signature-oracle subset of PR #37 from `81a295d5cd3936b88eded7e52b6f2a78989f6ea7`. Its stage history is `8b388b7` (split implementation), `7be7c7d` and `81a295d` (review fixes). Source code and tests retain their original implementation; this is a focused extraction, not a merge of that ancestry.

- Source inventory fails closed when expected roots are missing, are files, or contain relevant symlinks. Partial inventories cannot qualify the graph.
- Parked optional packages, including compound names, cannot become transitive core app dependencies.
- OpenSSL oracle rejects zero verified signatures. Tests check all four committed signatures plus corrupted signature, digest and public-key controls.
- Both Python CI jobs install the complete, hash-pinned binary dependency closure before running oracle tests.

Adaptation: retained the existing security release facade in the boundary fixtures. The future wallet acceptance facade from #40 is deliberately not permitted before its implementation is integrated. No package, production dependency, contract, signature format or deployed artifact changes.

## Prioritized inventory and acceptance criteria

Estimates are engineering effort ranges, not elapsed-time promises; tool availability and independent reviews can extend them.

| Priority | Work and sources | Acceptance criteria | Estimate |
|---|---|---|---|
| P0 | Remaining #37 foundation: Sepolia send history/RPC hygiene; formal harness | Reproduce review findings on current source; distinguish pre-broadcast failures from uncertain sends; legacy action history cannot authorize repeat settlement; encoded credentials cannot leak. Run CLI regressions and local EVM checks. Formal reports must retain UNKNOWN and bounded scope. | 1–3 days |
| P0 | #38 schemas/domain/storage/transport, stage head `71a56d1`, initial stage `4f63582` | Compare only the delta after #37. Validate strict draft/selection parsing, authenticated backup verification, hostile-object boundaries, retention closure and compressed HTTP handling (review F05). Run package, type, migration, backup and browser checks. | 2–4 days |
| P0 | #39 relay/messaging, head `404dc3d`, initial stage `6a7d6be` | Independent subscribers each receive shared events exactly once (F04); cancellation closes sockets and pending work; enforce frame/subscription limits; no automatic republish. Run real TCP and lifecycle regressions. | 1–2 days |
| P0 | #40 wallet/asset updates, head `7706859`, initial stage `0365f42` | EIP-1271 acceptance remains chain/registry/terms bound; signed asset updates fail closed on invalid provenance; contract and local-EVM tests pass; owner approval for trust-path merge. Add the narrow wallet facade only with its consumer. | 2–4 days |
| P0 | #43 journey and review #31 findings, #35 repairs | Review F01 valid seller release before expiry, F02 unsent transaction recovery, F03 deferred payout visibility and F06 negotiation retry. Reconcile D9 durable marker work before applying journey repairs. Require browser/native evidence and no duplicate sends. | 3–6 days |
| P1 | #41–#42 locale/runtime/UI | Incremental integration after wallet/core; localization remains complete, responsive and accessible; lifecycle cancellation and worker authority boundaries hold. Default/demo builds and browser checks pass. | 2–4 days |
| P1 | #44 recovery/tooling, #45 intake, #47 governance, #48 evidence | Keep release trust disabled until qualified; reconcile manifests without optional package dependencies; test offline recovery/distribution; evidence identifies the actual tested commit and does not promote historical results. | 2–4 days |
| Independent | #50 Solana `26bf00b` | Preserve separate Anchor/LiteSVM/vector/local-validator development and attribution. Native/SPL funding, expiry, authorities and payout regressions need independent review under D5. No blanket EVM-stack merge. | 3–6 days plus review |
| Deferred | Nine optional reference packages in #46 | D7 parks meetup, courier, arbitration, liquidity, stealth, proof-jobs, proof-inputs, privacy-controls and privacy-policy until the core leaves LOCALPROOF. Personalization, governance and claims have separate approved dispositions. | Re-estimate after core qualification |

Decision sources: #29 head `89d0a92` records D1/D5/D8/D9 acceptance; #49 head `8fb081b` adds D4/D6/D7. D8 requires passing checks and tier-dependent review before merging. Some decision prose says the M-0 stack is merged; live GitHub state still shows #37–#48 open, so that prose must not be used as ancestry evidence. D2 testnet signing key remains owner-controlled. D1 peer carrier, D4 commitments, D5 Solana, D6 QR and D9 intent changes require specification and independent trust-path review; direction approval is not implementation approval.

## Verification and delivery

Local environment: Node 24.22.2, Python 3.12.3 in `/tmp/p2p-foundation-oracle` (the workspace's default Python is 3.14.2). The system Python lacks ensurepip; created its temporary environment and used the existing pip's `--python` option. The exact hash-pinned binary dependency installation succeeded: cryptography 50.0.0, cffi 2.1.1, pycparser 3.0. No dependency installation into the application or global Python environment.

| Check | Result |
|---|---|
| Boundary regressions against original checker | 3 failures reproduced: optional graph import, incomplete root inventory, symlink omission |
| `node --test --test-isolation=none scripts/tests/import-boundaries.test.mjs` | 8 passed after integration |
| `npm run check:boundaries` | Passed; 118 production files, 59 graph modules |
| Build-policy files with `--test-isolation=none` | 26 passed |
| `npm run test:build-policy` | Passed |
| Python 3.12 `-m unittest discover -s scripts/tests -v` | 15 passed, including four oracle signatures and negative controls |
| Python specification audit | Passed; 173 specifications, zero broken links/unindexed files; design review remains pending |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; default static artifact; unsigned and not release-accepted |
| `git diff --check` | Passed |

The first package-suite attempt inside the sandbox hit `listen EPERM` at the fake relay's localhost socket. A targeted exchange run confirmed the restriction (13 passed, 1 failed at socket creation). The restricted full run was interrupted, and the full suite rerun with localhost permission. Final result and PR link follow before delivery.

No production deployment or main merge is performed. API usage/cost telemetry is unavailable in this environment; no estimate is claimed.
