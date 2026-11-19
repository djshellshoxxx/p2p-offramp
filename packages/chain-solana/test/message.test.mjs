import test from 'node:test';
import assert from 'node:assert/strict';
import * as driver from '../../../contracts/solana/localnet/driver.mjs';
import { buildCreateAtaIdempotent, buildSystemTransfer } from '../src/auxiliary.ts';
import {
  compileLegacyMessage,
  decodeCompactU16,
  decodeTransaction,
  decompileInstructions,
  encodeBase64,
  encodeCompactU16,
  encodeTransaction,
  parseLegacyMessage,
  unsignedTransaction,
} from '../src/message.ts';
import { decodeKey, key, MINT, SPL_PROGRAM, SYSTEM } from './support.mjs';

const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const code = expected => error => error?.code === expected;
const meta = (pubkey, isSigner, isWritable) => ({ pubkey, isSigner, isWritable });
const PAYER = key('payer'),
  BLOCKHASH = key('blockhash-1');

test('compact-u16-matches-short-vec', () => {
  // ShortU16 (solana-sdk short-vec): 7 bits per byte, continuation 0x80, at most 3 bytes.
  const cases = [
    [0, [0x00]],
    [0x7f, [0x7f]],
    [0x80, [0x80, 0x01]],
    [0xff, [0xff, 0x01]],
    [0x3fff, [0xff, 0x7f]],
    [0x4000, [0x80, 0x80, 0x01]],
    [0xffff, [0xff, 0xff, 0x03]],
  ];
  for (const [value, bytes] of cases) {
    assert.deepEqual([...encodeCompactU16(value)], bytes, String(value));
    assert.deepEqual(decodeCompactU16(Uint8Array.from(bytes), 0), { value, next: bytes.length });
    assert.deepEqual([...encodeCompactU16(value)], [...driver.compactU16(value)]);
  }
  for (const bad of [[0x80, 0x00], [0x80], [0xff, 0xff, 0x04], [0x80, 0x80, 0x80, 0x01], [0xff, 0xff, 0xff]]) {
    assert.throws(() => decodeCompactU16(Uint8Array.from(bad), 0), code('INTEGRITY_FAILURE'), JSON.stringify(bad));
  }
  assert.throws(() => encodeCompactU16(0x10000), code('INVALID_INPUT'));
});

/** Instruction set touching every account group, with keys used twice under different flags. */
function mixedInstructions() {
  const [a, b, c, d] = ['a', 'b', 'c', 'd'].map(label => key(`mixed-${label}`));
  return [
    { programId: SYSTEM, accounts: [meta(PAYER, true, true), meta(a, false, true)], data: Uint8Array.of(2, 0, 0, 0) },
    {
      programId: ATA_PROGRAM,
      accounts: [meta(b, true, false), meta(a, false, false), meta(c, false, false)],
      data: Uint8Array.of(1),
    },
    {
      programId: SPL_PROGRAM,
      accounts: [meta(c, false, true), meta(d, true, false), meta(b, false, true)],
      data: new Uint8Array(0),
    },
  ];
}

test('ordering-dedupe-and-header-vs-driver', () => {
  const instructions = mixedInstructions();
  const ours = parseLegacyMessage(compileLegacyMessage(PAYER, instructions, BLOCKHASH));
  const theirs = parseLegacyMessage(
    driver.compileLegacyMessage(
      PAYER,
      instructions.map(ix => ({ ...ix, keys: ix.accounts })),
      BLOCKHASH,
    ).message,
  );
  // OR-ed flags: b is a readonly signer in one instruction and writable in another, so it is a writable signer.
  assert.deepEqual(ours.header, { numRequiredSignatures: 3, numReadonlySigned: 1, numReadonlyUnsigned: 3 });
  assert.deepEqual(ours.header, theirs.header);
  assert.equal(ours.accountKeys[0], PAYER);
  assert.deepEqual([...ours.accountKeys].sort(), [...theirs.accountKeys].sort());
  // The driver keeps insertion order inside a group; we follow CompiledKeys (ascending key bytes). The decompiled
  // instructions must be identical either way.
  const flat = message =>
    decompileInstructions(message).map(ix => ({
      programId: ix.programId,
      accounts: ix.accounts.map(m => [m.pubkey, m.isSigner, m.isWritable]),
      data: [...ix.data],
    }));
  assert.deepEqual(flat(ours), flat(theirs));
  const groups = message => {
    const { header: h, accountKeys: k } = message;
    const writableSigners = h.numRequiredSignatures - h.numReadonlySigned;
    return [
      k.slice(1, writableSigners),
      k.slice(writableSigners, h.numRequiredSignatures),
      k.slice(h.numRequiredSignatures, k.length - h.numReadonlyUnsigned),
      k.slice(k.length - h.numReadonlyUnsigned),
    ];
  };
  const byBytes = (x, y) => Buffer.compare(Buffer.from(decodeKey(x)), Buffer.from(decodeKey(y)));
  for (const group of groups(ours)) assert.deepEqual(group, [...group].sort(byBytes));
  // Re-sorting the driver's groups by key bytes gives exactly our order.
  assert.deepEqual(
    groups(ours),
    groups(theirs).map(group => [...group].sort(byBytes)),
  );
});

