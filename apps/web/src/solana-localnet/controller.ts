/** One local trade owner per Worker. Canonical receipts and all native intents remain in the encrypted vault. */
import { TermsError } from '../../../../packages/domain/index.ts';
import { EncryptedVaultService, EncryptedBackupService, type VaultStore } from '../../../../packages/storage/index.ts';
import { decodeBase64url, encodeBase64url, parseStrictJsonBytes, ValidationError, type PrivateRecordV1, type TradeBinding, type VaultSession, type VaultSessionLease } from '../../../../packages/schemas/index.ts';
import { createSolanaEscrowClient, SolanaVaultJournal, createRecoveryDocument, projectNativeFundingReview, parseRecoveryDocument, recoveryBinding, recoveryExits, decodeBase64,
  encodeBase64, unsignedTransaction, type SolanaEscrowClient, type PreparedSolanaAction, type SolanaRecoveryDocument,
  type BoundSolanaTrade, type SolanaWalletPort, type SolanaWalletSession, type SolanaReadRpc, type SolanaEscrowSnapshot,
  type SolanaIntentRecord, type PreparedSolanaFunding } from '../../../../packages/chain-solana/localnet.ts';
import { parseSolanaFundingProposal, createSolanaFundingProposalRecord, decodeSolanaFundingProposalRecord,
  SOLANA_FUNDING_PROPOSAL_RECORD_FORMAT, type NativeSolanaFundingTerms, type SolanaFundingProposalRecord } from './funding-proposal.ts';
import type { SolanaLocalnetConfig } from './config.ts';
import type { SolanaCommand, SolanaResult, SolanaReview, SolanaSnapshot, SolanaTradeView, SolanaFundingProposalView } from './protocol.ts';
import { fields, fail, parseSolanaCommand, SolanaUiFailure } from './validation.ts';

const RECORD_FORMAT = 'p2p-offramp/solana-local-recovery/v1';
const MAX_TRADES = 8, REVIEW_MS = 30000, IDLE_MS = 300000;
const hex = (bytes: Uint8Array): string => Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
const randomId = () => hex(crypto.getRandomValues(new Uint8Array(16)));
const pending = (r: SolanaIntentRecord) => !['finalized', 'failed', 'dropped', 'cancelled'].includes(r.state);
function value<T>(r: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly code: string } }): T {
  return r.ok ? r.value : fail(r.error.code);
}
interface Trade {
  readonly document: SolanaRecoveryDocument; readonly bound: BoundSolanaTrade; readonly role: 'seller' | 'buyer'; readonly restored: boolean;
  snapshot: SolanaEscrowSnapshot | null; observedAt: number; intents: readonly SolanaIntentRecord[];
}
interface Proposal {
  readonly record: PrivateRecordV1; readonly value: SolanaFundingProposalRecord; readonly bound: BoundSolanaTrade | null;
  readonly bindingStatus: SolanaFundingProposalView['bindingStatus'];
  readonly observation: { snapshot: SolanaEscrowSnapshot | null; observedAt: number; intents: readonly SolanaIntentRecord[] };
}
const bindingId = (binding: TradeBinding): string => JSON.stringify([binding.chain, binding.networkId, binding.deploymentId, binding.tradeId]);
function reservations(terms: Pick<NativeSolanaFundingTerms, 'genesisHash' | 'programId' | 'seller' | 'sellerNonce'>, escrow: string | null): string[] {
  return [`seed:${JSON.stringify([terms.genesisHash, terms.programId, terms.seller, terms.sellerNonce])}`,
    ...(escrow === null ? [] : [`address:${JSON.stringify([terms.genesisHash, escrow])}`])];
}
interface FundingWalletOwner {
  readonly proposalId: string; readonly proposal: Proposal; readonly bound: BoundSolanaTrade;
  readonly wallet: SolanaWalletSession; readonly client: SolanaEscrowClient;
  readonly profileId: string; readonly sessionId: string; readonly epoch: number;
}
interface ReviewBase {
  readonly public: SolanaReview; readonly wallet: SolanaWalletSession; readonly epoch: number; readonly client: SolanaEscrowClient;
}
type Review = (ReviewBase & { readonly kind: 'recovery'; readonly prepared: PreparedSolanaAction })
  | (ReviewBase & { readonly kind: 'funding'; readonly prepared: PreparedSolanaFunding; readonly owner: FundingWalletOwner });
