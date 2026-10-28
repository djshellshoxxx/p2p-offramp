# Durable transaction intent and reconciliation journal

## 1. Metadata

- **Specification ID:** G12
- **Version:** 2.0 (Iteration 3; reflects the package-level EVM submit/reconcile core)
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — EVM package-level implementation present (test-only, not wired into the app); Solana lifecycle and independent review pending
- **Delivery phase:** 1 (journal) / 2 (EVM submit and reconciliation)
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.
- **Implementation:** journal [intent-journal.ts](../../../packages/domain/src/intent-journal.ts) (reservation-only `createIntentJournal` and lifecycle-mode `createLifecycleJournal`), coordinator [tx-lifecycle.ts](../../../packages/domain/src/tx-lifecycle.ts), EVM binding [evm-submit.ts](../../../packages/wallet/src/evm-submit.ts) over [evm-escrow.ts](../../../packages/wallet/src/evm-escrow.ts). None of these are exported from a package facade or bundled; `apps/web/**` and the runtime/Worker do not call them yet.

## 2. Objective

Recover economic intent after tab crashes, uncertain wallet/provider responses and chain reorganization without blind resubmission. Journal status is an observation and reservation mechanism; it is not a ledger balance or proof of fiat payment.

Boundaries of this iteration: EVM only (`chain: 'evm'` bindings and submissions). Gas, fee and nonce choice beyond "the account's pending nonce" belong to the wallet. Wallet-signed sending from a non-dev account, the app/Worker wiring and Solana are not implemented. Two-tab IndexedDB races for the lifecycle mode are covered by [test-lifecycle-tabs-browser.mjs](../../../scripts/test-lifecycle-tabs-browser.mjs) (real Chromium, two documents, one encrypted profile): reservation, `markSending`, conflicting hash observations, confirmed-vs-replaced outcomes, a stale document's write, and the successor race after finalized/replaced each commit exactly once. A mutant that disables the store's CAS comparison fails the suite. Errors are G13 `CoreResult` codes ([G13](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.5_failure_contract/spec-typed-errors-and-retries.md)).

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
// EVM preparedRequest: exact canonical JSON, key order fixed, re-parsed and re-serialized on every read.
interface EvmPreparedRequest {
  v: 1; chainId: string /* decimal */; from: string; to: string; data: string; value: string /* decimal wei */;
  nonce: string /* decimal, equals submission.nonce */; preparedAtBlock: string /* latest block at prepare */;
}
type EvmOutcome = "prepared" | "pending" | "confirmed" | "finalized" | "replaced" | "dropped" | "reverted" | "reorged";
interface EvmFinalityPolicy { finality: { kind: "evm-finalized-tag" }; confirmations: number; dropAfterBlocks: number; }
```

Intent is a schema-versioned G02 journal record. Its storage record ID is a separate random 16-byte lowercase-hex G02 ID; intentId remains the 32-byte protocol-local intent identifier. Reservation scans the bounded authenticated journal records for matching binding/account and commits the inserted record through G02 CAS; an untrusted secondary index is never the uniqueness authority. The adapter bounds/canonicalizes preparedRequest to 64 KiB; G02 per-record cap still applies. At most one unresolved economic intent exists per `(networkId,deploymentId,tradeId,account)` regardless of action. Approvals and funding serialize; an approval must reconcile before funding preflight. Unknown/future intent schemas block new sends for the affected profile rather than silently dropping reservations.

Two journal modes exist. The reservation-only journal (`createIntentJournal`) keeps every record of a binding/account reserved forever and has no transition API. The lifecycle journal (`createLifecycleJournal`) is used only by the coordinator and differs in exactly three ways:

1. A new intent may follow records of the same binding/account only when each is `finalized` or `failed`, or is `expired`/`replaced` and named by exactly one successor's `replacementOf`. A successor of an `expired` (dropped) intent MUST carry the same nonce.
2. `observe(intentId, {state, hash})` writes one CAS transition. Every field except `state`, `submission.hash` and `updatedAt` is immutable; a recorded hash can never change; a hash may be learned at most once.
3. `list()` returns all records for restart recovery.

Lifecycle transitions (anything else is `CONFLICT`, with no write):

| From | Allowed to |
| --- | --- |
| prepared | failed (cancel before any send-capable call) |
| broadcast-unknown | pending (hash required), confirmed, finalized, replaced, expired, failed |
| pending | confirmed, finalized, replaced, expired, failed, reorged |
| confirmed | finalized, reorged |
| finalized | reorged (an RPC contradiction; blocks actions again) |
| reorged | pending, confirmed, finalized, replaced, expired, failed |
| failed, expired, replaced | none (terminal) |

Classification to state: `pending` → `pending` with a hash, otherwise the state is left unchanged; `confirmed`/`finalized` → same; `replaced` → `replaced`; `dropped` → `expired`; `reverted` → `failed`; `reorged` → `reorged` (only from a hashed or latched state).

## 4. Reservation, send and recovery algorithm

1. Freshly reconcile chain/asset/deployment/state and validate wallet account/network/generation. Prepare the exact command and human-readable preview. Read current journal snapshot, reject if an unresolved binding reservation exists, and commit a new prepared intent with G02 CAS. Two tabs racing on the same revision yield one winner; the loser reloads and sees the durable reservation. *EVM implementation:* `prepare` reads `eth_chainId` (must equal the wallet context), refreshes the escrow state through the G08 authority (must equal `expectedEscrowState`), reads the latest block and the account's `pending` nonce (or the dropped intent's own nonce for a same-nonce successor, which is refused unless that nonce is still unused), and reserves. Calldata comes from `escrowCallFor` (evm-escrow.ts builders). A wallet change during any of these reads cancels the prepare; a reservation that committed after the change is durably cancelled (`failed`).
2. After explicit user confirmation and immediately before invoking any send-capable wallet method, persist broadcast-unknown using another CAS and recheck generation/policy/state. If this write fails, do not call the wallet. The state transition MUST be an atomic prepared-to-broadcast-unknown CAS against the current durable journal entry. Only that first successful transition authorizes one send-capable invocation. It is deliberately non-idempotent: repeated markSending/submit calls, including calls after reload, MUST return CONFLICT for broadcast-unknown, pending or any other non-prepared state and make zero wallet calls. Never authorize a send from a cached prepared status. The marker is conservative: a crash before invocation may still leave an unresolved record. It is safer than falsely concluding nothing was submitted. *EVM implementation:* `submit` accepts only a live prepare result of the current wallet generation, consumes it, preflights `eth_accounts`/`eth_chainId` (a mismatch invalidates the generation, cancels the intent and returns `LOCKED`/`WRONG_CHAIN` with zero sends), writes the marker, rechecks the generation, then calls `eth_sendTransaction` once with `from,to,data,value,nonce,chainId`.
3. Invoke the wallet once. On a returned valid hash/signature store it and mark pending. User rejection can become failed only if the wallet adapter can establish no submission occurred; ambiguous errors remain broadcast-unknown. A returned hash/signature is not inclusion/finality. If persistence after wallet success fails, keep the earlier reservation and reconcile; never immediately invoke the wallet again. *EVM implementation:* EIP-1193 code 4001 (rejected before signing) records `failed` and returns `USER_REJECTED`; every other error, a malformed result, or a failed hash write returns `BROADCAST_UNKNOWN` (action `reconcile`). Any failure after the send-capable call began is reported as `BROADCAST_UNKNOWN`.
4. EVM: reconcile known hash receipt, transaction sender/nonce/destination/call data and escrow state. A nonce replacement is linked to original intent and classified according to actual replacement payload/outcome. A null receipt or elapsed wall-clock time does not prove dropping. If hash/nonce is unknown or provider history is inadequate, keep broadcast-unknown and block fresh sends until chain-specific recovery establishes outcome or safe replacement. Any approved replacement requires fresh user consent and the same nonce semantics under the adapter; it is not generic retry. *EVM implementation* (`reconcile`, reads only, each through `retryRead`):
   - Read `eth_chainId` (mismatch → `WRONG_CHAIN`), refresh the escrow observation through the G08 authority, read `latest` and `finalized` heads.
   - **Hash known, receipt present:** the receipt counts only while `blockHash` equals the canonical hash at its height. The transaction body must match the recorded sender, nonce, destination, calldata and value, and a successful receipt must agree with the escrow state (`fund` → funded/released/refunded, `release` → released, `refund` → refunded); otherwise `INTEGRITY_FAILURE` with no write. Receipt block ≤ finalized head → `finalized`; depth ≥ `confirmations` → `confirmed`; shallower → `pending`. A reverted receipt at depth → `reverted`.
   - **Hash known, no canonical receipt:** a latched (`confirmed`/`finalized`) intent → `reorged`. Otherwise if `eth_getTransactionCount(latest)` > recorded nonce → `replaced` (the escrow state reported alongside shows what the replacement did, e.g. a wallet speed-up that still funded).
   - **Hash unknown** (crash between marker and hash write): nonce consumed and the escrow shows this action's effect → classified by reading the escrow at the finalized head (`finalized`) and at `latest − confirmations + 1` (`confirmed`), else `pending`; nonce consumed without the effect → `replaced`; a latched intent whose effect or nonce disappeared → `reorged`. `approve` has no escrow effect, so an unknown-hash approval stays unresolved.
   - **Nonce unused:** `dropped` only when the transaction is unknown to the node, the `pending` nonce does not exceed the recorded nonce, and `latest ≥ preparedAtBlock + dropAfterBlocks`; otherwise `pending`. A dropped intent may be followed only by an explicit successor (`prepare({supersedes})`, a user action) at the same nonce, so at most one of the two can ever be included. A replaced intent's successor uses the next pending nonce.
5. Solana: track original signed message/blockhash/lastValidBlockHeight and signature when known. Query status with history search where available, read transaction error/finality and reconcile escrow state. A null recent-cache status does not prove absence. Blockhash validity uses chain-reported block height and recorded lastValidBlockHeight, never a hardcoded slot/time estimate. After expiry, require finalized chain reconciliation and available transaction history before declaring expired/allowing a newly signed intent. If evidence is unavailable, remain uncertain. Durable nonce transactions are unsupported in core until a separate lifecycle is specified. *Not implemented in this iteration.*
6. Confirmed/finalized labels follow registry policy and verified binding, not wallet callbacks. If an anchor disappears or contradicts earlier state, set reorged and reconcile again. Preserve prior observation history without reusing its authority. A finalized outcome is still an observed RPC result; RPC contradictions block actions. *EVM implementation:* the registry `evm-finalized-tag` policy plus a caller-chosen confirmation depth (`evmFinalityPolicy`). A G08 authority contradiction (lower anchor height, same height with another hash or state, funded → absent, terminal escrow state changed) never latches a confirmation and unlatches a latched one to `reorged`; the next consistent observation clears it.
7. Cancel before send-capable invocation may mark prepared failed after durable update. Cancel/lock after broadcast-unknown does not erase intent. Session restart reads unresolved entries before permitting economic commands. Imported backups start uncertain/stale and reconcile against original bindings. Resubmitting identical signed Solana bytes for network propagation, if supported, is a separately consented adapter policy; generic code never changes/re-signs the message automatically. *EVM implementation:* an account or chain change (`walletChanged`) synchronously invalidates every prepare result and durably cancels every un-sent intent of this coordinator; `recover()` on restart cancels all `prepared` records (prepare results never survive a restart) and returns the unresolved ones for reconciliation.

## 5. Interfaces and error recovery

```typescript
interface LifecycleJournal extends IntentJournal {
  observe(intentId: string, transition: { state: IntentState; hash: string | null }, signal?: AbortSignal): Promise<CoreResult<IntentV1>>;
  list(signal?: AbortSignal): Promise<CoreResult<readonly IntentV1[]>>;
  currentRevision(): number | null;
}
interface EvmChainReader { // idempotent reads only; retried exclusively through read-retry.ts
  chainId; head("latest" | "finalized"); blockHashAt(number); transactionCount(account, "latest" | "pending");
  transaction(hash); receipt(hash); escrowState(binding, blockNumber); escrowObservation(binding, reconcileRequest);
}
interface EvmTxLifecycle {
  walletChanged(next: { account: string; chainId: string; generation: number } | null): Promise<void>;
  prepare(input: { binding; action; expectedEscrowState; call: { to; data; value }; supersedes?: string }, signal?): Promise<CoreResult<PreparedEvmIntent>>;
  submit(prepared: PreparedEvmIntent, signal?): Promise<CoreResult<{ intent: IntentV1; hash: string }>>;
  reconcile(intentId: string, signal?): Promise<CoreResult<{ outcome: EvmOutcome; intent: IntentV1; escrowState; evidence }>>;
  recover(signal?): Promise<CoreResult<readonly IntentV1[]>>;
  dispose(): void;
}
```

`observe` accepts only the selected chain adapter's schema and verifies state-transition preconditions. Clients cannot overwrite records through arbitrary UI status changes. Finalized/failed/expired/replaced records are retained for recovery/export under explicit retention policy, not deleted automatically. G02 conflicts require reload/reconciliation. Timeouts, disconnects, locked vault and uncertain storage after sending surface BROADCAST_UNKNOWN with reconciliation action. No raw provider error is persisted.

The wallet is an injected EIP-1193 `request` function; the reader is `createEip1193ChainReader({ request, escrow })`, which normalizes thrown provider errors (no message copied) and turns malformed node output into `INTEGRITY_FAILURE`. Before the escrow's deployment block an empty `getTrade` return is `absent` only when `eth_getCode` is empty at that block. Error mapping: wallet/chain mismatch → `LOCKED`/`WRONG_CHAIN` (reconnect); stale or reused prepare result, unresolved reservation, invalid successor, illegal transition → `CONFLICT` (reload); contradictory receipt/body/escrow → `INTEGRITY_FAILURE` (change-provider, no write); read outage after retries → `UNAVAILABLE`/`TIMEOUT`; anything after send-started → `BROADCAST_UNKNOWN` (reconcile). The coordinator serializes its journal calls; the journal still allows one operation at a time per instance.

## 6. Threat assessment

Duplicate intents after crash, two tabs, optimistic callbacks, provider lies, reorgs, replacement confusion and replay across networks can cause repeated economic actions. Durable pre-send reservation, CAS, exact binding and no blind retry reduce these risks. Reservations do not prevent the user sending from another app/wallet; chain authorization/state invariants are still mandatory. A malicious RPC can hide history, so uncertainty may persist. Do not offer a generic clear-reservation button that resends without proving safe recovery. Signed transactions are public/broadcastable material and remain private in the local encrypted journal until needed.

Implementation-specific residual risks: (a) the unknown-hash `confirmed` label is evidence that the nonce was consumed and the escrow shows the effect, not proof that this exact transaction caused it (another app may have funded the same terms); the outcome is still the observed escrow state. (b) `dropped` is a single-node view (pool and nonce); the same-nonce successor rule, not the label, is what prevents a double inclusion. (c) EIP-1193 4001 is trusted as "nothing submitted"; a dishonest wallet can lie about anything, so chain invariants (`TradeIdUsed`, seller-only release) remain the backstop. (d) Lifecycle reservation trusts `finalized`/`failed` records in the authenticated vault; restored backups are not yet distinguished from locally written records. (e) The wallet may override the requested nonce; reconciliation then observes the real body and reports `INTEGRITY_FAILURE` or `replaced` rather than latching.

## 7. Verification and references

Crash at every boundary: before reservation, after prepared, after broadcast-unknown, during wallet invocation, after returned hash before persistence, and after inclusion before UI update. Assert one send-capable call and recoverable unresolved intent. Run real two-tab IndexedDB CAS races, simultaneous markSending for one intent, sequential duplicate submit calls and a duplicate submit after restart: exactly one prepared-state CAS may authorize a send, and all later attempts must refuse. EVM fixtures cover pending/replaced/reverted/missing receipt/unknown nonce and contradictory deployment data. Solana fixtures cover expired blockhash, null recent cache with later history hit, transaction error, unavailable history and confirmed-to-reorged observations. Unknown state must block a new intent. Sources: [Ethereum JSON-RPC](https://ethereum.org/en/developers/docs/apis/json-rpc/), [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193), [Solana transactions](https://solana.com/docs/core/transactions), [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses), [G02 vault](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-indexeddb-encrypted-records.md).

Recorded evidence (`npm test`): [tx-lifecycle.test.mjs](../../../packages/domain/test/tx-lifecycle.test.mjs) runs the lifecycle over the encrypted G02 vault with a simulated durable store, a fake chain (blocks, pool, nonces, escrow history, reorg) and a fake EIP-1193 wallet. It covers every classification (pending, confirmed, finalized, replaced including a same-effect speed-up, dropped with and without a hash, reverted, reorged by missing receipt, by non-canonical receipt block and by an unused nonce after an effect-only confirmation); a crash after reservation, after send-started before broadcast, during the wallet call after broadcast, after the hash returned before it was persisted, and after the hash was recorded; concurrent, sequential and post-restart duplicate submits (one send); account change, in-flight prepare cancellation, wallet moved without an event, chain change; read retries and no send retry; rejection; contradictory transaction bodies; and journal transition guards. [evm-submit.test.mjs](../../../packages/wallet/test/evm-submit.test.mjs) covers the EIP-1193 reader mapping, hostile provider output and calldata selection. [intent-journal.test.mjs](../../../packages/domain/test/intent-journal.test.mjs) still holds for the reservation-only mode.

Recorded local evidence (`npm run test:evm:reconcile`, [test-evm-reconcile-local.mjs](../../../scripts/test-evm-reconcile-local.mjs), anvil with automine off and one slot per epoch, real BasicEscrow, anvil dev accounts, file-backed encrypted journal): a child client process is SIGKILLed after send-started and broadcast and a fresh process reconciles the unknown outcome to confirmed then finalized without resending; a higher-gas same-nonce transaction replaces a pending fund (→ replaced, explicit successor → confirmed); an `anvil_dropTransaction` fund → dropped after the expiry, same-nonce successor → confirmed; fund → finalized, then release through the lifecycle → confirmed and the buyer is paid.

Still required and **not** claimed: app/Worker integration and UI preview/consent; wallet-signed sending from a non-dev account (wallets may ignore the nonce field); an approval allowance check for unknown-hash `approve`; transaction-history search for unknown hashes; Solana lifecycle; restored-backup provenance for releasable states; independent review.
