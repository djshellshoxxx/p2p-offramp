# Client state authority and reconciliation

## 1. Metadata

- **Specification ID:** G08
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 1
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Keep chain observations, relay advertisements, wallet consent, local intent and manual fiat claims separate. No optimistic reducer transition creates spendable value or proves fiat receipt. Finality is the adapter's observed chain policy, not a locally guaranteed economic fact.

## 3. Architecture and state contracts

```typescript
interface ChainObservation {
  binding: TradeBinding;
  generation: number;
  requestSequence: number;
  anchor: { height: string; hash: string }; // adapter canonical unsigned decimal and block ID
  state: "absent" | "funded" | "released" | "refunded";
  finality: "pending" | "confirmed" | "finalized";
  observedAt: number;
}
interface TradeView {
  binding: TradeBinding;
  chain: ChainObservation | null;
  chainHealth: "loading" | "fresh" | "stale" | "unavailable" | "reorged";
  pendingIntentIds: readonly string[];
  fiatClaim: "none" | "buyer-claims-paid" | "seller-attests-received";
  walletGeneration: number;
}
```

Amounts remain canonical unsigned decimal base-unit strings supplied by the escrow/asset contract; never JS floating point. `height` is a decimal string, not a Number cast. Relay order state and local messaging state are separate stores and cannot overwrite `chain`. Persist minimal recovery references in G02; do not persist a UI success flag as authoritative money state.

## 4. Reducer and freshness algorithms

The reducer is pure and never performs I/O or calls wallet methods. Per binding and generation, the reconciliation coordinator assigns increasing requestSequence before an RPC request. Only the latest-issued reconciliation response may update the current chain view; late older responses are discarded. A new reconciliation starts at loading/stale and requires chain identity/deployment validation. Sequence order is local observation order, not a blockchain fork-choice algorithm.

A chain state transition follows the deployed contract: absent -> funded -> released/refunded. An observation contradicting a previous anchor/state is `reorged` until a fresh canonical read resolves it; do not hide contradictory evidence behind last-writer-wins. Confirmations can regress and finalized observations can be contradicted by an untrusted RPC. Any such conflict blocks economic actions rather than assuming monotonic truth. Economic preflight rechecks the current escrow from the configured adapter immediately before preparation and again checks wallet generation before signing. Clock-based freshness is display-only; a maximum 30-second UI age marks the view stale, but a fresh label never substitutes for preflight.

User fiat claims alter only fiatClaim. Buyer-paid messaging cannot release escrow. Seller-attests-received enables a release request only if the seller is the connected account and the adapter verifies funded/predeadline state. Unknown chain state disables funding/release/refund preparation; offline views and encrypted export remain available.

## 5. Interfaces and lifecycle

```typescript
function reduceTrade(previous: Readonly<TradeView>,
  event: Readonly<ObservationEnvelope<unknown>>): Readonly<TradeView>;
interface Reconciler {
  refresh(binding: TradeBinding, signal?: AbortSignal): Promise<CoreResult<ChainObservation>>;
  invalidate(binding: TradeBinding): void;
  dispose(): void;
}
```

The dispatcher validates kind-specific payloads before invoking the reducer. Wallet account/network events increase walletGeneration and cancel stale preparations; journal entries remain bound to their original account/network. A local vault conflict requires reload/unlock; it does not merge economic commands. Multi-tab writes use G02 compare-and-swap. A single per-profile coordinator serializes same-trade economic intents across tabs using persisted unresolved G12 entries; a BroadcastChannel notification is a UI optimization, never a lock.

## 6. Threat assessment

Replay/out-of-order events could display paid/released without a valid chain observation; source isolation and reconciliation prevent that promotion. A malicious RPC can still fabricate current state, so registry checks and disagreement handling remain explicit trust assumptions. UI optimistic updates must use pending labels and never prompt fiat payment before funding finality. Cross-tab contention must not create two wallet submissions; journal reservation is committed before a wallet send-capable call. Restored backups are stale by definition and start with chainHealth loading.

## 7. Verification and references

Property-test random duplicates, out-of-order events and wallet generation changes: reducers remain deterministic and pure, and relay/fiat events never finalize escrow. Test an older refresh completing after a newer one, exact age boundary, release/refund contradictory anchors, reorged funding, cold-start restore, account/network switches and two-tab same-trade submission attempts. Both EVM and Solana finality adapter fixtures must pass. Sources: [system context](../module_0.4.1_system_boundaries/spec-system-context-contract.md), [G02 vault](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-indexeddb-encrypted-records.md), [transaction journal](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.7_transaction_recovery/module_1.7.1_transaction_journal/spec-transaction-lifecycle-journal.md).
