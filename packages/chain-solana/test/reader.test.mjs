import test from 'node:test';
import assert from 'node:assert/strict';
import { createTradeAuthority } from '../../domain/src/authority.ts';
import { MAX_RPC_READS, payoutRegressed, SolanaChainReader } from '../src/reader.ts';
import {
  account,
  b64,
  bindingOf,
  cat,
  CHAIN_TIME,
  CLOCK,
  clockBytes,
  COMPILED_GENESIS,
  DEPLOYMENT_ID,
  ELF,
  error,
  escrowBytes,
  key,
  LOADER,
  makeRegistry,
  makeTerms,
  MINT,
  mintBytes,
  NETWORK_ID,
  ok,
  PROGRAM,
  PROGRAM_DATA,
  programBytes,
  programDataBytes,
  RENT,
  RENT_MIN,
  rentBytes,
  request,
  setAccount,
  setup,
  shaHex,
  SLOT,
  SYSTEM,
  SYSVAR,
  SPL_2022_PROGRAM,
  SPL_PROGRAM,
  tokenBytes,
  vaultPda,
} from './support.mjs';

const ALLOWED = new Set(['getGenesisHash', 'getMultipleAccounts', 'getBlock']);
async function readWith(kind, options = {}) {
  const s = setup(kind, options);
  try {
    const result = await s.reader.read(s.binding, request(), s.terms);
    return { ...s, result };
  } finally {
    s.reader.dispose();
  }
}
const failsWith = async (code, kind, options) => {
  const s = await readWith(kind, options);
  error(s.result, code);
  return s;
};
const integrity = (kind, mutate, extra = {}) => failsWith('INTEGRITY_FAILURE', kind, { mutate, ...extra });
const control = async (kind, mutate, extra = {}) => assert.ok(ok((await readWith(kind, { mutate, ...extra })).result));
const escrowOf = world => world.escrow.address;
const vaultOf = world => vaultPda(world.escrow.address).address;
const replaceEscrow =
  (changes, accountOptions = {}) =>
  (world, terms) =>
    setAccount(
      world,
      escrowOf(world),
      account(escrowBytes(terms, changes), PROGRAM, { lamports: 600_000_000, ...accountOptions }),
    );

// ---- positive ----
test('native-funded-exact-observation-and-5-call-params', async () => {
  const s = await readWith('native');
  const snapshot = ok(s.result);
  assert.deepEqual(snapshot.observation, {
    binding: s.binding,
    generation: 2,
    requestSequence: 4,
    anchor: { height: String(SLOT), hash: s.world.block.blockhash },
    state: 'funded',
    finality: 'finalized',
    observedAt: 123,
  });
  assert.deepEqual(snapshot.live, {
    height: String(SLOT),
    hash: s.world.block.blockhash,
    blockHeight: String(SLOT - 10),
    timestampSeconds: String(CHAIN_TIME),
    programDataSha256: shaHex(programDataBytes().subarray(45)),
  });
  assert.equal(snapshot.occupant, 'escrow');
  assert.equal(snapshot.payout, 'not-applicable');
  assert.deepEqual(snapshot.custody, {
    kind: 'native',
    lamports: String(500_000_000 + RENT_MIN),
    principalHeld: '500000000',
    rentExemptMinimum: String(RENT_MIN),
    surplus: '0',
    payoutBlockedBy: [],
  });
  const block = [SLOT, { commitment: 'finalized', transactionDetails: 'none', rewards: false }];
  assert.deepEqual(
    s.calls.map(({ method, params }) => ({ method, params })),
    [
      { method: 'getGenesisHash', params: [] },
      {
        method: 'getMultipleAccounts',
        params: [
          [PROGRAM, PROGRAM_DATA, CLOCK, escrowOf(s.world), RENT],
          { commitment: 'finalized', encoding: 'base64' },
        ],
      },
      { method: 'getBlock', params: block },
      { method: 'getBlock', params: block },
      { method: 'getGenesisHash', params: [] },
    ],
  );
  assert.ok(s.calls.every(call => call.signal instanceof AbortSignal));
  assert.ok(Object.isFrozen(snapshot.custody.payoutBlockedBy) && Object.isFrozen(snapshot.observation.anchor));
});

test('spl-surplus', async () => {
  const s = await readWith('spl', { world: { vaultAmount: 25_000_007 } });
  const { custody, observation } = ok(s.result);
  assert.equal(observation.state, 'funded');
  assert.deepEqual(custody, {
    kind: 'spl',
    vault: vaultOf(s.world),
    vaultAmount: '25000007',
    principalHeld: '25000000',
    surplus: '7',
    vaultFrozen: false,
    mintDecimals: 6,
    mintFreezeAuthority: null,
  });
  assert.deepEqual(s.calls[1].params[0], [PROGRAM, PROGRAM_DATA, CLOCK, escrowOf(s.world), vaultOf(s.world), MINT]);
});

test('released-pending', async () => {
  const snapshot = ok((await readWith('native', { world: { escrow: { state: 1 } } })).result);
  assert.equal(snapshot.observation.state, 'released');
  assert.equal(snapshot.payout, 'pending');
});

test('paid-complete', async () => {
  const native = ok((await readWith('native', { world: { escrow: { state: 1, paid: 1 } } })).result);
  assert.equal(native.payout, 'complete');
  assert.deepEqual(native.custody, {
    kind: 'native',
    lamports: String(RENT_MIN),
    principalHeld: '0',
    rentExemptMinimum: String(RENT_MIN),
    surplus: '0',
    payoutBlockedBy: [],
  });
  const spl = ok((await readWith('spl', { world: { escrow: { state: 2, paid: 1 } } })).result);
  assert.equal(spl.observation.state, 'refunded');
  assert.equal(spl.payout, 'complete');
  assert.equal(spl.custody.principalHeld, '0');
});

