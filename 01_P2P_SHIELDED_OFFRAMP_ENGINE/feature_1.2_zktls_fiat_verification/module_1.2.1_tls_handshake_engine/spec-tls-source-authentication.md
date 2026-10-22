# TLS source authentication

## 1. Metadata

- **Specification:** spec-tls-source-authentication
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 4 (optional evidence)
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Verify exactly which authenticated origin and response were attested, without equating TLS identity to true or irreversible payment.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface SourcePolicy {id:string; version:1; httpsOrigin:string;
 pathPatternId:string; redirects:"reject"; notaryKeyId:string;
 verifierProfileId:string; maxResponseBytes:1048576; maxAgeSeconds:300;}
interface AuthenticatedSource {policyId:string; hostname:string;
 responseCommitment:string; observedAtSeconds:string; attestationHash:string;}
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Only an approved source parser profile may select scheme/host/port/path. Require HTTPS, exact normalized origin, certificate hostname/chain/time validation according to reviewed provider policy, authenticated response integrity and notary/verifier identity. Reject redirects and ambiguous mixed sessions. Bind source policy, server-name verification, selected response byte ranges and observation freshness into verified statement; local fetch URL or browser DOM screenshot is not attestation. Unsupported certificate/revocation checking must be reported as provider limits, never claimed performed.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Provider unverifiable certificate policy or unavailable trusted time returns UNSUPPORTED_PROVIDER/UNAVAILABLE. Invalid origin/transcript/key is INTEGRITY_FAILURE with no downgrade or alternate bank auto-selection. Source policy changes invalidate pending jobs.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Origin authenticity says who supplied bytes, not whether the bank is honest, whether account belongs to prover, or whether funds can be reversed. Notary collusion, credential capture, origin-path leakage and issuer compromise remain explicit.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Spoofed host, trailing-dot/IDN confusion, expired cert, wrong notary key, redirect, TLS session swap, excluded relevant bytes, source version change and 300-second freshness edge. Record provider-specific certificate coverage test evidence.

Sources: [TLS 1.3 RFC 8446](https://www.rfc-editor.org/rfc/rfc8446), [TLSNotary source](https://github.com/tlsnotary/tlsn). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

No bank source enabled until exact upstream commit/build hashes, trust roots, certificate-validation coverage, parser fixtures and independent review are recorded. TLSNotary provider selection is not approved by this document.
