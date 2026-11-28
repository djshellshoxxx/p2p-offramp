/**
 * Composition entry point for the Solana escrow client; wallet, RPC and encrypted journal are injected.
 *
 *   const client = createSolanaEscrowClient({ rpc, wallet, journal, registry, clock, margins, walletChain });
 *   const trade = client.bind(binding, terms);              // G16 terms bound to one registry deployment
 *   const seller = await client.connect(trade, 'seller');   // explicit, user-triggered wallet connect
 *   const review = await client.prepare(trade, seller, 'release'); // journal exact bytes, no wallet prompt
 *   await client.confirm(review.value, seller);             // explicit review confirmation, one-shot capability
 *   await client.reconcile(trade);                          // poll until the intent is terminal
 *   await client.payout(trade, seller);                     // only after a finalized Released/Refunded read
 *
 * Every action reads a fresh finalized snapshot, plans against it, journals `prepared`, has the wallet sign,
 * journals the signature and the durable marker, then sends once. `recover` runs at startup: it cancels this
 * profile's never-marked preparations and reconciles everything else from chain state. Nothing ever resends.
 * `margins` are required: the default policy is chosen elsewhere, never here. A host MUST dispose this client
 * synchronously on wallet account/chain/disconnect changes; Wallet Standard sessions cannot observe them here.
 * A pending physical wallet prompt keeps its serial slot until it settles, even after cancellation/disposal.
 */
import { createCoreError, createOperationId, type SolanaTermsInput } from '../../domain/index.ts';
import { parseIntentId, type CoreErrorCode, type CoreResult, type TradeBinding } from '../../schemas/index.ts';
import { bindSolanaTrade, isBoundSolanaTrade, type BoundSolanaTrade, type SolanaRegistryView } from './bind.ts';
import { decimalU64, fail, SolanaFailure } from './codec.ts';
import { exactData, isTerminal, type SolanaIntentRecord } from './intent.ts';
import {
  checkedProfileId, identityForRecord, loadIntents, migrateIntents, parseReservationIdentity,
  sameReservationIdentity, supportsJournalMigration, UncertainWrite, type LoadedIntents, type SolanaJournalPort,
  type SolanaReservationIdentity,
} from './journal.ts';
import { encodeBase64 } from './message.ts';
import {
  compilePlan, parseMargins, planFund, planPayout, planRefund, planRelease, readTrustedSnapshot, type FundOptions,
  type PayoutOptions, type PlanShape, type SolanaMargins, type SolanaMessagePlan,
} from './plan.ts';
import { SolanaChainReader, type SolanaEscrowSnapshot, type SolanaReadRpc } from './reader.ts';
import type { SolanaFreezeAuthorityPermit } from './policy.ts';
import {
  applyObservation, cancelIntent, markAndSend, observeIntent, prepareIntent, recheckPreparedBlockhash, signIntent,
  type SolanaClockPort, type SolanaSubmitContext, type Stored,
} from './submit.ts';
import { connectWalletRole, isWalletSession, type SolanaWalletPort, type SolanaWalletSession } from './wallet.ts';

export interface SolanaEscrowClientOptions {
  readonly rpc: SolanaReadRpc; readonly wallet: SolanaWalletPort; readonly journal: SolanaJournalPort;
  readonly registry: SolanaRegistryView; readonly clock: SolanaClockPort; readonly margins: SolanaMargins;
  /** Wallet Standard chain id of the registry network, e.g. `solana:localnet`. */
  readonly walletChain: string;
  /** Pre-funding admission pairs; absent means no mint freeze authority is accepted for new funding. */
  readonly freezeAuthorityPermits?: readonly SolanaFreezeAuthorityPermit[];
  /** Source of intent ids; defaults to `crypto.getRandomValues`. */
  readonly random?: (length: number) => Uint8Array;
  /** Per RPC request, 1..60000 ms (default 10000). */
  readonly timeoutMs?: number;
}
export interface RebuildOption {
  /** v1 accepts a legacy id; v2 requires the complete identity from a fresh journalState view. */
  readonly rebuildOf?: string | SolanaReservationIdentity;
}
export interface SolanaSubmission {
  readonly intentId: string; readonly signature: string; readonly state: SolanaIntentRecord['state'];
}
export type PreparedSolanaActionKind = 'release' | 'refund' | 'payout';
declare const PREPARED_SOLANA_ACTION: unique symbol;
/**
 * Immutable display data plus a private, per-client capability. A copied/serialized value has no authority.
 * `message` is canonical base64 of the exact bytes to sign, including the original recent blockhash.
 */
