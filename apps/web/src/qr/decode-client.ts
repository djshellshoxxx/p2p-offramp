import { copyQrPixels, DECODE_TIMEOUT_MS, fixedFailure, MAX_CANDIDATE_TEXT_CHARS, refuse,
  type QrAppCode, type QrAppResult, type QrDecodeRequest, type QrPixels } from './protocol.ts';
export interface DecodeWorkerPort {
  postMessage(message: QrDecodeRequest, transfer: Transferable[]): void;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  removeEventListener(type: string, listener: (event: MessageEvent) => void): void;
  terminate(): void;
}
export interface QrDecodeClientOptions {
  makeWorker(): DecodeWorkerPort;
  schedule?: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>;
  clear?: (id: ReturnType<typeof setTimeout>) => void;
}
let physicalDecoderOwner: object | null = null;
/** A deadline terminates the actual Worker; there is no abandoned CPU job behind a released promise. */
export function createQrDecodeClient(options: QrDecodeClientOptions) {
  let counter = 0, disposed = false;
  let cancelJob: ((code: QrAppCode) => void) | null = null;
  const schedule = options.schedule ?? setTimeout, clear = options.clear ?? clearTimeout;
  return Object.freeze({
    async decode(frame: QrPixels): Promise<QrAppResult<string | null>> {
      if (disposed) return { ok: false, code: 'CANCELLED' };
      if (cancelJob || physicalDecoderOwner !== null) return { ok: false, code: 'BUSY' };
      const owner = {}; physicalDecoderOwner = owner;
      return new Promise(resolve => {
        const id = ++counter;
        let worker: DecodeWorkerPort | null = null, timer: ReturnType<typeof setTimeout> | null = null, settled = false;
        let owned: QrPixels | null = null, callbackActive = false, stopped = false, cleaning = false;
        const cleanup = () => {
          if (cleaning) return; cleaning = true;
          try {
            if (timer !== null) { try { clear(timer); } catch { /* Native timer cleanup is best effort. */ } timer = null; }
            if (worker !== null && !stopped) {
              try { worker.terminate(); stopped = true; }
              catch { /* Retain physical admission if the host cannot stop an existing Worker. */ }
            }
            try { owned?.pixels.fill(0); } catch { /* A transferred buffer is detached. */ }
            owned = null;
            // A reentrant cancellation cannot release admission while a factory may still return a live Worker.
            if (!callbackActive && (worker === null || stopped) && physicalDecoderOwner === owner) physicalDecoderOwner = null;
          } finally { cleaning = false; }
        };
        const finish = (result: QrAppResult<string | null>) => {
          if (settled) return; settled = true;
          cleanup();
          cancelJob = null; resolve(Object.freeze(result));
        };
        const current = () => {
          if (disposed && !settled) finish({ ok: false, code: 'CANCELLED' });
          if (settled) { cleanup(); return false; } return true;
        };
        cancelJob = code => finish({ ok: false, code });
        const receive = (event: MessageEvent) => {
          if (settled) return;
          try {
            const value: unknown = event.data;
            if (typeof value !== 'object' || value === null || Object.getPrototypeOf(value) !== Object.prototype) refuse('DECODER_PROTOCOL');
            const raw = value as Record<string, unknown>;
            const keys = Object.keys(raw).sort().join(',');
            if (raw.id !== id || keys !== (raw.ok === true ? 'id,ok,text' : 'code,id,ok')) refuse('DECODER_PROTOCOL');
            if (raw.ok === true) {
              if (raw.text !== null && (typeof raw.text !== 'string' || raw.text.length > MAX_CANDIDATE_TEXT_CHARS)) refuse('DECODER_PROTOCOL');
              finish({ ok: true, value: raw.text as string | null });
            } else {
              if (raw.ok !== false || typeof raw.code !== 'string' || !['IMAGE_TOO_LARGE', 'INVALID_INPUT', 'MULTIPLE_CODES', 'QR_TOO_LARGE', 'UNAVAILABLE'].includes(raw.code)) refuse('DECODER_PROTOCOL');
              finish({ ok: false, code: raw.code as QrAppCode });
            }
          } catch { finish({ ok: false, code: 'DECODER_PROTOCOL' }); }
        };
        try {
          callbackActive = true;
          try { owned = copyQrPixels(frame); } finally { callbackActive = false; }
          if (!current()) return;
          callbackActive = true;
          try { worker = options.makeWorker(); } finally { callbackActive = false; }
          if (!current()) return;
          const handlers: readonly [string, (event: MessageEvent) => void][] = [
            ['message', receive], ['error', () => finish({ ok: false, code: 'UNAVAILABLE' })],
            ['messageerror', () => finish({ ok: false, code: 'DECODER_PROTOCOL' })],
          ];
          for (const [type, handler] of handlers) {
            callbackActive = true;
            try { worker.addEventListener(type, handler); } finally { callbackActive = false; }
            if (!current()) return;
          }
          callbackActive = true;
          try { timer = schedule(() => finish({ ok: false, code: 'DECODE_TIMEOUT' }), DECODE_TIMEOUT_MS); }
          finally { callbackActive = false; }
          if (!current() || owned === null) return;
          callbackActive = true;
          try { worker.postMessage({ kind: 'decode', id, width: owned.width, height: owned.height, pixels: owned.pixels.buffer }, [owned.pixels.buffer]); }
          finally { callbackActive = false; }
          current();
        } catch (error) { callbackActive = false; finish(fixedFailure(error)); cleanup(); }
      });
    },
    cancel() { cancelJob?.('CANCELLED'); },
    dispose() { disposed = true; cancelJob?.('CANCELLED'); },
  });
}
