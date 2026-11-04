import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessage, formatMessage, validateLocale, LocaleError } from '../src/ui/locale/catalog.ts';
import { sourceCatalog, english } from '../src/ui/locale/en.ts';
import { createBundledLocaleStore, localeStore, messageGroup, mergeMessageViews } from '../src/ui/locale/runtime.ts';

const definition = (source, variables = { count: 'count', id: 'identifier' }) => ({ key: 'fixture.records', source,
  context: 'Compiled development fixture only', severity: 'warning', variables, reviewRequired: true,
  docsAnchor: 'docs/DEVELOPMENT_STATUS.md' });

test('locale formatting uses native numerals and isolates exact machine variables without mutating them', () => {
  const entry = createMessage(definition('{count} {count|record|records}: {id}'));
  const values = Object.freeze({ count: 2, id: '0x' + 'Ab'.repeat(20) });
  const text = formatMessage(entry, values, { locale: 'ar' });
  assert.ok(text.startsWith(new Intl.NumberFormat('ar-EG', { useGrouping: false }).format(2)));
  assert.ok(text.includes('\u2066' + values.id + '\u2069'));
  assert.deepEqual(values, { count: 2, id: '0x' + 'Ab'.repeat(20) });
  assert.equal(formatMessage(entry, values), `2 records: ${values.id}`, 'English source behavior stays exact');
});

test('bounded named plural branches use Intl categories and require an other branch', () => {
  const source = '{count} {count|zero=zero|one=one|two=two|few=few|many=many|other=other}';
  const entry = createMessage(definition(source, { count: 'count' }));
  for (const count of [0, 1, 2, 3, 11, 100]) {
    const category = new Intl.PluralRules('ar').select(count);
    assert.equal(formatMessage(entry, { count }, { locale: 'ar' }), `${new Intl.NumberFormat('ar-EG', { useGrouping: false }).format(count)} ${category}`);
  }
  const catalog = { [entry.key]: entry };
  assert.equal(validateLocale({ locale: 'ar', translator: null, reviewer: null, revision: 1, status: 'draft', messages: { [entry.key]: source } }, catalog).direction, 'rtl');
  assert.throws(() => validateLocale({ locale: 'ar', translator: null, reviewer: null, revision: 1, status: 'draft',
    messages: { [entry.key]: '{count} {count|one=one|few=few}' } }, catalog), error => error instanceof LocaleError);
  for (const bad of ['{count|one=x|one=y|other=z}', '{count|few=x}', '{count|unknown=x|other=z}'])
    assert.throws(() => createMessage(definition(bad, { count: 'count' })));
});

const texts = () => Object.fromEntries(Object.entries(sourceCatalog).map(([key, entry]) => [key, `[DRAFT ${entry.source}]`]));
const configuration = fixtures => ({ developmentFixtures: true, fixtures });
test('compiled draft fixture selection is coherent, persisted only by explicit choice and never funds approval', () => {
  const values = texts(), writes = [], preferences = { read: () => 'fixture-rtl', write: id => writes.push(id) };
  const store = createBundledLocaleStore(configuration([{ id: 'fixture-rtl', locale: 'ar', messages: values }]), preferences);
  assert.equal(store.getSnapshot().id, 'fixture-rtl'); assert.equal(store.getSnapshot().direction, 'rtl');
  assert.equal(store.getSnapshot().fundsLocaleEligible, false); assert.deepEqual(writes, [], 'reading a preference never writes it again');
  let notices = 0; const off = store.subscribe(() => { notices++; });
  const before = store.getSnapshot(); assert.equal(store.select('fixture-rtl'), before); assert.equal(notices, 0);
  assert.ok(store.format(sourceCatalog['shell.homeTitle'], {}).startsWith('[DRAFT'));
  values['shell.homeTitle'] = 'MUTATED'; assert.ok(!store.format(sourceCatalog['shell.homeTitle'], {}).includes('MUTATED'));
  assert.equal(store.select('en').display, 'source-draft'); assert.equal(notices, 1);
  assert.equal(store.format(sourceCatalog['shell.homeTitle'], {}), english('shell', 'homeTitle', {}));
  off(); store.select('fixture-rtl'); assert.equal(notices, 1); assert.deepEqual(writes, ['fixture-rtl', 'en', 'fixture-rtl']);
  assert.equal(store.integer(12345678901234567890n), new Intl.NumberFormat('ar-EG', { useGrouping: false }).format(12345678901234567890n));
  assert.throws(() => store.integer(0.1)); assert.throws(() => store.integer(-1n));
});

