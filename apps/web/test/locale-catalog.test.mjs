import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessage, formatMessage, validateLocale, localeDirection, LocaleError } from '../src/ui/locale/catalog.ts';
import { sourceCatalog } from '../src/ui/locale/en.ts';

const definition = (changes = {}) => ({ key: 'recovery.records', source: '{count} {count|record|records} for {profile}',
  context: 'Private local profile recovery status', severity: 'warning', variables: { count: 'count', profile: 'identifier' },
  reviewRequired: true, docsAnchor: 'docs/recovery.md#records', ...changes });
const refuses = (fn, code) => assert.throws(fn, error => error instanceof LocaleError && error.code === code && !error.message.includes('PRIVATE'));

test('bounded message profile renders singular/plural and exact canonical identifiers without modifying inputs', () => {
  const entry = createMessage(definition());
  const values = Object.freeze({ count: 1, profile: 'a'.repeat(32) });
  assert.equal(formatMessage(entry, values), `1 record for ${'a'.repeat(32)}`);
  assert.equal(formatMessage(entry, { ...values, count: 0 }), `0 records for ${values.profile}`);
  assert.equal(formatMessage(entry, { ...values, count: 2 }), `2 records for ${values.profile}`);
  assert.deepEqual(values, { count: 1, profile: 'a'.repeat(32) });
  assert.ok(Object.isFrozen(entry) && Object.isFrozen(entry.variables));
});

test('variable sets and runtime purposes are exact; untrusted data never becomes an error message', () => {
  const entry = createMessage(definition());
  for (const values of [{ count: 1 }, { count: 1, profile: 'a', extra: 'PRIVATE' }, { count: '1', profile: 'a' },
    { count: -1, profile: 'a' }, { count: 1, profile: 'PRIVATE\u202e' }]) {
    refuses(() => formatMessage(entry, values), 'MESSAGE_VARIABLE_MISMATCH');
  }
  let touched = false;
  refuses(() => formatMessage(entry, { count: 1, get profile() { touched = true; return 'PRIVATE'; } }), 'MESSAGE_VARIABLE_MISMATCH');
  assert.equal(touched, false);
});

test('canonical base units stay integer strings and markup is rendered as text by the caller', () => {
  const entry = createMessage(definition({ source: '{amount} base units: {note}', variables: { amount: 'base-unit amount', note: 'text' } }));
  const max = ((1n << 256n) - 1n).toString();
  assert.equal(formatMessage(entry, { amount: max, note: '<img src=x>' }), `${max} base units: <img src=x>`);
  refuses(() => formatMessage(entry, { amount: '01', note: 'PRIVATE' }), 'MESSAGE_VARIABLE_MISMATCH');
  refuses(() => formatMessage(entry, { amount: Number(max), note: 'PRIVATE' }), 'MESSAGE_VARIABLE_MISMATCH');
});

test('unsupported grammar, undeclared/unused variables, markup and bidi controls are refused', () => {
  for (const source of ['{count, plural, one {record} other {records}}', '{count|only}', '{profile|one|many}',
    '{unknown}', '{count} {profile} {count|a|b|c}', '<b>{count}</b> {profile}', 'PRIVATE\u202e{count}{profile}', '{count}']) {
    refuses(() => createMessage(definition({ source })), 'MESSAGE_VARIABLE_MISMATCH');
  }
});

test('source definitions reject unknown fields and accessor metadata without evaluating them', () => {
  refuses(() => createMessage(definition({ html: 'PRIVATE' })), 'MESSAGE_VARIABLE_MISMATCH');
  let touched = false;
  const input = definition(); Object.defineProperty(input, 'context', { enumerable: true, get() { touched = true; return 'PRIVATE'; } });
  refuses(() => createMessage(input), 'MESSAGE_VARIABLE_MISMATCH');
  assert.equal(touched, false);
});

test('locale metadata and complete message/variable parity are required; source review is never inferred', () => {
  const entry = createMessage(definition()), catalog = Object.freeze({ [entry.key]: entry });
  const input = { locale: 'fr', translator: null, reviewer: null, revision: 1, status: 'draft', messages: { [entry.key]: '{count} {count|entrée|entrées} pour {profile}' } };
  const locale = validateLocale(input, catalog);
  assert.equal(locale.status, 'draft'); assert.ok(Object.isFrozen(locale) && Object.isFrozen(locale.messages));
  refuses(() => validateLocale({ ...input, messages: {} }, catalog), 'LOCALE_INCOMPLETE');
  refuses(() => validateLocale({ ...input, messages: { ...input.messages, unexpected: 'PRIVATE' } }, catalog), 'LOCALE_INCOMPLETE');
  refuses(() => validateLocale({ ...input, messages: { [entry.key]: '{count} entrées' } }, catalog), 'MESSAGE_VARIABLE_MISMATCH');
  for (const changes of [{ status: 'published' }, { status: 'reviewed', translator: 'person', reviewer: 'PERSON' },
    { status: 'accepted' }, { revision: 0 }, { locale: 'not-a-locale' }, { approved: true }]) {
    refuses(() => validateLocale({ ...input, ...changes }, catalog), 'LOCALE_INCOMPLETE');
  }
  const structuralOnly = validateLocale({ ...input, status: 'published', translator: 'translator', reviewer: 'reviewer' }, catalog);
  assert.equal(structuralOnly.status, 'published', 'structural validation alone is never a selectable-locale or review-authority API');
});

test('a complete draft catalog must contain visible text for its recovery warning', () => {
  const messages = Object.fromEntries(Object.entries(sourceCatalog).map(([key, entry]) => [key, entry.source]));
  const draft = { locale: 'en', translator: null, reviewer: null, revision: 1, status: 'draft', messages };
  const warning = 'recovery.unverified';
  assert.equal(formatMessage(validateLocale(draft, sourceCatalog).messages[warning], {}), sourceCatalog[warning].source);

  // A present but blank critical message gives the reader no guidance, just like an empty string.
  for (const blank of ['', ' \t\n', '\u00a0']) {
    assert.throws(() => validateLocale({ ...draft, messages: { ...messages, [warning]: blank } }, sourceCatalog),
      LocaleError, `Expected blank recovery warning ${JSON.stringify(blank)} to be rejected`);
  }
});

test('address-purpose display retains exact canonical bytes and refuses spoofing controls', () => {
  const entry=createMessage(definition({source:'{address}',variables:{address:'address'}}));
  const address='0x'+'Ab'.repeat(20);
  assert.equal(formatMessage(entry,{address}),address);
  for(const value of ['0x1234',address+'\u202e','１２３４','<script>','a'.repeat(80)]) refuses(()=>formatMessage(entry,{address:value}),'MESSAGE_VARIABLE_MISMATCH');
});
test('direction is derived from a supported locale and imported status grants no selection authority', () => {
  assert.equal(localeDirection('ar'),'rtl');assert.equal(localeDirection('ja'),'ltr');
  refuses(()=>localeDirection('PRIVATE'),'LOCALE_INCOMPLETE');
  const entry=createMessage(definition()), source={[entry.key]:entry};
  const locale=validateLocale({locale:'ar',translator:null,reviewer:null,revision:1,status:'draft',messages:{[entry.key]:entry.source}},source);
  assert.equal(locale.direction,'rtl');assert.equal(locale.status,'draft');
});