test('absent-{null,prefunded,spl-prefunded-vault}', async () => {
  const none = ok((await readWith('native', { mutate: world => setAccount(world, escrowOf(world), null) })).result);
  assert.deepEqual(
    [none.occupant, none.observation.state, none.custody, none.escrow, none.payout],
    ['none', 'absent', null, null, 'not-applicable'],
  );
  const donated = account(new Uint8Array(0), SYSTEM, { lamports: 5 });
  const prefunded = ok(
    (await readWith('native', { mutate: world => setAccount(world, escrowOf(world), donated) })).result,
  );
  assert.equal(prefunded.occupant, 'system-prefunded');
  assert.equal(prefunded.observation.state, 'absent');
  const spl = ok(
    (
      await readWith('spl', {
        mutate: world => {
          setAccount(world, escrowOf(world), donated);
          setAccount(world, vaultOf(world), donated);
        },
      })
    ).result,
  );
  assert.equal(spl.occupant, 'system-prefunded');
  assert.equal(spl.custody, null);
  assert.ok(
    ok(
      (
        await readWith('spl', {
          mutate: world => {
            setAccount(world, escrowOf(world), null);
            setAccount(world, vaultOf(world), null);
          },
        })
      ).result,
    ),
  );
});

test('rent-shortfall-ok', async () => {
  const short = ok((await readWith('native', { world: { lamports: 500_001_000 } })).result);
  assert.deepEqual(short.custody.payoutBlockedBy, ['rent-shortfall']);
  assert.equal(short.custody.surplus, '0');
  const unknown = ok(
    (
      await readWith('native', {
        mutate: world => setAccount(world, RENT, account(rentBytes(6960, '000000000000f83f'), SYSVAR)),
      })
    ).result,
  );
  assert.deepEqual(unknown.custody.payoutBlockedBy, ['rent-unknown']);
  assert.equal(unknown.custody.rentExemptMinimum, null);
  assert.equal(unknown.custody.surplus, null);
  const surplus = ok((await readWith('native', { world: { lamports: 500_000_000 + RENT_MIN + 9 } })).result);
  assert.equal(surplus.custody.surplus, '9');
  // Spec: 'rent-unknown' whenever m is null (paid or not); 'rent-shortfall' only while unpaid.
  const paid = { escrow: { state: 1, paid: 1 } };
  const paidUnknown = ok(
    (
      await readWith('native', {
        world: paid,
        mutate: world => setAccount(world, RENT, account(rentBytes(6960, '000000000000f83f'), SYSVAR)),
      })
    ).result,
  );
  assert.deepEqual(paidUnknown.custody.payoutBlockedBy, ['rent-unknown']);
  const paidLow = ok((await readWith('native', { world: { ...paid, lamports: 1000 } })).result);
  assert.deepEqual(paidLow.custody.payoutBlockedBy, []);
});

test('floor-second-read', async () => {
  const s = setup('native');
  try {
    ok(await s.reader.read(s.binding, request(), s.terms));
    ok(await s.reader.read(s.binding, request(), s.terms));
    assert.deepEqual(s.calls[6].params[1], { commitment: 'finalized', encoding: 'base64', minContextSlot: SLOT });
    s.world.slot = SLOT - 1;
    error(await s.reader.read(s.binding, request(), s.terms), 'INTEGRITY_FAILURE');
    s.world.slot = SLOT + 5;
    setAccount(s.world, CLOCK, account(clockBytes(SLOT + 5), SYSVAR));
    s.world.block = { ...s.world.block, parentSlot: SLOT + 4 };
    assert.equal(ok(await s.reader.read(s.binding, request(), s.terms)).observation.anchor.height, String(SLOT + 5));
    assert.equal(s.calls.at(-4).params[1].minContextSlot, SLOT);
    ok(await s.reader.validateLive(NETWORK_ID, DEPLOYMENT_ID));
    assert.equal(s.calls.at(-4).params[1].minContextSlot, SLOT + 5, 'validateLive shares the per-network floor');
  } finally {
    s.reader.dispose();
  }
});

// Spec §5 step 5: the floor is keyed by network, so a second deployment on that network inherits it.
test('floor-is-per-network-not-per-deployment', async () => {
  const base = makeRegistry();
  const other = { ...base.deployment(NETWORK_ID, DEPLOYMENT_ID), id: 'escrow-v2', address: key('program-v2') };
  const registry = {
    network: base.network,
    deployment: (networkId, id) =>
      networkId === NETWORK_ID && id === 'escrow-v2' ? other : base.deployment(networkId, id),
  };
  const s = setup('native', { registry });
  try {
    ok(await s.reader.read(s.binding, request(), s.terms));
    // The fake world holds no accounts for program-v2, so identity fails after the request was sent.
    error(await s.reader.validateLive(NETWORK_ID, 'escrow-v2'), 'INTEGRITY_FAILURE');
    const sent = s.calls.at(-1);
    assert.equal(sent.method, 'getMultipleAccounts');
    assert.equal(sent.params[0][0], key('program-v2'));
    assert.equal(sent.params[1].minContextSlot, SLOT);
  } finally {
    s.reader.dispose();
  }
});