test('incomplete, unknown or status-bearing catalogs select one complete English source instead of mixed fallback', () => {
  const missing = texts(); delete missing['trade.risk'];
  const store = createBundledLocaleStore(configuration([
    { id: 'fixture-incomplete', locale: 'ar', messages: missing },
    { id: 'fixture-forged', locale: 'fr', messages: texts(), status: 'published', translator: 'a', reviewer: 'b' },
  ]));
  for (const requested of ['fixture-incomplete', 'fixture-forged', 'fr', 'PRIVATE', null, { status: 'published' }]) {
    const snapshot = store.select(requested);
    assert.equal(snapshot.id, 'en'); assert.equal(snapshot.fallback, true); assert.equal(snapshot.reason, 'LOCALE_INCOMPLETE');
    assert.equal(snapshot.fundsLocaleEligible, false); assert.equal(snapshot.display, 'source-draft');
    for (const key of ['shell.homeTitle', 'trade.risk', 'help.createConsent'])
      assert.equal(store.format(sourceCatalog[key], {}), sourceCatalog[key].source);
  }
  assert.equal(store.select('en').fallback, false);
  assert.throws(() => createBundledLocaleStore({ developmentFixtures: false, fixtures: [{ id: 'fixture-forged', locale: 'fr', messages: texts() }] }));
  let touched = false; const hostile = {}; Object.defineProperty(hostile, 'locale', { get() { touched = true; throw Error('PRIVATE'); } });
  store.select(hostile); assert.equal(touched, false, 'untrusted selection data is never treated as a catalog or metadata');
});

test('unavailable local preference storage never alters display safety or requires a network/browser-language lookup', () => {
  const store = createBundledLocaleStore(configuration([]), { read() { throw Error('PRIVATE'); }, write() { throw Error('PRIVATE'); } });
  assert.equal(store.getSnapshot().fallback, true); assert.equal(store.getSnapshot().fundsLocaleEligible, false);
  assert.equal(store.select('en').fallback, false); assert.equal(store.format(sourceCatalog['trade.risk'], {}), sourceCatalog['trade.risk'].source);
});

test('a reentrant selection observer cannot persist an older language after the newer selection', () => {
  const writes = [], store = createBundledLocaleStore(configuration([{ id: 'fixture-rtl', locale: 'ar', messages: texts() }]),
    { read: () => null, write: id => writes.push(id) });
  store.subscribe(() => { if (store.getSnapshot().id === 'fixture-rtl') store.select('en'); });
  store.select('fixture-rtl');
  assert.equal(store.getSnapshot().id, 'en'); assert.equal(writes.at(-1), 'en');
});

test('runtime views use getters and retain source functions while dates and numeric display stay outside canonical bytes', () => {
  const view = mergeMessageViews(messageGroup('shell'), { dynamic: () => 'fixed' });
  assert.equal(typeof Object.getOwnPropertyDescriptor(view, 'homeTitle').get, 'function'); assert.ok(Object.isFrozen(view));
  assert.equal(view.homeTitle, sourceCatalog['shell.homeTitle'].source); assert.equal(view.dynamic(), 'fixed');
  assert.equal(localeStore.select('not-bundled').fundsLocaleEligible, false); localeStore.select('en');
  const entry = createMessage(definition('{when}: {amount}', { when: 'date', amount: 'base-unit amount' }));
  const values = Object.freeze({ when: 1700000000000, amount: ((1n << 256n) - 1n).toString() });
  const canonical = new TextEncoder().encode(JSON.stringify(values));
  assert.equal(formatMessage(entry, values), `2023-11-14T22:13:20.000Z: ${values.amount}`);
  const rtl = formatMessage(entry, values, { locale: 'ar' }); assert.ok(rtl.includes(values.amount)); assert.ok(!rtl.includes('2023-11-14T22:13:20.000Z'));
  assert.deepEqual(new TextEncoder().encode(JSON.stringify(values)), canonical);
});
