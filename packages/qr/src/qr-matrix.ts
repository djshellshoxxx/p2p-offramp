/**
 * ISO/IEC 18004 (QR Code Model 2) symbol encoder: alphanumeric and byte modes, versions 1-40, error-correction
 * levels L/M/Q/H, Reed-Solomon over GF(256) (polynomial 0x11D), the eight data masks with the standard penalty rules,
 * BCH format and version information, and an SVG renderer with a quiet zone of at least four modules.
 *
 * This produces a module matrix only. It has no camera, image decoder or scanner, and physical scan qualification
 * (iOS, Android, desktop; printed, low-light, inverted, partial) has not been done. Penalty rule 3 (finder-like
 * patterns) uses the common reading that treats the area beyond the symbol as light; another encoder may pick a
 * different (equally valid) mask for the same data.
 *
 * Verification: published known answers (ISO/IEC 18004 Annex I and the widely used "HELLO WORLD" 1-Q Reed-Solomon
 * codewords, the 32 format-information words, version information, D6's capacity figures) and an independent
 * stdlib Python reader in scripts/vectors/check_qr_codec.py that decodes every frozen matrix, checks every
 * Reed-Solomon block and recovers the text. No third-party scanner has read these symbols yet.
 */
import { BASE45_ALPHABET } from './base45.ts';
import { encodeUtf8, isWellFormedString } from './utf8.ts';

export type QrEcLevel = 'L' | 'M' | 'Q' | 'H';
export const QR_EC_LEVELS = Object.freeze(['L', 'M', 'Q', 'H'] as const);
/** D6: error correction M by default until physical scan tests set the final profile. */
export const DEFAULT_QR_EC_LEVEL: QrEcLevel = 'M';
export const MIN_QR_VERSION = 1, MAX_QR_VERSION = 40;
export const MIN_QUIET_ZONE_MODULES = 4;
export type QrSegmentMode = 'alphanumeric' | 'byte';

export interface QrMatrix {
  readonly version: number; readonly ecLevel: QrEcLevel; readonly mask: number; readonly mode: QrSegmentMode;
  /** Modules per side (version * 4 + 17). */
  readonly size: number;
  /** One string per row, `1` for dark and `0` for light, row 0 at the top. */
  readonly rows: readonly string[];
}
export type QrMatrixErrorCode = 'QR_TOO_LARGE' | 'INVALID_INPUT';
export type QrMatrixResult = { readonly ok: true; readonly matrix: QrMatrix } | { readonly ok: false; readonly code: QrMatrixErrorCode };
export interface QrMatrixOptions {
  readonly ecLevel?: QrEcLevel;
  readonly minVersion?: number; readonly maxVersion?: number;
  /** 0-7 forces a mask; omitted chooses the lowest-penalty mask. */
  readonly mask?: number;
}

// ISO/IEC 18004 Table 9: error-correction codewords per block and number of blocks, indexed [level][version].
const ECC_PER_BLOCK: readonly (readonly number[])[] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const NUM_BLOCKS: readonly (readonly number[])[] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];
const ORDINAL: Readonly<Record<QrEcLevel, number>> = Object.freeze({ L: 0, M: 1, Q: 2, H: 3 });
/** Format-information level indicator bits (ISO/IEC 18004 Table 12). */
const FORMAT_LEVEL: Readonly<Record<QrEcLevel, number>> = Object.freeze({ L: 1, M: 0, Q: 3, H: 2 });

// ---- GF(256) Reed-Solomon -------------------------------------------------------------------------------------
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255] as number;
const gfMul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[(LOG[a] as number) + (LOG[b] as number)] as number);

