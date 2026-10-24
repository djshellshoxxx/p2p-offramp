# Durable transaction intent and reconciliation journal

## 1. Metadata

- **Specification ID:** G12
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 1
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Recover economic intent after tab crashes, uncertain wallet/provider responses and chain reorganization without blind resubmission. Journal status is an observation and reservation mechanism; it is not a ledger balance or proof of fiat payment.

## 3. Architecture and data contracts

```typescript
type IntentState = "prepared" | "broadcast-unknown" | "pending" | "confirmed" |
  "finalized" | "failed" | "reorged" | "expired" | "replaced";
interface IntentV1 {
  version: 1;
  intentId: string; // 32 random bytes as canonical unpadded base64url
  binding: TradeBinding;
  account: string; // canonical chain account from adapter
  action: "approve" | "fund" | "release" | "refund";
  state: IntentState;
  walletGeneration: number;
  expectedEscrowState: "absent" | "funded";
  preparedRequest: string; // bounded canonical adapter encoding, no private keys
  submission: { chain: "evm"; hash: string | null; nonce: string | null } |
    { chain: "solana"; signature: string | null; blockhash: string;
      lastValidBlockHeight: string };
  replacementOf: string | null;
  createdAt: number; // informational local ms
  updatedAt: number;
}
```

Intent is a schema-versioned G02 journal record. Its storage record ID is a separate random 16-byte lowercase-hex G02 ID; intentId remains the 32-byte protocol-local intent identifier. Reservation scans the bounded authenticated journal records for matching binding/account and commits the inserted record through G02 CAS; an untrusted secondary index is never the uniqueness authority. The adapter bounds/canonicalizes preparedRequest to 64 KiB; G02 per-record cap still applies. At most one unresolved economic intent exists per `(networkId,deploymentId,tradeId,account)` regardless of action. Approvals and funding serialize; an approval must reconcile before funding preflight. Unknown/future intent schemas block new sends for the affected profile rather than silently dropping reservations.

## 4. Reservation, send and recovery algorithm

1. Freshly reconcile chain/asset/deployment/state and validate wallet account/network/generation. Prepare the exact command and human-readable preview. Read current journal snapshot, reject if an unresolved binding reservation exists, and commit a new prepared intent with G02 CAS. Two tabs racing on the same revision yield one winner; the loser reloads and sees the durable reservation.
2. After explicit user confirmation and immediately before invoking any send-capable wallet method, persist broadcast-unknown using another CAS and recheck generation/policy/state. If this write fails, do not call the wallet. The state transition MUST be an atomic prepared-to-broadcast-unknown CAS against the current durable journal entry. Only that first successful transition authorizes one send-capable invocation. It is deliberately non-idempotent: repeated markSending/submit calls, including calls after reload, MUST return CONFLICT for broadcast-unknown, pending or any other non-prepared state and make zero wallet calls. Never authorize a send from a cached prepared status. The marker is conservative: a crash before invocation may still leave an unresolved record. It is safer than falsely concluding nothing was submitted.
3. Invoke the wallet once. On a returned valid hash/signature store it and mark pending. User rejection can become failed only if the wallet adapter can establish no submission occurred; ambiguous errors remain broadcast-unknown. A returned hash/signature is not inclusion/finality. If persistence after wallet success fails, keep the earlier reservation and reconcile; never immediately invoke the wallet again.
4. EVM: reconcile known hash receipt, transaction sender/nonce/destination/call data and escrow state. A nonce replacement is linked to original intent and classified according to actual replacement payload/outcome. A null receipt or elapsed wall-clock time does not prove dropping. If hash/nonce is unknown or provider history is inadequate, keep broadcast-unknown and block fresh sends until chain-specific recovery establishes outcome or safe replacement. Any approved replacement requires fresh user consent and the same nonce semantics under the adapter; it is not generic retry.
5. Solana: track original signed message/blockhash/lastValidBlockHeight and signature when known. Query status with history search where available, read transaction error/finality and reconcile escrow state. A null recent-cache status does not prove absence. Blockhash validity uses chain-reported block height and recorded lastValidBlockHeight, never a hardcoded slot/time estimate. After expiry, require finalized chain reconciliation and available transaction history before declaring expired/allowing a newly signed intent. If evidence is unavailable, remain uncertain. Durable nonce transactions are unsupported in core until a separate lifecycle is specified.
6. Confirmed/finalized labels follow registry policy and verified binding, not wallet callbacks. If an anchor disappears or contradicts earlier state, set reorged and reconcile again. Preserve prior observation history without reusing its authority. A finalized outcome is still an observed RPC result; RPC contradictions block actions.
7. Cancel before send-capable invocation may mark prepared failed after durable update. Cancel/lock after broadcast-unknown does not erase intent. Session restart reads unresolved entries before permitting economic commands. Imported backups start uncertain/stale and reconcile against original bindings. Resubmitting identical signed Solana bytes for network propagation, if supported, is a separately consented adapter policy; generic code never changes/re-signs the message automatically.

## 5. Interfaces and error recovery

```typescript
interface IntentJournal {
  reserve(intent: IntentV1, expectedRevision: number): Promise<CoreResult<string>>;
  markSending(intentId: string): Promise<CoreResult<void>>;
  observe(intentId: string, observation: unknown): Promise<CoreResult<IntentV1>>;
  unresolved(binding: TradeBinding, account: string): Promise<CoreResult<readonly IntentV1[]>>;
  reconcile(intentId: string, signal?: AbortSignal): Promise<CoreResult<IntentV1>>;
}
```

`observe` accepts only the selected chain adapter's schema and verifies state-transition preconditions. Clients cannot overwrite records through arbitrary UI status changes. Finalized/failed/expired/replaced records are retained for recovery/export under explicit retention policy, not deleted automatically. G02 conflicts require reload/reconciliation. Timeouts, disconnects, locked vault and uncertain storage after sending surface BROADCAST_UNKNOWN with reconciliation action. No raw provider error is persisted.

## 6. Threat assessment

Duplicate intents after crash, two tabs, optimistic callbacks, provider lies, reorgs, replacement confusion and replay across networks can cause repeated economic actions. Durable pre-send reservation, CAS, exact binding and no blind retry reduce these risks. Reservations do not prevent the user sending from another app/wallet; chain authorization/state invariants are still mandatory. A malicious RPC can hide history, so uncertainty may persist. Do not offer a generic clear-reservation button that resends without proving safe recovery. Signed transactions are public/broadcastable material and remain private in the local encrypted journal until needed.

## 7. Verification and references

Crash at every boundary: before reservation, after prepared, after broadcast-unknown, during wallet invocation, after returned hash before persistence, and after inclusion before UI update. Assert one send-capable call and recoverable unresolved intent. Run real two-tab IndexedDB CAS races, simultaneous markSending for one intent, sequential duplicate submit calls and a duplicate submit after restart: exactly one prepared-state CAS may authorize a send, and all later attempts must refuse. EVM fixtures cover pending/replaced/reverted/missing receipt/unknown nonce and contradictory deployment data. Solana fixtures cover expired blockhash, null recent cache with later history hit, transaction error, unavailable history and confirmed-to-reorged observations. Unknown state must block a new intent. Sources: [Ethereum JSON-RPC](https://ethereum.org/en/developers/docs/apis/json-rpc/), [Solana transactions](https://solana.com/docs/core/transactions), [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses), [G02 vault](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-indexeddb-encrypted-records.md).