function fundingFields(view: ReturnType<typeof projectNativeFundingReview>): SolanaReview['fields'] {
  return [
    ['Action', 'fund'], ['Network', view.network.id], ['Network genesis', view.network.genesisHash],
    ['Deployment', view.deployment.id], ['Immutable program', view.deployment.programId],
    ['ProgramData address', view.deployment.programDataAddress], ['ProgramData SHA-256', view.deployment.programDataSha256],
    ['Artifact SHA-256', view.deployment.artifactSha256], ['Deployment pin evidence', 'Supplied bound trade'],
    ['Escrow', view.escrow], ['Terms SHA-256', view.terms.hash], ['Order ID', view.terms.orderId],
    ['Seller', view.terms.seller], ['Buyer', view.terms.buyer], ['Seller nonce', view.terms.sellerNonce],
    ['Revision', view.terms.revision], ['Private agreement SHA-256', view.terms.privateAgreementHash],
    ['Capabilities SHA-256', view.terms.capabilitiesHash], ['Asset', 'Native SOL (' + view.principal.assetId + ')'],
    ['Principal (lamports)', view.principal.amountBaseUnits], ['Funding source', view.fundingSource.address],
    ['Acceptance deadline (chain seconds)', view.terms.acceptBeforeSeconds], ['Escrow expiry (chain seconds)', view.terms.escrowExpirySeconds],
    ['Fee payer', view.transaction.feePayer], ['Recent blockhash', view.transaction.blockhash],
    ['Last valid block height', view.transaction.lastValidBlockHeight], ['Height evidence', 'Supplied metadata; confirmation rechecks freshness'],
    ['Message (base64)', view.transaction.message], ['Network fee (lamports)', 'Unknown'], ['Escrow rent (lamports)', 'Unknown'],
    ['Total debit (lamports)', 'Unknown'], ['Peer acceptance', 'Not established'], ['Funding outcome', 'Not established'],
  ].map(([label, value]) => ({ label: label!, value: value! }));
}
export interface SolanaControllerOptions {
  readonly store?: VaultStore; readonly onSnapshot?: (snapshot: SolanaSnapshot) => void;
  readonly now?: () => number; readonly monotonicNow?: () => number;
}
export class SolanaRecoveryController {
  readonly #config: SolanaLocalnetConfig; readonly #walletPort: SolanaWalletPort; readonly #rpc: SolanaReadRpc;
  readonly #options: SolanaControllerOptions; readonly #vault: EncryptedVaultService; readonly #backup: EncryptedBackupService;
  #session: VaultSession | null = null; #lease: VaultSessionLease | null = null; #journal: SolanaVaultJournal | null = null;
  #client: SolanaEscrowClient | null = null; #wallet: SolanaWalletSession | null = null; #review: Review | null = null;
  #fundingWallet: FundingWalletOwner | null = null;
  #trades = new Map<string, Trade>(); #proposals = new Map<string, Proposal>(); #profiles: readonly string[] = []; #epoch = 0; #busy = false; #closed = false;
  #dropping = false; #error: string | null = null; #abort = new AbortController(); #deadline = 0; #lastMono = 0;
  #idle: ReturnType<typeof setTimeout> | undefined; #reviewTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(config: SolanaLocalnetConfig, wallet: SolanaWalletPort, rpc: SolanaReadRpc, options: SolanaControllerOptions = {}) {
    if (config.ReleaseEnabled !== 0 || config.network.chain !== 'solana' || config.network.environment !== 'local') fail('WRONG_CHAIN');
    this.#config = config; this.#walletPort = wallet; this.#rpc = rpc; this.#options = options;
    this.#vault = new EncryptedVaultService(options.store, crypto, { lifecycle: false });
    this.#backup = new EncryptedBackupService(options.store);
  }
  #now = () => (this.#options.now ?? Date.now)();
  #mono = () => (this.#options.monotonicNow ?? (() => performance.now()))();
  #current(epoch = this.#epoch): boolean {
    const now = this.#mono();
    if (!Number.isFinite(now) || now < this.#lastMono || this.#session && now >= this.#deadline) { this.#drop(); return false; }
    this.#lastMono = now;
    return !this.#closed && epoch === this.#epoch && this.#session !== null && !!this.#lease?.current();
  }
  #guard(epoch = this.#epoch): void { if (!this.#current(epoch)) fail('LOCKED'); }
  #touch(): void {
    clearTimeout(this.#idle); this.#deadline = this.#mono() + IDLE_MS;
    this.#idle = setTimeout(() => { this.#drop(); this.#emit(); }, IDLE_MS);
  }
  #clearReview(): void { this.#review = null; clearTimeout(this.#reviewTimer); }
  #drop(): void {
    if (this.#dropping) return; this.#dropping = true;
    this.#epoch++; this.#abort.abort(); this.#abort = new AbortController(); clearTimeout(this.#idle); this.#clearReview();
    this.#client?.dispose(); this.#client = null; this.#journal?.dispose(); this.#journal = null;
    this.#wallet = null; this.#fundingWallet = null; this.#lease?.dispose(); this.#lease = null; this.#session = null;
    this.#vault.lockAll(); this.#trades.clear(); this.#proposals.clear(); this.#dropping = false;
  }
  /** Called synchronously by the Worker event handler. No existing prepared handle survives a wallet change. */
  walletChanged(): void {
    this.#epoch++; this.#abort.abort(); this.#abort = new AbortController(); this.#clearReview();
    this.#client?.dispose(); this.#client = null; this.#wallet = null; this.#fundingWallet = null; this.#emit();
  }
  dispose(): void { if (!this.#closed) { this.#drop(); this.#closed = true; this.#vault.dispose(); this.#backup.dispose(); } }
  #native(): SolanaEscrowClient {
    this.#guard();
    this.#client ??= createSolanaEscrowClient({ rpc: this.#rpc, wallet: this.#walletPort, journal: this.#journal!, registry: this.#config.registry,
      clock: { now: this.#now }, margins: this.#config.margins, walletChain: 'solana:localnet' });
    return this.#client;
  }
  #inventory(): readonly { readonly identity: string; readonly reservations: readonly string[] }[] {
    return [...[...this.#trades.values()].map(trade => ({ identity: bindingId(trade.bound.binding),
      reservations: reservations(trade.document.terms, trade.bound.escrow.address) })),
    ...[...this.#proposals.values()].map(proposal => ({ identity: bindingId(proposal.value.binding),
      reservations: reservations(proposal.value.proposal.terms, proposal.bound?.escrow.address ?? null) }))];
  }
  #capacity(binding: TradeBinding): void {
    const identities = new Set(this.#inventory().map(item => item.identity));
    if (!identities.has(bindingId(binding)) && identities.size >= MAX_TRADES) fail('LIMIT_EXCEEDED');
  }
  #retainedProposal(record: PrivateRecordV1, data: SolanaFundingProposalRecord): Proposal {
    const config = this.#config, network = config.network, deployment = network.deployments[0]!, pins = data.configuration;
    const compatible = data.binding.networkId === network.id && data.binding.deploymentId === deployment.id &&
      data.proposal.terms.genesisHash === network.genesisHash && data.proposal.terms.programId === deployment.address &&
      pins.registrySha256 === config.registrySha256 && deployment.runtime.kind === 'solana-program' &&
      pins.programDataSha256 === deployment.runtime.programDataSha256 && pins.artifactSha256 === deployment.artifactSha256 &&
      pins.assetId === network.assets[0]!.id && pins.rpcUrl === config.rpcUrl &&
      pins.margins.submitMarginSeconds === config.margins.submitMarginSeconds && pins.margins.releaseMarginSeconds === config.margins.releaseMarginSeconds;
    const bound = compatible ? this.#native().bind(data.binding, data.proposal.terms) : null;
    return Object.freeze({ record: Object.freeze({ ...record }), value: data, bound: bound?.ok ? bound.value : null,
      bindingStatus: !compatible ? 'configuration-mismatch' : bound?.ok ? 'available' : 'unsupported',
      observation: { snapshot: null, observedAt: 0, intents: [] } });
  }
  #emit(): void { try { this.#options.onSnapshot?.(this.snapshot()); } catch { /* Display observers have no authority. */ } }
  snapshot(): SolanaSnapshot {
    const open = this.#current(), wallet = this.#wallet;
    const trades: SolanaTradeView[] = open ? [...this.#trades.values()].map(trade => {
      const d = trade.document, s = trade.snapshot, fresh = s !== null && this.#now() >= trade.observedAt && this.#now() - trade.observedAt < 60000;
      const exits = fresh ? recoveryExits(d, trade.bound, s!, this.#config.margins) : null;
      const eligible = (name: 'release' | 'refund' | 'payout') => !!wallet && wallet.tradeId === d.termsHash &&
        !trade.intents.some(pending) && exits?.ok === true && exits.value.exits.some(e => e.exit === name && e.open && e.roles.includes(trade.role));
      const custody = s?.custody, blockers: readonly string[] = custody?.payoutBlockedBy ?? [];
      const topUp = custody?.kind === 'native' && blockers.includes('rent-shortfall') && custody.rentExemptMinimum !== null
        ? (BigInt(custody.rentExemptMinimum) - (BigInt(custody.lamports) - BigInt(custody.principalHeld))).toString() : null;
      return { id: d.termsHash, role: trade.role, seller: d.roles.seller, buyer: d.roles.buyer, amountBaseUnits: d.terms.amountBaseUnits,
        deadlineSeconds: d.terms.escrowExpirySeconds, escrow: d.escrow.address, state: fresh && s?.escrow ? s.escrow.state : 'unverified',
        paidOut: fresh && s?.escrow?.paidOut === true, chainTimeSeconds: fresh ? s!.live.timestampSeconds : null, restored: trade.restored,
        intents: trade.intents.map(r => ({ id: r.intentId, action: r.action, state: r.state, signature: r.signature })),
        payoutBlockedBy: blockers, rentTopUpLamports: topUp, canRelease: eligible('release'), canRefund: eligible('refund'),
        canPayout: eligible('payout') && !blockers.includes('rent-unknown') };
    }) : [];
    const inventory = open ? this.#inventory() : [], groups = new Map<string, Set<string>>();
    for (const item of inventory) for (const key of item.reservations) {
      const identities = groups.get(key) ?? new Set<string>(); identities.add(item.identity); groups.set(key, identities);
    }
    const recovered = new Set(open ? [...this.#trades.values()].map(trade => bindingId(trade.bound.binding)) : []);
    const proposals: SolanaFundingProposalView[] = open ? [...this.#proposals.values()].map(proposal => {
      const data = proposal.value, escrow = proposal.bound?.escrow.address ?? null;
      const observation = this.#paired(proposal) ?? proposal.observation, read = observation.snapshot;
      const fresh = read !== null && this.#now() >= observation.observedAt && this.#now() - observation.observedAt < 60000;
      return { id: proposal.record.id, binding: data.binding, terms: data.proposal.terms, escrow,
        restored: data.originProfileId !== this.#session!.profileId, bindingStatus: proposal.bindingStatus,
        recoveryRetained: recovered.has(bindingId(data.binding)),
        state: fresh ? read.escrow?.state ?? 'absent' : 'unverified', chainTimeSeconds: fresh ? read.live.timestampSeconds : null,
        walletConnected: this.#fundingWallet?.proposal === proposal && this.#fundingReferences(this.#fundingWallet),
        intents: observation.intents.map(r => ({ id: r.intentId, action: r.action, state: r.state, signature: r.signature, replacementOf: r.replacementOf })),
        escrowConflict: reservations(data.proposal.terms, escrow).some(key => (groups.get(key)?.size ?? 0) > 1) };
    }) : [];
    return { version: 1, phase: this.#busy ? 'working' : !open ? 'locked' : 'ready', profileIds: this.#profiles,
      profileId: open ? this.#session!.profileId : null, wallet: open && wallet ? { address: wallet.address, tradeId: wallet.tradeId } : null,
      trades, proposals, tradeCapacity: { used: new Set(inventory.map(item => item.identity)).size, limit: MAX_TRADES }, review: open ? this.#review?.public ?? null : null, error: this.#error };
  }
  #bind(document: SolanaRecoveryDocument): BoundSolanaTrade {
    const network = this.#config.network, deployment = network.deployments[0]!;
    if (document.network.networkId !== network.id || document.network.genesisHash !== network.genesisHash || document.network.environment !== 'local' ||
        document.network.deploymentId !== deployment.id || document.network.programId !== deployment.address ||
        deployment.runtime.kind !== 'solana-program' || document.network.programDataSha256 !== deployment.runtime.programDataSha256 ||
        document.network.artifactSha256 !== deployment.artifactSha256 || document.asset.kind !== 'native' || document.asset.decimals !== 9 ||
        document.asset.id !== network.assets[0]!.id) fail('WRONG_CHAIN');
    return value(this.#native().bind(recoveryBinding(document), document.terms));
  }
  async #recordId(hash: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${RECORD_FORMAT}\0${hash}`));
    return hex(new Uint8Array(digest).subarray(0, 16));
  }
  async #activate(session: VaultSession): Promise<void> {
    const epoch = this.#epoch; this.#session = session; this.#touch();
    this.#lease = value(this.#vault.captureSession(session, () => { this.#drop(); this.#emit(); }));
    this.#journal = new SolanaVaultJournal(this.#vault, session);
    const records = value(await this.#vault.list(session.sessionId, 'trade')); this.#guard(epoch);
    const trades = new Map<string, Trade>(), proposals = new Map<string, Proposal>(), proposalBindings = new Set<string>();
    for (const record of records) {
      const raw = parseStrictJsonBytes(decodeBase64url(record.payload, 1, 16384), 16384) as Record<string, unknown>;
      if (raw?.format === SOLANA_FUNDING_PROPOSAL_RECORD_FORMAT) {
        const data = await decodeSolanaFundingProposalRecord(record); this.#guard(epoch);
        const identity = bindingId(data.binding);
        if (proposalBindings.has(identity) || proposals.has(record.id)) fail('INTEGRITY_FAILURE');
        proposalBindings.add(identity); proposals.set(record.id, this.#retainedProposal(record, data)); continue;
      }
      if (!raw || raw.format !== RECORD_FORMAT) continue;
      const data = fields(raw, ['format', 'document', 'role', 'originProfileId']);
      if (record.schemaVersion !== 1 || !['seller', 'buyer'].includes(data.role as string) || typeof data.originProfileId !== 'string' || !/^[0-9a-f]{32}$/.test(data.originProfileId)) fail('INTEGRITY_FAILURE');
      const document = parseRecoveryDocument(data.document), bound = this.#bind(document);
      if (record.id !== await this.#recordId(document.termsHash) || trades.has(document.termsHash)) fail('INTEGRITY_FAILURE');
      this.#guard(epoch);
      trades.set(document.termsHash, { document, bound, role: data.role as 'seller' | 'buyer', restored: data.originProfileId !== session.profileId,
        snapshot: null, observedAt: 0, intents: [] });
    }
    this.#guard(epoch); this.#trades = trades; this.#proposals = proposals;
    for (const proposal of proposals.values()) if (proposal.bound) {
      proposal.observation.intents = value(await this.#native().intents(proposal.bound)); this.#guard(epoch);
    }
    await this.#refresh(true);
  }
  async #refresh(recover = false): Promise<void> {
    const epoch = this.#epoch, client = this.#native();
    for (const trade of this.#trades.values()) {
      trade.snapshot = null;
      try {
        trade.intents = value(await (recover ? client.recover(trade.bound) : client.reconcile(trade.bound))); this.#guard(epoch);
        const read = value(await client.read(trade.bound)); this.#guard(epoch);
        if (!read.escrow || read.custody?.kind !== 'native') fail('FUNDED_ESCROW_REQUIRED');
        trade.snapshot = read; trade.observedAt = this.#now();
      } catch (error) { this.#guard(epoch); this.#error = error instanceof SolanaUiFailure ? error.code : 'UNAVAILABLE'; }
    }
  }
  async #import(text: string, role: 'seller' | 'buyer'): Promise<void> {
    const epoch = this.#epoch, document = parseRecoveryDocument(parseStrictJsonBytes(new TextEncoder().encode(text), 16384));
    if (this.#trades.has(document.termsHash)) fail('CONFLICT');
    const bound = this.#bind(document); this.#capacity(bound.binding);
    const client = this.#native(), read = value(await client.read(bound)); this.#guard(epoch);
    if (!read.escrow || read.custody?.kind !== 'native') fail('FUNDED_ESCROW_REQUIRED');
    const id = await this.#recordId(document.termsHash); this.#guard(epoch);
    const payload = encodeBase64url(new TextEncoder().encode(JSON.stringify({ format: RECORD_FORMAT, document, role, originProfileId: this.#session!.profileId })));
    value(await this.#vault.commit(this.#session!.sessionId, this.#lease!.current()!.revision, [{ op: 'put', record: { id, kind: 'trade', schemaVersion: 1, payload } }], this.#abort.signal, () => this.#guard(epoch)));
    this.#guard(epoch);
    this.#trades.set(document.termsHash, { document, bound, role, restored: false, snapshot: read, observedAt: this.#now(), intents: [] });
    await this.#refresh(true);
  }
  async #importProposal(text: string): Promise<void> {
    const epoch = this.#epoch, session = this.#session!, signal = this.#abort.signal, bytes = new TextEncoder().encode(text);
    let parsed: Awaited<ReturnType<typeof parseSolanaFundingProposal>>;
    try { parsed = await parseSolanaFundingProposal(bytes); }
    catch (error) { if (error instanceof TermsError || error instanceof ValidationError) fail(error.code); throw error; }
    this.#guard(epoch);
    const binding: TradeBinding = { chain: 'solana', networkId: this.#config.network.id,
      deploymentId: this.#config.network.deployments[0]!.id, tradeId: parsed.termsHash }, identity = bindingId(binding);
    if ([...this.#trades.values()].some(trade => bindingId(trade.bound.binding) === identity)) fail('CONFLICT');
    const retained = [...this.#proposals.values()].find(proposal => bindingId(proposal.value.binding) === identity);
    if (retained) {
      if (JSON.stringify(retained.value.proposal) !== JSON.stringify(parsed.document)) fail('CONFLICT');
      return;
    }
    const candidate = await createSolanaFundingProposalRecord(bytes, this.#config, session.profileId); this.#guard(epoch);
    const bound = value(this.#native().bind(candidate.value.binding, candidate.value.proposal.terms));
    const occupied = reservations(bound.terms, bound.escrow.address);
    if (this.#inventory().some(item => item.identity !== identity && item.reservations.some(key => occupied.includes(key)))) fail('CONFLICT');
    this.#capacity(bound.binding);
    const existing = value(await this.#vault.read(session.sessionId, candidate.record.id)); this.#guard(epoch);
    if (existing !== null) fail('CONFLICT');
    value(await this.#vault.commit(session.sessionId, this.#lease!.current()!.revision, [{ op: 'put', record: candidate.record }],
      signal, () => this.#guard(epoch))); this.#guard(epoch);
    this.#proposals.set(candidate.record.id, Object.freeze({ ...candidate, bound, bindingStatus: 'available',
      observation: { snapshot: null, observedAt: 0, intents: [] } }));
  }
  #paired(proposal: Proposal): Trade | null {
    const trade = this.#trades.get(proposal.value.binding.tradeId);
    return trade && bindingId(trade.bound.binding) === bindingId(proposal.value.binding) ? trade : null;
  }
  /** Pure projection after snapshot's currentness admission; never revoke a session midway through its view. */
  #fundingReferences(owner: FundingWalletOwner): boolean {
    return this.#epoch === owner.epoch && this.#fundingWallet === owner && this.#client === owner.client && this.#wallet === owner.wallet &&
      this.#session?.profileId === owner.profileId && this.#session?.sessionId === owner.sessionId &&
      this.#proposals.get(owner.proposalId) === owner.proposal && owner.proposal.bound === owner.bound;
  }
  #ownsFunding(owner: FundingWalletOwner): boolean {
    return this.#current(owner.epoch) && this.#fundingReferences(owner);
  }
  #fundingProposal(id: string): Proposal {
    const proposal = this.#proposals.get(id); if (!proposal) fail('PROPOSAL_NOT_FOUND');
    if (!proposal.bound || proposal.bindingStatus !== 'available') fail('WRONG_CHAIN');
    const identity = bindingId(proposal.value.binding), occupied = reservations(proposal.value.proposal.terms, proposal.bound.escrow.address);
    if (this.#paired(proposal) || this.#inventory().some(item => item.identity !== identity && item.reservations.some(key => occupied.includes(key)))) fail('CONFLICT');
    return proposal;
  }
  async #promote(proposal: Proposal, read: SolanaEscrowSnapshot, epoch: number): Promise<void> {
    this.#guard(epoch);
    const bound = proposal.bound;
    if (!bound || this.#proposals.get(proposal.record.id) !== proposal || !read.escrow || read.custody?.kind !== 'native') fail('INTEGRITY_FAILURE');
    const existing = this.#trades.get(bound.termsHash);
    if (existing) {
      if (bindingId(existing.bound.binding) !== bindingId(bound.binding)) fail('CONFLICT');
      return;
    }
    const document = value(createRecoveryDocument(bound));
    // Maintained validation authenticates this reader snapshot, full binding and finalized observation.
    value(recoveryExits(document, bound, read, this.#config.margins));
    const id = await this.#recordId(document.termsHash); this.#guard(epoch);
    const session = this.#session!, revision = this.#lease!.current()!.revision;
    const occupied = value(await this.#vault.read(session.sessionId, id)); this.#guard(epoch);
    if (occupied !== null) fail('CONFLICT');
    const payload = encodeBase64url(new TextEncoder().encode(JSON.stringify({ format: RECORD_FORMAT, document,
      role: 'seller', originProfileId: proposal.value.originProfileId })));
    value(await this.#vault.commit(session.sessionId, revision, [{ op: 'put', record: { id, kind: 'trade', schemaVersion: 1, payload } }],
      this.#abort.signal, () => this.#guard(epoch))); this.#guard(epoch);
    this.#trades.set(document.termsHash, { document, bound, role: 'seller', restored: proposal.value.originProfileId !== session.profileId,
      snapshot: read, observedAt: proposal.observation.observedAt, intents: proposal.observation.intents });
  }
  async #observeProposal(proposal: Proposal): Promise<void> {
    if (!proposal.bound || this.#paired(proposal)) return;
    const epoch = this.#epoch, client = this.#native(), state = proposal.observation; state.snapshot = null;
    let read: SolanaEscrowSnapshot;
    try {
      const retained = this.#review;
      const liveReview = retained && retained.public.expiresAtMs > this.#now() &&
        retained.kind === 'funding' && retained.owner.proposal === proposal && this.#ownsFunding(retained.owner);
      state.intents = value(await (liveReview ? client.reconcile(proposal.bound) : client.recover(proposal.bound))); this.#guard(epoch);
      read = value(await client.read(proposal.bound)); this.#guard(epoch);
      if (read.escrow && read.custody?.kind !== 'native') fail('FUNDED_ESCROW_REQUIRED');
      state.snapshot = read; state.observedAt = this.#now();
    } catch (error) {
      this.#guard(epoch); const code = error instanceof SolanaUiFailure ? error.code : 'UNAVAILABLE';
      if (['LOCKED', 'CONFLICT', 'STORAGE_UNAVAILABLE'].includes(code)) fail(code);
      this.#error = code; return;
    }
    // Persistence failures reach dispatch's lock/revocation path, outside the ordinary read-error catch.
    if (read.escrow) await this.#promote(proposal, read, epoch);
  }
  async #refreshProposals(): Promise<void> {
    for (const proposal of this.#proposals.values()) await this.#observeProposal(proposal);
  }
  async #connectFunding(id: string): Promise<void> {
    const epoch = this.#epoch; await this.#cancel(); this.#guard(epoch);
    this.#fundingWallet = null; this.#wallet = null;
    const proposal = this.#fundingProposal(id), bound = proposal.bound!, client = this.#native();
    const wallet = value(await client.connect(bound, 'seller')); this.#guard(epoch);
    this.#wallet = wallet; this.#fundingWallet = { proposalId: id, proposal, bound, client, wallet,
      profileId: this.#session!.profileId, sessionId: this.#session!.sessionId, epoch };
    await this.#observeProposal(proposal);
  }
  async #prepareFunding(command: Extract<SolanaCommand, { type: 'funding.prepare' }>): Promise<void> {
    const epoch = this.#epoch; await this.#cancel(); this.#guard(epoch);
    const proposal = this.#fundingProposal(command.proposalId), owner = this.#fundingWallet;
    if (!owner || owner.proposal !== proposal || !this.#ownsFunding(owner)) fail('WALLET_REQUIRED');
    await this.#observeProposal(proposal); this.#guard(epoch);
    if (this.#paired(proposal)) return;
    this.#fundingProposal(command.proposalId);
    if (!this.#ownsFunding(owner)) fail('WALLET_REQUIRED');
    if (proposal.observation.intents.some(pending)) fail('PENDING_TRANSACTION');
    const prepared = value(await owner.client.prepareFunding(owner.bound, owner.wallet,
      command.rebuildOf === undefined ? {} : { rebuildOf: command.rebuildOf })); this.#guard(epoch);
    try {
      if (!this.#ownsFunding(owner)) fail('WALLET_REQUIRED');
      const projection = projectNativeFundingReview(owner.bound, prepared);
      const publicReview: SolanaReview = { id: randomId(), action: 'fund', proposalId: owner.proposalId,
        expiresAtMs: this.#now() + REVIEW_MS, fields: fundingFields(projection),
        walletRequest: { method: 'signTransaction', account: owner.wallet.address, chain: 'solana:localnet',
          transaction: encodeBase64(unsignedTransaction(decodeBase64(prepared.message, 1644))) } };
      proposal.observation.intents = value(await owner.client.intents(owner.bound)); this.#guard(epoch);
      this.#review = { kind: 'funding', public: publicReview, prepared, owner, client: owner.client, wallet: owner.wallet, epoch };
      this.#reviewTimer = setTimeout(() => { if (this.#review?.public.id === publicReview.id) this.walletChanged(); }, REVIEW_MS);
    } catch (error) {
      if (this.#ownsFunding(owner)) value(await owner.client.cancel(prepared));
      throw error;
    }
  }
  async #cancel(): Promise<void> {
    const review = this.#review; this.#clearReview();
    if (review && this.#client === review.client) {
      value(await review.client.cancel(review.prepared)); this.#guard(review.epoch);
      if (review.kind === 'funding') {
        review.owner.proposal.observation.intents = value(await review.client.intents(review.owner.bound)); this.#guard(review.epoch);
      }
    }
  }
  async #prepare(command: Extract<SolanaCommand, { type: 'review.prepare' }>): Promise<void> {
    await this.#cancel(); const epoch = this.#epoch;
    const trade = this.#trades.get(command.tradeId), wallet = this.#wallet;
    if (!trade || !wallet || wallet.tradeId !== command.tradeId) fail('WALLET_REQUIRED');
    if (command.action === 'release' && command.fiatReceiptConfirmed !== true) fail('FIAT_RECEIPT_REQUIRED');
    const prepared = value(await this.#native().prepare(trade.bound, wallet, command.action, {
      ...(command.maxRentTopUpLamports === undefined ? {} : { maxRentTopUpLamports: command.maxRentTopUpLamports }),
      ...(command.rebuildOf === undefined ? {} : { rebuildOf: command.rebuildOf }),
    })); this.#guard(epoch);
    const fields = [
      ['Action', command.action], ['Network genesis', trade.document.network.genesisHash], ['Immutable program', prepared.programId],
      ['ProgramData SHA-256', trade.document.network.programDataSha256], ['Escrow', prepared.escrow], ['Terms SHA-256', trade.document.termsHash],
      ['Seller', trade.document.roles.seller], ['Buyer', trade.document.roles.buyer], ['Principal (lamports)', trade.document.terms.amountBaseUnits],
      ['Deadline (chain seconds)', trade.document.terms.escrowExpirySeconds], ['Fee payer', prepared.feePayer], ['Recent blockhash', prepared.blockhash],
      ['Last valid block height', prepared.lastValidBlockHeight], ['Message (base64)', prepared.message],
      ['Rent top-up (lamports)', prepared.shape.action === 'payout' ? prepared.shape.rentTopUpLamports ?? '0' : '0'],
      ['Settlement', command.action === 'payout' ? 'Separate payout to the original recipient' : 'State change only; payout requires another review'],
    ].map(([label, value]) => ({ label: label!, value: value! }));
    const publicReview: SolanaReview = { id: randomId(), action: command.action, expiresAtMs: this.#now() + REVIEW_MS, fields,
      walletRequest: { method: 'signTransaction', account: wallet.address, chain: 'solana:localnet',
        transaction: encodeBase64(unsignedTransaction(decodeBase64(prepared.message, 1644))) } };
    this.#review = { kind: 'recovery', public: publicReview, prepared, wallet, epoch, client: this.#native() };
    this.#reviewTimer = setTimeout(() => { if (this.#review?.public.id === publicReview.id) { this.walletChanged(); } }, REVIEW_MS);
  }
  async #confirm(id: string): Promise<void> {
    const review = this.#review; this.#clearReview();
    if (!review || review.public.id !== id || review.public.expiresAtMs <= this.#now() || review.wallet !== this.#wallet) fail('REVIEW_EXPIRED');
    this.#guard(review.epoch);
    if (review.kind === 'funding') {
      if (!this.#ownsFunding(review.owner)) fail('REVIEW_EXPIRED');
      this.#fundingProposal(review.owner.proposalId);
    }
    if (this.#client !== review.client) fail('REVIEW_EXPIRED');
    value(await review.client.confirm(review.prepared, review.wallet)); this.#guard(review.epoch);
    await this.#refresh();
    if (review.kind === 'funding') await this.#observeProposal(review.owner.proposal);
  }
  async dispatch(input: unknown): Promise<SolanaResult> {
    let command: SolanaCommand;
    try { command = parseSolanaCommand(input); } catch (error) { return { ok: false, code: error instanceof SolanaUiFailure ? error.code : 'INVALID_INPUT', snapshot: this.snapshot() }; }
    if (this.#closed) return { ok: false, code: 'LOCKED', snapshot: this.snapshot() };
    if (command.type === 'profile.lock') { this.#drop(); this.#emit(); return { ok: true, snapshot: this.snapshot() }; }
    if (command.type === 'status') {
      try { this.#profiles = value(await this.#vault.listProfiles()).profileIds; } catch { this.#error = 'STORAGE_UNAVAILABLE'; }
      return { ok: true, snapshot: this.snapshot() };
    }
    if (command.type === 'review.cancel' && this.#busy) { this.walletChanged(); return { ok: true, snapshot: this.snapshot() }; }
    if (this.#busy) return { ok: false, code: 'BUSY', snapshot: this.snapshot() };
    this.#busy = true; this.#error = null; this.#emit();
    try {
      let extra: { backupBytes?: Uint8Array; recoveryJson?: string; restoredProfileId?: string } = {};
      if (command.type === 'profile.create' || command.type === 'profile.unlock' || command.type === 'backup.restore') {
        this.#drop(); const epoch = this.#epoch;
        const opening = () => { if (this.#closed || epoch !== this.#epoch) fail('LOCKED'); };
        let session: VaultSession;
        if (command.type === 'backup.restore') {
          const receipt = await this.#backup.restore(command.bytes, command.sourcePassphrase, command.destinationPassphrase, this.#abort.signal, opening);
          opening(); extra.restoredProfileId = receipt.newProfileId;
          session = value(await this.#vault.unlock(receipt.newProfileId, command.destinationPassphrase, this.#abort.signal));
        } else session = value(await (command.type === 'profile.create' ? this.#vault.create(command.passphrase, this.#abort.signal, opening)
          : this.#vault.unlock(command.profileId, command.passphrase, this.#abort.signal)));
        opening(); await this.#activate(session); this.#guard(epoch); this.#profiles = value(await this.#vault.listProfiles()).profileIds;
      } else {
        this.#guard(); const epoch = this.#epoch;
        value(await this.#vault.assertFresh(this.#session!.sessionId, this.#abort.signal)); this.#guard(epoch);
        if (command.type !== 'refresh') this.#touch();
        if (command.type === 'funding.proposal.import') await this.#importProposal(command.text);
        else if (command.type === 'funding.wallet.connect') await this.#connectFunding(command.proposalId);
        else if (command.type === 'funding.prepare') await this.#prepareFunding(command);
        else if (command.type === 'recovery.import') await this.#import(command.text, command.role);
        else if (command.type === 'recovery.export') {
          const trade = this.#trades.get(command.tradeId); if (!trade) fail('TRADE_NOT_FOUND');
          // The retained document passed the canonical parser on import/unlock. Export no profile or journal wrapper.
          const json = JSON.stringify(trade.document, null, 2) + '\n';
          if (new TextEncoder().encode(json).byteLength > 16384) fail('LIMIT_EXCEEDED');
          extra.recoveryJson = json;
        }
        else if (command.type === 'wallet.connect') {
          await this.#cancel(); this.#fundingWallet = null; const trade = this.#trades.get(command.tradeId); if (!trade) fail('TRADE_NOT_FOUND');
          this.#wallet = value(await this.#native().connect(trade.bound, trade.role)); this.#guard(epoch); await this.#refresh(true);
        } else if (command.type === 'refresh') { await this.#refresh(); await this.#refreshProposals(); }
        else if (command.type === 'review.prepare') await this.#prepare(command);
        else if (command.type === 'review.confirm') await this.#confirm(command.reviewId);
        else if (command.type === 'review.cancel') { await this.#cancel(); await this.#refresh(); }
        else if (command.type === 'backup.export') extra.backupBytes = (await this.#backup.exportWithStatus(this.#session!.profileId, this.#abort.signal)).bytes;
        this.#guard(epoch);
      }
      this.#busy = false; return { ok: true, ...extra, snapshot: this.snapshot() };
    } catch (error) {
      const code = error instanceof SolanaUiFailure ? error.code : 'UNAVAILABLE'; this.#error = code;
      if (['LOCKED', 'CONFLICT', 'STORAGE_UNAVAILABLE'].includes(code) || ['profile.create', 'profile.unlock', 'backup.restore'].includes(command.type)) this.#drop();
      this.#busy = false; return { ok: false, code, snapshot: this.snapshot() };
    } finally { this.#busy = false; if (command.type === 'backup.restore') command.bytes.fill(0); this.#emit(); }
  }
}