/** Monic generator polynomial prod_{i<degree} (x - a^i), highest-degree coefficient first (leading 1 included). */
export function reedSolomonGenerator(degree: number): Uint8Array {
  let poly = Uint8Array.of(1);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1), root = EXP[i] as number;
    for (let j = 0; j < poly.length; j++) {
      next[j] = (next[j] as number) ^ (poly[j] as number);
      next[j + 1] = (next[j + 1] as number) ^ gfMul(poly[j] as number, root);
    }
    poly = next;
  }
  return poly;
}
/** Remainder of data(x) * x^degree divided by the generator: the error-correction codewords. */
export function reedSolomonRemainder(data: Uint8Array, degree: number): Uint8Array {
  const generator = reedSolomonGenerator(degree), remainder = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ (remainder[0] as number);
    remainder.copyWithin(0, 1); remainder[degree - 1] = 0;
    for (let j = 0; j < degree; j++) remainder[j] = (remainder[j] as number) ^ gfMul(generator[j + 1] as number, factor);
  }
  return remainder;
}

// ---- Capacity --------------------------------------------------------------------------------------------------
/** Modules available for data and error correction (excludes function patterns, format and version information). */
export function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}
export function dataCodewords(version: number, level: QrEcLevel): number {
  const o = ORDINAL[level];
  return Math.floor(rawDataModules(version) / 8) - (ECC_PER_BLOCK[o]?.[version] as number) * (NUM_BLOCKS[o]?.[version] as number);
}
const countBits = (mode: QrSegmentMode, version: number): number =>
  mode === 'alphanumeric' ? (version <= 9 ? 9 : version <= 26 ? 11 : 13) : (version <= 9 ? 8 : 16);
const segmentBits = (mode: QrSegmentMode, length: number): number =>
  mode === 'alphanumeric' ? 11 * Math.floor(length / 2) + 6 * (length % 2) : 8 * length;
/** Largest number of characters (alphanumeric) or bytes (byte mode) one symbol holds. */
export function qrCapacity(version: number, level: QrEcLevel, mode: QrSegmentMode): number {
  const available = dataCodewords(version, level) * 8 - 4 - countBits(mode, version);
  const count = mode === 'alphanumeric' ? Math.floor(available / 11) * 2 + (available % 11 >= 6 ? 1 : 0) : Math.floor(available / 8);
  return Math.min(count, 2 ** countBits(mode, version) - 1);
}
/** Alignment pattern centre coordinates for a version (used on both axes). */
export function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2, size = version * 4 + 17;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const positions = [6];
  for (let i = count - 2; i >= 0; i--) positions.push(size - 7 - i * step);
  return positions;
}

// ---- BCH format and version information ------------------------------------------------------------------------
/** 15-bit format information: BCH(15,5) with generator 0x537, XOR-masked with 0x5412. */
export function formatInformation(level: QrEcLevel, mask: number): number {
  const data = (FORMAT_LEVEL[level] << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >> 9) * 0x537);
  return ((data << 10) | remainder) ^ 0x5412;
}
/** 18-bit version information (versions 7-40): BCH(18,6) with generator 0x1F25. */
export function versionInformation(version: number): number {
  let remainder = version;
  for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >> 11) * 0x1f25);
  return (version << 12) | remainder;
}
const bit = (value: number, index: number): boolean => ((value >>> index) & 1) !== 0;

// ---- Symbol construction ---------------------------------------------------------------------------------------
class Grid {
  readonly size: number;
  readonly dark: Uint8Array;
  readonly fixed: Uint8Array;
  constructor(size: number) { this.size = size; this.dark = new Uint8Array(size * size); this.fixed = new Uint8Array(size * size); }
  set(x: number, y: number, dark: boolean): void { this.dark[y * this.size + x] = dark ? 1 : 0; this.fixed[y * this.size + x] = 1; }
  isDark(x: number, y: number): boolean { return this.dark[y * this.size + x] === 1; }
  isFixed(x: number, y: number): boolean { return this.fixed[y * this.size + x] === 1; }
}

