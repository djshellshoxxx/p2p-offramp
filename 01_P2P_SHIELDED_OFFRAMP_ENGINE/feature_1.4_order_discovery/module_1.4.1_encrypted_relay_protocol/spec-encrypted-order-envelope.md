# Encrypted order envelope

## 1. Metadata

- **Specification:** spec-encrypted-order-envelope
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 2
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Separate public minimal advertisements from confidential peer terms using standard Nostr message layers.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface PrivateOrderPayloadV1 {v:1;kind:"terms"|"acceptance"|"cancel";
 orderId:string;revision:number;termsHash:string;sender:string;recipient:string;
 nonce:string;expiresAtSeconds:string;body:SignedTermsOrControl;}
// plaintext <=16 KiB; revision safe integer >=1; nonce 32 random bytes;
// recipient/sender canonical Nostr public keys, separate from wallet accounts.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Serialize validated payload as UTF-8 JSON with exact keys, then use pinned NIP-44 v2 encryption inside NIP-17/NIP-59 flow. NIP-44 does not expose arbitrary AAD: bind trade/order/recipient/context inside authenticated encrypted plaintext and verify after decrypt, rather than invent an AAD parameter. Verify outer gift-wrap and inner seal/rumor relationships according to NIPs; validate sender wallet acceptance separately through G16. Public advertisement carries no decryption key. Reencrypting must create correct fresh upstream nonces/wraps; no custom cipher or NIP-04 fallback.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Unsupported NIP version or invalid ciphertext/signature fails closed. Dedup by native event ID plus authenticated order/revision/control nonce; bounds checked before decrypt. Expired plaintext is ignored for negotiation but may be retained encrypted as user evidence.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Outer recipient/routing/timing and advertisement metadata remain visible. Relay deletion is not confidentiality. Nostr sender identity alone does not authenticate a wallet seller; private plaintext and local histories require G02 protection.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Wrong recipient/context/order/revision; ciphertext tamper; reused nonce; copied wrap; fake seal sender; 16 KiB+1; invalid UTF-8; invalid JSON keys; public decryption key leak and NIP-04 downgrade. Run official NIP-44 vectors for exact library.

Sources: [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md), [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md), [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md), [NIP-44 version 2](https://github.com/nostr-protocol/nips/blob/master/44.md), [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
