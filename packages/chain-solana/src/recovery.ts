/**
 * Portable recovery for the original funded escrow (documented in the Solana RECOVERY.md). A self-contained document
 * (`p2p-offramp/solana-escrow-recovery/v1`) holds only public data: network and deployment identity, the G16 terms
 * with their bytes and hash, the escrow and vault PDAs, the two role keys and the asset. It holds no key, seed,
 * signature, wallet data or private agreement content (only its hash, which is part of the terms).
 *
 * `parseRecoveryDocument` recomputes every derived value. `recoveryRegistry` turns the document into a one-network
 * registry view, so the ordinary finalized reader (genesis, immutable program, ProgramData pin, Clock) checks the
 * chain without the app's registry. `recoveryExits` lists the exits a fresh finalized snapshot allows, and
 * `buildRecoveryMessage` plans and compiles the chosen exit with the same C-L2 rules as the client.
 */
import { createCoreError, createOperationId, encodeSolanaTerms, type SolanaTermsInput } from '../../domain/index.ts';
import type { AssetV1, CoreResult, DeploymentV1, NetworkV1, TradeBinding } from '../../schemas/index.ts';
import { sha256 } from '@noble/hashes/sha2.js';
import { escrowAddress, programDataAddress, vaultAddress } from './address.ts';
import {
  bindSolanaTrade, deepFreeze, isBoundSolanaTrade, type BoundSolanaTrade, type SolanaRegistryView,
} from './bind.ts';
import { canonicalKey, decodeBase64, equalBytes, fail, failureCode, hex } from './codec.ts';
import { exactData } from './intent.ts';
import { encodeBase64, unsignedTransaction } from './message.ts';
import {
  compilePlan, isTrustedSnapshot, parseMargins, planPayout, planRefund, planRelease, type PayoutOptions,
  type SolanaMargins, type SolanaMessagePlan, type SolanaRole,
} from './plan.ts';
import type { SolanaEscrowSnapshot } from './reader.ts';
import { settlementWindow } from './window.ts';

export const SOLANA_RECOVERY_FORMAT = 'p2p-offramp/solana-escrow-recovery/v1';
export type RecoveryExit = 'release' | 'refund' | 'payout';
export interface SolanaRecoveryDocument {
  readonly format: typeof SOLANA_RECOVERY_FORMAT;
  readonly network: {
    readonly networkId: string; readonly environment: NetworkV1['environment']; readonly genesisHash: string;
    readonly deploymentId: string; readonly programId: string; readonly programDataAddress: string;
    readonly programDataSha256: string; readonly artifactSha256: string;
  };
  readonly terms: SolanaTermsInput; readonly termsBytesBase64: string; readonly termsHash: string;
  readonly escrow: { readonly address: string; readonly bump: number };
  readonly vault: { readonly address: string; readonly bump: number } | null;
  readonly roles: { readonly seller: string; readonly buyer: string };
  readonly asset: { readonly id: string; readonly kind: 'native' | 'spl'; readonly mint: string | null;
    readonly decimals: number };
}
export interface RecoveryExitState {
  readonly exit: RecoveryExit; readonly roles: readonly SolanaRole[]; readonly open: boolean;
  readonly reason: 'open' | 'not-funded' | 'deadline-margin' | 'before-deadline' | 'not-terminal' | 'paid-out' |
    'vault-frozen';
}
export interface RecoveryExits {
  readonly state: SolanaEscrowSnapshot['observation']['state']; readonly paidOut: boolean;
  readonly chainTimeSeconds: string; readonly deadlineSeconds: string; readonly exits: readonly RecoveryExitState[];
}

const TERMS_KEYS = ['acceptBeforeSeconds', 'amountBaseUnits', 'assetKind', 'buyer', 'capabilitiesHash',
  'escrowExpirySeconds', 'genesisHash', 'mint', 'orderId', 'privateAgreementHash', 'programId', 'revision', 'seller',
  'sellerNonce', 'tokenProgram'];
