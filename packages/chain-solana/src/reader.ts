/**
 * Read-only, finalized-only Solana boundary for the D5 basic escrow. It constructs no endpoint, connection,
 * wallet or signer, and reads provider responses only through own data descriptors.
 */
import { createCoreError, createOperationId, type SolanaTermsInput } from '../../domain/index.ts';
import type { ChainObservation, CoreErrorCode, CoreResult, TradeBinding } from '../../schemas/index.ts';
import {
  CLOCK_SYSVAR_ID, LOADER_V3_ID, RENT_SYSVAR_ID, SYSTEM_PROGRAM_ID, SYSVAR_OWNER_ID, TOKEN_PROGRAM_ID,
} from './address.ts';
import {
  bindTrade, deepFreeze, resolveDeployment, type BoundSolanaTrade, type SolanaDeploymentRef, type SolanaRegistryView,
} from './bind.ts';
import { canonicalKey, decodeBase64, fail, failureCode } from './codec.ts';
import {
  decodeClock, decodeEscrow, decodeMint, decodeProgramAccount, decodeProgramData, decodeTokenAccount, escrowRentMinimum,
  ESCROW_BYTES, type EscrowAccountV1,
} from './layout.ts';

export const MAX_RPC_READS = 4;
/** base64 character caps, checked before decoding (ceil(bytes / 3) * 4). */
const CAP = Object.freeze({
  program: 48, programData: 1_398_164, clock: 56, rent: 24, escrow: 296, token: 220, mint: 112,
});

export interface SolanaReadRpc {
  request(input: {
    readonly method: string; readonly params?: readonly unknown[]; readonly signal?: AbortSignal;
  }): Promise<unknown>;
}
export interface SolanaReaderOptions {
  readonly rpc: SolanaReadRpc; readonly registry: SolanaRegistryView; readonly now?: () => number;
  readonly timeoutMs?: number;
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
export type SplCustody = {
  readonly kind: 'spl'; readonly vault: string; readonly vaultAmount: string; readonly principalHeld: string;
  readonly surplus: string; readonly vaultFrozen: boolean; readonly mintDecimals: number;
  readonly mintFreezeAuthority: string | null;
};
export interface SolanaEscrowSnapshot {
  readonly observation: ChainObservation; readonly live: SolanaLiveAnchor; readonly escrowAddress: string;
  readonly occupant: 'none' | 'system-prefunded' | 'escrow'; readonly escrow: EscrowAccountV1 | null;
  readonly payout: 'not-applicable' | 'pending' | 'complete'; readonly custody: NativeCustody | SplCustody | null;
}

interface Context {
  readonly signal: AbortSignal; guard(): void; call(method: string, params: readonly unknown[]): Promise<unknown>;
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
interface Anchored { readonly slot: number; readonly accounts: readonly unknown[]; readonly identity: Identity }
function checkIdentity(ref: SolanaDeploymentRef, accounts: readonly unknown[], slot: number): Identity {
  const program = present(accounts[0], CAP.program, LOADER_V3_ID, true);
  if (decodeProgramAccount(program.data) !== ref.programDataAddress) return fail();
  const programData = decodeProgramData(present(accounts[1], CAP.programData, LOADER_V3_ID).data);
  const runtime = ref.deployment.runtime;
  if (programData.deploySlot > BigInt(slot) || runtime.kind !== 'solana-program') return fail();
  if (programData.sha256 !== runtime.programDataSha256) return fail();
  const clock = decodeClock(present(accounts[2], CAP.clock, SYSVAR_OWNER_ID).data);
  if (clock.slot !== BigInt(slot) || clock.unixTimestamp < 0n) return fail();
  return { timestampSeconds: clock.unixTimestamp.toString(), programDataSha256: programData.sha256 };
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
  // Payout keeps the rent reserve; blockers only matter while a payout is still to happen.
  if (!escrow.paidOut && minimum === null) blockedBy.push('rent-unknown');
  if (!escrow.paidOut && minimum !== null && lamports - principal < minimum) blockedBy.push('rent-shortfall');
  const spare = minimum === null ? null : lamports - principal - minimum;
  return {
    kind: 'native', lamports: lamports.toString(), principalHeld: principal.toString(),
    rentExemptMinimum: minimum === null ? null : minimum.toString(),
    surplus: spare === null ? null : (spare > 0n ? spare : 0n).toString(), payoutBlockedBy: blockedBy,
  };
}

/** SPL principal sits in the vault PDA token account; the mint is checked even when no escrow exists. */
function splCustody(
  trade: BoundSolanaTrade, classified: Classified, vaultEntry: unknown, mintEntry: unknown,
): SplCustody | null {
  const mint = decodeMint(present(mintEntry, CAP.mint, TOKEN_PROGRAM_ID).data);
  if (mint.decimals !== trade.asset.decimals) return fail();
  const escrow = classified.escrow, vaultAddress = trade.vault!.address;
  if (escrow === null) {
    const vault = readAccount(vaultEntry, CAP.token);
    if (vault !== null && !isSystemEmpty(vault)) return fail();
    return null;
  }
  const vault = decodeTokenAccount(present(vaultEntry, CAP.token, TOKEN_PROGRAM_ID).data);
  const principal = escrow.paidOut ? 0n : BigInt(escrow.amountBaseUnits);
  if (vault.mint !== escrow.mint || vault.owner !== trade.escrow.address || vault.amount < principal) return fail();
  return {
    kind: 'spl', vault: vaultAddress, vaultAmount: vault.amount.toString(), principalHeld: principal.toString(),
    surplus: (vault.amount - principal).toString(), vaultFrozen: vault.frozen, mintDecimals: mint.decimals,
    mintFreezeAuthority: mint.freezeAuthority,
  };
}

function payoutOf(escrow: EscrowAccountV1 | null): SolanaEscrowSnapshot['payout'] {
  if (escrow === null || escrow.state === 'funded') return 'not-applicable';
  return escrow.paidOut ? 'complete' : 'pending';
}
function counter(value: unknown): number { return safeInt(value, 'INVALID_INPUT'); }

export class SolanaChainReader {
  readonly #options: SolanaReaderOptions;
  readonly #timeoutMs: number;
  #disposed = false;
  readonly #jobs = new Set<AbortController>();
  /** Highest finalized slot accepted per network; later reads must not observe an older context. */
  readonly #floors = new Map<string, number>();
  constructor(options: SolanaReaderOptions) {
    this.#options = options;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs < 1 || this.#timeoutMs > 60_000) {
      throw new Error('Invalid Solana reader timeout.');
    }
  }