// Spec §2/§7: validateLive is the source of chainTime; §5 step 2: it requests only the first three keys.
test('validateLive-exact-anchor-frozen-and-5-call-params', async () => {
  const s = setup('native');
  try {
    const live = ok(await s.reader.validateLive(NETWORK_ID, DEPLOYMENT_ID));
    assert.deepEqual(live, {
      height: String(SLOT),
      hash: s.world.block.blockhash,
      blockHeight: String(SLOT - 10),
      timestampSeconds: String(CHAIN_TIME),
      programDataSha256: shaHex(programDataBytes().subarray(45)),
    });
    assert.ok(Object.isFrozen(live));
    const block = [SLOT, { commitment: 'finalized', transactionDetails: 'none', rewards: false }];
    assert.deepEqual(
      s.calls.map(({ method, params }) => ({ method, params })),
      [
        { method: 'getGenesisHash', params: [] },
        {
          method: 'getMultipleAccounts',
          params: [[PROGRAM, PROGRAM_DATA, CLOCK], { commitment: 'finalized', encoding: 'base64' }],
        },
        { method: 'getBlock', params: block },
        { method: 'getBlock', params: block },
        { method: 'getGenesisHash', params: [] },
      ],
    );
  } finally {
    s.reader.dispose();
  }
});

test('rentEpoch-getter-untouched', async () => {
  let touched = 0;
  const trap = entry =>
    Object.defineProperty(entry, 'rentEpoch', {
      enumerable: true,
      get() {
        touched++;
        throw Error('SECRET');
      },
    });
  const lamportsTrap = entry =>
    Object.defineProperty(entry, 'lamports', {
      enumerable: true,
      get() {
        touched++;
        throw Error('SECRET');
      },
    });
  ok(
    (
      await readWith('native', {
        handle: input => {
          if (input.method !== 'getMultipleAccounts') return undefined;
          return {
            context: { slot: SLOT },
            value: input.params[0].map((address, index) => {
              const entry = structuredClone(setupWorld.accounts.get(address));
              trap(entry);
              if (index !== 3) lamportsTrap(entry);
              return entry;
            }),
          };
        },
      })
    ).result,
  );
  assert.equal(touched, 0);
});
const setupWorld = setup('native').world;

// Spec §5: fields the reader DOES read are taken only from data descriptors; an accessor is never invoked.
test('descriptor-only-reads-{owner,data,value[0],space,blockhash}', async () => {
  let touched = 0;
  const getter = (target, field, value) => {
    delete target[field];
    Object.defineProperty(target, field, {
      enumerable: true,
      configurable: true,
      get() {
        touched++;
        return value;
      },
    });
  };
  const accounts = (input, world, trap) => {
    const value = input.params[0].map(address => structuredClone(world.accounts.get(address)));
    trap(value);
    return { context: { slot: SLOT }, value };
  };
  const traps = [
    ['getMultipleAccounts', value => getter(value[0], 'owner', value[0].owner)],
    ['getMultipleAccounts', value => getter(value[0], 'data', value[0].data)],
    ['getMultipleAccounts', value => getter(value, '0', value[0])],
    // `space` goes through optionalOwn, not own(): a provider accessor must be refused, never invoked.
    ['getMultipleAccounts', value => getter(value[2], 'space', value[2].space)],
    ['getBlock', block => getter(block, 'blockhash', block.blockhash)],
  ];
  for (const [method, trap] of traps) {
    await failsWith('INTEGRITY_FAILURE', 'native', {
      handle: input => {
        if (input.method !== method) return undefined;
        if (method === 'getBlock') {
          const block = { ...setupWorld.block };
          trap(block);
          return block;
        }
        return accounts(input, setupWorld, trap);
      },
    });
  }
  assert.equal(touched, 0);
});

test('methods⊆{getGenesisHash,getMultipleAccounts,getBlock}', async () => {
  const seen = new Set();
  for (const kind of ['native', 'spl']) {
    const s = setup(kind);
    try {
      ok(await s.reader.read(s.binding, request(), s.terms));
      ok(await s.reader.validateLive(NETWORK_ID, DEPLOYMENT_ID));
      for (const call of s.calls) seen.add(call.method);
    } finally {
      s.reader.dispose();
    }
  }
  assert.deepEqual([...seen].sort(), [...ALLOWED].sort());
});

// ---- identity and anchor integrity ----
test('INTEGRITY_FAILURE: program-{owner,exec,pointer,tag}', async () => {
  const program =
    (data, owner = LOADER, executable = true) =>
    world =>
      setAccount(world, PROGRAM, account(data, owner, { executable }));
  await control('native', program(programBytes()));
  await integrity('native', program(programBytes(), key('other-loader')));
  await integrity('native', program(programBytes(), LOADER, false));
  await integrity('native', program(programBytes(key('other-programdata'))));
  await integrity('native', program(programBytes(PROGRAM_DATA, 3)));
  await integrity('native', world => setAccount(world, PROGRAM, null));
});

test('INTEGRITY_FAILURE: programdata-{exec,some,some-zero,hash,trimmed-pin,slot>S,oversize}', async () => {
  const data =
    (bytes, executable = false, owner = LOADER) =>
    world =>
      setAccount(world, PROGRAM_DATA, account(bytes, owner, { executable }));
  await integrity('native', data(programDataBytes(), true));
  await integrity('native', data(programDataBytes(), false, key('other-loader')));
  await integrity('native', data(programDataBytes({ option: 1 })));
  const someZero = programDataBytes({ option: 1 });
  someZero.fill(0, 13, 45);
  await integrity('native', data(someZero));
  await integrity('native', data(programDataBytes({ elf: Uint8Array.from(ELF).fill(1, 0, 1) })));
  await integrity('native', undefined, {
    registryChanges: {
      deployment: { runtime: { kind: 'solana-program', programDataSha256: shaHex(ELF), upgradeAuthority: null } },
    },
  });
  await integrity('native', data(programDataBytes({ slot: SLOT + 1 })));
  await integrity('native', world =>
    setAccount(world, PROGRAM_DATA, { ...account(new Uint8Array(0), LOADER), data: ['A'.repeat(1_398_168), 'base64'] }),
  );
  assert.ok(ok((await readWith('native', { mutate: data(programDataBytes({ slot: SLOT })) })).result));
});

