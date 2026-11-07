# Focused consolidation continuation — 2026-11-04

Baseline is `77fb7c5`; cached main is `a7e3062cb0412be4ee5e3491198ee4089a32e23f`. This pass extends the foundation-gates checkout, rather than replacing another contributor branch. The pre-existing four added `peer: true` lockfile fields remain untouched and are excluded from the integration commit.

## State refresh and constraints

Read README, roadmap, development status, specification readiness, the October 31 incomplete-work/autonomous prompt, November 1 remaining-guidance/journey audit, task plan/ledger, current package manifests/workflows, and cached consolidation/review/decision records. No AGENTS.md was found. The prior [foundation handoff](development-handoff-2026-11-04.md) and cached `origin/codex/consolidation-ledger-20261104` provide ancestry evidence only.

`git fetch origin --prune` failed: `cannot open '.git/FETCH_HEAD': Read-only file system`. `gh pr list` failed: `error connecting to api.github.com`. The public web PR list returned an incomplete snapshot showing only #26, and #37/#50/#53 pages were unavailable. The [public #26 page](https://github.com/djshellshoxxx/p2p-offramp/pull/26) reported head `94554ecf9854e4604f9f56afe5bebedeee931994`, but cannot establish current state/reviews/checks of all later PRs. Accordingly every head below is **cached local Git evidence**, not a claim of refreshed live GitHub ownership or checks. Local source branches were not changed; remote PR dispositions remained unverified at the time (live state was refreshed on 2026-11-07, see `docs/development/CURRENT-STATE.md`).

Original Git metadata is read-only. A separate local clone `/tmp/p2p-consolidation-release` allows a reviewable integration commit without changing that metadata. Network publication remains blocked. No production or real-funds readiness is claimed.

## Evidence-backed inventory

Owner means local continuation assignment; remote ownership/check status is unverified. Complexity and risk are qualitative engineering estimates for integration, not completion percentages. Existing implementation refers to current checkout unless explicitly described as candidate-only.

