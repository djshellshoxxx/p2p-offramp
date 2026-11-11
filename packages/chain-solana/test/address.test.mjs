import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ed25519 } from '@noble/curves/ed25519.js';
import {
  associatedTokenAddress,
  escrowAddress,
  findProgramAddress,
  isOnCurve,
  programDataAddress,
  vaultAddress,
} from '../src/address.ts';
import { bindSolanaTrade } from '../src/bind.ts';
import { buildFundNative, buildFundSpl, buildPayout, buildRefund, buildRelease } from '../src/instructions.ts';
import { bindingOf, cat, key, makeRegistry, makeTerms, ok, PROGRAM, sha } from './support.mjs';

const vectors = JSON.parse(
  readFileSync(new URL('../../../contracts/solana/vectors/solana-independent.json', import.meta.url), 'utf8'),
);
const idl = JSON.parse(
  readFileSync(new URL('../../../contracts/solana/idl/basic_escrow.json', import.meta.url), 'utf8'),
);
const noble = bytes => {
  try {
    ed25519.Point.fromBytes(bytes, true);
    return true;
  } catch {
    return false;
  }
};
const le = value => Uint8Array.from({ length: 32 }, (_, i) => Number((value >> BigInt(8 * i)) & 0xffn));
const P = (1n << 255n) - 19n;

test('on-curve-vs-noble-zip215-20000+edges', () => {
  const edges = [0n, 1n, 2n, P - 1n, P, P + 1n, (1n << 255n) - 1n, 1n | (1n << 255n), (1n << 256n) - 1n, P - 2n].map(
    le,
  );
  let seed = sha(Uint8Array.of(7)),
    onCurve = 0;
  const samples = [...edges];
  for (let i = 0; i < 20_000; i++) {
    seed = sha(seed);
    samples.push(seed);
  }
  for (const bytes of samples) {
    const expected = noble(bytes);
    assert.equal(isOnCurve(bytes), expected, Buffer.from(bytes).toString('hex'));
    if (expected) onCurve++;
  }
  // Roughly half of uniformly random y values decompress; both branches are exercised.
  assert.ok(onCurve > 9_000 && onCurve < 11_100, String(onCurve));
});

test('pdas-atas-vs-independent-fixture', () => {
  const programId = vectors.constants.programId;
  for (const entry of vectors.escrowCases) {
    assert.deepEqual(escrowAddress(programId, entry.seller, entry.nonceHex), entry.escrow);
    assert.deepEqual(vaultAddress(programId, entry.escrow.address), entry.vault);
    for (const { mint, ata } of entry.buyerAtas) assert.deepEqual(associatedTokenAddress(entry.buyer, mint), ata);
  }
  assert.ok(vectors.escrowCases.some(entry => entry.escrow.bump < 255 || entry.vault.bump < 255));
});

test('programdata-pda-XR3M…-255', () => {
  assert.deepEqual(programDataAddress(PROGRAM), { address: 'XR3M7K34KSnyYV1HtPmoRkjuLWqhwfF3m1LgC3jaTfF', bump: 255 });
});

test('seed-limits', () => {
  const program = sha(Uint8Array.of(9));
  const seeds = n => Array.from({ length: n }, () => Uint8Array.of(1));
  assert.equal(typeof findProgramAddress(seeds(15), program).bump, 'number');
  assert.throws(() => findProgramAddress(seeds(16), program), { code: 'INVALID_INPUT' });
  assert.equal(typeof findProgramAddress([new Uint8Array(32)], program).bump, 'number');
  assert.throws(() => findProgramAddress([new Uint8Array(33)], program), { code: 'INVALID_INPUT' });
  assert.throws(() => findProgramAddress([], program.subarray(0, 31)), { code: 'INVALID_INPUT' });
  assert.throws(() => escrowAddress(PROGRAM, key('s'), 'AB'.repeat(32)), { code: 'INVALID_INPUT' });
  assert.ok(vectors.negativeCases.every(entry => entry.expectError));
});

test('discriminators-vs-idl', () => {
  const fromIdl = Object.fromEntries(
    idl.instructions.map(entry => [entry.name, Buffer.from(entry.discriminator).toString('hex')]),
  );
  assert.deepEqual(
    fromIdl,
    Object.fromEntries(Object.keys(fromIdl).map(name => [name, vectors.discriminators.instructions[name]])),
  );
  assert.equal(Buffer.from(idl.accounts[0].discriminator).toString('hex'), vectors.discriminators.accounts.EscrowV1);
  const registry = makeRegistry();
  const native = ok(bindSolanaTrade(registry, bindingOf(makeTerms('native')), makeTerms('native')));
  const spl = ok(bindSolanaTrade(registry, bindingOf(makeTerms('spl')), makeTerms('spl')));
  const built = {
    fund_native: ok(buildFundNative(native)),
    fund_spl: ok(buildFundSpl(spl, key('seller-token'))),
    release: ok(buildRelease(native)),
    refund: ok(buildRefund(native)),
    payout_native: ok(buildPayout(native, 'released')),
    payout_spl: ok(buildPayout(spl, 'refunded')),
  };
  for (const [name, instruction] of Object.entries(built)) {
    assert.equal(Buffer.from(instruction.data.subarray(0, 8)).toString('hex'), fromIdl[name], name);
    assert.deepEqual(
      sha(cat(new TextEncoder().encode(`global:${name}`))).subarray(0, 8),
      instruction.data.subarray(0, 8),
    );
  }
});
