# Incident response and redacted diagnostics

- **Specification ID:** G26
- **Section:** 00_PLANNING_AND_THREAT_MODELING
- **Feature:** feature_0.11_operations
- **Module:** module_0.11.1_privacy_operations
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 2

## Scope

Define operational triage without collecting private trade content by default. Preserve a path to recover existing funds during outages or vulnerabilities.

## Required behavior

1. Diagnostics are local by default and user-exported with field-level redaction; exclude keys, plaintext chats, precise locations, and bank credentials.
2. Define severity, release ownership, dependency compromise response, and a public advisory mechanism with minimal incident data.
3. Disable creation of affected new trades while preserving permissionless authorized exits; do not invent a global pause power absent from the deployed protocol.

## Dependencies

- [G25: MVP deployment and rollback](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.3_system_integration/module_0.3.4_deployment_runbook/spec-mvp-deployment-and-rollback.md)

## Acceptance evidence

- Synthetic secrets cannot appear in diagnostic exports.
- A rehearsal recovers an active trade with the primary RPC/relay/frontend unavailable.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
