// REAL bytes: finalized getAccountInfo captures from a local solana-test-validator (SBPF v3 build).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { escrowAddress, programDataAddress, vaultAddress } from '../src/address.ts';
import {
  decodeEscrow,
  decodeProgramAccount,
  decodeProgramData,
  programDataSha256,
  programDataSha256FromElf,
} from '../src/layout.ts';
import { SolanaChainReader } from '../src/reader.ts';
import {
  account,
  bindingOf,
  CLOCK,
  clockBytes,
  COMPILED_GENESIS,
  enc,
  key,
  LOADER,
  makeRegistry,
  makeRpc,
  MINT,
  mintBytes,
  ok,
  PROGRAM,
  RENT,
  rentBytes,
  request,
  sha,
  shaHex,
  SYSVAR,
  SPL_PROGRAM,
  tokenBytes,
  tradeIdOf,
  vaultPda,
} from './support.mjs';

const path = new URL('../../../contracts/solana/localnet/fixtures/accounts-localnet.json', import.meta.url);
const fixture = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
const skip = fixture ? false : 'pending: localnet fixture';
const bytes = value => Uint8Array.from(Buffer.from(value, 'base64'));
const byLabel = label => fixture.escrows.find(entry => entry.label === label);

function termsOf(entry, genesisHash = COMPILED_GENESIS) {
  const args = entry.fundArgs,
    spl = entry.mint !== null;
  return {
    genesisHash,
    programId: fixture.program.address,
    orderId: args.orderId,
    seller: entry.seller,
    buyer: args.buyer,
    assetKind: spl ? 'spl' : 'native',
    mint: spl ? entry.mint : null,
    tokenProgram: spl ? SPL_PROGRAM : null,
    privateAgreementHash: args.privateAgreementHash,
    capabilitiesHash: args.capabilitiesHash,
    sellerNonce: args.sellerNonce,
    revision: String(args.revision),
    amountBaseUnits: String(args.amount),
    acceptBeforeSeconds: String(args.acceptBefore),
    escrowExpirySeconds: String(args.expiry),
  };
}

test('decodes-5-escrows', { skip }, () => {
  assert.equal(fixture.escrows.length, 5);
  const decoded = Object.fromEntries(
    fixture.escrows.map(entry => [entry.label, decodeEscrow(bytes(entry.dataBase64))]),
  );
  const funded = byLabel('native-funded');
  assert.equal(funded.lamports, 502_436_000);
  assert.equal(funded.lamports, Number(decoded['native-funded'].amountBaseUnits) + 2_436_000);
  assert.deepEqual([decoded['native-funded'].state, decoded['native-funded'].paidOut], ['funded', false]);
  assert.deepEqual(
    [decoded['native-released-paid'].state, decoded['native-released-paid'].paidOut],
    ['released', true],
  );
  assert.deepEqual(
    [decoded['native-refunded-paid'].state, decoded['native-refunded-paid'].paidOut],
    ['refunded', true],
  );
  assert.equal(byLabel('native-released-paid').lamports, 2_436_000);
  const spl = decoded['spl-funded'];
  assert.equal(spl.assetKind, 'spl');
  assert.equal(spl.mint, MINT);
  assert.equal(spl.tokenProgram, SPL_PROGRAM);
  // The committed SBPF v3 capture has vault bump 255 (the spec's 253 came from an older capture).
  assert.equal(spl.vaultBump, vaultPda(byLabel('spl-funded').escrowAddress).bump);
  assert.equal(spl.vaultBump, 255);
  for (const entry of fixture.escrows) assert.equal(decoded[entry.label].vaultBump === 0, entry.mint === null);
});

test('pdas-match', { skip }, () => {
  for (const entry of fixture.escrows) {
    const decoded = decodeEscrow(bytes(entry.dataBase64));
    const escrow = escrowAddress(fixture.program.address, entry.seller, entry.fundArgs.sellerNonce);
    assert.deepEqual(escrow, { address: entry.escrowAddress, bump: decoded.escrowBump });
    if (entry.vaultAddress)
      assert.deepEqual(vaultAddress(fixture.program.address, escrow.address), {
        address: entry.vaultAddress,
        bump: decoded.vaultBump,
      });
  }
});

test('terms-hash-compiled-not-validator-genesis', { skip }, () => {
  assert.equal(COMPILED_GENESIS, '7xchZ18C8Y2rfgfqR8sZ5XcjMp99jp67h5LuyqurEVHA');
  assert.notEqual(fixture.validator.genesisHash, COMPILED_GENESIS);
  for (const entry of fixture.escrows) {
    const termsHash = decodeEscrow(bytes(entry.dataBase64)).termsHash;
    assert.equal(tradeIdOf(termsOf(entry)), termsHash, entry.label);
    assert.notEqual(tradeIdOf(termsOf(entry, fixture.validator.genesisHash)), termsHash);
  }
});

