// Observe defensive allocation against actual source using labelled lifecycle fixtures.
import assert from 'node:assert/strict';
import { keys, secret, options, loadExchange } from './lifecycle-harness.mjs';
const harness = await loadExchange();
const ex = harness.createTermsExchange(options({ publicKey: async () => keys.self }, keys.self));
const incoming = harness.incoming('take-request', keys.seller, keys.self,
  { buyerAddress: keys.addressA, buyerMessagingKey: keys.seller }, null, keys.self);
const taken = await ex.receive(incoming, secret); assert.equal(taken.ok, true);
const Native = Uint8Array, input = new Native(1024 * 1024); let copies = 0, copiedBytes = 0;
globalThis.Uint8Array = new Proxy(Native, { construct(target, args) {
  if (args[0] instanceof Native && args[0].byteLength > 16384) { copies++; copiedBytes += args[0].byteLength; }
  return Reflect.construct(target, args, target);
} });
try {
  const result = await ex.offer(taken.value.sessionId, input, secret);
  console.log(JSON.stringify({ qualification: 'actual exchange source; mocked crypto/review; no network', result,
    inputBytes: input.byteLength, copies, copiedBytes, state: ex.session(taken.value.sessionId).state }, null, 2));
  assert.equal(result.ok, false); assert.equal(result.code, 'LIMIT_EXCEEDED');
  assert.equal(copies, process.argv.includes('--assert-safe') ? 0 : 1);
} finally { globalThis.Uint8Array = Native; ex.close(); harness.close(); }
