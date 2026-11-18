import test from 'node:test';
import assert from 'node:assert/strict';
import { bindSolanaTrade } from '../src/bind.ts';
import { parseSolanaIntent, SOLANA_TRANSITIONS, transitionIntent, verifyIntentForTrade } from '../src/intent.ts';
import { admitIntent } from '../src/journal.ts';
import { encodeBase64, parseLegacyMessage } from '../src/message.ts';
import { connected, keypair, setupClient } from './lifecycle-support.mjs';
import { base58Encode, bindingOf, key, makeRegistry, makeTerms, ok } from './support.mjs';

const code = expected => thrown => thrown?.code === expected;

/** One `sent` release record and its trade, produced by the real client flow. */
async function sentRecord() {
  const env = setupClient('native');
  ok(await env.client.release(env.trade, await connected(env, 'seller')));
  const [record] = env.journalFake.records(env.binding);
  return { env, record: structuredClone(record) };
}

test('valid-record-roundtrip', async () => {
  const { env, record } = await sentRecord();
  const parsed = parseSolanaIntent(record);
  assert.equal(parsed.state, 'sent');
  assert.ok(Object.isFrozen(parsed));
  verifyIntentForTrade(parsed, env.trade);
  assert.deepEqual(env.journalFake.writes, ['prepared', 'signed', 'sendMarked', 'sent']);
  assert.ok(parsed.sendMarkedAt >= parsed.createdAt && parsed.sendMarkedAt <= parsed.updatedAt);
});

test('restored-record-strictly-validated', async () => {
  const { record } = await sentRecord();
  const otherSignature = base58Encode(new Uint8Array(64).fill(7));
  const mutate = change => {
    const copy = structuredClone(record);
    change(copy);
    return copy;
  };
  const invalid = {
    unknownField: mutate(r => (r.extra = 1)),
    missingField: mutate(r => delete r.outcome),
    signatureShort: mutate(r => (r.signature = base58Encode(new Uint8Array(63).fill(1)))),
    signatureLong: mutate(r => (r.signature = base58Encode(new Uint8Array(65).fill(1)))),
    signatureNotBase58: mutate(r => (r.signature = `0${r.signature.slice(1)}`)),
    blockhashNotKey: mutate(r => (r.blockhash = 'short')),
    lastValidNegative: mutate(r => (r.lastValidBlockHeight = '-1')),
    lastValidLeadingZero: mutate(r => (r.lastValidBlockHeight = '0150')),
    preparedWithSignature: mutate(r => ((r.state = 'prepared'), (r.sendMarkedAt = null))),
    sentWithoutMarker: mutate(r => (r.sendMarkedAt = null)),
    markerAfterUpdate: mutate(r => (r.sendMarkedAt = r.updatedAt + 1)),
    updatedBeforeCreated: mutate(r => (r.createdAt = r.updatedAt + 1)),
    finalizedWithoutOutcome: mutate(r => (r.state = 'finalized')),
    failedBadLabel: mutate(r => ((r.state = 'failed'), (r.outcome = { slot: '9', err: '{"x":1}' }))),
    cancelledAfterMarker: mutate(r => (r.state = 'cancelled')),
    roleForAction: mutate(r => (r.role = 'buyer')),
    expectedState: mutate(r => (r.expectedEscrowState = 'released')),
    action: mutate(r => (r.action = 'approve')),
    feePayerMismatch: mutate(r => (r.feePayer = keypair('other').address)),
    blockhashMismatch: mutate(r => (r.blockhash = key('other-blockhash'))),
    replacementSelf: mutate(r => (r.replacementOf = r.intentId)),
    profile: mutate(r => (r.originProfileId = 'A'.repeat(32))),
    intentId: mutate(r => (r.intentId = 'x')),
    bindingChain: mutate(r => (r.binding.chain = 'evm')),
    bindingColon: mutate(r => (r.binding.networkId = 'a:b')),
    messageVersioned: mutate(r => {
      const bytes = Uint8Array.from(Buffer.from(r.message, 'base64'));
      bytes[0] |= 0x80;
      r.message = encodeBase64(bytes);
    }),
    accessor: Object.defineProperty(
      mutate(r => delete r.state),
      'state',
      { get: () => 'sent', enumerable: true },
    ),
  };
  for (const [name, input] of Object.entries(invalid)) {
    assert.throws(() => parseSolanaIntent(input), code('INVALID_INPUT'), name);
  }
  assert.throws(
    () => parseSolanaIntent(mutate(r => (r.format = 'p2p-offramp/solana-intent/v2'))),
    code('UNSUPPORTED_VERSION'),
  );
  // A well-formed signature that does not verify over the journaled message for the fee payer.
  assert.throws(() => parseSolanaIntent(mutate(r => (r.signature = otherSignature))), code('INTEGRITY_FAILURE'));
});

