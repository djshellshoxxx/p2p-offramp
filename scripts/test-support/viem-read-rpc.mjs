/**
 * Dev-only adapter: exposes a viem client as the read-only EvmReadRpc that packages/chain-evm/src/reader.ts expects.
 * Test oracle plumbing only; never imported by app code. Only an explicit read allowlist is forwarded and nothing here
 * signs, sends or retries. Build the client with retries disabled (http(url, { retryCount: 0, batch: false })) so the
 * reader's own bounded-read/timeout semantics are unchanged.
 */
export const READ_METHOD_ALLOWLIST = Object.freeze(['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call', 'eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_blockNumber']);
const ALLOWED = new Set(READ_METHOD_ALLOWLIST);

/** Fixed-text error: never carries a URL, request body or provider message. */
export class ViemReadRpcError extends Error {
  constructor(kind, code) { super(`viem read rpc: ${kind}`); this.name = 'ViemReadRpcError'; this.kind = kind; this.code = code; }
}
const abortError = () => new ViemReadRpcError('aborted');

export function createViemReadRpc(publicClient) {
  return Object.freeze({
    async request({ method, params, signal }) {
      if (typeof method !== 'string' || !ALLOWED.has(method)) throw new ViemReadRpcError('method not allowed');
      if (signal?.aborted) throw abortError();
      let onAbort;
      const aborted = new Promise((_, reject) => { onAbort = () => reject(abortError()); signal?.addEventListener('abort', onAbort, { once: true }); });
      try {
        // viem's request() takes no AbortSignal, so abort is honored by racing; the physical request is left to drain.
        const physical = Promise.resolve().then(() => publicClient.request({ method, params: params === undefined ? [] : [...params] }));
        physical.catch(() => undefined);
        const result = await Promise.race([physical, aborted]);
        if (signal?.aborted) throw abortError();
        return result;
      } catch (error) {
        if (error instanceof ViemReadRpcError) throw error;
        const code = typeof error?.code === 'number' ? error.code : undefined;
        throw new ViemReadRpcError('provider error', code);
      } finally { signal?.removeEventListener('abort', onAbort); }
    },
  });
}
