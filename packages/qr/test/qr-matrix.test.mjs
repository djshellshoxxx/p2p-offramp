import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeQrMatrix, renderQrSvg, qrCapacity, qrDataCodewords, dataCodewords, rawDataModules, alignmentPositions, formatInformation, versionInformation,
  reedSolomonGenerator, reedSolomonRemainder, penaltyScore, QR_EC_LEVELS, QR_TEXT_PREFIX, MAX_QR_TEXT_LENGTH, encodeBase45,
} from '../index.ts';

// Known answers below are published values (ISO/IEC 18004 and the widely reproduced "HELLO WORLD" walkthrough, and the
// capacity figures quoted in the accepted D6 decision and the 2026-11-03 research note), not values produced here.

test('Reed-Solomon known answers: ISO/IEC 18004 Annex I (1-M) and "HELLO WORLD" (1-Q)', () => {
  const iso = Uint8Array.of(16, 32, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17);
  assert.deepEqual([...reedSolomonRemainder(iso, 10)], [165, 36, 212, 193, 237, 54, 199, 135, 44, 85]);
  const hello = Uint8Array.of(32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236);
  assert.deepEqual([...reedSolomonRemainder(hello, 13)], [168, 72, 22, 82, 217, 54, 156, 0, 46, 15, 180, 122, 16]);
  assert.equal(reedSolomonGenerator(10).length, 11);
  assert.equal(reedSolomonGenerator(10)[0], 1);
});

test('the "HELLO WORLD" 1-Q data codewords equal the published walkthrough values', () => {
  const published = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236];
  assert.deepEqual([...qrDataCodewords('HELLO WORLD', 1, 'Q')], published);
  assert.equal(dataCodewords(1, 'Q'), 13);
  const { matrix } = encodeQrMatrix('HELLO WORLD', { ecLevel: 'Q' });
  assert.equal(matrix.version, 1); assert.equal(matrix.mode, 'alphanumeric'); assert.equal(matrix.size, 21);
  // Version 1 has a single block: the bottom-right column pair carries the first data codeword (0x20) upward.
  const { rows } = encodeQrMatrix('HELLO WORLD', { ecLevel: 'Q', mask: 0 }).matrix;
  const unmask = (x, y) => Number(rows[y][x]) ^ ((x + y) % 2 === 0 ? 1 : 0);
  const firstByte = [[20, 20], [19, 20], [20, 19], [19, 19], [20, 18], [19, 18], [20, 17], [19, 17]].reduce((byte, [x, y]) => (byte << 1) | unmask(x, y), 0);
  assert.equal(firstByte, published[0]);
  assert.equal(qrDataCodewords('HELLO WORLD', 1, 'H'), null, 'does not fit 1-H');
  assert.equal(qrDataCodewords('\ud800', 1, 'L'), null);
});

test('format information matches the 32 published BCH(15,5) words', () => {
  const table = {
    L: ['111011111000100', '111001011110011', '111110110101010', '111100010011101', '110011000101111', '110001100011000', '110110001000001', '110100101110110'],
    M: ['101010000010010', '101000100100101', '101111001111100', '101101101001011', '100010111111001', '100000011001110', '100111110010111', '100101010100000'],
    Q: ['011010101011111', '011000001101000', '011111100110001', '011101000000110', '010010010110100', '010000110000011', '010111011011010', '010101111101101'],
    H: ['001011010001001', '001001110111110', '001110011100111', '001100111010000', '000011101100010', '000001001010101', '000110100001100', '000100000111011'],
  };
  for (const level of QR_EC_LEVELS) for (let mask = 0; mask < 8; mask++)
    assert.equal(formatInformation(level, mask).toString(2).padStart(15, '0'), table[level][mask], `${level}${mask}`);
});

test('version information matches published words and is a BCH(18,6) codeword for every version 7-40', () => {
  assert.equal(versionInformation(7).toString(2).padStart(18, '0'), '000111110010010100');
  assert.equal(versionInformation(8).toString(2).padStart(18, '0'), '001000010110111100');
  assert.equal(versionInformation(40).toString(2).padStart(18, '0'), '101000110001101001');
  for (let version = 7; version <= 40; version++) {
    let remainder = versionInformation(version);
    for (let degree = 17; degree >= 12; degree--) if ((remainder >> degree) & 1) remainder ^= 0x1f25 << (degree - 12);
    assert.equal(remainder, 0, `v${version}`);
    assert.equal(versionInformation(version) >> 12, version);
  }
});

