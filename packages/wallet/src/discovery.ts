/** Partial G10 discovery only. No automatic listeners, wallet requests, connection or spending authority.
 * EIP-6963 event-compatible windowing, NOT full lifetime-listener conformance:
 * https://eips.ethereum.org/EIPS/eip-6963 ; https://eips.ethereum.org/EIPS/eip-1193
 * This project explicitly collects for three seconds and removes its listener.
 * Inherited/accessor request implementations are unsupported by this narrow port inspection.
 */
import { encodeBase64url } from '../../schemas/index.ts';
import { createCoreError, createOperationId, type CoreErrorCode, type CoreResult } from '../../domain/index.ts';
export const DISCOVERY_WINDOW_MS = 3000;
export const MAX_DISCOVERED_PROVIDERS = 16;
export const MAX_DISCOVERY_ANNOUNCEMENTS = 64;
export interface DiscoveryHandle { readonly id: string; readonly generation: number; readonly purpose: 'wallet-discovery'; }
export interface DiscoveredWallet {
  readonly handle: DiscoveryHandle;
  readonly info: { readonly uuid: string; readonly name: string; readonly rdns: string };
  readonly brandTrust: 'unverified';
}
export interface WalletDiscovery {
  /** Composition root calls only after an explicit user discovery action. */
  discover(signal?: AbortSignal): Promise<CoreResult<readonly DiscoveredWallet[]>>;
  isCurrent(handle: DiscoveryHandle): boolean;
  dispose(): void;
}
export interface WalletDiscoveryOptions { readonly target?: EventTarget; readonly now?: () => number; }
interface StoredProvider { readonly provider: object; readonly request: (...args: never[]) => unknown; readonly choice: DiscoveredWallet; }
interface Round { readonly generation: number; readonly providers: Map<object, StoredProvider>; finish(code?: CoreErrorCode): void; }
// Weak on both document and provider identity: no ever-seen cap or global strong provider references.
// Per-round/current strong references are bounded to 16 and cleared on restart/disposal.
const documentIdentities = new WeakMap<object, WeakMap<object, string>>();
function data(input: unknown, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  if (!descriptor || !('value' in descriptor)) throw undefined;
  return descriptor.value;
}
function publicInfo(input: unknown): DiscoveredWallet['info'] | undefined {
  try {
    if (typeof input !== 'object' || input === null) return undefined;
    const prototype: unknown = Object.getPrototypeOf(input); if (prototype !== Object.prototype && prototype !== null) return undefined;
    const uuid = data(input, 'uuid'), name = data(input, 'name'), rdns = data(input, 'rdns');
    if (typeof uuid !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) return undefined;
    if (typeof name !== 'string' || !name.length || name.length > 128 || name.trim() !== name || /[\u0000-\u001f\u007f-\u009f<>\u202a-\u202e\u2066-\u2069]/u.test(name) || name.includes('://')) return undefined;
    for (let index = 0; index < name.length; index++) { const code = name.charCodeAt(index); if (code >= 0xd800 && code <= 0xdbff) { const next = name.charCodeAt(++index); if (!(next >= 0xdc00 && next <= 0xdfff)) return undefined; } else if (code >= 0xdc00 && code <= 0xdfff) return undefined; }
    if (new TextEncoder().encode(name).length > 256) return undefined;
    if (typeof rdns !== 'string' || rdns.length > 253) return undefined;
    const labels = rdns.split('.'); if (labels.length < 2 || labels.some(label => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) return undefined;
    // icon and all extensible metadata are deliberately never inspected or copied.
    return Object.freeze({ uuid: uuid.toLowerCase(), name, rdns });
  } catch { return undefined; }
}
class ExplicitWalletDiscovery implements WalletDiscovery {
  readonly #options: { readonly target: EventTarget | undefined; readonly now: (() => number) | undefined };
  #closed = false;
  #generation = 0;
  #lastTime = -Infinity;
  #round: Round | undefined;
  #current = new Map<DiscoveryHandle, StoredProvider>();
  constructor(options: WalletDiscoveryOptions) { this.#options = { target: options.target, now: options.now }; }
  #time(): number {
    const now = (this.#options.now ?? (() => performance.now()))();
    if (!Number.isFinite(now) || now < this.#lastTime) throw undefined;
    this.#lastTime = now; return now;
  }
  async discover(signal?: AbortSignal): Promise<CoreResult<readonly DiscoveredWallet[]>> {
    const operationId = createOperationId();
    const failure = (code: CoreErrorCode): CoreResult<never> => ({ ok: false, error: createCoreError(code, { operationId, readOnly: false }) });
    if (this.#closed || signal?.aborted) return failure('CANCELLED');
    if (this.#round) return failure('CONFLICT');
    if (this.#generation >= Number.MAX_SAFE_INTEGER - 1) return failure('LIMIT_EXCEEDED');
    const generation = ++this.#generation; this.#current.clear();
    let target: EventTarget, add: EventTarget['addEventListener'], remove: EventTarget['removeEventListener'], dispatch: EventTarget['dispatchEvent'], detailGetter: (this: CustomEvent) => unknown, deadline: number;
    try {
      const selected = this.#options.target ?? (typeof window === 'undefined' ? undefined : window);
      if (!selected || typeof CustomEvent === 'undefined') return failure('UNSUPPORTED_PROVIDER');
      target = selected; add = target.addEventListener; remove = target.removeEventListener; dispatch = target.dispatchEvent;
      const getter = Object.getOwnPropertyDescriptor(CustomEvent.prototype, 'detail')?.get;
      if (typeof add !== 'function' || typeof remove !== 'function' || typeof dispatch !== 'function' || typeof getter !== 'function') return failure('UNSUPPORTED_PROVIDER');
      detailGetter = getter; deadline = this.#time() + DISCOVERY_WINDOW_MS;
    } catch { return failure('UNAVAILABLE'); }
    let identities = documentIdentities.get(target);
    if (!identities) { identities = new WeakMap(); documentIdentities.set(target, identities); }
    const documentIdentity = identities;
    const result = await new Promise<CoreResult<readonly DiscoveredWallet[]>>(resolve => {
      let timer: ReturnType<typeof setTimeout> | undefined, listening = false, settled = false, processed = 0;
      const round: Round = { generation, providers: new Map(), finish: code => {
        if (settled) return; settled = true;
        if (timer !== undefined) clearTimeout(timer);
        try { if (listening) Reflect.apply(remove, target, ['eip6963:announceProvider', receive]); } catch { code = 'UNAVAILABLE'; }
        try { signal?.removeEventListener('abort', abort); } catch { code = 'UNAVAILABLE'; }
        if (this.#round === round) this.#round = undefined;
        if (this.#closed || this.#generation !== generation || signal?.aborted) code = 'CANCELLED';
        if (code) { round.providers.clear(); if (this.#generation === generation) this.#current.clear(); resolve(failure(code)); return; }
        const choices: DiscoveredWallet[] = [];
        for (const entry of round.providers.values()) { this.#current.set(entry.choice.handle, entry); choices.push(entry.choice); }
        round.providers.clear(); resolve({ ok: true, value: Object.freeze(choices) });
      } };
      const current = (): boolean => !settled && !this.#closed && this.#round === round && this.#generation === generation;
      const abort = (): void => round.finish('CANCELLED');
      const receive = (event: Event): void => {
        if (!current()) return;
        try { if (this.#time() >= deadline) { round.finish(); return; } } catch { round.finish('UNAVAILABLE'); return; }
        if (++processed > MAX_DISCOVERY_ANNOUNCEMENTS) { round.finish('LIMIT_EXCEEDED'); return; }
        if (round.providers.size >= MAX_DISCOVERED_PROVIDERS) return;
        let provider: unknown, info: DiscoveredWallet['info'] | undefined;
        try {
          const detail: unknown = Reflect.apply(detailGetter, event, []);
          provider = data(detail, 'provider'); if (typeof provider !== 'object' || provider === null) return;
          if (round.providers.has(provider)) return;
          info = publicInfo(data(detail, 'info')); if (!info) return;
        } catch { return; }
        let request: (...args: never[]) => unknown;
        try { const candidate = data(provider, 'request'); if (typeof candidate !== 'function') { round.finish('UNSUPPORTED_PROVIDER'); return; } request = candidate as typeof request; }
        catch { round.finish('UNSUPPORTED_PROVIDER'); return; }
        if (!current()) return;
        try {
          let id = documentIdentity.get(provider);
          if (!id) { const bytes = crypto.getRandomValues(new Uint8Array(32)); try { id = encodeBase64url(bytes); } finally { bytes.fill(0); } documentIdentity.set(provider, id); }
          if (!current()) return;
          const handle = Object.freeze({ id, generation, purpose: 'wallet-discovery' as const });
          const choice = Object.freeze({ handle, info, brandTrust: 'unverified' as const });
          round.providers.set(provider, { provider, request, choice });
        } catch { round.finish('UNAVAILABLE'); }
      };
      this.#round = round;
      try {
        timer = setTimeout(() => { try { round.finish(this.#time() >= deadline ? undefined : 'UNAVAILABLE'); } catch { round.finish('UNAVAILABLE'); } }, DISCOVERY_WINDOW_MS);
        signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) { abort(); return; }
        listening = true; Reflect.apply(add, target, ['eip6963:announceProvider', receive]);
        if (current()) Reflect.apply(dispatch, target, [new Event('eip6963:requestProvider')]);
      } catch { round.finish('UNAVAILABLE'); }
    });
    if (result.ok && (this.#closed || generation !== this.#generation || signal?.aborted)) { if (generation === this.#generation) this.#current.clear(); return failure('CANCELLED'); }
    if (result.ok) { try { this.#time(); } catch { this.#current.clear(); return failure('UNAVAILABLE'); } }
    return result;
  }
  isCurrent(handle: DiscoveryHandle): boolean { return !this.#closed && this.#current.has(handle); }
  dispose(): void { if (this.#closed) return; this.#closed = true; this.#generation++; this.#current.clear(); this.#round?.finish('CANCELLED'); }
}
export function createWalletDiscovery(options: WalletDiscoveryOptions = {}): WalletDiscovery { return new ExplicitWalletDiscovery(options); }