test('INTEGRITY_FAILURE: value-len', async () => {
  const short = input =>
    input.method === 'getMultipleAccounts' ? { context: { slot: SLOT }, value: [null, null, null, null] } : undefined;
  await failsWith('INTEGRITY_FAILURE', 'native', { handle: short });
  const long = input =>
    input.method === 'getMultipleAccounts' ? { context: { slot: SLOT }, value: Array(6).fill(null) } : undefined;
  await failsWith('INTEGRITY_FAILURE', 'native', { handle: long });
});

/** Move the whole world to slot `at` (context, Clock, block parent), so only slot rules can reject it. */
const consistentAt = at => world => {
  world.slot = at;
  setAccount(world, CLOCK, account(clockBytes(at), SYSVAR));
  world.block = { ...world.block, parentSlot: at - 1 };
};

test('INTEGRITY_FAILURE: slot-{unsafe,float,below-floor}', async () => {
  for (const slot of [400.5, -1, '400']) {
    await integrity('native', world => {
      world.slot = slot;
    });
  }
  // Clock and parent agree with 2^53, so only the safe-integer rule rejects it.
  await integrity('native', consistentAt(2 ** 53));
  // A self-consistent world one slot below an accepted floor: only the client-side floor rejects it.
  const s = setup('native');
  try {
    ok(await s.reader.read(s.binding, request(), s.terms));
    consistentAt(SLOT - 1)(s.world);
    error(await s.reader.read(s.binding, request(), s.terms), 'INTEGRITY_FAILURE');
    assert.ok(ok((await readWith('native', { mutate: consistentAt(SLOT - 1) })).result), 'fresh reader accepts');
  } finally {
    s.reader.dispose();
  }
});

test('anchor-boundaries-{blockHeight=S,timestamp-0,slot-0}', async () => {
  assert.ok(ok((await readWith('native', { mutate: world => (world.block.blockHeight = SLOT) })).result));
  const zeroTime = world => setAccount(world, CLOCK, account(clockBytes(SLOT, 0), SYSVAR));
  assert.equal(ok((await readWith('native', { mutate: zeroTime })).result).live.timestampSeconds, '0');
  const genesisSlot = world => {
    setAccount(world, PROGRAM_DATA, account(programDataBytes({ slot: 0 }), LOADER));
    world.block = { ...world.block, blockHeight: 0, parentSlot: 0 };
  };
  const zero = ok((await readWith('native', { world: { slot: 0 }, mutate: genesisSlot })).result);
  assert.equal(zero.observation.anchor.height, '0');
  // Only S = parentSlot = 0 is allowed at slot 0; a slot-0 block claiming any other parent is refused.
  const genesisParent = world => {
    genesisSlot(world);
    world.block.parentSlot = 1;
  };
  await integrity('native', genesisParent, { world: { slot: 0 } });
});

test('INTEGRITY_FAILURE: data-{base58,3-tuple,bad-b64}', async () => {
  const shape = data => world => {
    const entry = world.accounts.get(CLOCK);
    setAccount(world, CLOCK, { ...entry, data });
  };
  const clock = b64(clockBytes(SLOT));
  await integrity('native', shape([clock, 'base58']));
  await integrity('native', shape([clock, 'base64', 'extra']));
  // Still 40 bytes (so `space` and the exact length agree) but with non-zero pad bits: only decodeBase64 rejects it.
  const badPadBits = `${clock.slice(0, -4)}AB==`;
  assert.ok(badPadBits.length === clock.length && Buffer.from(badPadBits, 'base64').length === 40);
  assert.notEqual(b64(Buffer.from(badPadBits, 'base64')), badPadBits, 'the case must be non-canonical base64');
  await integrity('native', shape([badPadBits, 'base64']));
  await integrity('native', shape(clock));
  await integrity('native', world => setAccount(world, CLOCK, { ...world.accounts.get(CLOCK), executable: 'false' }));
});

// Spec §8: base64 caps are checked before decoding. Every account also has an exact-length check after decoding,
// so only cost tells the two apart: an uncapped reader would regex-scan, allocate and decode ~48 MB first.
test('INTEGRITY_FAILURE: base64-capped-before-decoding', async () => {
  const huge = 'A'.repeat(64 * 1024 * 1024);
  for (const index of [2, 3]) {
    const started = performance.now();
    await failsWith('INTEGRITY_FAILURE', 'native', {
      handle: input => {
        if (input.method !== 'getMultipleAccounts') return undefined;
        const value = input.params[0].map(address => structuredClone(setupWorld.accounts.get(address)));
        value[index].data = [huge, 'base64'];
        return { context: { slot: SLOT }, value };
      },
    });
    assert.ok(performance.now() - started < 250, `account ${index} over-cap data must be refused before decoding`);
  }
});

test('INTEGRITY_FAILURE: space-mismatch', async () => {
  await integrity('native', world => setAccount(world, CLOCK, { ...world.accounts.get(CLOCK), space: 41 }));
  const { space: _, ...noSpace } = setupWorld.accounts.get(CLOCK);
  assert.ok(ok((await readWith('native', { mutate: world => setAccount(world, CLOCK, noSpace) })).result));
});

test('INTEGRITY_FAILURE: clock-slot≠S', async () => {
  await integrity('native', world => setAccount(world, CLOCK, account(clockBytes(SLOT - 1), SYSVAR)));
  await integrity('native', world => setAccount(world, CLOCK, account(clockBytes(SLOT, -1), SYSVAR)));
  await integrity('native', world => setAccount(world, CLOCK, account(clockBytes(SLOT), key('not-sysvar'))));
  await integrity('native', world => setAccount(world, CLOCK, account(clockBytes(SLOT), SYSVAR, { executable: true })));
  // 41 bytes still fits the 56-char base64 cap and `space`: only the exact length check rejects it.
  await integrity('native', world => setAccount(world, CLOCK, account(cat(clockBytes(SLOT), [0]), SYSVAR)));
});

