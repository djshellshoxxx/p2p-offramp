import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { decodeQrPixels } from '../src/qr/decoder.ts';
import { JSQR_DIST_SHA256 } from '../scripts/qr-build-policy.mjs';

const frozen = JSON.parse(await readFile(new URL('../../../packages/qr/test/fixtures/vectors.json', import.meta.url), 'utf8')).vectors.qrSymbol.matrices;
function image(symbol, { scale = 4, inverted = false, rotate = false } = {}) {
  const width = (symbol.size + 8) * scale, pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  // Frozen rows are nibble-padded, not byte-padded. Odd hexadecimal lengths must retain their final nibble.
  const rows = symbol.rowsHex.map(row => [...row].map(digit => Number.parseInt(digit, 16).toString(2).padStart(4, '0')).join('').slice(0, symbol.size));
  assert.ok(rows.every(row => row.length === symbol.size));
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const row = Math.floor(y / scale) - 4, column = Math.floor(x / scale) - 4;
    const dark = rows[row]?.[column] === '1', value = dark !== inverted ? 0 : 255;
    const at = (rotate ? x * width + width - 1 - y : y * width + x) * 4;
    pixels[at] = pixels[at + 1] = pixels[at + 2] = value;
  }
  return { width, height: width, pixels };
}

test('independent pinned upstream decoder reads all 25 frozen symbols, including the 2048-byte envelope', () => {
  assert.equal(frozen.length, 25);
  for (const symbol of frozen) assert.equal(decodeQrPixels(image(symbol)), symbol.text, symbol.name);
});

test('rotation, inversion and a bounded damaged module recover exact public text; unreadable partial input does not select a code', () => {
  const symbol = frozen.find(item => item.name === 'envelope-recovery-fingerprint');
  for (const options of [{ rotate: true }, { inverted: true }, { inverted: true, rotate: true }]) assert.equal(decodeQrPixels(image(symbol, options)), symbol.text);
  const damaged = image(symbol), x = (symbol.size - 3 + 4) * 4, y = (symbol.size - 3 + 4) * 4;
  for (let yy = y; yy < y + 4; yy++) for (let xx = x; xx < x + 4; xx++) {
    const offset = (yy * damaged.width + xx) * 4;
    for (let channel = 0; channel < 3; channel++) damaged.pixels[offset + channel] = 255 - damaged.pixels[offset + channel];
  }
  assert.equal(decodeQrPixels(damaged), symbol.text);
  const partial = image(symbol); partial.pixels.fill(255, 0, Math.floor(partial.pixels.length * 0.6));
  assert.equal(decodeQrPixels(partial), null);
});

test('two clear symbols never silently select the first candidate', () => {
  const a = image(frozen[0]), width = a.width * 2 + 32, height = a.height;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 0; y < height; y++) {
    pixels.set(a.pixels.subarray(y * a.width * 4, (y + 1) * a.width * 4), y * width * 4);
    pixels.set(a.pixels.subarray(y * a.width * 4, (y + 1) * a.width * 4), (y * width + a.width + 32) * 4);
  }
  try { assert.equal(decodeQrPixels({ width, height, pixels }), null); }
  catch (error) { assert.equal(error.code, 'MULTIPLE_CODES'); }
});

test('installed decoder bytes are the reviewed upstream artifact and expose no external capabilities', async () => {
  const bytes = await readFile(new URL('../../../node_modules/jsqr/dist/jsQR.js', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), JSQR_DIST_SHA256);
  assert.doesNotMatch(bytes.toString('utf8'), /\b(?:eval\s*\(|new\s+Function\s*\(|fetch\s*\(|XMLHttpRequest\s*\(|WebSocket\s*\()/);
  const manifest = JSON.parse(await readFile(new URL('../../../node_modules/jsqr/package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, '1.4.0'); assert.equal(manifest.license, 'Apache-2.0');
  assert.deepEqual(manifest.dependencies ?? {}, {});
});
