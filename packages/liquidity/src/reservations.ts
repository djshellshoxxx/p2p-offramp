import type { CoreResult, TradeBinding } from '../../schemas/index.ts';
import { parseTradeBinding, sameBinding } from '../../schemas/index.ts';
import { accounting, ledgerView, type AccountingReport, type Ledger, type VaultAccountingV1 } from './accounting.ts';
import { account, add, codeOf, data, decimal, diagnostic, failure, hash, id, MAX_U64, result,
  stop, subtract, success, type DiagnosticOnly } from './shared.ts';

export interface ReferenceOptions {
  readonly domainId: string; readonly maker: string; readonly assetId: string;
  readonly networkId: string; readonly deploymentId: string;
}
export interface ContextSnapshot { readonly active: boolean; readonly chainTimeSeconds: string; }
export interface ReferencePorts { readonly readContext: () => ContextSnapshot; }
/** Local fixture fields only. This is NOT the undefined signed QuoteV1 encoding. */
export interface ModelQuote {
  readonly quoteId: string; readonly maker: string; readonly taker: string;
  readonly binding: TradeBinding; readonly termsHash: string; readonly assetId: string;
  readonly principal: string; readonly fee: '0'; readonly nonce: string; readonly expiresAtSeconds: string;
}
export type SimulationOutcome = 'applied' | 'reverted' | 'unknown';
export type ReferenceCommand =
  | { readonly kind: 'deposit'; readonly actor: string; readonly amount: string; readonly received: string }
  | { readonly kind: 'donation'; readonly amount: string }
  | { readonly kind: 'reserve'; readonly actor: string; readonly quote: ModelQuote; readonly outcome: SimulationOutcome }
  | { readonly kind: 'consume'; readonly actor: string; readonly quoteId: string; readonly termsHash: string; readonly amount: string; readonly outcome: SimulationOutcome }
  | { readonly kind: 'cancel'; readonly actor: string; readonly quoteId: string }
  | { readonly kind: 'expire'; readonly quoteId: string }
  | { readonly kind: 'refund'; readonly quoteId: string; readonly returned: string }
  | { readonly kind: 'release'; readonly quoteId: string }
  | { readonly kind: 'withdraw'; readonly actor: string; readonly amount: string; readonly outcome: SimulationOutcome }
  | { readonly kind: 'observe-custody'; readonly balance: string }
  | { readonly kind: 'reorg' };
export type SimulatedReservationState = 'unreserved' | 'reserved' | 'consumed' | 'expired' | 'cancelled';
export interface ReservationView {
  readonly quote: ModelQuote; readonly simulatedState: SimulatedReservationState;
  readonly settlement: 'none' | 'released' | 'refunded';
}
export interface LiquidityView extends DiagnosticOnly {
  readonly options: ReferenceOptions; readonly revision: number; readonly ledger: VaultAccountingV1;
  readonly accounting: AccountingReport;
  readonly health: 'consistent' | 'insolvent' | 'reconciliation-required' | 'closed';
  readonly pendingSimulationAction: 'reserve' | 'consume' | 'withdraw' | 'reorg' | null;
  readonly reservations: readonly ReservationView[];
  readonly nativeReservationStatus: 'unavailable';
}
export interface UnreservedQuote extends DiagnosticOnly {
  readonly quote: ModelQuote; readonly simulatedState: 'unreserved'; readonly nativeReservationStatus: 'unavailable';
}
export interface LiquidityReference {
  apply(command: ReferenceCommand): CoreResult<LiquidityView>;
  observeQuote(quote: ModelQuote): CoreResult<UnreservedQuote>;
  view(): LiquidityView;
  close(): void;
}

// Each entry retains two independently scoped identifiers: quote id and nonce.
const MAX_RESERVATIONS = 128;
interface Entry { readonly quote: ModelQuote; readonly state: SimulatedReservationState; readonly settlement: 'none' | 'released' | 'refunded'; }
interface State {
  readonly ledger: Ledger; readonly custody: bigint; readonly revision: number;
  readonly entries: ReadonlyMap<string, Entry>; readonly pending: LiquidityView['pendingSimulationAction'];
}
type Command =
  | { readonly kind: 'deposit'; readonly actor: string; readonly amount: bigint; readonly received: bigint }
  | { readonly kind: 'donation'; readonly amount: bigint }
  | { readonly kind: 'reserve'; readonly actor: string; readonly quote: ModelQuote; readonly outcome: SimulationOutcome }
  | { readonly kind: 'consume'; readonly actor: string; readonly quoteId: string; readonly termsHash: string; readonly amount: bigint; readonly outcome: SimulationOutcome }
  | { readonly kind: 'cancel'; readonly actor: string; readonly quoteId: string }
  | { readonly kind: 'expire'; readonly quoteId: string }
  | { readonly kind: 'refund'; readonly quoteId: string; readonly returned: bigint }
  | { readonly kind: 'release'; readonly quoteId: string }
  | { readonly kind: 'withdraw'; readonly actor: string; readonly amount: bigint; readonly outcome: SimulationOutcome }
  | { readonly kind: 'observe-custody'; readonly balance: bigint }
  | { readonly kind: 'reorg' };
