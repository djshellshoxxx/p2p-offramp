# Static frontend architecture

- **Specification ID:** G07
- **Section:** 00_PLANNING_AND_THREAT_MODELING
- **Feature:** feature_0.4_architecture_planning
- **Module:** module_0.4.3_frontend_shell
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 1

## Scope

Define a React, TypeScript, and Vite client as the initial static frontend. Separate presentation from domain logic and replaceable infrastructure adapters.

## Required behavior

1. Use apps/web and packages for domain, storage, transport, chain, and schema boundaries; domain code must not import React or concrete providers.
2. Require static assets only in the deployment bundle; no server rendering, server API, or embedded secrets.
3. Use relative asset paths and a routing strategy tested on IPFS gateways; record framework versions and reproducible build commands during implementation.

## Dependencies

- [G04: Client content security policy](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.12_browser_security/module_5.12.1_content_boundary/spec-client-content-security-policy.md)
- [G06: Cryptographic dependency policy](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.9_security_assurance/module_0.9.1_dependency_provenance/spec-cryptographic-dependency-policy.md)

## Acceptance evidence

- Import-boundary checks reject UI or provider imports in domain packages.
- Deep-link reload and asset loading work on local static hosting and an IPFS gateway.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
