/** Purpose-bound seller funding and recovery. No generic RPC, secret read or acceptance command. */
import type { NativeSolanaFundingTerms, SolanaFundingProposalRecord } from './funding-proposal.ts';
export type RecoveryAction = 'release' | 'refund' | 'payout';
export type SolanaCommand =
  | { readonly type: 'status' | 'profile.lock' | 'refresh' | 'review.cancel' | 'backup.export' }
  | { readonly type: 'profile.create'; readonly passphrase: string }
  | { readonly type: 'profile.unlock'; readonly profileId: string; readonly passphrase: string }
  | { readonly type: 'backup.restore'; readonly bytes: Uint8Array; readonly sourcePassphrase: string; readonly destinationPassphrase: string }
  | { readonly type: 'funding.proposal.import'; readonly text: string }
  | { readonly type: 'funding.wallet.connect'; readonly proposalId: string }
  | { readonly type: 'funding.prepare'; readonly proposalId: string; readonly rebuildOf?: string }
  | { readonly type: 'recovery.import'; readonly text: string; readonly role: 'seller' | 'buyer' }
  | { readonly type: 'recovery.export'; readonly tradeId: string }
  | { readonly type: 'wallet.connect'; readonly tradeId: string }
  | { readonly type: 'review.prepare'; readonly tradeId: string; readonly action: RecoveryAction;
      readonly fiatReceiptConfirmed?: boolean; readonly maxRentTopUpLamports?: string; readonly rebuildOf?: string }
  | { readonly type: 'review.confirm' | 'funding.review.expire'; readonly reviewId: string };
export type SolanaWalletRequest = { readonly method: 'connect' } | {
  readonly method: 'signTransaction'; readonly account: string; readonly chain: 'solana:localnet'; readonly transaction: string;
};
interface SolanaReviewBase {
  readonly id: string; readonly expiresAtMs: number;
  readonly fields: readonly { readonly label: string; readonly value: string }[];
  readonly walletRequest: Extract<SolanaWalletRequest, { method: 'signTransaction' }>;
}
export type SolanaReview = (SolanaReviewBase & { readonly action: RecoveryAction })
  | (SolanaReviewBase & { readonly action: 'fund'; readonly proposalId: string });
export interface SolanaTradeView {
  readonly id: string; readonly role: 'seller' | 'buyer'; readonly seller: string; readonly buyer: string;
  readonly amountBaseUnits: string; readonly deadlineSeconds: string; readonly escrow: string;
  readonly state: 'unverified' | 'funded' | 'released' | 'refunded'; readonly paidOut: boolean;
  readonly chainTimeSeconds: string | null; readonly restored: boolean;
  readonly intents: readonly { readonly id: string; readonly action: string; readonly state: string; readonly signature: string | null }[];
  readonly payoutBlockedBy: readonly string[]; readonly rentTopUpLamports: string | null;
  readonly canRelease: boolean; readonly canRefund: boolean; readonly canPayout: boolean;
}
export interface SolanaFundingProposalView {
  readonly id: string; readonly binding: SolanaFundingProposalRecord['binding'];
  readonly terms: NativeSolanaFundingTerms; readonly escrow: string | null; readonly restored: boolean;
  /** Binding availability is data compatibility, never funding eligibility or acceptance. */
  readonly bindingStatus: 'available' | 'configuration-mismatch' | 'unsupported';
  readonly recoveryRetained: boolean; readonly escrowConflict: boolean;
  readonly state: 'unverified' | 'absent' | 'funded' | 'released' | 'refunded';
  readonly chainTimeSeconds: string | null; readonly walletConnected: boolean;
  readonly intents: readonly { readonly id: string; readonly action: string; readonly state: string;
    readonly signature: string | null; readonly replacementOf: string | null }[];
}
export interface SolanaSnapshot {
  readonly version: 1; readonly phase: 'locked' | 'ready' | 'working'; readonly profileIds: readonly string[];
  readonly profileId: string | null; readonly wallet: { readonly address: string; readonly tradeId: string } | null;
  readonly proposals: readonly SolanaFundingProposalView[]; readonly tradeCapacity: { readonly used: number; readonly limit: 8 };
  readonly trades: readonly SolanaTradeView[]; readonly review: SolanaReview | null; readonly error: string | null;
}
export type SolanaResult = { readonly ok: true; readonly snapshot: SolanaSnapshot; readonly backupBytes?: Uint8Array;
  readonly recoveryJson?: string; readonly restoredProfileId?: string }
  | { readonly ok: false; readonly code: string; readonly snapshot: SolanaSnapshot };
export interface SolanaBrowserClient {
  request(command: SolanaCommand): Promise<SolanaResult>;
  subscribe(listener: (snapshot: SolanaSnapshot) => void): () => void;
  snapshot(): SolanaSnapshot | null;
  dispose(): void;
}
export type SolanaWorkerInput = { readonly kind: 'command'; readonly id: number; readonly command: SolanaCommand }
  | { readonly kind: 'wallet.result'; readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly kind: 'wallet.result'; readonly id: number; readonly ok: false }
  | { readonly kind: 'wallet.changed' };
export type SolanaWorkerOutput = { readonly kind: 'result'; readonly id: number; readonly result: SolanaResult }
  | { readonly kind: 'snapshot'; readonly snapshot: SolanaSnapshot }
  | { readonly kind: 'wallet.request'; readonly id: number; readonly request: SolanaWalletRequest };
