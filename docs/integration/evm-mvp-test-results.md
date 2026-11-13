# EVM MVP test results — 2026-11-11

Runtime: Node v24.22.1, npm 11 (bundled), Foundry `1.5.1-v1.5.1` (`b0a9dd9`), solc 0.8.30
(sha256 `f3e987dc…428f7`), Chromium 153 from `/opt/pw-browsers`. Linux sandbox; loopback only;
no external RPC, relay or funds. Evidence is local, not hosted CI and not an independent audit.

## Baseline (`main` `cdde998`)

`npm test` 1091/1091. All EVM suites pass once Foundry is installed from the `v1.5.1` tag
(the `stable` tarball fails the kit pin with `TOOLCHAIN_MISMATCH` in `test:exchange:evm`,
`test:recovery:evm`, `test:sepolia:kit`, `test:sepolia:trade`; environment, not code).

## Combined run on the branch

Full run at `f3d8410`; relay files then changed in `37e94b2` (`pool.ts` back to byte-identical
with `main`), so the affected suites were rerun at the final head (see the bottom of this file).

| Command | Result |
|---|---|
| `npm test` | 1100 tests: 1099 pass, 0 fail, 1 skip (skip: nostr-tools duplicate-semantics case, no pure function) |
| `npm run typecheck` | pass (4 configs) |
| `npm run check:boundaries` | PASS, 118 production files / 59 core modules |
| `npm run check:specs` / `npm run test:specs` | pass, 173 specs / 12 tests |
| `npm run test:build-policy` | 22/22 |
| `npm run build` / `npm run build:demo` | pass |
| `npm run test:evm` | 82/82 (unit, fuzz 1024 runs, invariants 128×64) |
| `npm run test:evm:local` | 8 checks |
| `npm run test:exchange:evm` | 12 checks |
| `npm run test:evm:reconcile` | 5 checks |
| `npm run test:evm:viem` (new) | 9 unit + 17/17 Anvil checks; 1 recorded finding |
| `npm run test:recovery:evm` | 6 checks |
| `npm run test:sepolia:kit` / `test:sepolia:trade` | 15 + 11 checks / 8 + 13 checks (local Anvil stand-in, not Sepolia) |
| `npm run test:fuzz` | 26/26 |
| `npm run test:local-evm` | pass after `npm --prefix packages/escrow-evm ci --ignore-scripts` (first run: `ethers` missing, setup only) |
| `npm run test:web:browser` | pass (`unexpectedRequests: 0`) |
| `npm run test:browser` | pass |

Not run: `npm run sepolia:*` (no trusted Sepolia RPC or funded synthetic accounts); hosted CI and
SonarCloud for the exact head (run by GitHub after push).

## Relay failover (PR #83 report)

- Reproduced: fails 3/3 on Node 22.23.4, passes 3/3 on Node 24.22.1.
- Isolated with a 10-line probe: a server that destroys the socket during the upgrade makes
  Node 22's `WebSocket` fire `error` and never `close` (stays `CONNECTING`); Node 24 fires both
  within ~14 ms.
- The pool releases a socket slot only on `close` ("calling close is not proof of closure"), so
  with `maxRelays: 1` the slot never frees on Node 22 and failover cannot start.
- A fix releasing on pre-open `error` (`a693a4e`) was **reverted** (`37e94b2`): an independent
  reviewer showed, with spec-order `error` then `close` 30 ms later, 11 live sockets under
  `maxRelays: 1`. The spec does not guarantee teardown is finished when `error` fires.
- Classification: runtime incompatibility on an unsupported Node version (engines `>=24`), not a
  pool or harness defect. New tests pin the bound with injected sockets on any runtime and fail
  against the reverted change (mutation check).

## Differential findings

- **viem:** `EvmChainReader.read()` targets `escrows(bytes32)` (legacy `packages/escrow-evm`); the
  canonical `contracts/evm` contract only exposes `getTrade(bytes32)` with a different word order.
  The reader fails closed (`UNAVAILABLE`). Through a labelled layout shim, decoded fields match
  viem's ABI decoder for `funded` and `released`. Chain id, finalized anchor, code hash and
  receipts (success, revert, missing, pending) agree with viem.
- **nostr-tools:** event ids match on a 10-event corpus (control characters, U+2028/2029, emoji,
  RTL, 64 tags, 25 KB content); signatures verify in both directions; tampering is rejected by
  both. On 43 malformed inputs the repo never accepts what nostr-tools rejects. It is stricter on
  exact keys, lowercase hex shape for id/sig, `created_at`/`kind` ranges, empty tags, size caps
  and control characters in signed content.

## Final head rerun

Recorded in the PR description (exact SHA and counts).
