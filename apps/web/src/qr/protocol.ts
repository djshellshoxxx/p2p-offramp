/** Secret-free local image boundary. It has no vault, wallet, storage, URL or network command. */
export const MAX_PUBLIC_FILE_BYTES = 64 * 1024;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 2_000_000;
export const MAX_IMAGE_EDGE = 4096;
export const MAX_DECODE_PIXELS = 1_000_000;
export const MAX_DECODE_EDGE = 1024;
export const MAX_CANDIDATE_TEXT_CHARS = 4096;
export const DECODE_TIMEOUT_MS = 1000;

export const QR_APP_CODES = Object.freeze([
  'BUSY', 'CANCELLED', 'CONTEXT_CHANGED', 'REVIEW_REQUIRED', 'FILE_TOO_LARGE', 'FILE_FORMAT',
  'IMAGE_TOO_LARGE', 'IMAGE_FORMAT', 'NO_CODE', 'MULTIPLE_CODES', 'CAMERA_UNAVAILABLE', 'DECODE_TIMEOUT', 'DECODER_PROTOCOL',
  'QR_TOO_LARGE', 'FORMAT_UNSUPPORTED', 'URL_REFUSED', 'WALLET_SESSION_REFUSED', 'SECRET_REFUSED',
  'VERSION_UNSUPPORTED', 'INVALID_ENCODING', 'INVALID_UNICODE', 'INVALID_JSON', 'NON_CANONICAL',
  'PROTOCOL_UNSUPPORTED', 'TYPE_UNSUPPORTED', 'FIELD_UNSUPPORTED', 'INVALID_ENVELOPE', 'INVALID_PAYLOAD',
  'CHAIN_UNSUPPORTED', 'CHAIN_MISMATCH', 'HASH_MISMATCH', 'SIGNATURE_UNSUPPORTED', 'SIGNATURE_INVALID',
  'SIGNATURE_REQUIRED', 'PROFILE_UNSUPPORTED', 'EXPIRED', 'NOT_YET_VALID', 'LIFETIME_EXCEEDED',
  'INVALID_INPUT', 'UNAVAILABLE', 'REPLAYED', 'REPLAY_LEDGER_FULL', 'LOCAL_LIMIT_REACHED',
] as const);
export type QrAppCode = typeof QR_APP_CODES[number];
export type QrAppResult<T = undefined> = [T] extends [undefined]
  ? { readonly ok: true } | { readonly ok: false; readonly code: QrAppCode }
  : { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: QrAppCode };
export class QrAppError extends Error {
  readonly code: QrAppCode;
  constructor(code: QrAppCode) { super('Local QR operation refused.'); this.name = 'QrAppError'; this.code = code; }
}
export function refuse(code: QrAppCode): never { throw new QrAppError(code); }
export function fixedFailure(error: unknown): { readonly ok: false; readonly code: QrAppCode } {
  let code: QrAppCode = 'UNAVAILABLE';
  try {
    if (error instanceof QrAppError) {
      const field = Object.getOwnPropertyDescriptor(error, 'code');
      if (field && 'value' in field && QR_APP_CODES.includes(field.value as QrAppCode)) code = field.value as QrAppCode;
    }
  } catch { /* Foreign errors and diagnostics are never returned. */ }
  return Object.freeze({ ok: false, code });
}
export const QR_OK = Object.freeze({ ok: true } as const);
export interface QrPixels { readonly width: number; readonly height: number; readonly pixels: Uint8ClampedArray<ArrayBuffer> }
export interface QrDecodeRequest { readonly kind: 'decode'; readonly id: number; readonly width: number; readonly height: number; readonly pixels: ArrayBuffer }
export type QrDecodeReply = { readonly id: number; readonly ok: true; readonly text: string | null } |
  { readonly id: number; readonly ok: false; readonly code: 'IMAGE_TOO_LARGE' | 'INVALID_INPUT' | 'MULTIPLE_CODES' | 'QR_TOO_LARGE' | 'UNAVAILABLE' };
const typedArrayLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype) as object, 'byteLength')!.get!;
const bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength')!.get!;
export function arrayBufferBytes(input: unknown): number {
  try { return Reflect.apply(bufferLength, input, []) as number; } catch { return refuse('INVALID_INPUT'); }
}
export function checkPixelDimensions(width: unknown, height: unknown): asserts width is number {
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) refuse('INVALID_INPUT');
  if (width > MAX_DECODE_EDGE || height > MAX_DECODE_EDGE || width * height > MAX_DECODE_PIXELS) refuse('IMAGE_TOO_LARGE');
}
/** Intrinsic length and set bypass caller-defined iterators and properties; bounds precede allocation. */
export function copyQrPixels(input: QrPixels): QrPixels {
  const { width, height, pixels } = input;
  checkPixelDimensions(width, height);
  let length: number;
  try {
    if (!(pixels instanceof Uint8ClampedArray)) refuse('INVALID_INPUT');
    length = Reflect.apply(typedArrayLength, pixels, []) as number;
  } catch { return refuse('INVALID_INPUT'); }
  if (length !== width * height * 4) refuse('INVALID_INPUT');
  const copy = new Uint8ClampedArray(length);
  Reflect.apply(Uint8ClampedArray.prototype.set, copy, [pixels]);
  return { width, height, pixels: copy };
}
