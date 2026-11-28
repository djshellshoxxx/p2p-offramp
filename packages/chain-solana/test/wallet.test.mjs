import test from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519.js';
import { bindSolanaTrade } from '../src/bind.ts';
import { buildRelease } from '../src/instructions.ts';
import { compileLegacyMessage, parseLegacyMessage } from '../src/message.ts';
import {
  checkSignedTransaction,
  connectWalletRole,
  decodeSignature,
  signWithWallet,
  verifySignature,
} from '../src/wallet.ts';
import { BUYER, CHAIN, keypair, makeWallet, SELLER } from './lifecycle-support.mjs';
import { base58Encode, bindingOf, error, key, makeRegistry, makeTerms, ok } from './support.mjs';

const terms = makeTerms('native', { seller: SELLER.address, buyer: BUYER.address });
const trade = ok(bindSolanaTrade(makeRegistry(), bindingOf(terms), terms));
const BLOCKHASH = key('wallet-blockhash');
const message = compileLegacyMessage(SELLER.address, [ok(buildRelease(trade))], BLOCKHASH);
const code = expected => thrown => thrown?.code === expected;
const otherMessage = compileLegacyMessage(SELLER.address, [ok(buildRelease(trade))], key('other-blockhash'));

test('connect-explicit-and-role-bound', async () => {
  const fake = makeWallet();
  const seller = ok(await connectWalletRole(fake.wallet, trade, 'seller', CHAIN));
  assert.deepEqual(
    { ...seller },
    { role: 'seller', address: SELLER.address, chain: CHAIN, tradeId: trade.binding.tradeId },
  );
  assert.equal(fake.calls.connect, 1);
  const buyer = ok(await connectWalletRole(fake.wallet, trade, 'buyer', CHAIN));
  assert.equal(buyer.address, BUYER.address);
  // The wallet only offers another key: the role key is not there.
  const stranger = makeWallet([keypair('stranger')]);
  error(await connectWalletRole(stranger.wallet, trade, 'seller', CHAIN), 'UNAUTHORIZED');
  // An account whose publicKey bytes do not match its address.
  const lying = makeWallet([SELLER], {
    accounts: [
      { address: SELLER.address, publicKey: BUYER.publicKey, chains: [CHAIN], features: ['solana:signTransaction'] },
    ],
  });
  error(await connectWalletRole(lying.wallet, trade, 'seller', CHAIN), 'INTEGRITY_FAILURE');
  error(
    await connectWalletRole(makeWallet([SELLER], { chains: ['solana:other'] }).wallet, trade, 'seller', CHAIN),
    'UNSUPPORTED_PROVIDER',
  );
  error(
    await connectWalletRole(makeWallet([SELLER], { features: ['standard:connect'] }).wallet, trade, 'seller', CHAIN),
    'UNSUPPORTED_PROVIDER',
  );
  error(
    await connectWalletRole(makeWallet([SELLER], { rejectConnect: true }).wallet, trade, 'seller', CHAIN),
    'USER_REJECTED',
  );
  error(await connectWalletRole({ features: {} }, trade, 'seller', CHAIN), 'UNSUPPORTED_PROVIDER');
  error(await connectWalletRole(fake.wallet, trade, 'arbiter', CHAIN), 'INVALID_INPUT');
  error(await connectWalletRole(fake.wallet, { ...trade }, 'seller', CHAIN), 'INVALID_INPUT');
  error(await connectWalletRole(fake.wallet, trade, 'seller', 'eip155:1'), 'INVALID_INPUT');
});

test('sign-honest-wallet', async () => {
  const fake = makeWallet();
  const session = ok(await connectWalletRole(fake.wallet, trade, 'seller', CHAIN));
  const signed = ok(await signWithWallet(session, message));
  assert.ok(verifySignature(signed.signature, message, SELLER.address));
  const [input] = fake.calls.sign[0];
  assert.equal(input.chain, CHAIN);
  assert.equal(input.account.address, SELLER.address);
  assert.deepEqual(input.transaction.subarray(1 + 64), message);
  assert.ok(input.transaction.subarray(1, 65).every(byte => byte === 0));
  error(await signWithWallet({ ...session }, message), 'UNAUTHORIZED');
});

