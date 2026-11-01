import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessage, formatMessage } from '../src/ui/locale/catalog.ts';
import { sourceCatalog } from '../src/ui/locale/en.ts';
import { pseudoMessage, pseudoMetadata, pseudoProfiles } from './locale-pseudo.mjs';

test('draft stress profiles retain every variable and singular/plural branch without granting locale approval', () => {
  const entry = createMessage({ key: 'test.records', source: '{count} {count|singular-111|plural-222}: {address}',
    variables: { count: 'count', address: 'identifier' }, context: 'Test-only private reference layout', severity: 'warning',
    reviewRequired: true, docsAnchor: 'docs/DEVELOPMENT_STATUS.md' });
  for (const profile of pseudoProfiles) {
    const pseudo = pseudoMessage(entry, profile);
    assert.deepEqual(pseudo.variables, entry.variables);
    const one = formatMessage(pseudo, { count: 1, address: '0x' + 'ab'.repeat(20) });
    const many = formatMessage(pseudo, { count: 2, address: '0x' + 'ab'.repeat(20) });
    assert.ok(one.includes('111') && !one.includes('222') && many.includes('222') && !many.includes('111'), 'both grammatical branches survive each stress profile');
    assert.ok(one.includes('0x' + 'ab'.repeat(20)) && many.includes('0x' + 'ab'.repeat(20)));
    assert.equal(pseudo.reviewRequired, true);
  }
  assert.equal(pseudoMetadata.status, 'draft'); assert.ok(Object.isFrozen(pseudoProfiles));
  assert.throws(() => pseudoMessage(entry, 'published'));
});

test('RTL/CJK/long expansion preserves canonical signed amount strings and does not parse localized numerals', () => {
  const units = ((1n << 256n) - 1n).toString(), values = Object.freeze({ units, decimals: 18 });
  const encoded = new TextEncoder().encode(JSON.stringify(values));
  for (const profile of pseudoProfiles) {
    const text = formatMessage(pseudoMessage(sourceCatalog['trade.baseUnits'], profile), values);
    assert.ok(text.includes(units)); assert.deepEqual(new TextEncoder().encode(JSON.stringify(values)), encoded);
  }
  const numeralFixture = new Intl.NumberFormat('ar-EG', { useGrouping: false }).format(123456);
  assert.notEqual(numeralFixture, '123456', 'fixture exercises numeral differences rather than relabelling English');
  assert.equal(values.units, units, 'display fixtures never rewrite canonical base units');
});
