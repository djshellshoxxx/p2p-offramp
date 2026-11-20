/** Pure native-SOL review data. This module grants no authority and has no application command consumer. */
import { parseIntentId } from '../../schemas/index.ts';
import { deepFreeze, isBoundSolanaTrade, type BoundSolanaTrade } from './bind.ts';
import { decimalU64, decodeBase64, fail, fromHex32 } from './codec.ts';
import type { PreparedSolanaFunding } from './compose.ts';
import { exactData } from './intent.ts';
import { MAX_TRANSACTION_BYTES, parseLegacyMessage } from './message.ts';
import { verifyPlanMessage } from './plan.ts';

/** Detached display data, including explicit limits on what its supplied metadata proves. */
export interface NativeSolanaFundingReview {
  readonly action: 'fund'; readonly role: 'seller'; readonly expectedEscrowState: 'absent';
  readonly effect: 'fund-fixed-escrow-terms'; readonly validation: 'data-consistency-only';
  readonly confirmationAuthority: false; readonly counterpartyAcceptance: 'not-established';
  readonly fundingOutcome: 'not-established';
  readonly network: { readonly id: string; readonly chain: 'solana'; readonly genesisHash: string };
  readonly deployment: {
    readonly id: string; readonly programId: string; readonly programDataAddress: string;
    readonly programDataSha256: string; readonly artifactSha256: string; readonly upgradeAuthority: null;
    readonly evidence: 'supplied-bound-trade';
  };
  readonly terms: {
    readonly hash: string; readonly orderId: string; readonly revision: string; readonly sellerNonce: string;
    readonly seller: string; readonly buyer: string; readonly capabilitiesHash: string;
    readonly privateAgreementHash: string; readonly acceptBeforeSeconds: string; readonly escrowExpirySeconds: string;
  };
  readonly principal: {
    readonly amountBaseUnits: string; readonly assetId: string; readonly assetKind: 'native';
    readonly assetAddress: null; readonly decimals: 9;
  };
  readonly escrow: string;
  readonly fundingSource: { readonly kind: 'native-seller'; readonly address: string };
  readonly transaction: {
    readonly feePayer: string; readonly message: string; readonly blockhash: string;
    readonly lastValidBlockHeight: string;
    readonly lastValidBlockHeightEvidence: 'supplied-metadata';
  };
  /** No estimate has been requested. Principal alone is not a total-debit estimate. */
  readonly costs: { readonly feeLamports: null; readonly escrowRentLamports: null; readonly totalDebitLamports: null };
}

const VIEW_KEYS = Object.freeze(['intentId', 'action', 'role', 'feePayer', 'binding', 'programId', 'escrow',
  'expectedEscrowState', 'message', 'blockhash', 'lastValidBlockHeight', 'shape']);
const BINDING_KEYS = Object.freeze(['chain', 'networkId', 'deploymentId', 'tradeId']);
const MAX_MESSAGE_BASE64 = Math.ceil(MAX_TRANSACTION_BYTES / 3) * 4;

/**
 * Validates supplied data consistency, not the private per-client prepared capability. Consistent copies may
 * display; only the original client's confirm method can authenticate its retained handle and recheck freshness.
 * ProgramData/artifact pins come from the supplied bound trade, not from the prepared view or a fresh chain read.
 * Last-valid height is format-checked metadata; it is not encoded in the message. No time or fee estimate is made.
 * Own accessor fields are refused without evaluating them. Arbitrary Proxy traps are not claimed to be inert.
 * Throws only fixed INVALID_INPUT failures. Existing message machinery performs the sole funding-byte check.
 */
export function projectNativeFundingReview(
  trade: BoundSolanaTrade, prepared: PreparedSolanaFunding,
): NativeSolanaFundingReview {
  try {
    if (!isBoundSolanaTrade(trade)) return fail('INVALID_INPUT');
    const { terms, asset, deployment } = trade;
    if (terms.assetKind !== 'native' || asset.kind !== 'native' || asset.address !== null || asset.decimals !== 9 ||
        typeof asset.id !== 'string' || deployment.runtime.kind !== 'solana-program') return fail('INVALID_INPUT');
    fromHex32(deployment.artifactSha256); fromHex32(deployment.runtime.programDataSha256);
    const view = exactData(prepared, VIEW_KEYS), binding = exactData(view.binding, BINDING_KEYS);
    const shape = exactData(view.shape, ['action', 'sellerTokenAccount']);
    if (BINDING_KEYS.some(key => binding[key] !== trade.binding[key as keyof typeof trade.binding]) ||
        view.action !== 'fund' || view.role !== 'seller' || view.expectedEscrowState !== 'absent' ||
        view.feePayer !== terms.seller || view.programId !== terms.programId || view.escrow !== trade.escrow.address ||
        shape.action !== 'fund' || shape.sellerTokenAccount !== null) return fail('INVALID_INPUT');
    parseIntentId(view.intentId);
    decimalU64(view.lastValidBlockHeight);
    const message = decodeBase64(view.message, MAX_MESSAGE_BASE64), parsed = parseLegacyMessage(message);
    const checked = verifyPlanMessage(trade, 'fund', 'absent', terms.seller, message);
    if (checked.action !== 'fund' || checked.sellerTokenAccount !== null ||
        parsed.recentBlockhash !== view.blockhash) return fail('INVALID_INPUT');
    return deepFreeze<NativeSolanaFundingReview>({
      action: 'fund', role: 'seller', expectedEscrowState: 'absent', effect: 'fund-fixed-escrow-terms',
      validation: 'data-consistency-only', confirmationAuthority: false,
      counterpartyAcceptance: 'not-established', fundingOutcome: 'not-established',
      network: { id: trade.binding.networkId, chain: 'solana', genesisHash: terms.genesisHash },
      deployment: { id: trade.binding.deploymentId, programId: terms.programId,
        programDataAddress: trade.programDataAddress, programDataSha256: deployment.runtime.programDataSha256,
        artifactSha256: deployment.artifactSha256, upgradeAuthority: null, evidence: 'supplied-bound-trade' },
      terms: { hash: trade.termsHash, orderId: terms.orderId, revision: terms.revision, sellerNonce: terms.sellerNonce,
        seller: terms.seller, buyer: terms.buyer, capabilitiesHash: terms.capabilitiesHash,
        privateAgreementHash: terms.privateAgreementHash, acceptBeforeSeconds: terms.acceptBeforeSeconds,
        escrowExpirySeconds: terms.escrowExpirySeconds },
      principal: { amountBaseUnits: terms.amountBaseUnits, assetId: asset.id,
        assetKind: 'native', assetAddress: null, decimals: 9 },
      escrow: trade.escrow.address, fundingSource: { kind: 'native-seller', address: terms.seller },
      transaction: { feePayer: terms.seller, message: view.message as string, blockhash: parsed.recentBlockhash,
        lastValidBlockHeight: view.lastValidBlockHeight as string, lastValidBlockHeightEvidence: 'supplied-metadata' },
      costs: { feeLamports: null, escrowRentLamports: null, totalDebitLamports: null },
    });
  } catch { return fail('INVALID_INPUT'); }
}
