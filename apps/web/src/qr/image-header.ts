/** Bounded PNG/JPEG preflight, before browser decompression. Native decoded dimensions are checked again. */
import { MAX_DECODE_EDGE, MAX_DECODE_PIXELS, MAX_IMAGE_BYTES, MAX_IMAGE_EDGE, MAX_IMAGE_PIXELS, refuse } from './protocol.ts';

export interface QrImageHeader { readonly format: 'png' | 'jpeg'; readonly width: number; readonly height: number }
function dimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) refuse('IMAGE_FORMAT');
  if (width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE || width * height > MAX_IMAGE_PIXELS) refuse('IMAGE_TOO_LARGE');
}
export function boundedDecodeDimensions(width: number, height: number): { readonly width: number; readonly height: number } {
  dimensions(width, height);
  const scale = Math.min(1, MAX_DECODE_EDGE / width, MAX_DECODE_EDGE / height, Math.sqrt(MAX_DECODE_PIXELS / (width * height)));
  return Object.freeze({ width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) });
}
export function inspectQrImage(bytes: Uint8Array): QrImageHeader {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) refuse('IMAGE_FORMAT');
  if (bytes.byteLength > MAX_IMAGE_BYTES) refuse('IMAGE_TOO_LARGE');
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return png(bytes);
  if (bytes[0] === 255 && bytes[1] === 216) return jpeg(bytes);
  return refuse('IMAGE_FORMAT');
}
function png(bytes: Uint8Array): QrImageHeader {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, width = 0, height = 0, data = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset), end = offset + 12 + length;
    if (end > bytes.length) refuse('IMAGE_FORMAT');
    const type = String.fromCharCode(bytes[offset + 4]!, bytes[offset + 5]!, bytes[offset + 6]!, bytes[offset + 7]!);
    if (!/^[A-Za-z]{4}$/.test(type) || ['acTL', 'fcTL', 'fdAT'].includes(type)) refuse('IMAGE_FORMAT');
    if (offset === 8) {
      if (type !== 'IHDR' || length !== 13) refuse('IMAGE_FORMAT');
      width = view.getUint32(offset + 8); height = view.getUint32(offset + 12); dimensions(width, height);
    } else if (type === 'IHDR') refuse('IMAGE_FORMAT');
    if (type === 'IDAT') data = true;
    if (type === 'IEND') {
      if (!data || length !== 0 || end !== bytes.length) refuse('IMAGE_FORMAT');
      return Object.freeze({ format: 'png', width, height });
    }
    offset = end;
  }
  return refuse('IMAGE_FORMAT');
}
function jpeg(bytes: Uint8Array): QrImageHeader {
  let offset = 2, width = 0, height = 0, scan = false, hadScan = false;
  while (offset < bytes.length) {
    if (scan) {
      while (offset < bytes.length && bytes[offset] !== 255) offset++;
    }
    if (bytes[offset++] !== 255) refuse('IMAGE_FORMAT');
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === undefined) refuse('IMAGE_FORMAT');
    if (scan && (marker === 0 || marker >= 208 && marker <= 215)) continue;
    scan = false;
    if (marker === 217) {
      if (!width || !hadScan || offset !== bytes.length) refuse('IMAGE_FORMAT');
      return Object.freeze({ format: 'jpeg', width, height });
    }
    if (marker === 0 || marker === 1 || marker >= 208 && marker <= 216 || offset + 2 > bytes.length) refuse('IMAGE_FORMAT');
    const length = bytes[offset]! * 256 + bytes[offset + 1]!;
    if (length < 2 || offset + length > bytes.length) refuse('IMAGE_FORMAT');
    if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) {
      if (width || hadScan || ![192, 194].includes(marker) || length < 11 || bytes[offset + 2] !== 8) refuse('IMAGE_FORMAT');
      height = bytes[offset + 3]! * 256 + bytes[offset + 4]!;
      width = bytes[offset + 5]! * 256 + bytes[offset + 6]!;
      const components = bytes[offset + 7]!;
      if (![1, 3, 4].includes(components) || length !== 8 + 3 * components) refuse('IMAGE_FORMAT');
      dimensions(width, height);
    }
    if (marker === 218) {
      if (!width || length < 6) refuse('IMAGE_FORMAT');
      scan = true; hadScan = true;
    }
    offset += length;
  }
  return refuse('IMAGE_FORMAT');
}
