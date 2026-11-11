# EVM MVP handoff — 2026-11-11

Branch `claude/p2p-offramp-evm-escrow-vc7stk` (from `main` `cdde998`). One PR; commits are split
by lane so each can be reviewed or cherry-picked separately.

| Commit | Lane | D8 tier |
|---|---|---|
| `b15b18a` | dev-only pins `viem@2.57.10`, `nostr-tools@2.25.2` | A (tooling) |
| `a693a4e` | relay pool: release slot on pre-open handshake error (**reverted**) | B |
| `37e94b2` | revert of `a693a4e`; spec-order socket-bound tests | A (net: tests only) |
| `7cd1a49` | viem differential oracle (`test:evm:viem`) | A |
| `f3d8410` | nostr-tools differential tests | A |
| docs commit | `docs/integration/*`, `tasks/todo.md` | A |

No Tier C path is modified (`contracts/**`, `packages/wallet/src/evm-*.ts`, `packages/nostr-crypto/**`,
`registry.ts`, `security/**` unchanged). `ReleaseEnabled=0`; no network, registry, release or
funds change.

## User Guide

Nothing user-visible changed. The web app still has no trading; this work adds verification only.

## Developer Guide

Local setup used for the evidence (Linux, no root needed beyond `~/.foundry`):

```bash
export PATH=/opt/node24/bin:$HOME/.foundry/bin:$PATH   # Node >=24 is required by package.json
```

```bash
git submodule update --init --depth 1 && npm ci --ignore-scripts && npm --prefix packages/escrow-evm ci --ignore-scripts
```

Install Foundry from the **`v1.5.1` tag** (the `stable` tarball reports `1.5.1-stable` and the
Sepolia kit rejects it with `TOOLCHAIN_MISMATCH`). If `binaries.soliditylang.org` is blocked, put
the static `solc-0.8.30` from GitHub releases at `~/.svm/0.8.30/solc-0.8.30` (sha256
`f3e987dc6ecebd4bd350c48edcbc320b46cf9e3109bd3fc3d88f1acaf4c428f7`) and set
`FOUNDRY_SOLC=$HOME/.svm/0.8.30/solc-0.8.30`.

New command: `npm run test:evm:viem` (loopback Anvil, ~2 s).

Pitfall: `npm test` on Node 22 fails `failover: a relay that never connects…` because Node 22's
WebSocket never emits `close` after a failed handshake and the pool (correctly) holds the slot
until `close`. Use Node 24; Node 22 is outside `engines`.

## Exact next actions

1. Owner: answer the three decisions in `mvp-gap-closure.md` (G1 localnet UI profile, G2 D1
   field names, G3 escrow ABI layout in deployment records).
2. G3 (after decision): Tier C PR making `EvmChainReader.read()` decode `getTrade(bytes32)`;
   flip `test:evm:viem` check B1 from "fails closed" to "matches viem" and drop the shim.
3. G4: land the D9 `sendMarkedAt` lane (#69–#75) per Issue #82 order; not touched here.
4. G1 + G5: localnet journey composition, then a synthetic EIP-1193 injector browser test
   driving the 17-step journey; evaluate Synpress only after that passes.
5. G9: Sepolia run needs owner-held trusted RPC and funded synthetic accounts.

No autonomous continuation exists after this session ends.
