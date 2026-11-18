/**
 * Composition entry point for the Solana escrow client (apps/web wires it; nothing here is wired yet).
 *
 *   const client = createSolanaEscrowClient({ rpc, wallet, journal, registry, clock, margins, walletChain });
 *   const trade = client.bind(binding, terms);              // G16 terms bound to one registry deployment
 *   const seller = await client.connect(trade, 'seller');   // explicit, user-triggered wallet connect
 *   await client.release(trade, seller);                    // one escrow instruction per message (C-L2)
 *   await client.reconcile(trade);                          // poll until the intent is terminal
 *   await client.payout(trade, seller);                     // only after a finalized Released/Refunded read
 *
 * Every action reads a fresh finalized snapshot, plans against it, journals `prepared`, has the wallet sign,
 * journals the signature and the durable marker, then sends once. `recover` runs at startup: it cancels this
 * profile's never-marked preparations and reconciles everything else from chain state. Nothing ever resends.
 * `margins` are required: the default policy is chosen elsewhere, never here.
 */
import { createCoreError, createOperationId, type SolanaTermsInput } from '../../domain/index.ts';
import type { CoreErrorCode, CoreResult, TradeBinding } from '../../schemas/index.ts';
import { bindSolanaTrade, isBoundSolanaTrade, type BoundSolanaTrade, type SolanaRegistryView } from './bind.ts';
import { fail, SolanaFailure } from './codec.ts';
import { isTerminal, type SolanaIntentRecord } from './intent.ts';
import { checkedProfileId, loadIntents, UncertainWrite, type SolanaJournalPort } from './journal.ts';
import {
  parseMargins, planFund, planPayout, planRefund, planRelease, readTrustedSnapshot, type FundOptions,
  type PayoutOptions, type SolanaMargins, type SolanaMessagePlan,
} from './plan.ts';
import { SolanaChainReader, type SolanaEscrowSnapshot, type SolanaReadRpc } from './reader.ts';
import type { SolanaFreezeAuthorityPermit } from './policy.ts';
import {
  applyObservation, cancelIntent, markAndSend, observeIntent, prepareIntent, signIntent, type SolanaClockPort,
  type SolanaSubmitContext, type Stored,
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
  /** Explicit user rebuild after a definitive drop: the dropped intent this one replaces. */
  readonly rebuildOf?: string;
}
export interface SolanaSubmission {
  readonly intentId: string; readonly signature: string; readonly state: SolanaIntentRecord['state'];
}
export interface SolanaEscrowClient {
  bind(binding: TradeBinding, terms: SolanaTermsInput): CoreResult<BoundSolanaTrade>;
  connect(trade: BoundSolanaTrade, role: SolanaWalletSession['role']): Promise<CoreResult<SolanaWalletSession>>;
  read(trade: BoundSolanaTrade): Promise<CoreResult<SolanaEscrowSnapshot>>;
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
  const margins = parseMargins(options.margins);
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) fail('INVALID_INPUT');
  const random = options.random ?? ((length: number) => crypto.getRandomValues(new Uint8Array(length)));
  const reader = new SolanaChainReader({ rpc: options.rpc, registry: options.registry, timeoutMs,
    now: () => options.clock.now(), freezeAuthorityPermits: options.freezeAuthorityPermits ?? [] });
  let disposed = false, sequence = 0;
  const assertActive = () => { if (disposed) fail('CANCELLED'); };
  const context: SolanaSubmitContext = { rpc: options.rpc, journal: options.journal, clock: options.clock, random,
    timeoutMs, floors: new Map(), assertActive };
  const locks = new Map<string, Promise<unknown>>();

  /** One operation per trade at a time in this instance; other tabs are fenced by the journal CAS. */
  function serialized<T>(trade: BoundSolanaTrade, work: () => Promise<T>): Promise<CoreResult<T>> {
    if (disposed) return Promise.resolve(failure('CANCELLED'));
    if (!isBoundSolanaTrade(trade)) return Promise.resolve(failure('INVALID_INPUT'));
    const key = `${trade.binding.networkId}:${trade.binding.deploymentId}:${trade.binding.tradeId}`;
    const run = (locks.get(key) ?? Promise.resolve()).then(async (): Promise<CoreResult<T>> => {
      if (disposed) return failure('CANCELLED');
      try { return { ok: true, value: await work() }; } catch (error) { return failure(codeOf(error)); }
    });
    locks.set(key, run.then(() => undefined));
    return run;
  }
  const request = () => ({ generation: 0, requestSequence: ++sequence, signal: new AbortController().signal });
  const read = async (trade: BoundSolanaTrade) => value(await readTrustedSnapshot(reader, trade, request()));

  async function cancelLocal(trade: BoundSolanaTrade, intentId: string): Promise<void> {
    try {
      const loaded = await loadIntents(options.journal, trade);
      const record = loaded.records.find(entry => entry.intentId === intentId);
      if (record && isLocalPreMarker(record, checkedProfileId(options.journal))) {
        await cancelIntent(context, trade, { record, revision: loaded.revision });
      }
    } catch { /* recover() cancels it later; nothing was sent. */ }
  }

  async function act(
    trade: BoundSolanaTrade, session: SolanaWalletSession, rebuildOf: string | undefined,
    plan: (snapshot: SolanaEscrowSnapshot) => CoreResult<SolanaMessagePlan>,
  ): Promise<SolanaSubmission> {
    if (!isWalletSession(session) || session.tradeId !== trade.binding.tradeId) return fail('UNAUTHORIZED');
    const planned = value(plan(await read(trade)));
    if (planned.role !== session.role || planned.feePayer !== session.address) return fail('UNAUTHORIZED');
    let stored: Stored = await prepareIntent(context, trade, planned, rebuildOf ?? null);
    let signed;
    try {
      assertActive();
      const result = await signIntent(context, trade, stored, session);
      stored = result; signed = result.signed;
      assertActive();
    } catch (error) {
      await cancelLocal(trade, stored.record.intentId);
      throw error;
    }
    stored = await markAndSend(context, trade, stored, signed);
    return Object.freeze({ intentId: stored.record.intentId, signature: signed.signature, state: stored.record.state });
  }

  async function reconcileAll(trade: BoundSolanaTrade): Promise<readonly SolanaIntentRecord[]> {
    const profile = checkedProfileId(options.journal);
    let loaded = await loadIntents(options.journal, trade), revision = loaded.revision;
    for (const record of loaded.records) {
      if (isTerminal(record) || isLocalPreMarker(record, profile)) continue;
      const observation = await observeIntent(context, trade, record);
      if (observation.kind === 'landed' && observation.err === null) {
        const snapshot = await read(trade);
        // Not yet visible to this finalized read: try again later. Visible but absent: the status was false.
        if (BigInt(snapshot.live.height) < BigInt(observation.slot)) continue;
        if (!effectVisible(record, snapshot)) return fail('INTEGRITY_FAILURE');
      }
      revision = (await applyObservation(context, trade, { record, revision }, observation)).revision;
    }
    loaded = await loadIntents(options.journal, trade);
    return loaded.records;
  }

  return Object.freeze({
    bind: (binding: TradeBinding, terms: SolanaTermsInput) => bindSolanaTrade(options.registry, binding, terms),
    connect: (trade: BoundSolanaTrade, role: SolanaWalletSession['role']) =>
      disposed ? Promise.resolve(failure('CANCELLED')) : connectWalletRole(options.wallet, trade, role,
        options.walletChain),
    read: (trade: BoundSolanaTrade) => serialized(trade, () => read(trade)),
    fund: (trade: BoundSolanaTrade, session: SolanaWalletSession, extra: FundOptions & RebuildOption = {}) =>
      serialized(trade, () => act(trade, session, extra.rebuildOf,
        snapshot => planFund(trade, snapshot, session.role, margins, extra))),
    release: (trade: BoundSolanaTrade, session: SolanaWalletSession, extra: RebuildOption = {}) =>
      serialized(trade, () => act(trade, session, extra.rebuildOf,
        snapshot => planRelease(trade, snapshot, session.role, margins))),
    refund: (trade: BoundSolanaTrade, session: SolanaWalletSession, extra: RebuildOption = {}) =>
      serialized(trade, () => act(trade, session, extra.rebuildOf,
        snapshot => planRefund(trade, snapshot, session.role, margins))),
    payout: (trade: BoundSolanaTrade, session: SolanaWalletSession, extra: PayoutOptions & RebuildOption = {}) =>
      serialized(trade, () => act(trade, session, extra.rebuildOf,
        snapshot => planPayout(trade, snapshot, session.role, extra))),
    reconcile: (trade: BoundSolanaTrade) => serialized(trade, () => reconcileAll(trade)),
    recover: (trade: BoundSolanaTrade) => serialized(trade, async () => {
      const profile = checkedProfileId(options.journal), loaded = await loadIntents(options.journal, trade);
      let revision = loaded.revision;
      for (const record of loaded.records) {
        if (!isLocalPreMarker(record, profile)) continue;
        revision = (await cancelIntent(context, trade, { record, revision })).revision;
      }
      return reconcileAll(trade);
    }),
    intents: (trade: BoundSolanaTrade) => serialized(trade, async () => (await loadIntents(options.journal, trade))
      .records),
    dispose: () => { if (!disposed) { disposed = true; reader.dispose(); } },
  });
}
