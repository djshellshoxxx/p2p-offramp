# Nullifier consumption state

**Status:** Expanded design specification; independent security review and implementation pending. **Priority:** advanced feature unless MVP evidence policy. **Normative:** MUST is a release gate; SHOULD needs an approved deviation.

## Purpose, scope and trust model
Nullifier MUST be checked and marked consumed atomically in authoritative contract/verifier state. Scope by chain, verifier, action, epoch and protocol version; use explicit domain separation. Handle concurrent submissions and reorgs; never trust relay acknowledgment. Emit minimal event data to avoid user correlation.

## Interfaces and implementation requirements
Define versioned input/output types, canonical serialization, required/optional fields, explicit validation and typed errors. Authenticate trust roots and user consent at boundaries. Use pinned audited dependencies and recorded test vectors; prohibit silent fallback to weaker proof, cipher, transport or verifier. Document privacy metadata exposed to chain, relay, issuer and browser. Reject unsupported versions, oversized inputs, expired assertions and mismatched trade/chain context. State machine MUST have terminal failure and cancellation paths and user-safe recovery. Avoid putting credentials, identity secrets or evidence plaintext in URLs, logs or public chain events.

## Security tests and acceptance
Tests: race, duplicate submission, fork rollback, wrong domain, epoch rollover, chain replay and unauthorized state mutation.

Add unit tests, negative/fuzz tests for parsers and cryptographic inputs, integration fixtures, browser recovery and replay tests. Verify independent implementation against published vectors before any live-fund deployment. Record known limitations, dependency lock, verifier key hashes and reviewer sign-off. References: [Semaphore](https://github.com/semaphore-protocol/semaphore), [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/), and the repository threat model. Exact algorithms and key management choices remain gated architectural decisions.
