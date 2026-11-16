# EVM MVP gap closure

## Current development refresh — November 16, 2026

The table below is the historical November 11 intake. Current cumulative baseline:
`claude/confident-fermi-g6wjp3@7461c87`.

| Gap | Current development state |
|---|---|
| G3 | Implemented with a trusted runtime-Keccak-to-layout policy. Canonical direct reads now have real Foundry/Anvil and viem differential coverage for native release, ERC-20 fund/refund, absent state, immutable mismatches, unknown policy and finalized-state lag. Production runtime approval and independent review remain outstanding. |
| G4 | Version 2 intents persist `sendMarkedAt` and `originProfileId`; legacy and restored provenance stay conservative. Implemented through PR #122; see [migration details](../consolidation/2026-11-16-d9-migration.md). |
| G1/G2/G5 | Unfinished. Signed peer-acceptance specification/vectors and runtime implementation, approved localnet browser composition, and two-wallet browser acceptance remain distinct work. |
| G9 | Real Sepolia acceptance remains unperformed; no approved RPC/accounts were supplied. |

Fresh evidence and current limitations: [continuation report](../consolidation/2026-11-16-canonical-qualification.md).
These updates do not establish production qualification or change the historical evidence below.

Date: 2026-11-11. Source: `main` `cdde998` plus this branch. Scope: the 12-step two-party EVM
escrow trade (seller funds, buyer pays fiat off-app, seller releases; cancel/timeout/refund).

## What already works (verified this session, not mocks)

Against a real `contracts/evm` BasicEscrow on loopback Anvil, outside the web UI:

| Step | Evidence (command, result) |
|---|---|
| Signed G16 terms, accept, fund (native and ERC-20), release, refund, withdraw, reverting buyer | `npm run test:evm:local` — 8 checks pass |
| Canonical exchange over real Nostr crypto and relay, durable chat, fresh-key recovery, journaled sends with durable markers | `npm run test:exchange:evm` — 12 checks pass |
| Receipt reconciliation to finalized, release through lifecycle | `npm run test:evm:reconcile` — 5 checks pass |
| Portable recovery package, unsigned external-wallet exits | `npm run test:recovery:evm` — 6 checks pass |
| Contract fuzz and invariants | `npm run test:evm` — 82/82 |

## Gaps

| ID | Missing behavior | Existing relevant code | Upstream reused | Adapter / new code | Dependencies | Security impact | Tests | Owner | Status |
|---|---|---|---|---|---|---|---|---|---|
| G1 | Web UI wallet connect, offer publish/discover, fund, confirm fiat, release, refund buttons | `apps/web/src/main.tsx` (vault + trade review only), `packages/wallet/src/evm-adapter.ts`, `evm-execution.ts` (test-only, not bundled), `packages/relay/src/pool.ts`, `packages/exchange` | none needed (wagmi rejected) | New `apps/web` journey composition over existing services | Issue #82 invariant forbids production journey wiring; D8 Tier C approval; G2 | High (introduces send authority into the shipped app) | Browser acceptance (G5) | Owner decision | **Blocked — owner decision** |
| G2 | Peer acceptance carrier: both parties prove wallet acceptance over the encrypted channel | `packages/exchange/src/messages.ts` (`terms-accept` = `{revision}`), `packages/wallet/src/evm-terms.ts` | none | D1 Option B `PeerAcceptance` EIP-712 struct, v2 messages | D1 accepted; packet requires version id, exact field names, two-implementation vectors and independent review first | High (trust transition) | D1 test-vector list | Owner + Tier C reviewer | **Blocked — spec work required** |
| G3 | `EvmChainReader.read()` cannot read the canonical contract | `packages/chain-evm/src/reader.ts` (`escrows(bytes32)`), `packages/wallet/src/evm-escrow.ts` (`buildGetTrade`/`decodeTrade`, used by local scripts) | viem as oracle | Layout-aware decode of `getTrade(bytes32)` returning (seller, deadline, state, buyer, token, amount); deployment record must name the layout | Registry `DeploymentV1` field (Tier C: `registry.ts`) | High (funding observation); currently fails closed | `test:evm:viem` finding `READER_SELECTOR_MISMATCH` asserts fail-closed today and pins viem's decoded values for the fix | Separate Tier C PR | **Open — documented, not changed here** |
| G4 | Durable send marker `sendMarkedAt` (D9 Option A) | `packages/domain/src/intent-journal.ts`, `tx-lifecycle.ts`; test PRs #69–#75 | none | Versioned `IntentV1` parser, skip-rule change | D9 accepted; migration rule; Tier C | High (duplicate-send / nonce provenance) | D9 acceptance tests 1–8 | D9 lane (#69–#75) | **In another lane — not touched** |
| G5 | Browser two-wallet acceptance | `scripts/test-*-browser.mjs` (playwright-core, loopback, blocked egress) | Synpress deferred | Synthetic EIP-1193 injector backed by Anvil dev keys (no extension download) | G1 | Medium | 17-step journey + failure list in the task brief | Next milestone | **Blocked by G1** |
| G6 | PR #83: relay failover test fails on Node 22 | `packages/relay/src/pool.ts` | NDK rejected | None. Root cause: Node 22 undici never emits `close` after a failed handshake; the pool deliberately holds a slot until `close`. A fix releasing on `error` (`a693a4e`) was reverted (`37e94b2`) after review showed 11 live sockets with `maxRelays: 1` | Node ≥24 (`engines`) | Medium (socket bound kept) | 2 runtime-independent bound tests; mutation-checked | this branch | **Resolved as runtime incompatibility** |
| G7 | Independent check of Nostr event id/signature/parsing | `nip01.ts`, `nostr-crypto/src/event.ts` | nostr-tools 2.25.2 | Differential test | none | Low | 7 tests | this branch | **Done** (`f3d8410`) |
| G8 | Independent check of chain observation decoding | `reader.ts` | viem 2.57.10 | Dev-only read adapter + Anvil oracle | none | Low | 9 + 17 checks | this branch | **Done** (`7cd1a49`) |
| G9 | Sepolia two-party run | `scripts/sepolia/*` kit | none | none | Trusted Sepolia RPC + funded synthetic accounts (owner-held) | Medium | `npm run sepolia:trade` | Owner | **Not attempted — no trusted Sepolia configuration in this session** |

## Decisions needed (exact)

1. **G1/D8:** May a *localnet-only* build profile (like `build:testnet`, never default) compose
   `createEvmExecution`, `EvmWalletAdapter`, the relay pool and exchange into the UI, with
   `ReleaseEnabled=0` unchanged? Without this, M1 cannot be exercised through the web UI.
2. **G2/D1:** Approve the `PeerAcceptance` version identifier and field names so vectors can be
   generated from two implementations.
3. **G3:** Choose how a deployment record declares its escrow ABI layout (new `DeploymentV1`
   field vs. a reader keyed by the pinned runtime code hash), then authorize the Tier C reader PR.
