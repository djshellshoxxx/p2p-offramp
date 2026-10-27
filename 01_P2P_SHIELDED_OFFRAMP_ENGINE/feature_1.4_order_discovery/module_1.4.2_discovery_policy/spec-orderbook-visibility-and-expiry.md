# Orderbook visibility and expiry

## 1. Metadata

- **Specification:** G19
- **Version:** 2.0 (Iteration 3; reflects the package-level public ad implementation)
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — package-level public ad and order book implementation present (test-only, not wired into the app); invite-only mode, UI preview and independent review pending
- **Delivery phase:** 2
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.
- **Implementation:** [ad.ts](../../../packages/relay/src/ad.ts) (event profile, validation, order book, deletion request), [nip01.ts](../../../packages/relay/src/nip01.ts) (strict wire parsing), exported only through [the relay facade](../../../packages/relay/index.ts). `apps/web/**` and the runtime/Worker do not call it yet. NIP-01 id/signature verification and signing are injected (`EventCrypto`, supplied by packages/nostr-crypto); this package implements no cryptography.

## 2. Objective and boundaries

Give public, invite-only and draft modes explicit disclosure and freshness rules. This iteration implements the **public-minimal** advertisement and its receiver-side order book. Local-draft publishes nothing by construction (no code path sends a draft). Invite-only (encrypted terms to selected peers) is specified but not implemented.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt. Relay-sourced data has **no G08 authority source**: the relay package does not import `TradeBinding`, `ChainObservation` or the authority reducer, and every order book output is a frozen record labelled `authority: 'relay-discovery-only'`. An ad can start a conversation; it cannot fund, release or refund anything.

## 3. Architecture and data contracts

```typescript
type Visibility = "local-draft" | "public-minimal" | "invite-only";
type RailClass = "bank-transfer" | "instant-bank" | "card" | "cash" | "mobile-money" | "other";
interface PublicAdV1 {
  app: "p2p-offramp"; v: 1;
  orderId: string;            // 32 random bytes, lowercase hex
  revision: number;           // integer 1..1_000_000, set by the maker, strictly increasing
  networkId: string;          // ^[a-z0-9:_-]{1,64}$
  assetId: string;            // ^[A-Za-z0-9:._-]{1,128}$
  amountMin: string;          // inclusive, asset base units, canonical decimal, 1..39 digits, no float
  amountMax: string;          // >= amountMin
  currency: string;           // ^[A-Z]{3}$
  railClass: RailClass;       // payment-method CATEGORY only
  expiresAtSeconds: string;   // unix seconds, canonical decimal
  maker: string;              // seller messaging pubkey (x-only hex) for NIP-17 negotiation
}
```

**Event profile v1 (chosen and fixed).** Kind **30078** (NIP-78 application-specific data; in the 30000–39999 parameterized-replaceable range, so a relay keeps at most one event per `(pubkey, kind, d)`). Tags are exactly, in order, `["d","p2p-offramp:v1:<orderId>"]`, `["t","p2p-offramp-ad-v1"]`, `["expiration","<expiresAtSeconds>"]` (NIP-40). The `t` tag exists because kind 30078 is shared by unrelated applications and `d` cannot be prefix-filtered; subscriptions use `{"kinds":[30078],"#t":["p2p-offramp-ad-v1"],"since":…,"limit":≤100}`. Content is the canonical JSON of `PublicAdV1` (fixed key order, exact key set, at most 2048 bytes; tighter than the 8 KiB ceiling). Any extra tag, extra key, float, unknown version or mismatch between `d`/`expiration` and the content is `INVALID`. The ad **excludes** price, bank/reference/location details and any terms digest: detailed terms, G16 wallet binding and payment instructions are exchanged only in the later encrypted negotiation. The signing key (event pubkey) authenticates the author; `maker` is a claim about where to message the seller and is not proof that the two keys belong to one person or that either controls an escrow wallet.

**Cancellation profile.** NIP-09 kind **5** with tags `["a","30078:<authorPubkey>:p2p-offramp:v1:<orderId>"]` and `["k","30078"]`, empty content. Receivers honour it only when the `a` tag names the event's own pubkey.

Limits: lifetime `expires − created_at` in `(0, 3600]` seconds; `created_at` at most 120 s ahead of the receiver clock; 1000 retained orders; 1000 deletion tombstones; revision at most 1,000,000.

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Creation chooses visibility before publishing; the preview is exactly `serializeAd(ad)` and the tag list, i.e. the bytes that are signed. Local drafts produce zero relay requests. Invite-only (not implemented here) sends authenticated encrypted terms to selected peer keys with no public decryption key or public ad.

Receipt pipeline (relay pool, then order book): frame byte cap, JSON, strict event shape and tag/byte caps, subscription match, dedupe by id, filter match, `verifyEvent` (id and signature), only then ad validation: exact kind/tags, strict content parse, `d`/`expiration` agreement, lifetime ≤ 3600 s, not future-dated, not expired. Time comes from an injected trusted clock in unix seconds; if it is absent, non-integer or throws, freshness is **unknown** and the book accepts nothing, lists nothing and refuses revalidation (`clock-unknown`).

**Revision ordering.** The author's signed `revision` is the only ordering authority for one `(pubkey, d)` key; relay-reported order and `created_at` are not. A higher revision replaces the current ad even if its `created_at` is older. A lower revision is `stale-revision` (so a relay replaying an old signed revision cannot win). The same revision with the same event id is `duplicate`. The same revision with a different event id is a `conflict`: the entry becomes non-actionable (`revalidate` returns `conflict`, `list` omits it) until a strictly higher revision arrives. Nothing silently picks a winner.

