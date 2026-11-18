// D9-equivalent lifecycle through the composed client, on fakes: crash points, restore, expiry, hostile RPC.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SEND_CONFIG, summarizeTransactionError } from '../src/submit.ts';
import { connected, makeCluster, makeJournal, MARGINS, setupClient } from './lifecycle-support.mjs';
import { error, ok } from './support.mjs';

const sendCount = env => env.cluster.calls.filter(call => call.method === 'sendTransaction').length;
const stateOf = (env, intentId) => env.journalFake.records(env.binding).find(r => r.intentId === intentId)?.state;
const onlyRecord = env => {
  const records = env.journalFake.records(env.binding);
  assert.equal(records.length, 1);
  return records[0];
};
/** Lands the last sent transaction at finalized and applies its escrow effect. */
function landRelease(env, signature, err = null) {
  env.cluster.advance(2);
  env.cluster.land(signature, { err });
  if (err === null) env.cluster.setEscrow({ state: 1 });
  env.cluster.advance(1);
}
const expire = (env, record) => {
  const target = Number(record.lastValidBlockHeight) + 1;
  env.cluster.advance(target - env.cluster.height);
};

test('happy-path-marker-before-send-and-reconcile', async () => {
  const env = setupClient('native');
  const seller = await connected(env, 'seller');
  let markerSeenBySend = false;
  env.cluster.handle = input => {
    if (input.method === 'sendTransaction') markerSeenBySend = onlyRecord(env).state === 'sendMarked';
  };
  const submission = ok(await env.client.release(env.trade, seller));
  assert.equal(submission.state, 'sent');
  assert.ok(markerSeenBySend, 'the marker was durable when sendTransaction was called');
  assert.deepEqual(env.journalFake.writes, ['prepared', 'signed', 'sendMarked', 'sent']);
  const send = env.cluster.calls.find(call => call.method === 'sendTransaction');
  assert.deepEqual(send.params[1], { encoding: 'base64', skipPreflight: true, maxRetries: 0 });
  assert.deepEqual(SEND_CONFIG, send.params[1]);
  // Not landed yet: reconcile changes nothing and never resends.
  for (let i = 0; i < 3; i++) ok(await env.client.reconcile(env.trade));
  assert.equal(stateOf(env, submission.intentId), 'sent');
  landRelease(env, submission.signature);
  const [record] = ok(await env.client.reconcile(env.trade));
  assert.equal(record.state, 'finalized');
  assert.equal(record.outcome.err, null);
  assert.ok(record.sendMarkedAt !== null, 'the marker is never cleared');
  assert.equal(sendCount(env), 1);
});

test('crash-after-sign-before-marker', async () => {
  const env = setupClient('native', {
    journal: { hooks: { before: record => (record.state === 'sendMarked' ? 'throw' : undefined) } },
  });
  const seller = await connected(env, 'seller');
  error(await env.client.release(env.trade, seller), 'UNAVAILABLE');
  assert.equal(sendCount(env), 0);
  assert.equal(onlyRecord(env).state, 'signed');
  // Restart: same profile, so the never-marked preparation is known not sent by this profile.
  env.journalFake.hooks.before = undefined;
  const restarted = setupClient('native', {
    terms: env.terms,
    cluster: env.cluster,
    journalFake: env.journalFake,
    seed: 'r',
  });
  const [record] = ok(await restarted.client.recover(restarted.trade));
  assert.equal(record.state, 'cancelled');
  assert.equal(record.sendMarkedAt, null);
  const again = ok(await restarted.client.release(restarted.trade, await connected(restarted, 'seller')));
  assert.equal(again.state, 'sent');
  assert.equal(sendCount(env), 1);
});

