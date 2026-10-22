# Signed trade terms

- **Specification ID:** G16
- **Section:** 01_P2P_SHIELDED_OFFRAMP_ENGINE
- **Feature:** feature_1.8_trade_coordination
- **Module:** module_1.8.1_trade_terms
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 2

## Scope

Define a canonical agreement between a crypto seller and a crypto buyer. Bind order acceptance to escrow parameters and enabled capabilities.

## Required behavior

1. Include terms version, order revision, network, contract, seller, buyer, asset, integer amount, quoted fiat terms, expiry, and escrow mode.
2. Both parties confirm the same digest before funding; keep fiat details encrypted and minimize public linkage.
3. Reject stale revisions, mismatched amounts, unsupported capabilities, or changed counterparties.

## Dependencies

- [G10: Wallet provider interface](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.6_wallet_connectivity/module_1.6.1_provider_boundary/spec-wallet-provider-interface.md)
- [G11: Chain network registry](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.6_wallet_connectivity/module_1.6.2_rpc_registry/spec-chain-network-registry.md)
- [G14: Optional module interface](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.6_extension_contract/spec-optional-module-interface.md)

## Acceptance evidence

- Tampering with any bound field invalidates acceptance.
- Concurrent acceptance cannot create two fills of a single-fill order.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
