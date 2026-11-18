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