test('record-bound-to-network-program-genesis-pin', async () => {
  const { env, record } = await sentRecord();
  const parsed = parseSolanaIntent(record);
  const registry = changes => makeRegistry(changes);
  const rebind = (changes, terms = env.terms) => ok(bindSolanaTrade(registry(changes), bindingOf(terms), terms));
  assert.throws(
    () => verifyIntentForTrade(parseSolanaIntent({ ...structuredClone(record), genesisHash: key('g') }), env.trade),
    code('WRONG_CHAIN'),
  );
  assert.throws(
    () => verifyIntentForTrade(parseSolanaIntent({ ...structuredClone(record), programId: key('p') }), env.trade),
    code('WRONG_CHAIN'),
  );
  const repinned = rebind({
    deployment: { runtime: { kind: 'solana-program', programDataSha256: 'ab'.repeat(32), upgradeAuthority: null } },
  });
  assert.throws(() => verifyIntentForTrade(parsed, repinned), code('WRONG_CHAIN'));
  const otherTerms = makeTerms('native', {
    seller: env.terms.seller,
    buyer: env.terms.buyer,
    sellerNonce: 'cd'.repeat(32),
  });
  assert.throws(() => verifyIntentForTrade(parsed, rebind({}, otherTerms)), code('CONFLICT'));
  assert.throws(
    () => verifyIntentForTrade(parseSolanaIntent({ ...structuredClone(record), escrow: key('e') }), env.trade),
    code('INTEGRITY_FAILURE'),
  );
});

test('durable-nonce-message-refused-on-restore', async () => {
  const { env, record } = await sentRecord();
  // Same fee payer, blockhash and release, but prefixed by System AdvanceNonceAccount; re-signed by the seller so
  // only the shape check can catch it.
  const { compileLegacyMessage } = await import('../src/message.ts');
  const { buildRelease } = await import('../src/instructions.ts');
  const { ed25519 } = await import('@noble/curves/ed25519.js');
  const { SELLER } = await import('./lifecycle-support.mjs');
  const nonce = {
    programId: '11111111111111111111111111111111',
    accounts: [
      { pubkey: key('nonce-account'), isSigner: false, isWritable: true },
      { pubkey: 'SysvarRecentB1ockHashes11111111111111111111', isSigner: false, isWritable: false },
      { pubkey: SELLER.address, isSigner: true, isWritable: false },
    ],
    data: Uint8Array.of(4, 0, 0, 0),
  };
  const message = compileLegacyMessage(SELLER.address, [nonce, ok(buildRelease(env.trade))], record.blockhash);
  assert.equal(parseLegacyMessage(message).header.numRequiredSignatures, 1);
  const tampered = {
    ...structuredClone(record),
    message: encodeBase64(message),
    signature: base58Encode(ed25519.sign(message, SELLER.seed)),
  };
  const parsed = parseSolanaIntent(tampered);
  assert.throws(() => verifyIntentForTrade(parsed, env.trade), code('INVALID_INPUT'));
});

test('transition-table-and-immutability', async () => {
  const { record } = await sentRecord();
  const sent = parseSolanaIntent(record);
  for (const state of ['prepared', 'signed', 'sendMarked', 'sent', 'unknown', 'cancelled']) {
    assert.throws(() => transitionIntent(sent, state, 1), code('CONFLICT'), state);
  }
  const dropped = transitionIntent(sent, 'dropped', 5);
  assert.equal(dropped.updatedAt, sent.updatedAt);
  assert.equal(dropped.sendMarkedAt, sent.sendMarkedAt);
  for (const state of Object.keys(SOLANA_TRANSITIONS)) {
    assert.throws(() => transitionIntent(dropped, state, 1), code('CONFLICT'), `dropped -> ${state}`);
  }
  assert.throws(() => transitionIntent(sent, 'finalized', 1, { signature: sent.signature }), code('CONFLICT'));
  const finalized = transitionIntent(sent, 'finalized', sent.updatedAt + 9, { outcome: { slot: '500', err: null } });
  assert.equal(finalized.updatedAt, sent.updatedAt + 9);
  assert.throws(
    () => transitionIntent(sent, 'failed', 1, { outcome: { slot: '500', err: null } }),
    code('INVALID_INPUT'),
  );
  assert.deepEqual(SOLANA_TRANSITIONS.sendMarked, ['sent', 'unknown', 'finalized', 'failed', 'dropped']);
  assert.ok(!SOLANA_TRANSITIONS.sendMarked.includes('cancelled'), 'a marked intent is never cancelled');
});

test('admission-rule', async () => {
  const { record } = await sentRecord();
  const sent = parseSolanaIntent(record);
  const next = parseSolanaIntent({
    ...structuredClone(record),
    intentId: 'A'.repeat(43),
    state: 'prepared',
    signature: null,
    sendMarkedAt: null,
  });
  assert.throws(() => admitIntent([sent], next), code('CONFLICT'));
  const dropped = transitionIntent(sent, 'dropped', 1);
  assert.throws(() => admitIntent([dropped], next), code('CONFLICT'));
  const successor = parseSolanaIntent({ ...structuredClone(next), replacementOf: dropped.intentId });
  admitIntent([dropped], successor);
  assert.throws(
    () =>
      admitIntent(
        [dropped, parseSolanaIntent({ ...structuredClone(successor), intentId: 'E'.repeat(43), state: 'cancelled' })],
        parseSolanaIntent({ ...structuredClone(successor), intentId: 'I'.repeat(43) }),
      ),
    code('CONFLICT'),
  );
  const finalized = transitionIntent(sent, 'finalized', 1, { outcome: { slot: '9', err: null } });
  admitIntent([finalized], next);
  assert.throws(
    () => admitIntent([finalized], parseSolanaIntent({ ...structuredClone(next), replacementOf: finalized.intentId })),
    code('CONFLICT'),
  );
});
