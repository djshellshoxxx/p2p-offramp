/**
 * Read-only, finalized-only Solana boundary for the D5 basic escrow. It constructs no endpoint, connection,
 * wallet or signer, and reads provider responses only through own data descriptors.
 */
import { createCoreError, createOperationId, type SolanaTermsInput } from '../../domain/index.ts';
import type { ChainObservation, CoreErrorCode, CoreResult, TradeBinding } from '../../schemas/index.ts';
import {
  associatedTokenAddress, CLOCK_SYSVAR_ID, LOADER_V3_ID, RENT_SYSVAR_ID, SYSTEM_PROGRAM_ID, SYSVAR_OWNER_ID,
  SPL_PROGRAM_ID,
} from './address.ts';
import {
  bindTrade, deepFreeze, resolveDeployment, type BoundSolanaTrade, type SolanaDeploymentRef, type SolanaRegistryView,
} from './bind.ts';
import { canonicalKey, decodeBase64, fail, failureCode } from './codec.ts';
import {
  decodeClock, decodeEscrow, decodeMint, decodeProgramAccount, decodeProgramData, decodeTokenAccount, escrowRentMinimum,
  ESCROW_BYTES, rentExemptMinimum, TOKEN_ACCOUNT_BYTES, type EscrowAccountV1,
} from './layout.ts';
import {
  classifyTokenAccount, payoutPlanners, type NativePayoutPlan, type RecipientWalletView, type ShallowAccount,
  type SplPayoutPlan,
} from './payout.ts';
import {
  freezeAuthorityPermitted, parseFreezeAuthorityPermits, type FreezeAuthorityPermits, type SolanaFreezeAuthorityPermit,
} from './policy.ts';

export const MAX_RPC_READS = 4;
/** base64 character caps, checked before decoding (ceil(bytes / 3) * 4). */
const CAP = Object.freeze({
  program: 48, programData: 1_398_164, clock: 56, rent: 24, escrow: 296, token: 220, mint: 112,
});
/** MAX_PERMITTED_DATA_LENGTH. A recipient wallet's size comes only via its `space` field; it is never decoded. */
const MAX_ACCOUNT_BYTES = 10 * 1024 * 1024;

export interface SolanaReadRpc {
  request(input: {
    readonly method: string; readonly params?: readonly unknown[]; readonly signal?: AbortSignal;
  }): Promise<unknown>;
}
export interface SolanaReaderOptions {
  readonly rpc: SolanaReadRpc; readonly registry: SolanaRegistryView; readonly now?: () => number;
  readonly timeoutMs?: number;
  /** Admission choices before funding: exact mint/authority pairs. Existing escrow exits remain available. */
  readonly freezeAuthorityPermits?: readonly SolanaFreezeAuthorityPermit[];
}
export interface SolanaReadRequest {
  readonly generation: number; readonly requestSequence: number; readonly signal: AbortSignal;
}
export interface SolanaLiveAnchor {
  readonly height: string; readonly hash: string; readonly blockHeight: string; readonly timestampSeconds: string;
  readonly programDataSha256: string;
}
export type NativeCustody = {
  readonly kind: 'native'; readonly lamports: string; readonly principalHeld: string;
  readonly rentExemptMinimum: string | null;
  readonly surplus: string | null; readonly payoutBlockedBy: readonly ('rent-shortfall' | 'rent-unknown')[];
};
/**
 * A frozen vault does not stop the state-only `release` or `refund`; it blocks only the payout, until the mint's
 * freeze authority thaws it. `payoutBlockedBy` lists it while a payout is still to happen.
 */
