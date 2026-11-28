/** Test-only evidence assertion. Call with decoded records read from durable encrypted storage immediately before a fixture wallet send. */
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

function walletTransaction(intent) {
  const prepared = JSON.parse(intent.preparedRequest);
  assert.deepEqual(Object.keys(prepared).sort(), ['v', 'chainId', 'from', 'to', 'data', 'value', 'nonce', 'preparedAtBlock'].sort());
  assert.equal(prepared.v, 1);
  for (const field of ['from', 'to']) assert.match(prepared[field], /^0x[0-9a-f]{40}$/);
  assert.match(prepared.data, /^0x(?:[0-9a-f]{2})*$/);
  for (const field of ['chainId', 'value', 'nonce', 'preparedAtBlock']) assert.match(prepared[field], /^(0|[1-9][0-9]{0,77})$/);
  // Deliberately reconstruct independently of the application projector. Match the complete physical wallet call,
  // including the finite token approval's destination and value; extra or omitted EIP-1193 fields do not qualify.
  return { from: prepared.from, to: prepared.to, data: prepared.data, value: `0x${BigInt(prepared.value).toString(16)}`,
    nonce: `0x${BigInt(prepared.nonce).toString(16)}`, chainId: `0x${BigInt(prepared.chainId).toString(16)}` };
}

export function assertLocalnetSendMarked(intents, transaction, profileId) {
  const matching = intents.filter(intent => intent.state === 'broadcast-unknown' && intent.binding.chain === 'evm' &&
    intent.submission.chain === 'evm' && isDeepStrictEqual(walletTransaction(intent), transaction));
  assert.equal(matching.length, 1, 'one durable marker precedes the exact wallet transaction');
  const marker = matching[0];
  assert.equal(marker.version, 2, 'legacy history cannot prove a new send marker');
  assert.equal(marker.originProfileId, profileId, 'the current profile owns the new send marker');
  assert.ok(Number.isSafeInteger(marker.sendMarkedAt) && marker.sendMarkedAt >= 0 &&
    marker.sendMarkedAt >= marker.createdAt && marker.sendMarkedAt <= marker.updatedAt, 'the durable marker has a valid persisted timestamp');
  assert.equal(marker.account, transaction.from, 'the durable journal account matches the wallet send');
  assert.equal(marker.submission.nonce, BigInt(transaction.nonce).toString(), 'the durable journal nonce matches the wallet send');
  assert.equal(marker.submission.hash, null, 'the pre-send marker has no returned transaction hash');
  return marker;
}