test('program-pointer-XR3M', { skip }, () => {
  assert.equal(fixture.program.owner, LOADER);
  assert.equal(fixture.program.executable, true);
  assert.equal(decodeProgramAccount(bytes(fixture.program.dataBase64)), 'XR3M7K34KSnyYV1HtPmoRkjuLWqhwfF3m1LgC3jaTfF');
  assert.equal(programDataAddress(fixture.program.address).address, fixture.programData.address);
});

test('programdata-none-stale-key-accepted', { skip }, () => {
  const header = bytes(fixture.programData.headerBase64);
  assert.equal(header.length, 45);
  assert.equal(header[12], 0);
  assert.ok(
    header.subarray(13).some(byte => byte !== 0),
    'the stale key bytes [13..45) are present and ignored',
  );
  const elf = sha(enc.encode('synthetic elf'));
  const data = Uint8Array.from([...header, ...elf]);
  assert.equal(decodeProgramData(data).sha256, shaHex(elf));
  assert.equal(fixture.programData.dataLength, 45 + fixture.programData.soLength);
  // No padding in this capture: the region hash equals the .so hash, i.e. FromElf with L = 45 + len(so).
  assert.equal(fixture.programData.sha256OfBytesAfterHeader, fixture.programData.soSha256);
  assert.equal(programDataSha256(data), programDataSha256FromElf(elf, 45 + elf.length));
});

test('readme-describes-committed-fixture-hash', { skip }, () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  // The committed capture is the current, unpadded build; the README must not call its hash stale.
  assert.ok(readme.includes(`\`${fixture.programData.sha256OfBytesAfterHeader.slice(0, 8)}…\`, unpadded`));
  assert.doesNotMatch(readme, /stale fixture hash/);
});

/** World from the real captures; ProgramData is the real header ‖ a synthetic ELF of the deployed length. */
function fixtureWorld(entry) {
  const elf = new Uint8Array(fixture.programData.soLength).fill(0x5a);
  const programData = Uint8Array.from([...bytes(fixture.programData.headerBase64), ...elf]);
  const decoded = decodeEscrow(bytes(entry.dataBase64)),
    slot = entry.slot;
  const accounts = new Map([
    [fixture.program.address, { ...account(bytes(fixture.program.dataBase64), LOADER, { executable: true }) }],
    [fixture.programData.address, account(programData, LOADER)],
    [CLOCK, account(clockBytes(slot, entry.clockUnixTimestampAtFunding), SYSVAR)],
    [RENT, account(rentBytes(), SYSVAR)],
    [entry.escrowAddress, account(bytes(entry.dataBase64), fixture.program.address, { lamports: entry.lamports })],
  ]);
  if (entry.vaultAddress) {
    const amount = decoded.paidOut ? 0 : Number(decoded.amountBaseUnits);
    accounts.set(
      entry.vaultAddress,
      account(tokenBytes({ mint: entry.mint, owner: entry.escrowAddress, amount }), SPL_PROGRAM),
    );
    accounts.set(entry.mint, account(mintBytes(), SPL_PROGRAM));
  }
  const world = {
    genesis: COMPILED_GENESIS,
    slot,
    accounts,
    block: { blockhash: key(`block-${slot}`), blockHeight: slot - 2, parentSlot: slot - 1 },
  };
  return { world, pin: programDataSha256FromElf(elf, fixture.programData.dataLength) };
}

test('fake-rpc-reads-each-state', { skip }, async () => {
  const expected = {
    'native-funded': ['funded', 'not-applicable'],
    'native-released-paid': ['released', 'complete'],
    'native-refunded-paid': ['refunded', 'complete'],
    'spl-funded': ['funded', 'not-applicable'],
    'spl-released-paid': ['released', 'complete'],
  };
  for (const entry of fixture.escrows) {
    const { world, pin } = fixtureWorld(entry);
    const { rpc } = makeRpc(world);
    const registry = makeRegistry({
      deployment: {
        address: PROGRAM,
        runtime: { kind: 'solana-program', programDataSha256: pin, upgradeAuthority: null },
      },
    });
    const reader = new SolanaChainReader({ rpc, registry, now: () => 123 });
    try {
      const terms = termsOf(entry);
      const snapshot = ok(await reader.read(bindingOf(terms), request(), terms));
      assert.deepEqual([snapshot.observation.state, snapshot.payout], expected[entry.label], entry.label);
      assert.equal(snapshot.escrowAddress, entry.escrowAddress);
      assert.equal(snapshot.live.timestampSeconds, String(entry.clockUnixTimestampAtFunding));
      if (entry.label === 'native-funded') assert.equal(snapshot.custody.surplus, '0');
    } finally {
      reader.dispose();
    }
  }
});