export interface PreparedSolanaAction {
  readonly [PREPARED_SOLANA_ACTION]: true;
  readonly intentId: string; readonly action: PreparedSolanaActionKind; readonly role: SolanaWalletSession['role'];
  readonly feePayer: string; readonly binding: Readonly<TradeBinding>; readonly programId: string;
  readonly escrow: string; readonly expectedEscrowState: SolanaIntentRecord['expectedEscrowState'];
  readonly message: string; readonly blockhash: string; readonly lastValidBlockHeight: string;
  readonly shape: Readonly<PlanShape>;
}
export interface SolanaJournalState {
  readonly version: 1 | 2; readonly revision: number; readonly migrationSupported: boolean;
  readonly entries: readonly Readonly<{ readonly record: SolanaIntentRecord;
    readonly identity: SolanaReservationIdentity | null }>[];
}
declare const PREPARED_SOLANA_JOURNAL_MIGRATION: unique symbol;
/** Local, one-shot upgrade review. Copies and serialized data have no migration authority. */
export interface PreparedSolanaJournalMigration {
  readonly [PREPARED_SOLANA_JOURNAL_MIGRATION]: true;
  readonly binding: Readonly<TradeBinding>; readonly revision: number; readonly recordCount: number;
  readonly fromVersion: 1; readonly toVersion: 2; readonly requiresUpgradedReader: true;
}
export interface SolanaEscrowClient {
  bind(binding: TradeBinding, terms: SolanaTermsInput): CoreResult<BoundSolanaTrade>;
  connect(trade: BoundSolanaTrade, role: SolanaWalletSession['role']): Promise<CoreResult<SolanaWalletSession>>;
  read(trade: BoundSolanaTrade): Promise<CoreResult<SolanaEscrowSnapshot>>;
  /** Exit actions only. Persists an exact-message review; never signs or sends. */
  prepare(trade: BoundSolanaTrade, session: SolanaWalletSession, action: PreparedSolanaActionKind,
    options?: PayoutOptions & RebuildOption): Promise<CoreResult<PreparedSolanaAction>>;
  /** Consumes a review before awaiting anything. Rechecks finalized eligibility and original blockhash. */
  confirm(prepared: PreparedSolanaAction, session: SolanaWalletSession): Promise<CoreResult<SolanaSubmission>>;
  /** Revokes this client's review immediately; cancels only its own never-marked journal record. */
  cancel(prepared: PreparedSolanaAction): Promise<CoreResult<void>>;
  fund(trade: BoundSolanaTrade, session: SolanaWalletSession, options?: FundOptions & RebuildOption):
    Promise<CoreResult<SolanaSubmission>>;
  release(trade: BoundSolanaTrade, session: SolanaWalletSession, options?: RebuildOption):
    Promise<CoreResult<SolanaSubmission>>;
  refund(trade: BoundSolanaTrade, session: SolanaWalletSession, options?: RebuildOption):
    Promise<CoreResult<SolanaSubmission>>;
  payout(trade: BoundSolanaTrade, session: SolanaWalletSession, options?: PayoutOptions & RebuildOption):
    Promise<CoreResult<SolanaSubmission>>;
  /** Observes every open intent of the trade from chain state and journals terminal outcomes. */
  reconcile(trade: BoundSolanaTrade): Promise<CoreResult<readonly SolanaIntentRecord[]>>;
  /** Startup: cancels this profile's never-marked preparations, then reconciles. */
  recover(trade: BoundSolanaTrade): Promise<CoreResult<readonly SolanaIntentRecord[]>>;
  intents(trade: BoundSolanaTrade): Promise<CoreResult<readonly SolanaIntentRecord[]>>;
  /** Fresh private journal state, including full v2 references; no RPC or wallet operation. */
  journalState(trade: BoundSolanaTrade): Promise<CoreResult<SolanaJournalState>>;
  /** Explicit compatibility review only. Migration is never performed during an action or recovery. */
  prepareJournalMigration(trade: BoundSolanaTrade): Promise<CoreResult<PreparedSolanaJournalMigration>>;
  /** Consumes the exact review and migrates without retirement, wallet access or network requests. */
  confirmJournalMigration(review: PreparedSolanaJournalMigration): Promise<CoreResult<SolanaJournalState>>;
  dispose(): void;
}

