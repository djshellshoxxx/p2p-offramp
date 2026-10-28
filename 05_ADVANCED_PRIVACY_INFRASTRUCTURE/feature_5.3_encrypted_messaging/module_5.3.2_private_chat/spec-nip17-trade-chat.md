# NIP-17 trade chat

## 1. Metadata

- **Specification ID:** PRIV-NIP17-TRADE-CHAT (roadmap G20)
- **Version:** 2.0 (Iteration 3; reflects `packages/nostr-crypto` NIP-59/NIP-17 core)
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — package-level gift-wrap and trade-chat core present (test-only, no relay transport, not wired into the app); independent review pending
- **Section:** 05_ADVANCED_PRIVACY_INFRASTRUCTURE
- **Feature:** feature_5.3_encrypted_messaging
- **Module:** module_5.3.2_private_chat
- **Delivery:** Core messaging/policy/display where consumed by Phase 2; other privacy extensions are opt-in Phase 3 or later, subject to the roadmap.
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.
- **Implementation:** gift wrap [nip59.ts](../../../packages/nostr-crypto/src/nip59.ts), trade chat [nip17.ts](../../../packages/nostr-crypto/src/nip17.ts). These build on the NIP-01/NIP-44 core in [spec-nip44-messaging-adapter](../module_5.3.1_message_adapters/spec-nip44-messaging-adapter.md). The package has no facade, is not bundled, and `apps/web/**` and the runtime/Worker do not call it.

## 2. Objective and boundary

Define trade-bound private messaging using NIP-17, NIP-44, and NIP-59. Keep legacy NIP-04 disabled for new conversations.

The system authority contract governs this module: external wallets authorize spending; deployed escrow and reconciled chain observations establish custody state; relay and local data are untrusted claims. This specification creates no operator release path, automatic bank payment or authority over an already funded trade. Missing optional infrastructure MUST preserve basic release/refund and encrypted recovery paths.

Boundaries of this iteration:

- **In scope:** the cryptographic and validation core. That covers building and opening rumor, seal and gift-wrap layers, binding them to a G16 trade, an authorization rule limited to the two counterparties, and per-session deduplication.
- **Not implemented:**
  - relay connections, subscriptions, reconnect cursors and delivery states (G21);
  - kind 10050 relay-list discovery;
  - encrypted G02 chat history and durable deduplication;
  - the application message envelope (`spec-application-message-envelope`); the rumor `content` is opaque text bounded by its limits;
  - `subject`/`e` reply tags;
  - groups with more than two members.

## 3. Architecture and data contracts

```mermaid
sequenceDiagram
    participant S as Seller session
    participant R as Relays (untrusted)
    participant B as Buyer session
    S->>S: rumor kind 14 (unsigned)<br/>tags p=buyer, trade=tradeId, conversation=cid
    S->>S: seal kind 13 = sign_S(NIP44(conv(S,B), rumor)), tags []
    S->>S: wrap kind 1059 = sign_E1(NIP44(conv(E1,B), seal)), tags [p=buyer]
    S->>S: self copy: seal to S, wrap under E2 with p=seller
    S-->>R: recipientWrap, selfWrap (publishing is G21, not here)
    R-->>B: wrap (any order, duplicates, forgeries)
    B->>B: verify wrap → decrypt → verify seal → decrypt → parse rumor
    B->>B: seal.pubkey == rumor.pubkey ∈ {S,B}; exact tags; dedup rumor.id
```

```typescript
interface TradeChatOptions {
  binding: TradeBinding;                 // CTX01; tradeId MUST be the G16 termsHash (64 lowercase hex)
  participants: readonly [string, string]; // BIP340 messaging keys from authenticated terms; distinct
  selfPublicKey: string;                 // one of participants
  provider: NostrMessagingProvider;      // G01 interface + BIP340 + NIP-44 ECDH
  now?: () => number;                    // unix seconds
  maxSeenMessages?: number;              // default 4096, 1..1_000_000
}
interface TradeChatMessage { rumorId: string; author: string; direction: "inbound" | "outbound";
  claimedCreatedAt: number /* sender claim, not chronology */; content: string; }
// Rumor tags, exactly and in this order:
//   ["p", <the other participant>], ["trade", <tradeId>], ["conversation", <conversationId>]
// conversationId = hex(sha256(utf8(JSON.stringify(
//   ["p2p-offramp/g20-trade-chat", 1, chain, networkId, deploymentId, tradeId, lowKey, highKey]))))
```

