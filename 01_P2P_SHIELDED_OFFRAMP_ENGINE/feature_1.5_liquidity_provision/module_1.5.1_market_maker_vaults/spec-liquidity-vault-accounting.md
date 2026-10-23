# Liquidity vault accounting

**Status:** Engineering/security design baseline, not implemented or independently audited. **Priority:** post-MVP. **Normative:** MUST is required; SHOULD deviations need review.

## Scope and implementation contract
Treat pooled funds as high-risk optional post-MVP feature. Define deposit/withdrawal shares, NAV precision, fee accrual, locked reserves, available balance and insolvency checks. Never allow operator discretionary withdrawal. Enforce per-asset conservation, authorization and reentrancy protection; cap exposure and pause new deposits on invariant failure. Clarify legal custody classification before deployment.

## Interface and error semantics
Define explicit versioned types and canonical serialization for every boundary, validation of all external inputs, typed errors (INVALID_INPUT, EXPIRED, UNAUTHORIZED, REPLAY, WRONG_CHAIN, UNAVAILABLE, INTEGRITY_FAILURE), retry/cancel/reconcile operations and no secret-bearing diagnostics. Public chain, external RPC, wallets and peer relays are independently untrusted; distinguish observed data from cryptographically verified facts. Require fail-closed handling of unsupported versions and security downgrades. Preserve keyboard/screen-reader access and translated error/help text.

## Threat model and tests
Donation/inflation attack, rounding, fee-on-transfer, stale price, oracle manipulation, locked funds, withdrawal race and insolvency.

Acceptance: unit and negative tests for all failure classes; fuzz parsers or financial invariants; test restart/reorg/timeout where relevant; browser mobile compatibility; signed deployment manifest; documented residual privacy risks; dependency version/license lock; independent security review before real funds. References: [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md), [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193), [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/). Resolve any design choices and measurable thresholds in a recorded ADR before coding.
