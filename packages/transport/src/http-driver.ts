/** Bounded injected HTTP I/O within an issued G05 scope. This driver issues no consent or route evidence. */
import type { TransportResult } from '../../schemas/index.ts';
import type { TransportScope } from './policy.ts';

export const MAX_HTTP_BYTES = 65536;
export const MAX_HTTP_OPERATIONS = 8;
export const MAX_HTTP_READS = 1024;
export interface HttpResponsePort {
  readonly ok: boolean;
  readonly redirected: boolean;
  readonly url: string;
  readonly headers: Pick<Headers, 'get'>;
  readonly body: ReadableStream<Uint8Array> | null;
}
export type HttpFetchPort = (url: string, init: RequestInit) => Promise<HttpResponsePort>;
const fail = (error: 'INVALID_ENDPOINT' | 'POLICY_BLOCKED' | 'CANCELLED' | 'LIMIT_EXCEEDED' | 'ROUTE_UNAVAILABLE'): TransportResult<never> => ({ ok: false, error });

/** Construct only with a reviewed fetch implementation. The caller binds URL to its trusted registry grant.
 * No default fetch, redirect retry, credentials, route fallback or publication retry exists.
 * Slots remain occupied until native fetch/read settles, even when scope.run has returned cancellation.
 */
export class BoundedHttpDriver {
  readonly #fetch: HttpFetchPort;
  #pending = 0;
  constructor(fetch: HttpFetchPort) { this.#fetch = fetch; }
  get pending(): number { return this.#pending; }
  async request(scope: TransportScope, endpoint: string, body?: Uint8Array): Promise<TransportResult<Uint8Array>> {
    let url: URL, payload: Uint8Array | undefined;
    try {
      url = new URL(endpoint);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.href !== endpoint || endpoint.length > 2048) return fail('INVALID_ENDPOINT');
      if (body !== undefined) {
        const length = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype) as object, 'byteLength')!.get!.call(body) as number;
        if (!(body instanceof Uint8Array) || length > MAX_HTTP_BYTES) return fail('LIMIT_EXCEEDED');
        payload = new Uint8Array(length); Uint8Array.prototype.set.call(payload, body);
      }
    } catch { return fail('INVALID_ENDPOINT'); }
    if (!scope.current() || scope.signal.aborted) return fail('CANCELLED');
    if (this.#pending >= MAX_HTTP_OPERATIONS) return fail('LIMIT_EXCEEDED');
    this.#pending++;
    let invoked = false;
    try {
      const result = await scope.run(async signal => {
        invoked = true;
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        const chunks: Uint8Array[] = [];
        const cancel = () => { void reader?.cancel().catch(() => undefined); };
        try {
          signal.addEventListener('abort', cancel, { once: true });
          if (signal.aborted || !scope.current()) return fail('CANCELLED');
          const response = await this.#fetch(url.href, {
            method: payload === undefined ? 'GET' : 'POST', redirect: 'error', credentials: 'omit',
            cache: 'no-store', referrerPolicy: 'no-referrer', signal,
            headers: { Accept: 'application/json', ...(payload ? { 'Content-Type': 'application/json' } : {}) },
            ...(payload ? { body: payload as Uint8Array<ArrayBuffer> } : {}),
          });
          reader = response.body?.getReader();
          if (signal.aborted || !scope.current()) return fail('CANCELLED');
          if (!response.ok || response.redirected || response.url !== url.href) return fail('ROUTE_UNAVAILABLE');
          const length = response.headers.get('content-length');
          if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || length.length > 6 || Number(length) > MAX_HTTP_BYTES)) return fail('LIMIT_EXCEEDED');
          if (!reader) return fail('ROUTE_UNAVAILABLE');
          let total = 0, reads = 0;
          for (;;) {
            if (++reads > MAX_HTTP_READS) return fail('LIMIT_EXCEEDED');
            const next = await reader.read();
            if (signal.aborted || !scope.current()) return fail('CANCELLED');
            if (next.done) break;
            if (!(next.value instanceof Uint8Array)) return fail('ROUTE_UNAVAILABLE');
            total += next.value.byteLength;
            if (total > MAX_HTTP_BYTES) return fail('LIMIT_EXCEEDED');
            chunks.push(next.value.slice());
          }
          if (length !== null && total !== Number(length)) return fail('ROUTE_UNAVAILABLE');
          const bytes = new Uint8Array(total); let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
          return { ok: true as const, value: bytes };
        } catch { return fail(signal.aborted || !scope.current() ? 'CANCELLED' : 'ROUTE_UNAVAILABLE'); }
        finally {
          signal.removeEventListener('abort', cancel);
          try { await reader?.cancel(); } catch { /* No foreign diagnostics or retry. */ }
          for (const chunk of chunks) chunk.fill(0);
          payload?.fill(0); this.#pending--;
        }
      });
      return result.ok ? result.value : result;
    } catch { return fail('ROUTE_UNAVAILABLE'); }
    finally { if (!invoked) { payload?.fill(0); this.#pending--; } }
  }
}
