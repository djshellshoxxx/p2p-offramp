# RPC and relay observer defense

## 1. Metadata

- **Specification ID:** TH02
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 0
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Treat configured RPC and relay operators as potentially logging, censoring or equivocating peers. Limit unnecessary identity linkage while preserving recoverable trades. Transport encryption does not conceal data from the selected server.

## 3. Architecture and observation matrix

| Service | Visible data | Required minimization |
|---|---|---|
| EVM/Solana RPC | IP/route origin, requested accounts and transactions | Query only selected network/trades; no full contact/address-book scans |
| Nostr relay | Event metadata, filters, delivery timing | Public advertisement fields only; private messages use selected reviewed protocol |
| Proof provider | Job-specific source and inputs | Disabled until explicit consent and scoped evidence spec |
| Map/geocoder | Location queries | Disabled in core; opt-in and coarse queries in later module |

Chain transaction contents may be public independently of transport. Private messaging protects content only to the extent of its selected reviewed protocol; relay metadata remains visible.

## 4. Required algorithms and invariants

All service I/O goes through G05. Validate remote event schemas, signatures, size and expiry before state insertion. RPC chain/network identity must match the configured registry. Responses are observations; reconcile chain state before economic actions. Deduplicate event IDs before processing and cap in-memory relay buffers according to the relay resilience spec. Do not merge user endpoints with external analytics identifiers or install a globally shared persistent correlation ID. Comparing independent RPC observations may detect disagreement but does not constitute consensus verification. Disagreement disables relevant economic actions until resolved.

No new cryptographic primitive or ZK circuit is defined in this threat model.

## 5. Interfaces and failure recovery

A service diagnostic exposes endpoint registry ID, channel, availability code and local observation time. It MUST NOT expose query contents, full wallet/account identifiers, chat plaintext or proof witnesses. Cache keys are scoped by network and deployment. Cancellation on account/network change invalidates returned data for the current UI but preserves original transaction journal bindings. Remote `success` is never a terminal escrow event without chain adapter reconciliation.

## 6. Threat assessment

Malicious RPCs can fabricate state and simulate successful calls; a configured endpoint remains a trust assumption. Relays can omit or replay valid ads and link subscriptions. Minimize filters, enforce expiry/revalidation and never reveal payment instructions until agreed terms and funded escrow have been reconciled. Do not claim multiple relays make a malicious signed order trustworthy. Logs retained by service operators are outside client deletion control.

## 7. Verification and references

Use scripted RPC/relay peers that lie about chain ID, return stale blocks, reorder/duplicate/drop events, return inconsistent receipts and inject unauthorized deployments. Ensure stale success never enables fiat payment or release. Test account A and B on different networks with the same local ID to prevent cache collision. Inspect network requests for contact-list uploads, unnecessary queries and cross-service correlation IDs.

Normative project dependency: [development roadmap](../../../DEVELOPMENT_ROADMAP.md). See G01–G06 for key, vault, backup, content, transport and dependency enforcement. Threat models define required properties; passing fixtures is not a whole-product security certification.