function drawFormat(grid: Grid, level: QrEcLevel, mask: number): void {
  const bits = formatInformation(level, mask), size = grid.size;
  for (let i = 0; i <= 5; i++) grid.set(8, i, bit(bits, i));
  grid.set(8, 7, bit(bits, 6)); grid.set(8, 8, bit(bits, 7)); grid.set(7, 8, bit(bits, 8));
  for (let i = 9; i < 15; i++) grid.set(14 - i, 8, bit(bits, i));
  for (let i = 0; i < 8; i++) grid.set(size - 1 - i, 8, bit(bits, i));
  for (let i = 8; i < 15; i++) grid.set(8, size - 15 + i, bit(bits, i));
  grid.set(8, size - 8, true); // the dark module
}

function drawFunctionPatterns(grid: Grid, version: number, level: QrEcLevel): void {
  const size = grid.size;
  for (let i = 0; i < size; i++) { grid.set(6, i, i % 2 === 0); grid.set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, ring = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) grid.set(x, y, ring !== 2 && ring !== 4);
    }
  }
  const centres = alignmentPositions(version), last = centres.length - 1;
  for (let i = 0; i <= last; i++) for (let j = 0; j <= last; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue; // finder corners
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
      grid.set((centres[i] as number) + dx, (centres[j] as number) + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  drawFormat(grid, level, 0); // reserves the format areas; redrawn once the mask is known
  if (version >= 7) {
    const bits = versionInformation(version);
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3), b = Math.floor(i / 3), dark = bit(bits, i);
      grid.set(a, b, dark); grid.set(b, a, dark);
    }
  }
}

function interleave(data: Uint8Array, version: number, level: QrEcLevel): Uint8Array {
  const o = ORDINAL[level], blocks = NUM_BLOCKS[o]?.[version] as number, ecc = ECC_PER_BLOCK[o]?.[version] as number;
  const raw = Math.floor(rawDataModules(version) / 8), shortBlocks = blocks - (raw % blocks), shortLength = Math.floor(raw / blocks);
  const dataBlocks: Uint8Array[] = [], eccBlocks: Uint8Array[] = [];
  for (let i = 0, offset = 0; i < blocks; i++) {
    const length = shortLength - ecc + (i < shortBlocks ? 0 : 1), block = data.subarray(offset, offset + length);
    offset += length; dataBlocks.push(block); eccBlocks.push(reedSolomonRemainder(block, ecc));
  }
  const out: number[] = [];
  for (let i = 0; i <= shortLength - ecc; i++) for (const block of dataBlocks) if (i < block.length) out.push(block[i] as number);
  for (let i = 0; i < ecc; i++) for (const block of eccBlocks) out.push(block[i] as number);
  if (out.length !== raw) throw new Error('codeword count');
  return Uint8Array.from(out);
}

function placeCodewords(grid: Grid, codewords: Uint8Array, version: number): void {
  const size = grid.size, total = codewords.length * 8;
  let index = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip the vertical timing column
    const upward = ((right + 1) & 2) === 0;
    for (let step = 0; step < size; step++) {
      const y = upward ? size - 1 - step : step;
      for (let column = 0; column < 2; column++) {
        const x = right - column;
        if (grid.isFixed(x, y)) continue;
        // Remainder bits after the last codeword stay light.
        const dark = index < total && bit(codewords[index >> 3] as number, 7 - (index & 7));
        grid.dark[y * size + x] = dark ? 1 : 0;
        index++;
      }
    }
  }
  // The free modules counted by walking the drawn grid must equal the capacity formula the block tables assume.
  if (index !== rawDataModules(version)) throw new Error('module count');
}

const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];
function applyMask(grid: Grid, mask: number): void {
  const pattern = MASKS[mask] as (x: number, y: number) => boolean;
  for (let y = 0; y < grid.size; y++) for (let x = 0; x < grid.size; x++)
    if (!grid.isFixed(x, y) && pattern(x, y)) grid.dark[y * grid.size + x] = grid.isDark(x, y) ? 0 : 1;
}

