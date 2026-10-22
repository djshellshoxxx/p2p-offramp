# Optional module interface

- **Specification ID:** G14
- **Section:** 00_PLANNING_AND_THREAT_MODELING
- **Feature:** feature_0.4_architecture_planning
- **Module:** module_0.4.6_extension_contract
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 1

## Scope

Define versioned extension capabilities for later phases. Keep the Phase 2 trading loop independent of advanced services.

## Required behavior

1. Use manifest-declared capabilities, schema versions, compatible core versions, and explicit initialization/disposal.
2. Extensions may propose evidence or intents but cannot bypass core state checks or wallet authorization.
3. Snapshot supported capabilities into immutable trade terms; unavailable optional modules do not disable compatible basic trades.

## Dependencies

- [G08: Client state authority](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.4_state_management/spec-client-state-authority.md)
- [G11: Chain network registry](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.6_wallet_connectivity/module_1.6.2_rpc_registry/spec-chain-network-registry.md)

## Acceptance evidence

- Build and run the MVP with all Phase 3–6 packages absent.
- Reject unsupported extension versions before order acceptance.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
