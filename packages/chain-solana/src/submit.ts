/**
 * Solana submission with a D9-equivalent durable send marker. Every step is one CAS write of the trade's journal:
 *
 *   prepare  -> `prepared`   (finalized blockhash + lastValidBlockHeight fixed, message journaled before signing)
 *   sign     -> `signed`     (wallet output validated; the signature = transaction id is journaled)
 *   mark     -> `sendMarked` (the durable marker, written BEFORE sendTransaction and never cleared)
 *   send     -> `sent` | `unknown` (exactly one sendTransaction; any throw, timeout or odd answer is `unknown`)
 *   observe  -> `finalized` | `failed` | `dropped`, or no change while the outcome is still open
 *
 * sendTransaction is called with `skipPreflight: true` and `maxRetries: 0`; the client never resends, and a
 * rebuild after a definitive drop is a new, user-triggered intent with a new blockhash. Why skip preflight
 * (sendTransaction docs, solana-com@14537348 apps/docs/content/docs/en/rpc/http/sendtransaction.mdx; Agave
 * v4.1.2 rpc/src/rpc.rs `send_transaction`): a preflight answer is only the RPC's claim, so after the marker
 * it could not make the outcome anything but uncertain until reconciled; the client already checked the
 * action against a finalized snapshot and its own Ed25519 verification of the signed bytes; and without
 * preflight a doomed transaction lands with its error in the ledger, which reconciliation can read as a
 * chain-evidenced `failed` at finalization instead of an evidence-free `dropped` after expiry. The cost is the
 * fee of a failing transaction. `maxRetries: 0` keeps the RPC node from re-forwarding on its own as well.
 *
 * Expiry (Agave v4.1.2 runtime/src/bank.rs `get_blockhash_last_valid_block_height`, MAX_PROCESSING_AGE = 150;
 * getLatestBlockhash docs): a blockhash is usable while the block height is at most lastValidBlockHeight. A
 * signed transaction is `dropped` only when the finalized block height exceeds it, the RPC also reports the
 * blockhash invalid, its ledger history reaches back to the blockhash slot (getFirstAvailableBlock), and
 * getSignatureStatuses (searchTransactionHistory) still has no status afterwards at a context at least as new as
 * the finalized expiry block. A context-free block height alone cannot bind a cached absence to that block
 * (spec-transaction-lifecycle-journal §4 step 5).
 * Durable-nonce transactions cannot be expressed (plan.ts) and are refused on restore.
 */
import type { CoreErrorCode, TradeBinding } from '../../schemas/index.ts';
import type { BoundSolanaTrade } from './bind.ts';
import { canonicalKey, decodeBase64, fail, SolanaFailure } from './codec.ts';
import {
  parseSolanaIntent, SOLANA_INTENT_FORMAT, transitionIntent, verifyIntentForTrade, type SolanaIntentRecord,
} from './intent.ts';
import {
  admitIntent, checkedProfileId, chooseRetirementCandidate, identityForRecord, loadIntents,
  parseReservationIdentity, reservationRef, reserveIntentV2, sameReservationIdentity, storeIntent,
  storeIntentV2, UncertainWrite, type SolanaJournalPort, type SolanaReservationIdentity,
} from './journal.ts';
import { encodeBase64, MAX_TRANSACTION_BYTES } from './message.ts';
import { compilePlan, type SolanaMessagePlan } from './plan.ts';
import type { SolanaReadRpc } from './reader.ts';
import { signWithWallet, type SignedSolanaTransaction, type SolanaWalletSession } from './wallet.ts';

export const MAX_PROCESSING_AGE = 150;
/** The one sendTransaction configuration this client uses. */
export const SEND_CONFIG = Object.freeze({ encoding: 'base64', skipPreflight: true, maxRetries: 0 });
export interface SolanaClockPort { now(): number }
export interface SolanaSubmitContext {
  readonly rpc: SolanaReadRpc; readonly journal: SolanaJournalPort; readonly clock: SolanaClockPort;
  readonly random: (length: number) => Uint8Array; readonly timeoutMs: number;
  /** Highest finalized block height seen per network; a lower later answer is inconsistent. */
  readonly floors: Map<string, number>;
  /** Session guard checked before marking and again before the only broadcast. */
  readonly assertActive?: () => void;
}
export type SolanaObservation =
  | { readonly kind: 'open' }
  | { readonly kind: 'landed'; readonly slot: string; readonly err: string | null }
  | { readonly kind: 'dropped' };