test('capacities match the figures quoted in D6 and the research note', () => {
  // D6: version 40 byte mode L/M/Q/H 2,953/2,331/1,663/1,273; alphanumeric 4,296/3,391/2,420/1,852.
  assert.deepEqual(QR_EC_LEVELS.map(level => qrCapacity(40, level, 'byte')), [2953, 2331, 1663, 1273]);
  assert.deepEqual(QR_EC_LEVELS.map(level => qrCapacity(40, level, 'alphanumeric')), [4296, 3391, 2420, 1852]);
  assert.deepEqual(QR_EC_LEVELS.map(level => qrCapacity(1, level, 'byte')), [17, 14, 11, 7]);
  assert.deepEqual(QR_EC_LEVELS.map(level => qrCapacity(1, level, 'alphanumeric')), [25, 20, 16, 10]);
  // Research note (MOB-10): version 38 at M holds 2,099 bytes; 1,024 bytes first fit at Q in version 31.
  assert.equal(qrCapacity(38, 'M', 'byte'), 2099);
  assert.equal(qrCapacity(30, 'Q', 'byte') < 1024 && qrCapacity(31, 'Q', 'byte') >= 1024, true);
  assert.deepEqual([rawDataModules(1), rawDataModules(7), rawDataModules(40)], [208, 1568, 29648]);
});

test('alignment pattern centres match ISO/IEC 18004 Annex E samples', () => {
  assert.deepEqual(alignmentPositions(1), []);
  assert.deepEqual(alignmentPositions(2), [6, 18]);
  assert.deepEqual(alignmentPositions(7), [6, 22, 38]);
  assert.deepEqual(alignmentPositions(14), [6, 26, 46, 66]);
  assert.deepEqual(alignmentPositions(32), [6, 34, 60, 86, 112, 138]);
  assert.deepEqual(alignmentPositions(40), [6, 30, 58, 86, 114, 142, 170]);
});

test('every version and level encodes its exact capacity and overflows to the next version by one character', () => {
  for (let version = 1; version <= 40; version++) for (const level of QR_EC_LEVELS) {
    for (const [mode, unit] of [['alphanumeric', 'A1'], ['byte', 'a']]) {
      const capacity = qrCapacity(version, level, mode), text = unit.repeat(capacity).slice(0, capacity);
      const fit = encodeQrMatrix(text, { ecLevel: level, minVersion: version, maxVersion: version, mask: version % 8 });
      assert.equal(fit.ok, true, `${version}${level} ${mode}`);
      assert.equal(fit.matrix.mode, mode);
      assert.equal(fit.matrix.size, version * 4 + 17);
      const over = encodeQrMatrix(unit.repeat(capacity + 1).slice(0, capacity + 1), { ecLevel: level, minVersion: version, maxVersion: version });
      assert.equal(over.code, 'QR_TOO_LARGE', `${version}${level} ${mode} +1`);
    }
  }
});

test('function patterns: three finders, timing lines, the dark module, and reserved format areas', () => {
  for (const version of [1, 7, 40]) {
    const { matrix } = encodeQrMatrix('P2POFFRAMP:1:TEST', { minVersion: version });
    const { rows, size } = matrix;
    const finder = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
    for (let r = 0; r < 7; r++) {
      assert.equal(rows[r].slice(0, 7), finder[r]); assert.equal(rows[r].slice(size - 7), finder[r]);
      assert.equal(rows[size - 7 + r].slice(0, 7), finder[r]);
    }
    for (let i = 8; i < size - 8; i++) { assert.equal(rows[6][i], i % 2 === 0 ? '1' : '0'); assert.equal(rows[i][6], i % 2 === 0 ? '1' : '0'); }
    assert.equal(rows[size - 8][8], '1', 'dark module');
    const formatTop = parseInt([0, 1, 2, 3, 4, 5, 7, 8].map(y => rows[y][8]).join('') + [7, 5, 4, 3, 2, 1, 0].map(x => rows[8][x]).join(''), 2);
    const bits = formatInformation(matrix.ecLevel, matrix.mask);
    let reversed = 0; for (let i = 0; i < 15; i++) reversed = (reversed << 1) | ((bits >> i) & 1);
    assert.equal(formatTop, reversed, 'first format copy, bit 0 at (8,0)');
  }
});