| Layer | Kind | Signed by | Tags | Content | created_at |
|---|---|---|---|---|---|
| rumor | 14 | nobody (id only) | the three tags above | text, ≤ 24576 UTF-8 bytes; rumor JSON ≤ 40960 bytes | send time |
| seal | 13 | author's messaging key | none (MUST be empty) | NIP-44(conv(author, recipient), rumor JSON) | uniform in [now − 172800, now] |
| gift wrap | 1059 | fresh one-time key | exactly one `["p", recipient]` | NIP-44(conv(one-time, recipient), seal JSON) | uniform in [now − 172800, now] |

Why 40960 bytes: a rumor JSON of that size pads to 40962 bytes and encodes to 54704 base64 characters. The seal JSON therefore stays under the 65535-byte NIP-44 plaintext limit of the wrap. Unwrapping accepts wraps and seals up to 600 seconds in the future (`MAX_FUTURE_SKEW_SECONDS`).

Runtime validation MUST reject unknown versions/properties, unsafe integers, duplicate identities and oversized inputs before expensive work. Network, deployment, trade and account generation are explicit bindings where economic state is involved. Immutable results and defensive copies prevent consumers mutating validated state. Protocol-specific limits override broader application limits.

## 4. Algorithms, transitions and invariants

**Send** (`send(content, senderSecret, signal)`):

1. Check that the session is open and the signal is not aborted. `content` must be non-empty.
2. Check that `provider.publicKey(senderSecret)` equals `selfPublicKey`; otherwise `UNAUTHORIZED`.
3. Build the rumor with the three binding tags. Enforce the content and rumor-JSON limits (`LIMIT_EXCEEDED`).
4. Build the recipient seal and wrap, then the self-copy seal and wrap. Each wrap uses its own one-time key from `provider.generate()`, and the one-time secret is wiped in `finally`. Each conversation key is wiped after its single use. The rumor is never signed.
5. Re-check close and abort after every await. A closed session returns `LOCKED`; an aborted signal returns `CANCELLED`. Either way nothing is returned for publication.
6. Record the rumor id as seen, so the self copy later reads as a duplicate.

**Receive** (`receive(untrustedWrap, recipientSecret, signal)`). Each layer is fully verified before the next is decrypted:

1. `recipientSecret` must belong to `selfPublicKey`.
2. Verify the outer event: kind 1059 only (kind 4 is `UNSUPPORTED_VERSION`), bounded, id and signature valid. It must have exactly one `p` tag, of length 2, naming self; otherwise `UNAUTHORIZED`. Its timestamp must not exceed the skew allowance.
3. NIP-44 decrypt with `conv(self, wrap.pubkey)`. Parse the seal JSON strictly (duplicate keys rejected), then verify it: kind 13, zero tags, valid signature, skew check.
4. NIP-44 decrypt with `conv(self, seal.pubkey)`. Parse the rumor strictly: kind 14, unsigned (a `sig` key is rejected), id recomputed, at most 3 tags of 2 items each, content within limits.
5. **Authenticate:** `rumor.pubkey == seal.pubkey`, otherwise `UNAUTHORIZED`. A key that does not belong to the author cannot sign that author's seal.
6. **Authorize:** `rumor.pubkey` must be one of the two participants. The tags must equal the expected three exactly: the `p` tag names the other participant, `trade` equals the bound tradeId, and `conversation` equals the derived id. Anything else is `UNAUTHORIZED`.
7. **Deduplicate** by rumor id. The rumor id is a hash of author, time, tags and content, so the same message re-delivered through any number of wraps or seals is one message. A message already seen returns `{ duplicate: true }` and is not treated as new. Once the session's seen-set reaches its bound, `LIMIT_EXCEEDED` is returned rather than evicting, because forgetting an id would let a relay replay it as new.

Wrapper and seal timestamps and ids never establish application chronology. `claimedCreatedAt` is a sender claim; receipt order is the caller's. `close()` makes every in-flight and later call return `LOCKED` and clears the seen-set. Reconnect, overlapping subscriptions and acknowledgements belong to G21 and are not implemented here. Existing signed/funded terms cannot be renegotiated by changing a local preference.

