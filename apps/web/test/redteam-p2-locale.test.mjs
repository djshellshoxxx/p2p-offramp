// RED TEAM pass 2 (Team D) against c3c4d90 (locale "visible character" check). Not in the npm test glob.
// Repro: node --import ./scripts/test-support/register-tsx.mjs --test --test-reporter=tap apps/web/test/redteam-p2-locale.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessage, validateLocale } from '../src/ui/locale/catalog.ts';

const entry = createMessage({ key: 'recovery.unverified', source: 'Recovery is unverified', context: 'Private local profile recovery status',
  severity: 'warning', variables: {}, reviewRequired: true, docsAnchor: 'docs/recovery.md#records' });
const catalog = text => ({ locale: 'fr', translator: null, reviewer: null, revision: 1, status: 'draft', messages: { 'recovery.unverified': text } });

// REDTEAM-P2-LOC1: the visible test is "not White_Space/Default_Ignorable/U+2800". Characters that render as nothing on
// their own but are neither (combining marks, Cf interlinear annotation anchors, Arabic prepended number signs) still
// pass, so a translation of a warning can be made invisible.
test('REDTEAM-P2-LOC1 a translation made only of non-spacing/format characters is refused', () => {
  const accepted = [];
  for (const text of ['́', '̣́̈', '￹￺￻', '؀', '\u{1D167}\u{1D168}']) {
    try { validateLocale(catalog(text), { 'recovery.unverified': entry }); accepted.push(text.codePointAt(0).toString(16)); } catch { /* refused */ }
  }
  assert.deepEqual(accepted, [], `invisible translations accepted (first code point): ${accepted.join(', ')}`);
});

// Area review of the consolidation candidate (2bc0f62, MEDIUM-1): the visible test ran on the raw source, so
// placeholder syntax ({, |, =) counted as visible. Named branches made only of invisible text, a message made only of
// a variable, and punctuation-only critical warnings passed. Visibility is now judged on the message's own text.
test('locale visibility ignores placeholder syntax: invisible branches, variable-only and symbol-only critical text are refused', () => {
  const make = (source, variables, severity = 'warning') => createMessage({ key: 'recovery.count', source, context: 'Count of unverified records',
    severity, variables, reviewRequired: true, docsAnchor: 'docs/recovery.md#records' });
  for (const [source, variables] of [
    ['{count|one=​|other=​}', { count: 'count' }],
    ['{count|​|⁠}', { count: 'count' }],
    ['{count|one=records|other=​}', { count: 'count' }],
    ['{x}', { x: 'text' }],
    ['​{x}⁠', { x: 'text' }],
  ]) assert.throws(() => make(source, variables), /unavailable/, JSON.stringify(source));
  assert.throws(() => make('.', {}, 'critical'), /unavailable/);
  assert.throws(() => make('⚠ {x}', { x: 'text' }, 'critical'), /unavailable/);
  // Still accepted: words with variables, named branches with visible text, punctuation-only non-critical text,
  // and a critical message whose words are all in its count branches.
  make('{count} records are unverified', { count: 'count' });
  make('{count|one=one record|other={count} records}'.replace('{count} records}', 'many records}'), { count: 'count' });
  make('…', {}, 'information');
  make('{count|one=1 record unverified|other=records unverified}', { count: 'count' }, 'critical');
});
