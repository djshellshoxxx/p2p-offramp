import test from 'node:test';
import assert from 'node:assert/strict';
import { createTradeAuthority } from '../../domain/src/authority.ts';
import { MAX_RPC_READS, payoutRegressed, SolanaChainReader } from '../src/reader.ts';
import {
  account,
  b64,
  bindingOf,
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
  TOKEN_2022,
  TOKENKEG,
  tokenBytes,
  vaultPda,
} from './support.mjs';

const ALLOWED = new Set(['getGenesisHash', 'getMultipleAccounts', 'getBlock']);
const seenMethods = new Set();
async function readWith(kind, options = {}) {
  const s = setup(kind, options);
  try {
    const result = await s.reader.read(s.binding, request(), s.terms);
    for (const call of s.calls) seenMethods.add(call.method);
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
const control = async (kind, mutate) => assert.ok(ok((await readWith(kind, { mutate })).result));
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

test('methods⊆{getGenesisHash,getMultipleAccounts,getBlock}', () => {
  assert.ok(seenMethods.size > 0);
  for (const method of seenMethods) assert.ok(ALLOWED.has(method), method);
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
    (bytes, executable = false) =>
    world =>
      setAccount(world, PROGRAM_DATA, account(bytes, LOADER, { executable }));
  await integrity('native', data(programDataBytes(), true));
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

test('INTEGRITY_FAILURE: slot-{unsafe,float,below-floor}', async () => {
  for (const slot of [2 ** 53, 400.5, -1, '400']) {
    await integrity('native', world => {
      world.slot = slot;
    });
  }
});

test('INTEGRITY_FAILURE: data-{base58,3-tuple,bad-b64}', async () => {
  const shape = data => world => {
    const entry = world.accounts.get(CLOCK);
    setAccount(world, CLOCK, { ...entry, data });
  };
  const clock = b64(clockBytes(SLOT));
  await integrity('native', shape([clock, 'base58']));
  await integrity('native', shape([clock, 'base64', 'extra']));
  await integrity('native', shape([`${clock.slice(0, -2)}A=`, 'base64']));
  await integrity('native', shape(clock));
  await integrity('native', world => setAccount(world, CLOCK, { ...world.accounts.get(CLOCK), executable: 'false' }));
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
});

test('INTEGRITY_FAILURE: recheck-changed', async () => {
  let count = 0;
  const handle = input =>
    input.method === 'getBlock' && ++count === 2
      ? { blockhash: key('other'), blockHeight: SLOT - 10, parentSlot: SLOT - 1 }
      : undefined;
  await failsWith('INTEGRITY_FAILURE', 'native', { handle });
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
  await integrity('native', (world, terms) =>
    setAccount(world, escrowOf(world), account(escrowBytes(terms), key('other-program'))),
  );
  await integrity('native', (world, terms) => setAccount(world, escrowOf(world), account(escrowBytes(terms), SYSTEM)));
  await integrity('native', world => setAccount(world, escrowOf(world), account(new Uint8Array(1), SYSTEM)));
  await integrity('native', (world, terms) =>
    setAccount(world, escrowOf(world), account(escrowBytes(terms), PROGRAM, { executable: true })),
  );
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
});

test('INTEGRITY_FAILURE: field-{buyer,amount,deadline,mint,kind,tp}', async () => {
  await control('native', replaceEscrow({}));
  await control('spl', replaceEscrow({}));
  await integrity('native', replaceEscrow({ buyer: key('other-buyer') }));
  await integrity('native', replaceEscrow({ amount: 500_000_001 }));
  await integrity('native', replaceEscrow({ deadline: CHAIN_TIME + 3601 }));
  await integrity('spl', replaceEscrow({ mint: key('other-mint') }));
  await integrity('native', replaceEscrow({ kind: 2, mint: MINT, tokenProgram: TOKENKEG, vaultBump: 255 }));
  await integrity('spl', replaceEscrow({ tokenProgram: TOKEN_2022 }));
  await integrity('spl', replaceEscrow({ vaultBump: 1 }));
});

// ---- custody ----
test('INTEGRITY_FAILURE: native-lamports-{≤amount,unsafe}', async () => {
  await integrity('native', undefined, { world: { lamports: 500_000_000 } });
  await integrity('native', undefined, { world: { lamports: 2 ** 53 } });
  await integrity('native', world => setAccount(world, RENT, null));
  await integrity('native', world => setAccount(world, RENT, account(rentBytes(), key('not-sysvar'))));
});

test('INTEGRITY_FAILURE: vault-{missing,token2022,mint,owner,below,delegate,close,uninit}', async () => {
  const vault =
    (bytes, owner = TOKENKEG) =>
    world =>
      setAccount(world, vaultOf(world), account(bytes, owner));
  const base = world => ({ owner: world.escrow.address, amount: 25_000_000 });
  await control('spl', world => vault(tokenBytes(base(world)))(world));
  await integrity('spl', world => setAccount(world, vaultOf(world), null));
  await integrity('spl', world => vault(tokenBytes(base(world)), TOKEN_2022)(world));
  await integrity('spl', world => vault(tokenBytes({ ...base(world), mint: key('other-mint') }))(world));
  await integrity('spl', world => vault(tokenBytes({ ...base(world), owner: key('someone') }))(world));
  await integrity('spl', world => vault(tokenBytes({ ...base(world), amount: 24_999_999 }))(world));
  await integrity('spl', world => vault(tokenBytes({ ...base(world), delegate: 1 }))(world));
  await integrity('spl', world => vault(tokenBytes({ ...base(world), close: 1 }))(world));
  await integrity('spl', world => vault(tokenBytes({ ...base(world), state: 0 }))(world));
});

test('INTEGRITY_FAILURE: vault-while-absent, mint-decimals', async () => {
  await control('spl', world => setAccount(world, MINT, account(mintBytes(), TOKENKEG)));
  await integrity('spl', world => setAccount(world, escrowOf(world), null));
  await integrity('spl', world => setAccount(world, MINT, account(mintBytes({ decimals: 9 }), TOKENKEG)));
  await integrity('spl', world => setAccount(world, MINT, account(mintBytes(), TOKEN_2022)));
  await integrity('spl', world => setAccount(world, MINT, null));
});

test('vault-frozen', async () => {
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

test('ctor-0/60001', () => {
  const base = { rpc: { request: async () => null }, registry: makeRegistry() };
  for (const timeoutMs of [0, 60_001, 1.5, Number.NaN]) {
    assert.throws(() => new SolanaChainReader({ ...base, timeoutMs }), { message: 'Invalid Solana reader timeout.' });
  }
  new SolanaChainReader({ ...base, timeoutMs: 60_000 }).dispose();
  new SolanaChainReader({ ...base, timeoutMs: 1 }).dispose();
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
