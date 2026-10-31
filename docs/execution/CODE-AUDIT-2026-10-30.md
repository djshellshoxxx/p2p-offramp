# Full first-party code audit — autonomous local EVM completion

## Verdict and boundaries

Four separate read-only review assignments inspected the integrated candidate after
the local implementations were available. Nine actionable P2 findings were fixed
and rechecked. No P0/P1 finding or unresolved actionable finding remained in that
review coverage. This is an engineering code audit, not external cryptographic
certification, deployed-host acceptance or real-funds approval. A passing dependency
advisory database query does not certify native binaries or undisclosed defects.

Baseline: `7cd4900e26a2e2e39bb945c9810b481c2f0eb351`. The execution contract is
[AUTONOMOUS-COMPLETION-PROMPT.md](AUTONOMOUS-COMPLETION-PROMPT.md). Local commits
following this baseline contain the reviewed implementation and fixes; use the
final repository HEAD and commit history for the delivery revision.

## Coverage

| Reviewer | Full first-party source coverage (not just the diff) |
|---|---|
| A1 | All schemas source and entry points; storage vault/store/crypto/backup/migration; identity lifecycle/provider; associated tests, independent Python and BIP340 vectors and provenance. Sixteen source files and fifteen existing test files were explicitly reviewed. |
| A2 | All web runtime/Worker/facade/controller/UI/display/demo/composition code, HTML/CSS, web build/artifact scripts, root scripts except the local EVM harness assigned to A3, Python audit/vector tools and shell initialization; CI, TS/Vite configuration, root package locks/security inventory; archival `chainManifest.ts` and `secureEnvelope.ts` reference adapters. |
| A3 | All wallet discovery/terms/adapter/execution source and tests, EVM reader/tests, escrow and adversarial Solidity contracts, compiler/evidence scripts, local node fixture and escrow tests, two-party local EVM harness, isolated dependency manifest/provenance and native child-process lifecycle. |
| A4 | All domain authority/errors/registry/terms/review/journal/retry source and tests, transport broker/HTTP driver, relay advertisement/book/pool and tests. Eleven implementation files explicitly reviewed. |

Third-party source trees, compiler and browser/native-node binary internals were
not independently audited. Specification prose/pseudocode is not treated as
implemented code. The specification audit checks structure, local links and
catalog completeness; it cannot certify semantic or protocol correctness.

## Findings and resolution evidence

| ID | Severity | Condition and impact | Fix and verification |
|---|---|---|---|
| A1-1 | P2 | Default document vault/identity lifecycle depended only on timer dispatch. Suspended callbacks let trusted input revive authority after five minutes. Worker/AppRuntime already guarded deadlines. | Monotonic deadline checks now precede session/handle operations and activity renewal; elapsed, backwards or nonfinite clocks revoke. Original suspended-timer reproduction now denies both services and cannot revive them. Identity 17, vault 29 direct tests pass. |
| A1-2 | P2 | Migration skipped bundled consumer validation when a record already had the target version, allowing a rejected payload to report `verified:true`. | Current-version records pass the same validator without adding mutations. No-op and mixed-invalid regressions reject; no-op zero-write/durable-outcome tests remain green. Migration 11 tests pass. |
| A2-1 | P2 | Pending status refresh disabled the Lock control even though runtime lock can preempt work. | Lock bypasses a status waiter; command sequence guards suppress stale notices. Emitted Chromium holds a status request, confirms Lock stays enabled and immediately locks. |
| A2-2 | P2 | New execution helper was not explicitly excluded from offline document/Worker bundler graphs. An injected `provider.request` could evade token scanning if accidentally imported. | Exact bans cover wallet EVM execution, adapter and terms modules; real-module negative tests reject both graph kinds and policy modes. Actual default/demo artifacts remain offline. |
| A2-3 | P2 | Relay Schnorr/SHA and reader Keccak uses were absent from capability provenance inventory. | Added three test-only entries with exact existing package pins and independent vector references; reviews remain pending. Official positive/negative BIP340 verification passes. Inventory tests require nine MISSING_REVIEW findings and deny release eligibility. |
| A3-1 | P2 | Disposing execution with a provider/validator that ignored cancellation left the public submit promise hanging without a caller AbortSignal. | Internal lifecycle abort settles callers promptly, preserves the physical slot until native drain, and returns unknown after a durable marker. No late send/hash publication. Executor 10 tests pass. |
| A4-1 | P2 | Connect timeouts could count process uptime as stable connection time, resetting relay retries forever after 60 seconds. | Stability begins only on an actual established socket and is cleared on stop/open. RED reproduction made 11 calls instead of allowed 7; fixed timeout and real-stability tests pass (pool 9). |
| A4-2 | P2 | Different trade bindings could reserve the same known EVM account/network/nonce as unlinked replacements. | Reserve rejects cross-binding nonce collisions; only fresh native terminal proof can free a prior reservation. Distinct nonces remain valid and restored labels alone do not authorize replacement. Journal 27 tests pass. |
| A4-3 | P2 | Throwing clock/random/scheduler/canceller hooks escaped the read retrier as raw exceptions or leaked listeners. | Fixed UNAVAILABLE normalization, monotonic-clock checks and cleanup; no unsafe extra retry after runtime failure. RED hooks regressions now pass; retrier 12 tests. |