/** Finder-like 1:1:3:1:1 runs with a 4-module light run on one side; the area outside the symbol counts as light. */
function finderPatterns(runs: readonly number[]): number {
  let count = 0;
  // runs alternate light, dark, light, ... starting and ending with a light run (already padded by the quiet zone).
  for (let i = 1; i + 4 < runs.length; i += 2) {
    const n = runs[i] as number;
    if (runs[i + 1] !== n || runs[i + 2] !== 3 * n || runs[i + 3] !== n || runs[i + 4] !== n) continue;
    const before = runs[i - 1] as number, after = (runs[i + 5] ?? 0);
    if (before >= 4 * n && after >= n) count++;
    if (after >= 4 * n && before >= n) count++;
  }
  return count;
}
function linePenalty(read: (index: number) => boolean, size: number): number {
  let penalty = 0;
  const runs: number[] = [];
  let color = false, length = 0;
  for (let index = 0; index < size; index++) {
    const dark = read(index);
    if (dark === color) { length++; continue; }
    runs.push(length); color = dark; length = 1;
  }
  runs.push(length);
  if (color) runs.push(0);
  for (let index = 0; index < runs.length; index++) {
    const run = runs[index] as number;
    if (run >= 5) penalty += 3 + (run - 5);
  }
  runs[0] = (runs[0] as number) + size;
  runs[runs.length - 1] = (runs[runs.length - 1] as number) + size;
  return penalty + 40 * finderPatterns(runs);
}
export function penaltyScore(rows: readonly string[]): number {
  const size = rows.length, dark = (x: number, y: number): boolean => (rows[y] as string).charCodeAt(x) === 0x31;
  let penalty = 0, darkCount = 0;
  for (let y = 0; y < size; y++) penalty += linePenalty(x => dark(x, y), size);
  for (let x = 0; x < size; x++) penalty += linePenalty(y => dark(x, y), size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (dark(x, y)) darkCount++;
    if (x + 1 < size && y + 1 < size) {
      const c = dark(x, y);
      if (dark(x + 1, y) === c && dark(x, y + 1) === c && dark(x + 1, y + 1) === c) penalty += 3;
    }
  }
  const total = size * size, k = Math.floor((Math.abs(darkCount * 20 - total * 10) + total - 1) / total) - 1;
  return penalty + 10 * k;
}
const toRows = (grid: Grid): string[] => {
  const rows: string[] = [];
  for (let y = 0; y < grid.size; y++) rows.push(Array.from(grid.dark.subarray(y * grid.size, (y + 1) * grid.size), value => (value ? '1' : '0')).join(''));
  return rows;
};