const failure = (code: CoreErrorCode): CoreResult<never> =>
  ({ ok: false, error: createCoreError(code, { operationId: createOperationId(), readOnly: false }) });
const value = <T>(result: CoreResult<T>): T => result.ok ? result.value : fail(result.error.code);
const codeOf = (error: unknown): CoreErrorCode => error instanceof UncertainWrite ? 'UNAVAILABLE'
  : error instanceof SolanaFailure ? error.code : 'UNAVAILABLE';
const isLocalPreMarker = (record: SolanaIntentRecord, profile: string) =>
  (record.state === 'prepared' || record.state === 'signed') && record.sendMarkedAt === null &&
  record.originProfileId === profile;

type Planner = (snapshot: SolanaEscrowSnapshot) => CoreResult<SolanaMessagePlan>;
interface Preparation {
  readonly trade: BoundSolanaTrade; readonly session: SolanaWalletSession; readonly stored: Stored;
  readonly plan: Planner; readonly context: SolanaSubmitContext; readonly epoch: number;
  status: 'prepared' | 'confirming' | 'consumed'; revoked: boolean;
}
interface MigrationPreparation {
  readonly trade: BoundSolanaTrade; readonly revision: number; readonly profileId: string;
  readonly epoch: number; consumed: boolean;
}

function captureRebuild(input: unknown): string | SolanaReservationIdentity {
  if (typeof input === 'string') {
    try { return parseIntentId(input); } catch { return fail('INVALID_INPUT'); }
  }
  return parseReservationIdentity(input);
}

function captureRebuildOption(input: RebuildOption): string | SolanaReservationIdentity | undefined {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(input, 'rebuildOf');
    if (!descriptor) return undefined;
    if (!('value' in descriptor)) return fail('INVALID_INPUT');
    return descriptor.value === undefined ? undefined : captureRebuild(descriptor.value);
  } catch { return fail('INVALID_INPUT'); }
}

/** Capture user review options before the first await; no provider getter or later mutation can change them. */
function reviewOptions(input: PayoutOptions & RebuildOption): Readonly<PayoutOptions & RebuildOption> {
  let raw: Record<string, unknown>;
  try {
    const keys = Reflect.ownKeys(input);
    if (keys.some(key => typeof key !== 'string' ||
        !['createAta', 'maxRentTopUpLamports', 'rebuildOf'].includes(key))) return fail('INVALID_INPUT');
    raw = exactData(input, keys as string[]);
  } catch { return fail('INVALID_INPUT'); }
  const copy: { createAta?: boolean; maxRentTopUpLamports?: string;
    rebuildOf?: string | SolanaReservationIdentity } = {};
  if (raw.createAta !== undefined) {
    if (typeof raw.createAta !== 'boolean') return fail('INVALID_INPUT');
    copy.createAta = raw.createAta;
  }
  if (raw.maxRentTopUpLamports !== undefined) {
    decimalU64(raw.maxRentTopUpLamports);
    copy.maxRentTopUpLamports = raw.maxRentTopUpLamports as string;
  }
  if (raw.rebuildOf !== undefined) {
    copy.rebuildOf = captureRebuild(raw.rebuildOf);
  }
  return Object.freeze(copy);
}