export interface Stored {
  readonly record: SolanaIntentRecord; readonly revision: number;
  /** Captured at allocation/read time. A null v1 identity must never be upgraded by an update. */
  readonly identity: SolanaReservationIdentity | null;
}

/** Updates retain the caller's original identity; the v1 write port refuses a migrated journal. */
async function updateStored(
  context: SolanaSubmitContext, trade: BoundSolanaTrade, stored: Stored, next: SolanaIntentRecord,
): Promise<Stored> {
  const identity = stored.identity ?? null;
  const revision = identity === null
    ? await storeIntent(context.journal, trade, stored.revision, next)
    : await storeIntentV2(context.journal, trade, stored.revision, identity, next);
  return { record: next, revision, identity };
}

/** A fresh revision cannot promote an old reservation into a newer allocation or journal format. */
async function assertStoredCurrent(
  context: SolanaSubmitContext, trade: BoundSolanaTrade, stored: Stored,
): Promise<void> {
  context.assertActive?.();
  const loaded = await loadIntents(context.journal, trade);
  context.assertActive?.();
  const current = loaded.records.find(record => record.intentId === stored.record.intentId);
  if (!current || loaded.revision !== stored.revision || JSON.stringify(current) !== JSON.stringify(stored.record)) {
    return fail('CONFLICT');
  }
  const original = stored.identity ?? null, identity = identityForRecord(loaded, current);
  if (original === null || identity === null) {
    if (original !== identity) return fail('CONFLICT');
  } else if (!sameReservationIdentity(original, identity)) return fail('CONFLICT');
}

interface Boxed { readonly value: unknown }
type Raced = { readonly boxed: Boxed } | { readonly stop: CoreErrorCode };

/** One RPC request with a timeout; the result is boxed so no `then` of provider data is ever looked up. */
async function call(
  context: SolanaSubmitContext, method: string, params: readonly unknown[], signal?: AbortSignal,
): Promise<Boxed> {
  if (signal?.aborted) return fail('CANCELLED');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined, onAbort: (() => void) | undefined;
  const stop = new Promise<Raced>(resolve => {
    timer = setTimeout(() => { resolve({ stop: 'TIMEOUT' }); controller.abort(); }, context.timeoutMs);
    onAbort = () => { resolve({ stop: 'CANCELLED' }); controller.abort(); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
  const physical = Promise.resolve()
    .then(() => {
      // Check in the physical continuation: disposal can win after the caller schedules this microtask.
      context.assertActive?.();
      const rpc = context.rpc, request = rpc.request;
      // An injected accessor can synchronously revoke the session while exposing the callable.
      context.assertActive?.();
      return Reflect.apply(request, rpc, [{ method, params, signal: controller.signal }]);
    })
    .then((value): Raced => ({ boxed: { value } }), (): Raced => ({ stop: 'UNAVAILABLE' }));
  try {
    const raced = await Promise.race([physical, stop]);
    if ('stop' in raced) return fail(raced.stop);
    return raced.boxed;
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
}
function own(input: unknown, key: string): unknown {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail();
    const field = Object.getOwnPropertyDescriptor(input, key);
    if (!field || !('value' in field)) return fail();
    return field.value;
  } catch { return fail(); }
}
function optionalOwn(input: unknown, key: string): unknown {
  try {
    const field = Object.getOwnPropertyDescriptor(input, key);
    if (!field) return undefined;
    return 'value' in field ? field.value : fail();
  } catch { return fail(); }
}
/** Plain dense array of at most `maximum` data elements. */
function ownArray(input: unknown, maximum: number): readonly unknown[] {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return fail();
    const length = Object.getOwnPropertyDescriptor(input, 'length')?.value as unknown;
    if (typeof length !== 'number' || length > maximum || Reflect.ownKeys(input).length !== length + 1) return fail();
    return Array.from({ length }, (_, index) => {
      const field = Object.getOwnPropertyDescriptor(input, String(index));
      return field && 'value' in field ? field.value : fail();
    });
  } catch { return fail(); }
}
function safeInt(input: unknown): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0) return fail();
  return input;
}
function clockNow(context: SolanaSubmitContext): number {
  let now: unknown;
  try { now = context.clock.now(); } catch { return fail('INVALID_INPUT'); }
  if (typeof now !== 'number' || !Number.isSafeInteger(now) || now < 0) return fail('INVALID_INPUT');
  return now;
}
function newIntentId(context: SolanaSubmitContext): string {
  let bytes: unknown;
  try { bytes = context.random(32); } catch { return fail('UNAVAILABLE'); }
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32 || bytes.every(byte => byte === 0)) return fail();
  return encodeBase64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function raiseFloor(context: SolanaSubmitContext, binding: TradeBinding, height: number): void {
  const floor = context.floors.get(binding.networkId) ?? 0;
  if (height < floor) return fail('INTEGRITY_FAILURE');
  context.floors.set(binding.networkId, height);
}