const failure = (error: unknown): CoreResult<never> => ({ ok: false, error: createCoreError(
  failureCode(error, 'INVALID_INPUT'), { operationId: createOperationId(), readOnly: true }) });
function result<T>(work: () => T): CoreResult<T> {
  try { return { ok: true, value: work() }; } catch (error) { return failure(error); }
}
const value = <T>(built: CoreResult<T>): T => built.ok ? built.value : fail(built.error.code);
const text = (input: unknown, pattern: RegExp) =>
  typeof input === 'string' && pattern.test(input) ? input : fail('INVALID_INPUT');
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/, HEX64 = /^[0-9a-f]{64}$/;

/** Document for a bound trade, written when the trade is funded (or any time after). */
export function createRecoveryDocument(trade: BoundSolanaTrade): CoreResult<SolanaRecoveryDocument> {
  return result(() => {
    if (!isBoundSolanaTrade(trade)) return fail('INVALID_INPUT');
    const runtime = trade.deployment.runtime;
    if (runtime.kind !== 'solana-program') return fail('UNSUPPORTED_PROVIDER');
    const terms = Object.fromEntries(TERMS_KEYS.map(key => [key, trade.terms[key as keyof SolanaTermsInput]]));
    return parseRecoveryDocument({
      format: SOLANA_RECOVERY_FORMAT,
      network: { networkId: trade.network.id, environment: trade.network.environment,
        genesisHash: trade.network.genesisHash, deploymentId: trade.deployment.id, programId: trade.deployment.address,
        programDataAddress: trade.programDataAddress, programDataSha256: runtime.programDataSha256,
        artifactSha256: trade.deployment.artifactSha256 },
      terms, termsBytesBase64: encodeBase64(encodeSolanaTerms(trade.terms)), termsHash: trade.termsHash,
      escrow: { address: trade.escrow.address, bump: trade.escrow.bump },
      vault: trade.vault === null ? null : { address: trade.vault.address, bump: trade.vault.bump },
      roles: { seller: trade.terms.seller, buyer: trade.terms.buyer },
      asset: { id: trade.asset.id, kind: trade.terms.assetKind, mint: trade.terms.mint,
        decimals: trade.asset.decimals },
    });
  });
}

function pda(input: unknown): { readonly address: string; readonly bump: number } {
  const raw = exactData(input, ['address', 'bump']);
  if (typeof raw.bump !== 'number' || !Number.isInteger(raw.bump) || raw.bump < 0 || raw.bump > 255) {
    return fail('INVALID_INPUT');
  }
  return Object.freeze({ address: canonicalKey(raw.address, 'INVALID_INPUT'), bump: raw.bump });
}

