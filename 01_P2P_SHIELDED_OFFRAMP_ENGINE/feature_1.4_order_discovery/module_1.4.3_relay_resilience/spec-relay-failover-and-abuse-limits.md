# Relay failover and abuse limits

## 1. Metadata

- **Specification:** G21
- **Version:** 2.0 (Iteration 3; reflects the package-level relay pool)
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — package-level relay pool implementation present (test-only, not wired into the app); app composition, G11 endpoint registry issuer, real-network evidence and independent review pending
- **Delivery phase:** 2
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.
- **Implementation:** [pool.ts](../../../packages/relay/src/pool.ts) (pool), [nip01.ts](../../../packages/relay/src/nip01.ts) (frame parsing), facade [index.ts](../../../packages/relay/index.ts). Connections go through the G05 broker in [policy.ts](../../../packages/transport/src/policy.ts). `apps/web/**` and the runtime/Worker do not call it yet. Event id/signature verification is injected (`EventCrypto`, packages/nostr-crypto); the pool implements no cryptography. The production implementation is `createRelayEventCrypto` in [relay-event-crypto.ts](../../../packages/nostr-crypto/src/relay-event-crypto.ts): synchronous verification (`verifyEventSync`, so the pool never yields between dedupe, filter, verify and delivery), signing with one G01 messaging key through the provider, and a `dispose()` that wipes the key and refuses in-flight signatures. Composition is proven in [nostr-crypto-wiring.test.mjs](../../../packages/relay/test/nostr-crypto-wiring.test.mjs); the relay package still imports no cryptography.

## 2. Objective and boundaries

Bound subscription, memory and retry cost while preserving the selected transport/privacy policy, and keep relay input discovery-only.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt. Relay frames are never an input to the G08 authority reducer; the package imports no domain, wallet or chain module (asserted by test).

## 3. Architecture and data contracts

```typescript
// Enforced limits (POOL_LIMITS / FRAME_LIMITS); the earlier RelayBudgetV1 sketch is kept where it still holds.
maxCandidates:16 (approved endpoints, from the trusted registry only)   maxRelays:4 (concurrent connections)
maxSubscriptionsPerRelay:4   maxFiltersPerSubscription:2   filter limit<=100   history window<=86400 s   kinds<=8   filter values<=16
maxFrameBytes:65536  maxEventBytes:65536  maxTags:64  maxTagItems:8  maxTagItemBytes:256  subId<=64 printable  message<=512
eventsPerMinutePerRelay:120 (token bucket, burst 20)   overloadWindow:10 s x 3 consecutive -> disconnect
maxEventsPerSubscriptionPerConnection:1000   maxDedupIds:4096 (FIFO)   maxPublishInFlight:32   banPenalty:10
backoffCeilingsMs:[1000,2000,4000,8000,16000,30000] full jitter   maxReconnects:6   stableMs:60000   connectTimeoutMs:10000   publishTimeoutMs:10000
interface RelayPool {
  subscribe(filters, {onEvent, onEose?}): PoolResult<{id; close()}>;       // INVALID_FILTER | LIMIT_EXCEEDED | CLOSED
  publish(event, signal?): Promise<PoolResult<readonly {eventId; relayId; status:"accepted"|"rejected"|"unknown"}[]>>;
  retry(endpointId): void;  status(): readonly {endpointId; state; reason; failures; penalty}[];  close(): void;
}
// relay state: idle | connecting | open | backoff | blocked | failed | banned
```

No persisted plaintext outbound queue exists. The 32-event outbound bound is implemented as a cap on concurrent publish attempts (there is no in-memory queue and no automatic republish). The retained-order cap (1000) lives in the order book, see [G19](../module_1.4.2_discovery_policy/spec-orderbook-visibility-and-expiry.md).

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

**G05 gate.** Every socket, read or publish, starts with `broker.authorize({channel:"relay", endpointId, method})` and `capture`; a string refusal means no socket exists. `POLICY_BLOCKED` and `INVALID_ENDPOINT` (strict mode without verified-private coverage, unknown coverage, an endpoint the registry does not know, the production-default empty registry) put the relay into `blocked` with no timer and no retry until an explicit `retry`. The pool has no direct-connection path and no fallback relay list; candidates come only from the configuration given at construction, never from event content. The connect handshake runs inside the single-shot `scope.run` (its operation never rejects, because a rejected operation makes the broker block the whole adapter); afterwards the scope is checked on every inbound frame and its abort closes the socket, so mode changes, revocation and expiry sever live connections (`revoked`) and the next attempt is re-authorized.

**Inbound order, cheapest first:** scope current; text frame (binary is penalized); frame length cap (before JSON.parse; oversized frames are dropped and penalized 10 = immediate ban); token bucket (excess frames are dropped before parsing); strict JSON/shape parse (NIP-01 `EVENT/EOSE/OK/NOTICE/CLOSED`; `AUTH`/`COUNT` ignored and never answered); the subscription id must be one this pool sent on this connection (else penalty 3); dedupe by id (before any signature work); the event must match one of the subscription's filters (else penalty 3); per-subscription event cap (on exceeding, `CLOSE` is sent and the subscription is ignored on that connection; not a ban); `verifyEvent` (failure: penalty 4, and the id is **not** remembered, so a forged copy cannot suppress the genuine event); only then the id is recorded and `onEvent` is called once per distinct id across all relays. Relay text (`NOTICE`, `CLOSED` reasons, `OK` messages) is never surfaced or interpreted. `CLOSED` ends that subscription on that relay; it is not resubscribed automatically.

