# Bank receipt witness schema

## 1. Metadata

- **Specification:** spec-bank-receipt-witness-schema
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 4 (optional evidence)
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Parse only authenticated bank response bytes into bounded private inputs with explicit locale and disclosure rules.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface ReceiptWitnessV1 {v:1;sourcePolicyId:string;parserVersion:string;
 authenticatedResponse:Uint8Array;fieldSpans:Readonly<Record<string,{start:number;end:number}>>;
 rawAmount:string;currency:string;rawStatus:string;rawTimestamp:string;
 beneficiary:string;reference:string;beneficiarySalt:Uint8Array;referenceSalt:Uint8Array;}
// response <=1 MiB; at most 16 spans, raw strings <=512 UTF-8 bytes;
// account/reference <=256 bytes; salts >=16 bytes, never public.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Require parser-specific content type/encoding, reject duplicate JSON keys and invalid UTF-8 before parsing. Whitelist exact fields/path and reject ambiguous repeated matches; every semantic field span lies inside authenticated bytes. Locale profile defines decimal separator/grouping, currency scale and time-zone offset; reject unknown separators, scientific notation, excess fractional units, floating conversions and ambiguous local times. Convert string amount by integer decimal expansion; no rounding or guess. Credentials/cookies/TLS session secrets are not witness fields. Disclosure preview shows only requested predicate fields and private retained data.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Reject unknown parser versions or truncated responses instead of manual edit of authenticated values. Reauthentication is explicit after failure; clear temporary buffers and do not log extracted strings. At-rest retention is opt-in encrypted G02 evidence record, with raw response default discarded after job ends.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Parser drift can prove the wrong semantic statement even with correct cryptography. Bank page structure changes disable profile until reviewed fixtures pass. Browser/OS copies cannot be guaranteed erased.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Fuzz duplicate keys, HTML entity boundaries, overlapping/out-of-range spans, invalid UTF-8, 1 MiB+1, 1,234 versus 1.234 locales, negative/overflow, Unicode currency symbols, DST ambiguity and injected unauthenticated field. Test byte-for-byte parser coverage.

Sources: [TLS 1.3 RFC 8446](https://www.rfc-editor.org/rfc/rfc8446), [TLSNotary source](https://github.com/tlsnotary/tlsn). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
