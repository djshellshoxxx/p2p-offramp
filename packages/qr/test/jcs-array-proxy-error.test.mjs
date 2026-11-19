import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, JcsError } from '../index.ts';

test('D6 JCS: a hostile array length descriptor must fail with a typed error', () => {
  const input = new Proxy([], {
    getOwnPropertyDescriptor(target, key) {
      if (key === 'length') throw new Error('untrusted length trap');
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  assert.throws(
    () => canonicalize(input),
    (error) => error instanceof JcsError && error.code === 'UNSUPPORTED_VALUE',
    'untrusted proxy errors must not escape the canonicalization boundary',
  );
});
