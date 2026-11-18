/**
 * Strict UTF-8 (RFC 3629) without host TextEncoder/TextDecoder, so behavior does not depend on the runtime.
 * Encoding refuses lone surrogates. Decoding refuses overlong forms, encoded surrogates (U+D800..U+DFFF), code points
 * above U+10FFFF, truncated sequences and stray continuation bytes.
 */
export class Utf8Error extends Error {
  constructor() { super('Invalid UTF-8 or lone surrogate.'); this.name = 'Utf8Error'; }
}

/** True when every surrogate code unit is part of a valid high/low pair. */
export function isWellFormedString(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

export function encodeUtf8(value: string): Uint8Array {
  if (typeof value !== 'string') throw new Utf8Error();
  const out: number[] = [];
  for (let index = 0; index < value.length; index++) {
    let point = value.charCodeAt(index);
    if (point >= 0xd800 && point <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Utf8Error();
      point = 0x10000 + ((point - 0xd800) << 10) + (next - 0xdc00);
      index++;
    } else if (point >= 0xdc00 && point <= 0xdfff) throw new Utf8Error();
    if (point < 0x80) out.push(point);
    else if (point < 0x800) out.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    else if (point < 0x10000) out.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
    else out.push(0xf0 | (point >> 18), 0x80 | ((point >> 12) & 0x3f), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
  }
  return Uint8Array.from(out);
}

export function decodeUtf8(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array)) throw new Utf8Error();
  const units: string[] = [];
  const length = bytes.length;
  for (let index = 0; index < length;) {
    const lead = bytes[index] as number;
    if (lead < 0x80) { units.push(String.fromCharCode(lead)); index++; continue; }
    let need: number, point: number, min: number;
    if (lead >= 0xc2 && lead <= 0xdf) { need = 1; point = lead & 0x1f; min = 0x80; }
    else if (lead >= 0xe0 && lead <= 0xef) { need = 2; point = lead & 0x0f; min = 0x800; }
    else if (lead >= 0xf0 && lead <= 0xf4) { need = 3; point = lead & 0x07; min = 0x10000; }
    else throw new Utf8Error();
    for (let k = 1; k <= need; k++) {
      const next = bytes[index + k];
      if (next === undefined || (next & 0xc0) !== 0x80) throw new Utf8Error();
      point = (point << 6) | (next & 0x3f);
    }
    if (point < min || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) throw new Utf8Error();
    units.push(String.fromCodePoint(point));
    index += need + 1;
  }
  return units.join('');
}