/** Ignore only fields a legitimate intent transition can change; all reviewed identity/bytes stay exact. */
function samePreparation(first: SolanaIntentRecord, second: SolanaIntentRecord): boolean {
  const original = (record: SolanaIntentRecord) => ({ ...record, state: 'prepared', signature: null,
    sendMarkedAt: null, outcome: null, updatedAt: record.createdAt });
  return JSON.stringify(original(first)) === JSON.stringify(original(second));
}

/** The finalized effect a successful intent must have left (corroborates a "finalized, no error" status). */
function effectVisible(record: SolanaIntentRecord, snapshot: SolanaEscrowSnapshot): boolean {
  const escrow = snapshot.escrow;
  if (escrow === null) return false;
  if (record.action === 'fund') return true;
  if (record.action === 'release') return escrow.state === 'released';
  if (record.action === 'refund') return escrow.state === 'refunded';
  return escrow.paidOut && escrow.state === record.expectedEscrowState;
}

export function createSolanaEscrowClient(options: SolanaEscrowClientOptions): SolanaEscrowClient {
  const { rpc, wallet, journal, registry, clock, walletChain } = options;
  const margins = parseMargins(options.margins);
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) fail('INVALID_INPUT');
  const random = options.random ?? ((length: number) => crypto.getRandomValues(new Uint8Array(length)));
  const reader = new SolanaChainReader({ rpc, registry, timeoutMs,
    now: () => clock.now(), freezeAuthorityPermits: options.freezeAuthorityPermits ?? [] });
  let disposed = false, sequence = 0;
  const assertActive = () => {
    if (disposed) fail('CANCELLED');
    // A vault-backed journal revokes this capability synchronously on lock, including after a marker CAS.
    checkedProfileId(journal);
  };
  const context: SolanaSubmitContext = { rpc, journal, clock, random, timeoutMs, floors: new Map(), assertActive };
  const locks = new Map<string, Promise<unknown>>();
  const sessions = new WeakMap<object, { readonly binding: TradeBinding; readonly profileId: string }>();
  const preparations = new WeakMap<object, Preparation>();
  const migrations = new WeakMap<object, MigrationPreparation>();
  const authorityEpochs = new Map<string, number>();
  const tradeKey = (trade: BoundSolanaTrade) =>
    `${trade.binding.networkId}:${trade.binding.deploymentId}:${trade.binding.tradeId}`;
  const authorityEpoch = (trade: BoundSolanaTrade) => authorityEpochs.get(tradeKey(trade)) ?? 0;
  const revokeTradeReviews = (trade: BoundSolanaTrade) =>
    authorityEpochs.set(tradeKey(trade), authorityEpoch(trade) + 1);

  /** One operation per trade at a time in this instance; other tabs are fenced by the journal CAS. */
  function serialized<T>(trade: BoundSolanaTrade, work: () => Promise<T>): Promise<CoreResult<T>> {
    if (disposed) return Promise.resolve(failure('CANCELLED'));
    if (!isBoundSolanaTrade(trade)) return Promise.resolve(failure('INVALID_INPUT'));
    const key = tradeKey(trade);
    const run = (locks.get(key) ?? Promise.resolve()).then(async (): Promise<CoreResult<T>> => {
      if (disposed) return failure('CANCELLED');
      try { return { ok: true, value: await work() }; } catch (error) { return failure(codeOf(error)); }
    });
    locks.set(key, run.then(() => undefined));
    return run;
  }
  const request = () => ({ generation: 0, requestSequence: ++sequence, signal: new AbortController().signal });
  const read = async (trade: BoundSolanaTrade) => value(await readTrustedSnapshot(reader, trade, request()));

  function storedFrom(loaded: LoadedIntents, record: SolanaIntentRecord, revision = loaded.revision): Stored {
    return { record, revision, identity: identityForRecord(loaded, record) };
  }
  function sameStoredIdentity(first: Stored, second: Stored): boolean {
    if (first.identity === null || second.identity === null) return first.identity === second.identity;
    return sameReservationIdentity(first.identity, second.identity);
  }
  function journalView(loaded: LoadedIntents): SolanaJournalState {
    return Object.freeze({ version: loaded.version, revision: loaded.revision,
      migrationSupported: loaded.version === 1 && supportsJournalMigration(journal),
      entries: Object.freeze(loaded.records.map(record => Object.freeze({ record,
        identity: identityForRecord(loaded, record) }))) });
  }

  async function cancelLocal(trade: BoundSolanaTrade, original: Stored): Promise<void> {
    try {
      if (checkedProfileId(journal) !== original.record.originProfileId) return;
      const loaded = await loadIntents(journal, trade);
      const record = loaded.records.find(entry => entry.intentId === original.record.intentId);
      if (record && sameStoredIdentity(storedFrom(loaded, record), original) &&
          samePreparation(record, original.record) && isLocalPreMarker(record, checkedProfileId(journal))) {
        await cancelIntent(context, trade, { record, revision: loaded.revision, identity: original.identity });
      }
    } catch { /* recover() cancels it later; nothing was sent. */ }
  }

  function checkSession(trade: BoundSolanaTrade, session: SolanaWalletSession, own = false): void {
    if (!isWalletSession(session) || session.tradeId !== trade.binding.tradeId) return fail('UNAUTHORIZED');
    if (session.chain !== walletChain) return fail('WRONG_CHAIN');
    if (own) {
      const connected = sessions.get(session);
      if (!connected || connected.binding.networkId !== trade.binding.networkId ||
          connected.binding.deploymentId !== trade.binding.deploymentId ||
          connected.binding.tradeId !== trade.binding.tradeId) return fail('UNAUTHORIZED');
      if (connected.profileId !== checkedProfileId(journal)) return fail('LOCKED');
    }
  }

  async function submitPrepared(
    trade: BoundSolanaTrade, session: SolanaWalletSession, original: Stored, active: SolanaSubmitContext,
    revalidate?: (stored: Stored) => Promise<Stored>,
  ): Promise<SolanaSubmission> {
    let stored = original, signed;
    try {
      active.assertActive?.();
      if (revalidate) stored = await revalidate(stored);
      active.assertActive?.();
      const result = await signIntent(active, trade, stored, session);
      stored = result; signed = result.signed;
      active.assertActive?.();
      // The wallet may remain open past expiry or a chain-state change. Never send that late approval.
      if (revalidate) stored = await revalidate(stored);
      active.assertActive?.();
    } catch (error) {
      await cancelLocal(trade, original);
      throw error;
    }
    stored = await markAndSend(active, trade, stored, signed);
    return Object.freeze({ intentId: stored.record.intentId, signature: signed.signature, state: stored.record.state });
  }

  async function act(
    trade: BoundSolanaTrade, session: SolanaWalletSession,
    rebuildOf: string | SolanaReservationIdentity | undefined, plan: Planner,
  ): Promise<SolanaSubmission> {
    checkSession(trade, session);
    const replacement = rebuildOf === undefined ? null : captureRebuild(rebuildOf), epoch = authorityEpoch(trade);
    const planned = value(plan(await read(trade)));
    if (planned.role !== session.role || planned.feePayer !== session.address) return fail('UNAUTHORIZED');
    const stored = await prepareIntent(context, trade, planned, replacement);
    const active = { ...context, assertActive: () => {
      assertActive();
      if (authorityEpoch(trade) !== epoch) fail('CANCELLED');
      if (checkedProfileId(journal) !== stored.record.originProfileId) fail('LOCKED');
    } };
    return submitPrepared(trade, session, stored, active);
  }

  function directAction(
    trade: BoundSolanaTrade, session: SolanaWalletSession, extra: RebuildOption, plan: Planner,
  ): Promise<CoreResult<SolanaSubmission>> {
    try {
      const replacement = captureRebuildOption(extra);
      return serialized(trade, () => act(trade, session, replacement, plan));
    } catch (error) { return Promise.resolve(failure(codeOf(error))); }
  }

  async function prepareReview(
    trade: BoundSolanaTrade, session: SolanaWalletSession, action: PreparedSolanaActionKind,
    extra: Readonly<PayoutOptions & RebuildOption>,
  ): Promise<PreparedSolanaAction> {
    assertActive(); checkSession(trade, session, true);
    const profile = checkedProfileId(journal), epoch = authorityEpoch(trade);
    let preparation: Preparation | undefined;
    const active: SolanaSubmitContext = { ...context, assertActive: () => {
      assertActive();
      if (authorityEpoch(trade) !== epoch) fail('CANCELLED');
      if (checkedProfileId(journal) !== profile) fail('LOCKED');
      if (preparation?.revoked) fail('CANCELLED');
      checkSession(trade, session, true);
    } };
    const plan: Planner = snapshot => action === 'release' ? planRelease(trade, snapshot, session.role, margins)
      : action === 'refund' ? planRefund(trade, snapshot, session.role, margins)
        : planPayout(trade, snapshot, session.role, extra);
    const planned = value(plan(await read(trade)));
    active.assertActive?.();
    if (planned.role !== session.role || planned.feePayer !== session.address) return fail('UNAUTHORIZED');
    const stored = await prepareIntent(active, trade, planned, extra.rebuildOf ?? null);
    try { active.assertActive?.(); } catch (error) { await cancelLocal(trade, stored); throw error; }
    preparation = { trade, session, stored, plan, context: active, epoch, status: 'prepared', revoked: false };
    const record = stored.record;
    const view = Object.freeze({ intentId: record.intentId, action, role: record.role, feePayer: record.feePayer,
      binding: Object.freeze({ ...record.binding }), programId: record.programId, escrow: record.escrow,
      expectedEscrowState: record.expectedEscrowState, message: record.message, blockhash: record.blockhash,
      lastValidBlockHeight: record.lastValidBlockHeight, shape: Object.freeze({ ...planned.shape }),
    }) as PreparedSolanaAction;
    preparations.set(view, preparation);
    return view;
  }

  async function revalidateReview(preparation: Preparation, stored: Stored): Promise<Stored> {
    const { trade, context: active } = preparation;
    active.assertActive?.();
    const loaded = await loadIntents(journal, trade);
    active.assertActive?.();
    const record = loaded.records.find(entry => entry.intentId === stored.record.intentId);
    if (!record || !sameStoredIdentity(storedFrom(loaded, record), preparation.stored) ||
        !samePreparation(record, preparation.stored.record)) return fail('INTEGRITY_FAILURE');
    if (record.state !== stored.record.state || record.signature !== stored.record.signature ||
        !isLocalPreMarker(record, preparation.stored.record.originProfileId)) return fail('CONFLICT');
    const planned = value(preparation.plan(await read(trade)));
    active.assertActive?.();
    if (planned.role !== record.role || planned.feePayer !== record.feePayer ||
        planned.action !== record.action || planned.expectedEscrowState !== record.expectedEscrowState ||
        encodeBase64(compilePlan(planned, record.blockhash)) !== record.message) return fail('CONFLICT');
    await recheckPreparedBlockhash(active, trade, record, planned);
    active.assertActive?.();
    return { record, revision: loaded.revision, identity: preparation.stored.identity };
  }

  function confirm(
    prepared: PreparedSolanaAction, session: SolanaWalletSession,
  ): Promise<CoreResult<SolanaSubmission>> {
    const preparation = preparations.get(prepared);
    if (!preparation) return Promise.resolve(failure('UNAUTHORIZED'));
    if (preparation.status !== 'prepared' || preparation.revoked) return Promise.resolve(failure('CONFLICT'));
    // Consume before enqueueing: duplicate calls can never enter the wallet, even across pending reads.
    preparation.status = 'confirming';
    return serialized(preparation.trade, async () => {
      try {
        return await submitPrepared(preparation.trade, preparation.session, preparation.stored, preparation.context,
          stored => {
            if (session !== preparation.session) return Promise.reject(new SolanaFailure('UNAUTHORIZED'));
            return revalidateReview(preparation, stored);
          });
      } finally { preparation.status = 'consumed'; }
    });
  }

  function cancel(prepared: PreparedSolanaAction): Promise<CoreResult<void>> {
    const preparation = preparations.get(prepared);
    if (!preparation) return Promise.resolve(failure('UNAUTHORIZED'));
    if (preparation.status === 'consumed' || preparation.revoked) return Promise.resolve(failure('CONFLICT'));
    // Revocation is synchronous. Cleanup queues behind a physical signing call, rather than freeing its slot.
    preparation.revoked = true;
    return serialized(preparation.trade, async () => {
      try {
        assertActive();
        if (authorityEpoch(preparation.trade) !== preparation.epoch) return fail('CANCELLED');
        const original = preparation.stored.record;
        if (checkedProfileId(journal) !== original.originProfileId) return fail('LOCKED');
        const loaded = await loadIntents(journal, preparation.trade);
        const record = loaded.records.find(entry => entry.intentId === original.intentId);
        if (!record || !sameStoredIdentity(storedFrom(loaded, record), preparation.stored) ||
            !samePreparation(record, original)) return fail('INTEGRITY_FAILURE');
        if (checkedProfileId(journal) !== original.originProfileId) return fail('LOCKED');
        if (record.state === 'cancelled') return;
        if (!isLocalPreMarker(record, original.originProfileId)) return fail('CONFLICT');
        await cancelIntent(context, preparation.trade, { record, revision: loaded.revision,
          identity: preparation.stored.identity });
      } finally { preparation.status = 'consumed'; }
    });
  }

  async function reconcileAll(trade: BoundSolanaTrade): Promise<readonly SolanaIntentRecord[]> {
    const profile = checkedProfileId(journal);
    let loaded = await loadIntents(journal, trade), revision = loaded.revision;
    for (const record of loaded.records) {
      if (isTerminal(record) || isLocalPreMarker(record, profile)) continue;
      const observation = await observeIntent(context, trade, record);
      if (observation.kind === 'landed' && observation.err === null) {
        const snapshot = await read(trade);
        // Not yet visible to this finalized read: try again later. Visible but absent: the status was false.
        if (BigInt(snapshot.live.height) < BigInt(observation.slot)) continue;
        if (!effectVisible(record, snapshot)) return fail('INTEGRITY_FAILURE');
      }
      revision = (await applyObservation(context, trade, storedFrom(loaded, record, revision), observation)).revision;
    }
    loaded = await loadIntents(journal, trade);
    return loaded.records;
  }

  async function prepareJournalMigration(trade: BoundSolanaTrade): Promise<PreparedSolanaJournalMigration> {
    assertActive();
    if (!supportsJournalMigration(journal)) return fail('UNSUPPORTED_VERSION');
    const profileId = checkedProfileId(journal), epoch = authorityEpoch(trade);
    const loaded = await loadIntents(journal, trade);
    assertActive();
    if (checkedProfileId(journal) !== profileId) return fail('LOCKED');
    if (!supportsJournalMigration(journal)) return fail('UNSUPPORTED_VERSION');
    if (loaded.version !== 1) return fail('CONFLICT');
    if (loaded.revision > Number.MAX_SAFE_INTEGER - (loaded.records.length + 1)) return fail('LIMIT_EXCEEDED');
    const view = Object.freeze({ binding: Object.freeze({ ...trade.binding }), revision: loaded.revision,
      recordCount: loaded.records.length, fromVersion: 1, toVersion: 2, requiresUpgradedReader: true,
    }) as PreparedSolanaJournalMigration;
    migrations.set(view, { trade, revision: loaded.revision, profileId, epoch, consumed: false });
    return view;
  }

  function confirmJournalMigration(review: PreparedSolanaJournalMigration): Promise<CoreResult<SolanaJournalState>> {
    const migration = migrations.get(review);
    if (!migration) return Promise.resolve(failure('UNAUTHORIZED'));
    if (migration.consumed) return Promise.resolve(failure('CONFLICT'));
    migration.consumed = true;
    return serialized(migration.trade, async () => {
      assertActive();
      if (!supportsJournalMigration(journal)) return fail('UNSUPPORTED_VERSION');
      if (checkedProfileId(journal) !== migration.profileId) return fail('LOCKED');
      if (authorityEpoch(migration.trade) !== migration.epoch) return fail('CONFLICT');
      let loaded: LoadedIntents;
      try { loaded = await migrateIntents(journal, migration.trade, migration.revision); }
      catch (error) {
        if (error instanceof UncertainWrite ||
            ['UNAVAILABLE', 'TIMEOUT', 'CANCELLED', 'BROADCAST_UNKNOWN'].includes(codeOf(error))) {
          revokeTradeReviews(migration.trade);
        }
        throw error;
      }
      revokeTradeReviews(migration.trade);
      assertActive();
      if (checkedProfileId(journal) !== migration.profileId) return fail('LOCKED');
      return journalView(loaded);
    });
  }

  return Object.freeze({
    bind: (binding: TradeBinding, terms: SolanaTermsInput) => bindSolanaTrade(registry, binding, terms),
    connect: async (trade: BoundSolanaTrade, role: SolanaWalletSession['role']) => {
      try {
        assertActive();
        const profileId = checkedProfileId(journal);
        const result = await connectWalletRole(wallet, trade, role, walletChain);
        assertActive();
        if (checkedProfileId(journal) !== profileId) return failure('LOCKED');
        if (result.ok) sessions.set(result.value, { binding: trade.binding, profileId });
        return result;
      } catch (error) { return failure(codeOf(error)); }
    },
    read: (trade: BoundSolanaTrade) => serialized(trade, () => read(trade)),
    prepare: (trade: BoundSolanaTrade, session: SolanaWalletSession, action: PreparedSolanaActionKind,
      extra: PayoutOptions & RebuildOption = {}) => {
      try {
        if (action !== 'release' && action !== 'refund' && action !== 'payout') {
          return Promise.resolve(failure('INVALID_INPUT'));
        }
        const captured = reviewOptions(extra);
        return serialized(trade, () => prepareReview(trade, session, action, captured));
      } catch (error) { return Promise.resolve(failure(codeOf(error))); }
    },
    confirm, cancel,
    fund: (trade: BoundSolanaTrade, session: SolanaWalletSession, extra: FundOptions & RebuildOption = {}) =>
      directAction(trade, session, extra, snapshot => planFund(trade, snapshot, session.role, margins, extra)),
    release: (trade: BoundSolanaTrade, session: SolanaWalletSession, extra: RebuildOption = {}) =>
      directAction(trade, session, extra, snapshot => planRelease(trade, snapshot, session.role, margins)),
    refund: (trade: BoundSolanaTrade, session: SolanaWalletSession, extra: RebuildOption = {}) =>
      directAction(trade, session, extra, snapshot => planRefund(trade, snapshot, session.role, margins)),
    payout: (trade: BoundSolanaTrade, session: SolanaWalletSession, extra: PayoutOptions & RebuildOption = {}) =>
      directAction(trade, session, extra, snapshot => planPayout(trade, snapshot, session.role, extra)),
    reconcile: (trade: BoundSolanaTrade) => serialized(trade, () => reconcileAll(trade)),
    recover: (trade: BoundSolanaTrade) => serialized(trade, async () => {
      const profile = checkedProfileId(journal), loaded = await loadIntents(journal, trade);
      let revision = loaded.revision;
      for (const record of loaded.records) {
        if (!isLocalPreMarker(record, profile)) continue;
        revision = (await cancelIntent(context, trade, storedFrom(loaded, record, revision))).revision;
      }
      return reconcileAll(trade);
    }),
    intents: (trade: BoundSolanaTrade) => serialized(trade, async () => (await loadIntents(journal, trade))
      .records),
    journalState: (trade: BoundSolanaTrade) => serialized(trade, async () => {
      assertActive(); const loaded = await loadIntents(journal, trade); assertActive(); return journalView(loaded);
    }),
    prepareJournalMigration: (trade: BoundSolanaTrade) => serialized(trade, () => prepareJournalMigration(trade)),
    confirmJournalMigration,
    dispose: () => { if (!disposed) { disposed = true; reader.dispose(); } },
  });
}
