import { decodeQrPixels } from './decoder.ts';
import { arrayBufferBytes, checkPixelDimensions, fixedFailure, refuse, type QrDecodeReply } from './protocol.ts';

const endpoint = self as unknown as DedicatedWorkerGlobalScope;
endpoint.addEventListener('message', (event: MessageEvent<unknown>) => {
  let id = 0, pixels: Uint8ClampedArray<ArrayBuffer> | null = null;
  let reply: QrDecodeReply;
  try {
    const value = event.data;
    if (typeof value !== 'object' || value === null || Object.getPrototypeOf(value) !== Object.prototype) refuse('INVALID_INPUT');
    const raw = value as Record<string, unknown>;
    if (Object.keys(raw).sort().join(',') !== 'height,id,kind,pixels,width' || raw.kind !== 'decode' ||
      typeof raw.id !== 'number' || !Number.isSafeInteger(raw.id) || raw.id < 1) refuse('INVALID_INPUT');
    id = raw.id; checkPixelDimensions(raw.width, raw.height);
    if (arrayBufferBytes(raw.pixels) !== raw.width * (raw.height as number) * 4) refuse('INVALID_INPUT');
    pixels = new Uint8ClampedArray(raw.pixels as ArrayBuffer);
    const text = decodeQrPixels({ width: raw.width, height: raw.height as number, pixels });
    reply = { id, ok: true, text };
  } catch (error) {
    const failure = fixedFailure(error);
    const code = ['IMAGE_TOO_LARGE', 'INVALID_INPUT', 'MULTIPLE_CODES', 'QR_TOO_LARGE'].includes(failure.code)
      ? failure.code as 'IMAGE_TOO_LARGE' | 'INVALID_INPUT' | 'MULTIPLE_CODES' | 'QR_TOO_LARGE' : 'UNAVAILABLE';
    reply = { id, ok: false, code };
  } finally { pixels?.fill(0); }
  endpoint.postMessage(reply);
});
