# Nullifier domain derivation

**Status:** Expanded design specification; independent security review and implementation pending. **Priority:** advanced feature unless MVP evidence policy. **Normative:** MUST is a release gate; SHOULD needs an approved deviation.

## Purpose, scope and trust model
Derive nullifier domain from canonical encoded protocol identifier, version, chain ID, verifier address, group ID, action type and scoped epoch; hash with circuit-compatible reviewed primitive. Distinct actions MUST not share a linkable nullifier. Define explicit serialization, field-element range and collision assumptions. Do not use ad hoc string concatenation.

## Interfaces and implementation requirements
Define versioned input/output types, canonical serialization, required/optional fields, explicit validation and typed errors. Authenticate trust roots and user consent at boundaries. Use pinned audited dependencies and recorded test vectors; prohibit silent fallback to weaker proof, cipher, transport or verifier. Document privacy metadata exposed to chain, relay, issuer and browser. Reject unsupported versions, oversized inputs, expired assertions and mismatched trade/chain context. State machine MUST have terminal failure and cancellation paths and user-safe recovery. Avoid putting credentials, identity secrets or evidence plaintext in URLs, logs or public chain events.

## Security tests and acceptance
Tests: cross-chain/cross-contract collision, reordered fields, ambiguous encoding, field overflow, version downgrade and cross-app correlation.

Add unit tests, negative/fuzz tests for parsers and cryptographic inputs, integration fixtures, browser recovery and replay tests. Verify independent implementation against published vectors before any live-fund deployment. Record known limitations, dependency lock, verifier key hashes and reviewer sign-off. References: [Semaphore](https://github.com/semaphore-protocol/semaphore), [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/), and the repository threat model. Exact algorithms and key management choices remain gated architectural decisions.
