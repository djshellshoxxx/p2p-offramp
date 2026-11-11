# Autonomous progress log

## 2026-11-07 — session on `claude/vibrant-cray-ny4gum` (PR #56, stacked on #54)

Environment: Node 24.22.2 (official tarball), npm ci from the committed lockfile, Foundry v1.5.1 (`b0a9dd9c`), solc 0.8.30 static binary (sha256 `f3e987dc6ecebd4bd350c48edcbc320b46cf9e3109bd3fc3d88f1acaf4c428f7`, matching `contracts/evm/README.md`). Python 3.13 only, so the CPython 3.12 oracle closure was not installed. No Solana toolchain. No browser suites were run.

### Integration

| Step | Commit | Result |
| --- | --- | --- |
| Start from #54 head | `edc66f6` | All 12 hosted checks green; 11 unresolved review threads |
| Merge `main@300287d` (docs-only #30/#34/#52) | `dcee920` | Clean merge |
| Baseline `npm test` | `dcee920` | 1,207 pass / 0 fail / 1 skip (Foundry-gated) |
| Review fixes R6–R11, workflow hardening (C71–C73) | see PR #56 | storage+relay+transport 260/260; `tsc` clean |
| Live-state docs | see PR #56 | `CURRENT-STATE.md`, `task-ledger.json` |
| Sepolia fixes R1–R5 (C70) | `29d142e` | see below |

### Evidence per finding

| ID | RED observed before fix | GREEN after fix |
| --- | --- | --- |
| R1 lock | `actual: 'TEST_STOP', expected: 'STATE_LOCKED'` | sepolia-trade-state 24/24 |
| R2 RPC lock-out | `TradeError: BROADCAST_RECONCILIATION_REQUIRED` on a fresh trade; send attribution `undefined` | same |
| R3 attribution | 3 subtests reached the refund send (`RPC_ERROR_-32000`) | same |
| R4 finality | `the failed send is checked actual:false` | same |
| R5 encoding | lowercase `%252f…` endpoint not detected | sepolia-hygiene 15/15 |
| R6 retention | partial deletion `reviewedDeleteCount:3` accepted (7 cases, each confirmed separately) | retention 26/26 |
| R7 handlers | `subscribe(new Handler()).ok === false` | pool 29/29 |
| R8 test | assertion inside a swallowed callback | policy 30/30 |

### Combined verification at `29d142e`

| Check | Result |
| --- | --- |
| `npm test` | **1,210 / 1,210 pass, 0 skip** |
| `npm run typecheck` (4 projects) | pass |
| `npm run check:boundaries` | pass: 126 files, 64 graph modules |
| `npm run test:build-policy` | 26 / 26 |
| `forge test --offline` | 82 / 82 |
| `npm run test:sepolia:trade` (node and anvil proof) | node suites pass; anvil proof 13/13 |
| `npm run test:sepolia:kit` (node and anvil proof) | node suites pass; anvil proof 11/11 |
| `openai-agents.yml` | parses (PyYAML, js-yaml); **not dispatched** (it would spend the owner's OpenAI budget) |

### Independent adversarial review of the Sepolia diff (workflow `wf_077ab95c-d03`, 11 agents)

Three lenses reviewed the diff: duplicate-send, lock/IO and regression/leak. Each finding was then verified independently. The duplicate-send lens found **no path to a second broadcast**. Eight findings were confirmed. They were fixed in `5110511` unless noted:

- Medium: a `+`/space form-encoded query credential passed the leak check. Fixed, with a regression test.
- Low: host-label credentials were compared case-sensitively after URL lowercasing or punycode. Fixed, with a test.
- Low (regression): a literal `%` reached by decoding a valid `%25` made an endpoint uninspectable. Fixed, with a test.
- Low: state writes had no fsync, so a host crash could roll back the attempt record. Fixed: fsync of the file and its directory.
- Low: the terms-review file was written non-exclusively. Fixed by using the same durable writer.
- Low (two duplicate findings): Ctrl-C leaves a stale lock. This fails closed by design; recovery is documented in `docs/deployments/sepolia/README.md`.
- Low: a dropped hash-bearing failed send keeps `allFinalized` false. Kept: this is intended under R4.

After `5110511`: sepolia-hygiene 18/18 (the 3 new tests were RED against `0edbf36`), sepolia-trade-state 24/24, anvil trade proof 13/13, anvil kit proof 11/11, `npm test` 1,210/1,210.

### Hosted CI on PR #56

At `384340a`, every workflow job passes. SonarCloud's quality gate fails with "Security Rating C on New Code" from `39bd7d4` onwards. sonarcloud.io is unreachable from this environment, so the rule cannot be identified here; the owner has been asked for the rule key on the PR.

### Known limitations recorded rather than fixed

- Legacy Sepolia state with no `attempts` key: a later error that does not count as possibly-sent (for example `OBSERVATION_REJECTED`) overwrites an earlier uncertain `lastError`, which removes the reconciliation block on the next run. An existing test expects this overwrite. The fix would be a sticky reconciliation flag, which needs an owner decision on the legacy-state contract.
- A failed send whose transaction never mines keeps `allFinalized` false indefinitely. This follows from R4 by design.
- The lockfile is never taken over automatically. After a crash, the operator must confirm that no process is running and then delete `<state>.lock`.

### Next actions

See `CURRENT-STATE.md` §10. Owner approval of #54 and #56 under D8 Tier C gates the P0 extractions (the #40 remainder, D9, then D1).

## 2026-11-09 — difficult-core continuation

Source baseline: #56 `07b1b9b043e2614d434fa6263db5ee423f20cfa6`; main `300287dcde818a9d10ae301265d00bc7c0877bbb`. See [the source-pinned review and handoff](2026-11-09-core-review.md) for PR ancestry, separate worker scopes, exact Sonar annotations, owner decisions and remaining qualification limits.

Delivered independently reviewable branches:

- `codex/rq00-evidence-20261109`: strict versioned research receipt format, offline source admission and independently supplied signer policy; bounded redaction; no command execution, runtime dependency or release authority. Tests are included in ordinary `npm test` and `test:research:receipts`. The unsigned actual #56 baseline receipt remains UNKNOWN, retaining its Foundry skip and incomplete fixture-rights/source-closure qualifications.
- #58 `codex/post-send-reconcile-20261109`, `af0e1789889790c2050142ed508b5042ef5bcc85`: post-send 4001 remains uncertain. RED accepted a fresh nonce-1 fund after a simulated nonce-0 broadcast; GREEN blocks the repeat and reconciles without another send. 71/71 focused tests; 1,211 pass / 0 fail / 1 Foundry skip in the full suite; typecheck passes. Independent source review found no blocking issue. GitHub now reports seven successful workflow jobs associated with this head; this is separate from local simulated evidence and does not override #56's Sonar gate.
- #57 `codex/solana-payout-docs-20261109`, `7e8d571ae350190e9ba0fdf50a7b9184a4730ad9`: documentation now matches existing native/SPL rollback tests. No program change or native execution.

RQ00 review and regression evidence:

| Stage | Observed result |
| --- | --- |
| Tests written before implementation | Import fails: missing receipt module; 0 pass / 1 fail (absence baseline only) |
| Initial implementation | 14/14 pass |
| Independent review | Reproduced quoted/config/argv credential leaks and noncanonical UTF-8 BOM acceptance |
| Contextual credential regression before fix | Assertion `false !== true`; redaction was bypassed |
| Second independent review | Escaped JSON quote caused a secret suffix to survive redaction and be admitted |
| Escaped-quote regression before fix | Expected secret suffix absent; assertion failed |
| Final dedicated receipt suite | **17/17 pass**, zero skipped/cancelled/todo |
| Final RQ00 branch `npm test` | **1,226 pass, 0 fail, 1 Foundry-dependent skip** (1,227 total) |
| Independent final reproduction | Escaped-quote/backslash secrets removed; BOM rejected |
| Baseline receipt CLI | UNKNOWN / UNAUTHENTICATED_RECORD; executionVerified=false; releaseAuthorized=false |

Commands: `npm run test:research:receipts`; `npm test`; `npm run check:specs`; `git diff --check`; the explicit baseline receipt verification command in the handoff. Runtime Node 24.22.1. Existing dependency installation uses the committed lockfile and `--ignore-scripts`; no dependency update. Typechecks, build policy (26/26), Python tests (15/15), import boundaries and static build passed on the unchanged product baseline. Browser launch was attempted but blocked by `socket() failed: Operation not permitted`; Foundry and Solana native tests were not run locally.

Corrected two overstatements in the prior handoff: D9 `sendMarkedAt` is absent from #35; #40 contains generic execution hardening and read-only EIP-1271 qualification, not a contract-wallet execution adapter. Full D9/D1, native Solana/client parity, independent Nostr/two-client experiments, owner trust/deployment and professional/device review remain open. No self-merge, release enablement, deployment or funded trade.