export type SplCustody = {
  readonly kind: 'spl'; readonly vault: string; readonly vaultAmount: string; readonly principalHeld: string;
  readonly surplus: string; readonly vaultFrozen: boolean; readonly mintDecimals: number;
  readonly mintFreezeAuthority: string | null; readonly payoutBlockedBy: readonly 'vault-frozen'[];
};
/** The SPL mint at slot S, also when no escrow exists yet, so the UI can warn about a freeze authority. */
export interface SolanaMintView {
  readonly address: string; readonly decimals: number; readonly freezeAuthority: string | null;
}
export interface SolanaEscrowSnapshot {
  readonly observation: ChainObservation; readonly live: SolanaLiveAnchor; readonly escrowAddress: string;
  readonly occupant: 'none' | 'system-prefunded' | 'escrow'; readonly escrow: EscrowAccountV1 | null;
  readonly payout: 'not-applicable' | 'pending' | 'complete'; readonly custody: NativeCustody | SplCustody | null;
  readonly mint: SolanaMintView | null;
}
export type SolanaPayoutPlan = SplPayoutPlan | NativePayoutPlan;
/**
 * Payout plans from the same read as `snapshot` (one slot S). `buyer` is the payout after a release and `seller`
 * the payout after a refund; both are null once paid out. `pending` is the stored recipient's plan while the
 * escrow is Released or Refunded and unpaid, else null.
 */
export interface SolanaPayoutReadiness {
  readonly snapshot: SolanaEscrowSnapshot; readonly buyer: SolanaPayoutPlan | null;
  readonly seller: SolanaPayoutPlan | null; readonly pending: SolanaPayoutPlan | null;
}

/** A provider result boxed by the reader, so no promise is ever resolved with (and no `then` read on) it. */
interface Boxed { readonly value: unknown }
interface Context {
  readonly signal: AbortSignal; guard(): void; call(method: string, params: readonly unknown[]): Promise<Boxed>;
}
interface Account {
  readonly owner: string; readonly executable: boolean; readonly data: Uint8Array; readonly entry: object;
}
interface Classified {
  readonly occupant: SolanaEscrowSnapshot['occupant']; readonly escrow: EscrowAccountV1 | null;
  readonly entry: object | null;
}

function own(input: unknown, key: string): unknown {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return fail();
    const field = Object.getOwnPropertyDescriptor(input, key);
    if (!field || !('value' in field)) return fail();
    return field.value;
  } catch { return fail(); }
}
function optionalOwn(input: object, key: string): unknown {
  try {
    const field = Object.getOwnPropertyDescriptor(input, key);
    if (!field) return undefined;
    if (!('value' in field)) return fail();
    return field.value;
  } catch { return fail(); }
}
/** Dense plain array of at most `maximum` data elements, copied without invoking accessors. */
function ownArray(input: unknown, maximum: number): readonly unknown[] {
  try {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return fail();
    const lengthField = Object.getOwnPropertyDescriptor(input, 'length');
    const length: unknown = lengthField && 'value' in lengthField ? lengthField.value : undefined;
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length > maximum) return fail();
    if (Reflect.ownKeys(input).length !== length + 1) return fail();
    const copy: unknown[] = [];
    for (let index = 0; index < length; index++) {
      const field = Object.getOwnPropertyDescriptor(input, String(index));
      if (!field || !('value' in field)) return fail();
      copy.push(field.value);
    }
    return copy;
  } catch { return fail(); }
}
function safeInt(input: unknown, code: CoreErrorCode = 'INTEGRITY_FAILURE'): number {
  if (typeof input !== 'number' || !Number.isSafeInteger(input) || input < 0) return fail(code);
  return input;
}

/** `data` must be exactly [string, 'base64'], capped before decoding; `space`, if present, equals the length. */
function readAccount(entry: unknown, cap: number): Account | null {
  if (entry === null) return null;
  if (typeof entry !== 'object') return fail();
  const owner = canonicalKey(own(entry, 'owner')), executable = own(entry, 'executable');
  if (typeof executable !== 'boolean') return fail();
  const tuple = ownArray(own(entry, 'data'), 2);
  if (tuple.length !== 2 || tuple[1] !== 'base64') return fail();
  const data = decodeBase64(tuple[0], cap);
  const space = optionalOwn(entry, 'space');
  if (space !== undefined && space !== data.length) return fail();
  return { owner, executable, data, entry };
}
function present(entry: unknown, cap: number, owner: string, executable = false): Account {
  const account = readAccount(entry, cap);
  if (account === null || account.owner !== owner || account.executable !== executable) return fail();
  return account;
}
/** An uninitialized system account: a pre-init lamport donation leaves exactly this behind. */
const isSystemEmpty = (account: Account) =>
  account.owner === SYSTEM_PROGRAM_ID && account.data.length === 0 && !account.executable;

