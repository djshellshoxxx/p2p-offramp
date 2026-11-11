import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeBase64 } from '../src/codec.ts';
import {
  decodeClock,
  decodeEscrow,
  decodeMint,
  decodeProgramData,
  decodeTokenAccount,
  escrowRentMinimum,
  MAX_PROGRAM_DATA_REGION_BYTES,
  PROGRAM_DATA_HASH_METHOD,
  programDataSha256,
  programDataSha256FromElf,
} from '../src/layout.ts';
import {
  cat,
  ELF,
  escrowBytes,
  escrowPda,
  fromHex,
  key,
  makeTerms,
  mintBytes,
  programDataBytes,
  rentBytes,
  shaHex,
  SPL_2022_PROGRAM,
  tokenBytes,
  u32,
} from './support.mjs';

const integrity = fn => assert.throws(fn, { code: 'INTEGRITY_FAILURE' });
const native = makeTerms('native'),
  spl = makeTerms('spl');
const owner = escrowPda(spl.seller, spl.sellerNonce).address;

test('escrow-decodes-native-and-spl', () => {
  const decoded = decodeEscrow(escrowBytes(native));
  assert.equal(decoded.state, 'funded');
  assert.equal(decoded.mint, null);
  assert.equal(decoded.amountBaseUnits, '500000000');
  assert.ok(Object.isFrozen(decoded));
  const token = decodeEscrow(escrowBytes(spl, { state: 1, paid: 1 }));
  assert.equal(token.assetKind, 'spl');
  assert.equal(token.paidOut, true);
  assert.equal(token.tokenProgram, spl.tokenProgram);
});

const ESCROW_REJECTS = 'escrow-rejects-{disc,221,223,layout,state3,paid2,paid-funded,kind1,kind3,' +
  'native-mint/tp/vault-bump,token2022}';
test(ESCROW_REJECTS, () => {
  const good = escrowBytes(native);
  const flip = (index, value, base = good) => {
    const copy = Uint8Array.from(base);
    copy[index] = value;
    return copy;
  };
  const cases = {
    disc: flip(0, 0x1b),
    221: good.subarray(0, 221),
    223: Uint8Array.from([...good, 0]),
    layout: flip(8, 2),
    state3: flip(11, 3),
    paid2: escrowBytes(native, { state: 1, paid: 2 }),
    'paid-funded': flip(12, 1),
    kind1: flip(13, 1),
    kind3: flip(13, 3),
    'native-mint': escrowBytes(native, { mint: key('m') }),
    'native-tp': escrowBytes(native, { tokenProgram: spl.tokenProgram }),
    'native-vault-bump': flip(10, 254),
    token2022: escrowBytes(spl, { tokenProgram: SPL_2022_PROGRAM }),
    'spl-zero-mint': escrowBytes(spl, { mint: '11111111111111111111111111111111' }),
    'zero-amount': escrowBytes(native, { amount: 0 }),
  };
  for (const [name, bytes] of Object.entries(cases))
    assert.throws(() => decodeEscrow(bytes), { code: 'INTEGRITY_FAILURE' }, name);
});

test('token-rejects-{delegate,close,is-native,state0,tag2,delegated}', () => {
  const base = { owner, amount: 5 };
  assert.deepEqual({ ...decodeTokenAccount(tokenBytes(base)) }, { mint: spl.mint, owner, amount: 5n, frozen: false });
  const tag2 = tokenBytes(base);
  tag2.set(u32(2), 129);
  for (const bytes of [
    tokenBytes({ ...base, delegate: 1 }),
    tokenBytes({ ...base, close: 1 }),
    tokenBytes({ ...base, isNative: 1 }),
    tokenBytes({ ...base, state: 0 }),
    tokenBytes({ ...base, state: 3 }),
    tag2,
    tokenBytes({ ...base, delegated: 1 }),
    tokenBytes(base).subarray(0, 164),
  ])
    integrity(() => decodeTokenAccount(bytes));
});

test('token-state2-frozen', () => {
  assert.equal(decodeTokenAccount(tokenBytes({ owner, state: 2 })).frozen, true);
});

