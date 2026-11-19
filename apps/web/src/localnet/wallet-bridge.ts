import type { Eip1193Provider } from '../../../../packages/wallet/localnet.ts';
import type { LocalnetReview } from './protocol.ts';

const READS = new Set(['eth_accounts', 'eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call',
  'eth_getTransactionCount', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getBalance', 'eth_estimateGas', 'eth_gasPrice']);
const REVIEWED_METHODS = new Set(['eth_signTypedData_v4', 'eth_sendTransaction']);
const rejected = (): never => { throw Object.assign(new Error('Wallet request refused.'), { code: 4100 }); };
export interface WalletBridge {
  beginConnect(): () => void;
  beginReview(review: LocalnetReview): () => void;
  revoke(): void;
  request(request: { readonly method: string; readonly params?: readonly unknown[] }): Promise<unknown>;
  dispose(): void;
}
/**
 * The physical prompt slot survives lock/cancel and lasts until the provider settles. A confirmation consumes one
 * exact finite request list; reads, relay messages and worker notifications can never mint another prompt budget.
 */
export function createLocalnetWalletBridge(provider: Eip1193Provider, now: () => number = Date.now): WalletBridge {
  let disposed = false, connect = false, physicalPrompt = false, generation = 0;
  let approval: { readonly generation: number; readonly deadline: number; readonly requests: readonly string[]; next: number } | null = null;
  const revoke = (): void => { generation++; connect = false; approval = null; };
  return {
    beginConnect() {
      if (disposed || physicalPrompt || connect || approval) return rejected();
      connect = true; const epoch = generation;
      return () => { if (generation === epoch) connect = false; };
    },
    beginReview(review) {
      if (disposed || physicalPrompt || connect || approval || review.expiresAtMs <= now() || review.walletRequests.length < 1 || review.walletRequests.length > 2 ||
          review.walletRequests.some(request => !REVIEWED_METHODS.has(request.method))) return rejected();
      const current = { generation, deadline: review.expiresAtMs, requests: review.walletRequests.map(request => JSON.stringify(request)), next: 0 };
      approval = current;
      return () => { if (approval === current) approval = null; };
    },
    revoke,
    async request(request) {
      if (disposed || !request || typeof request.method !== 'string' || JSON.stringify(request).length > 80_000) return rejected();
      if (READS.has(request.method)) return provider.request(request);
      if (physicalPrompt) return rejected();
      const epoch = generation;
      if (request.method === 'eth_requestAccounts') {
        if (!connect || request.params !== undefined && request.params.length !== 0) return rejected();
        connect = false;
      } else {
        if (!REVIEWED_METHODS.has(request.method)) return rejected();
        const current = approval;
        if (!current || current.generation !== epoch || current.deadline <= now() || current.requests[current.next] !== JSON.stringify(request)) return rejected();
        current.next++;
      }
      physicalPrompt = true;
      try {
        const send = provider.request;
        if (disposed || epoch !== generation) return rejected();
        const value = await send.call(provider, request);
        if (disposed || epoch !== generation) return rejected();
        return value;
      } finally { physicalPrompt = false; }
    },
    dispose() { disposed = true; revoke(); },
  };
}
