# Waku order relay adapter

## 1. Metadata

- **Specification:** spec-waku-order-relay-adapter
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** Post-MVP optional; independently gated
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Define an optional transport boundary that preserves signed application payloads without claiming deletion or anonymity.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface WakuProfileV1 {enabled:boolean;profileId:string;contentTopic:string;
 peerIds:readonly string[];maxPayloadBytes:32768;ttlSeconds:300;}
interface WakuPacket {v:1;payloadId:string;expiresAtSeconds:string;
 signedEnvelope:Uint8Array;}
// Application signature/encryption verifies independently of transport;
// topic contains protocol/version only, no wallet/trade/account identifier.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Optional adapter negotiates exact content-topic/network/protocol versions and user-approved peer set. Wrap same canonical signed app envelope used by discovery and encrypted peer messages; Waku acknowledgement is propagation/peer response only. Verify payload identity/signature/context/expiry after bounded parse; dedup native payload digest in 4096-entry FIFO plus semantic order revision logic. Store/history retrieval is explicitly consented, <=100 messages/query, and not proof of completeness. No implicit fallback from private route to direct Waku peers.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

No reviewed Waku profile means UNSUPPORTED_PROVIDER and no network requests. Unavailable transport preserves offline draft and existing chain recovery. Failure never sends plaintext alternative or republishes to Nostr without explicit configured consent.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Topic enumeration, peer/IP observation, censorship, replay and historical storage persist. RLN/spam mechanisms are separate optional costs and not proof of unique human or confidential routing.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Expired/tampered packet; unknown peer/profile/topic; 32 KiB+1; duplicate history; message flood; disabled capability; routing downgrade; TTL local expiry with remote retained copy; unsubscribe race. Assert core build excludes SDK.

Sources: [Waku/Logos protocol registry](https://lip.logos.co/). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Waku protocol paths have moved; select current official numbered message/relay/filter/store/lightpush revisions and SDK commit, record fixtures and transport tests before enablement. No evaluated profile presently approved.