| Subsystem / state | Implementation and cached source | Missing behavior / acceptance | Dependencies | Local owner | Complexity / integration risk | Next action |
|---|---|---|---|---|---|---|
| Foundation boundaries/oracle — COMPLETE locally | Prior #53 extraction `46bf2cb`; current `77fb7c5` | Existing fail-closed inventory and four-signature oracle; hosted acceptance unverified | Hash-pinned Python closure | root | Low / low | Reuse; do not reimplement |
| Sepolia send history/RPC publication — READY locally (C54) | Focused #37 source `81a295d5cd3936b88eded7e52b6f2a78989f6ea7` | Persist each action before send boundary; absence/error cannot authorize repeat; isolate private query/userinfo encodings; retain terminal read-only reconciliation | Existing CLI, native acceptance later | foundation_review; root review | Medium / medium | Import reviewed commit; native kit validation before merge |
| Formal EVM harness — PARTIAL | Remaining #37 candidate formal files | Reuse bounded properties with UNKNOWN preserved; execute pinned toolchain, never equate bounded models with full proof | Foundry/solver availability | unassigned | Medium / medium | Separate reviewed slice |
| Core schemas/domain/backup/retention — PARTIAL | #38 candidate `71a56d10405bacc7ab39f29d1b63b4bde8a82504`; vault/CAS/fresh-key restore already exist | Integrate strict draft/selection parsing, authenticated backup receipts and complete retention closure with migration/hostile-input/browser regressions | Foundation; dependent worker composition | unassigned | High / high | Port bounded dependency slices; retain existing backups |
| IDB invalidation — READY locally (C59) | Focused #38 listener-isolation delta | Throwing/removing listener cannot suppress original listeners or terminal connection cleanup | Existing store only | solana_inventory; root review | Low / medium | Import with fake-IDB regression; browser qualification remains |
| Bounded HTTP — READY locally (C56) | Focused #38 driver/encoding tests | gzip/br and hidden-CORS coding must use decoded caps; identity truncation, cancellation, physical slots and no retry preserved | Existing transport scopes; synthetic Fetch-shaped ports | root; independent solana_inventory review | Low / medium | Import; apply equivalent rule to updater only when that module is integrated |
| Nostr/relay/durable chat — READY locally (C55) | Focused #39 `404dc3daa8b19904c7da29d71d49d8df0f5e03ba` | Per-subscription dedup; immutable own-data snapshots; cancellation cannot strand history admission; retired subscription receives no late verifier callback | Existing broker, Nostr crypto and encrypted vault | messaging_review; foundation_review review | Medium / medium | Import; real TCP/browser checks blocked here |
| Wallet/EIP-1271/signed updates — PARTIAL | #40 candidate `7706859`; existing EIP-712 EOA/escrow gates | Integrate native EIP-1271 registry/chain/terms-bound acceptance and signed asset updates with all negative vectors | #38 core, #39 transport; native toolchain | unassigned | High / high | Do not widen signing facade before consumer exists |
| Locale/runtime/web — PARTIAL | #41 `dd2a648`, #42 `58b3c87`; existing English catalog/default inert UI | Compose owned services and cancellation; draft RTL/CJK/long strings; verified status/focus/keyboard evidence | #38–#40; browser tools | unassigned | High / high | Sequential port; no decorative success labels |
| Private trade/recovery journey — PARTIAL | #43 `bc549f4`; existing domain/native journal, read-only terms and recovery | Reconcile #31/#35 review findings: release window, unsent/uncertain recovery, deferred payout, same-event delivery retry; accepted D9 marker semantics | Core/wallet/worker composition; native/browser validation | unassigned | High / high | Use current services; no automatic spend/resubmission |
| Recovery portal/lab/intake/assurance — PARTIAL | #44 `f8a9aa1`, #45 `5a99974`, #47 `14d7c5e`, #48 `494703e` | Authenticate original ABI/registry, preserve offline exits, test build/distribution; source-bound evidence only | Prior integration slices; toolchains | unassigned | Medium / high | Extract unique deltas; exclude parked optional imports |
| Optional references — DEFERRED | #46 `0baa3c1`; D7 in #49 `8fb081b` | Nine parked packages must stay outside core LOCALPROOF graph | Accepted D7 change would be needed for inclusion | unassigned | High / high | Preserve branch; do not integrate |
| Owner decisions — PARTIAL integration | #29 `89d0a92`, #49 `8fb081b` | Direction acceptance is not runtime enablement; reconcile D1/D4/D5/D6/D7/D8/D9 records and current specs | Independent trust-path review where required | unassigned | Medium / high | Read accepted direction; never infer merged ancestry |
| Cumulative/repair/research PRs — DUPLICATE or PARTIAL by behavior | #26 `94554ec`, #28 `3e32c98`, cached #29–#35 decision/review/research branches, #52 `d5b959b` | Stage comparisons already represent much of this work; verify unique repairs individually | Live metadata and semantic comparison | root | High / high | Do not blindly merge cumulative branches |
| Solana escrow — PARTIAL | Separate #50 `26bf00bef107673734212738d90160385285c81e`; accepted D5 Option A `89d0a92` | Native/SPL custody/PDA/adversarial/vector program exists candidate-only; client/wallet/journal/recovery adapters missing; native tests unavailable here | Rust/Anchor/Agave/LiteSVM pins; independent review | solana_inventory (read-only) | High / high | Preserve separate workstream; no parity/deployment claim |
| Release/production — BLOCKED | Default `ReleaseEnabled:0`, `connectOrigins:[]`; maintained trust pin unset | Authentic trust/bootstrap/deployments/providers, professional review, devices, approved safety copy and distribution witnesses | External evidence plus local engineering above | owner/independent reviewers | High / high | Keep all gates disabled |

