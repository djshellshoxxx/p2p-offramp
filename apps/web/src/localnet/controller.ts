/**
 * One local party per Worker. The encrypted vault, messaging key, exact accepted terms, D1 replay ledger and
 * transaction journal never leave this owner. Relay claims do not create chain authority; reviews grant one
 * finite wallet action and are consumed before any prompt. Restored journals are reconciled and never resent.
 */
import { EncryptedVaultService, EncryptedBackupService, type VaultStore } from '../../../../packages/storage/index.ts';
import { decodeBase64url, encodeBase64url, decodeIdentityPayload, encodeIdentityPayload, IDENTITY_PROVIDER_ID,
  type PrivateIdentityRecordV1, type VaultSession, type VaultSessionLease, type Intent, type CoreResult, type TradeBinding } from '../../../../packages/schemas/index.ts';
import { createCoreError, createOperationId, reviewTermsBytes, TERMS_REVIEW_FORMAT, encodePrivateAgreement, encodeCapabilities,
  checkFundingWindow, sha256Hex, type ReviewedEvmTerms, type PrivateAgreementV1 } from '../../../../packages/domain/index.ts';
import { createLifecycleJournal, createEvmTxLifecycle, evmFinalityPolicy, type EvmTxLifecycle, type LifecycleJournal, type PreparedEvmIntent } from '../../../../packages/domain/localnet.ts';
import { EvmChainReader, type LiveAnchor } from '../../../../packages/chain-evm/localnet.ts';
import { EvmWalletAdapter, createEvmPeerAcceptancePorts, createEip1193ChainReader, escrowCallFor, evmTermsFromReviewed, evmTermsHash,
  peerAcceptanceTypedData, type Eip1193Provider, type WalletSession, type EvmPeerPorts, type PeerAcceptanceV1 } from '../../../../packages/wallet/localnet.ts';
import { createLocalNobleNostrProvider, createRelayEventCrypto } from '../../../../packages/nostr-crypto/index.ts';
import { createRelayPool, createOrderBook, createAdEvent, AD_KIND, type RelayPool, type OrderBook, type NostrEvent, type RelayConnector } from '../../../../packages/relay/index.ts';
import { createTermsExchange, adBookKey, type TermsExchange, type SentMessage, type SessionView } from '../../../../packages/exchange/index.ts';
import { createDurableTradeChat, encodeMessage, type DurableTradeChat } from '../../../../packages/messaging/index.ts';
import type { LocalnetConfig } from './config.ts';
import type { LocalnetCommand, LocalnetResult, LocalnetReview, LocalnetSnapshot, LocalnetTradeView } from './protocol.ts';
import { createLocalnetRelayRoute, LOCALNET_RELAY_ENDPOINT } from './relay-route.ts';
import { reviewedTermsRequest, reviewedTransactionRequest } from './review-requests.ts';
import { LocalnetFailure, fail, fields, parseLocalnetCommand } from './validation.ts';
import { erc20FundingReady, nextErc20Approval, readErc20FundingState, type Erc20FundingState } from './erc20-funding.ts';

const TRADE_FORMAT = 'p2p-offramp/localnet-private-trade/v1';
const REVIEW_MS = 30_000, IDLE_MS = 5 * 60_000, MAX_TRADES = 8;
const hex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const random = (length: number): string => hex(crypto.getRandomValues(new Uint8Array(length)));
const ZERO = `0x${'0'.repeat(40)}`;
function value<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code?: string; readonly error?: unknown }): T {
  if (result.ok) return result.value;
  let code = result.code;
  if (!code && result.error && typeof result.error === 'object') code = Object.getOwnPropertyDescriptor(result.error, 'code')?.value as string | undefined;
  if (!code && typeof result.error === 'string') code = result.error;
  return fail(code ?? 'UNAVAILABLE');
}
const domainOf = (reviewed: ReviewedEvmTerms) => ({ chainId: reviewed.network.chainId, verifyingContract: reviewed.deployment.address });
const idOf = (reviewed: ReviewedEvmTerms): string => evmTermsHash(domainOf(reviewed), evmTermsFromReviewed(reviewed));
const bindingOf = (reviewed: ReviewedEvmTerms): TradeBinding => ({ chain: 'evm', networkId: reviewed.network.id, deploymentId: reviewed.deployment.id, tradeId: idOf(reviewed) });
const expectedOf = (reviewed: ReviewedEvmTerms) => ({ seller: reviewed.seller, buyer: reviewed.buyer, asset: reviewed.asset.address ?? ZERO,
  amountBaseUnits: reviewed.amountBaseUnits, expirySeconds: reviewed.escrowExpirySeconds });
const pending = (intent: Intent): boolean => !['finalized', 'failed', 'expired', 'replaced'].includes(intent.state);