test('INTEGRITY_FAILURE: getBlock-{null,noncanonical,parent≥S}', async () => {
  const blockWith = changes => world => {
    world.block = changes === null ? null : { ...world.block, ...changes };
  };
  await integrity('native', blockWith(null));
  await integrity('native', blockWith({ blockhash: `1${key('blockhash')}` }));
  await integrity('native', blockWith({ parentSlot: SLOT }));
  await integrity('native', blockWith({ blockHeight: SLOT + 1 }));
  await integrity('native', blockWith({ blockHeight: '390' }));
  // parentSlot must be a safe int too: '399' < 400 would otherwise pass by coercion.
  await integrity('native', blockWith({ parentSlot: String(SLOT - 1) }));
  await integrity('native', blockWith({ parentSlot: SLOT - 1.5 }));
  // Negative safe ints pass `height <= S` and `parent < S`; only the non-negative check refuses them.
  await integrity('native', blockWith({ blockHeight: -1 }));
  await integrity('native', blockWith({ parentSlot: -1 }));
});

test('INTEGRITY_FAILURE: recheck-changed-{hash,height,parent}', async () => {
  const second = { blockhash: key('blockhash'), blockHeight: SLOT - 10, parentSlot: SLOT - 1 };
  for (const changes of [{ blockhash: key('other') }, { blockHeight: SLOT - 11 }, { parentSlot: SLOT - 2 }]) {
    let count = 0;
    const handle = input => (input.method === 'getBlock' && ++count === 2 ? { ...second, ...changes } : undefined);
    await failsWith('INTEGRITY_FAILURE', 'native', { handle });
  }
});

test('INTEGRITY_FAILURE: genesis-flip', async () => {
  let count = 0;
  const handle = input => (input.method === 'getGenesisHash' && ++count === 2 ? key('flipped') : undefined);
  const s = await failsWith('INTEGRITY_FAILURE', 'native', { handle });
  assert.equal(s.calls.length, 5);
});

test('WRONG_CHAIN: genesis-mismatch (1 call)', async () => {
  const s = await failsWith('WRONG_CHAIN', 'native', {
    mutate: world => {
      world.genesis = key('other-genesis');
    },
  });
  assert.equal(s.calls.length, 1);
});

test('WRONG_CHAIN: validator-genesis-vs-compiled (fixture DiVL… vs 7xch…)', async () => {
  const s = await failsWith('WRONG_CHAIN', 'native', {
    mutate: world => {
      world.genesis = 'DiVLGwuPtjYhNZj9kAApqaRzjNJ63ddrAcf5JEP6wgm4';
    },
  });
  assert.equal(s.calls.length, 1);
  assert.equal(COMPILED_GENESIS, '7xchZ18C8Y2rfgfqR8sZ5XcjMp99jp67h5LuyqurEVHA');
});

// ---- escrow classification ----
test('INTEGRITY_FAILURE: escrow-{other-owner,system-data,exec,bump,seller,nonce}', async () => {
  await control('native', (world, terms) =>
    setAccount(world, escrowOf(world), account(escrowBytes(terms), PROGRAM, { lamports: 6e8 })),
  );
  // Funded lamports, so the owner is the only thing wrong.
  for (const kind of ['native', 'spl']) {
    for (const owner of [key('other-program'), SYSTEM]) {
      await integrity(kind, (world, terms) =>
        setAccount(world, escrowOf(world), account(escrowBytes(terms), owner, { lamports: 6e8 })),
      );
    }
  }
  // Only a System-owned empty account is a pre-init donation.
  for (const owner of [PROGRAM, key('other-program')]) {
    await integrity('native', world =>
      setAccount(world, escrowOf(world), account(new Uint8Array(0), owner, { lamports: 5 })),
    );
  }
  await integrity('native', world => setAccount(world, escrowOf(world), account(new Uint8Array(1), SYSTEM)));
  // Funded lamports, so the executable flag is the only thing wrong.
  for (const kind of ['native', 'spl']) {
    await integrity(kind, (world, terms) =>
      setAccount(world, escrowOf(world), account(escrowBytes(terms), PROGRAM, { executable: true, lamports: 6e8 })),
    );
  }
  await integrity('native', world =>
    setAccount(world, escrowOf(world), account(new Uint8Array(0), SYSTEM, { executable: true })),
  );
  await integrity('native', replaceEscrow({ escrowBump: 254 }));
  await integrity('native', replaceEscrow({ seller: key('other-seller') }));
  await integrity('native', replaceEscrow({ sellerNonce: 'ab'.repeat(32) }));
  await integrity('native', (world, terms) =>
    setAccount(world, escrowOf(world), account(escrowBytes(terms).subarray(0, 200), PROGRAM)),
  );
});

test('CONFLICT: nonce-reused', async () => {
  const s = await failsWith('CONFLICT', 'native', { mutate: replaceEscrow({ termsHash: 'cd'.repeat(32) }) });
  assert.equal(s.calls.length, 2);
  // Spec order: a seller, nonce or bump mismatch is INTEGRITY_FAILURE even with a foreign terms_hash.
  const foreign = { termsHash: 'cd'.repeat(32) };
  await integrity('native', replaceEscrow({ ...foreign, seller: key('other-seller') }));
  await integrity('native', replaceEscrow({ ...foreign, sellerNonce: 'ab'.repeat(32) }));
  await integrity('native', replaceEscrow({ ...foreign, escrowBump: 1 }));
});