test('wallet-substitution-refused', async () => {
  const parsed = parseLegacyMessage(message);
  const blockhashAt = 4 + parsed.accountKeys.length * 32;
  const mutations = {
    feePayer: m => Uint8Array.from([...m.subarray(0, 4), ...BUYER.publicKey, ...m.subarray(36)]),
    blockhash: m => {
      const copy = Uint8Array.from(m);
      copy[blockhashAt] ^= 1;
      return copy;
    },
    instructionData: m => {
      const copy = Uint8Array.from(m);
      copy[copy.length - 1] ^= 1;
      return copy;
    },
    extraInstruction: m =>
      compileLegacyMessage(SELLER.address, [ok(buildRelease(trade)), ok(buildRelease(trade))], BLOCKHASH),
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const fake = makeWallet([SELLER, BUYER], { mutate });
    const session = ok(await connectWalletRole(fake.wallet, trade, 'seller', CHAIN));
    error(await signWithWallet(session, message), 'INTEGRITY_FAILURE');
    assert.equal(fake.calls.sign.length, 1, name);
  }
});

test('wallet-output-validated', async () => {
  const sign = (bytes, pair = SELLER) => ed25519.sign(bytes, pair.seed);
  const honest = Uint8Array.from([1, ...sign(message), ...message]);
  const outputs = {
    'other signer': [{ signedTransaction: Uint8Array.from([1, ...sign(message, BUYER), ...message]) }],
    'zero signature': [{ signedTransaction: Uint8Array.from([1, ...new Uint8Array(64), ...message]) }],
    'two signatures': [{ signedTransaction: Uint8Array.from([2, ...sign(message), ...sign(message), ...message]) }],
    'two outputs': [{ signedTransaction: honest }, { signedTransaction: honest }],
    'no output': [],
    'not bytes': [{ signedTransaction: Array.from(honest) }],
    accessor: [Object.defineProperty({}, 'signedTransaction', { get: () => honest })],
    oversized: [{ signedTransaction: new Uint8Array(4096) }],
    // A valid signature over our message, wrapped around different message bytes (the wire is what gets sent).
    'message swapped after signing': [{ signedTransaction: Uint8Array.from([1, ...sign(message), ...otherMessage]) }],
  };
  for (const [name, output] of Object.entries(outputs)) {
    assert.throws(() => checkSignedTransaction(output, message, SELLER.address), code('INTEGRITY_FAILURE'), name);
  }
  assert.equal(
    checkSignedTransaction([{ signedTransaction: honest }], message, SELLER.address).signature,
    base58Encode(sign(message)),
  );
  const wrongKey = makeWallet([SELLER, BUYER], { signWith: BUYER });
  const session = ok(await connectWalletRole(wrongKey.wallet, trade, 'seller', CHAIN));
  error(await signWithWallet(session, message), 'INTEGRITY_FAILURE');
  error(
    await signWithWallet(
      ok(await connectWalletRole(makeWallet([SELLER], { rejectSign: true }).wallet, trade, 'seller', CHAIN)),
      message,
    ),
    'USER_REJECTED',
  );
});

test('signature-encoding-strict', () => {
  const signature = base58Encode(ed25519.sign(message, SELLER.seed));
  assert.equal(base58Encode(decodeSignature(signature)), signature);
  const short = base58Encode(new Uint8Array(63).fill(9));
  const long = base58Encode(new Uint8Array(65).fill(9));
  for (const bad of [short, long, `${signature.slice(0, -1)}0`, signature.replace(/^./, 'l'), 7, null, '']) {
    assert.throws(() => decodeSignature(bad), code('INVALID_INPUT'), String(bad));
  }
  assert.equal(verifySignature(signature, message, BUYER.address), false);
  assert.equal(verifySignature(signature, Uint8Array.from([...message, 0]), SELLER.address), false);
  assert.equal(verifySignature('not base58 0OIl', message, SELLER.address), false);
});
