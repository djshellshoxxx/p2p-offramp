# Transport policy enforcement

- **Specification ID:** G05
- **Section:** 05_ADVANCED_PRIVACY_INFRASTRUCTURE
- **Feature:** feature_5.1_network_privacy
- **Module:** module_5.1.2_transport_policy
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 0

## Scope

Define enforceable routing modes across RPC, relay, map, and proof-provider traffic. Expose unsupported or unverified paths without claiming browser-wide proxy control.

## Required behavior

1. Route application network calls through a policy interface; strict mode rejects incompatible transports and blocks silent fallback.
2. Classify wallet-extension traffic separately because the app cannot force its routing; strict requirements must reject unsupported wallet integrations.
3. Phase 0 approves the wrapper contract and failure behavior; a working native Tor/I2P implementation is not a dependency of ordinary Phase 2 mode.

## Dependencies

- [G04: Client content security policy](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.12_browser_security/module_5.12.1_content_boundary/spec-client-content-security-policy.md)

## Acceptance evidence

- Simulated private-transport loss produces no direct application requests.
- UI distinguishes configured, verified, unsupported, and unknown routing states.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
