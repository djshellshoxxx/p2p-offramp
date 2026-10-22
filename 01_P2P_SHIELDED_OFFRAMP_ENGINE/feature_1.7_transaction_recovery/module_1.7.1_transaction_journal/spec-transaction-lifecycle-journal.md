# Transaction lifecycle journal

- **Specification ID:** G12
- **Section:** 01_P2P_SHIELDED_OFFRAMP_ENGINE
- **Feature:** feature_1.7_transaction_recovery
- **Module:** module_1.7.1_transaction_journal
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 1

## Scope

Define durable intent tracking from preparation through finality. Recover interrupted transactions without duplicate economic actions.

## Required behavior

1. Record intent ID, network, contract, action, expected state, tx identifier, and status before relying on broadcast success.
2. After uncertain submission, reconcile on-chain effects before retrying; explicitly handle EVM replacement and Solana blockhash expiry.
3. Classify rejection, pending, dropped, replaced, reverted, finalized, and reorged outcomes; never retry a transfer blindly.

## Dependencies

- [G08: Client state authority](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.4_state_management/spec-client-state-authority.md)
- [G11: Chain network registry](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.6_wallet_connectivity/module_1.6.2_rpc_registry/spec-chain-network-registry.md)

## Acceptance evidence

- Crash immediately before and after broadcast does not cause a duplicate release.
- Replacement, stale blockhash, RPC timeout, and reorg scenarios converge to chain truth.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