test('crash-after-marker-before-send-never-resends', async () => {
  const hooks = { after: record => (record.state === 'sendMarked' ? 'throw' : undefined) };
  const env = setupClient('native', { journal: { hooks } });
  error(await env.client.release(env.trade, await connected(env, 'seller')), 'UNAVAILABLE');
  assert.equal(sendCount(env), 0);
  hooks.after = undefined;
  const restarted = setupClient('native', {
    terms: env.terms,
    cluster: env.cluster,
    journalFake: env.journalFake,
    seed: 'r',
  });
  const session = await connected(restarted, 'seller');
  const [marked] = ok(await restarted.client.recover(restarted.trade));
  assert.equal(marked.state, 'sendMarked', 'a marked intent is possibly sent: never cancelled');
  error(await restarted.client.release(restarted.trade, session), 'CONFLICT');
  // Expiry boundary: finalized height == lastValidBlockHeight is still open.
  restarted.cluster.advance(Number(marked.lastValidBlockHeight) - restarted.cluster.height);
  assert.equal(restarted.cluster.height, Number(marked.lastValidBlockHeight));
  assert.equal(ok(await restarted.client.reconcile(restarted.trade))[0].state, 'sendMarked');
  restarted.cluster.advance(1);
  // Expired, but the node's ledger history does not reach back to the blockhash slot: still uncertain.
  restarted.cluster.firstAvailableBlock = Number(marked.blockhashSlot) + 1;
  assert.equal(ok(await restarted.client.reconcile(restarted.trade))[0].state, 'sendMarked');
  restarted.cluster.firstAvailableBlock = Number(marked.blockhashSlot);
  const [dropped] = ok(await restarted.client.reconcile(restarted.trade));
  assert.equal(dropped.state, 'dropped');
  assert.equal(sendCount(env), 0, 'never sent, never resent');
  error(await restarted.client.release(restarted.trade, session), 'CONFLICT');
  const rebuilt = ok(await restarted.client.release(restarted.trade, session, { rebuildOf: dropped.intentId }));
  const rebuiltRecord = env.journalFake.records(env.binding).find(r => r.intentId === rebuilt.intentId);
  assert.equal(rebuiltRecord.replacementOf, dropped.intentId);
  assert.notEqual(rebuiltRecord.blockhash, dropped.blockhash);
  error(await restarted.client.release(restarted.trade, session, { rebuildOf: dropped.intentId }), 'CONFLICT');
});

test('send-throws-timeout-or-odd-answer-is-unknown', async () => {
  const behaviors = {
    throws: () => {
      throw new Error('SECRET provider detail');
    },
    timeout: () => new Promise(() => {}),
    otherSignature: () => '5'.repeat(88),
    malformed: () => ({ then: () => assert.fail('then looked up') }),
  };
  for (const [name, behavior] of Object.entries(behaviors)) {
    const env = setupClient('native', { clusterOptions: { sendBehavior: behavior }, timeoutMs: 50 });
    const submission = ok(await env.client.release(env.trade, await connected(env, 'seller')));
    assert.equal(submission.state, 'unknown', name);
    assert.equal(sendCount(env), 1, name);
    for (let i = 0; i < 3; i++) ok(await env.client.reconcile(env.trade));
    assert.equal(sendCount(env), 1, `${name}: no resend`);
    assert.equal(stateOf(env, submission.intentId), 'unknown');
    // It landed after all.
    landRelease(env, submission.signature);
    assert.equal(ok(await env.client.reconcile(env.trade))[0].state, 'finalized', name);
  }
});

test('restore-from-backup-with-marker-reconciles-without-resend', async () => {
  const env = setupClient('native');
  const submission = ok(await env.client.release(env.trade, await connected(env, 'seller')));
  const backup = env.journalFake.backup();
  landRelease(env, submission.signature);
  const restoredJournal = makeJournal({ store: backup, profileId: 'b'.repeat(32) });
  const restored = setupClient('native', {
    terms: env.terms,
    cluster: env.cluster,
    journalFake: restoredJournal,
    seed: 'r',
  });
  const [record] = ok(await restored.client.recover(restored.trade));
  assert.equal(record.state, 'finalized');
  assert.equal(sendCount(env), 1);
});