test('INTEGRITY_FAILURE: field-{buyer,amount,deadline,mint,kind,tp}', async () => {
  await control('native', replaceEscrow({}));
  await control('spl', replaceEscrow({}));
  await integrity('native', replaceEscrow({ buyer: key('other-buyer') }));
  await integrity('native', replaceEscrow({ amount: 500_000_001 }));
  await integrity('native', replaceEscrow({ deadline: CHAIN_TIME + 3601 }));
  // The vault agrees with the foreign mint, so only the escrow-vs-terms mint check rejects it.
  await integrity('spl', (world, terms) => {
    replaceEscrow({ mint: key('other-mint') })(world, terms);
    const vault = tokenBytes({ mint: key('other-mint'), owner: world.escrow.address, amount: 25_000_000 });
    setAccount(world, vaultOf(world), account(vault, SPL_PROGRAM));
  });
  await integrity('native', replaceEscrow({ kind: 2, mint: MINT, tokenProgram: SPL_PROGRAM, vaultBump: 255 }));
  await integrity('spl', replaceEscrow({ tokenProgram: SPL_2022_PROGRAM }));
  await integrity('spl', replaceEscrow({ vaultBump: 1 }));
});

// ---- custody ----
test('INTEGRITY_FAILURE: native-lamports-{≤amount,unsafe}', async () => {
  await integrity('native', undefined, { world: { lamports: 500_000_000 } });
  await integrity('native', undefined, { world: { lamports: 2 ** 53 } });
  // A paid escrow skips `lamports > amount`, so only the non-negative check refuses -5.
  await control('native', undefined, { world: { escrow: { state: 1, paid: 1 } } });
  await integrity('native', undefined, { world: { escrow: { state: 1, paid: 1 }, lamports: -5 } });
  await integrity('native', world => setAccount(world, RENT, null));
  await integrity('native', world => setAccount(world, RENT, account(rentBytes(), key('not-sysvar'))));
  await integrity('native', world => setAccount(world, RENT, account(rentBytes(), SYSVAR, { executable: true })));
});

test('INTEGRITY_FAILURE: vault-{missing,token2022,mint,owner,below,delegate,close,uninit}', async () => {
  const vault =
    (bytes, owner = SPL_PROGRAM) =>
    world =>
      setAccount(world, vaultOf(world), account(bytes, owner));
  const base = world => ({ owner: world.escrow.address, amount: 25_000_000 });
  await control('spl', world => vault(tokenBytes(base(world)))(world));
  await integrity('spl', world => setAccount(world, vaultOf(world), null));
  await integrity('spl', world => vault(tokenBytes(base(world)), SPL_2022_PROGRAM)(world));
  await integrity('spl', world => vault(tokenBytes({ ...base(world), mint: key('other-mint') }))(world));
  await integrity('spl', world => vault(tokenBytes({ ...base(world), owner: key('someone') }))(world));
  await integrity('spl', world => vault(tokenBytes({ ...base(world), amount: 24_999_999 }))(world));
  await integrity('spl', world => vault(tokenBytes({ ...base(world), delegate: 1 }))(world));
  await integrity('spl', world => vault(tokenBytes({ ...base(world), close: 1 }))(world));
  await integrity('spl', world => vault(tokenBytes({ ...base(world), state: 0 }))(world));
  await integrity('spl', world =>
    setAccount(world, vaultOf(world), account(tokenBytes(base(world)), SPL_PROGRAM, { executable: true })),
  );
});

test('INTEGRITY_FAILURE: vault-while-absent, mint-decimals', async () => {
  await control('spl', world => setAccount(world, MINT, account(mintBytes(), SPL_PROGRAM)));
  await integrity('spl', world => setAccount(world, escrowOf(world), null));
  await integrity('spl', world => {
    setAccount(world, escrowOf(world), null);
    setAccount(world, vaultOf(world), account(new Uint8Array(0), SPL_PROGRAM));
  });
  await integrity('spl', world => setAccount(world, MINT, account(mintBytes({ decimals: 9 }), SPL_PROGRAM)));
  await integrity('spl', world => setAccount(world, MINT, account(mintBytes(), SPL_2022_PROGRAM)));
  await integrity('spl', world => setAccount(world, MINT, account(mintBytes(), SPL_PROGRAM, { executable: true })));
  // 83 bytes still fits the 112-char base64 cap and `space`: only the exact length check rejects it.
  await integrity('spl', world => setAccount(world, MINT, account(cat(mintBytes(), [0]), SPL_PROGRAM)));
  await integrity('spl', world => setAccount(world, MINT, null));
  // Spec §5: the mint is checked even when no escrow exists (the state in which the app decides to fund).
  const absent = mint => world => {
    setAccount(world, escrowOf(world), null);
    setAccount(world, vaultOf(world), null);
    setAccount(world, MINT, mint);
  };
  await control('spl', absent(account(mintBytes(), SPL_PROGRAM)));
  await integrity('spl', absent(account(mintBytes({ decimals: 9 }), SPL_PROGRAM)));
  await integrity('spl', absent(account(mintBytes(), SPL_2022_PROGRAM)));
  await integrity('spl', absent(null));
});

test('vault-frozen', async () => {
  // Control: an unfrozen funded SPL vault is healthy, so only the frozen flag yields CONFLICT.
  const healthy = setup('spl');
  try {
    assert.equal(ok(await healthy.reader.readValidated(healthy.binding, request(), healthy.terms)).state, 'funded');
  } finally {
    healthy.reader.dispose();
  }
  const frozen = { world: { vault: { state: 2 }, mint: { freeze: key('freezer') } } };
  const s = setup('spl', frozen);
  try {
    const snapshot = ok(await s.reader.read(s.binding, request(), s.terms));
    assert.equal(snapshot.custody.vaultFrozen, true);
    assert.equal(snapshot.custody.mintFreezeAuthority, key('freezer'));
    error(await s.reader.readValidated(s.binding, request(), s.terms), 'CONFLICT');
  } finally {
    s.reader.dispose();
  }
  const released = setup('spl', { world: { ...frozen.world, escrow: { state: 1 } } });
  try {
    assert.equal(
      ok(await released.reader.readValidated(released.binding, request(), released.terms)).state,
      'released',
    );
  } finally {
    released.reader.dispose();
  }
});