## 5. Interfaces, errors and recovery

```typescript
createTradeChat(options: TradeChatOptions): CoreResult<TradeChat>;
interface TradeChat {
  readonly conversationId: string;
  send(content: string, senderSecret: Uint8Array, signal?: AbortSignal):
    Promise<CoreResult<{ message: TradeChatMessage; rumor: UnsignedEvent; recipientWrap: NostrEvent; selfWrap: NostrEvent }>>;
  receive(wrap: unknown, recipientSecret: Uint8Array, signal?: AbortSignal):
    Promise<CoreResult<{ duplicate: boolean; message: TradeChatMessage }>>;
  close(): void;
}
tradeConversationId(binding: TradeBinding, participants: readonly [string, string]): string;
createSeal(rumor, senderSecret, recipientPublicKey, provider, now): Promise<NostrEvent>;
createGiftWrap(seal, recipientPublicKey, provider, now): Promise<NostrEvent>;
unwrapGiftWrap(wrap: unknown, recipientSecret, provider, { now, rumorLimits? }): Promise<{ wrap; seal; rumor }>;
randomizedTimestamp(now: number): number;   // CSPRNG, rejection sampling, uniform in [now − 172800, now]
```

The earlier interface `openTradeChat(binding, participants, relayIds, signal)`, `subscribe(cursor)` and the queued/sent/acknowledged/received delivery states belong to the relay layer and are deferred. The limits of four relay connections and 500 events per batch still apply there.

Results use the shared G13 `CoreResult` and `createCoreError`, with a fresh correlation id and no content, key or relay data:

| Code | Cause |
|---|---|
| `INVALID_INPUT` | Malformed binding, keys, options, event or clock. |
| `LIMIT_EXCEEDED` | Content, rumor JSON, tag count, payload size, or the seen-set bound. |
| `UNSUPPORTED_VERSION` | Kind 4 at any layer, or an unknown NIP-44 version. |
| `UNSUPPORTED_PROVIDER` | The provider lacks sign, ECDH or generate. |
| `UNAUTHORIZED` | Not addressed to self, a seal/rumor author mismatch, a non-participant, wrong binding tags, or a secret that does not match the session key. |
| `INTEGRITY_FAILURE` | Bad id, signature or MAC. |
| `LOCKED` / `CANCELLED` | The session is closed, or the signal was aborted. |

There is no retry, and no fallback to NIP-04 or to unwrapped kind-14 events. Chat messages never propose economic effects; operations that do pass core preflight, durable G12 reservation and fresh external-wallet consent, which this module cannot bypass.

## 6. Threat assessment and privacy limits

Gift wrapping reduces exposed social graph but relay subscriptions, IP, timing, retained ciphertext and endpoint compromise remain. Encryption cannot make public order discovery confidential. Expiry/deletion cannot erase relay copies.

| Attack | Mitigation |
|---|---|
| Impersonation: a third party wraps a rumor claiming a counterparty's key | `seal.pubkey == rumor.pubkey`, and the seal signature is verified. |
| An outsider who knows the trade injects messages | The author must be one of the two participants taken from terms. |
| Cross-trade or cross-conversation replay between the same two people | Exact `trade` and `conversation` tags. The conversation id commits to chain, network, deployment, tradeId and both keys. |
| Redirect: a wrap addressed to someone else, or several `p` tags | Exactly one `p` tag, naming self. |
| Relay duplicates or re-wraps | Rumor-id deduplication. The bound is refused, never evicted. |
| Timestamp correlation | Seal and wrap times are uniform over 2 days. Wrap keys are fresh per wrap. Wrap times are not used for ordering. |
| Downgrade to NIP-04, or plaintext kind 14 | Kind 4 is rejected at every layer. Only kind 1059 is accepted on the outer layer. |
| Seal metadata leak | Seal tags MUST be empty and are enforced on both build and receive. |
| Hostile objects and oversized relay input | Strict parsers. Bounds run before signature work and decryption. Errors are redacted. |
| Late plaintext after lock | Close and abort are re-checked after every await. |

Residual limits:

