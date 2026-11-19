// Immutable program identity, re-checked on every read: loader-v3 owner, derived ProgramData pointer, authority
// option None, deploy slot <= S and the region hash. Nothing cached may let a later read skip a check.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  account,
  CLOCK,
  clockBytes,
  decodeKey,
  ELF,
  error,
  key,
  LOADER,
  ok,
  PROGRAM,
  PROGRAM_DATA,
  PROGRAM_DATA_LENGTH,
  programBytes,
  programDataBytes,
  request,
  setAccount,
  setup,
  SLOT,
  SYSVAR,
} from './support.mjs';

const LOADER_V1 = 'BPFLoader1111111111111111111111111111111111';
const LOADER_V2 = 'BPFLoader2111111111111111111111111111111111';
const LOADER_V4 = 'LoaderV411111111111111111111111111111111111';
const programData = (bytes, owner = LOADER) => world => setAccount(world, PROGRAM_DATA, account(bytes, owner));
const program = (bytes, owner = LOADER) => world =>
  setAccount(world, PROGRAM, account(bytes, owner, { executable: true }));
const flipBit = (bytes, index, bit = 0) => {
  const copy = Uint8Array.from(bytes);
  copy[index] ^= 1 << bit;
  return copy;
};
/** Moves the world (context slot, Clock, block parent) to `slot`, so only identity rules can reject a read. */
const advance = (world, slot) => {
  world.slot = slot;
  setAccount(world, CLOCK, account(clockBytes(slot), SYSVAR));
  world.block = { ...world.block, parentSlot: slot - 1, blockHeight: slot - 10 };
};

async function readOnce(mutate, kind = 'native') {
  const s = setup(kind, { mutate });
  try {
    return { result: await s.reader.read(s.binding, request(), s.terms), live: await s.reader.validateLive(
      s.binding.networkId, s.binding.deploymentId) };
  } finally {
    s.reader.dispose();
  }
}
async function refused(mutate, kind) {
  const { result, live } = await readOnce(mutate, kind);
  error(result, 'INTEGRITY_FAILURE');
  error(live, 'INTEGRITY_FAILURE');
}

test('identity: authority-present (Some with a real key, both read and validateLive)', async () => {
  const header = programDataBytes();
  const some = Uint8Array.from(header);
  some[12] = 1;
  some.set(decodeKey(key('upgrade-authority')), 13);
  await refused(programData(some));
  await refused(programData(some), 'spl');
  // Option byte 2+ is not a COption at all.
  await refused(programData(flipBit(header, 12, 1)));
});

test('identity: wrong-loader-{v1,v2,v4} for Program and ProgramData', async () => {
  for (const loader of [LOADER_V1, LOADER_V2, LOADER_V4, key('fake-loader')]) {
    await refused(program(programBytes(), loader));
    await refused(programData(programDataBytes(), loader));
  }
  // A ProgramData that is executable or has the Program tag (2) instead of 3 is refused too.
  await refused(world => setAccount(world, PROGRAM_DATA, account(programDataBytes(), LOADER, { executable: true })));
  await refused(programData(programDataBytes({ tag: 2 })));
});

test('identity: program-points-to-another-valid-ProgramData', async () => {
  // The other account holds byte-identical, authority-free ProgramData: only the derived-pointer check rejects it.
  const other = key('another-programdata');
  await refused(world => {
    setAccount(world, other, account(programDataBytes(), LOADER));
    program(programBytes(other))(world);
  });
  // The reader asks for the derived address, never the pointer, so the substituted account is not even read.
  const s = setup('native', { mutate: program(programBytes(other)) });
  try {
    error(await s.reader.read(s.binding, request(), s.terms), 'INTEGRITY_FAILURE');
    assert.ok(!s.calls[1].params[0].includes(other));
  } finally {
    s.reader.dispose();
  }
});