/** Program, ProgramData and Clock identity at slot S (accounts 0..2). */
type Identity = Pick<SolanaLiveAnchor, 'timestampSeconds' | 'programDataSha256'>;
interface Checked { readonly identity: Identity; readonly deploySlot: bigint }
interface Anchored extends Checked { readonly slot: number; readonly accounts: readonly unknown[] }
/** Re-run on every read: nothing about identity is cached that could let a later read skip a check. */
function checkIdentity(ref: SolanaDeploymentRef, accounts: readonly unknown[], slot: number): Checked {
  const program = present(accounts[0], CAP.program, LOADER_V3_ID, true);
  if (decodeProgramAccount(program.data) !== ref.programDataAddress) return fail();
  const programData = decodeProgramData(present(accounts[1], CAP.programData, LOADER_V3_ID).data);
  const runtime = ref.deployment.runtime;
  if (programData.deploySlot > BigInt(slot) || runtime.kind !== 'solana-program') return fail();
  if (programData.sha256 !== runtime.programDataSha256) return fail();
  const clock = decodeClock(present(accounts[2], CAP.clock, SYSVAR_OWNER_ID).data);
  if (clock.slot !== BigInt(slot) || clock.unixTimestamp < 0n) return fail();
  return {
    identity: { timestampSeconds: clock.unixTimestamp.toString(), programDataSha256: programData.sha256 },
    deploySlot: programData.deploySlot,
  };
}

interface Block { readonly hash: string; readonly height: number; readonly parent: number }
function block(input: unknown, slot: number): Block {
  if (input === null) return fail();
  const hash = canonicalKey(own(input, 'blockhash')), height = safeInt(own(input, 'blockHeight'));
  const parent = safeInt(own(input, 'parentSlot'));
  if (height > slot || !(parent < slot || (slot === 0 && parent === 0))) return fail();
  return { hash, height, parent };
}

/** Index 3: absent, a pre-init System donation, or a program-owned EscrowV1 bound to these exact terms. */
function classifyEscrow(trade: BoundSolanaTrade, entry: unknown): Classified {
  const account = readAccount(entry, CAP.escrow);
  if (account === null) return { occupant: 'none', escrow: null, entry: null };
  if (isSystemEmpty(account)) return { occupant: 'system-prefunded', escrow: null, entry: null };
  if (account.owner !== trade.deployment.address || account.executable) return fail();
  if (account.data.length !== ESCROW_BYTES) return fail();
  const escrow = decodeEscrow(account.data), terms = trade.terms;
  const seat = escrow.seller === terms.seller && escrow.sellerNonce === terms.sellerNonce;
  if (!seat || escrow.escrowBump !== trade.escrow.bump) return fail();
  // Same seller and nonce but other terms: the PDA was consumed by a different trade.
  if (escrow.termsHash !== trade.termsHash) return fail('CONFLICT');
  if (escrow.buyer !== terms.buyer || escrow.assetKind !== terms.assetKind || escrow.mint !== terms.mint ||
      escrow.tokenProgram !== terms.tokenProgram || escrow.amountBaseUnits !== terms.amountBaseUnits ||
      escrow.deadlineSeconds !== terms.escrowExpirySeconds) return fail();
  if (escrow.vaultBump !== (trade.vault?.bump ?? 0)) return fail();
  return { occupant: 'escrow', escrow, entry: account.entry };
}