test('roundtrip-and-wire', () => {
  const message = compileLegacyMessage(PAYER, mixedInstructions(), BLOCKHASH);
  const parsed = parseLegacyMessage(message);
  assert.equal(parsed.recentBlockhash, BLOCKHASH);
  assert.equal(parsed.instructions.length, 3);
  const unsigned = unsignedTransaction(message);
  assert.equal(unsigned[0], 3);
  assert.ok(unsigned.subarray(1, 1 + 3 * 64).every(byte => byte === 0));
  const signatures = [1, 2, 3].map(fill => new Uint8Array(64).fill(fill));
  const wire = encodeTransaction(signatures, message);
  const decoded = decodeTransaction(wire);
  assert.deepEqual(decoded.message, message);
  assert.deepEqual(
    decoded.signatures.map(s => s[0]),
    [1, 2, 3],
  );
  assert.throws(() => encodeTransaction(signatures.slice(1), message), code('INVALID_INPUT'));
  assert.throws(
    () => decodeTransaction(Uint8Array.from([2, ...wire.subarray(1, 129), ...message])),
    code('INTEGRITY_FAILURE'),
  );
  for (const bytes of [new Uint8Array(0), Uint8Array.of(1, 7), Buffer.alloc(300)]) {
    assert.equal(encodeBase64(bytes), Buffer.from(bytes).toString('base64'));
  }
});

test('parse-refuses-malformed', () => {
  const message = compileLegacyMessage(PAYER, [buildSystemTransfer(PAYER, key('to'), 5n)], BLOCKHASH);
  const mutated = change => {
    const copy = Uint8Array.from(message);
    change(copy);
    return copy;
  };
  const keysAt = 4,
    ixAt = 4 + 3 * 32 + 32 + 1; // header 3 + compact(3) + 3 keys + blockhash + compact(1)
  const cases = {
    versioned: mutated(m => (m[0] = 0x80)),
    trailing: Uint8Array.from([...message, 0]),
    truncated: message.subarray(0, message.length - 1),
    duplicateKey: mutated(m => m.set(m.subarray(keysAt, keysAt + 32), keysAt + 32)),
    programIndexZero: mutated(m => (m[ixAt] = 0)),
    programIndexRange: mutated(m => (m[ixAt] = 3)),
    accountIndexRange: mutated(m => (m[ixAt + 2] = 9)),
    overlap: mutated(m => (m[2] = 3)),
    noWritableSigner: mutated(m => (m[1] = 1)),
    aliasCompact: Uint8Array.from([...message.subarray(0, 3), 0x83, 0x00, ...message.subarray(4)]),
  };
  for (const [name, bytes] of Object.entries(cases)) {
    assert.throws(() => parseLegacyMessage(bytes), code('INTEGRITY_FAILURE'), name);
  }
});

test('size-limit-and-inputs', () => {
  const big = { programId: SYSTEM, accounts: [meta(PAYER, true, true)], data: new Uint8Array(1100) };
  assert.throws(() => compileLegacyMessage(PAYER, [big], BLOCKHASH), code('LIMIT_EXCEEDED'));
  assert.throws(() => compileLegacyMessage(PAYER, [], BLOCKHASH), code('INVALID_INPUT'));
  assert.throws(() => compileLegacyMessage('not-a-key', [big], BLOCKHASH), code('INVALID_INPUT'));
  assert.throws(
    () => compileLegacyMessage(PAYER, [buildSystemTransfer(PAYER, key('x'), 1n)], 'bad'),
    code('INVALID_INPUT'),
  );
});

test('auxiliary-builders-match-interfaces', () => {
  const owner = key('owner');
  const ata = buildCreateAtaIdempotent(PAYER, owner, MINT);
  const reference = driver.createAtaIdempotentIx(PAYER, owner, MINT);
  assert.equal(ata.programId, ATA_PROGRAM);
  assert.deepEqual([...ata.data], [1]);
  assert.deepEqual(
    ata.accounts.map(m => [m.pubkey, m.isSigner, m.isWritable]),
    reference.ix.keys.map(m => [m.pubkey, m.isSigner, m.isWritable]),
  );
  assert.equal(ata.accounts[1].pubkey, reference.ata);
  const transfer = buildSystemTransfer(PAYER, owner, 1_000_000n);
  const referenceTransfer = driver.transferIx(PAYER, owner, 1_000_000);
  assert.deepEqual([...transfer.data], [...referenceTransfer.data]);
  assert.deepEqual(
    transfer.accounts.map(m => [m.pubkey, m.isSigner, m.isWritable]),
    referenceTransfer.keys.map(m => [m.pubkey, m.isSigner, m.isWritable]),
  );
  assert.throws(() => buildSystemTransfer(PAYER, PAYER, 1n), code('INVALID_INPUT'));
  assert.throws(() => buildSystemTransfer(PAYER, owner, 0n), code('INVALID_INPUT'));
  assert.ok(Object.isFrozen(ata) && Object.isFrozen(ata.accounts));
});
