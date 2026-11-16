import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bindSolanaTrade } from '../src/bind.ts';
import { buildFundNative, buildFundSpl, buildPayout, buildRefund, buildRelease } from '../src/instructions.ts';
import {
  ata,
  base58Encode,
  bindingOf,
  error,
  fromHex,
  key,
  makeRegistry,
  makeTerms,
  MINT,
  ok,
  PROGRAM,
  SYSTEM,
  SPL_PROGRAM,
} from './support.mjs';

const idl = JSON.parse(
  readFileSync(new URL('../../../contracts/solana/idl/basic_escrow.json', import.meta.url), 'utf8'),
);
const idlOf = name => idl.instructions.find(entry => entry.name === name);
const bound = kind => {
  const terms = makeTerms(kind);
  return ok(bindSolanaTrade(makeRegistry(), bindingOf(terms), terms));
};
const native = bound('native'),
  spl = bound('spl');
const SELLER_TOKEN = key('seller-token-account');
function builtAll() {
  return {
    fund_native: ok(buildFundNative(native)),
    fund_spl: ok(buildFundSpl(spl, SELLER_TOKEN)),
    release: ok(buildRelease(spl)),
    refund: ok(buildRefund(native)),
    payout_native: ok(buildPayout(native, 'released')),
    payout_spl: ok(buildPayout(spl, 'released')),
  };
}

test('metas-discriminators-vs-idl', () => {
  const roles = {
    fund_native: [native.terms.seller, native.escrow.address, native.terms.buyer, SYSTEM],
    fund_spl: [spl.terms.seller, spl.escrow.address, MINT, SELLER_TOKEN, spl.vault.address, SPL_PROGRAM, SYSTEM],
    release: [spl.terms.seller, spl.escrow.address],
    refund: [native.escrow.address],
    payout_native: [native.escrow.address, native.terms.buyer],
    payout_spl: [spl.escrow.address, spl.vault.address, MINT, ata(spl.terms.buyer, MINT), SPL_PROGRAM],
  };
  for (const [name, instruction] of Object.entries(builtAll())) {
    const spec = idlOf(name);
    assert.equal(instruction.programId, PROGRAM);
    assert.equal(
      Buffer.from(instruction.data.subarray(0, 8)).toString('hex'),
      Buffer.from(spec.discriminator).toString('hex'),
    );
    assert.deepEqual(
      instruction.accounts.map(meta => [meta.isWritable, meta.isSigner]),
      spec.accounts.map(meta => [meta.writable === true, meta.signer === true]),
      name,
    );
    assert.deepEqual(
      instruction.accounts.map(meta => meta.pubkey),
      roles[name],
      name,
    );
    spec.accounts.forEach((meta, index) => {
      if (meta.address) assert.equal(instruction.accounts[index].pubkey, meta.address);
    });
    assert.ok(
      Object.isFrozen(instruction) &&
        Object.isFrozen(instruction.accounts) &&
        instruction.accounts.every(Object.isFrozen),
    );
  }
});

test('fundargs-200B', () => {
  const terms = native.terms,
    data = ok(buildFundNative(native)).data;
  assert.equal(data.length, 200);
  const view = new DataView(data.buffer, data.byteOffset);
  assert.deepEqual(data.subarray(8, 40), fromHex(terms.orderId));
  assert.equal(base58Encode(data.subarray(40, 72)), terms.buyer);
  assert.deepEqual(data.subarray(72, 104), fromHex(terms.privateAgreementHash));
  assert.deepEqual(data.subarray(104, 136), fromHex(terms.capabilitiesHash));
  assert.deepEqual(data.subarray(136, 168), fromHex(terms.sellerNonce));
  assert.deepEqual(
    [168, 176, 184, 192].map(offset => view.getBigUint64(offset, true).toString()),
    [terms.revision, terms.amountBaseUnits, terms.acceptBeforeSeconds, terms.escrowExpirySeconds],
  );
  assert.deepEqual(ok(buildFundSpl(spl, SELLER_TOKEN)).data.length, 200);
});

test('recipient-by-outcome', () => {
  assert.equal(ok(buildPayout(native, 'released')).accounts[1].pubkey, native.terms.buyer);
  assert.equal(ok(buildPayout(native, 'refunded')).accounts[1].pubkey, native.terms.seller);
  error(buildPayout(native, 'funded'), 'INVALID_INPUT');
  error(buildPayout(native, undefined), 'INVALID_INPUT');
});

test('payout-spl-ata', () => {
  assert.equal(ok(buildPayout(spl, 'released')).accounts[3].pubkey, ata(spl.terms.buyer, MINT));
  assert.equal(ok(buildPayout(spl, 'refunded')).accounts[3].pubkey, ata(spl.terms.seller, MINT));
});

test('seller-token-distinct', () => {
  for (const bad of [spl.escrow.address, spl.vault.address, MINT, `1${SELLER_TOKEN}`, 'not-a-key', 7]) {
    error(buildFundSpl(spl, bad), 'INVALID_INPUT');
  }
});

test('unbranded-rejected', () => {
  const copy = { ...native };
  for (const result of [
    buildFundNative(copy),
    buildRelease(copy),
    buildRefund(copy),
    buildPayout(copy, 'released'),
    buildFundSpl({ ...spl }, SELLER_TOKEN),
    buildFundNative(spl),
    buildFundSpl(native, SELLER_TOKEN),
    buildRelease(null),
  ]) {
    error(result, 'INVALID_INPUT');
  }
});

test('no-system-instruction', () => {
  for (const instruction of Object.values(builtAll())) {
    assert.notEqual(instruction.programId, SYSTEM);
    assert.equal(instruction.programId, PROGRAM);
  }
});

test('no-io', () => {
  const originals = { fetch: globalThis.fetch, now: Date.now };
  let touched = 0;
  globalThis.fetch = () => {
    touched++;
    throw Error('SECRET');
  };
  Date.now = () => {
    touched++;
    throw Error('SECRET');
  };
  try {
    const first = builtAll(),
      second = builtAll();
    assert.deepEqual(first, second);
    assert.notEqual(first.fund_native.data, second.fund_native.data, 'data is a fresh copy per call');
    first.fund_native.data[0] ^= 1;
    assert.deepEqual(
      ok(buildFundNative(native)).data,
      second.fund_native.data,
      'mutating a result cannot change later builds',
    );
  } finally {
    globalThis.fetch = originals.fetch;
    Date.now = originals.now;
  }
  assert.equal(touched, 0);
});