- Deduplication is per session and in memory, so after a reload a relay can replay old messages until durable G02 history exists.
- Each counterparty sees the other's long-term messaging key. A compromised messaging key decrypts all past and future messages (no forward secrecy).
- The self copy reveals to the sender's relays that the sender received a wrap.
- `claimedCreatedAt` can be any value the sender chooses.
- One-time secrets are wiped from their byte arrays, but noble's internal bigints and JavaScript strings cannot be wiped.

Active origin compromise, malicious extensions and a compromised OS can read unlocked state; capability wrappers are not a same-origin JavaScript sandbox. Transport encryption, payload encryption and chain privacy are independent properties. G02 remains the exact v1 storage authority: no alternative KDF, AAD, record kind or session token is introduced here. G03 alone governs authenticated fresh-key restore. No physical erasure, global anonymity or provider availability guarantee is made.

## 7. Verification, references and release gates

Recorded evidence (`npm test`):

- [nip59.test.mjs](../../../packages/nostr-crypto/test/nip59.test.mjs) covers:
  - layer invariants: kinds, empty seal tags, a single `p` tag, timestamps inside the window, and a wrap key different from the author's;
  - zeroed one-time secrets and conversation keys, checked with a spy provider;
  - fresh keys across 24 wraps;
  - rejection of a wrong recipient, a forged seal author, a seal with tags, kind 4 inside a wrap, a non-seal inside a wrap, future-dated and multi-`p` wraps, tampered content, a re-signed wrap under another one-time key, and a signed rumor.
- [nip17.test.mjs](../../../packages/nostr-crypto/test/nip17.test.mjs) covers:
  - a two-party exchange and a symmetric conversation id;
  - self copies, re-wrap deduplication, and recovery of the self copy after a reload;
  - rejection of an outsider, a wrong trade, a wrong conversation, a wrong `p`, reordered, extra or missing tags, a message from another trade between the same pair, a misaddressed wrap, and mismatched secrets;
  - kind 4 at the outer layer and smuggled inside a seal;
  - content and rumor-JSON limits, and the seen-set bound;
  - abort, and close during an in-flight send;
  - invalid configuration;
  - hostile relay input, including a throwing Proxy, with redaction checks.

Still required and **not** claimed:

- relay transport, reconnect gaps, relay rejection and acknowledgement handling (G21);
- interoperability with two independent clients (for example gift wraps produced by another NIP-17 implementation);
- key rotation across messaging identities;
- durable deduplication and encrypted history in G02;
- application envelope validation;
- browser and device matrix;
- named G06 review of the pinned noble dependencies, including `@noble/ciphers` 2.4.0 for ChaCha20;
- app/Worker wiring and UI.

Core release/refund does not depend on chat availability. For each supported profile record source/dependency commit, integrity digest, protocol revision, deployment/network IDs, fixture provenance, browser/provider matrix and named review. Where no concrete profile is approved the implementation MUST return unsupported, not emulate success. Unit fixtures alone do not establish browser routing, wallet support or custody safety. Acceptance requires positive interoperability and negative boundary cases, cancellation/reload fault injection, redacted logging checks, and a core-only build with advanced packages absent completing basic trading recovery. Independent review and applicable roadmap milestone gates remain pending.

- [DEVELOPMENT_ROADMAP](../../../DEVELOPMENT_ROADMAP.md).
- [spec-system-context-contract](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md).
- [spec-optional-module-interface](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.6_extension_contract/spec-optional-module-interface.md).
- [spec-typed-errors-and-retries](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.5_failure_contract/spec-typed-errors-and-retries.md).
- [spec-application-message-envelope](../module_5.3.1_message_adapters/spec-application-message-envelope.md).
- [spec-relay-failover-and-abuse-limits](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.4_order_discovery/module_1.4.3_relay_resilience/spec-relay-failover-and-abuse-limits.md).
- [spec-indexeddb-encrypted-records](../../feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-indexeddb-encrypted-records.md).
- [spec-transport-policy-enforcement](../../feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md).
- [Primary protocol reference](https://github.com/nostr-protocol/nips/blob/master/17.md).
- [Primary protocol reference](https://github.com/nostr-protocol/nips/blob/master/59.md).
- [Primary protocol reference](https://github.com/nostr-protocol/nips/blob/master/44.md).
