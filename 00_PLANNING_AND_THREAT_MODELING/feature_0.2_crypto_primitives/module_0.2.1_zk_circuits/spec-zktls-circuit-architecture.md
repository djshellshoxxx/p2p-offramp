# zkTLS circuit and evidence architecture

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M4 optional.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Authenticate a bounded statement about provider data under explicit zkTLS trust assumptions. TLS authenticity and a circuit predicate do not establish payment irrevocability, ownership beyond the stated account association, or protection against chargebacks. No bank integration/provider is enabled until separately admitted.

## 3. Architecture and data contracts

Separate five components: provider policy, transcript acquisition/notary protocol, private parser/witness builder, prover worker and verifier. ProviderPolicy is `{id,version,host,allowedPaths,responseSchemaDigest,notaryModel,notaryKeys,statementId,verifierDigest,freshnessSeconds,maxTranscriptBytes,reviewId}`. Credentials, cookies and full transcript stay transient in the acquisition boundary; vault stores only explicitly selected encrypted evidence. Public output binds provider-policy hash, trade/terms hash, currency/minor-unit amount, recipient commitment, payment-reference commitment, observation interval and claim status. Redaction is part of the circuit statement, not a screenshot crop.

## 4. Algorithms and lifecycle

Require explicit consent naming provider and any notary that can observe metadata/plaintext. G05 must approve the actual acquisition route; strict mode refuses unsupported/unknown provider paths. Acquire under the pinned protocol, verify host/certificate/transcript authentication as defined by it, enforce response schema, reject ambiguous multiple transfers and build witness locally. A worker runs with 16 MiB input and 120-second initial ceiling; cancel terminates worker and drops references. Bind a fresh application challenge under the public-input contract. Verification checks approved protocol/circuit/provider digests and policy freshness, then renders a narrowly worded observation. A revoked or refunded transfer remains possible after a previously valid observation; receipt status is not rewritten into final settlement.

## 5. Interfaces and integration

`collectEvidence(policy,consent,challenge)` returns encrypted local evidence handle plus a preview; `prove(handle)` returns proof/public envelope; `verifyEvidence` returns `{cryptographicValidity,policyValidity,observedClaim,residualRisks}`. UI displays these separately. Provider policies require exact data-field interpretation, time zone, currency precision, pending/posted/reversed status mapping and credential handling review. A manual evidence attachment remains a labeled unauthenticated attachment, not fallback proof success.

## 6. Errors, abuse and residual threats

PROVIDER_UNSUPPORTED, AUTHENTICATION_FAILED, SCHEMA_CHANGED, AMBIGUOUS_TRANSFER, POLICY_STALE, RESOURCE_LIMIT and USER_CANCELLED leave trade authority unchanged. Do not scrape using a server that receives bank passwords. Malicious notaries, TLS endpoint compromise, collusion, parser ambiguity, proof-system flaws and metadata leakage are explicit per-policy threats. Missing provider details means unsupported, never optimistic acceptance.

## 7. Verification and primary references

Before admission, use provider-authorized/synthetic transcripts with altered signatures, host, amount, recipient, decimal locale, status, duplicate entries, clock skew and redaction omissions. Independently reproduce verification and measure mobile memory. Demonstrate no credential persistence/logging and no outbound request after cancelled strict-mode preflight. Review provider terms/jurisdiction separately; core release/refund regression must pass without the module.

Primary references (exact implementation revisions must be pinned in the evidence record): [TLS 1.3 RFC 8446](https://www.rfc-editor.org/rfc/rfc8446); [TLSNotary documentation](https://docs.tlsnotary.org/); [WebAssembly security](https://webassembly.org/docs/security/).