// ---- provider ----
test('UNAVAILABLE with no leak: throws, -32016', async () => {
  await failsWith('UNAVAILABLE', 'native', {
    handle: input => {
      if (input.method === 'getBlock') throw Error('SECRET https://rpc.invalid');
    },
  });
  const minContext = Object.assign(Error('SECRET Minimum context slot has not been reached'), {
    code: -32016,
    data: { contextSlot: 1 },
  });
  await failsWith('UNAVAILABLE', 'native', {
    handle: input => (input.method === 'getMultipleAccounts' ? Promise.reject(minContext) : undefined),
  });
  await failsWith('UNAVAILABLE', 'native', {
    handle: () => Promise.reject({ code: -32004, message: 'SECRET block not available' }),
  });
});

test('INTEGRITY_FAILURE: error-as-result', async () => {
  await failsWith('INTEGRITY_FAILURE', 'native', {
    handle: input =>
      input.method === 'getBlock' ? { code: -32004, message: 'SECRET Block not available for slot' } : undefined,
  });
  await failsWith('INTEGRITY_FAILURE', 'native', {
    handle: input =>
      input.method === 'getMultipleAccounts'
        ? { jsonrpc: '2.0', error: { code: -32016, message: 'SECRET' } }
        : undefined,
  });
});

// ---- pre-RPC ----
test('pre-RPC negatives make no calls', async () => {
  const s = setup('native');
  try {
    const cases = [
      [{ ...s.binding, tradeId: 'ab'.repeat(32) }, request(), s.terms, 'INVALID_INPUT'],
      [s.binding, { ...request(), generation: -1 }, s.terms, 'INVALID_INPUT'],
      [s.binding, { ...request(), requestSequence: 1.5 }, s.terms, 'INVALID_INPUT'],
      [{ ...s.binding, chain: 'evm' }, request(), s.terms, 'INVALID_INPUT'],
      [{ ...s.binding, deploymentId: 'other' }, request(), s.terms, 'UNSUPPORTED_PROVIDER'],
    ];
    for (const [binding, req, terms, code] of cases) error(await s.reader.read(binding, req, terms), code);
    const big = makeTerms('native', { amountBaseUnits: String(2 ** 53) });
    error(await s.reader.read(bindingOf(big), request(), big), 'LIMIT_EXCEEDED');
    const aborted = new AbortController();
    aborted.abort();
    error(await s.reader.read(s.binding, request(aborted.signal), s.terms), 'CANCELLED');
    error(await s.reader.validateLive('solana:localnet', DEPLOYMENT_ID), 'INVALID_INPUT');
    error(await s.reader.validateLive(NETWORK_ID, 'missing'), 'UNSUPPORTED_PROVIDER');
    assert.equal(s.calls.length, 0);
  } finally {
    s.reader.dispose();
  }
});

// ---- concurrency ----
test('four-held-cancel-limit-no-followups', async () => {
  const held = [];
  let holding = true;
  const s = setup('native', {
    handle: input =>
      holding && input.method === 'getGenesisHash' ? new Promise(resolve => held.push(resolve)) : undefined,
  });
  const controllers = Array.from({ length: MAX_RPC_READS }, () => new AbortController());
  const jobs = controllers.map(controller => s.reader.read(s.binding, request(controller.signal), s.terms));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(held.length, MAX_RPC_READS);
  controllers.forEach(controller => controller.abort());
  for (const job of jobs) error(await job, 'CANCELLED');
  error(await s.reader.validateLive(NETWORK_ID, DEPLOYMENT_ID), 'LIMIT_EXCEEDED');
  for (const resolve of held) resolve(COMPILED_GENESIS);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(
    s.calls.filter(call => call.method !== 'getGenesisHash').length,
    0,
    'late responses issue no follow-up reads',
  );
  holding = false;
  ok(await s.reader.validateLive(NETWORK_ID, DEPLOYMENT_ID));
  s.reader.dispose();
});

test('timeout-10ms', async () => {
  const s = setup('native', {
    options: { timeoutMs: 10 },
    handle: input => (input.method === 'getBlock' ? new Promise(() => {}) : undefined),
  });
  try {
    error(await s.reader.read(s.binding, request(), s.terms), 'TIMEOUT');
  } finally {
    s.reader.dispose();
  }
});

test('dispose', async () => {
  const held = [];
  const s = setup('native', {
    handle: input => (input.method === 'getBlock' ? new Promise(resolve => held.push(resolve)) : undefined),
  });
  const job = s.reader.read(s.binding, request(), s.terms);
  await new Promise(resolve => setTimeout(resolve, 5));
  s.reader.dispose();
  error(await job, 'CANCELLED');
  error(await s.reader.read(s.binding, request(), s.terms), 'CANCELLED');
  const count = s.calls.length;
  held.forEach(resolve => resolve(s.world.block));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(s.calls.length, count);
});

