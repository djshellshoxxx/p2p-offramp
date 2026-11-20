/** Exact locally bundled jsqr@1.4.0. Runs only in the isolated, terminable image Worker. */
import bundledDecoder, { type Options, type QRCode } from 'jsqr';
import { copyQrPixels, MAX_CANDIDATE_TEXT_CHARS, refuse, type QrPixels } from './protocol.ts';

export function decodeQrPixels(frame: QrPixels): string | null {
  const owned = copyQrPixels(frame);
  try {
    // Upstream's CommonJS UMD export predates NodeNext declaration interop; verify its reviewed runtime shape.
    if (typeof bundledDecoder !== 'function') refuse('UNAVAILABLE');
    const jsQR = bundledDecoder as unknown as (pixels: Uint8ClampedArray, width: number, height: number, options: Options) => QRCode | null;
    // Upstream mutates its default option object. Always supply the complete option explicitly.
    const first = jsQR(owned.pixels, owned.width, owned.height, { inversionAttempts: 'attemptBoth' });
    if (!first) return null;
    if (typeof first.data !== 'string' || first.data.length > MAX_CANDIDATE_TEXT_CHARS) refuse('QR_TOO_LARGE');
    // Refuse a second independently detected symbol instead of making an implicit selection.
    // This is not a proof that every possible overlapping/damaged symbol can be detected.
    const corners = [first.location.topLeftCorner, first.location.topRightCorner, first.location.bottomLeftCorner, first.location.bottomRightCorner];
    if (corners.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) refuse('UNAVAILABLE');
    const minX = Math.max(0, Math.floor(Math.min(...corners.map(point => point.x))) - 1);
    const maxX = Math.min(owned.width, Math.ceil(Math.max(...corners.map(point => point.x))) + 1);
    const minY = Math.max(0, Math.floor(Math.min(...corners.map(point => point.y))) - 1);
    const maxY = Math.min(owned.height, Math.ceil(Math.max(...corners.map(point => point.y))) + 1);
    for (let y = minY; y < maxY; y++) owned.pixels.fill(255, (y * owned.width + minX) * 4, (y * owned.width + maxX) * 4);
    if (jsQR(owned.pixels, owned.width, owned.height, { inversionAttempts: 'attemptBoth' })) refuse('MULTIPLE_CODES');
    return first.data;
  } finally { owned.pixels.fill(0); }
}