/** Native principal stays in the escrow PDA beside its rent reserve and any donated surplus. */
function nativeCustody(escrow: EscrowAccountV1, entry: object, minimum: bigint | null): NativeCustody {
  const lamports = BigInt(safeInt(own(entry, 'lamports')));
  const principal = escrow.paidOut ? 0n : BigInt(escrow.amountBaseUnits);
  if (!escrow.paidOut && lamports <= principal) return fail();
  const blockedBy: ('rent-shortfall' | 'rent-unknown')[] = [];
  // Spec: an unknown rent minimum is always reported; a shortfall only while a payout is still to happen.
  if (minimum === null) blockedBy.push('rent-unknown');
  if (!escrow.paidOut && minimum !== null && lamports - principal < minimum) blockedBy.push('rent-shortfall');
  const spare = minimum === null ? null : lamports - principal - minimum;
  return {
    kind: 'native', lamports: lamports.toString(), principalHeld: principal.toString(),
    rentExemptMinimum: minimum === null ? null : minimum.toString(),
    surplus: spare === null ? null : (spare > 0n ? spare : 0n).toString(), payoutBlockedBy: blockedBy,
  };
}

/**
 * The mint is checked even when no escrow exists (the state in which the app decides to fund): SPL Token owner,
 * registry decimals, then the pre-funding freeze-authority policy. Existing validated escrows retain their exits.
 * A changed admission permit never vetoes release/refund or an otherwise executable payout after funding.
 */
function splMint(
  trade: BoundSolanaTrade, mintEntry: unknown, permits: FreezeAuthorityPermits, existing: EscrowAccountV1 | null,
): SolanaMintView {
  const mint = decodeMint(present(mintEntry, CAP.mint, SPL_PROGRAM_ID).data), address = trade.terms.mint!;
  if (mint.decimals !== trade.asset.decimals) return fail();
  if (existing === null && !freezeAuthorityPermitted(permits, address, mint.freezeAuthority)) {
    return fail('UNSUPPORTED_PROVIDER');
  }
  return { address, decimals: mint.decimals, freezeAuthority: mint.freezeAuthority };
}

/** SPL principal sits in the vault PDA token account. */
function splCustody(
  trade: BoundSolanaTrade, classified: Classified, vaultEntry: unknown, mint: SolanaMintView,
): SplCustody | null {
  const escrow = classified.escrow, vaultAddress = trade.vault!.address;
  if (escrow === null) {
    const vault = readAccount(vaultEntry, CAP.token);
    if (vault !== null && !isSystemEmpty(vault)) return fail();
    return null;
  }
  const vault = decodeTokenAccount(present(vaultEntry, CAP.token, SPL_PROGRAM_ID).data);
  const principal = escrow.paidOut ? 0n : BigInt(escrow.amountBaseUnits);
  if (vault.mint !== escrow.mint || vault.owner !== trade.escrow.address || vault.amount < principal) return fail();
  // Like a rent shortfall, a frozen vault is a blocker only while a payout is still to happen.
  const blockedBy: 'vault-frozen'[] = vault.frozen && !escrow.paidOut ? ['vault-frozen'] : [];
  return {
    kind: 'spl', vault: vaultAddress, vaultAmount: vault.amount.toString(), principalHeld: principal.toString(),
    surplus: (vault.amount - principal).toString(), vaultFrozen: vault.frozen, mintDecimals: mint.decimals,
    mintFreezeAuthority: mint.freezeAuthority, payoutBlockedBy: blockedBy,
  };
}

/**
 * A payout recipient may be any account (a native buyer can be a data account of any size), so only its
 * metadata is read: `space` is required, the base64 length (with its padding) must encode exactly that many
 * bytes, and only a 165-byte SPL Token account is decoded.
 */
