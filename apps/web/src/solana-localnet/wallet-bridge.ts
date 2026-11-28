/** Wallet Standard 1.0 features. Native Worker verifies the returned exact message and Ed25519 signature before send. */
import type { SolanaWalletRequest, SolanaReview } from './protocol.ts';

export interface BrowserSolanaWallet { readonly name?: string; readonly features: unknown; readonly accounts: unknown }
const refuse = (): never => { throw Error('WALLET_UNAUTHORIZED'); };
const own = (value: unknown, key: string): unknown => {
  if (typeof value !== 'object' || value === null) return refuse();
  const field = Object.getOwnPropertyDescriptor(value, key);
  return field && 'value' in field ? field.value : refuse();
};
function array(value: unknown, cap: number): unknown[] {
  if (!Array.isArray(value)) return refuse();
  const length = own(value, 'length');
  if (typeof length !== 'number' || length > cap || Reflect.ownKeys(value).length !== length + 1) return refuse();
  return Array.from({ length }, (_, i) => own(value, String(i)));
}
function strings(value: unknown, cap: number): string[] {
  return array(value, cap).map(v => typeof v === 'string' && v.length <= 128 ? v : refuse());
}
const typedBytes = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')!.get!;
function bytes(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array)) return refuse();
  // Read the intrinsic view length before allocation. Do not invoke wallet-owned iterators or length accessors.
  let length: number;
  try { length = Reflect.apply(typedBytes, value, []) as number; } catch { return refuse(); }
  if (!Number.isSafeInteger(length) || length < 1 || length > 1232) return refuse();
  const copy = new Uint8Array(length);
  try { Uint8Array.prototype.set.call(copy, value); } catch { return refuse(); }
  return copy;
}
export const wireBase64 = (value: Uint8Array): string => btoa(String.fromCharCode(...value));
export function wireBytes(value: unknown): Uint8Array {
  if (typeof value !== 'string' || value.length > 1644 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return refuse();
  const out = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (!out.length || out.length > 1232 || wireBase64(out) !== value) return refuse();
  return out;
}
function publicAccount(value: unknown) {
  const address = own(value, 'address'), publicKey = bytes(own(value, 'publicKey'));
  if (typeof address !== 'string' || address.length < 1 || address.length > 64 || publicKey.length !== 32) return refuse();
  return { address, publicKey, chains: strings(own(value, 'chains'), 16), features: strings(own(value, 'features'), 64) };
}
function method(wallet: BrowserSolanaWallet, featureName: string, name: string): { call: (...args: unknown[]) => Promise<unknown>; feature: unknown } {
  // Wallet objects may have standard prototype getters. Calls are fenced again after resolving these external properties.
  const feature = own(wallet.features, featureName);
  if (own(feature, 'version') !== '1.0.0') return refuse();
  const fn = own(feature, name);
  if (typeof fn !== 'function') return refuse();
  return { feature, call: (...args) => Promise.resolve(Reflect.apply(fn, feature, args)) };
}
const identity = (value: ReturnType<typeof publicAccount>) => JSON.stringify({ ...value, publicKey: Array.from(value.publicKey) });
export function createSolanaWalletBridge(wallet: BrowserSolanaWallet, onChange: () => void, now: () => number = Date.now) {
  let generation = 0, disposed = false, connectAllowed = false, physical: 'connect' | 'sign' | null = null;
  let approval: { readonly generation: number; readonly expires: number; readonly request: string } | null = null;
  const accounts = new Map<string, { original: unknown; identity: string }>();
  const revoke = () => { generation++; connectAllowed = false; approval = null; };
  const events = own(wallet.features, 'standard:events');
  if (own(events, 'version') !== '1.0.0') return refuse();
  const on = own(events, 'on');
  if (typeof on !== 'function') return refuse();
  const off: unknown = Reflect.apply(on, events, ['change', () => {
    // connect's returned account list is revalidated; the standard connect event itself is not a signed action.
    if (physical === 'connect') return;
    revoke(); accounts.clear(); onChange();
  }]);
  if (typeof off !== 'function') return refuse();
  const active = (epoch: number) => { if (disposed || epoch !== generation) return refuse(); };
  function currentAccount(address: string): unknown {
    const stored = accounts.get(address); if (!stored) return refuse();
    const current = array(wallet.accounts, 16).find(value => publicAccount(value).address === address);
    if (!current || identity(publicAccount(current)) !== stored.identity || identity(publicAccount(stored.original)) !== stored.identity) return refuse();
    return stored.original;
  }
  return {
    beginConnect() {
      if (disposed || physical || connectAllowed || approval) return refuse();
      connectAllowed = true; const epoch = generation;
      return () => { if (epoch === generation) connectAllowed = false; };
    },
    beginReview(review: SolanaReview) {
      if (disposed || physical || connectAllowed || approval || !Number.isSafeInteger(review.expiresAtMs) || review.expiresAtMs <= now()) return refuse();
      if (review.walletRequest.method !== 'signTransaction' || review.walletRequest.chain !== 'solana:localnet') return refuse();
      wireBytes(review.walletRequest.transaction);
      approval = { generation, expires: review.expiresAtMs, request: JSON.stringify(review.walletRequest) };
      const current = approval; return () => { if (approval === current) approval = null; };
    },
    revoke,
    async request(request: SolanaWalletRequest): Promise<unknown> {
      if (disposed || physical || !request || JSON.stringify(request).length > 2000) return refuse();
      const epoch = generation;
      if (request.method === 'connect') {
        if (!connectAllowed || Object.keys(request).join() !== 'method') return refuse();
        connectAllowed = false; physical = 'connect';
        try {
          const { call } = method(wallet, 'standard:connect', 'connect'); active(epoch);
          const result = await call(); active(epoch);
          const originals = array(own(result, 'accounts'), 16), copied = originals.map(publicAccount);
          if (!copied.length || new Set(copied.map(a => a.address)).size !== copied.length) return refuse();
          accounts.clear(); originals.forEach((original, i) => accounts.set(copied[i]!.address, { original, identity: identity(copied[i]!) }));
          for (const account of copied) currentAccount(account.address);
          active(epoch); return { accounts: copied };
        } finally { physical = null; }
      }
      if (request.method !== 'signTransaction' || !approval || approval.generation !== epoch || approval.expires <= now() ||
          approval.request !== JSON.stringify(request)) return refuse();
      approval = null; physical = 'sign';
      try {
        const original = currentAccount(request.account), input = publicAccount(original);
        if (!input.chains.includes('solana:localnet') || !input.features.includes('solana:signTransaction')) return refuse();
        const { call, feature } = method(wallet, 'solana:signTransaction', 'signTransaction');
        if (!array(own(feature, 'supportedTransactionVersions'), 4).includes('legacy')) return refuse();
        active(epoch);
        const result = await call({ account: original, chain: request.chain, transaction: wireBytes(request.transaction) });
        active(epoch); currentAccount(request.account); active(epoch);
        const output = array(result, 1); if (output.length !== 1) return refuse();
        return { signedTransaction: wireBase64(bytes(own(output[0], 'signedTransaction'))) };
      } finally { physical = null; }
    },
    dispose() { if (!disposed) { disposed = true; revoke(); accounts.clear();
      try { Reflect.apply(off, undefined, []); } catch { /* External cleanup cannot prevent authority revocation. */ }
    } },
  };
}
