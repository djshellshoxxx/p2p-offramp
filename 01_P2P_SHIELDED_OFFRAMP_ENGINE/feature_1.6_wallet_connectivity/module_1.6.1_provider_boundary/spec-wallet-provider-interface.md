# Wallet provider interface

- **Specification ID:** G10
- **Section:** 01_P2P_SHIELDED_OFFRAMP_ENGINE
- **Feature:** feature_1.6_wallet_connectivity
- **Module:** module_1.6.1_provider_boundary
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 1

## Scope

Define chain-neutral wallet capabilities with separate EVM and Solana adapters. Keep permission requests and account changes explicit.

## Required behavior

1. Expose connect, disconnect, accounts, network, signTransaction, and capability queries; signing methods must not imply identical EVM/Solana formats.
2. Use EIP-1193 semantics for EVM and an evaluated Solana Wallet Standard adapter; handle disconnect and network/account changes before every send.
3. Freeze transaction intents on a selected account/network and cancel preparation after context changes; never silently sign replacement intents.

## Dependencies

- [G01: Client key lifecycle](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.11_key_management/module_5.11.1_key_lifecycle/spec-client-key-lifecycle.md)
- [G07: Static frontend architecture](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.3_frontend_shell/spec-static-frontend-architecture.md)

## Acceptance evidence

- Reject wrong-network, denied-permission, disconnected, and changed-account operations.
- Run the same lifecycle contract tests against EVM and Solana adapters.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