function shallowAccount(entry: unknown): ShallowAccount | null {
  if (entry === null) return null;
  if (typeof entry !== 'object') return fail();
  const owner = canonicalKey(own(entry, 'owner')), executable = own(entry, 'executable');
  const lamports = own(entry, 'lamports'), space = safeInt(own(entry, 'space'));
  if (typeof executable !== 'boolean' || typeof lamports !== 'number' || !Number.isInteger(lamports) || lamports < 0) {
    return fail();
  }
  const tuple = ownArray(own(entry, 'data'), 2), encoded = tuple[0];
  if (tuple.length !== 2 || tuple[1] !== 'base64' || typeof encoded !== 'string') return fail();
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  if (space > MAX_ACCOUNT_BYTES || encoded.length % 4 !== 0 || encoded.length / 4 * 3 - padding !== space) {
    return fail();
  }
  const token = owner === SPL_PROGRAM_ID && !executable && space === TOKEN_ACCOUNT_BYTES;
  return {
    owner, executable, lamports: Math.min(lamports, Number.MAX_SAFE_INTEGER), dataLength: space,
    data: token ? decodeBase64(encoded, CAP.token) : null,
  };
}
function walletView(entry: unknown, rent: Uint8Array): RecipientWalletView {
  const account = shallowAccount(entry), dataLength = account?.dataLength ?? 0;
  const minimum = rentExemptMinimum(rent, dataLength);
  return {
    lamports: String(account?.lamports ?? 0), dataLength, executable: account?.executable ?? false,
    rentExemptMinimum: minimum === null ? null : minimum.toString(),
  };
}

/** Extra keys for `readPayout`, after the snapshot keys: both parties' payout destinations at the same slot. */
function payoutKeys(trade: BoundSolanaTrade): readonly string[] {
  const { buyer, seller, mint } = trade.terms;
  if (mint === null) return [buyer, seller];
  return [RENT_SYSVAR_ID, associatedTokenAddress(buyer, mint).address, associatedTokenAddress(seller, mint).address];
}
function payoutPlans(
  trade: BoundSolanaTrade, snapshot: SolanaEscrowSnapshot, accounts: readonly unknown[],
): Omit<SolanaPayoutReadiness, 'snapshot'> {
  const escrow = snapshot.escrow, blockedBy = snapshot.custody?.payoutBlockedBy ?? [];
  if (escrow?.paidOut) return { buyer: null, seller: null, pending: null };
  const { buyer: buyerKey, seller: sellerKey, mint } = trade.terms;
  let buyer: SolanaPayoutPlan, seller: SolanaPayoutPlan;
  if (mint === null) {
    const rent = present(accounts[4], CAP.rent, SYSVAR_OWNER_ID).data;
    const principal = BigInt(escrow?.amountBaseUnits ?? trade.terms.amountBaseUnits);
    buyer = payoutPlanners.native(buyerKey, principal, walletView(accounts[5], rent), blockedBy);
    seller = payoutPlanners.native(sellerKey, principal, walletView(accounts[6], rent), blockedBy);
  } else {
    const ataRent = rentExemptMinimum(present(accounts[6], CAP.rent, SYSVAR_OWNER_ID).data, TOKEN_ACCOUNT_BYTES);
    const rentLamports = ataRent === null ? null : ataRent.toString();
    const plan = (recipient: string, index: number) => payoutPlanners.spl(recipient, mint,
      associatedTokenAddress(recipient, mint).address, classifyTokenAccount(shallowAccount(accounts[index])),
      blockedBy, rentLamports);
    buyer = plan(buyerKey, 7); seller = plan(sellerKey, 8);
  }
  const pending = escrow?.state === 'released' ? buyer : escrow?.state === 'refunded' ? seller : null;
  return { buyer, seller, pending };
}

function payoutOf(escrow: EscrowAccountV1 | null): SolanaEscrowSnapshot['payout'] {
  if (escrow === null || escrow.state === 'funded') return 'not-applicable';
  return escrow.paidOut ? 'complete' : 'pending';
}
function counter(value: unknown): number { return safeInt(value, 'INVALID_INPUT'); }
/** A request counter; a getter that throws is the caller's fault (INVALID_INPUT), not a provider failure. */
function requestCounter(read: () => unknown): number {
  let value: unknown;
  try { value = read(); } catch { return fail('INVALID_INPUT'); }
  return counter(value);
}