The isolated initial Ganache toolchain had 36 advisories, including five critical.
It was replaced with official pinned Anvil 1.7.1, ethers 6.17.0, solc 0.8.38 and
reviewed narrowly scoped `solc -> tmp@0.2.7` override. Explicit Shanghai compilation
is retained. Root and isolated tool-package `npm audit` both report zero advisories,
including development dependencies, at this check. See the escrow README for
provenance, release-note review, binary pin and remaining qualification limits.

## Integrated verification

All of the following passed on Node 24.19.0, Linux x64; browser checks used Chromium
154.0.8037.57. No skips/failures were reported by the root unit suite.

- `npm test`: 46 test-file results. Direct suites additionally establish individual
  scenario counts where the nested runner reports files rather than test cases.
- `npm run typecheck`: all four configurations.
- `npm run check:boundaries`: 58 production sources, 31-module core graph.
- `npm run test:build-policy`: artifact/import/module exclusion checks.
- `npm run test:specs`: 12 Python tests; `check:specs`: 173 specs, zero omissions
  or broken local links.
- Default and synthetic demo builds; emitted artifact scans and attribution.
- Native browser vault/CAS, source-retaining recovery, quota/capacity, Worker,
  policy, document interruption and browser-SIGKILL fixtures.
- Emitted shell and review journeys, widths 320–1440, locked startup at root/nested/
  IPFS-style paths, hostile content, held-status lock, encrypted save/reload/load,
  stale second-tab save, and fresh-key backup restore. Zero wallet prompts and
  unexpected/external application requests were observed in those fixtures.
- Isolated real escrow suite: seven adversarial scenarios spanning native/ERC-20,
  EOA/EIP1271, deadlines, replay, roles, failed/reentrant receivers, fee/rebase/false/
  no-return/callback tokens, code changes, rollback, surplus and conservation.
- `test:local-evm`: two signed offers, four wallet acceptances, four journaled
  submissions and four reconciliations on a loopback-only Anvil instance; native
  release, ERC-20 refund, lost-response native-history recovery after encrypted
  reopen, and fresh-key journal restore. Finalized state comes from native finalized
  tags after explicit local mining, not a rewrite of latest into finality.
- Root and isolated dependency advisory queries: zero advisories; `git diff --check`.

## Remaining scope, without conflating it with approval

The implemented acceptance is a local EVM proof and reusable disabled modules.
The shipped UI still offers offline profile/review workflows, not wallet signing
or trading. No deploy, push, production endpoint selection or funds were authorized
or performed. Local Anvil children are terminated after tests; no extra cloud
instances were provisioned.

Release blockers requiring external inputs remain: the missing common G15 manifest
schema and selected signing policy, independent crypto/contract review, approved
assets/deployments/endpoints, deployed host/header evidence and supported physical
browser/device qualification. These were not fabricated or marked approved.

Remaining autonomous *later integration* is explicit: app-managed messaging identity
consumer migration after fresh-key restore, real identity signing/private chat,
NIP09 cancellation/NIP11 relay interoperability, app-integrated trading controls,
full replacement discovery beyond the bounded local-history fixture, optional
extension/QR/localization polish, and Solana/Phases 3–6. The owner lean scope keeps
those later-preserved or disabled. They are not claimed complete by this audit.
Production token proxy/rebase properties cannot be established by code hash alone.
Strict-private routing is not enabled or claimed from injected test transports.