interface Trade {
  readonly recordId: string; readonly bytes: Uint8Array; readonly reviewed: ReviewedEvmTerms; readonly role: 'seller' | 'buyer';
  readonly counterparty: string; readonly restored: boolean; sessionId: string | null; acceptance: string;
  state: LocalnetTradeView['chainState']; observedAt: number | null; chainTimestamp: string | null; tokenState: Erc20FundingState | null;
  tokenReadError: boolean; chat: DurableTradeChat;
  messages: LocalnetTradeView['chat'];
}
interface Review {
  readonly public: LocalnetReview; readonly epoch: number; readonly wallet: WalletSession; readonly created: number;
  readonly bytes: Uint8Array | null; readonly sessionId: string | null; readonly tradeId: string;
  readonly peerBinding: PeerAcceptanceV1 | null; readonly prepared: PreparedEvmIntent | null;
}
export interface LocalnetControllerOptions {
  /** Tests inject an encrypted store and loopback socket connector. Neither capability crosses the document protocol. */
  readonly store?: VaultStore;
  readonly connectRelay?: RelayConnector;
  readonly now?: () => number;
  readonly monotonicNow?: () => number;
  readonly onSnapshot?: (snapshot: LocalnetSnapshot) => void;
}
export class LocalnetController {
  readonly #config: LocalnetConfig; readonly #provider: Eip1193Provider; readonly #options: LocalnetControllerOptions;
  readonly #vault: EncryptedVaultService; readonly #backup: EncryptedBackupService;
  readonly #messaging = createLocalNobleNostrProvider(); readonly #adapter: EvmWalletAdapter;
  #session: VaultSession | null = null; #lease: VaultSessionLease | null = null; #secret: Uint8Array | null = null; #publicKey: string | null = null;
  #wallet: WalletSession | null = null; #native: EvmChainReader | null = null; #ports: EvmPeerPorts | null = null;
  #journal: LifecycleJournal | null = null; #life: EvmTxLifecycle | null = null;
  #book: OrderBook | null = null; #pool: RelayPool | null = null; #eventCrypto: Awaited<ReturnType<typeof createRelayEventCrypto>> | null = null;
  #route: ReturnType<typeof createLocalnetRelayRoute> | null = null; #exchange: TermsExchange | null = null;
  #trades = new Map<string, Trade>(); #sessionIds = new Set<string>(); #selectedSessionId: string | null = null; #intents: readonly Intent[] = [];
  #review: Review | null = null; #epoch = 0; #sequence = 0; #busy = false; #closed = false; #dropping = false;
  #profileIds: readonly string[] = []; #error: string | null = null; #relay = 'closed';
  #operation = new AbortController(); #idle: ReturnType<typeof setTimeout> | undefined; #deadline = 0; #lastTime = 0;
  #inbox: NostrEvent[] = []; #draining = false;
  constructor(config: LocalnetConfig, provider: Eip1193Provider, options: LocalnetControllerOptions = {}) {
    if (config.ReleaseEnabled !== 0 || config.network.chainIdentity !== '31337' || config.network.deployments.length !== 1) fail('LOCALNET_CONFIG_INVALID');
    this.#config = config; this.#provider = provider; this.#options = options;
    this.#vault = new EncryptedVaultService(options.store, crypto, { lifecycle: false });
    this.#backup = new EncryptedBackupService(options.store);
    this.#adapter = new EvmWalletAdapter(provider, 'localnet-external-wallet', config.registry);
    this.#adapter.subscribe(() => {
      this.#wallet = null; this.#clearReview(); this.#operation.abort(); this.#operation = new AbortController();
      void this.#life?.walletChanged(null); this.#emit();
    });
  }
  #now = (): number => (this.#options.now ?? Date.now)();
  #seconds = (): number => Math.floor(this.#now() / 1000);
  #mono = (): number => (this.#options.monotonicNow ?? (() => performance.now()))();
  #current(epoch = this.#epoch): boolean {
    const now = this.#mono();
    if (!Number.isFinite(now) || now < this.#lastTime || this.#session && now >= this.#deadline) { this.#drop(); return false; }
    this.#lastTime = now;
    return !this.#closed && epoch === this.#epoch && this.#session !== null && !!this.#lease?.current();
  }
  #guard(epoch = this.#epoch): void { if (!this.#current(epoch)) fail('LOCKED'); }
  #touch(): void {
    if (!this.#session) return;
    if (this.#idle !== undefined) clearTimeout(this.#idle);
    this.#deadline = this.#mono() + IDLE_MS;
    this.#idle = setTimeout(() => { this.#drop(); this.#emit(); }, IDLE_MS);
  }
  #clearReview(): void { this.#review?.bytes?.fill(0); this.#review = null; }
  #drop(): void {
    if (this.#dropping) return;
    this.#dropping = true;
    this.#epoch++; this.#operation.abort(); this.#operation = new AbortController();
    this.#clearReview(); this.#lease?.dispose(); this.#lease = null; this.#session = null;
    this.#pool?.close(); this.#pool = null; this.#route?.dispose(); this.#route = null;
    this.#exchange?.close(); this.#exchange = null; this.#ports?.dispose(); this.#ports = null;
    this.#life?.dispose(); this.#life = null; this.#journal?.dispose(); this.#journal = null; this.#native?.dispose(); this.#native = null;
    for (const trade of this.#trades.values()) { trade.bytes.fill(0); trade.chat.close(); }
    this.#trades.clear(); this.#sessionIds.clear(); this.#selectedSessionId = null; this.#intents = []; this.#book = null; this.#eventCrypto?.dispose(); this.#eventCrypto = null; this.#inbox = [];
    this.#secret?.fill(0); this.#secret = null; this.#publicKey = null; this.#wallet = null; this.#relay = 'closed';
    this.#adapter.disconnect(); this.#vault.lockAll();
    if (this.#idle !== undefined) clearTimeout(this.#idle); this.#idle = undefined; this.#dropping = false;
  }
  dispose(): void { if (this.#closed) return; this.#drop(); this.#closed = true; this.#adapter.dispose(); this.#vault.dispose(); this.#backup.dispose(); }
  #emit(): void { try { this.#options.onSnapshot?.(this.snapshot()); } catch { /* Observation cannot grant authority. */ } }
  snapshot(): LocalnetSnapshot {
    const open = this.#current(), account = this.#wallet?.account;
    const trades: LocalnetTradeView[] = open ? [...this.#trades].map(([id, trade]) => {
      const r = trade.reviewed, intents = this.#intents.filter(intent => intent.binding.tradeId === id);
      const fresh = trade.observedAt !== null && this.#now() >= trade.observedAt && this.#now() - trade.observedAt < 60_000;
      const seller = trade.role === 'seller' && account === r.seller;
      const clear = !intents.some(pending);
      const fundingWindow = trade.chainTimestamp !== null && BigInt(trade.chainTimestamp) < BigInt(r.acceptBeforeSeconds) &&
        BigInt(r.escrowExpirySeconds) - BigInt(trade.chainTimestamp) >= 1800n;
      const admission = seller && fresh && clear && fundingWindow && trade.state === 'absent' && trade.acceptance === 'both-verified' && trade.sessionId !== null;
      const approval = r.asset.kind === 'erc20' && trade.tokenState ? { token: r.asset.address!, spender: r.deployment.address,
        ...trade.tokenState, nextAmountBaseUnits: nextErc20Approval(r.amountBaseUnits, trade.tokenState) } : null;
      return { id, sessionId: trade.sessionId, role: trade.role, restored: trade.restored, seller: r.seller, buyer: r.buyer,
        assetId: r.asset.id, amountBaseUnits: r.amountBaseUnits, fiatCurrency: r.agreement.fiatCurrency, fiatMinorUnits: r.agreement.fiatMinorUnits,
        fiatScale: r.agreement.fiatScale, paymentInstructions: r.agreement.paymentInstructions, acceptBeforeSeconds: r.acceptBeforeSeconds,
        escrowExpirySeconds: r.escrowExpirySeconds, peerAcceptance: trade.acceptance, chainState: trade.state, chainObservedAtMs: trade.observedAt,
        intents: intents.map(intent => ({ id: intent.intentId, action: intent.action, state: intent.state, hash: intent.submission.chain === 'evm' ? intent.submission.hash : null })),
        chat: trade.messages,
        approval, tokenReadError: trade.tokenReadError, canApprove: admission && approval !== null && approval.nextAmountBaseUnits !== null,
        canFund: admission && (r.asset.kind === 'native' || trade.tokenState !== null && erc20FundingReady(r.amountBaseUnits, trade.tokenState)),
        canRelease: seller && fresh && clear && trade.state === 'funded' && trade.chainTimestamp !== null && BigInt(trade.chainTimestamp) < BigInt(r.escrowExpirySeconds),
        canRefund: seller && fresh && clear && trade.state === 'funded' && trade.chainTimestamp !== null && BigInt(trade.chainTimestamp) >= BigInt(r.escrowExpirySeconds),
      };
    }) : [];
    return { version: 1, phase: !open ? 'locked' : this.#busy || this.#draining ? 'working' : 'ready', profileIds: this.#profileIds,
      profileId: open ? this.#session!.profileId : null, publicKey: open ? this.#publicKey : null,
      wallet: open && account ? { account, chainId: '31337' } : null, relay: this.#relay,
      ads: open ? (this.#book?.list() ?? []).map(entry => ({ key: entry.key, maker: entry.ad.maker, assetId: entry.ad.assetId,
        amountBaseUnits: entry.ad.amountMin, currency: entry.ad.currency, expiresAtSeconds: entry.ad.expiresAtSeconds, own: entry.ad.maker === this.#publicKey })) : [],
      sessions: open ? [...this.#sessionIds].flatMap(id => { const session = this.#exchange?.session(id); return session ? [{ id, role: session.role,
        state: session.state, selected: id === this.#selectedSessionId, buyerAddress: session.buyerAddress, tradeId: session.terms?.hash ?? null }] : []; }) : [],
      trades, review: open ? this.#review?.public ?? null : null, error: this.#error };
  }
  async dispatch(input: unknown): Promise<LocalnetResult> {
    let command: LocalnetCommand;
    try { command = parseLocalnetCommand(input); } catch (error) { return { ok: false, code: error instanceof LocalnetFailure ? error.code : 'INVALID_INPUT', snapshot: this.snapshot() }; }
    if (this.#closed) return { ok: false, code: 'LOCKED', snapshot: this.snapshot() };
    if (command.type === 'profile.lock') { this.#drop(); this.#error = null; this.#emit(); return { ok: true, snapshot: this.snapshot() }; }
    if (command.type === 'status') {
      try { this.#profileIds = value(await this.#vault.listProfiles()).profileIds; } catch { this.#error = 'STORAGE_UNAVAILABLE'; }
      this.#emit(); return { ok: true, snapshot: this.snapshot() };
    }
    if (this.#busy || this.#draining) return { ok: false, code: 'BUSY', snapshot: this.snapshot() };
    this.#busy = true; this.#error = null; this.#emit();
    try {
      let extra: { readonly backupBytes?: Uint8Array; readonly restoredProfileId?: string } = {};
      if (command.type === 'profile.create' || command.type === 'profile.unlock' || command.type === 'backup.restore') {
        this.#drop(); const epoch = this.#epoch;
        const openingCurrent = (): void => { if (epoch !== this.#epoch || this.#closed) fail('LOCKED'); };
        let session: VaultSession, source: string | undefined;
        if (command.type === 'backup.restore') {
          const receipt = await this.#backup.restore(command.bytes, command.sourcePassphrase, command.destinationPassphrase, this.#operation.signal, openingCurrent);
          openingCurrent(); source = receipt.sourceProfileId; extra = { restoredProfileId: receipt.newProfileId };
          session = value(await this.#vault.unlock(receipt.newProfileId, command.destinationPassphrase, this.#operation.signal));
        } else session = value(await (command.type === 'profile.create' ? this.#vault.create(command.passphrase, this.#operation.signal, openingCurrent)
          : this.#vault.unlock(command.profileId, command.passphrase, this.#operation.signal)));
        openingCurrent(); await this.#activate(session, source); this.#guard(epoch);
        this.#profileIds = value(await this.#vault.listProfiles()).profileIds;
      } else {
        this.#guard(); const epoch = this.#epoch;
        value(await this.#vault.assertFresh(this.#session!.sessionId, this.#operation.signal)); this.#guard(epoch);
        if (command.type !== 'refresh') this.#touch();
        if (command.type === 'wallet.connect') {
          const session = value(await this.#adapter.connect(this.#config.network.id, this.#operation.signal)); this.#guard(epoch); this.#wallet = session;
          await this.#life!.walletChanged({ account: session.account, chainId: '31337', generation: session.generation }); this.#guard(epoch);
          await this.#refresh();
        } else if (command.type === 'ad.publish') await this.#advertise(command);
        else if (command.type === 'ad.take') {
          if (!this.#wallet) fail('WALLET_REQUIRED');
          const sent = value(await this.#exchange!.take(command.adKey, this.#wallet.account, this.#secret!)); this.#guard(epoch);
          this.#sessionIds.add(sent.sessionId); await this.#publish(sent);
        } else if (command.type === 'session.select') {
          const session = this.#exchange!.session(command.sessionId); if (!session) fail('SESSION_NOT_FOUND');
          // Exchange selection pins seller intake against eviction. The UI's single display selection also supports
          // buyers and must not be confused with that persistent, seller-only protocol fact.
          if (session.role === 'seller') value(this.#exchange!.select(command.sessionId));
          this.#sessionIds.add(command.sessionId); this.#selectedSessionId = command.sessionId;
        }
        else if (command.type === 'review.prepare') await this.#prepare(command);
        else if (command.type === 'review.confirm') await this.#confirm(command.reviewId);
        else if (command.type === 'review.cancel') await this.#cancelReview();
        else if (command.type === 'refresh') await this.#refresh();
        else if (command.type === 'chat.send') await this.#sendChat(command.tradeId, command.text);
        else if (command.type === 'backup.export') { extra = { backupBytes: (await this.#backup.exportWithStatus(this.#session!.profileId, this.#operation.signal)).bytes }; }
        else fail('UNSUPPORTED_COMMAND');
        this.#guard(epoch);
      }
      this.#busy = false; return { ok: true, ...extra, snapshot: this.snapshot() };
    } catch (error) {
      const code = error instanceof LocalnetFailure ? error.code : 'UNAVAILABLE'; this.#error = code;
      if (['LOCKED', 'CONFLICT', 'STORAGE_UNAVAILABLE'].includes(code) || ['profile.create', 'profile.unlock', 'backup.restore'].includes(command.type)) this.#drop();
      this.#busy = false; return { ok: false, code, snapshot: this.snapshot() };
    } finally {
      if (command.type === 'backup.restore') command.bytes.fill(0);
      this.#busy = false; this.#emit(); void this.#drain();
    }
  }
  async #activate(session: VaultSession, restoreSource?: string): Promise<void> {
    const epoch = this.#epoch; this.#session = session; this.#deadline = this.#mono() + IDLE_MS;
    this.#lease = value(this.#vault.captureSession(session, () => { this.#drop(); this.#emit(); })); this.#touch();
    const records = value(await this.#vault.list(session.sessionId, 'identity')); this.#guard(epoch);
    let identity: PrivateIdentityRecordV1 | null = null;
    for (const record of records) {
      if (record.schemaVersion !== 1) fail('INVALID_IDENTITY');
      const candidate = decodeIdentityPayload(record.payload);
      if (candidate.identityRecordId !== record.id) fail('INVALID_IDENTITY');
      if (candidate.state !== 'active') continue;
      if (identity) fail('INVALID_IDENTITY'); identity = candidate;
    }
    if (identity) {
      if (identity.profileId !== session.profileId && identity.profileId !== restoreSource) fail('INVALID_IDENTITY');
      const secret = decodeBase64url(identity.secretKey, 32, 32);
      try {
        if (await this.#messaging.publicKey(secret) !== identity.publicKey) fail('INVALID_IDENTITY'); this.#guard(epoch);
        this.#secret = secret; this.#publicKey = identity.publicKey;
        if (identity.profileId !== session.profileId) {
          identity = { ...identity, profileId: session.profileId };
          value(await this.#vault.commit(session.sessionId, this.#lease!.current()!.revision, [{ op: 'put', record: { id: identity.identityRecordId, kind: 'identity', schemaVersion: 1, payload: encodeIdentityPayload(identity) } }], this.#operation.signal));
          this.#guard(epoch);
        }
      } catch (error) { secret.fill(0); throw error; }
    } else {
      const pair = await this.#messaging.generate();
      try {
        this.#guard(epoch);
        identity = { format: 'p2p-offramp-messaging-identity', version: 1, profileId: session.profileId, identityRecordId: random(16),
          purpose: 'messaging', providerId: IDENTITY_PROVIDER_ID, publicKey: pair.publicKey, secretKey: encodeBase64url(pair.secretKey), state: 'active' };
        value(await this.#vault.commit(session.sessionId, this.#lease!.current()!.revision, [{ op: 'put', record: { id: identity.identityRecordId, kind: 'identity', schemaVersion: 1, payload: encodeIdentityPayload(identity) } }], this.#operation.signal));
        this.#guard(epoch); this.#secret = pair.secretKey; this.#publicKey = pair.publicKey;
      } catch (error) { pair.secretKey.fill(0); throw error; }
    }
    const request = async (args: { readonly method: string; readonly params?: readonly unknown[] }): Promise<unknown> => {
      // RPC cancellation stays in the reader; AbortSignal cannot cross the Worker wallet bridge.
      this.#guard(epoch);
      const output = await this.#provider.request(args.params === undefined ? { method: args.method } : { method: args.method, params: args.params });
      this.#guard(epoch); return output;
    };
    this.#native = new EvmChainReader({ rpc: { request }, registry: this.#config.registry, escrowLayouts: this.#config.escrowLayouts, now: this.#now });
    this.#ports = createEvmPeerAcceptancePorts({ registry: this.#config.registry, request, vault: this.#vault, session });
    this.#eventCrypto = await createRelayEventCrypto(this.#messaging, this.#secret!); this.#guard(epoch);
    this.#book = createOrderBook({ verifier: this.#eventCrypto, nowSeconds: this.#seconds, maxOrders: 32 });
    this.#exchange = createTermsExchange({ provider: this.#messaging, selfPublicKey: this.#publicKey!, ads: this.#book, registry: this.#config.registry,
      hashTerms: idOf, now: this.#seconds, peerAcceptance: this.#ports, maxSessions: 16 });
    const journal = createLifecycleJournal({ vault: this.#vault, session, validateCanonical: intent => this.#validateIntent(intent) });
    // Encoding/native validation also runs for cancellation and reconciliation. Fresh communication and time gates
    // belong only to the two spending admission points; a lost/expired D1 session must never veto recovery or exits.
    this.#journal = Object.freeze({ ...journal,
      reserve: async (intent: Intent, revision: number, signal?: AbortSignal) => {
        const admitted = await this.#spendingPreflight(intent); if (!admitted.ok) return admitted;
        return journal.reserve(intent, revision, signal);
      },
      markSending: async (id: string, signal?: AbortSignal) => {
        const listed = await journal.list(signal); if (!listed.ok) return listed;
        const intent = listed.value.find(candidate => candidate.intentId === id);
        if (!intent) return { ok: false as const, error: createCoreError('CONFLICT', { operationId: createOperationId(), readOnly: false }) };
        const admitted = await this.#spendingPreflight(intent); if (!admitted.ok) return admitted;
        return journal.markSending(id, signal);
      },
    });
    const deployment = this.#config.network.deployments[0]!;
    this.#life = createEvmTxLifecycle({ journal: this.#journal, reader: createEip1193ChainReader({ request, escrow: deployment.address, now: this.#now }),
      wallet: request, policy: evmFinalityPolicy(this.#config.network, 1, 12), now: this.#now });
    await this.#loadTrades(); this.#guard(epoch);
    // Canonical recovery keeps value-moving prepares until their block lease expires. Unknown/broadcast intents retain provenance.
    value(await this.#life.recover(this.#operation.signal)); this.#guard(epoch); this.#intents = value(await this.#journal.list(this.#operation.signal));
    this.#route = createLocalnetRelayRoute(this.#config.relayUrl, () => this.#current(epoch), this.#options.connectRelay);
    this.#pool = createRelayPool({ broker: this.#route.broker, relays: [LOCALNET_RELAY_ENDPOINT], connect: this.#route.connect,
      verifier: this.#eventCrypto, nowSeconds: this.#seconds, maxRelays: 2, onStatus: status => { if (this.#current(epoch)) { this.#relay = status[0]?.state ?? 'closed'; this.#emit(); } } });
    value(this.#pool.subscribe([{ kinds: [AD_KIND], '#t': ['p2p-offramp-ad-v1'], since: Math.max(0, this.#seconds() - 3600), limit: 50 }], {
      onEvent: event => { if (!this.#current(epoch)) return; this.#book!.ingest(event); this.#emit(); },
    }));
    value(this.#pool.subscribe([{ kinds: [1059], '#p': [this.#publicKey!], since: Math.max(0, this.#seconds() - 250_000), limit: 100 }], {
      onEvent: event => { if (!this.#current(epoch) || this.#inbox.length >= 64) return; this.#inbox.push(event); void this.#drain(); },
    }));
  }
  async #loadTrades(): Promise<void> {
    const epoch = this.#epoch, records = value(await this.#vault.list(this.#session!.sessionId, 'trade')); this.#guard(epoch);
    for (const record of records) {
      let raw: Record<string, unknown>;
      try {
        const decoded = decodeBase64url(record.payload, 1, 100_000);
        try { const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded));
          if ((parsed as { format?: unknown })?.format !== TRADE_FORMAT) continue;
          raw = fields(parsed, ['format', 'terms', 'ownPublicKey', 'counterpartyPublicKey', 'role']);
        } finally { decoded.fill(0); }
      } catch { fail('INTEGRITY_FAILURE'); }
      if (record.schemaVersion !== 1 || raw.ownPublicKey !== this.#publicKey || typeof raw.counterpartyPublicKey !== 'string' || !/^[0-9a-f]{64}$/.test(raw.counterpartyPublicKey) ||
          raw.counterpartyPublicKey === this.#publicKey || raw.role !== 'seller' && raw.role !== 'buyer') fail('INTEGRITY_FAILURE');
      const bytes = decodeBase64url(raw.terms, 1, 64 * 1024);
      try {
        const reviewed = value(await reviewTermsBytes(this.#config.registry, bytes)); this.#guard(epoch);
        if (!this.#supported(reviewed) || reviewed.unsupportedCapabilities.length || this.#trades.size >= MAX_TRADES || this.#trades.has(idOf(reviewed))) fail('INTEGRITY_FAILURE');
        this.#trades.set(idOf(reviewed), this.#newTrade(record.id, bytes, reviewed, raw.role, raw.counterpartyPublicKey, null, true));
      } finally { bytes.fill(0); }
    }
  }
  #newTrade(recordId: string, bytes: Uint8Array, reviewed: ReviewedEvmTerms, role: 'seller' | 'buyer', counterparty: string, sessionId: string | null, restored: boolean): Trade {
    const chat = value(createDurableTradeChat({ vault: this.#vault, session: this.#session!, provider: this.#messaging,
      binding: bindingOf(reviewed), participants: [this.#publicKey!, counterparty], selfPublicKey: this.#publicKey!, now: this.#seconds, nowMs: this.#now }));
    return { recordId, bytes: Uint8Array.from(bytes), reviewed, role, counterparty, sessionId, restored, acceptance: restored ? 'recheck-required' : 'none', state: null, observedAt: null, chainTimestamp: null, tokenState: null, tokenReadError: false, chat, messages: [] };
  }
  #supported(reviewed: ReviewedEvmTerms): boolean {
    const asset = this.#config.network.assets.find(candidate => candidate.id === reviewed.asset.id), deployment = this.#config.network.deployments[0]!;
    return asset !== undefined && asset.kind === reviewed.asset.kind && asset.address === reviewed.asset.address && asset.transferPolicy === 'exact-transfer' &&
      reviewed.network.id === this.#config.network.id && reviewed.deployment.id === this.#config.network.deployments[0]!.id &&
      reviewed.deployment.address === deployment.address && deployment.supportedAssetIds.includes(reviewed.asset.id);
  }
  async #saveSession(sessionId: string): Promise<void> {
    const session = this.#exchange!.session(sessionId); if (!session?.terms) return;
    const { reviewed, bytes } = session.terms, id = idOf(reviewed), epoch = this.#epoch;
    try {
      if (!this.#supported(reviewed) || reviewed.unsupportedCapabilities.length) fail('UNSUPPORTED_ASSET');
      const existing = this.#trades.get(id);
      if (existing) { existing.sessionId = sessionId; return; }
      if (this.#trades.size >= MAX_TRADES) fail('LIMIT_EXCEEDED');
      const counterparty = session.role === 'seller' ? session.buyer : session.seller, recordId = random(16);
      const plaintext = new TextEncoder().encode(JSON.stringify({ format: TRADE_FORMAT, terms: encodeBase64url(bytes), ownPublicKey: this.#publicKey, counterpartyPublicKey: counterparty, role: session.role }));
      try {
        value(await this.#vault.commit(this.#session!.sessionId, this.#lease!.current()!.revision, [{ op: 'put', record: { id: recordId, kind: 'trade', schemaVersion: 1, payload: encodeBase64url(plaintext) } }], this.#operation.signal));
      } finally { plaintext.fill(0); }
      this.#guard(epoch); this.#trades.set(id, this.#newTrade(recordId, bytes, reviewed, session.role, counterparty, sessionId, false));
    } finally { bytes.fill(0); }
  }
  async #advertise(command: Extract<LocalnetCommand, { type: 'ad.publish' }>): Promise<void> {
    const asset = this.#config.network.assets.find(entry => entry.id === command.assetId);
    if (!asset || !['native', 'erc20'].includes(asset.kind) || asset.transferPolicy !== 'exact-transfer' || !this.#config.network.deployments[0]!.supportedAssetIds.includes(asset.id)) fail('UNSUPPORTED_ASSET');
    if (!this.#wallet) fail('WALLET_REQUIRED');
    const epoch = this.#epoch, now = this.#seconds();
    const event = await createAdEvent(this.#eventCrypto!, { app: 'p2p-offramp', v: 1, orderId: random(32), revision: 1, networkId: this.#config.network.id,
      assetId: asset.id, amountMin: command.amountBaseUnits, amountMax: command.amountBaseUnits, currency: command.currency, railClass: 'bank-transfer',
      expiresAtSeconds: String(now + 3600), maker: this.#publicKey! }, now);
    this.#guard(epoch); this.#book!.ingest(event); await this.#publishEvent(event);
  }
  async #publishEvent(event: NostrEvent): Promise<void> {
    const epoch = this.#epoch, result = value(await this.#pool!.publish(event, this.#operation.signal)); this.#guard(epoch);
    if (!result.some(outcome => outcome.status === 'accepted')) fail('RELAY_ACK_UNKNOWN');
  }
  async #publish(message: SentMessage): Promise<void> { await this.#publishEvent(message.recipientWrap); }
  async #draft(session: SessionView, command: Extract<LocalnetCommand, { type: 'review.prepare'; action: 'offer' }>): Promise<Uint8Array> {
    const found = this.#book!.revalidate(adBookKey(session.seller, session.orderId)); if (!found.ok) fail('AD_UNAVAILABLE');
    const ad = found.ad.ad, asset = this.#config.network.assets.find(entry => entry.id === ad.assetId);
    if (!asset || !['native', 'erc20'].includes(asset.kind) || asset.transferPolicy !== 'exact-transfer' ||
        !this.#config.network.deployments[0]!.supportedAssetIds.includes(asset.id) || !this.#wallet || session.role !== 'seller' || !session.selected) fail('UNAUTHORIZED');
    const epoch = this.#epoch, now = this.#seconds(), deployment = this.#config.network.deployments[0]!;
    const agreement: PrivateAgreementV1 = { v: 1, orderId: session.orderId, revision: '1', fiatCurrency: ad.currency,
      fiatMinorUnits: command.fiatMinorUnits, fiatScale: command.fiatScale, paymentInstructions: command.paymentInstructions, capabilities: [], agreementSalt: random(32) };
    const agreementBytes = encodePrivateAgreement(agreement), capabilityBytes = encodeCapabilities([]);
    try {
      const privateAgreementHash = await sha256Hex(agreementBytes), capabilitiesHash = await sha256Hex(capabilityBytes); this.#guard(epoch);
      const acceptBeforeSeconds = String(now + (command.acceptForSeconds ?? 900)), escrowExpirySeconds = String(now + (command.escrowForSeconds ?? 3600));
      checkFundingWindow(acceptBeforeSeconds, escrowExpirySeconds, String(now));
      return new TextEncoder().encode(JSON.stringify({ format: TERMS_REVIEW_FORMAT, terms: { orderId: session.orderId, revision: '1', networkId: this.#config.network.id,
        deploymentId: deployment.id, seller: this.#wallet.account, buyer: session.buyerAddress, assetKind: asset.kind, asset: asset.address ?? ZERO,
        amountBaseUnits: ad.amountMin, privateAgreementHash, capabilitiesHash, sellerNonce: random(32), acceptBeforeSeconds, escrowExpirySeconds }, privateAgreement: agreement }));
    } finally { agreementBytes.fill(0); capabilityBytes.fill(0); }
  }
  async #cancelReview(): Promise<void> {
    this.#clearReview();
    if (this.#life) {
      await this.#life.walletChanged(null);
      if (this.#wallet) await this.#life.walletChanged({ account: this.#wallet.account, chainId: '31337', generation: this.#wallet.generation });
      this.#intents = value(await this.#journal!.list(this.#operation.signal));
    }
  }
  async #prepare(command: Extract<LocalnetCommand, { type: 'review.prepare' }>): Promise<void> {
    if (!this.#wallet) fail('WALLET_REQUIRED');
    await this.#cancelReview(); const epoch = this.#epoch, wallet = this.#wallet!; this.#guard(epoch);
    let reviewed: ReviewedEvmTerms, bytes: Uint8Array | null = null, sessionId: string | null = null, prepared: PreparedEvmIntent | null = null, peerBinding: PeerAcceptanceV1 | null = null;
    let supersedes: string | null = null, approvalAmount: string | null = null;
    try {
      if (command.action === 'offer' || command.action === 'accept') {
        const session = this.#exchange!.session(command.sessionId); if (!session) fail('SESSION_NOT_FOUND'); sessionId = session.id;
        if (command.action === 'offer') bytes = await this.#draft(session, command);
        else {
          if (session.role !== 'buyer' || !session.terms) fail('UNAUTHORIZED');
          value(await this.#exchange!.acceptanceStatus(session.id, 'accept', this.#operation.signal)); this.#guard(epoch); bytes = Uint8Array.from(session.terms.bytes);
        }
        reviewed = value(await reviewTermsBytes(this.#config.registry, bytes)); this.#guard(epoch);
        if (!this.#supported(reviewed) || reviewed.unsupportedCapabilities.length || wallet.account !== reviewed[session.role]) fail('UNAUTHORIZED');
        peerBinding = value(await this.#exchange!.acceptanceStatement(session.id, bytes, reviewed.acceptBeforeSeconds)).binding; this.#guard(epoch);
      } else {
        const trade = this.#trades.get(command.tradeId); if (!trade) fail('TRADE_NOT_FOUND'); reviewed = trade.reviewed;
        if (trade.role !== 'seller' || wallet.account !== reviewed.seller) fail('UNAUTHORIZED');
        if (command.action === 'release' && command.fiatReceiptConfirmed !== true) fail('FIAT_RECEIPT_CONFIRMATION_REQUIRED');
        await this.#observe(trade); this.#guard(epoch);
        if (command.action === 'fund' || command.action === 'approve') {
          if (!trade.sessionId) fail('PEER_REACCEPTANCE_REQUIRED');
          value(await this.#exchange!.acceptanceStatus(trade.sessionId, 'fund', this.#operation.signal)); this.#guard(epoch);
        }
        if (command.action === 'approve') {
          if (reviewed.asset.kind !== 'erc20') fail('UNSUPPORTED_ASSET');
          if (trade.tokenState === null) fail('TOKEN_READ_UNAVAILABLE');
          approvalAmount = nextErc20Approval(reviewed.amountBaseUnits, trade.tokenState);
          if (approvalAmount === null) fail('TOKEN_APPROVAL_UNAVAILABLE');
        } else if (command.action === 'fund' && reviewed.asset.kind === 'erc20' &&
            (trade.tokenState === null || !erc20FundingReady(reviewed.amountBaseUnits, trade.tokenState))) fail('TOKEN_ALLOWANCE_REQUIRED');
        const canonical = escrowCallFor(command.action === 'approve' ? { action: 'approve', token: reviewed.asset.address!, spender: reviewed.deployment.address, amountBaseUnits: approvalAmount! }
          : command.action === 'fund' ? { action: 'fund', domain: domainOf(reviewed), terms: evmTermsFromReviewed(reviewed) }
          : { action: command.action, escrow: reviewed.deployment.address, tradeId: idOf(reviewed) });
        const replaced = new Set(this.#intents.map(intent => intent.replacementOf).filter(id => id !== null));
        const successors = this.#intents.filter(intent => intent.binding.tradeId === command.tradeId && ['expired', 'replaced'].includes(intent.state) && !replaced.has(intent.intentId));
        if (successors.length > 1) fail('CONFLICT');
        supersedes = successors[0]?.intentId ?? null;
        prepared = value(await this.#life!.prepare({ binding: bindingOf(reviewed), action: command.action, ...canonical,
          ...(supersedes === null ? {} : { supersedes }) }, this.#operation.signal)); this.#guard(epoch);
        this.#intents = value(await this.#journal!.list(this.#operation.signal));
      }
      if (this.#wallet !== wallet) fail('LOCKED');
      const fields = [
        { label: 'Action', value: command.action }, { label: 'Wallet account', value: wallet.account }, { label: 'Chain', value: '31337' },
        { label: 'Escrow', value: reviewed.deployment.address }, { label: 'Trade ID', value: idOf(reviewed) },
        { label: 'Seller', value: reviewed.seller }, { label: 'Buyer', value: reviewed.buyer }, { label: 'Asset', value: reviewed.asset.id },
        { label: 'Crypto base units', value: reviewed.amountBaseUnits }, { label: 'Fiat currency', value: reviewed.agreement.fiatCurrency },
        { label: 'Fiat minor units', value: reviewed.agreement.fiatMinorUnits }, { label: 'Fiat decimal places', value: String(reviewed.agreement.fiatScale) },
        { label: 'Payment instructions', value: reviewed.agreement.paymentInstructions },
        { label: 'Accept before (unix seconds)', value: reviewed.acceptBeforeSeconds }, { label: 'Refund after (unix seconds)', value: reviewed.escrowExpirySeconds },
      ];
      if (reviewed.asset.kind === 'erc20') fields.push({ label: 'Token contract', value: reviewed.asset.address! });
      if (approvalAmount !== null) fields.push({ label: 'Allowance spender', value: reviewed.deployment.address },
        { label: 'New allowance in base units', value: approvalAmount }, { label: 'Allowance change', value: approvalAmount === '0' ? 'Reset existing allowance to zero.' : 'Approve only this trade\'s exact principal.' });
      if (command.action === 'release') fields.push({ label: 'Bank receipt', value: 'Seller explicitly confirmed receipt in their bank account.' });
      if (supersedes !== null) fields.push({ label: 'Supersedes reconciled intent', value: supersedes }, { label: 'Transaction nonce', value: prepared!.request.nonce });
      const publicReview: LocalnetReview = { id: random(16), action: command.action, expiresAtMs: this.#now() + REVIEW_MS, fields,
        walletRequests: prepared ? [reviewedTransactionRequest(prepared.request)] : [reviewedTermsRequest(wallet.account, domainOf(reviewed), evmTermsFromReviewed(reviewed)),
          { method: 'eth_signTypedData_v4', params: [wallet.account, peerAcceptanceTypedData(domainOf(reviewed), peerBinding!)] }] };
      this.#review = { public: publicReview, epoch, wallet, created: this.#mono(), bytes, sessionId, tradeId: idOf(reviewed), peerBinding, prepared }; bytes = null;
    } finally { bytes?.fill(0); }
  }
  async #confirm(reviewId: string): Promise<void> {
    const review = this.#review;
    if (!review || review.public.id !== reviewId || review.epoch !== this.#epoch || this.#wallet !== review.wallet || this.#now() >= review.public.expiresAtMs || this.#mono() - review.created >= REVIEW_MS) fail('REVIEW_EXPIRED');
    this.#review = null; const epoch = this.#epoch; // one-shot before any awaited work or physical prompt
    try {
      if (review.prepared) {
        value(await this.#life!.submit(review.prepared, this.#operation.signal)); this.#guard(epoch);
      } else {
        const reviewed = value(await reviewTermsBytes(this.#config.registry, review.bytes!)); this.#guard(epoch);
        const terms = evmTermsFromReviewed(reviewed), binding = review.peerBinding!;
        const signature = value(await this.#adapter.signTerms(review.wallet, domainOf(reviewed), terms, binding.role, this.#operation.signal)); this.#guard(epoch);
        const peer = value(await this.#adapter.signPeerAcceptance(review.wallet, terms, { role: binding.role, ownMessagingKey: binding.ownMessagingKey,
          counterpartyMessagingKey: binding.counterpartyMessagingKey, notAfterSeconds: binding.notAfterSeconds, nowSeconds: String(this.#seconds()) }, this.#operation.signal)); this.#guard(epoch);
        if (JSON.stringify(peer.binding) !== JSON.stringify(binding)) fail('INTEGRITY_FAILURE');
        const acceptance = { binding, termsSignature: `0x${hex(signature)}`, bindingSignature: `0x${hex(peer.bindingSignature)}` };
        const message = value(await (review.public.action === 'offer' ? this.#exchange!.offerWithAcceptance(review.sessionId!, review.bytes!, acceptance, this.#secret!)
          : this.#exchange!.acceptWithAcceptance(review.sessionId!, review.bytes!, acceptance, this.#secret!))); this.#guard(epoch);
        await this.#saveSession(message.sessionId); this.#guard(epoch); await this.#publish(message);
      }
      await this.#refresh();
    } catch (error) {
      if (this.#current(epoch)) this.#intents = value(await this.#journal!.list(this.#operation.signal));
      throw error;
    } finally { review.bytes?.fill(0); }
  }
  async #validateIntent(intent: Readonly<Intent>): Promise<CoreResult<void>> {
    try {
      this.#guard(); const epoch = this.#epoch, trade = this.#trades.get(intent.binding.tradeId);
      if (!trade || intent.binding.chain !== 'evm' || intent.binding.networkId !== trade.reviewed.network.id || intent.binding.deploymentId !== trade.reviewed.deployment.id ||
          intent.account !== trade.reviewed.seller) fail('INTEGRITY_FAILURE');
      const r = trade.reviewed;
      const request = JSON.parse(intent.preparedRequest) as Record<string, unknown>;
      const approvalAmount = intent.action === 'approve' ? this.#approvalAmount(r, request.data) : null;
      const canonical = escrowCallFor(intent.action === 'approve' ? { action: 'approve', token: r.asset.address!, spender: r.deployment.address, amountBaseUnits: approvalAmount! }
        : intent.action === 'fund' ? { action: 'fund', domain: domainOf(r), terms: evmTermsFromReviewed(r) }
        : { action: intent.action, escrow: r.deployment.address, tradeId: idOf(r) });
      if (request.chainId !== '31337' || request.from !== r.seller || intent.expectedEscrowState !== canonical.expectedEscrowState ||
          request.to !== canonical.call.to || request.data !== canonical.call.data || request.value !== canonical.call.value) fail('INTEGRITY_FAILURE');
      value(await this.#native!.validateLive(r.network.id, r.deployment.id, this.#operation.signal)); this.#guard(epoch);
      return { ok: true, value: undefined };
    } catch (error) { return this.#preflightFailure(error); }
  }
  #approvalAmount(reviewed: ReviewedEvmTerms, data: unknown): string {
    if (reviewed.asset.kind !== 'erc20') fail('INTEGRITY_FAILURE');
    for (const amountBaseUnits of ['0', reviewed.amountBaseUnits]) {
      if (escrowCallFor({ action: 'approve', token: reviewed.asset.address!, spender: reviewed.deployment.address, amountBaseUnits }).call.data === data) return amountBaseUnits;
    }
    return fail('INTEGRITY_FAILURE');
  }
  #preflightFailure(error: unknown): CoreResult<never> {
    const code = error instanceof LocalnetFailure && ['LOCKED', 'CONFLICT', 'EXPIRED', 'UNAUTHORIZED'].includes(error.code) ? error.code as 'LOCKED' | 'CONFLICT' | 'EXPIRED' | 'UNAUTHORIZED' : 'INTEGRITY_FAILURE';
    return { ok: false, error: createCoreError(code, { operationId: createOperationId(), readOnly: false }) };
  }
  async #spendingPreflight(intent: Readonly<Intent>): Promise<CoreResult<void>> {
    try {
      this.#guard(); const epoch = this.#epoch, trade = this.#trades.get(intent.binding.tradeId);
      if (!trade || intent.state !== 'prepared' || this.#wallet?.account !== intent.account) fail('UNAUTHORIZED');
      const r = trade.reviewed;
      const anchor = value(await this.#native!.validateLive(r.network.id, r.deployment.id, this.#operation.signal)); this.#guard(epoch);
      // Latest chain time (not UI labels) controls admission. Runtime/genesis were checked at the canonical anchor.
      const head = await this.#provider.request({ method: 'eth_getBlockByNumber', params: ['latest', false] }) as { timestamp?: unknown };
      this.#guard(epoch);
      if (typeof head?.timestamp !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(head.timestamp)) fail('INTEGRITY_FAILURE');
      const time = BigInt(head.timestamp);
      if (time < BigInt(anchor.timestampSeconds)) fail('INTEGRITY_FAILURE');
      if (intent.action === 'fund' || intent.action === 'approve') {
        checkFundingWindow(r.acceptBeforeSeconds, r.escrowExpirySeconds, time.toString());
        if (!trade.sessionId) fail('UNAUTHORIZED');
        value(await this.#exchange!.acceptanceStatus(trade.sessionId, 'fund', this.#operation.signal)); this.#guard(epoch);
        if (r.asset.kind === 'erc20') {
          const state = await this.#tokenState(r); this.#guard(epoch);
          if (intent.action === 'fund' ? !erc20FundingReady(r.amountBaseUnits, state) :
              nextErc20Approval(r.amountBaseUnits, state) !== this.#approvalAmount(r, (JSON.parse(intent.preparedRequest) as Record<string, unknown>).data)) fail('UNAUTHORIZED');
        } else if (intent.action === 'approve') fail('UNAUTHORIZED');
      } else if (intent.action === 'refund' && time < BigInt(r.escrowExpirySeconds) || intent.action === 'release' && time >= BigInt(r.escrowExpirySeconds)) fail('EXPIRED');
      return { ok: true, value: undefined };
    } catch (error) { return this.#preflightFailure(error); }
  }
  async #tokenState(reviewed: ReviewedEvmTerms, escrowAnchor?: LiveAnchor): Promise<Erc20FundingState> {
    if (reviewed.asset.kind !== 'erc20') fail('UNSUPPORTED_ASSET');
    const epoch = this.#epoch, anchor = escrowAnchor ?? value(await this.#native!.validateLive(reviewed.network.id, reviewed.deployment.id, this.#operation.signal)); this.#guard(epoch);
    return readErc20FundingState({ anchor, genesisHash: this.#config.network.genesisHash, token: reviewed.asset.address!, seller: reviewed.seller,
      spender: reviewed.deployment.address, signal: this.#operation.signal, assertCurrent: () => this.#guard(epoch),
      request: async request => { const send = this.#provider.request; this.#guard(epoch); const output = await send.call(this.#provider, request); this.#guard(epoch); return output; } });
  }
  async #observe(trade: Trade): Promise<void> {
    trade.observedAt = null; trade.chainTimestamp = null; trade.tokenState = null; trade.tokenReadError = false;
    const epoch = this.#epoch, read = value(await this.#native!.read(bindingOf(trade.reviewed), { generation: epoch, requestSequence: ++this.#sequence,
      signal: this.#operation.signal }, expectedOf(trade.reviewed))); this.#guard(epoch);
    // Once funded, allowances are irrelevant to release/refund and must not add a new veto to either exit.
    if (trade.reviewed.asset.kind === 'erc20' && read.escrow.state === 'absent') {
      try { trade.tokenState = await this.#tokenState(trade.reviewed, read.anchor); this.#guard(epoch); }
      catch (error) {
        // Failure of this unfunded trade's token guidance cannot hide another trade's funded exit on refresh/unlock.
        // The escrow anchor was validated above, outside this fallback. Final identity checks and vault invalidation
        // still propagate; malformed/unavailable token guidance keeps only this trade's approval/funding disabled.
        this.#guard(epoch);
        if (error instanceof LocalnetFailure && !['INTEGRITY_FAILURE', 'UNAVAILABLE', 'TIMEOUT'].includes(error.code)) throw error;
        trade.tokenReadError = true;
      }
    }
    trade.state = read.escrow.state; trade.observedAt = read.observation.observedAt; trade.chainTimestamp = read.anchor.timestampSeconds;
  }
  async #refresh(): Promise<void> {
    const epoch = this.#epoch; this.#guard(epoch);
    const intents = value(await this.#journal!.list(this.#operation.signal)); this.#guard(epoch);
    for (const intent of intents) {
      if (!this.#trades.has(intent.binding.tradeId)) continue;
      const reconciled = value(await this.#life!.reconcile(intent.intentId, this.#operation.signal)); this.#guard(epoch);
      // An abandoned preparation first loses its imported label, then receives the native nonce classification.
      // Bound this catch-up to one additional read; neither pass can resend or waive the canonical block lease.
      if (intent.state === 'prepared' && reconciled.intent.state === 'reorged') {
        value(await this.#life!.reconcile(intent.intentId, this.#operation.signal)); this.#guard(epoch);
      }
    }
    this.#intents = value(await this.#journal!.list(this.#operation.signal));
    for (const trade of this.#trades.values()) {
      await this.#observe(trade); this.#guard(epoch);
      if (trade.sessionId) { trade.acceptance = value(await this.#exchange!.acceptanceStatus(trade.sessionId, 'display', this.#operation.signal)).state; this.#guard(epoch); }
      const history = value(await trade.chat.list(this.#secret!, this.#operation.signal)); this.#guard(epoch);
      trade.messages = history.messages.map(item => ({ id: item.message.messageId, direction: item.direction, text: item.message.body, createdAt: item.message.createdAt }));
    }
  }
  async #sendChat(tradeId: string, text: string): Promise<void> {
    const trade = this.#trades.get(tradeId); if (!trade) fail('TRADE_NOT_FOUND'); const epoch = this.#epoch;
    const bytes = value(encodeMessage({ format: 'p2p-offramp-message', version: 1, binding: bindingOf(trade.reviewed), termsHash: tradeId,
      messageId: random(16), sender: this.#publicKey!, recipient: trade.counterparty, kind: 'text', createdAt: this.#now(), body: text }));
    try { const sent = value(await trade.chat.send(bytes, this.#secret!, this.#operation.signal)); this.#guard(epoch); await this.#publishEvent(sent.recipientWrap); await this.#refresh(); }
    finally { bytes.fill(0); }
  }
  async #drain(): Promise<void> {
    if (this.#busy || this.#draining || !this.#current()) return;
    this.#draining = true; const epoch = this.#epoch;
    try {
      while (this.#inbox.length && this.#current(epoch)) {
        const event = this.#inbox.shift()!;
        const result = await this.#exchange!.receive(event, this.#secret!); this.#guard(epoch);
        if (result.ok && !('own' in result.value)) {
          this.#sessionIds.add(result.value.sessionId); await this.#saveSession(result.value.sessionId); this.#guard(epoch);
          const session = this.#exchange!.session(result.value.sessionId), trade = session?.terms ? this.#trades.get(session.terms.hash) : undefined;
          if (trade) { trade.acceptance = value(await this.#exchange!.acceptanceStatus(result.value.sessionId, 'display', this.#operation.signal)).state; this.#guard(epoch); await this.#observe(trade); }
        } else if (!result.ok && result.code !== 'DUPLICATE') {
          for (const trade of this.#trades.values()) {
            const received = await trade.chat.receive(event, this.#secret!, this.#operation.signal); this.#guard(epoch);
            if (received.ok) {
              const history = value(await trade.chat.list(this.#secret!, this.#operation.signal)); this.#guard(epoch);
              trade.messages = history.messages.map(item => ({ id: item.message.messageId, direction: item.direction, text: item.message.body, createdAt: item.message.createdAt })); break;
            }
          }
        }
        this.#emit();
      }
    } catch (error) { if (this.#current(epoch)) { this.#error = error instanceof LocalnetFailure ? error.code : 'UNAVAILABLE'; this.#emit(); } }
    finally { this.#draining = false; this.#emit(); }
  }
}
