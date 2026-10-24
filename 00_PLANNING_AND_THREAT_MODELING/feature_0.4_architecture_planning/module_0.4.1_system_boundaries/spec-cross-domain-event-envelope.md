# Cross-domain event envelope

## 1. Metadata

- **Specification ID:** CTX02
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 1
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Represent validated application observations without mistaking a local event for a signed protocol message or authoritative settlement. This envelope is internal to the app; Nostr events, chain logs and wallet requests retain their native formats.

## 3. Architecture and data contracts

```typescript
interface ObservationEnvelope<T> {
  version: 1;
  eventId: string; // 32 random bytes, canonical unpadded base64url
  binding: TradeBinding; // CTX01, validated by the chain adapter
  source: "chain" | "relay" | "wallet" | "journal";
  kind: "chain-snapshot" | "order-observed" | "wallet-invalidated" | "intent-updated";
  generation: number; // nonnegative safe integer, local session generation
  sequence: number; // nonnegative safe integer, per-source request/commit sequence
  observedAt: number; // Unix ms, display only
  data: T; // exact discriminated schema for kind; no arbitrary JSON
}
```

Schema dispatch requires the source/kind pair: chain/chain-snapshot, relay/order-observed, wallet/wallet-invalidated, journal/intent-updated. No other combination is accepted. `TradeBinding` comes from CTX01; source payload contracts come from G08/G10/G12 and relay specifications. Events without a trade binding (e.g. global route loss) use service-specific callbacks and are not forged into a trade envelope.

## 4. Algorithms and serialization

Validate exact object keys, version, source/kind, nonnegative safe integers, canonical event ID, binding and kind-specific data before dispatch. Bound the complete serialized envelope to 64 KiB; large content belongs in a validated encrypted vault record referenced by opaque ID. No event may carry raw keys, passphrases, proof witnesses or arbitrary diagnostics. Use UTF-8 JSON for local persistence; no event-envelope hashing or signing algorithm is defined here. IDs deduplicate local dispatch only and are not proof of authenticity.

A session-scoped dispatcher keeps at most 4096 recently seen event IDs in FIFO order. Duplicate IDs are ignored. Eviction permits old IDs to appear again, so reducers MUST also be idempotent based on source-native IDs and authority state. Generation mismatch rejects stale events. Sequence numbers order observations within the relevant source and binding, never across independent peers. A local observedAt cannot decide order expiry, chain finality or event authority.

## 5. Interfaces and failure recovery

```typescript
interface EventDispatcher {
  dispatch(event: unknown): "accepted" | "duplicate" | "stale" | "invalid";
  reset(generation: number): void;
  dispose(): void;
}
```

`dispatch` runs schema validation, then freshness checks, then the pure G08 reducer. It emits no network calls and cannot sign transactions. Reset clears bounded dedup state and subscribers; new generation is greater than the prior generation. Sequence exhaustion or generation exhaustion at Number.MAX_SAFE_INTEGER requires session recreation, not wraparound. Persistent intent sequencing uses G12 atomic vault revisions; it is not reset by a UI component remount. Unknown future versions return `invalid` and do not partially apply data.

## 6. Threat assessment

Injected source labels do not prove chain origin: only the corresponding bundled adapter can construct a validated internal observation after native verification. Treat arbitrary imported envelope JSON as untrusted data, never as a direct reducer action. Duplicate suppression does not prevent replay of protocol messages; native Nostr/chain/domain replay rules remain mandatory. Unbounded IDs/payloads could exhaust memory; apply byte/count limits before enqueueing. No cross-source last-writer-wins policy is allowed for money or escrow state.

## 7. Verification and references

Test every source/kind combination, unknown fields, negative/unsafe sequences, ID encoding, 64 KiB boundary, 4096-entry eviction, duplicate delivery, generation changes, reordered requests and future versions. Reapply an event after dedup eviction and ensure no economic side effect. A valid relay-sourced event cannot finalize escrow. Fuzz 10000 bounded input envelopes per deterministic seed. Dependencies: [system context](spec-system-context-contract.md), [state authority](../module_0.4.4_state_management/spec-client-state-authority.md), [transaction journal](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.7_transaction_recovery/module_1.7.1_transaction_journal/spec-transaction-lifecycle-journal.md).
