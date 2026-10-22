# Relay failover and abuse limits

## 1. Metadata

- **Specification:** G21
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 2
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Bound subscription, memory and retry cost while preserving selected transport/privacy policy.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface RelayBudgetV1 {maxRelays:4;maxSubscriptionsPerRelay:4;
 maxEventBytes:65536;maxTags:64;maxTagItems:8;maxTagItemBytes:256;
 maxEventsPerMinutePerRelay:120;maxRetainedOrders:1000;
 maxOutboundQueuedEvents:32;maxDedupIds:4096;}
// No persisted plaintext outbound queue. Order parsers impose smaller content caps.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Validate frame byte cap before JSON parse and tags before signature work. Token bucket admits 120 events/minute/relay with burst 20; drop excess, and disconnect relay after three consecutive 10-second overload windows. Bound subscription requested limit <=100 and history window <=24 h; max four connections, no discovered arbitrary fallback. Read reconnect retries follow G13 budget; background reconnect occurs only while user-selected subscription active, backoff 1/2/4/8/16/30 s with full jitter and at most six attempts then explicit Retry. Reset backoff only after 60 seconds stable. Queue at most 32 encrypted signed events in memory with original expiry; no automatic republish of economic intent.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Relay exhaustion marks partial/offline discovery and keeps draft/export/chain recovery available. Failover selects only already approved endpoints under same G05 route; unknown private routing blocks. Closing or locking cancels subscriptions and drops in-memory queue.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Eclipse attacks, Sybil spam and relay collusion remain. Quotas limit local damage, not global Sybil resistance. Never fetch provider-supplied URLs/icons from events.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Flood valid/invalid signatures, oversized frame/tags, 1001 orders eviction, 4097 dedup IDs, hanging socket, reconnect exhaustion, lock during backoff, queue full, route failure and two relays duplicate. Measure bounded memory and verify no direct fallback.

Sources: [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md), [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md), [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md), [NIP-44 version 2](https://github.com/nostr-protocol/nips/blob/master/44.md), [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
