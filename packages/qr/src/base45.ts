/**
 * RFC 9285 base45, written from the RFC text. The alphabet is exactly the 45-character QR alphanumeric set, so a
 * base45 string can be carried in QR alphanumeric mode. Decoding is strict: every character must be in the alphabet,
 * a length of 1 mod 3 is refused, and a group whose value overflows its byte width (> 0xFFFF for a triple, > 0xFF for
 * the final pair) is refused. Strict decoding makes the byte/text mapping a bijection, so no two texts decode to the
 * same bytes. base45 carries no checksum: integrity comes from QR Reed-Solomon and the envelope payload hash.
 */
export const BASE45_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

export type Base45ErrorCode = 'INVALID_ENCODING' | 'TOO_LARGE' | 'INVALID_INPUT';
export type Base45DecodeResult =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly code: Base45ErrorCode };

const VALUE = new Int8Array(128).fill(-1);
for (let index = 0; index < BASE45_ALPHABET.length; index++) VALUE[BASE45_ALPHABET.charCodeAt(index)] = index;

const viewByteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength')!.get!;

function byteLength(bytes: unknown): number | null {
  if (!(bytes instanceof Uint8Array)) return null;
  try { return viewByteLength.call(bytes) as number; } catch { return null; }
}

/** Largest number of base45 characters that can decode to at most `maxBytes` bytes. */
export function maxBase45Length(maxBytes: number): number {
  return Math.floor(maxBytes / 2) * 3 + (maxBytes % 2) * 2;
}

/** Encodes bytes; throws TypeError only for a non-Uint8Array argument. */
export function encodeBase45(bytes: Uint8Array): string {
  const length = byteLength(bytes);
  if (length === null) throw new TypeError('base45 input must be a Uint8Array.');
  const out: string[] = [];
  let index = 0;
  for (; index + 1 < length; index += 2) {
    const n = (bytes[index] as number) * 256 + (bytes[index + 1] as number);
    const e = Math.floor(n / 2025), rest = n % 2025;
    out.push(BASE45_ALPHABET[rest % 45] as string, BASE45_ALPHABET[Math.floor(rest / 45)] as string, BASE45_ALPHABET[e] as string);
  }
  if (index < length) {
    const n = bytes[index] as number;
    out.push(BASE45_ALPHABET[n % 45] as string, BASE45_ALPHABET[Math.floor(n / 45)] as string);
  }
  return out.join('');
}

const fail = (code: Base45ErrorCode): Base45DecodeResult => Object.freeze({ ok: false, code });

/**
 * Strict decode. `maxBytes` (default unbounded) is checked from the text length before any allocation, so an
 * oversized input is refused without decoding it.
 */
export function decodeBase45(text: string, maxBytes = Number.MAX_SAFE_INTEGER): Base45DecodeResult {
  if (typeof text !== 'string' || !Number.isSafeInteger(maxBytes) || maxBytes < 0) return fail('INVALID_INPUT');
  const length = text.length;
  if (length % 3 === 1) return fail('INVALID_ENCODING');
  const outLength = Math.floor(length / 3) * 2 + (length % 3 === 2 ? 1 : 0);
  if (outLength > maxBytes) return fail('TOO_LARGE');
  const out = new Uint8Array(outLength);
  let read = 0, write = 0;
  const digit = (offset: number): number => {
    const unit = text.charCodeAt(offset);
    return unit < 128 ? VALUE[unit] as number : -1;
  };
  for (; read + 2 < length; read += 3) {
    const c = digit(read), d = digit(read + 1), e = digit(read + 2);
    if (c < 0 || d < 0 || e < 0) return fail('INVALID_ENCODING');
    const n = c + d * 45 + e * 2025;
    if (n > 0xffff) return fail('INVALID_ENCODING');
    out[write++] = n >> 8; out[write++] = n & 0xff;
  }
  if (read < length) {
    const c = digit(read), d = digit(read + 1);
    if (c < 0 || d < 0) return fail('INVALID_ENCODING');
    const n = c + d * 45;
    if (n > 0xff) return fail('INVALID_ENCODING');
    out[write++] = n;
  }
  return Object.freeze({ ok: true, bytes: out });
}