const NAME = /^[A-Za-z]{1,64}$/;
/** Compact label for a TransactionError (`InstructionError:<i>:Custom:<n>`, `<Name>`, or `Unrecognized`). */
export function summarizeTransactionError(err: unknown): string {
  try {
    if (typeof err === 'string') return NAME.test(err) ? err : 'Unrecognized';
    if (typeof err !== 'object' || err === null || Array.isArray(err)) return 'Unrecognized';
    const keys = Reflect.ownKeys(err), name = keys[0];
    if (keys.length !== 1 || typeof name !== 'string' || !NAME.test(name)) return 'Unrecognized';
    if (name !== 'InstructionError') return name;
    const pair = ownArray(own(err, name), 2), index = pair[0], inner = pair[1];
    if (pair.length !== 2 || typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > 255) {
      return 'Unrecognized';
    }
    if (typeof inner === 'string') return `InstructionError:${index}:${NAME.test(inner) ? inner : 'Unrecognized'}`;
    const innerKeys = typeof inner === 'object' && inner !== null ? Reflect.ownKeys(inner) : [];
    const custom = innerKeys.length === 1 && innerKeys[0] === 'Custom' ? own(inner, 'Custom') : undefined;
    if (typeof custom === 'number' && Number.isInteger(custom) && custom >= 0 && custom <= 0xffff_ffff) {
      return `InstructionError:${index}:Custom:${custom}`;
    }
    return `InstructionError:${index}:Unrecognized`;
  } catch { return 'Unrecognized'; }
}

/**
 * Finalized blockhash for a new message. getLatestBlockhash(finalized) must agree with getBlock at its context
 * slot (same blockhash, lastValidBlockHeight = blockHeight + 150), be no older than the plan's snapshot, and the
 * genesis hash must still match the registry.
 */
export async function anchorBlockhash(
  context: SolanaSubmitContext, trade: BoundSolanaTrade, plan: SolanaMessagePlan, signal?: AbortSignal,
): Promise<{ readonly blockhash: string; readonly slot: number; readonly lastValidBlockHeight: number }> {
  const latest = (await call(context, 'getLatestBlockhash', [{ commitment: 'finalized' }], signal)).value;
  const slot = safeInt(own(own(latest, 'context'), 'slot')), value = own(latest, 'value');
  const blockhash = canonicalKey(own(value, 'blockhash')), lastValid = safeInt(own(value, 'lastValidBlockHeight'));
  if (slot < Number(plan.snapshotSlot)) return fail();
  const config = { commitment: 'finalized', transactionDetails: 'none', rewards: false };
  const block = (await call(context, 'getBlock', [slot, config], signal)).value;
  const height = safeInt(own(block, 'blockHeight'));
  if (canonicalKey(own(block, 'blockhash')) !== blockhash || height + MAX_PROCESSING_AGE !== lastValid) return fail();
  if (height < Number(plan.snapshotBlockHeight)) return fail();
  if ((await call(context, 'getGenesisHash', [], signal)).value !== trade.network.genesisHash) {
    return fail('WRONG_CHAIN');
  }
  raiseFloor(context, trade.binding, height);
  return { blockhash, slot, lastValidBlockHeight: lastValid };
}