// Spec §2: timeoutMs defaults to 10_000 ms when omitted.
test('default-timeout-10000ms', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const flush = async () => {
    for (let index = 0; index < 5; index++) await new Promise(resolve => setImmediate(resolve));
  };
  const reader = new SolanaChainReader({ rpc: { request: () => new Promise(() => {}) }, registry: makeRegistry() });
  try {
    let settled = null;
    reader.validateLive(NETWORK_ID, DEPLOYMENT_ID).then(result => (settled = result));
    await flush();
    t.mock.timers.tick(9_999);
    await flush();
    assert.equal(settled, null, 'still pending at 9_999 ms');
    t.mock.timers.tick(1);
    await flush();
    error(settled, 'TIMEOUT');
  } finally {
    reader.dispose();
  }
});

test('ctor-0/60001', () => {
  const base = { rpc: { request: async () => null }, registry: makeRegistry() };
  for (const timeoutMs of [0, 60_001, 1.5, Number.NaN]) {
    assert.throws(() => new SolanaChainReader({ ...base, timeoutMs }), { message: 'Invalid Solana reader timeout.' });
  }
  new SolanaChainReader({ ...base, timeoutMs: 60_000 }).dispose();
  new SolanaChainReader({ ...base, timeoutMs: 1 }).dispose();
});

test('floor-max-under-concurrent-reads', async () => {
  let release;
  const gate = new Promise(resolve => (release = resolve));
  let heldOnce = false;
  // Read A anchors at SLOT and stalls in getBlock while read B completes at a later slot.
  const handle = async input => {
    if (input.method !== 'getBlock' || input.params[0] !== SLOT) return undefined;
    if (!heldOnce) {
      heldOnce = true;
      await gate;
    }
    return { blockhash: key('blockhash'), blockHeight: SLOT - 10, parentSlot: SLOT - 1 };
  };
  const s = setup('native', { handle });
  try {
    const first = s.reader.read(s.binding, request(), s.terms);
    while (!heldOnce) await new Promise(resolve => setImmediate(resolve));
    consistentAt(SLOT + 50)(s.world);
    ok(await s.reader.read(s.binding, request(), s.terms));
    release();
    ok(await first);
    ok(await s.reader.validateLive(NETWORK_ID, DEPLOYMENT_ID));
    assert.equal(s.calls.at(-4).params[1].minContextSlot, SLOT + 50, 'floor = max, never lowered by A');
  } finally {
    s.reader.dispose();
  }
});

test('late-response-no-floor-raise', async () => {
  let hold = false,
    release;
  const handle = (input, calls) => {
    if (
      hold &&
      input.method === 'getGenesisHash' &&
      calls.filter(call => call.method === 'getGenesisHash').length === 2
    ) {
      return new Promise(resolve => {
        release = () => resolve(COMPILED_GENESIS);
      });
    }
    return undefined;
  };
  const s = setup('native', { handle });
  try {
    hold = true;
    const controller = new AbortController();
    const job = s.reader.read(s.binding, request(controller.signal), s.terms);
    while (!release) await new Promise(resolve => setImmediate(resolve));
    controller.abort();
    error(await job, 'CANCELLED');
    release();
    await new Promise(resolve => setImmediate(resolve));
    hold = false;
    ok(await s.reader.read(s.binding, request(), s.terms));
    assert.deepEqual(
      s.calls[6].params[1],
      { commitment: 'finalized', encoding: 'base64' },
      'no floor from the abandoned read',
    );
  } finally {
    s.reader.dispose();
  }
});

// ---- authority (G08 wiring) ----
function authorityFor(s) {
  return createTradeAuthority({
    binding: s.binding,
    generation: 1,
    walletGeneration: 0,
    readValidated: (binding, req) => s.reader.readValidated(binding, req, s.terms),
  });
}

test('authority: funded-fresh', async () => {
  const s = setup('native');
  const authority = authorityFor(s);
  try {
    assert.equal(ok(await authority.refresh(s.binding)).state, 'funded');
    assert.equal(authority.readView(123).chainHealth, 'fresh');
  } finally {
    authority.dispose();
    s.reader.dispose();
  }
});

test('authority: spl-funded-fresh', async () => {
  const s = setup('spl');
  const authority = authorityFor(s);
  try {
    assert.equal(ok(await authority.refresh(s.binding)).state, 'funded');
    assert.equal(authority.readView(123).chainHealth, 'fresh');
  } finally {
    authority.dispose();
    s.reader.dispose();
  }
});

test('authority: funded-to-absent-reorged', async () => {
  const s = setup('native');
  const authority = authorityFor(s);
  try {
    ok(await authority.refresh(s.binding));
    setAccount(s.world, escrowOf(s.world), null);
    error(await authority.refresh(s.binding), 'INTEGRITY_FAILURE');
    assert.equal(authority.readView(123).chainHealth, 'reorged');
  } finally {
    authority.dispose();
    s.reader.dispose();
  }
});

test('authority: conflict-unavailable', async () => {
  const s = setup('spl', { world: { vault: { state: 2 } } });
  const authority = authorityFor(s);
  try {
    error(await authority.refresh(s.binding), 'CONFLICT');
    assert.equal(authority.readView(123).chainHealth, 'unavailable');
  } finally {
    authority.dispose();
    s.reader.dispose();
  }
});

test('payoutRegressed', async () => {
  const paid = ok((await readWith('native', { world: { escrow: { state: 1, paid: 1 } } })).result);
  const pending = ok((await readWith('native', { world: { escrow: { state: 1 } } })).result);
  const later = ok(
    (
      await readWith('native', {
        world: { slot: SLOT + 1, escrow: { state: 1, paid: 1 } },
        mutate: world => setAccount(world, CLOCK, account(clockBytes(SLOT + 1), SYSVAR)),
      })
    ).result,
  );
  assert.equal(payoutRegressed(paid, pending), true);
  assert.equal(payoutRegressed(pending, paid), false);
  assert.equal(payoutRegressed(later, paid), true, 'height decreased');
  assert.equal(payoutRegressed(paid, later), false);
});