function outcome(input: unknown): SimulationOutcome {
  if (input !== 'applied' && input !== 'reverted' && input !== 'unknown') return stop(); return input;
}
function optionsOf(input: unknown): ReferenceOptions {
  const raw = data(input, ['domainId', 'maker', 'assetId', 'networkId', 'deploymentId']);
  return Object.freeze({ domainId: id(raw.domainId), maker: account(raw.maker), assetId: id(raw.assetId),
    networkId: id(raw.networkId), deploymentId: id(raw.deploymentId) });
}
function quoteOf(input: unknown, options: ReferenceOptions): ModelQuote {
  const raw = data(input, ['quoteId', 'maker', 'taker', 'binding', 'termsHash', 'assetId', 'principal', 'fee', 'nonce', 'expiresAtSeconds']);
  let binding: TradeBinding;
  try { binding = parseTradeBinding(raw.binding); } catch { return stop(); }
  if (binding.chain !== 'evm') return stop('WRONG_CHAIN');
  const maker = account(raw.maker), taker = account(raw.taker), assetId = id(raw.assetId);
  if (maker !== options.maker || maker === taker || assetId !== options.assetId ||
    binding.networkId !== options.networkId || binding.deploymentId !== options.deploymentId) return stop('CONFLICT');
  if (raw.fee !== '0') return stop();
  return Object.freeze({ quoteId: id(raw.quoteId), maker, taker, binding, termsHash: hash(raw.termsHash), assetId,
    principal: decimal(raw.principal, undefined, true).toString(), fee: '0', nonce: id(raw.nonce),
    expiresAtSeconds: decimal(raw.expiresAtSeconds, MAX_U64).toString() });
}
function commandOf(input: unknown, options: ReferenceOptions): Command {
  if (typeof input !== 'object' || input === null) return stop();
  const descriptor = Object.getOwnPropertyDescriptor(input, 'kind');
  if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return stop();
  const kind: unknown = descriptor.value;
  const raw = (keys: readonly string[]): Record<string, unknown> => {
    const captured = data(input, ['kind', ...keys]); if (captured.kind !== kind) return stop(); return captured;
  };
  switch (kind) {
    case 'deposit': { const x = raw(['actor', 'amount', 'received']); return { kind, actor: account(x.actor), amount: decimal(x.amount, undefined, true), received: decimal(x.received) }; }
    case 'donation': { const x = raw(['amount']); return { kind, amount: decimal(x.amount, undefined, true) }; }
    case 'reserve': { const x = raw(['actor', 'quote', 'outcome']); return { kind, actor: account(x.actor), quote: quoteOf(x.quote, options), outcome: outcome(x.outcome) }; }
    case 'consume': { const x = raw(['actor', 'quoteId', 'termsHash', 'amount', 'outcome']); return { kind, actor: account(x.actor), quoteId: id(x.quoteId), termsHash: hash(x.termsHash), amount: decimal(x.amount, undefined, true), outcome: outcome(x.outcome) }; }
    case 'cancel': { const x = raw(['actor', 'quoteId']); return { kind, actor: account(x.actor), quoteId: id(x.quoteId) }; }
    case 'expire': { const x = raw(['quoteId']); return { kind, quoteId: id(x.quoteId) }; }
    case 'refund': { const x = raw(['quoteId', 'returned']); return { kind, quoteId: id(x.quoteId), returned: decimal(x.returned, undefined, true) }; }
    case 'release': { const x = raw(['quoteId']); return { kind, quoteId: id(x.quoteId) }; }
    case 'withdraw': { const x = raw(['actor', 'amount', 'outcome']); return { kind, actor: account(x.actor), amount: decimal(x.amount, undefined, true), outcome: outcome(x.outcome) }; }
    case 'observe-custody': { const x = raw(['balance']); return { kind, balance: decimal(x.balance) }; }
    case 'reorg': raw([]); return { kind };
    default: return stop();
  }
}
function checkExpiry(quote: ModelQuote, now: bigint): void {
  const expiry = BigInt(quote.expiresAtSeconds);
  if (now >= expiry) return stop('EXPIRED'); if (expiry - now > 120n) return stop('INVALID_INPUT');
}
function cloneQuote(quote: ModelQuote): ModelQuote { return Object.freeze({ ...quote, binding: Object.freeze({ ...quote.binding }) }); }

