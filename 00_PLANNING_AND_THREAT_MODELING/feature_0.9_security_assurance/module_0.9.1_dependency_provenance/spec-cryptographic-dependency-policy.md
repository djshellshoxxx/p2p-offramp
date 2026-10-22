# Cryptographic dependency policy

- **Specification ID:** G06
- **Section:** 00_PLANNING_AND_THREAT_MODELING
- **Feature:** feature_0.9_security_assurance
- **Module:** module_0.9.1_dependency_provenance
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 0

## Scope

Define selection and update gates for cryptographic dependencies. Record provenance and security review evidence before business logic depends on them.

## Required behavior

1. Inventory primitive, library, version, license, upstream source, maintenance status, and known-answer vectors.
2. Pin reviewed versions and lockfiles; changes require vector reruns and a threat-impact review.
3. Record missing review evidence as a blocker for the affected capability rather than a claim of safety.

## Dependencies

- Existing system threat models and the Phase 0 security gate.

## Acceptance evidence

- A dependency change fails CI when lockfile or approved inventory is inconsistent.
- Required vectors and negative cases run for every supported runtime.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