**Penalties.** oversized 10, malformed 3, binary 3, invalid signature 4, wrong subscription 3, outside filter 3, unsolicited `OK` 2. At 10 the relay is `banned` for the pool's lifetime (not cleared by `retry`) and the next candidate is promoted. Three consecutive 10-second windows that each dropped at least one frame disconnect the relay (not a ban; reconnect backoff applies).

**Reconnect and failover.** Connections exist only while at least one subscription is active; closing the last subscription tears all sockets down and resets backoff. On an unexpected close or error the relay waits `floor(random × ceiling[k−1])` ms (full jitter; ceilings 1/2/4/8/16/30 s), up to six reconnects; the seventh consecutive failure marks it `failed` (explicit `retry` needed, no background retry). Failure counters reset only after 60 s of stable uptime. When a relay becomes `blocked`, `failed` or `banned`, the next idle approved candidate is promoted so that up to four are active; subscriptions are replayed on every new connection and history replay is absorbed by dedupe.

**Publish.** One explicit operation sends the identical signed event at most once to each selected relay over its own `publish`-method permit and short-lived connection, waits for the matching `OK` or the timeout, and closes. `accepted` means that relay accepted it, nothing more. Events that fail local shape or `verifyEvent` checks are refused before any connection. No automatic retry or republish of economic intent exists.

Validate frame byte cap before JSON parse and tags before signature work. Read reconnect retries follow the G13 budget; background reconnect occurs only while a user-selected subscription is active. All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Relay exhaustion marks partial/offline discovery (`status()` shows every relay state) and keeps draft/export/chain recovery available. Failover selects only already approved endpoints under the same G05 policy; unknown private routing blocks. Closing the pool cancels subscriptions and sockets; locking or mode changes revoke scopes through the broker. Pool errors are fixed codes (`LIMIT_EXCEEDED`, `INVALID_FILTER`, `CLOSED`, plus G05 `RouteError` values); no relay-supplied string is ever returned.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Eclipse attacks, Sybil spam and relay collusion remain. Quotas limit local damage, not global Sybil resistance; four colluding approved relays can withhold or censor discovery. Never fetch provider-supplied URLs/icons from events (the pool follows none).

Known gaps, stated plainly: (a) the G05 broker authorizes by endpoint id and does not hand the registered URL to the caller, so `relays[].url` is supplied by the composition root and is **not** cross-checked against the registry grant; a broker amendment returning the endpoint URL (or performing the connection) is the proper fix. (b) The platform `WebSocket` delivers whole messages, so the 64 KiB frame cap bounds parse and signature cost but not transient network buffering; a custom client with an incremental limit is future work. (c) Strict mode needs a reviewed G11/G15 issuer of verified-private evidence, which does not exist yet; with the production-default registry every relay is `blocked`. (d) Penalties are per pool lifetime and in memory only, not shared across tabs. (e) The receive-side clock for history windows is injected and unverified.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Recorded evidence (`npm test`): [pool.test.mjs](../../../packages/relay/test/pool.test.mjs) runs the pool against an in-process fake relay (node:http upgrade plus a minimal RFC 6455 frame codec, [fake-relay.mjs](../../../packages/relay/test/support/fake-relay.mjs)) with the real broker over a fixture registry and the platform `WebSocket`, and against deterministic in-memory sockets. It covers: dedupe of one event served by two relays; strict-mode and unknown-coverage and empty-registry refusal with zero connections observed at the relay; ordinary-direct with consent and an unregistered endpoint blocked; live revocation on a switch to strict and no reconnect; candidate, connection (four), subscription (four, fifth refused) and filter bounds; failover after exactly one initial plus six reconnect attempts, then no background retry, then explicit retry; reconnect with REQ replay and no duplicate delivery; jitter ceilings and the 60 s stability reset; a 200-event flood bounded by the bucket; three overloaded windows causing disconnect; an oversized frame banning the relay without reconnect while another relay still serves; forged and tampered signatures never delivered, not poisoning dedupe, banning the relay; wrong-subscription, outside-filter, extra-key and binary frames penalized; `AUTH`/`NOTICE`/`CLOSED` handling with nothing sent in reply; the 1000-event per-subscription cap sending `CLOSE`; the 4096-id dedupe eviction; a hanging socket and connect timeout; closing the last subscription; publish accepted/rejected/unknown with exactly one `EVENT` and strict refusal; and a static check that the package imports nothing but its own files and the transport facade. [ad.test.mjs](../../../packages/relay/test/ad.test.mjs) covers the order book (see G19). Tests use a `@noble/curves` schnorr double for `EventCrypto`; it is test-only and not production crypto.

Still required and **not** claimed: 1001-order and bounded-memory measurements under load; lock during backoff in the app; interop with real relays; a real verified-private route; cross-tab behavior; incremental frame limits; independent review.

Sources: [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md), [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md), [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md), [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md), [NIP-44 version 2](https://github.com/nostr-protocol/nips/blob/master/44.md), [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports only the test evidence listed above.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