test('restored-pre-marker-records-are-possibly-sent', async () => {
  // A backup taken after signing (signature journaled, no marker), restored into another profile.
  const env = setupClient('native', {
    journal: { hooks: { before: record => (record.state === 'sendMarked' ? 'throw' : undefined) } },
  });
  error(await env.client.release(env.trade, await connected(env, 'seller')), 'UNAVAILABLE');
  const signed = onlyRecord(env);
  const restoredJournal = makeJournal({ store: env.journalFake.backup(), profileId: 'c'.repeat(32) });
  const restored = setupClient('native', {
    terms: env.terms,
    cluster: env.cluster,
    journalFake: restoredJournal,
    seed: 'r',
  });
  assert.equal(ok(await restored.client.recover(restored.trade))[0].state, 'signed', 'not cancelled: possibly sent');
  error(await restored.client.release(restored.trade, await connected(restored, 'seller')), 'CONFLICT');
  // It is reconciled by its signature: here someone else broadcast it and it landed.
  landRelease(env, signed.signature);
  assert.equal(ok(await restored.client.reconcile(restored.trade))[0].state, 'finalized');

  // A prepared record (no signature) from a restore is settled only by blockhash expiry.
  const fresh = setupClient('native', {
    seed: 'p',
    journal: { hooks: { before: record => (record.state === 'signed' ? 'throw' : undefined) } },
  });
  error(await fresh.client.release(fresh.trade, await connected(fresh, 'seller')), 'UNAVAILABLE');
  const prepared = onlyRecord(fresh);
  assert.equal(prepared.state, 'cancelled', 'the same instance cancels its own failed preparation');
  const store = fresh.journalFake.backup();
  const record = [...[...store.values()][0].records.values()][0];
  Object.assign(record, { state: 'prepared' });
  const restoredPrepared = setupClient('native', {
    terms: fresh.terms,
    cluster: fresh.cluster,
    seed: 'q',
    journalFake: makeJournal({ store, profileId: 'd'.repeat(32) }),
  });
  assert.equal(ok(await restoredPrepared.client.recover(restoredPrepared.trade))[0].state, 'prepared');
  expire(restoredPrepared, prepared);
  assert.equal(ok(await restoredPrepared.client.reconcile(restoredPrepared.trade))[0].state, 'dropped');
});

test('hostile-rpc-status-and-heights', async () => {
  // A finalized "success" whose effect the finalized escrow read does not show is refused, not recorded.
  const lie = setupClient('native');
  const sent = ok(await lie.client.release(lie.trade, await connected(lie, 'seller')));
  lie.cluster.advance(2);
  lie.cluster.land(sent.signature);
  lie.cluster.advance(1);
  error(await lie.client.reconcile(lie.trade), 'INTEGRITY_FAILURE');
  assert.equal(stateOf(lie, sent.intentId), 'sent');

  const cases = {
    'expired height but blockhash still valid': (env, record) => {
      expire(env, record);
      env.cluster.handle = input =>
        input.method === 'isBlockhashValid' ? { context: { slot: env.cluster.slot }, value: true } : undefined;
    },
    'finalized height goes backwards': env => {
      env.cluster.handle = input => (input.method === 'getBlockHeight' ? 3 : undefined);
    },
    'two statuses for one signature': env => {
      env.cluster.handle = input =>
        input.method === 'getSignatureStatuses'
          ? { context: { slot: env.cluster.slot }, value: [null, null] }
          : undefined;
    },
    'status before its blockhash': (env, record) => {
      env.cluster.land(record.signature, { slot: Number(record.blockhashSlot) });
    },
    'finalized but with confirmations': (env, record) => {
      env.cluster.land(record.signature);
      env.cluster.statuses.get(record.signature).confirmations = 3;
    },
    'status slot above context': (env, record) => {
      env.cluster.land(record.signature, { slot: env.cluster.slot + 50 });
    },
    'unknown confirmation level': (env, record) => {
      env.cluster.land(record.signature);
      env.cluster.statuses.get(record.signature).confirmationStatus = 'rooted';
    },
    'oversized status list': env => {
      env.cluster.handle = input =>
        input.method === 'getSignatureStatuses'
          ? { context: { slot: env.cluster.slot }, value: new Array(100_000).fill(null) }
          : undefined;
    },
    'accessor in response': env => {
      env.cluster.handle = input =>
        input.method === 'getBlockHeight'
          ? undefined
          : input.method === 'getSignatureStatuses'
            ? Object.defineProperty({ value: [null] }, 'context', {
                get: () => assert.fail('getter ran'),
                enumerable: true,
              })
            : undefined;
    },
  };
  for (const [name, setup] of Object.entries(cases)) {
    const env = setupClient('native');
    const submission = ok(await env.client.release(env.trade, await connected(env, 'seller')));
    env.cluster.advance(2);
    // A first reconcile raises the height floor for the "backwards" case.
    ok(await env.client.reconcile(env.trade));
    setup(env, onlyRecord(env));
    error(await env.client.reconcile(env.trade), 'INTEGRITY_FAILURE');
    assert.equal(stateOf(env, submission.intentId), 'sent', name);
    assert.equal(sendCount(env), 1, name);
  }
});

