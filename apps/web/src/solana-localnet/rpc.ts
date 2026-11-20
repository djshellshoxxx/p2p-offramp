/** The only HTTP capability in this explicit local Worker profile. No retry, endpoint fallback or identity rewrite. */
import { parseSolanaRpcUrl } from './config.ts';
const METHODS = new Set(['getGenesisHash', 'getMultipleAccounts', 'getBlock', 'getLatestBlockhash', 'getSignatureStatuses',
  'getBlockHeight', 'isBlockhashValid', 'getFirstAvailableBlock', 'sendTransaction']);
const CAP = 2 * 1024 * 1024;
const refuse = (): never => { throw Error('RPC_UNAVAILABLE'); };
export function createSolanaLocalRpc(input: string) {
  const url = parseSolanaRpcUrl(input).url;
  let sequence = 0, disposed = false;
  const active = new Set<AbortController>();
  return {
    async request({ method, params = [], signal }: { readonly method: string; readonly params?: readonly unknown[]; readonly signal?: AbortSignal }): Promise<unknown> {
      if (disposed || signal?.aborted || !METHODS.has(method) || sequence === Number.MAX_SAFE_INTEGER) return refuse();
      const id = ++sequence, body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      if (body.length > 16384) return refuse();
      const controller = new AbortController(), abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true }); active.add(controller);
      const timer = setTimeout(abort, 15000);
      try {
        if (disposed || signal?.aborted) return refuse();
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
          signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' });
        if (disposed || controller.signal.aborted || !response.ok || !response.body || Number(response.headers.get('Content-Length') ?? 0) > CAP) return refuse();
        const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
        try {
          for (;;) {
            const part = await reader.read();
            if (disposed || controller.signal.aborted) return refuse();
            if (part.done) break;
            length += part.value.length; if (length > CAP) return refuse(); chunks.push(part.value);
          }
        } finally { await reader.cancel(); }
        const bytes = new Uint8Array(length); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return refuse();
        const reply = raw as Record<string, unknown>;
        if (reply.jsonrpc !== '2.0' || reply.id !== id || Object.keys(reply).length !== 3 || !Object.hasOwn(reply, 'result')) return refuse();
        return reply.result;
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); active.delete(controller); }
    },
    dispose() { disposed = true; for (const controller of active) controller.abort(); active.clear(); },
  };
}