/** Strict parse; every derived field (terms bytes, hash, PDAs, ProgramData address, roles, asset) is recomputed. */
export function parseRecoveryDocument(input: unknown): SolanaRecoveryDocument {
  const raw = exactData(input, ['format', 'network', 'terms', 'termsBytesBase64', 'termsHash', 'escrow', 'vault',
    'roles', 'asset']);
  if (raw.format !== SOLANA_RECOVERY_FORMAT) return fail('UNSUPPORTED_VERSION');
  const net = exactData(raw.network, ['networkId', 'environment', 'genesisHash', 'deploymentId', 'programId',
    'programDataAddress', 'programDataSha256', 'artifactSha256']);
  const network = Object.freeze({
    networkId: text(net.networkId, ID), environment: ['local', 'testnet', 'mainnet'].includes(net.environment as string)
      ? net.environment as NetworkV1['environment'] : fail('INVALID_INPUT'),
    genesisHash: canonicalKey(net.genesisHash, 'INVALID_INPUT'), deploymentId: text(net.deploymentId, ID),
    programId: canonicalKey(net.programId, 'INVALID_INPUT'),
    programDataAddress: canonicalKey(net.programDataAddress, 'INVALID_INPUT'),
    programDataSha256: text(net.programDataSha256, HEX64), artifactSha256: text(net.artifactSha256, HEX64),
  });
  const termsRaw = exactData(raw.terms, TERMS_KEYS);
  const terms = Object.freeze(Object.fromEntries(TERMS_KEYS.map(key => [key, termsRaw[key]]))) as unknown as
    SolanaTermsInput;
  let bytes: Uint8Array;
  try { bytes = encodeSolanaTerms(terms); } catch { return fail('INVALID_INPUT'); }
  const stored = decodeBase64(raw.termsBytesBase64, 1024);
  if (!equalBytes(stored, bytes) || raw.termsHash !== hex(sha256(bytes))) return fail('INTEGRITY_FAILURE');
  const escrow = pda(raw.escrow), vault = raw.vault === null ? null : pda(raw.vault);
  const roles = exactData(raw.roles, ['seller', 'buyer']);
  const asset = exactData(raw.asset, ['id', 'kind', 'mint', 'decimals']);
  const derived = escrowAddress(network.programId, terms.seller, terms.sellerNonce);
  const spl = terms.assetKind === 'spl';
  const derivedVault = spl ? vaultAddress(network.programId, derived.address) : null;
  if (terms.genesisHash !== network.genesisHash || terms.programId !== network.programId ||
      programDataAddress(network.programId).address !== network.programDataAddress ||
      derived.address !== escrow.address || derived.bump !== escrow.bump ||
      (vault === null) !== (derivedVault === null) ||
      (vault !== null && (vault.address !== derivedVault!.address || vault.bump !== derivedVault!.bump)) ||
      roles.seller !== terms.seller || roles.buyer !== terms.buyer || asset.kind !== terms.assetKind ||
      asset.mint !== terms.mint || typeof asset.decimals !== 'number' || !Number.isInteger(asset.decimals) ||
      asset.decimals < 0 || asset.decimals > 18) return fail('INTEGRITY_FAILURE');
  return deepFreeze({
    format: SOLANA_RECOVERY_FORMAT, network, terms, termsBytesBase64: raw.termsBytesBase64 as string,
    termsHash: raw.termsHash as string, escrow, vault,
    roles: { seller: terms.seller, buyer: terms.buyer },
    asset: { id: text(asset.id, ID), kind: terms.assetKind, mint: terms.mint, decimals: asset.decimals as number },
  });
}

/** One-network, one-deployment registry view built from the document alone (no endpoints: the user brings an RPC). */
export function recoveryRegistry(document: SolanaRecoveryDocument): SolanaRegistryView {
  const doc = parseRecoveryDocument(document);
  const asset: AssetV1 = { id: doc.asset.id, kind: doc.asset.kind, address: doc.asset.mint,
    decimals: doc.asset.decimals, transferPolicy: 'exact-transfer' };
  const deployment: DeploymentV1 = deepFreeze({ id: doc.network.deploymentId, address: doc.network.programId,
    protocolVersion: 1 as const, artifactSha256: doc.network.artifactSha256,
    runtime: { kind: 'solana-program' as const, programDataSha256: doc.network.programDataSha256,
      upgradeAuthority: null }, supportedAssetIds: [doc.asset.id] });
  const network: NetworkV1 = deepFreeze({ id: doc.network.networkId, chain: 'solana' as const,
    chainIdentity: doc.network.genesisHash, genesisHash: doc.network.genesisHash, endpoints: [],
    finality: { kind: 'solana-commitment' as const, commitment: 'finalized' as const }, assets: [asset],
    deployments: [deployment], environment: doc.network.environment });
  return Object.freeze({
    network: (id: string) => id === network.id ? network : null,
    deployment: (networkId: string, id: string) => networkId === network.id && id === deployment.id ? deployment : null,
  });
}
export function recoveryBinding(document: SolanaRecoveryDocument): TradeBinding {
  return Object.freeze({ chain: 'solana' as const, networkId: document.network.networkId,
    deploymentId: document.network.deploymentId, tradeId: document.termsHash });
}
/** The bound trade the reader and planner use for this document. */
export function bindRecoveryTrade(document: SolanaRecoveryDocument): CoreResult<BoundSolanaTrade> {
  try {
    const doc = parseRecoveryDocument(document);
    return bindSolanaTrade(recoveryRegistry(doc), recoveryBinding(doc), doc.terms);
  } catch (error) { return failure(error); }
}