/** Only snapshots produced by `read()` carry the brand; the settlement planner refuses copies. */
const SNAPSHOTS = new WeakSet<object>();
export const isSolanaEscrowSnapshot = (value: unknown): value is SolanaEscrowSnapshot =>
  typeof value === 'object' && value !== null && SNAPSHOTS.has(value);

export class SolanaChainReader {
  readonly #options: SolanaReaderOptions;
  readonly #timeoutMs: number;
  #disposed = false;
  readonly #jobs = new Set<AbortController>();
  /** Highest finalized slot accepted per network; later reads must not observe an older context. */
  readonly #floors = new Map<string, number>();
  /**
   * ProgramData deploy slot first confirmed per network and program. With no upgrade authority the ProgramData
   * can never be rewritten, so a later read showing another deploy slot is inconsistent and fails. This only
   * adds a refusal; every read still re-checks the whole identity.
   */
  readonly #deploySlots = new Map<string, bigint>();
  readonly #permits: FreezeAuthorityPermits;
  constructor(options: SolanaReaderOptions) {
    this.#options = options;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs < 1 || this.#timeoutMs > 60_000) {
      throw new Error('Invalid Solana reader timeout.');
    }
    this.#permits = parseFreezeAuthorityPermits(options.freezeAuthorityPermits);
  }

  /** Same job discipline as the EVM reader: a slot is freed only when the physical work settles. */
  #run<T>(signalOf: () => unknown, work: (context: Context) => Promise<T>): Promise<CoreResult<T>> {
    const operationId = createOperationId();
    const failure = (code: CoreErrorCode): CoreResult<never> =>
      ({ ok: false, error: createCoreError(code, { operationId, readOnly: true }) });
    if (this.#disposed) return Promise.resolve(failure('CANCELLED'));
    // The caller's signal is read and checked before a job slot is reserved: a value that is not an AbortSignal,
    // or a request whose `signal` cannot be read, is INVALID_INPUT. The slot is taken before addEventListener
    // (caller code that may re-enter the reader) and given back if it throws, so the limit holds and no slot leaks.
    const invalid = () => Promise.resolve(failure('INVALID_INPUT'));
    let external: AbortSignal | undefined, aborted: boolean;
    try {
      const value = signalOf();
      if (value !== undefined && !(value instanceof AbortSignal)) return invalid();
      external = value;
      aborted = external?.aborted === true;
    } catch { return invalid(); }
    if (aborted) return Promise.resolve(failure('CANCELLED'));
    if (this.#jobs.size >= MAX_RPC_READS) return Promise.resolve(failure('LIMIT_EXCEEDED'));
    const controller = new AbortController();
    const onExternal = () => controller.abort();
    const detach = () => { try { external?.removeEventListener('abort', onExternal); } catch { /* caller-owned */ } };
    this.#jobs.add(controller);
    // A caller addEventListener may register the listener and then throw, so the refusal detaches it too.
    try { external?.addEventListener('abort', onExternal, { once: true }); } catch {
      detach(); this.#jobs.delete(controller); return invalid();
    }
    let abortCode: CoreErrorCode = 'CANCELLED';
    const timer = setTimeout(() => { abortCode = 'TIMEOUT'; controller.abort(); }, this.#timeoutMs);
    const guard = () => { if (this.#disposed || controller.signal.aborted) fail(abortCode); };
    const context: Context = {
      signal: controller.signal, guard,
      call: async (method, params) => {
        guard();
        let boxed: Boxed;
        // Transport failures and JSON-RPC errors alike become UNAVAILABLE; nothing from them is kept. The value is
        // boxed inside the try: returning it bare from this async arrow would look up and call its `then`.
        try {
          boxed = { value: await this.#options.rpc.request({ method, params, signal: controller.signal }) };
        } catch { guard(); return fail('UNAVAILABLE'); }
        guard(); return boxed;
      },
    };
    let onAbort!: () => void;
    const cancelled = new Promise<CoreResult<T>>(resolve => {
      onAbort = () => resolve(failure(abortCode)); controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const physical = Promise.resolve().then(() => { guard(); return work(context); })
      .then(value => { guard(); return { ok: true as const, value }; })
      .catch((error: unknown) => failure(failureCode(error, 'UNAVAILABLE')))
      .finally(() => {
        this.#jobs.delete(controller); clearTimeout(timer); detach();
      });
    return Promise.race([physical, cancelled]).finally(() => {
      controller.signal.removeEventListener('abort', onAbort); detach();
    });
  }

  /** Steps 1-2 plus identity: genesis, one finalized getMultipleAccounts at slot S >= floor. */
  async #anchor(ref: SolanaDeploymentRef, extraKeys: readonly string[], context: Context): Promise<Anchored> {
    const genesis = (await context.call('getGenesisHash', [])).value;
    if (genesis !== ref.network.genesisHash) return fail('WRONG_CHAIN');
    const floor = this.#floors.get(ref.network.id);
    const config = floor === undefined ? { commitment: 'finalized', encoding: 'base64' }
      : { commitment: 'finalized', encoding: 'base64', minContextSlot: floor };
    const keys = [ref.deployment.address, ref.programDataAddress, CLOCK_SYSVAR_ID, ...extraKeys];
    const response = (await context.call('getMultipleAccounts', [keys, config])).value;
    const slot = safeInt(own(own(response, 'context'), 'slot'));
    if (floor !== undefined && slot < floor) return fail();
    const accounts = ownArray(own(response, 'value'), keys.length);
    if (accounts.length !== keys.length) return fail();
    return { slot, accounts, ...checkIdentity(ref, accounts, slot) };
  }

  /** Steps 3-5: the block at S twice, then the genesis again; only then is the floor raised. */
  async #confirm(ref: SolanaDeploymentRef, anchored: Anchored, context: Context): Promise<SolanaLiveAnchor> {
    const params = [anchored.slot, { commitment: 'finalized', transactionDetails: 'none', rewards: false }];
    const first = block((await context.call('getBlock', params)).value, anchored.slot);
    const second = block((await context.call('getBlock', params)).value, anchored.slot);
    if (first.hash !== second.hash || first.height !== second.height || first.parent !== second.parent) return fail();
    if ((await context.call('getGenesisHash', [])).value !== ref.network.genesisHash) return fail();
    context.guard();
    const program = `${ref.network.id}:${ref.deployment.address}`, pinned = this.#deploySlots.get(program);
    if (pinned !== undefined && pinned !== anchored.deploySlot) return fail();
    this.#deploySlots.set(program, anchored.deploySlot);
    this.#floors.set(ref.network.id, Math.max(this.#floors.get(ref.network.id) ?? 0, anchored.slot));
    return { height: String(anchored.slot), hash: first.hash, blockHeight: String(first.height), ...anchored.identity };
  }

  validateLive(networkId: string, deploymentId: string, signal?: AbortSignal): Promise<CoreResult<SolanaLiveAnchor>> {
    return this.#run(() => signal, async context => {
      const ref = resolveDeployment(this.#options.registry, networkId, deploymentId);
      return deepFreeze(await this.#confirm(ref, await this.#anchor(ref, [], context), context));
    });
  }

  /** One anchored read; `payout` appends both parties' payout destinations to the same getMultipleAccounts. */
  async #observe(
    binding: TradeBinding, request: SolanaReadRequest, terms: SolanaTermsInput, context: Context, payout: boolean,
  ): Promise<{ readonly trade: BoundSolanaTrade; readonly snapshot: SolanaEscrowSnapshot;
    readonly accounts: readonly unknown[]; }> {
    const generation = requestCounter(() => request.generation);
    const requestSequence = requestCounter(() => request.requestSequence);
    const trade = bindTrade(this.#options.registry, binding, terms);
    const native = trade.terms.assetKind === 'native';
    const extra = native ? [trade.escrow.address, RENT_SYSVAR_ID]
      : [trade.escrow.address, trade.vault!.address, trade.terms.mint!];
    const anchored = await this.#anchor(trade, payout ? [...extra, ...payoutKeys(trade)] : extra, context);
    const classified = classifyEscrow(trade, anchored.accounts[3]);
    let custody: NativeCustody | SplCustody | null, mint: SolanaMintView | null = null;
    if (native) {
      const minimum = escrowRentMinimum(present(anchored.accounts[4], CAP.rent, SYSVAR_OWNER_ID).data);
      custody = classified.escrow === null ? null : nativeCustody(classified.escrow, classified.entry!, minimum);
    } else {
      mint = splMint(trade, anchored.accounts[5], this.#permits, classified.escrow);
      custody = splCustody(trade, classified, anchored.accounts[4], mint);
    }
    const live = await this.#confirm(trade, anchored, context);
    const observedAt = counter((this.#options.now ?? Date.now)());
    const observation: ChainObservation = {
      binding: trade.binding, generation, requestSequence, anchor: { height: live.height, hash: live.hash },
      state: classified.escrow?.state ?? 'absent', finality: 'finalized', observedAt,
    };
    const snapshot: SolanaEscrowSnapshot = {
      observation, live, escrowAddress: trade.escrow.address, occupant: classified.occupant,
      escrow: classified.escrow, payout: payoutOf(classified.escrow), custody, mint,
    };
    return { trade, snapshot, accounts: anchored.accounts };
  }

  read(
    binding: TradeBinding, request: SolanaReadRequest, terms: SolanaTermsInput,
  ): Promise<CoreResult<SolanaEscrowSnapshot>> {
    return this.#run(() => request.signal, async context => {
      const snapshot = deepFreeze((await this.#observe(binding, request, terms, context, false)).snapshot);
      SNAPSHOTS.add(snapshot);
      return snapshot;
    });
  }

  /**
   * The snapshot plus payout plans, all at slot S: 2 more keys for native (buyer, seller wallets), 3 for SPL
   * (Rent sysvar, buyer and seller canonical ATAs). The plans are advisory; the program enforces the rules.
   */
  readPayout(
    binding: TradeBinding, request: SolanaReadRequest, terms: SolanaTermsInput,
  ): Promise<CoreResult<SolanaPayoutReadiness>> {
    return this.#run(() => request.signal, async context => {
      const { trade, snapshot, accounts } = await this.#observe(binding, request, terms, context, true);
      const result = deepFreeze({ snapshot, ...payoutPlans(trade, snapshot, accounts) });
      SNAPSHOTS.add(snapshot);
      return result;
    });
  }

  /**
   * G08 port: the ChainObservation alone. A frozen SPL vault is reported like any other funded trade (review
   * C-L3): `release` and `refund` are state-only and still succeed, and only the payout waits for a thaw. The
   * flag is `read(…).custody.vaultFrozen` and `payoutBlockedBy` (`'vault-frozen'`); readPayout plans with it.
   */
  async readValidated(
    binding: TradeBinding, request: SolanaReadRequest, terms: SolanaTermsInput,
  ): Promise<CoreResult<ChainObservation>> {
    const result = await this.read(binding, request, terms);
    return result.ok ? { ok: true, value: result.value.observation } : result;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const controller of this.#jobs) controller.abort();
  }
}

/** True when a later snapshot is older than an earlier one or un-does a completed payout. */
export function payoutRegressed(previous: SolanaEscrowSnapshot, next: SolanaEscrowSnapshot): boolean {
  if (BigInt(next.observation.anchor.height) < BigInt(previous.observation.anchor.height)) return true;
  return previous.escrow?.paidOut === true && next.escrow?.paidOut !== true;
}