  /** Same job discipline as the EVM reader: a slot is freed only when the physical work settles. */
  #run<T>(external: AbortSignal | undefined, work: (context: Context) => Promise<T>): Promise<CoreResult<T>> {
    const operationId = createOperationId();
    const failure = (code: CoreErrorCode): CoreResult<never> =>
      ({ ok: false, error: createCoreError(code, { operationId, readOnly: true }) });
    if (this.#disposed || external?.aborted) return Promise.resolve(failure('CANCELLED'));
    if (this.#jobs.size >= MAX_RPC_READS) return Promise.resolve(failure('LIMIT_EXCEEDED'));
    const controller = new AbortController(); this.#jobs.add(controller);
    let abortCode: CoreErrorCode = 'CANCELLED';
    const onExternal = () => controller.abort(); external?.addEventListener('abort', onExternal, { once: true });
    const timer = setTimeout(() => { abortCode = 'TIMEOUT'; controller.abort(); }, this.#timeoutMs);
    const guard = () => { if (this.#disposed || controller.signal.aborted) fail(abortCode); };
    const context: Context = {
      signal: controller.signal, guard,
      call: async (method, params) => {
        guard();
        let value: unknown;
        // Transport failures and JSON-RPC errors alike become UNAVAILABLE; nothing from them is kept.
        try { value = await this.#options.rpc.request({ method, params, signal: controller.signal }); } catch {
          guard(); return fail('UNAVAILABLE');
        }
        guard(); return value;
      },
    };
    let onAbort!: () => void;
    const aborted = new Promise<CoreResult<T>>(resolve => {
      onAbort = () => resolve(failure(abortCode)); controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const physical = Promise.resolve().then(() => { guard(); return work(context); })
      .then(value => { guard(); return { ok: true as const, value }; })
      .catch((error: unknown) => failure(failureCode(error, 'UNAVAILABLE')))
      .finally(() => {
        this.#jobs.delete(controller); clearTimeout(timer); external?.removeEventListener('abort', onExternal);
      });
    return Promise.race([physical, aborted]).finally(() => {
      controller.signal.removeEventListener('abort', onAbort); external?.removeEventListener('abort', onExternal);
    });
  }

  /** Steps 1-2 plus identity: genesis, one finalized getMultipleAccounts at slot S >= floor. */
  async #anchor(ref: SolanaDeploymentRef, extraKeys: readonly string[], context: Context): Promise<Anchored> {
    const genesis = await context.call('getGenesisHash', []);
    if (genesis !== ref.network.genesisHash) return fail('WRONG_CHAIN');
    const floor = this.#floors.get(ref.network.id);
    const config = floor === undefined ? { commitment: 'finalized', encoding: 'base64' }
      : { commitment: 'finalized', encoding: 'base64', minContextSlot: floor };
    const keys = [ref.deployment.address, ref.programDataAddress, CLOCK_SYSVAR_ID, ...extraKeys];
    const response = await context.call('getMultipleAccounts', [keys, config]);
    const slot = safeInt(own(own(response, 'context'), 'slot'));
    if (floor !== undefined && slot < floor) return fail();
    const accounts = ownArray(own(response, 'value'), keys.length);
    if (accounts.length !== keys.length) return fail();
    return { slot, accounts, identity: checkIdentity(ref, accounts, slot) };
  }

  /** Steps 3-5: the block at S twice, then the genesis again; only then is the floor raised. */
  async #confirm(ref: SolanaDeploymentRef, anchored: Anchored, context: Context): Promise<SolanaLiveAnchor> {
    const params = [anchored.slot, { commitment: 'finalized', transactionDetails: 'none', rewards: false }];
    const first = block(await context.call('getBlock', params), anchored.slot);
    const second = block(await context.call('getBlock', params), anchored.slot);
    if (first.hash !== second.hash || first.height !== second.height || first.parent !== second.parent) return fail();
    if (await context.call('getGenesisHash', []) !== ref.network.genesisHash) return fail();
    context.guard();
    this.#floors.set(ref.network.id, Math.max(this.#floors.get(ref.network.id) ?? 0, anchored.slot));
    return { height: String(anchored.slot), hash: first.hash, blockHeight: String(first.height), ...anchored.identity };
  }

  validateLive(networkId: string, deploymentId: string, signal?: AbortSignal): Promise<CoreResult<SolanaLiveAnchor>> {
    return this.#run(signal, async context => {
      const ref = resolveDeployment(this.#options.registry, networkId, deploymentId);
      return deepFreeze(await this.#confirm(ref, await this.#anchor(ref, [], context), context));
    });
  }

  read(
    binding: TradeBinding, request: SolanaReadRequest, terms: SolanaTermsInput,
  ): Promise<CoreResult<SolanaEscrowSnapshot>> {
    return this.#run(request.signal, async context => {
      const generation = counter(request.generation), requestSequence = counter(request.requestSequence);
      const trade = bindTrade(this.#options.registry, binding, terms);
      const native = trade.terms.assetKind === 'native';
      const extra = native ? [trade.escrow.address, RENT_SYSVAR_ID]
        : [trade.escrow.address, trade.vault!.address, trade.terms.mint!];
      const anchored = await this.#anchor(trade, extra, context);
      const classified = classifyEscrow(trade, anchored.accounts[3]);
      let custody: NativeCustody | SplCustody | null;
      if (native) {
        const minimum = escrowRentMinimum(present(anchored.accounts[4], CAP.rent, SYSVAR_OWNER_ID).data);
        custody = classified.escrow === null ? null : nativeCustody(classified.escrow, classified.entry!, minimum);
      } else custody = splCustody(trade, classified, anchored.accounts[4], anchored.accounts[5]);
      const live = await this.#confirm(trade, anchored, context);
      const observedAt = counter((this.#options.now ?? Date.now)());
      const observation: ChainObservation = {
        binding: trade.binding, generation, requestSequence, anchor: { height: live.height, hash: live.hash },
        state: classified.escrow?.state ?? 'absent', finality: 'finalized', observedAt,
      };
      return deepFreeze({
        observation, live, escrowAddress: trade.escrow.address, occupant: classified.occupant,
        escrow: classified.escrow, payout: payoutOf(classified.escrow), custody,
      });
    });
  }

  /** G08 port. A funded trade whose vault is frozen cannot settle normally: CONFLICT, not a reorg. */
  async readValidated(
    binding: TradeBinding, request: SolanaReadRequest, terms: SolanaTermsInput,
  ): Promise<CoreResult<ChainObservation>> {
    const result = await this.read(binding, request, terms);
    if (!result.ok) return result;
    const { custody, observation } = result.value;
    if (custody?.kind === 'spl' && custody.vaultFrozen && observation.state === 'funded') {
      return { ok: false, error: createCoreError('CONFLICT', { operationId: createOperationId(), readOnly: true }) };
    }
    return { ok: true, value: observation };
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
