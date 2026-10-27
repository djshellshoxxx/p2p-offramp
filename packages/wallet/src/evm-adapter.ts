/**
 * Partial G10 EVM (EIP-1193) wallet adapter: explicit connect and G16 typed-terms signing only. TEST-ONLY:
 * not exported or bundled, no startup discovery/prompt, and no transaction submission (submit needs the G12
 * journal plus an approved escrow deployment). Wallet identity/branding is never trusted; every signature is
 * verified offline against the session account before it is returned.
 *
 * Deviation: G10 sketches signTerms(session, encodedTerms: Uint8Array). EVM EIP-712 wallets require the
 * structured typed data, so this adapter takes the structured G16 terms and builds that exact typed data.
 */
import { createCoreError, createOperationId, type CoreErrorCode, type CoreResult, type RegistryService } from '../../domain/index.ts';
import { evmTermsHash, snapshotEvmDomain, snapshotEvmTerms, verifyEoaSignature, type EvmDomainInput, type EvmTermsInput } from './evm-terms.ts';

export interface Eip1193Provider {
  request(args: { readonly method: string; readonly params?: readonly unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}
export interface WalletSession {
  readonly providerId: string; readonly chain: 'evm'; readonly networkId: string; readonly account: string; readonly generation: number;
  readonly capabilities: Readonly<{ signTerms: boolean; sendTransaction: boolean; signTransaction: boolean }>;
}
export type WalletEvent = { readonly kind: 'invalidated'; readonly generation: number; readonly reason: 'accounts-changed' | 'chain-changed' | 'disconnected' | 'provider-lost' };
const failure = (code: CoreErrorCode): CoreResult<never> => Object.freeze({ ok: false, error: createCoreError(code, { operationId: createOperationId(), readOnly: false }) });
const account = (input: unknown): string | null => typeof input === 'string' && /^0x[0-9a-fA-F]{40}$/.test(input) && !/^0x0{40}$/.test(input) ? input.toLowerCase() : null;
function selectedAccount(input: unknown): string | null {
  try {
    if (!Array.isArray(input)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(input, '0');
    return descriptor && 'value' in descriptor ? account(descriptor.value) : null;
  } catch { return null; }
}
type ProviderHandlers = {
  readonly entries: [string, (...args: unknown[]) => void][];
  readonly remove: (event: string, handler: (...args: unknown[]) => void) => void;
};
/** Only an EIP-1193 numeric code is read; messages/data from the provider are never copied. */
function providerCode(error: unknown): number | undefined {
  try {
    if (typeof error !== 'object' || error === null) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    return descriptor && 'value' in descriptor && typeof descriptor.value === 'number' ? descriptor.value : undefined;
  } catch { return undefined; }
}
const TERMS_FIELDS = [['v', 'uint8'], ['orderId', 'bytes32'], ['revision', 'uint64'], ['networkId', 'string'], ['deploymentId', 'string'],
  ['seller', 'address'], ['buyer', 'address'], ['assetKind', 'uint8'], ['asset', 'address'], ['amountBaseUnits', 'uint256'],
  ['privateAgreementHash', 'bytes32'], ['capabilitiesHash', 'bytes32'], ['sellerNonce', 'bytes32'], ['acceptBeforeSeconds', 'uint64'],
  ['escrowExpirySeconds', 'uint64'], ['mode', 'uint8']] as const;

export class EvmWalletAdapter {
  readonly #provider: Eip1193Provider;
  readonly #providerId: string;
  readonly #registry: RegistryService;
  #session: WalletSession | null = null;
  #generation = 0;
  #disposed = false;
  readonly #listeners = new Set<(event: WalletEvent) => void>();
  #handlers: ProviderHandlers | null = null;
  constructor(provider: Eip1193Provider, providerId: string, registry: RegistryService) {
    this.#provider = provider; this.#providerId = providerId; this.#registry = registry;
  }
  #invalidate(reason: WalletEvent['reason']): void {
    if (this.#session === null && reason !== 'provider-lost') { this.#generation++; return; }
    this.#generation++; this.#session = null;
    const event = Object.freeze({ kind: 'invalidated' as const, generation: this.#generation, reason });
    for (const listener of [...this.#listeners]) { try { listener(event); } catch { /* one observer cannot block invalidation */ } }
  }
  async #chainId(): Promise<string | null> {
    const raw = await this.#provider.request({ method: 'eth_chainId' });
    return typeof raw === 'string' && /^0x[0-9a-f]{1,16}$/i.test(raw) && !/^0x0+$/.test(raw) ? BigInt(raw).toString() : null;
  }
  /** Explicit user action only. A newly connected account always needs new consent; nothing is restored. */
  async connect(networkId: string, signal?: AbortSignal): Promise<CoreResult<WalletSession>> {
    if (this.#disposed) return failure('LOCKED');
    if (signal?.aborted) return failure('CANCELLED');
    const network = this.#registry.network(networkId);
    if (!network || network.chain !== 'evm') return failure('UNSUPPORTED_PROVIDER');
    const generation = ++this.#generation; this.#session = null;
    let handlers: ProviderHandlers | null = null, connected = false;
    try {
      const on = this.#provider.on, remove = this.#provider.removeListener;
      if (signal?.aborted) return failure('CANCELLED');
      if (this.#disposed || generation !== this.#generation) return failure('CONFLICT');
      if (typeof on !== 'function' || typeof remove !== 'function') return failure('UNSUPPORTED_PROVIDER');
      this.#detach();
      if (this.#disposed || generation !== this.#generation) return failure('CONFLICT');
      // Each connection owns unique callbacks, so a late old attempt cannot detach its replacement.
      const group: ProviderHandlers = { entries: [], remove: (event, handler) => { remove.call(this.#provider, event, handler); } };
      for (const [event, reason] of [['accountsChanged', 'accounts-changed'], ['chainChanged', 'chain-changed'], ['disconnect', 'disconnected']] as const) {
        group.entries.push([event, () => { if (this.#handlers === group) this.#invalidate(reason); }]);
      }
      handlers = group; this.#handlers = group;
      for (const [event, handler] of group.entries) {
        on.call(this.#provider, event, handler);
        if (signal?.aborted) return failure('CANCELLED');
        if (this.#disposed || generation !== this.#generation || this.#handlers !== group) return failure('CONFLICT');
      }
      const request = this.#provider.request;
      if (signal?.aborted) return failure('CANCELLED');
      if (this.#disposed || generation !== this.#generation) return failure('CONFLICT');
      const accounts = await request.call(this.#provider, { method: 'eth_requestAccounts' });
      if (signal?.aborted) return failure('CANCELLED');
      if (this.#disposed || generation !== this.#generation) return failure('CONFLICT');
      const selected = selectedAccount(accounts);
      if (signal?.aborted) return failure('CANCELLED');
      if (this.#disposed || generation !== this.#generation) return failure('CONFLICT');
      if (!selected) return failure('UNAUTHORIZED');
      const chainId = await this.#chainId();
      if (signal?.aborted) return failure('CANCELLED');
      if (this.#disposed || generation !== this.#generation) return failure('CONFLICT');
      if (chainId !== network.chainIdentity) return failure('WRONG_CHAIN');
      this.#session = Object.freeze({ providerId: this.#providerId, chain: 'evm', networkId, account: selected, generation,
        capabilities: Object.freeze({ signTerms: true, sendTransaction: false, signTransaction: false }) });
      connected = true;
      return Object.freeze({ ok: true, value: this.#session });
    } catch (error) {
      if (signal?.aborted) return failure('CANCELLED');
      if (this.#disposed || generation !== this.#generation) return failure('CONFLICT');
      return failure(providerCode(error) === 4001 ? 'USER_REJECTED' : providerCode(error) === 4100 ? 'UNAUTHORIZED' : 'UNAVAILABLE');
    } finally { if (!connected && handlers) this.#detach(handlers); }
  }
  inspect(): WalletSession | null { return this.#session; }
  #current(session: WalletSession): boolean {
    return !this.#disposed && this.#session !== null && this.#session === session && session.generation === this.#generation;
  }
  /**
   * G16 acceptance signature for `role`. Preflight binds the terms to the registry and session; the wallet is
   * asked exactly once via eth_signTypedData_v4 (never personal_sign/eth_sign), and the returned r||s||v is
   * verified offline before it is returned. Returns the 65 signature bytes.
   */
  async signTerms(session: WalletSession, domain: EvmDomainInput, terms: EvmTermsInput, role: 'seller' | 'buyer', signal?: AbortSignal): Promise<CoreResult<Uint8Array>> {
    if (!this.#current(session)) return failure('LOCKED');
    if (signal?.aborted) return failure('CANCELLED');
    if (role !== 'seller' && role !== 'buyer') return failure('INVALID_INPUT');
    let stableDomain: Readonly<EvmDomainInput>, stableTerms: Readonly<EvmTermsInput>, digest: string;
    try {
      // Snapshot caller-owned data before the first await. These exact frozen primitives drive registry
      // preflight, the digest and the typed-data JSON shown to the wallet.
      stableDomain = snapshotEvmDomain(domain);
      stableTerms = snapshotEvmTerms(terms);
      digest = evmTermsHash(stableDomain, stableTerms);
    } catch { return failure('INVALID_INPUT'); }
    const network = this.#registry.network(stableTerms.networkId);
    const deployment = this.#registry.deployment(stableTerms.networkId, stableTerms.deploymentId);
    if (!network || !deployment || network.id !== session.networkId || network.chain !== 'evm') return failure('UNSUPPORTED_PROVIDER');
    if (stableDomain.chainId !== network.chainIdentity || stableDomain.verifyingContract !== deployment.address) return failure('WRONG_CHAIN');
    const asset = stableTerms.assetKind === 'native' ? network.assets.find(value => value.kind === 'native')
      : network.assets.find(value => value.kind === 'erc20' && value.address === stableTerms.asset);
    if (!asset || !deployment.supportedAssetIds.includes(asset.id)) return failure('UNSUPPORTED_PROVIDER');
    if ((role === 'seller' ? stableTerms.seller : stableTerms.buyer) !== session.account) return failure('UNAUTHORIZED');
    const generation = session.generation;
    try {
      // Re-query immediately before the prompt: a changed account/chain must never reach the wallet.
      const accounts = await this.#provider.request({ method: 'eth_accounts' });
      if (signal?.aborted) return failure('CANCELLED');
      if (!this.#current(session)) return failure('LOCKED');
      const selected = selectedAccount(accounts);
      if (signal?.aborted) return failure('CANCELLED');
      if (!this.#current(session)) return failure('LOCKED');
      if (selected !== session.account) { this.#invalidate('accounts-changed'); return failure('LOCKED'); }
      const chainId = await this.#chainId();
      if (!this.#current(session) || generation !== this.#generation) return failure('LOCKED');
      if (chainId !== network.chainIdentity) { this.#invalidate('chain-changed'); return failure('WRONG_CHAIN'); }
    } catch { return failure('UNAVAILABLE'); }
    if (signal?.aborted) return failure('CANCELLED');
    const typedData = JSON.stringify({
      types: { EIP712Domain: [['name', 'string'], ['version', 'string'], ['chainId', 'uint256'], ['verifyingContract', 'address']].map(([name, type]) => ({ name, type })),
        TradeTerms: TERMS_FIELDS.map(([name, type]) => ({ name, type })) },
      primaryType: 'TradeTerms',
      domain: { name: 'P2POfframp', version: '1', chainId: stableDomain.chainId, verifyingContract: stableDomain.verifyingContract },
      message: { ...stableTerms, v: 1, mode: 0, assetKind: stableTerms.assetKind === 'native' ? 0 : 1,
        orderId: `0x${stableTerms.orderId}`, privateAgreementHash: `0x${stableTerms.privateAgreementHash}`, capabilitiesHash: `0x${stableTerms.capabilitiesHash}`, sellerNonce: `0x${stableTerms.sellerNonce}` },
    });
    let raw: unknown;
    try {
      const request = this.#provider.request;
      if (signal?.aborted) return failure('CANCELLED');
      if (!this.#current(session)) return failure('LOCKED');
      raw = await request.call(this.#provider, { method: 'eth_signTypedData_v4', params: [session.account, typedData] });
    }
    catch (error) {
      if (signal?.aborted || !this.#current(session)) return failure(signal?.aborted ? 'CANCELLED' : 'LOCKED');
      const code = providerCode(error);
      // No downgrade: an unsupported typed-data method fails closed rather than trying another signing method.
      return failure(code === 4001 ? 'USER_REJECTED' : code === 4200 ? 'UNSUPPORTED_PROVIDER' : code === 4100 ? 'UNAUTHORIZED' : 'UNAVAILABLE');
    }
    // Late results after cancellation or a generation change are discarded, never published.
    if (signal?.aborted) return failure('CANCELLED');
    if (!this.#current(session) || generation !== this.#generation) return failure('LOCKED');
    if (typeof raw !== 'string' || !/^0x[0-9a-f]{130}$/i.test(raw)) return failure('INTEGRITY_FAILURE');
    const signature = Uint8Array.from(raw.slice(2).match(/../g)!, pair => parseInt(pair, 16));
    try { if (!verifyEoaSignature(digest, signature, session.account)) return failure('INTEGRITY_FAILURE'); }
    catch { return failure('INTEGRITY_FAILURE'); }
    return Object.freeze({ ok: true, value: signature });
  }
  subscribe(listener: (event: WalletEvent) => void): () => void {
    if (typeof listener !== 'function' || this.#disposed) return () => undefined;
    this.#listeners.add(listener); return () => { this.#listeners.delete(listener); };
  }
  async disconnect(): Promise<void> { this.#detach(); this.#invalidate('disconnected'); }
  #detach(group: ProviderHandlers | null = this.#handlers): void {
    if (!group) return;
    if (this.#handlers === group) this.#handlers = null;
    for (const [event, handler] of group.entries) { try { group.remove(event, handler); } catch { /* provider-specific */ } }
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true; this.#detach(); this.#session = null; this.#generation++; this.#listeners.clear();
  }
}
