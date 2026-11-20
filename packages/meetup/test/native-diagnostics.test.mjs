import test from 'node:test';
import assert from 'node:assert/strict';
import { createDisclosureBudget } from '../src/disclosure-budget.ts';
import { createPolicyOwner, createPolicyVault } from '../src/policy-data.ts';
import { scope } from './support/policy-fixtures.mjs';

const diagnosticCases = [
  ['own data code', () => ({ ok: false, error: { code: 'CONFLICT' } }), 'CONFLICT'],
  ['code accessor', touch => ({ ok: false, error: { get code() { touch(); return 'CONFLICT'; } } })],
  ['wrapper accessor', touch => ({ ok: false, get error() { touch(); return { code: 'CONFLICT' }; } })],
  ['inherited code', () => ({ ok: false, error: Object.create({ code: 'CONFLICT' }) })],
  ['inherited wrapper', () => Object.assign(Object.create({ error: { code: 'CONFLICT' } }), { ok: false })],
  ['unknown code', () => ({ ok: false, error: { code: 'PRIVATE_DIAGNOSTIC' } })],
  ['non-string code', touch => ({ ok: false, error: { code: { toString() { touch(); return 'CONFLICT'; } } } })],
  ['code descriptor trap', () => ({ ok: false, error: new Proxy({ code: 'CONFLICT' }, { getOwnPropertyDescriptor() { throw Error('PRIVATE_DIAGNOSTIC'); } }) })],
  ['wrapper descriptor trap', () => new Proxy({ ok: false, error: { code: 'CONFLICT' } }, { getOwnPropertyDescriptor(target, key) { if (key === 'error') throw Error('PRIVATE_DIAGNOSTIC'); return Reflect.getOwnPropertyDescriptor(target, key); } })],
];

for (const kind of ['disclosure budget', 'policy vault']) test(`${kind}: returned native diagnostics require own data`, async t => {
  for (const [name, create, expected = 'LEDGER_UNAVAILABLE'] of diagnosticCases) await t.test(name, async () => {
    let reads = 0, writes = 0;
    const denied = create(() => { reads++; });
    const vault = { captureSession: () => denied, read() { writes++; throw Error('PRIVATE_UNEXPECTED_READ'); },
      list() { writes++; throw Error('PRIVATE_UNEXPECTED_LIST'); }, commit() { writes++; throw Error('PRIVATE_UNEXPECTED_WRITE'); } };
    const owner = createPolicyOwner(scope, () => true);
    try {
      const result = kind === 'disclosure budget' ? createDisclosureBudget({ vault, session: {},
        coordinator: { isLedgerProfile: () => true, mayProvisionFresh: () => false, withExclusive() { throw Error('PRIVATE_UNEXPECTED_LOCK'); } },
        isOwnerCurrent: () => true, isUserGesture: () => false,
      }) : await owner.run(() => createPolicyVault(owner, { vault, session: {}, recordId: 'a'.repeat(32), isStorageCurrent: () => true }));
      assert.equal(reads, 0); assert.equal(writes, 0);
      assert.deepEqual(result, { ok: false, error: { code: expected } });
      assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
    } finally { owner.close(); }
  });
});
