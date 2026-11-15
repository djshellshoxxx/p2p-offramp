# ChatGPT Free continuation — P2P Offramp

Date: 2026-11-15
Target branch: integration/p2p-consolidated-20261109
Starting integration commit: e8d9d0343884835fdce895fdd450ba766c15aad8
Main at inspection: cdde998cf1d0e54c6cfb6fe9cdde0fc22a80e10e

## Execution boundary

This session inspected GitHub-hosted source through the connected GitHub integration. A local clone was attempted but the execution environment could not resolve github.com; therefore no package tests, TypeScript checks, OpenSSL cross-checks, local EVM tests, or browser tests could be run. The caveman plugin was searched for but is not available. No agents were started. No source implementation or branch merge was attempted without a runnable checkout and test evidence.

## Current findings

### D9 — durable transaction recovery

- The target integration branch still has IntentV1 only: packages/schemas/src/intent.ts has no sendMarkedAt, no v2 record, and no journal-origin provenance field.
- packages/domain/src/intent-journal.ts still writes/decodes the v1 field set; the durable marker/provenance migration is not present on this target.
- packages/domain/src/tx-lifecycle.ts contains nonce checks scoped by network and account in some paths, but does not implement the accepted durable marker semantics.
- Relevant open PRs inspected: #69–75 and #91–93, #97. They add focused regressions for marker-write uncertainty, fresh-key restore, historical terminal/prepared/pending holds, hash conflicts, address casing, account/network isolation, concurrent journals, and cross-deployment nonce reservation. These are not merged into the target integration branch. PR #69 also changes a send-marker error to BROADCAST_UNKNOWN; verify its complete source context and tests before adopting it.
- Do not merge these PRs blindly. Establish the production v2 schema/journal/lifecycle implementation first, then retain and run their regression coverage against the consolidated result.

### G3 — canonical EVM reader

- packages/chain-evm/src/reader.ts currently computes the selector for escrows(bytes32), not getTrade(bytes32).
- Its current six-word decoder is a separate escrows mapping layout. This does not satisfy the requested canonical getTrade(bytes32) reader.
- packages/wallet/src/evm-escrow.ts already declares getTrade(bytes32) and contains a separate strict return-data decoder for the tuple (seller, deadline, state, buyer, token, amount).
- The reader currently authenticates deployment identity using the registry runtime-code hash and a finalized block anchor. No ABI-layout authorization was established during this session. Do not silently change this trust model or infer a new layout from wire data.
- Next: inspect the exact BasicEscrow ABI/artifact and registry schema/accepted deployment policy. If the accepted policy does not authorize the layout, record the owner decision as a blocker. Reuse the existing viem differential harness.

### D1 — cryptographic peer acceptance

- The target branch contains docs/adr/proposed/D1-peer-acceptance-carrier.md, which records owner acceptance of Option B on 2026-11-04.
- The packet itself says exact version/field names and independent review are prerequisites. It specifies the seller-first flow, PeerAcceptance binding, effective expiry, (termsHash, role) replay binding, durable tombstones, no downgrade, and local registry-derived EIP-712 domain.
- packages/wallet/src/evm-peer-acceptance.ts is absent from the target branch. The exchange protocol implementation remains the existing v1 shape; Stage A and Stage B are not complete on this target.
- Do not add a second signature format or ERC-1271/EIP-7702 support beyond the accepted scope. Freeze exact v2 fields and independent vectors before implementing the verifier.

## Files inspected

- tasks/todo.md
- tasks/plan.md
- docs/adr/proposed/D1-peer-acceptance-carrier.md
- docs/adr/proposed/D9-durable-send-marker.md
- packages/schemas/src/intent.ts
- packages/domain/src/intent-journal.ts
- packages/domain/src/tx-lifecycle.ts
- packages/chain-evm/src/reader.ts
- packages/wallet/src/evm-escrow.ts

The requested docs/integration/mvp-gap-closure.md path was not found on the target branch.

## Changes and verification

- Files changed by implementation: none.
- Tests executed: none; no test command was run or represented as passing.
- Independent review: not performed.
- Haiku cleanup: not performed; no Haiku agent/plugin was available.
- Branch consolidation: none.
- Release gates: no deployment, no production enablement, no real-money transaction, no trust-root change. Preserve ReleaseEnabled=0.

## Exact next action

Obtain a runnable checkout of integration/p2p-consolidated-20261109 at its current head, preserve its working tree, and start with D9. Inspect the full D9 implementation history behind PRs #69–75/#91–93/#97 and the accepted Option A packet; implement the v2 schema/parser/migration, journal provenance and atomic write-once marker in the existing interfaces; then run the focused schema/journal/lifecycle/backup-restore tests. Do not begin G3 or D1 until D9 has passing focused tests and a separate review. If local execution is still unavailable, stop rather than publish untested source changes.