**Expiry.** Expired entries are dropped on every ingest, list and revalidate. A signed already-expired offer is `expired` and never stored. A local clock ahead of the signed time expires an ad early; a lagging clock does not extend the signed expiry because `revalidate` compares against the signed `expiresAtSeconds` only.

**Revalidation before use.** `revalidate(key)` MUST be called immediately before any negotiation step that consumes an ad. It re-checks clock, deletion tombstone, expiry and conflict and returns the current verified ad or a reason. A listed ad that was valid a minute ago is not valid now. Funding is out of scope of this module and separately revalidates the on-chain deadline and original G16 terms.

**Deletion.** On cancellation the maker publishes a NIP-09 request and lets the NIP-40 expiration lapse. This is best effort and **does not guarantee removal**: a relay may ignore kind 5, serve the old ad indefinitely, or have it archived. The receiver-side book records a tombstone `(key, deletion.created_at)` and refuses any ad with `created_at ≤` that bound, so a replay cannot resurrect a cancelled ad; a later republish needs a strictly greater `created_at`. Tombstones are bounded (FIFO 1000).

**Capacity.** At 1000 orders, expired entries are swept first, then the soonest-expiring entry is evicted. Listing order is deterministic: `amountMin` as a `BigInt`, ties by event id; no floating price authority.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

```typescript
createAdEvent(crypto, ad, createdAt): Promise<NostrEvent>          // refuses invalid content or lifetime > 3600 s before signing
createDeletionEvent(crypto, author, orderId, createdAt): Promise<NostrEvent>
validateAdEvent(event, nowSeconds): {ok:true; value:VerifiedAd} | {ok:false; reason:"INVALID"|"EXPIRED"|"FUTURE"|"LIFETIME"}
createOrderBook({nowSeconds, verifier?, maxOrders?}): { ingest(event): IngestResult; revalidate(key): RevalidateResult; list(): VerifiedAd[]; size }
type IngestResult = "accepted"|"replaced"|"duplicate"|"stale-revision"|"conflict"|"deleted"|"invalid"|"expired"|"clock-unknown";
```

Expired ads disappear from the actionable list but may remain available encrypted as evidence if retained by the user (retention is the caller's, not this module's). A stale or missing revision requires maker reconfirmation through the encrypted channel; it cannot trigger funding. Results carry fixed codes only; relay messages (`NOTICE`, `OK` text, `CLOSED` reasons) are never surfaced or interpreted. Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Search/relay subscriptions disclose market interest to the relays selected under G05/G21 (strict mode only over verified-private routes). A signed ad authenticates its author key only, not solvency, reputation or identity; `maker` may name a key the author does not control, so the encrypted negotiation (not the ad) must prove control. Visible metadata: asset, network, amount range, currency, rail category, expiry, revision and two pubkeys. A stable `orderId` and a monotone `revision` let observers link revisions of one order. A malicious relay can withhold, delay or replay ads (fake liquidity by omission or replay of a still-valid revision); it cannot forge, alter or promote a revision. A malicious author can publish many ads or mutually conflicting revisions; quotas limit local damage, not Sybil resistance. Invite recipients can redistribute plaintext.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

Residual risks of this iteration: (a) kind 30078 is shared with other applications; the `t` tag plus strict parsing mitigates but cannot stop cross-app noise. (b) `created_at` is author-chosen, so deletion/republish ordering within the same second is ambiguous and resolves to "deleted". (c) A receiver clock that is far wrong in either direction either hides valid ads or shows expired ones until `revalidate`; the clock source is a composition-root decision not made here. (d) Revision is not bound to an on-chain or wallet commitment; the later G16 terms are the economic commitment.

## 7. Verification, references and evidence gates

Recorded evidence (`npm test`): [ad.test.mjs](../../../packages/relay/test/ad.test.mjs) covers fixed kind/tags with the public-fields-only content check (no bank/reference/location/price/digest keys), strict parser rejection (unknown keys, floats, zero or inverted ranges, bad currency/rail, revision bounds, oversized content), lifetime 3600 accepted and 3601 or 0 refused (builder and validator), tag/content mismatch and extra tags, future-dated and signed-already-expired ads, revision ordering including replay of an older revision and a higher revision with an older `created_at`, same-revision conflict blocking until superseded, expiry at the exact second, unknown or `NaN` clock, local clock skew both ways, forged or tampered events, NIP-09 same-author deletion, a forged deletion by another key, replay of a deleted ad, republish after deletion, eviction of the soonest-expiring order at capacity (exercised with a reduced cap of 5; the 1000 default is not load-tested), and deterministic numeric ordering with frozen discovery-only outputs. [pool.test.mjs](../../../packages/relay/test/pool.test.mjs) covers the end-to-end publish → discover → supersede → delete flow over a local WebSocket relay, in which the relay still holds the old ad after deletion.

Still required and **not** claimed: invite-only mode and wrong-recipient leakage tests; a UI preview showing the exact serialized event; app/Worker integration; real-clock source and offline-restore expiry behavior; interoperability against third-party relays and clients; independent review.

Sources: [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md), [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md), [NIP-40](https://github.com/nostr-protocol/nips/blob/master/40.md), [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md), [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md), [NIP-44 version 2](https://github.com/nostr-protocol/nips/blob/master/44.md), [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports only the test evidence listed above.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
