/** Diagnostic EVM arbitration reference data. No parsed claim grants native authority. */
export type ReferenceError = 'INVALID_INPUT' | 'LIMIT_EXCEEDED' | 'OVERFLOW' | 'BINDING_MISMATCH' | 'UNAVAILABLE' | 'CANCELLED' | 'CONFLICT' |
  'CLOCK_REVERSED' | 'WRONG_PHASE' | 'NOT_SEATED' | 'NOT_PARTY' | 'ALREADY_COMMITTED' | 'ALREADY_REVEALED' | 'INVALID_PREIMAGE' |
  'ALREADY_ACCEPTED' | 'BOND_UNAVAILABLE' | 'UNAGED_STAKE' | 'APPEAL_ALREADY_OPEN' | 'FINAL' | 'NOT_FINAL' | 'ROUND_NOT_CLOSED' | 'RESERVATION_INCONSISTENT' | 'INSUFFICIENT_RESERVE';
export type ReferenceResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: Readonly<{ code: ReferenceError }> }>;
export interface DiagnosticOnly { readonly diagnosticOnly: true; readonly economicAuthority: false; }
const errors = new WeakMap<object, ReferenceError>();
export function stop(code: ReferenceError = 'INVALID_INPUT'): never { const error = new Error('Arbitration reference calculation unavailable.'); errors.set(error, code); throw error; }
export const codeOf = (error: unknown): ReferenceError => typeof error === 'object' && error !== null ? errors.get(error) ?? 'UNAVAILABLE' : 'UNAVAILABLE';
export const success = <T>(value: T): ReferenceResult<T> => Object.freeze({ ok: true, value });
export const failure = <T = never>(code: ReferenceError): ReferenceResult<T> => Object.freeze({ ok: false, error: Object.freeze({ code }) });
export function result<T>(work: () => T): ReferenceResult<T> { try { return success(work()); } catch (error) { return failure(codeOf(error)); } }
export const diagnostic = <T extends object>(value: T): Readonly<T & DiagnosticOnly> => Object.freeze({ ...value, diagnosticOnly: true, economicAuthority: false });
export function data(input: unknown, required: readonly string[]): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return stop();
  const keys = Reflect.ownKeys(input); if (keys.length !== required.length || keys.some(key => typeof key !== 'string' || !required.includes(key))) return stop();
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of required) { const d = Object.getOwnPropertyDescriptor(input, key); if (!d || !d.enumerable || !('value' in d)) return stop(); out[key] = d.value; }
  return out;
}
export function array(input: unknown, maximum: number): unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return stop();
  const size = Object.getOwnPropertyDescriptor(input, 'length')?.value;
  if (!Number.isSafeInteger(size) || size < 0) return stop(); if (size > maximum) return stop('LIMIT_EXCEEDED');
  if (Reflect.ownKeys(input).length !== size + 1) return stop();
  return Array.from({ length: size }, (_, i) => { const d = Object.getOwnPropertyDescriptor(input, String(i)); if (!d || !d.enumerable || !('value' in d)) return stop(); return d.value as unknown; });
}
export const MAX_U256 = (1n << 256n) - 1n;
export const uint = (input: unknown): bigint => typeof input === 'bigint' && input >= 0n && input <= MAX_U256 ? input : stop(typeof input === 'bigint' ? 'OVERFLOW' : 'INVALID_INPUT');
export const add = (a: bigint, b: bigint): bigint => uint(uint(a) + uint(b));
export const multiply = (a: bigint, b: bigint): bigint => uint(uint(a) * uint(b));
export const integer = (input: unknown, max: number): number => typeof input === 'number' && Number.isSafeInteger(input) && input >= 0 && input <= max ? input : stop();
export const bool = (input: unknown): boolean => typeof input === 'boolean' ? input : stop();
export const roundOf = (input: unknown): 0 | 1 => input === 0 || input === 1 ? input : stop();
export const choiceOf = (input: unknown): 0 | 1 | 2 => input === 0 || input === 1 || input === 2 ? input : stop();
export const hex32 = (input: unknown): string => typeof input === 'string' && /^0x[0-9a-f]{64}$/.test(input) ? input : stop();
export const address = (input: unknown): string => typeof input === 'string' && /^0x[0-9a-f]{40}$/.test(input) && !/^0x0{40}$/.test(input) ? input : stop();
export interface CaseBinding { readonly chainId: bigint; readonly escrow: string; readonly tribunal: string; readonly policyHash: string; readonly tradeId: string; readonly caseId: string; }
export function bindingOf(input: unknown): CaseBinding {
  const raw = data(input, ['chainId', 'escrow', 'tribunal', 'policyHash', 'tradeId', 'caseId']), chainId = uint(raw.chainId); if (chainId === 0n) return stop();
  return Object.freeze({ chainId, escrow: address(raw.escrow), tribunal: address(raw.tribunal), policyHash: hex32(raw.policyHash), tradeId: hex32(raw.tradeId), caseId: hex32(raw.caseId) });
}
export const sameBinding = (a: CaseBinding, b: CaseBinding): boolean => Object.keys(a).every(key => a[key as keyof CaseBinding] === b[key as keyof CaseBinding]);
export type ReferenceAction = 'commit' | 'reveal' | 'accept-seat' | 'appeal';
export interface ActorRequest { readonly binding: CaseBinding; readonly round: 0 | 1; readonly action: ReferenceAction; readonly actor: string; readonly jurorId: string | null; }
export interface TrustedReferencePorts {
  readonly isCurrent: () => boolean;
  /** Authoritative-clock input is supplied by trusted composition; the model performs no RPC or wall-clock fallback. */
  readonly readChainTime: () => bigint;
  readonly authenticate: (request: ActorRequest) => boolean;
}
export function scopeFor(binding: CaseBinding, input: TrustedReferencePorts) {
  if (!input || typeof input.isCurrent !== 'function' || typeof input.readChainTime !== 'function' || typeof input.authenticate !== 'function') return stop();
  const current = input.isCurrent.bind(input), clock = input.readChainTime.bind(input), auth = input.authenticate.bind(input);
  let disposed = false, busy = false, lastTime = -1n;
  const check = (): void => { if (disposed) return stop('CANCELLED'); let live = false; try { live = current() === true; } catch { /* Refuse. */ } if (!live || disposed) { disposed = true; return stop('CANCELLED'); } };
  return Object.freeze({
    run<T>(work: () => T): ReferenceResult<T> {
      if (busy) return failure('CONFLICT'); busy = true;
      try { check(); const value = work(); check(); return success(value); } catch (error) { return failure(codeOf(error)); } finally { busy = false; }
    },
    now(): bigint { check(); const time = uint(clock()); check(); if (time < lastTime) { disposed = true; return stop('CLOCK_REVERSED'); } lastTime = time; return time; },
    authorize(action: ReferenceAction, round: 0 | 1, actor: string, jurorId: string | null): void {
      check(); const allowed = auth(Object.freeze({ binding, action, round, actor, jurorId })); check(); if (allowed !== true) return stop(action === 'appeal' ? 'NOT_PARTY' : 'NOT_SEATED');
    },
    invoke<T>(work: () => T): T { check(); const value = work(); check(); return value; },
    dispose(): void { disposed = true; },
  });
}