test('mint-uninitialized', () => {
  integrity(() => decodeMint(mintBytes({ initialized: 0 })));
  integrity(() => decodeMint(mintBytes({ initialized: 2 })));
  assert.deepEqual(
    { ...decodeMint(mintBytes({ freeze: key('freezer') })) },
    { decimals: 6, freezeAuthority: key('freezer') },
  );
  const badTag = mintBytes();
  badTag.set(u32(2), 46);
  integrity(() => decodeMint(badTag));
  const badAuthority = mintBytes();
  badAuthority.set(u32(2), 0);
  integrity(() => decodeMint(badAuthority));
});

test('clock-capture', () => {
  const clock = decodeClock(decodeBase64('CAAAAAAAAACX+epqAAAAAAAAAAAAAAAAAQAAAAAAAACa+epqAAAAAA==', 56));
  assert.deepEqual({ ...clock }, { slot: 8n, unixTimestamp: 1_793_784_218n });
});

test('exact-length-{clock-39/41,mint-81/83}', () => {
  const clock = decodeBase64('CAAAAAAAAACX+epqAAAAAAAAAAAAAAAAAQAAAAAAAACa+epqAAAAAA==', 56);
  integrity(() => decodeClock(clock.subarray(0, 39)));
  integrity(() => decodeClock(cat(clock, [0])));
  integrity(() => decodeMint(mintBytes().subarray(0, 81)));
  integrity(() => decodeMint(cat(mintBytes(), [0])));
});

test('rent-capture', () => {
  assert.equal(escrowRentMinimum(decodeBase64('MBsAAAAAAAAAAAAAAADwPzI=', 24)), 2_436_000n);
  assert.equal(escrowRentMinimum(rentBytes(6960, '0000000000000040')), 4_872_000n);
});

test('rent-1.5-null', () => {
  assert.equal(escrowRentMinimum(rentBytes(6960, '000000000000f83f')), null);
  integrity(() => escrowRentMinimum(rentBytes().subarray(0, 16)));
});

test('programdata-rejects-{tag2,some,some-zero,opt2,len45,over-cap}', () => {
  assert.equal(decodeProgramData(programDataBytes()).deploySlot, 10n);
  const someZero = programDataBytes({ option: 1 });
  someZero.fill(0, 13, 45);
  const cases = [
    programDataBytes({ tag: 2 }),
    programDataBytes({ option: 1 }),
    someZero,
    programDataBytes({ option: 2 }),
    programDataBytes().subarray(0, 45),
    new Uint8Array(45 + MAX_PROGRAM_DATA_REGION_BYTES + 1).fill(3, 0, 1),
  ];
  for (const bytes of cases) integrity(() => decodeProgramData(bytes));
  // The hash method alone accepts Some(authority); only the reader requires None.
  assert.equal(programDataSha256(programDataBytes({ option: 1 })), programDataSha256(programDataBytes()));
  integrity(() => programDataSha256(programDataBytes({ option: 2 })));
});

test('pdh-{unpadded=sha256(elf),padding-counts=FromElf,ignores-header,≠trimmed}', () => {
  assert.equal(PROGRAM_DATA_HASH_METHOD, 'loader-v3-programdata-region/v1');
  const unpadded = programDataBytes({ length: 45 + ELF.length });
  assert.equal(programDataSha256(unpadded), shaHex(ELF));
  const padded = programDataBytes();
  assert.equal(programDataSha256(padded), programDataSha256FromElf(ELF, padded.length));
  assert.notEqual(programDataSha256(padded), shaHex(ELF));
  const otherHeader = programDataBytes({ slot: 999 });
  otherHeader.fill(7, 13, 45);
  assert.equal(programDataSha256(otherHeader), programDataSha256(padded));
  const trimmed = padded.subarray(45, 45 + ELF.length);
  assert.notEqual(programDataSha256(padded), shaHex(trimmed));
  assert.throws(() => programDataSha256FromElf(ELF, 45 + ELF.length - 1), { code: 'INVALID_INPUT' });
  assert.throws(() => programDataSha256FromElf(new Uint8Array(0), 100), { code: 'INVALID_INPUT' });
  assert.throws(() => programDataSha256FromElf(ELF, 46 + MAX_PROGRAM_DATA_REGION_BYTES), { code: 'INVALID_INPUT' });
  assert.equal(fromHex(programDataSha256(padded)).length, 32);
});