/** Journals a `prepared` intent for a plan after the admission rule; nothing is signed yet. */
export async function prepareIntent(
  context: SolanaSubmitContext, trade: BoundSolanaTrade, plan: SolanaMessagePlan,
  replacement: string | SolanaReservationIdentity | null,
  signal?: AbortSignal,
): Promise<Stored> {
  const profile = checkedProfileId(context.journal);
  const loaded = await loadIntents(context.journal, trade, signal);
  const replacementIdentity = replacement !== null && typeof replacement !== 'string'
    ? parseReservationIdentity(replacement) : null;
  const replacementOf = replacementIdentity?.intentId ?? (replacement as string | null);
  if (loaded.version === 1 && replacementIdentity !== null ||
      loaded.version === 2 && replacement !== null && replacementIdentity === null) return fail('INVALID_INPUT');
  if (replacementIdentity !== null) {
    const predecessor = loaded.records.find(record => record.intentId === replacementIdentity.intentId);
    const actual = predecessor ? identityForRecord(loaded, predecessor) : null;
    if (actual === null || !sameReservationIdentity(actual, replacementIdentity)) return fail('CONFLICT');
  }
  const anchor = await anchorBlockhash(context, trade, plan, signal);
  const message = compilePlan(plan, anchor.blockhash), now = clockNow(context);
  const runtime = trade.deployment.runtime;
  if (runtime.kind !== 'solana-program') return fail('UNSUPPORTED_PROVIDER');
  const record = parseSolanaIntent({
    format: SOLANA_INTENT_FORMAT, intentId: newIntentId(context), binding: { ...trade.binding },
    genesisHash: trade.network.genesisHash, programId: trade.deployment.address,
    programDataSha256: runtime.programDataSha256, escrow: trade.escrow.address, action: plan.action, role: plan.role,
    feePayer: plan.feePayer, expectedEscrowState: plan.expectedEscrowState, message: encodeBase64(message),
    blockhash: anchor.blockhash, blockhashSlot: String(anchor.slot),
    lastValidBlockHeight: String(anchor.lastValidBlockHeight), signature: null, state: 'prepared',
    sendMarkedAt: null, outcome: null, replacementOf, originProfileId: profile, createdAt: now, updatedAt: now,
  });
  verifyIntentForTrade(record, trade);
  context.assertActive?.();
  if (checkedProfileId(context.journal) !== profile) return fail('LOCKED');
  if (loaded.version === 2) {
    return reserveIntentV2(context.journal, trade, loaded.revision, record,
      replacementIdentity === null ? null : reservationRef(replacementIdentity),
      chooseRetirementCandidate(loaded, profile), signal);
  }
  admitIntent(loaded.records, record);
  return { record, revision: await storeIntent(context.journal, trade, loaded.revision, record, signal), identity: null };
}

/**
 * Validity of the ORIGINAL reviewed blockhash; this never requests a replacement blockhash or edits a message.
 * Bracket the fresh finalized height and processed validity with genesis checks, and reject stale contexts.
 */
export async function recheckPreparedBlockhash(
  context: SolanaSubmitContext, trade: BoundSolanaTrade, record: SolanaIntentRecord, plan: SolanaMessagePlan,
): Promise<void> {
  if ((record.state !== 'prepared' && record.state !== 'signed') || record.sendMarkedAt !== null) {
    return fail('CONFLICT');
  }
  const genesis = async () => {
    if ((await call(context, 'getGenesisHash', [])).value !== trade.network.genesisHash) return fail('WRONG_CHAIN');
  };
  await genesis();
  const height = safeInt((await call(context, 'getBlockHeight', [{ commitment: 'finalized' }])).value);
  const originalHeight = Number(record.lastValidBlockHeight) - MAX_PROCESSING_AGE;
  if (height < originalHeight || height < Number(plan.snapshotBlockHeight) ||
      height < (context.floors.get(trade.binding.networkId) ?? 0)) return fail('INTEGRITY_FAILURE');
  if (height > Number(record.lastValidBlockHeight)) return fail('EXPIRED');
  const minimumSlot = Math.max(Number(record.blockhashSlot), Number(plan.snapshotSlot));
  const validity = (await call(context, 'isBlockhashValid', [record.blockhash,
    { commitment: 'processed', minContextSlot: minimumSlot }])).value;
  if (safeInt(own(own(validity, 'context'), 'slot')) < minimumSlot) return fail('INTEGRITY_FAILURE');
  const valid = own(validity, 'value');
  if (typeof valid !== 'boolean') return fail('INTEGRITY_FAILURE');
  await genesis();
  if (!valid) return fail('EXPIRED');
  context.assertActive?.();
  raiseFloor(context, trade.binding, height);
}

const MESSAGE_BASE64_CAP = Math.ceil(MAX_TRANSACTION_BYTES / 3) * 4;
const messageOf = (record: SolanaIntentRecord) => decodeBase64(record.message, MESSAGE_BASE64_CAP);

