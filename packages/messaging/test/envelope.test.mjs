import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeMessage, decodeMessage, MAX_TEXT_BYTES, MAX_MESSAGE_BYTES } from '../index.ts';

const binding = { chain: 'evm', networkId: 'local-evm', deploymentId: 'basic-v1', tradeId: 'ab'.repeat(32) };
const message = changes => ({ format: 'p2p-offramp-message', version: 1, binding, termsHash: binding.tradeId,
  messageId: '12'.repeat(16), sender: '34'.repeat(32), recipient: '56'.repeat(32), kind: 'text', createdAt: 1, body: 'inert <script>text</script>', ...changes });
const ok = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.value; };
const bad = (result, code) => { assert.equal(result.ok, false); assert.equal(result.error.code, code); assert.doesNotMatch(JSON.stringify(result), /SECRET|private|script>/); };
const bytes = text => new TextEncoder().encode(text);

test('text envelope has deterministic field order and detached immutable data; markup stays inert data', () => {
  const value = message(), first = ok(encodeMessage(value));
  const decoded = ok(decodeMessage(first, { binding, sender: value.sender, recipient: value.recipient }));
  assert.equal(new TextDecoder().decode(first), JSON.stringify(value));
  assert.deepEqual(ok(encodeMessage(decoded)), first);
  assert.ok(Object.isFrozen(decoded)); assert.ok(Object.isFrozen(decoded.binding));
  value.body = 'changed'; assert.equal(decoded.body, 'inert <script>text</script>');
  first.fill(0); assert.equal(decoded.body, 'inert <script>text</script>');
});

test('wrong versions/kinds/fields/identity/bindings and hostile object inputs fail closed', () => {
  for (const change of [{ version: 2 }, { kind: 'terms' }, { kind: 'receipt-status' }]) {
    bad(encodeMessage(message(change)), change.version ? 'UNSUPPORTED_VERSION' : 'UNSUPPORTED_PROVIDER');
  }
  for (const change of [{ kind: 'unknown' }, { extra: 1 }, { messageId: '00' }, { sender: message().recipient }, { termsHash: 'cd'.repeat(32) },
    { createdAt: NaN }, { createdAt: 1.5 }, { body: '' }, { body: '\ud800' }]) bad(encodeMessage(message(change)), 'INVALID_INPUT');
  const getter = message(); Object.defineProperty(getter, 'body', { get() { assert.fail('getter must not run'); }, enumerable: true });
  bad(encodeMessage(getter), 'INVALID_INPUT');
  const revoked = Proxy.revocable({}, {}); revoked.revoke(); bad(encodeMessage(revoked.proxy), 'INVALID_INPUT');
  bad(decodeMessage(ok(encodeMessage(message())), { binding: { ...binding, tradeId: 'cd'.repeat(32) }, sender: message().sender, recipient: message().recipient }), 'UNAUTHORIZED');
  bad(decodeMessage(ok(encodeMessage(message())), { binding, sender: message().recipient, recipient: message().sender }), 'UNAUTHORIZED');
});

test('byte/UTF-8/depth/duplicate-key boundaries precede native messaging work', () => {
  ok(encodeMessage(message({ body: 'x'.repeat(MAX_TEXT_BYTES) })));
  bad(encodeMessage(message({ body: 'x'.repeat(MAX_TEXT_BYTES + 1) })), 'LIMIT_EXCEEDED');
  bad(encodeMessage(message({ body: '\u0000'.repeat(MAX_TEXT_BYTES) })), 'LIMIT_EXCEEDED');
  bad(decodeMessage(new Uint8Array(MAX_MESSAGE_BYTES + 1)), 'LIMIT_EXCEEDED');
  bad(decodeMessage(new Uint8Array([0xff])), 'INVALID_INPUT');
  bad(decodeMessage(bytes(JSON.stringify(message()).replace('"version":1', '"version":1,"version":1'))), 'INVALID_INPUT');
  bad(decodeMessage(bytes(JSON.stringify(message({ body: { deeper: { and: { deeper: 1 } } } })))), 'INVALID_INPUT');
  bad(decodeMessage(new Uint16Array(32)), 'INVALID_INPUT');
});

test('oversized hostile text is refused before UTF-8 allocation', t => {
  const oversized = 'x'.repeat(MAX_TEXT_BYTES + 1), encode = TextEncoder.prototype.encode;
  t.mock.method(TextEncoder.prototype, 'encode', function (value) {
    assert.notEqual(value, oversized, 'oversized body must not reach UTF-8 allocation'); return encode.call(this, value);
  });
  bad(encodeMessage(message({ body: oversized })), 'LIMIT_EXCEEDED');
});
