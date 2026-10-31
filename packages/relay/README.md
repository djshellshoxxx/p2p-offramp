# Consolidated relay implementations

The canonical G19/G21 API is `createRelayPool` from `src/pool.ts`, with `src/ad.ts`
and `src/nip01.ts`, exported through `index.ts` and used by the private exchange.
It uses the G05 broker, the full project advertisement schema, native NIP-01 frames
and the established relay-lifetime regression suite. Those modules and their
history were consolidated from the preserved remote integration.

The independently developed restricted local profile is retained without replacing
that API: `src/advertisement.ts` and `RelayPool` in `src/local-pool.ts`. Its tests
are `advertisement.test.mjs`, `bip340-vectors.test.mjs` and `local-pool.test.mjs`.
It is used only for local compatibility/evidence and is not exported through the
canonical package facade. Its exact wire profile differs from the canonical API;
do not mix books, filters, frames or constructors across these implementations.
Both remain excluded from the default app graph. The canonical normative contracts
and remote evidence remain at their original specification/handoff paths.

## Restricted local advertisement and relay boundary

These modules implement test-only G19/G21 validation and bounded relay orchestration. They are excluded from the
application core graph, open no global WebSocket/fetch connection, choose no endpoint, and grant no trading authority.
The pool accepts an injected connector that must apply the caller's transport policy. It never discovers or falls
back to a different relay. There is no verified-private route claim.

## Interfaces

- `validateAdvertisement(bytes, nowSeconds)` validates native NIP-01 event ID and BIP-340 signature, then the exact
  project G19 public advertisement. Unknown configured time blocks validation. Return codes are fixed and never
  contain frame contents or foreign diagnostics.
- `advertisementEventId(unsignedEvent)` is a serialization helper for trusted composition/test fixtures, not an
  untrusted-input parser or signer. Root's local harness may create synthetic events with deterministic test-only keys.
- `AdvertisementBook.ingest(bytes, nowSeconds)` retains highest known revision by maker/order, flags equal-revision
  conflicts, and rejects stale revisions. A strictly newer signed revision clears conflict. `snapshot(nowSeconds)`
  hides expired ads; no returned entry proves custody, solvency, a wallet identity or fiat settlement.
- `RelayPool` takes approved relay IDs, trusted time, and an injected `RelayConnector`. `subscribe({since,limit}, fn)`
  issues native `REQ` frames; its disposer issues `CLOSE`. `publish(eventBytes, signal)` sends the identical signed
  native `EVENT` at most once per connected relay for that explicit call. Native `OK` gives accepted/rejected;
  timeout, disconnection or cancellation gives unknown. Nothing is automatically republished.
- `dispose()` cancels subscriptions, pending ACKs/retries and connector signals, clears book data, and waits for
  physical close. A connector ignoring abort remains owned until it returns and its eventual socket closes. Failed
  physical close permanently blocks that pool slot, even on explicit retry. A never-settling connector means disposal
  remains pending; cancellation cannot pretend that an underlying physical resource disappeared.
  Repeated disposal returns the same promise. `unsettledSlots` reports retained/failed-close uncertainty after disposal.

## Restricted local profile and bounds

The G19 field names come from `spec-orderbook-visibility-and-expiry.md`: app, v, orderId, revision, networkId,
assetId, amount, currency, railClass, maker, expiresAtSeconds and termsDigest. They are the only accepted content keys.
The profile uses lowercase 32-byte order/digest/maker hex, canonical positive uint256 base-unit amounts, safe positive
integer revisions, ASCII identifier strings up to 64 characters, and uppercase three-letter currency identifiers.
Kind is 30078; exactly one `d=p2p-offramp:v1:<orderId>` and one matching NIP-40 expiration tag are accepted. Additional
tags/fields are refused. Ad lifetime is positive and at most 3600 seconds. Future timestamps and expired ads are refused.

These deliberately narrow lexical/tag choices are a local implementation profile, not a demonstrated second-client
interoperability contract. G19 does not freeze a rail-class vocabulary, time-authority policy or cross-client canonical
content serialization. The implementation must not be advertised as interoperable until those contracts and fixtures
are qualified. It does not implement NIP-09 cancellation, NIP-11 capability discovery, NIP-17/44/59 private exchange,
identity-key signing, or encrypted outbound queueing. Public ads expose their exact amount, timing, network and author;
expiry/deletion cannot make observers forget them. The pool has no persistent plaintext queue.

Bounds: 4 configured relay slots, 4 active subscriptions per relay, 64 KiB incoming frames/events, 8 KiB ad content,
1000 retained orders, 4096 dedup IDs, 32 outstanding explicit publications, 120 frames/minute token refill with burst
20, subscription history at most 24 hours and requested/returned limit at most 100. Overload in three consecutive
10-second windows disconnects. Connection deadline is 30 seconds; ACK deadline is at most 30 seconds. Reconnect uses
full-jitter 1/2/4/8/16/30-second bounds, six retries, stable reset after 60 seconds, and only while subscriptions remain.
Expired/evicted history is not a durable anti-replay registry; funding must revalidate the original signed terms and
on-chain seller nonce regardless of discovery history. Callers using snapshots must recheck current time before acting.

## Provenance and verification

Native protocol text inspected at nostr-protocol/nips commit `400d157c53264b8e58c7b3cdbd21ef546fb7a157`:

| Source | SHA-256 |
|---|---|
| [01.md](https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/01.md) | `d5c5ce2b5639eee440b5d342dbe81af42008838cb260ec04acaffaffd29dcaf7` |
| [40.md](https://github.com/nostr-protocol/nips/blob/400d157c53264b8e58c7b3cdbd21ef546fb7a157/40.md) | `1e88a08583391084fc95b842932119555cb270988612261fbb78017e84a0dc78` |

Verification uses existing exact-pinned `@noble/curves` and `@noble/hashes` 2.4.0. Their repository crypto review gates
remain pending. Test events use explicitly synthetic deterministic keys; never fund or reuse them. This is not an
independent cryptographic audit, a production endpoint qualification, or an interoperability certification.

Run from repo root:

```sh
node packages/relay/test/advertisement.test.mjs
node packages/relay/test/local-pool.test.mjs
npm run typecheck
```
