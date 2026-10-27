import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDisplayText, MAX_DISPLAY_TEXT_UNITS } from '../src/ui/trade/display-text.ts';

// Cases adapted from GhostPay packages/address-safety/src/text.test.ts (edb0051), with this project's G16 deltas.
test('refuses characters that can disguise text', () => {
  for (const [input, reason] of [
    ['pay\u202Efdp.exe', 'bidi_control'], ['a\u2066b', 'bidi_control'], ['a\u200Eb', 'bidi_control'],
    ['a\u200Bb', 'default_ignorable'], ['a\u200Db', 'default_ignorable'], ['a\u00ADb', 'default_ignorable'],
    ['a\u{E0041}b', 'tag_character'], ['a\uE000b', 'private_use'], ['a\rb', 'control_character'], ['a\tb', 'control_character'],
    ['a\u0000b', 'control_character'], ['a\uD800b', 'unpaired_surrogate'], ['a\uDC00', 'unpaired_surrogate'],
  ]) assert.deepEqual(checkDisplayText(input), { ok: false, reason }, JSON.stringify(input));
  assert.deepEqual(checkDisplayText(1), { ok: false, reason: 'not_a_string' });
  assert.deepEqual(checkDisplayText('a'.repeat(MAX_DISPLAY_TEXT_UNITS + 1)), { ok: false, reason: 'too_long' });
});

test('returns the exact input: no normalization, LF kept, astral characters allowed', () => {
  const decomposed = 'cafe\u0301';
  assert.deepEqual(checkDisplayText(decomposed), { ok: true, text: decomposed, mixedScript: false });
  assert.deepEqual(checkDisplayText('Line 1\nLine 2'), { ok: true, text: 'Line 1\nLine 2', mixedScript: false });
  assert.equal(checkDisplayText('a \u{1F600} b').ok, true);
  assert.equal(checkDisplayText('').ok, true);
});

test('flags Latin mixed with Cyrillic or Greek without altering text; pure scripts are not flagged', () => {
  assert.deepEqual(checkDisplayText('p\u0430ypal ok'), { ok: true, text: 'p\u0430ypal ok', mixedScript: true });
  assert.equal(checkDisplayText('b\u03BFb').mixedScript, true);
  assert.equal(checkDisplayText('\u043F\u0440\u0438\u0432\u0435\u0442 \u03BA\u03B1\u03BB\u03B7').mixedScript, false);
});

test('is linear on long adversarial input', () => {
  const started = performance.now();
  for (const input of ['a'.repeat(4096), '\u0430'.repeat(2048) + 'a'.repeat(2048), ' a'.repeat(2048)]) checkDisplayText(input);
  assert.ok(performance.now() - started < 500);
});