test('identity: programdata-hash-single-bit-{first,middle,last,padding}', async () => {
  const good = programDataBytes();
  const positions = [45, 45 + Math.floor(ELF.length / 2), 45 + ELF.length - 1, PROGRAM_DATA_LENGTH - 1];
  for (const index of positions) {
    for (const bit of [0, 7]) await refused(programData(flipBit(good, index, bit)));
  }
  // Control: the authority-free header bytes [13..45) and the deploy slot are outside the hashed region.
  const { result } = await readOnce(programData(flipBit(good, 20)));
  assert.equal(ok(result).live.programDataSha256, ok((await readOnce()).result).live.programDataSha256);
});

test('identity: deploy-slot-{S+1,u64max} refused, S accepted', async () => {
  await refused(programData(programDataBytes({ slot: SLOT + 1 })));
  await refused(programData(programDataBytes({ slot: (2n ** 64n - 1n).toString() })));
  assert.ok(ok((await readOnce(programData(programDataBytes({ slot: SLOT })))).result));
});

test('identity: stale-{authority,hash,pointer,redeploy} re-checked on each later read', async () => {
  const later = [
    ['authority set', programData(programDataBytes({ option: 1 }))],
    ['hash changed', programData(flipBit(programDataBytes(), 45))],
    ['pointer changed', program(programBytes(key('other-programdata')))],
    // Same bytes, authority None, but a newer deploy slot: impossible for an immutable program. Pre-fix code
    // accepted this because each read checked deploySlot <= S only.
    ['redeployed', programData(programDataBytes({ slot: SLOT + 5 }))],
  ];
  for (const [name, change] of later) {
    const s = setup('native');
    try {
      ok(await s.reader.read(s.binding, request(), s.terms));
      ok(await s.reader.validateLive(s.binding.networkId, s.binding.deploymentId));
      advance(s.world, SLOT + 10);
      change(s.world);
      error(await s.reader.read(s.binding, request(), s.terms), 'INTEGRITY_FAILURE');
      error(await s.reader.validateLive(s.binding.networkId, s.binding.deploymentId), 'INTEGRITY_FAILURE');
    } finally {
      s.reader.dispose();
    }
  }
});

test('identity: no-negative-caching and pin-only-after-confirmed-read', async () => {
  const s = setup('native', { mutate: programData(programDataBytes({ option: 1 })) });
  try {
    error(await s.reader.read(s.binding, request(), s.terms), 'INTEGRITY_FAILURE');
    programData(programDataBytes())(s.world);
    ok(await s.reader.read(s.binding, request(), s.terms));
  } finally {
    s.reader.dispose();
  }
  // A read that fails after identity (a later getBlock disagrees) must not pin its deploy slot.
  let count = 0;
  const flaky = setup('native', {
    world: {},
    handle: input => (input.method === 'getBlock' && ++count === 2 ? { blockhash: key('other') } : undefined),
    mutate: programData(programDataBytes({ slot: 7 })),
  });
  try {
    error(await flaky.reader.read(flaky.binding, request(), flaky.terms), 'INTEGRITY_FAILURE');
    programData(programDataBytes({ slot: 9 }))(flaky.world);
    ok(await flaky.reader.read(flaky.binding, request(), flaky.terms));
    programData(programDataBytes({ slot: 7 }))(flaky.world);
    error(await flaky.reader.read(flaky.binding, request(), flaky.terms), 'INTEGRITY_FAILURE');
  } finally {
    flaky.reader.dispose();
  }
});

test('identity: deploy-slot-pin-is-per-reader', async () => {
  const first = setup('native');
  try {
    ok(await first.reader.read(first.binding, request(), first.terms));
  } finally {
    first.reader.dispose();
  }
  // A fresh reader (for example after the user changes provider) starts without the pin.
  const fresh = setup('native', { mutate: programData(programDataBytes({ slot: SLOT - 1 })) });
  try {
    ok(await fresh.reader.read(fresh.binding, request(), fresh.terms));
  } finally {
    fresh.reader.dispose();
  }
});
