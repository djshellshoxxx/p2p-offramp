# Ultracode multi-agent ledger — 2026-11-16

## Continuation refresh

At cumulative `7461c87`, L1 has a persisted version 2 send marker and profile-bound
provenance implementation, and L2 has an explicit authenticated-runtime layout
policy. Their IN PROGRESS rows below are historical intake ownership, not current
source absence. Local contract, encrypted exchange and direct canonical-reader
checks were rerun during continuation. L3/L4 remain unfinished and production
qualification remains open. See the [current report](../consolidation/2026-11-16-canonical-qualification.md)
and [D9 migration contract](../consolidation/2026-11-16-d9-migration.md).

Baseline: `integration/p2p-consolidated-20261109` @ `f2950cf29a69bc56f28b04262f310c5c86a72d84`
(contains historical checkpoint `961cc6f`; newest cumulative functional line; m2a/pages-beta/offline-recovery
integration branches are strict ancestors). Work branch: `claude/confident-fermi-g6wjp3`.

Toolchain: Node 24.22.3 (SHA-256 verified), npm 11, forge 1.5.1 (CI pin), solc 0.8.30 static.
Baseline evidence (exact `f2950cf`): typecheck PASS; `npm test` 1276/1276 pass, 0 skip; `forge test` 82/82.

## Intake of newer work

| Source | Status |
|---|---|
| `chatgpt/zero-codex/recovery-reference-identity-20261115` (a4dc855,e5b4c6c,85849f7) | INTEGRATED (cherry-pick, conflict resolved preserving keyboard-focus assertions); `test:recovery:browser` PASS |
| `chatgpt/zero-codex/d9-restored-race-20261111` (cumulative D9 regressions) + `d9-cross-deployment-nonce-20261111` | Assigned Team A with D9 implementation |
| Solana `claude/sleepy-fermat-4s6ocx`, `codex/solana-payout-docs-20261109` | Team B intake |
| `claude/friendly-dijkstra-nsi310`, `claude/vibrant-cray-ny4gum`, `parallel/localization-blank-warning-20261113` | Team B intake |

## Ledger

`ID | Sev | Component | Finding | Owner | Status | Commit | Tests`

| ID | Sev | Component | Finding | Owner | Status |
|---|---|---|---|---|---|
| L1 | P1 | domain/schemas/wallet | D9 durable `sendMarkedAt` + provenance + skip-rule (BT-03/G4) | upstream c398f13/88f9e40/c1f8e75 (PR #122); Team A = independent review | IMPLEMENTED upstream; REVIEW IN PROGRESS |
| L2 | P0 | chain-evm | Canonical `getTrade(bytes32)` reader (BT-01/G3) | upstream 83ff039/120e1ea (PR #120/#123); Team C = independent review | IMPLEMENTED upstream; REVIEW IN PROGRESS |
| L3 | P1 | wallet/exchange | D1 PeerAcceptance (BT-02/G2); exact field names = owner decision | — | BLOCKED (owner) |
| L4 | P1 | apps/web | G1/D8 browser trading journey; owner decision on localnet composition | — | BLOCKED (owner) |
| L5 | P2 | governance | SECURITY.md private reporting route (BT-06); GitHub PVR enablement = owner action | Lead | DONE (file) |
| L6 | — | all | Completeness/wiring matrix + branch intake | Team B | IN PROGRESS |
| L7 | — | all | Red-team pass 1 on baseline | Team D | IN PROGRESS |
| L8 | — | web | Recovery-reference stable-ID label | Lead | DONE |

File ownership: Team A owns `packages/schemas/src/intent.ts`, `packages/domain/src/{intent-journal,tx-lifecycle}.ts`,
`packages/wallet/src/evm-execution.ts` and their tests. Team C owns `packages/chain-evm/**`. Team B/D are read-only
except their own report files and new red-team test files. Lead owns docs/tasks/ledger and shared facades.

## Checkpoint 2 — upstream merge (2026-11-16 17:45 UTC)

Upstream Codex workers merged PRs #119–#123 into this branch (head `46e2a7d`) while agents were rate-limited.
Lead fast-forwarded (no rewrite). Lead-run evidence at exact `46e2a7d`: typecheck PASS; `npm test` 1298/1298
(0 fail/skip); `forge test` 82/82; `check:boundaries` PASS (126 sources / 64 core modules).
Solana `claude/sleepy-fermat-4s6ocx` @`e2e25cf` (not yet integrated): `cargo build-sbf --arch v3` + `cargo test --features localnet`
= 47 LiteSVM tests PASS (Agave 4.1.2, rust 1.98.1). Fixture/LiteSVM only — no parity claim.
