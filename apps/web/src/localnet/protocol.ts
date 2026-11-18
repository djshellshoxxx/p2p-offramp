/** Purpose-bound localnet Worker messages. No raw vault read, secret export or generic wallet command exists. */
export type LocalnetAction = 'offer' | 'accept' | 'fund' | 'release' | 'refund';
export type LocalnetCommand =
  | { readonly type: 'status' | 'profile.lock' | 'wallet.connect' | 'refresh' | 'review.cancel' | 'backup.export' }
  | { readonly type: 'profile.create'; readonly passphrase: string }
  | { readonly type: 'profile.unlock'; readonly profileId: string; readonly passphrase: string }
  | { readonly type: 'backup.restore'; readonly bytes: Uint8Array; readonly sourcePassphrase: string; readonly destinationPassphrase: string }
  | { readonly type: 'ad.publish'; readonly assetId: string; readonly amountBaseUnits: string; readonly currency: string }
  | { readonly type: 'ad.take'; readonly adKey: string }
  | { readonly type: 'session.select'; readonly sessionId: string }
  | { readonly type: 'review.prepare'; readonly action: 'offer'; readonly sessionId: string; readonly fiatMinorUnits: string;
      readonly fiatScale: number; readonly paymentInstructions: string; readonly acceptForSeconds?: number; readonly escrowForSeconds?: number }
  | { readonly type: 'review.prepare'; readonly action: 'accept'; readonly sessionId: string }
  | { readonly type: 'review.prepare'; readonly action: 'fund' | 'release' | 'refund'; readonly tradeId: string;
      /** Required only for release: the seller explicitly checked their bank account. Never inferred from chat. */
      readonly fiatReceiptConfirmed?: boolean }
  | { readonly type: 'review.confirm'; readonly reviewId: string }
  | { readonly type: 'chat.send'; readonly tradeId: string; readonly text: string };

export interface LocalnetWalletRequest { readonly method: 'eth_signTypedData_v4' | 'eth_sendTransaction'; readonly params: readonly unknown[]; }
export interface LocalnetReview {
  readonly id: string; readonly action: LocalnetAction; readonly expiresAtMs: number;
  readonly fields: readonly { readonly label: string; readonly value: string }[];
  /** The exact, finite prompt sequence. The document bridge matches it byte for byte before each wallet request. */
  readonly walletRequests: readonly LocalnetWalletRequest[];
}
export interface LocalnetAdView {
  readonly key: string; readonly maker: string; readonly assetId: string; readonly amountBaseUnits: string;
  readonly currency: string; readonly expiresAtSeconds: string; readonly own: boolean;
}
export interface LocalnetSessionView {
  readonly id: string; readonly role: 'seller' | 'buyer'; readonly state: string;
  /** Current single UI selection; canonical seller intake pinning remains private to the exchange. */
  readonly selected: boolean;
  readonly buyerAddress: string; readonly tradeId: string | null;
}
export interface LocalnetTradeView {
  readonly id: string; readonly sessionId: string | null; readonly role: 'seller' | 'buyer'; readonly restored: boolean;
  readonly seller: string; readonly buyer: string; readonly assetId: string; readonly amountBaseUnits: string;
  readonly fiatCurrency: string; readonly fiatMinorUnits: string; readonly fiatScale: number; readonly paymentInstructions: string;
  readonly acceptBeforeSeconds: string; readonly escrowExpirySeconds: string;
  readonly peerAcceptance: string;
  readonly chainState: 'absent' | 'funded' | 'released' | 'refunded' | null; readonly chainObservedAtMs: number | null;
  readonly intents: readonly { readonly id: string; readonly action: string; readonly state: string; readonly hash: string | null }[];
  readonly chat: readonly { readonly id: string; readonly direction: 'inbound' | 'outbound'; readonly text: string; readonly createdAt: number }[];
  readonly canFund: boolean; readonly canRelease: boolean; readonly canRefund: boolean;
}
export interface LocalnetSnapshot {
  readonly version: 1; readonly phase: 'locked' | 'ready' | 'working'; readonly profileIds: readonly string[];
  readonly profileId: string | null; readonly publicKey: string | null;
  readonly wallet: { readonly account: string; readonly chainId: '31337' } | null;
  readonly relay: string; readonly ads: readonly LocalnetAdView[]; readonly sessions: readonly LocalnetSessionView[];
  readonly trades: readonly LocalnetTradeView[]; readonly review: LocalnetReview | null;
  readonly error: string | null;
}
export type LocalnetResult =
  | { readonly ok: true; readonly snapshot: LocalnetSnapshot; readonly backupBytes?: Uint8Array; readonly restoredProfileId?: string }
  | { readonly ok: false; readonly code: string; readonly snapshot: LocalnetSnapshot };

export interface LocalnetClient {
  request(command: LocalnetCommand): Promise<LocalnetResult>;
  subscribe(listener: (snapshot: LocalnetSnapshot) => void): () => void;
  snapshot(): LocalnetSnapshot | null;
  dispose(): void;
}

export type LocalnetWorkerInput =
  | { readonly kind: 'command'; readonly id: number; readonly command: LocalnetCommand }
  | { readonly kind: 'wallet.result'; readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly kind: 'wallet.result'; readonly id: number; readonly ok: false; readonly code: number }
  | { readonly kind: 'wallet.event'; readonly event: 'accountsChanged' | 'chainChanged' | 'disconnect'; readonly value: unknown };
export type LocalnetWorkerOutput =
  | { readonly kind: 'result'; readonly id: number; readonly result: LocalnetResult }
  | { readonly kind: 'snapshot'; readonly snapshot: LocalnetSnapshot }
  | { readonly kind: 'wallet.request'; readonly id: number; readonly request: { readonly method: string; readonly params?: readonly unknown[] } };
