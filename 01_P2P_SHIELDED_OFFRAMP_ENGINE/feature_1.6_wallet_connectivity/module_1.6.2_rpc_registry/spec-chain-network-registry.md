# Chain network registry

- **Specification ID:** G11
- **Section:** 01_P2P_SHIELDED_OFFRAMP_ENGINE
- **Feature:** feature_1.6_wallet_connectivity
- **Module:** module_1.6.2_rpc_registry
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 1

## Scope

Define signed release configuration for supported networks, assets, and contracts. Prevent malicious configuration from redirecting transactions.

## Required behavior

1. Bind each network to chain identity, RPC policy, contract address/program ID, code identity, supported assets, decimals, and finality settings.
2. Validate configuration at build time and runtime; fail closed on a wrong-chain RPC or mismatched deployed code.
3. Support user-selected RPCs only under explicit policy with chain verification; never treat provider responses as unconditional truth.

## Dependencies

- [G05: Transport policy enforcement](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md)
- [G10: Wallet provider interface](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.6_wallet_connectivity/module_1.6.1_provider_boundary/spec-wallet-provider-interface.md)

## Acceptance evidence

- Reject wrong chain, altered program ID, and forged decimals.
- A fresh client can identify all dependencies from the release manifest.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
