import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../src/errors.ts').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
const id = 'ab'.repeat(16);
const fn = name => { assert.equal(typeof api[name], 'function', `missing ${name}`); return api[name]; };
test('core errors are fixed, operation-scoped and classified by recovery action', () => {
  const make = fn('createCoreError');
  const expected = { INVALID_INPUT:'edit-input', UNSUPPORTED_VERSION:'export', UNSUPPORTED_PROVIDER:'change-provider', WRONG_CHAIN:'reconnect', UNAUTHORIZED:'reconnect', USER_REJECTED:'none', LOCKED:'unlock', CONFLICT:'reload', UNAVAILABLE:'change-provider', TIMEOUT:'change-provider', CANCELLED:'none', LIMIT_EXCEEDED:'none', INTEGRITY_FAILURE:'change-provider', BROADCAST_UNKNOWN:'reconcile', EXPIRED:'edit-input' };
  for (const [code, action] of Object.entries(expected)) {
    const error = make(code, { operationId:id, readOnly:true });
    assert.deepEqual(Object.keys(error).sort(), ['action','code','correlationId','messageKey','retryable']);
    assert.equal(error.action, action); assert.equal(error.correlationId,id);
    assert.equal(error.retryable, ['TIMEOUT','UNAVAILABLE'].includes(code));
    assert.equal(error.messageKey, `core.error.${code.toLowerCase()}`);
    assert.equal(make(code, { operationId:id, readOnly:false }).retryable,false);
  }
});
test('unknown nested errors and hostile reflection never leak diagnostics', () => {
  const normalize = fn('normalizeError');
  const secret = 'SECRET https://rpc.test/?key=PRIVATE';
  for (const input of [new Error(secret), {message:secret,cause:{password:secret}}, {get code(){throw Error(secret);}}, new Proxy({}, {getOwnPropertyDescriptor(){throw Error(secret);}}), null]) {
    const error = normalize(input,{operationId:id,phase:'read'});
    assert.equal(error.code,'UNAVAILABLE'); assert.doesNotMatch(JSON.stringify(error),/SECRET|PRIVATE|rpc.test/);
  }
  assert.equal(normalize({code:'CONFLICT',message:secret},{operationId:id,phase:'prepare'}).code,'CONFLICT');
  assert.equal(normalize({code:4001,message:secret},{operationId:id,phase:'prepare'}).code,'USER_REJECTED');
});
test('any failure after a send-capable boundary remains uncertain and cannot retry', () => {
  const normalize = fn('normalizeError');
  for (const input of [new Error('SECRET'), {code:4001}, {code:'TIMEOUT'}, {code:'CANCELLED'}]) {
    const error = normalize(input,{operationId:id,phase:'send-started'});
    assert.equal(error.code,'BROADCAST_UNKNOWN'); assert.equal(error.action,'reconcile'); assert.equal(error.retryable,false);
  }
});
test('invalid correlation identifiers are replaced with fresh bounded random identifiers', () => {
  const make = fn('createCoreError');
  const a=make('INVALID_INPUT',{operationId:'SECRET',readOnly:true});
  const b=make('INVALID_INPUT',{operationId:'SECRET',readOnly:true});
  assert.match(a.correlationId,/^[a-f0-9]{32}$/); assert.notEqual(a.correlationId,b.correlationId); assert.doesNotMatch(JSON.stringify(a),/SECRET/);
});
