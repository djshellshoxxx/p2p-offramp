import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as d from './derive.mjs';

const enc = new TextEncoder();
const fixture = () => JSON.parse(readFileSync(d.FIXTURE_PATH, 'utf8'));

test('fixture regenerates byte-identical', () => {
  assert.equal(readFileSync(d.FIXTURE_PATH, 'utf8'), d.render());
});

test('PROGRAM_ID', () => {
  assert.equal(d.PROGRAM_ID, '7q2EChqznfQea58ZfUvBzRd97Bc28kwHaey1tYy7ADjq');
  assert.deepEqual(d.base58Decode(d.PROGRAM_ID, 32), enc.encode(d.PROGRAM_ID_ASCII));
});

test('negatives throw', () => {
  const pid = d.decodeKey(d.PROGRAM_ID);
  assert.throws(() => d.createProgramAddress(Array.from({ length: 17 }, () => Uint8Array.of(1)), pid));
  assert.throws(() => d.createProgramAddress([new Uint8Array(33)], pid));
  assert.throws(() => d.base58Decode('0OIl'));
  assert.throws(() => d.decodeKey(d.base58Encode(new Uint8Array(31).fill(1))));
  assert.throws(() => d.decodeKey(d.base58Encode(new Uint8Array(33).fill(1))));
  assert.throws(() => d.base58Decode('1', 32), /expected 32/);
  assert.throws(() => d.createProgramAddress([], new Uint8Array(31)));
  assert.ok(fixture().negativeCases.every((c) => c.expectError === true));
});

test('base58 round trip incl. leading zeros', () => {
  const b = Uint8Array.from([0, 0, 1, 2, 255]);
  assert.deepEqual(d.base58Decode(d.base58Encode(b)), b);
});

test('canonical bump: no higher bump is off-curve; address is off-curve', () => {
  const pid = d.decodeKey(d.PROGRAM_ID);
  for (const c of fixture().escrowCases) {
    const seeds = [enc.encode('p2p-offramp-escrow-v1'), d.decodeKey(c.seller), d.decodeKey(c.nonce)];
    const r = d.findProgramAddress(seeds, pid);
    assert.equal(d.base58Encode(r.address), c.escrow.address);
    assert.equal(r.bump, c.escrow.bump);
    assert.equal(d.isOnCurve(r.address), false);
    for (let b = 255; b > r.bump; b--) {
      assert.throws(() => d.createProgramAddress([...seeds, Uint8Array.of(b)], pid), /on curve/);
    }
  }
});

test('fixture has a bump < 255 and zero/ff nonces', () => {
  const cs = fixture().escrowCases;
  assert.ok(cs.length >= 6);
  assert.ok(cs.some((c) => [c.escrow, c.vault, ...c.buyerAtas.map((a) => a.ata)].some((p) => p.bump < 255)));
  assert.ok(cs.some((c) => /^0+$/.test(c.nonceHex)) && cs.some((c) => /^f+$/.test(c.nonceHex)));
});

test('sanity: empty seeds is stable (self-consistency only)', () => {
  const pid = d.decodeKey(d.ATA_PROGRAM_ID);
  const a = d.findProgramAddress([], pid);
  const b = d.findProgramAddress([], pid);
  assert.deepEqual(a, b);
  assert.equal(a.address.length, 32);
});