/** Wallet signature for a `prepared` intent of this session, then the CAS to `signed`. */
export async function signIntent(
  context: SolanaSubmitContext, trade: BoundSolanaTrade, stored: Stored, session: SolanaWalletSession,
): Promise<Stored & { readonly signed: SignedSolanaTransaction }> {
  const { record } = stored;
  if (record.state !== 'prepared' || session.address !== record.feePayer || session.role !== record.role ||
      session.tradeId !== trade.binding.tradeId) return fail('UNAUTHORIZED');
  await assertStoredCurrent(context, trade, stored);
  const result = await signWithWallet(session, messageOf(record), context.assertActive);
  if (!result.ok) return fail(result.error.code);
  // Cancellation/lock can win while the physical prompt is open. Do not persist a late signature as authority.
  context.assertActive?.();
  // transitionIntent re-parses the record, which verifies the signature over the journaled message again.
  const next = transitionIntent(record, 'signed', clockNow(context), { signature: result.value.signature });
  const updated = await updateStored(context, trade, stored, next);
  return { ...updated, signed: result.value };
}

/**
 * Writes the durable marker, then sends exactly once. If the marker write fails or its outcome is unknown,
 * nothing is sent (UNAVAILABLE; the stored record is `signed` or `sendMarked` and reconciles like any other).
 * After the marker every send outcome is recorded as `sent` or `unknown`.
 */
export async function markAndSend(
  context: SolanaSubmitContext, trade: BoundSolanaTrade, stored: Stored, signed: SignedSolanaTransaction,
): Promise<Stored> {
  const { record } = stored;
  if (record.state !== 'signed' || record.signature !== signed.signature) return fail('CONFLICT');
  context.assertActive?.();
  const marked = transitionIntent(record, 'sendMarked', clockNow(context));
  let markedStored: Stored;
  try { markedStored = await updateStored(context, trade, stored, marked); } catch (error) {
    if (error instanceof UncertainWrite) return fail('UNAVAILABLE');
    throw error;
  }
  // Disposal during the marker write prevents broadcast. The durable marker stays for reconciliation.
  context.assertActive?.();
  await assertStoredCurrent(context, trade, markedStored);
  // The marker is durable: from here on nothing may be retried, and the external abort signal is not passed on.
  let state: 'sent' | 'unknown' = 'unknown';
  try {
    const answer = (await call(context, 'sendTransaction', [encodeBase64(signed.wire), SEND_CONFIG])).value;
    if (answer === signed.signature) state = 'sent';
  } catch { state = 'unknown'; }
  let after: SolanaIntentRecord;
  try {
    after = transitionIntent(marked, state, clockNow(context));
    return await updateStored(context, trade, markedStored, after);
  } catch {
    // The marker already records "possibly sent"; reconciliation reads the chain.
    return markedStored;
  }
}

interface Status { readonly finalized: boolean; readonly slot: number; readonly err: string | null }
async function signatureStatus(
  context: SolanaSubmitContext, record: SolanaIntentRecord, signal?: AbortSignal,
  minimumSlot = Number(record.blockhashSlot),
): Promise<Status | null> {
  const params = [[record.signature], { searchTransactionHistory: true }];
  const raw = (await call(context, 'getSignatureStatuses', params, signal)).value;
  const contextSlot = safeInt(own(own(raw, 'context'), 'slot')), list = ownArray(own(raw, 'value'), 1);
  if (list.length !== 1 || contextSlot < minimumSlot) return fail();
  const entry = list[0];
  if (entry === null) return null;
  const slot = safeInt(own(entry, 'slot')), confirmations = own(entry, 'confirmations');
  const level = optionalOwn(entry, 'confirmationStatus');
  if (level !== 'processed' && level !== 'confirmed' && level !== 'finalized') return fail();
  if (confirmations !== null) safeInt(confirmations);
  // A transaction using the blockhash of slot B lands after B; finalized status means "rooted" (confirmations null).
  if (slot > contextSlot || slot <= Number(record.blockhashSlot)) return fail();
  if ((level === 'finalized') !== (confirmations === null)) return fail();
  return { finalized: level === 'finalized', slot, err: own(entry, 'err') === null ? null
    : summarizeTransactionError(own(entry, 'err')) };
}
const fromStatus = (status: Status): SolanaObservation => status.finalized
  ? { kind: 'landed', slot: String(status.slot), err: status.err } : { kind: 'open' };

interface ObservedEvidence { readonly observation: SolanaObservation; readonly height: number | null }

