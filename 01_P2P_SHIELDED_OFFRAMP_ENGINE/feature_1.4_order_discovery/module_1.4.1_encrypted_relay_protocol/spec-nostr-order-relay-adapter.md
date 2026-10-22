# Nostr order relay adapter

## 1. Metadata

- **Specification:** spec-nostr-order-relay-adapter
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 2
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Publish verifiable discovery hints and encrypted negotiation through bounded, untrusted relay connections.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface RelayPublishResult {eventId:string;relayId:string;
 status:"accepted"|"rejected"|"unknown";}
interface OrderRelay {
 publish(event:ValidatedNostrEvent,signal:AbortSignal):Promise<CoreResult<readonly RelayPublishResult[]>>;
 subscribe(filter:ApprovedOrderFilter,onEvent:(e:ValidatedNostrEvent)=>void):()=>void;
 close():void;
}
// App order discovery profile v1 uses kind 30078 (application-specific data),
// d tag = "p2p-offramp:v1:" + random orderId; event content is public ad JSON.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Validate NIP-01 canonical event ID/signature/public key/kind/tags/content before parsing app data. Use replaceable application-specific kind semantics only for same author+kind+d; app revision remains explicit, and same revision conflicting digest is a conflict rather than silent selection. Public ad includes app/version/order/network/asset/exact amount/currency/rail class/revision/expiry and maker Nostr key, no bank identifiers. Private negotiation uses separate NIP-17/44/59 events and G16 wallet binding. Subscribe only reviewed filters bounded by G21, not wildcard all events. Publish sends identical signed native event at most once per selected relay per explicit operation; ACK means relay acceptance only.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Partial relay acceptance returns per-relay result; user may explicitly republish identical event ID without new order/revision. Unknown outcome does not permit automatic new signed event. Disconnected relay never marks order funded/cancelled globally. Close unsubscribes and invalidates late callbacks.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

App-specific kind is a project interoperability profile, not a standardized financial-order NIP. Public relay metadata and censorship persist; multiple relays do not prove anonymity or honest liquidity.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Wrong ID/signature/kind/d tag, malicious content, duplicate/malformed tags, replaceable-event conflicts, ACK loss, two relays duplicate, unsubscribe race, restart and stale revision. Two independent clients interoperate on exact ad profile and private terms.

Sources: [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md), [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md), [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md), [NIP-44 version 2](https://github.com/nostr-protocol/nips/blob/master/44.md), [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Pin NIP repository commit, chosen nostr-tools version, event fixtures and interoperability revision before network enablement.
