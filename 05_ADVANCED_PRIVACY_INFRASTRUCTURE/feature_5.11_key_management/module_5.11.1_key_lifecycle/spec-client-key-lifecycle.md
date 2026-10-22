# Client key lifecycle

- **Specification ID:** G01
- **Section:** 05_ADVANCED_PRIVACY_INFRASTRUCTURE
- **Feature:** feature_5.11_key_management
- **Module:** module_5.11.1_key_lifecycle
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 0

## Scope

Define generation, separation, locking, and destruction of client identity keys. Keep wallet spending authority separate from messaging and storage authority.

## Required behavior

1. Use operating-system-backed browser randomness and evaluated crypto libraries; no custom curves or entropy collectors.
2. Keep external wallet private keys outside the application; create separate messaging/storage keys and version every derivation domain.
3. Specify lock-on-idle behavior, memory exposure limits, key rotation, and compromise handling; encrypted storage does not protect an unlocked malicious client.

## Dependencies

- Existing system threat models and the Phase 0 security gate.

## Acceptance evidence

- Known-answer derivation tests pass; wrong domains cannot substitute keys.
- Locking removes application-held decrypted references and rejects signing until unlocked.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.