/** Collects evidence without mutating the network height floor before its final identity check. */
async function observeEvidence(
  context: SolanaSubmitContext, record: SolanaIntentRecord, signal?: AbortSignal,
): Promise<ObservedEvidence> {
  if (record.signature !== null) {
    const status = await signatureStatus(context, record, signal);
    if (status !== null) return { observation: fromStatus(status), height: null };
  }
  const height = safeInt((await call(context, 'getBlockHeight', [{ commitment: 'finalized' }], signal)).value);
  if (height < (context.floors.get(record.binding.networkId) ?? 0)) return fail('INTEGRITY_FAILURE');
  let evidenceHeight = height;
  const observed = (observation: SolanaObservation): ObservedEvidence => ({ observation, height: evidenceHeight });
  if (BigInt(height) <= BigInt(record.lastValidBlockHeight)) return observed({ kind: 'open' });
  // Bind expiry to one finalized block, rather than combining a fresh height with an older absent status.
  // isBlockhashValid supplies the finalized context; getBlock binds that exact slot to its block height.
  const finalized = (await call(context, 'isBlockhashValid', [record.blockhash,
    { commitment: 'finalized', minContextSlot: Number(record.blockhashSlot) }], signal)).value;
  const finalizedSlot = safeInt(own(own(finalized, 'context'), 'slot'));
  if (finalizedSlot < Number(record.blockhashSlot) || own(finalized, 'value') !== false) return fail();
  const block = (await call(context, 'getBlock', [finalizedSlot,
    { commitment: 'finalized', transactionDetails: 'none', rewards: false }], signal)).value;
  evidenceHeight = safeInt(own(block, 'blockHeight'));
  if (evidenceHeight < height || BigInt(evidenceHeight) <= BigInt(record.lastValidBlockHeight)) return fail();
  const validity = (await call(context, 'isBlockhashValid', [record.blockhash,
    { commitment: 'processed', minContextSlot: finalizedSlot }], signal)).value;
  if (safeInt(own(own(validity, 'context'), 'slot')) < finalizedSlot) return fail();
  const valid = own(validity, 'value');
  if (valid !== false) return fail();
  // A node whose ledger starts after the blockhash slot cannot show the history: the outcome stays open.
  const first = safeInt((await call(context, 'getFirstAvailableBlock', [], signal)).value);
  if (first > Number(record.blockhashSlot)) return observed({ kind: 'open' });
  if (record.signature !== null) {
    // Absence must cover the finalized expiry block even if successive requests hit different RPC caches.
    const status = await signatureStatus(context, record, signal, finalizedSlot);
    if (status !== null) return observed(fromStatus(status));
  }
  return observed({ kind: 'dropped' });
}

/**
 * Native reconciliation never sends. Genesis brackets every observation, including absence and failed statuses:
 * switching networks must not turn uncertainty into a terminal record or poison the correct network's floor.
 */
export async function observeIntent(
  context: SolanaSubmitContext, trade: BoundSolanaTrade, record: SolanaIntentRecord, signal?: AbortSignal,
): Promise<SolanaObservation> {
  const identity = async () => {
    if ((await call(context, 'getGenesisHash', [], signal)).value !== trade.network.genesisHash) fail('WRONG_CHAIN');
  };
  await identity();
  let evidence: ObservedEvidence;
  try { evidence = await observeEvidence(context, record, signal); }
  catch (error) { await identity(); throw error; }
  await identity();
  if (evidence.height !== null) raiseFloor(context, trade.binding, evidence.height);
  return evidence.observation;
}

/** CAS write of a terminal observation; an open observation changes nothing. */
export async function applyObservation(
  context: SolanaSubmitContext, trade: BoundSolanaTrade, stored: Stored, observation: SolanaObservation,
): Promise<Stored> {
  if (observation.kind === 'open') return stored;
  const now = clockNow(context);
  const next = observation.kind === 'dropped' ? transitionIntent(stored.record, 'dropped', now)
    : transitionIntent(stored.record, observation.err === null ? 'finalized' : 'failed', now,
      { outcome: { slot: observation.slot, err: observation.err } });
  return updateStored(context, trade, stored, next);
}

/** Local cancel of a never-marked intent this profile wrote. */
export async function cancelIntent(
  context: SolanaSubmitContext, trade: BoundSolanaTrade, stored: Stored,
): Promise<Stored> {
  const { record } = stored;
  if ((record.state !== 'prepared' && record.state !== 'signed') || record.sendMarkedAt !== null ||
      record.originProfileId !== checkedProfileId(context.journal)) return fail('CONFLICT');
  const next = transitionIntent(record, 'cancelled', clockNow(context));
  return updateStored(context, trade, stored, next);
}

export const isUncertainWrite = (error: unknown) => error instanceof UncertainWrite;
export const failureOf = (error: unknown): CoreErrorCode => error instanceof SolanaFailure ? error.code : 'UNAVAILABLE';