#51 configuration is already represented in cached main `a7e3062`; no duplicate agent/configuration framework is added. No custodial backend, ledger, centralized relay or new product scope is introduced. No upstream library was imported; this pass reuses existing first-party candidates with exact revisions.

## Reproductions and changes

C54 ports only Sepolia CLI/history and hygiene tests from #37. Original tests reproduce six failures. Added malformed-percent-public-endpoint regression reproduces another failure: one invalid percent escape previously suppressed decoding of an encoded credential elsewhere. Added short-userinfo regression reproduces the inherited six-character floor. Publication now refuses uninspectable public encodings and treats all nonempty username/password/query values as sensitive. Host/path key heuristics remain conservative, and this is not a general secret scanner. Per-action attempt history is durable before estimation/Forge, preserves unknown outcomes, and blocks repeat action submission while allowing the first distinct legitimate exit after native funding proof. No automatic send/retry is added.

C55 ports ten relay/messaging files from #39, including the new local snapshot helper. Twelve selected regressions fail before the port and pass after it. Independent review then reproduced delivery after verifier-triggered unsubscribe/pool close. The repair rechecks subscription identity, pool/relay state, scope and generation after verification, before penalty, dedup or callback. Nine valid/false/throw × subscription/transport/pool-retirement combinations cover that boundary. Dedup remains bounded pool-wide and is scoped by subscription; closing a subscription frees its entries. Genuine abort-signal own-property traps cannot leak foreign diagnostics, bypass native cancellation or strand the active history slot. Physical work retains admission until drained.

C56 copies only the bounded HTTP driver and encoding regressions from #38. Three assertions fail on the original driver: decoded compressed bytes, hidden CORS encoding and encoded size greater than decoded cap. Actual decoded bytes/read counts remain bounded. Identity-only lengths retain integrity/early refusal; compressed or CORS-unknown lengths never override the decoded cap. Ports omitting Response.type explicitly promise an unfiltered header list. Existing malformed-header limits persist. Tests are synthetic Fetch-shaped responses, not physical browser compression/CORS qualification.

C59 isolates each IDB invalidation listener and snapshots the original cohort. Listener faults/removal cannot suppress later original listeners; terminal subscription errors remain contained. Fake-IDB tests do not qualify physical multi-tab browser behavior.

## Solana evidence and limits

Read-only source inventory finds 20 native, 14 SPL, eight adversarial and five Rust-vector test functions; these are **not executed test counts**. The exact cached JS vector generator, fixture and tests were extracted into `/tmp/p2p-solana-readonly-vectors`; regeneration and seven JS tests pass. No Solana source is imported into this integration. Rust/Cargo/Anchor/Agave tools are unavailable. Native SOL/original SPL state, immutable terms, authority/PDA/token constraints, expiry, persistent replay PDAs and fixed-recipient payout are implemented in the candidate; client deadline margin and actual frontend/wallet/journal/recovery integration remain missing.

One candidate documentation error remains to correct when #50 is integrated: README says a combined release+payout transaction retains its decision on payout failure. Its existing native test correctly expects atomic rollback to Funded, then separate committed release and retryable payout. No native state-machine defect was established from that mismatch.

## Validation and delivery

Final results, evidence hashes and isolated commit/bundle are recorded below after frozen-source checks. Previous handoff test counts are historical and are not promoted to this source. Full product/security certification and real-funds readiness remain unclaimed.


