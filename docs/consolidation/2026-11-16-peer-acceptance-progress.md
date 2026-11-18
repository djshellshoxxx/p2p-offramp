# Peer acceptance development checkpoint

Base: cumulative development after PR #123 was merged at
`46e2a7d43ae930501c6c9c2e14877e0b2f6ad162`. Its exact source head `e7506c2`
passed all three hosted workflow families before merge: EVM escrow, Vault
foundation and Specification inventory. This was consolidation into development;
main and production release were not changed.

## Implemented in draft PR #124

- Offline D1 Option B EOA verifier requiring both TradeTerms and PeerAcceptance
  signatures. The exact proposed EIP-712 fields bind role, account, two messaging
  keys, immutable terms, chain/contract domain and effective expiry.
- Four fixed viem differential vectors covering both roles and native/ERC-20 terms.
- Encrypted replay ledger using existing vault session leases and atomic CAS.
  Duplicate identity ignores signature byte differences. Conflicting bindings
  refuse; cancel/reject tombstones persist through reopen and fresh-key restore
  of a backup containing that history. No-op duplicate checks persisted freshness,
  so a stale cache cannot bypass another session's cancellation.
- Explicit finite capacity with no tombstone eviction; hostile proof/record
  boundaries; no signature retention, public exports, wallet prompts, networking,
  funding authority or default build integration.

The [candidate contract](../integration/peer-acceptance-v1-candidate.md) defines
precise interfaces, bounds, proposed protocol choices and limits. This is partial
D1 implementation, not completion of all P2P-Offramp features.

## Evidence

Node 24.22.1 and the pinned repository dependencies were used, with Foundry/cast
available on PATH for the full package run. No new dependencies or lockfile changes.

| Check | Result |
|---|---|
| Full package/UI suite, four test-file workers | 1,316 pass; zero fail, cancel or skip |
| Peer-binding tests | 7/7 pass |
| Encrypted replay/lifecycle/restore tests | 11/11 pass |
| Four strict TypeScript projects | Pass |
| Default build and artifact scan | Pass |
| Import boundaries | Pass: 128 production sources, 64 core-graph modules |
| Specification audit | 173 documents; zero broken links |

The initial verifier test-first run failed with the missing module, then all cases
passed after implementation. Replay tests exposed an incomplete test-store mock,
which was corrected to implement the existing vault invalidation interface; one
TypeScript inference issue was resolved with an explicit admission result type.
No failure was suppressed or reclassified as a pass.

The stale-duplicate safeguard was mutation-tested: bypassing empty-commit
synchronization caused the named concurrent-tombstone regression to fail by
returning `duplicate`; after restoring the check all 18 focused tests passed and
the complete package suite passed. The temporary mutation is absent from source.

Browser, physical-device, real testnet, independent crypto and contract-wallet
qualification were not run for these private modules. Prior head #124 `4f0b17b`
had specification CI success while EVM/Vault were queued at the last observation;
that is not qualification of the subsequent replay-ledger checkpoint. Final
hosted results must be checked on the published PR head.

## Next incomplete work

1. Review candidate fields/vectors and finalize key-rotation/restore and old-backup
   freshness rules. An offline backup cannot reconstruct later cancellation history.
2. Native EOA/contract/delegated-account classification and point-in-time ERC-1271
   verification for both statements, including action-time policy rechecks.
3. Bounded version 2 carrier and authenticated receive/cancel/reject session wiring,
   with no version 1 revision-only downgrade and no public signature publication.
4. Localnet-only browser composition, two-wallet acceptance, real IndexedDB races,
   crash/reload behavior, account/chain switches and wallet rejection.
5. Remaining Solana and optional-module qualification, real testnet, independent
   security reviews, trust-root/runtime approval and release acceptance.

The signing/trust changes remain a Tier C draft for review under the accepted D8
policy. `ReleaseEnabled=0`, default permissions, main and deployment stay unchanged.