function segment(text: string): { readonly mode: QrSegmentMode; readonly bits: number[]; readonly count: number } | null {
  const bits: number[] = [];
  const push = (value: number, width: number): void => { for (let i = width - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  if ([...text].every(char => BASE45_ALPHABET.includes(char))) {
    for (let i = 0; i + 1 < text.length; i += 2) push(BASE45_ALPHABET.indexOf(text[i] as string) * 45 + BASE45_ALPHABET.indexOf(text[i + 1] as string), 11);
    if (text.length % 2) push(BASE45_ALPHABET.indexOf(text[text.length - 1] as string), 6);
    return { mode: 'alphanumeric', bits, count: text.length };
  }
  if (!isWellFormedString(text)) return null;
  const bytes = encodeUtf8(text);
  for (const byte of bytes) push(byte, 8);
  return { mode: 'byte', bits, count: bytes.length };
}

/**
 * Encodes `text` as one QR symbol: a single alphanumeric segment when every character is in the QR alphanumeric
 * set (as P2POFFRAMP codes are), otherwise one UTF-8 byte segment. Chooses the smallest fitting version.
 */
export function encodeQrMatrix(text: string, options: QrMatrixOptions = {}): QrMatrixResult {
  const level = options.ecLevel ?? DEFAULT_QR_EC_LEVEL;
  const minVersion = options.minVersion ?? MIN_QR_VERSION, maxVersion = options.maxVersion ?? MAX_QR_VERSION;
  if (typeof text !== 'string' || !QR_EC_LEVELS.includes(level) || !Number.isSafeInteger(minVersion) || !Number.isSafeInteger(maxVersion)
    || minVersion < MIN_QR_VERSION || maxVersion > MAX_QR_VERSION || minVersion > maxVersion
    || (options.mask !== undefined && (!Number.isSafeInteger(options.mask) || options.mask < 0 || options.mask > 7))) return Object.freeze({ ok: false, code: 'INVALID_INPUT' });
  const seg = segment(text);
  if (seg === null) return Object.freeze({ ok: false, code: 'INVALID_INPUT' });
  let version = minVersion;
  for (; version <= maxVersion; version++) {
    if (seg.count < 2 ** countBits(seg.mode, version) && 4 + countBits(seg.mode, version) + seg.bits.length <= dataCodewords(version, level) * 8) break;
  }
  if (version > maxVersion) return Object.freeze({ ok: false, code: 'QR_TOO_LARGE' });
  const capacityBits = dataCodewords(version, level) * 8, bits: number[] = [];
  const push = (value: number, width: number): void => { for (let i = width - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  push(seg.mode === 'alphanumeric' ? 0b0010 : 0b0100, 4);
  push(seg.count, countBits(seg.mode, version));
  bits.push(...seg.bits);
  push(0, Math.min(4, capacityBits - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data = new Uint8Array(capacityBits / 8);
  for (let i = 0; i < bits.length; i++) data[i >> 3] = (data[i >> 3] as number) | ((bits[i] as number) << (7 - (i & 7)));

  const grid = new Grid(version * 4 + 17);
  drawFunctionPatterns(grid, version, level);
  placeCodewords(grid, interleave(data, version, level), version);
  let mask = options.mask ?? -1;
  if (mask < 0) {
    let best = Infinity;
    for (let candidate = 0; candidate < 8; candidate++) {
      applyMask(grid, candidate); drawFormat(grid, level, candidate);
      const score = penaltyScore(toRows(grid));
      if (score < best) { best = score; mask = candidate; }
      applyMask(grid, candidate);
    }
  }
  applyMask(grid, mask); drawFormat(grid, level, mask);
  return Object.freeze({ ok: true, matrix: Object.freeze({ version, ecLevel: level, mask, mode: seg.mode, size: grid.size, rows: Object.freeze(toRows(grid)) }) });
}

export interface QrSvgOptions {
  /** Quiet zone in modules; at least 4 (ISO/IEC 18004). */
  readonly quietZone?: number;
  /** Rendered pixels per module; the SVG also carries a viewBox so it scales crisply. */
  readonly moduleSize?: number;
  readonly dark?: string; readonly light?: string;
}
const COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Static SVG with one path; no script, link, external reference or embedded image. Colors must be #rgb or #rrggbb. */
export function renderQrSvg(matrix: QrMatrix, options: QrSvgOptions = {}): string {
  const quiet = options.quietZone ?? MIN_QUIET_ZONE_MODULES, scale = options.moduleSize ?? 8;
  const dark = options.dark ?? '#000000', light = options.light ?? '#ffffff';
  if (!Number.isSafeInteger(quiet) || quiet < MIN_QUIET_ZONE_MODULES || quiet > 64 || !Number.isSafeInteger(scale) || scale < 1 || scale > 64
    || !COLOR.test(dark) || !COLOR.test(light)) throw new RangeError('Invalid SVG options.');
  const rows = matrix.rows, size = rows.length;
  if (size !== matrix.size || !rows.every(row => row.length === size && /^[01]+$/.test(row))) throw new RangeError('Invalid matrix.');
  const extent = size + quiet * 2, path: string[] = [];
  for (let y = 0; y < size; y++) {
    const row = rows[y] as string;
    for (let x = 0; x < size;) {
      if (row[x] !== '1') { x++; continue; }
      let end = x; while (end < size && row[end] === '1') end++;
      path.push(`M${x + quiet} ${y + quiet}h${end - x}v1h-${end - x}z`);
      x = end;
    }
  }
  const pixels = extent * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 ${extent} ${extent}" shape-rendering="crispEdges">`
    + `<rect width="${extent}" height="${extent}" fill="${light}"/><path fill="${dark}" d="${path.join('')}"/></svg>`;
}