/** All methods below are simulations; no input or return value authenticates native custody. */
export function createLiquidityReference(input: ReferenceOptions, inputPorts: ReferencePorts): CoreResult<LiquidityReference> {
  return result(() => {
    const options = optionsOf(input), ports = data(inputPorts, ['readContext']);
    if (typeof ports.readContext !== 'function') return stop();
    const readContext = ports.readContext as () => ContextSnapshot;
    let closed = false, busy = false, lastTime = -1n;
    let state: State = { ledger: { maker: options.maker, assetId: options.assetId, deposited: 0n, available: 0n,
      reserved: 0n, inEscrow: 0n, withdrawn: 0n, releasedToBuyers: 0n }, custody: 0n, revision: 0, entries: new Map(), pending: null };
    const close = (): void => { closed = true; };
    const now = (): bigint => {
      if (closed) return stop('LOCKED');
      let context: Record<string, unknown>;
      try { context = data(readContext(), ['active', 'chainTimeSeconds']); } catch { closed = true; return stop('UNAVAILABLE'); }
      if (closed || context.active !== true) { closed = true; return stop('LOCKED'); }
      let time: bigint;
      try { time = decimal(context.chainTimeSeconds, MAX_U64); } catch { closed = true; return stop('INTEGRITY_FAILURE'); }
      if (closed) return stop('LOCKED');
      if (time < lastTime) { closed = true; return stop('INTEGRITY_FAILURE'); }
      lastTime = time; return time;
    };
    const view = (): LiquidityView => {
      const report = accounting(state.ledger, state.custody);
      return diagnostic({ options: Object.freeze({ ...options }), revision: state.revision, ledger: ledgerView(state.ledger), accounting: report,
        health: closed ? 'closed' : state.pending ? 'reconciliation-required' : report.solvent && report.conservation ? 'consistent' : 'insolvent',
        pendingSimulationAction: state.pending, nativeReservationStatus: 'unavailable',
        reservations: Object.freeze([...state.entries.values()].map(entry => Object.freeze({ quote: cloneQuote(entry.quote), simulatedState: entry.state, settlement: entry.settlement }))) });
    };
    function run<T>(work: () => T): CoreResult<T> {
      if (busy) return failure('CONFLICT'); busy = true;
      try { if (closed) return failure('LOCKED'); now(); return success(work()); }
      catch (error) { return failure(codeOf(error)); } finally { busy = false; }
    }
    function transition(command: Command, time: bigint): { readonly next: State; readonly unknown: boolean } {
      if (state.pending) return stop('BROADCAST_UNKNOWN');
      if (state.revision >= Number.MAX_SAFE_INTEGER) return stop('LIMIT_EXCEEDED');
      const report = accounting(state.ledger, state.custody);
      if ((!report.conservation || !report.solvent) && ['deposit', 'reserve', 'consume'].includes(command.kind)) return stop('INTEGRITY_FAILURE');
      let ledger = state.ledger, custody = state.custody, pending: State['pending'] = null;
      const entries = new Map(state.entries);
      const makerOnly = (actor: string): void => { if (actor !== options.maker) return stop('UNAUTHORIZED'); };
      const entryOf = (quoteId: string): Entry => { const entry = entries.get(quoteId); if (!entry) return stop('CONFLICT'); return entry; };
      const reserved = (quoteId: string): Entry => { const entry = entryOf(quoteId); if (entry.state !== 'reserved' || entry.settlement !== 'none') return stop('CONFLICT'); return entry; };
      const simulatedOutcome = (value: SimulationOutcome, action: 'reserve' | 'consume' | 'withdraw'): boolean => {
        if (value === 'reverted') return stop('UNAVAILABLE'); if (value === 'unknown') { pending = action; return false; } return true;
      };
      switch (command.kind) {
        case 'deposit':
          makerOnly(command.actor); if (command.received !== command.amount) return stop('INTEGRITY_FAILURE');
          ledger = { ...ledger, deposited: add(ledger.deposited, command.amount), available: add(ledger.available, command.amount) };
          custody = add(custody, command.received); break;
        case 'donation': custody = add(custody, command.amount); break;
        case 'reserve': {
          const quote = command.quote; if (command.actor !== quote.taker) return stop('UNAUTHORIZED'); checkExpiry(quote, time);
          if (entries.has(quote.quoteId) || [...entries.values()].some(entry => entry.quote.nonce === quote.nonce)) return stop('CONFLICT');
          if (entries.size >= MAX_RESERVATIONS) return stop('LIMIT_EXCEEDED');
          const principal = BigInt(quote.principal); if (ledger.available < principal) return stop('CONFLICT');
          const applied = simulatedOutcome(command.outcome, 'reserve');
          if (applied) ledger = { ...ledger, available: subtract(ledger.available, principal), reserved: add(ledger.reserved, principal) };
          entries.set(quote.quoteId, { quote, state: applied ? 'reserved' : 'unreserved', settlement: 'none' }); break;
        }
        case 'consume': {
          const entry = reserved(command.quoteId), principal = BigInt(entry.quote.principal);
          if (command.actor !== entry.quote.taker) return stop('UNAUTHORIZED');
          if (command.termsHash !== entry.quote.termsHash || command.amount !== principal) return stop('CONFLICT');
          if (time >= BigInt(entry.quote.expiresAtSeconds)) return stop('EXPIRED');
          if ([...entries.values()].some(other => other !== entry && other.state === 'consumed' && sameBinding(other.quote.binding, entry.quote.binding))) return stop('CONFLICT');
          if (simulatedOutcome(command.outcome, 'consume')) {
            ledger = { ...ledger, reserved: subtract(ledger.reserved, principal), inEscrow: add(ledger.inEscrow, principal) };
            custody = subtract(custody, principal); entries.set(command.quoteId, { ...entry, state: 'consumed' });
          }
          break;
        }
        case 'cancel': {
          makerOnly(command.actor); const entry = reserved(command.quoteId), principal = BigInt(entry.quote.principal);
          ledger = { ...ledger, reserved: subtract(ledger.reserved, principal), available: add(ledger.available, principal) };
          entries.set(command.quoteId, { ...entry, state: 'cancelled' }); break;
        }
        case 'expire': {
          const entry = reserved(command.quoteId); if (time < BigInt(entry.quote.expiresAtSeconds)) return stop('CONFLICT');
          const principal = BigInt(entry.quote.principal);
          ledger = { ...ledger, reserved: subtract(ledger.reserved, principal), available: add(ledger.available, principal) };
          entries.set(command.quoteId, { ...entry, state: 'expired' }); break;
        }
        case 'refund': case 'release': {
          const entry = entryOf(command.quoteId); if (entry.state !== 'consumed' || entry.settlement !== 'none') return stop('CONFLICT');
          const principal = BigInt(entry.quote.principal);
          if (command.kind === 'refund') {
            if (command.returned !== principal) return stop('INTEGRITY_FAILURE');
            ledger = { ...ledger, inEscrow: subtract(ledger.inEscrow, principal), available: add(ledger.available, principal) };
            custody = add(custody, principal);
          } else ledger = { ...ledger, inEscrow: subtract(ledger.inEscrow, principal), releasedToBuyers: add(ledger.releasedToBuyers, principal) };
          entries.set(command.quoteId, { ...entry, settlement: command.kind === 'refund' ? 'refunded' : 'released' }); break;
        }
        case 'withdraw': {
          makerOnly(command.actor); if (command.amount > BigInt(report.safeAvailableWithdrawal)) return stop('CONFLICT');
          if (simulatedOutcome(command.outcome, 'withdraw')) {
            ledger = { ...ledger, available: subtract(ledger.available, command.amount), withdrawn: add(ledger.withdrawn, command.amount) };
            custody = subtract(custody, command.amount);
          }
          break;
        }
        case 'observe-custody': custody = command.balance; break;
        case 'reorg': pending = 'reorg'; break;
      }
      const next: State = { ledger: Object.freeze(ledger), custody, entries, pending, revision: state.revision + 1 };
      if (!accounting(next.ledger, custody).conservation) return stop('INTEGRITY_FAILURE');
      return { next, unknown: pending !== null };
    }
    const facade: LiquidityReference = {
      view, close,
      apply(inputCommand) {
        return run(() => {
          const command = commandOf(inputCommand, options), time = now(), prepared = transition(command, time);
          if (closed) return stop('LOCKED'); state = prepared.next;
          if (prepared.unknown) return stop('BROADCAST_UNKNOWN'); return view();
        });
      },
      observeQuote(inputQuote) {
        return run(() => {
          const quote = quoteOf(inputQuote, options), time = now(); checkExpiry(quote, time);
          if (closed) return stop('LOCKED');
          return diagnostic({ quote: cloneQuote(quote), simulatedState: 'unreserved', nativeReservationStatus: 'unavailable' });
        });
      },
    };
    return Object.freeze(facade);
  });
}