test('automatic mask choice is the lowest penalty of the eight; forcing a mask changes only the masked area', () => {
  for (const text of ['HELLO WORLD', `${QR_TEXT_PREFIX}${encodeBase45(new TextEncoder().encode('{"a":1}'))}`, 'p2p offramp é€\u{1F600}']) {
    const auto = encodeQrMatrix(text).matrix;
    const scores = Array.from({ length: 8 }, (_, mask) => penaltyScore(encodeQrMatrix(text, { mask }).matrix.rows));
    assert.equal(auto.mask, scores.indexOf(Math.min(...scores)), text);
    assert.deepEqual(encodeQrMatrix(text, { mask: auto.mask }).matrix.rows, auto.rows);
    assert.equal(new Set(Array.from({ length: 8 }, (_, mask) => encodeQrMatrix(text, { mask }).matrix.rows.join(''))).size, 8);
  }
});

test('P2POFFRAMP texts stay in alphanumeric mode up to the 2,048-byte envelope at the default level M', () => {
  const maximum = QR_TEXT_PREFIX + encodeBase45(new Uint8Array(2048).fill(0x7b));
  assert.equal(maximum.length, MAX_QR_TEXT_LENGTH);
  const largest = encodeQrMatrix(maximum);
  assert.equal(largest.ok, true); assert.equal(largest.matrix.mode, 'alphanumeric'); assert.equal(largest.matrix.ecLevel, 'M');
  assert.ok(largest.matrix.version <= 40);
  assert.equal(encodeQrMatrix(maximum, { ecLevel: 'Q' }).code, 'QR_TOO_LARGE', 'D6: 2,048 bytes fit L and M only');
  assert.equal(encodeQrMatrix(maximum, { ecLevel: 'L' }).ok, true);
  const target = encodeQrMatrix(QR_TEXT_PREFIX + encodeBase45(new Uint8Array(1024).fill(0x7b)));
  assert.ok(target.matrix.version < largest.matrix.version);
});

test('byte mode carries UTF-8; invalid input and options are refused', () => {
  assert.equal(encodeQrMatrix('hello').matrix.mode, 'byte');
  assert.equal(encodeQrMatrix('\ud800').code, 'INVALID_INPUT');
  for (const options of [{ ecLevel: 'X' }, { minVersion: 0 }, { maxVersion: 41 }, { minVersion: 5, maxVersion: 4 }, { mask: 8 }, { mask: -1 }, { mask: 1.5 }])
    assert.equal(encodeQrMatrix('A', options).code, 'INVALID_INPUT', JSON.stringify(options));
  assert.equal(encodeQrMatrix(42).code, 'INVALID_INPUT');
  assert.equal(encodeQrMatrix('a'.repeat(2954), { ecLevel: 'L' }).code, 'QR_TOO_LARGE');
  const result = encodeQrMatrix('A');
  assert.equal(Object.isFrozen(result.matrix) && Object.isFrozen(result.matrix.rows), true);
});

test('SVG output is static, has a quiet zone of at least four modules and paints exactly the dark modules', () => {
  const { matrix } = encodeQrMatrix('HELLO WORLD', { ecLevel: 'Q' });
  const svg = renderQrSvg(matrix);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="232" height="232" viewBox="0 0 29 29" shape-rendering="crispEdges">/);
  assert.doesNotMatch(svg, /<script|href|<image|<foreignObject|on[a-z]+=|url\(/i);
  assert.equal((svg.match(/<path /g) ?? []).length, 1);
  const painted = [...svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)];
  assert.equal(painted.reduce((sum, match) => sum + Number(match[3]), 0), matrix.rows.join('').split('').filter(cell => cell === '1').length);
  assert.ok(painted.every(match => Number(match[1]) >= 4 && Number(match[2]) >= 4));
  assert.match(renderQrSvg(matrix, { quietZone: 6, moduleSize: 2, dark: '#123', light: '#FfFfFf' }), /viewBox="0 0 33 33"/);
  for (const options of [{ quietZone: 3 }, { moduleSize: 0 }, { dark: 'red' }, { dark: '#000"/><script>alert(1)</script>' }, { light: 'url(#x)' }])
    assert.throws(() => renderQrSvg(matrix, options), RangeError);
  assert.throws(() => renderQrSvg({ ...matrix, rows: [...matrix.rows.slice(1), matrix.rows[0].replace('1', '2')] }), RangeError);
});