test('hostile-rpc-at-prepare-signs-nothing', async () => {
  const cases = {
    'lastValid not height+150': env => input =>
      input.method === 'getLatestBlockhash'
        ? {
            context: { slot: env.cluster.slot },
            value: { blockhash: env.cluster.hashOf(env.cluster.slot), lastValidBlockHeight: 10 ** 9 },
          }
        : undefined,
    'blockhash differs from its block': env => input =>
      input.method === 'getLatestBlockhash'
        ? {
            context: { slot: env.cluster.slot },
            value: { blockhash: env.cluster.hashOf(1), lastValidBlockHeight: env.cluster.height + 150 },
          }
        : undefined,
    'blockhash older than the snapshot': env => input =>
      input.method === 'getLatestBlockhash'
        ? {
            context: { slot: 5 },
            value: { blockhash: env.cluster.hashOf(5), lastValidBlockHeight: env.cluster.heightOf(5) + 150 },
          }
        : undefined,
    'genesis changes after the read': env => {
      let reads = 0;
      return input => (input.method === 'getGenesisHash' && ++reads > 2 ? 'x'.repeat(44) : undefined);
    },
  };
  for (const [name, handler] of Object.entries(cases)) {
    const env = setupClient('native');
    env.cluster.handle = handler(env);
    const result = await env.client.release(env.trade, await connected(env, 'seller'));
    assert.equal(result.ok, false, name);
    assert.equal(env.walletFake.calls.sign.length, 0, `${name}: nothing handed to the wallet`);
    assert.equal(env.journalFake.records(env.binding).length, 0, name);
  }
});

test('wallet-substitution-and-rejection-cancel-locally', async () => {
  const substituted = setupClient('native', {
    wallet: { mutate: message => Uint8Array.from([...message.slice(0, -1), 7]) },
  });
  error(
    await substituted.client.release(substituted.trade, await connected(substituted, 'seller')),
    'INTEGRITY_FAILURE',
  );
  assert.equal(sendCount(substituted), 0);
  assert.equal(onlyRecord(substituted).state, 'cancelled');
  const rejected = setupClient('native', { wallet: { rejectSign: true } });
  error(await rejected.client.release(rejected.trade, await connected(rejected, 'seller')), 'USER_REJECTED');
  assert.equal(onlyRecord(rejected).state, 'cancelled');
  // A wallet session for another role or trade is refused before anything is prepared.
  const env = setupClient('native');
  const buyer = await connected(env, 'buyer');
  error(await env.client.release(env.trade, buyer), 'UNAUTHORIZED');
  error(await env.client.release(env.trade, { ...(await connected(env, 'seller')) }), 'UNAUTHORIZED');
  assert.equal(env.journalFake.records(env.binding).length, 0);
});