function sameTrade(document: SolanaRecoveryDocument, trade: BoundSolanaTrade): void {
  if (!isBoundSolanaTrade(trade) || trade.binding.tradeId !== document.termsHash ||
      trade.escrow.address !== document.escrow.address || trade.deployment.address !== document.network.programId ||
      trade.network.genesisHash !== document.network.genesisHash) return fail('INVALID_INPUT');
}

/** Exits a fresh finalized snapshot allows: release (seller, before deadline - margin), refund, payout. */
export function recoveryExits(
  document: SolanaRecoveryDocument, trade: BoundSolanaTrade, snapshot: SolanaEscrowSnapshot, margins: SolanaMargins,
): CoreResult<RecoveryExits> {
  return result(() => {
    const doc = parseRecoveryDocument(document);
    sameTrade(doc, trade);
    if (!isTrustedSnapshot(snapshot) || snapshot.escrowAddress !== doc.escrow.address) return fail('INVALID_INPUT');
    const limits = parseMargins(margins), escrow = snapshot.escrow, now = snapshot.live.timestampSeconds;
    const window = value(settlementWindow(doc.terms.escrowExpirySeconds, now, limits.releaseMarginSeconds));
    const funded = escrow?.state === 'funded', terminal = escrow !== null && !funded;
    const frozen = snapshot.custody?.kind === 'spl' && snapshot.custody.vaultFrozen;
    const exit = (name: RecoveryExit, roles: SolanaRole[], reason: RecoveryExitState['reason']): RecoveryExitState =>
      Object.freeze({ exit: name, roles: Object.freeze(roles), open: reason === 'open', reason });
    const exits = [
      exit('release', ['seller'], !funded ? 'not-funded' : window.releaseOpen ? 'open' : 'deadline-margin'),
      exit('refund', ['seller'], !funded ? 'not-funded' : window.refundOpen ? 'open' : 'before-deadline'),
      exit('payout', ['seller', 'buyer'], !terminal ? 'not-terminal' : escrow.paidOut ? 'paid-out'
        : frozen ? 'vault-frozen' : 'open'),
    ];
    return Object.freeze({ state: snapshot.observation.state, paidOut: escrow?.paidOut ?? false,
      chainTimeSeconds: now, deadlineSeconds: doc.terms.escrowExpirySeconds, exits: Object.freeze(exits) });
  });
}

/** Unsigned message for one exit, planned with the client's C-L2 rules against a trusted finalized snapshot. */
export function buildRecoveryMessage(
  document: SolanaRecoveryDocument, trade: BoundSolanaTrade, snapshot: SolanaEscrowSnapshot, exit: RecoveryExit,
  role: SolanaRole, margins: SolanaMargins, recentBlockhash: string, options: PayoutOptions = {},
): CoreResult<{ readonly plan: SolanaMessagePlan; readonly message: Uint8Array;
  readonly unsignedTransaction: Uint8Array }> {
  return result(() => {
    sameTrade(parseRecoveryDocument(document), trade);
    const plan = value(exit === 'release' ? planRelease(trade, snapshot, role, margins)
      : exit === 'refund' ? planRefund(trade, snapshot, role, margins)
        : exit === 'payout' ? planPayout(trade, snapshot, role, options) : fail('INVALID_INPUT'));
    const message = compilePlan(plan, canonicalKey(recentBlockhash, 'INVALID_INPUT'));
    return Object.freeze({ plan, message, unsignedTransaction: unsignedTransaction(message) });
  });
}
