import { createQrDecodeClient, type DecodeWorkerPort } from './decode-client.ts';
import { boundedDecodeDimensions, inspectQrImage } from './image-header.ts';
import { fixedFailure, refuse, type QrAppResult, type QrPixels } from './protocol.ts';

function pixelsFrom(source: CanvasImageSource, width: number, height: number): QrPixels {
  const target = boundedDecodeDimensions(width, height);
  const canvas = document.createElement('canvas'); canvas.width = target.width; canvas.height = target.height;
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) refuse('UNAVAILABLE');
    context.drawImage(source, 0, 0, target.width, target.height);
    const pixels = context.getImageData(0, 0, target.width, target.height).data;
    return { width: target.width, height: target.height, pixels };
  } finally { canvas.width = 0; canvas.height = 0; }
}
export function captureQrFrame(video: HTMLVideoElement): QrPixels {
  if (video.readyState < 2) refuse('CAMERA_UNAVAILABLE');
  return pixelsFrom(video, video.videoWidth, video.videoHeight);
}
export function createBrowserQrDecoder() {
  const client = createQrDecodeClient({ makeWorker() {
    const worker = new Worker(new URL('./decode.worker.ts', import.meta.url), { type: 'module', name: 'public-qr-decoder' });
    return worker as unknown as DecodeWorkerPort;
  } });
  const active = (signal: AbortSignal) => { if (signal.aborted) refuse('CANCELLED'); };
  async function decodePixels(pixels: QrPixels, signal: AbortSignal): Promise<QrAppResult<string | null>> {
    const cancel = () => client.cancel();
    try {
      active(signal); signal.addEventListener('abort', cancel, { once: true });
      const result = await client.decode(pixels); active(signal); return result;
    } catch (error) { return fixedFailure(error); }
    finally { signal.removeEventListener('abort', cancel); try { pixels.pixels.fill(0); } catch { /* Transfer is detached. */ } }
  }
  return Object.freeze({
    decodePixels,
    async decodeImage(bytes: Uint8Array<ArrayBuffer>, signal: AbortSignal): Promise<QrAppResult<string | null>> {
      let bitmap: ImageBitmap | null = null;
      try {
        active(signal);
        const header = inspectQrImage(bytes);
        // Blob/native image promises are physically uncancellable. The owning file slot remains held until finally.
        bitmap = await createImageBitmap(new Blob([bytes], { type: header.format === 'png' ? 'image/png' : 'image/jpeg' }));
        active(signal);
        if (!((bitmap.width === header.width && bitmap.height === header.height) ||
          (bitmap.width === header.height && bitmap.height === header.width))) refuse('IMAGE_FORMAT');
        return await decodePixels(pixelsFrom(bitmap, bitmap.width, bitmap.height), signal);
      } catch (error) { return fixedFailure(error); }
      finally { bitmap?.close(); }
    },
    cancel: client.cancel,
    dispose: client.dispose,
  });
}