| Frozen-source check | Executed outcome |
|---|---|
| C54 hygiene/trade/deployment regressions | 32 passed; six upstream failures plus malformed-percent and short-userinfo failures reproduced before fixes |
| C55 complete offline envelope/chat/ad/local/subscription suite | 50 passed; 12 selected original failures reproduced; independent final retirement suite 4 passed, including nine combinations |
| C56 HTTP regressions + existing driver | 10 passed; three original regressions reproduced |
| C59 complete storage suite | 96 passed, including focused IDB 16/16; two original failures reproduced; root independently reran 16/16 |
| `npm run typecheck` | Four projects passed on frozen code |
| `npm run check:boundaries` | Passed, 119 production files/59 core graph modules |
| Build-policy four files with `--test-isolation=none` | 26 passed; supported `npm run test:build-policy` also executed successfully |
| `npm run test:fuzz` | Passed; no native-chain claim |
| Python 3.12 pinned oracle/unit suite | 15 passed; specification audit 173 documents, zero broken links/unindexed files |
| Default/demo builds | Passed on original workspace and isolated clone; emitted file hashes identical on this host |
| `npm test` full working tree | 89 passed/6 failed **test files**, not individual test cases; no green full-suite claim |
| Clean committed-lockfile crypto-inventory + release-manifest files | 63 individual tests passed; starting workspace lockfile left untouched |
| JS EVM escrow/execution/submit/terms + lifecycle/preflight | 66 passed, one existing cast-calldata test skipped because Foundry unavailable |
| Foundry `npm run test:evm` | BLOCKED: `forge: not found` |
| Isolated `npm run test:escrow` and `npm run test:local-evm` | BLOCKED: `ERR_MODULE_NOT_FOUND`, package `ethers`; native package dependencies unavailable |
| `npm run test:browser` | BLOCKED: `listen EPERM: operation not permitted 127.0.0.1`; Chromium qualification not reached |
| Solana native suites | BLOCKED: Rust/Cargo/Anchor/Agave tools absent; seven independent JS-vector tests pass |

Full package failures were diagnosed individually: exchange, Nostr crypto wiring and relay pool require forbidden loopback listeners; crypto inventory and release manifest reject the pre-existing lockfile edits; acceptance-gates' real CLI subprocess returns no JSON because child spawning is restricted. A standalone spawn diagnostic records `error: EPERM`. It is not reported as a confirmed product defect. The full relay/messaging attempt similarly had nine passing/two blocked files; the complete offline subset was run separately without skips. Default child-isolation output is file-level here, so focused `--test-isolation=none` runs retain actual assertions and counts.

An initial isolated build reused node_modules through a cross-checkout symlink and correctly refused `NON_CORE_MODULE`. Copied the already-installed dependencies locally into the isolated clone and reran both builds successfully; no boundary rule was weakened. This is same-host reproducibility, not a clean network install or cross-platform reproducible-release claim. `npm ci` was not run over the contributor's modified lockfile. No dependency/lockfile change is part of the integration.

C54 reviewed by root and foundation reviewer for root-authored credential additions; C55 reviewed by foundation reviewer, including reproduced/repaired late delivery; C56 reviewed by the independent Solana-inventory reviewer against Fetch/CORS semantics; C59 source/consumer teardown reviewed and focused tests rerun by root. Evidence and frozen code/build digests: [manifest](../evidence/CONSOLIDATION-20261104/manifest.json). These are local engineering reviews, not professional security approval.

Implementation commits on isolated `codex/consolidate-transport-20261104`, based on `77fb7c5`:

- `29e4cec`: Sepolia attempt history and RPC credential publication.
- `c3ba42b`: bounded HTTP decoding compatibility.
- `52f64c5`: relay/messaging consolidation and reviewed lifecycle repair.
- `a740561`: IDB invalidation isolation.

The tested code commit is `a740561`; subsequent evidence/ledger commits do not change production source. Original source attribution is retained in commit trailers. Remote push/draft-PR status is recorded in the local delivery receipt; hosted checks and source PR dispositions remain unverified. All release/trust/network gates retain their starting values.

Next implementation sequence remains #38 strict schemas/backup/retention, #40 wallet acceptance and signed updates, then dependent web/journey/recovery slices. Preserve the unresolved review findings listed above, explicit transaction intent, immutable payout destinations, uncertainty and archived original exits. This continuation is a reviewed source candidate, **not an accepted release candidate or completed roadmap**.
