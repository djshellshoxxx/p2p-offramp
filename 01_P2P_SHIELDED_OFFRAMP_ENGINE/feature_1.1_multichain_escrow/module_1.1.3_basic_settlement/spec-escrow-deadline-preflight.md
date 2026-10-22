# Escrow deadline preflight

- **Specification ID:** G18
- **Section:** 01_P2P_SHIELDED_OFFRAMP_ENGINE
- **Feature:** feature_1.1_multichain_escrow
- **Module:** module_1.1.3_basic_settlement
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 2

## Scope

Define whether sufficient time remains to start or continue manual settlement. Prevent client clocks from acting as settlement authority.

## Required behavior

1. Derive authoritative deadline status from chain state/time under chain-specific rules; local countdown is informational.
2. Configure a reviewed minimum remaining-time buffer covering confirmation and signing delays; stop new payment instructions when buffer is exhausted.
3. After expiry or ambiguous chain status, show reconciliation/refund guidance rather than an instruction to pay.

## Dependencies

- [G11: Chain network registry](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.6_wallet_connectivity/module_1.6.2_rpc_registry/spec-chain-network-registry.md)
- [G17: Manual settlement risk policy](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.3_basic_settlement/spec-manual-settlement-risk-policy.md)

## Acceptance evidence

- Clock skew and RPC lag cannot mark an expired trade payable.
- Release/refund races resolve to exactly one chain terminal outcome.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
