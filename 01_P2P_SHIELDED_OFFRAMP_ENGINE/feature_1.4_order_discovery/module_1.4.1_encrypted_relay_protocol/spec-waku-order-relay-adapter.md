# Waku order relay adapter

**Status:** Engineering/security design baseline, not implemented or independently audited. **Priority:** MVP or prerequisite. **Normative:** MUST is required; SHOULD deviations need review.

## Scope and implementation contract
Treat Waku as optional transport with explicit capability negotiation; encryption occurs at application layer independent of relay. Bind content topic and trade context without revealing private identifiers where avoidable. Define message TTL, peer selection, delivery acknowledgment semantics, duplicate filtering, failover and offline behavior. Never claim message deletion or metadata anonymity. Avoid sending wallet seeds or plaintext bank evidence.

## Interface and error semantics
Define explicit versioned types and canonical serialization for every boundary, validation of all external inputs, typed errors (INVALID_INPUT, EXPIRED, UNAUTHORIZED, REPLAY, WRONG_CHAIN, UNAVAILABLE, INTEGRITY_FAILURE), retry/cancel/reconcile operations and no secret-bearing diagnostics. Public chain, external RPC, wallets and peer relays are independently untrusted; distinguish observed data from cryptographically verified facts. Require fail-closed handling of unsupported versions and security downgrades. Preserve keyboard/screen-reader access and translated error/help text.

## Threat model and tests
Topic enumeration, replay, spam, censorship, routing failure, metadata correlation, untrusted peer payload, memory exhaustion.

Acceptance: unit and negative tests for all failure classes; fuzz parsers or financial invariants; test restart/reorg/timeout where relevant; browser mobile compatibility; signed deployment manifest; documented residual privacy risks; dependency version/license lock; independent security review before real funds. References: [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md), [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193), [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/). Resolve any design choices and measurable thresholds in a recorded ADR before coding.
