import test from 'node:test';
import assert from 'node:assert/strict';

const api = await import('../src/ui/routes.ts').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

test('hash routing accepts only bounded local routes and opaque trade identifiers', () => {
  assert.equal(typeof api.parseRoute, 'function');
  for (const hash of ['', '#', '#/', '#/home']) assert.deepEqual(api.parseRoute(hash), { page: 'home' });
  for (const page of ['offers', 'recovery', 'settings']) assert.deepEqual(api.parseRoute(`#/${page}`), { page });
  assert.deepEqual(api.parseRoute('#/trade/Abc_0123456789-def'), { page: 'trade', localId: 'Abc_0123456789-def' });
  for (const hash of ['#/trade/', '#/trade/a', '#/trade/' + 'x'.repeat(65), '#/trade/../../settings', '#/offers?secret=value', '#/trade/%3Cscript%3E', '#/unknown', '#https://SECRET.invalid', '#/settings/']) {
    assert.deepEqual(api.parseRoute(hash), { page: 'unknown' });
  }
});

test('known profile validation rejects ambiguous or transformed identifiers', () => {
  assert.equal(typeof api.isProfileId, 'function');
  assert.equal(api.isProfileId('a'.repeat(32)), true);
  for (const value of ['a'.repeat(31), 'A'.repeat(32), 'a'.repeat(32) + ' ', '../profile', 'https://SECRET.invalid']) assert.equal(api.isProfileId(value), false);
});

test('UI error messages are fixed and never reflect diagnostics or arbitrary codes', () => {
  assert.equal(typeof api.errorMessage, 'function');
  assert.match(api.errorMessage('AUTHENTICATION_FAILED'), /passphrase/i);
  for (const value of ['<script>SECRET</script>', 'https://SECRET.invalid', undefined, { message: 'SECRET' }]) {
    assert.equal(api.errorMessage(value), api.errorMessage('PROTOCOL_ERROR'));
    assert.doesNotMatch(api.errorMessage(value), /SECRET|https:/);
  }
});