test('frozen-destination-payout-fails-release-stays-final', async () => {
  const env = setupClient('spl');
  const seller = await connected(env, 'seller');
  const release = ok(await env.client.release(env.trade, seller));
  error(await env.client.payout(env.trade, seller), 'CONFLICT');
  landRelease(env, release.signature);
  assert.equal(ok(await env.client.reconcile(env.trade))[0].state, 'finalized');
  const payout = ok(await env.client.payout(env.trade, seller));
  const message = Buffer.from(env.cluster.sent.at(-1)[0], 'base64');
  assert.equal(message[0], 1);
  env.cluster.advance(2);
  env.cluster.land(payout.signature, { err: { InstructionError: [1, { Custom: 6016 }] } });
  env.cluster.advance(1);
  const failed = ok(await env.client.reconcile(env.trade)).find(r => r.intentId === payout.intentId);
  assert.equal(failed.state, 'failed');
  assert.equal(failed.outcome.err, 'InstructionError:1:Custom:6016');
  const snapshot = ok(await env.client.read(env.trade));
  assert.deepEqual([snapshot.escrow.state, snapshot.escrow.paidOut, snapshot.payout], ['released', false, 'pending']);
  // Retryable: a new payout intent is admitted (failed is terminal) and lands.
  const retry = ok(await env.client.payout(env.trade, await connected(env, 'buyer')));
  env.cluster.advance(2);
  env.cluster.land(retry.signature);
  env.cluster.setEscrow({ state: 1, paid: 1 });
  env.cluster.advance(1);
  assert.equal(ok(await env.client.reconcile(env.trade)).find(r => r.intentId === retry.intentId).state, 'finalized');
  assert.equal(sendCount(env), 3);
});

test('rent-shortfall-payout', async () => {
  const env = setupClient('native');
  const amount = Number(env.terms.amountBaseUnits);
  env.cluster.setEscrow({ state: 1 }, amount + 2_436_000 - 4_321);
  const buyer = await connected(env, 'buyer');
  error(await env.client.payout(env.trade, buyer), 'LIMIT_EXCEEDED');
  assert.equal(env.journalFake.records(env.binding).length, 0);
  ok(await env.client.payout(env.trade, buyer, { maxRentTopUpLamports: '5000' }));
  const wire = Buffer.from(env.cluster.sent.at(-1)[0], 'base64');
  assert.ok(
    wire.includes(Buffer.from([2, 0, 0, 0, 0xe1, 0x10, 0, 0, 0, 0, 0, 0])),
    'transfer of exactly 4321 lamports',
  );
});

test('margins-required-and-dispose', async () => {
  assert.throws(() => setupClient('native', { margins: { submitMarginSeconds: '60' } }));
  const env = setupClient('native');
  env.client.dispose();
  error(await env.client.read(env.trade), 'CANCELLED');
  error(await env.client.connect(env.trade, 'seller'), 'CANCELLED');
  assert.deepEqual(MARGINS, { submitMarginSeconds: '60', releaseMarginSeconds: '300' });
});

test('error-label-summary', () => {
  assert.equal(
    summarizeTransactionError({ InstructionError: [1, { Custom: 6016 }] }),
    'InstructionError:1:Custom:6016',
  );
  assert.equal(
    summarizeTransactionError({ InstructionError: [0, 'InvalidAccountData'] }),
    'InstructionError:0:InvalidAccountData',
  );
  assert.equal(
    summarizeTransactionError({ InstructionError: [0, { BorshIoError: 'x' }] }),
    'InstructionError:0:Unrecognized',
  );
  assert.equal(summarizeTransactionError('BlockhashNotFound'), 'BlockhashNotFound');
  assert.equal(
    summarizeTransactionError({ InsufficientFundsForRent: { account_index: 2 } }),
    'InsufficientFundsForRent',
  );
  for (const odd of [{ a: 1, b: 2 }, ['x'], 'has space', { InstructionError: [999, 'X'] }, 5, { 'bad-key': 1 }]) {
    assert.equal(summarizeTransactionError(odd), 'Unrecognized', JSON.stringify(odd));
  }
  assert.ok(makeCluster);
});
