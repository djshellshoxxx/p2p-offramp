/** Purpose-bound local recovery messages. No funding, generic RPC, secret read or acceptance command. */
export type RecoveryAction = 'release' | 'refund' | 'payout';
export type SolanaCommand =
  | { readonly type: 'status' | 'profile.lock' | 'refresh' | 'review.cancel' | 'backup.export' }
  | { readonly type: 'profile.create'; readonly passphrase: string }
  | { readonly type: 'profile.unlock'; readonly profileId: string; readonly passphrase: string }
  | { readonly type: 'backup.restore'; readonly bytes: Uint8Array; readonly sourcePassphrase: string; readonly destinationPassphrase: string }
  | { readonly type: 'recovery.import'; readonly text: string; readonly role: 'seller' | 'buyer' }
  | { readonly type: 'recovery.export'; readonly tradeId: string }
  | { readonly type: 'wallet.connect'; readonly tradeId: string }
  | { readonly type: 'review.prepare'; readonly tradeId: string; readonly action: RecoveryAction;
      readonly fiatReceiptConfirmed?: boolean; readonly maxRentTopUpLamports?: string; readonly rebuildOf?: string }
  | { readonly type: 'review.confirm'; readonly reviewId: string };
export type SolanaWalletRequest = { readonly method: 'connect' } | {
  readonly method: 'signTransaction'; readonly account: string; readonly chain: 'solana:localnet'; readonly transaction: string;
};
export interface SolanaReview {
  readonly id: string; readonly action: RecoveryAction; readonly expiresAtMs: number;
  readonly fields: readonly { readonly label: string; readonly value: string }[];
  readonly walletRequest: Extract<SolanaWalletRequest, { method: 'signTransaction' }>;
}
export interface SolanaTradeView {
  readonly id: string; readonly role: 'seller' | 'buyer'; readonly seller: string; readonly buyer: string;
  readonly amountBaseUnits: string; readonly deadlineSeconds: string; readonly escrow: string;
  readonly state: 'unverified' | 'funded' | 'released' | 'refunded'; readonly paidOut: boolean;
  readonly chainTimeSeconds: string | null; readonly restored: boolean;
  readonly intents: readonly { readonly id: string; readonly action: string; readonly state: string; readonly signature: string | null }[];
  readonly payoutBlockedBy: readonly string[]; readonly rentTopUpLamports: string | null;
  readonly canRelease: boolean; readonly canRefund: boolean; readonly canPayout: boolean;
}
export interface SolanaSnapshot {
  readonly version: 1; readonly phase: 'locked' | 'ready' | 'working'; readonly profileIds: readonly string[];
  readonly profileId: string | null; readonly wallet: { readonly address: string; readonly tradeId: string } | null;
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
