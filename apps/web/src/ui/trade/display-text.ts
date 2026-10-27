/**
 * Untrusted display-text checks for counterparty-supplied strings (payment instructions).
 *
 * Adapted from GhostPay `packages/address-safety/src/text.ts` (`sanitizeDisplayText`),
 * https://github.com/djshellshoxxx/GhostPay at edb0051eb89bd135c73733d9db14569aa000662d, same owner
 * (djshellshoxxx); reuse recorded in docs/REUSE.md. Adaptations for G16, which requires displays to use the exact
 * agreed bytes with no Unicode normalization after agreement:
 * - the text is never normalized or altered; mixed-script tokens are reported, not prefixed with a marker;
 * - LF (U+000A) is permitted so multi-line instructions survive; every other control character is refused;
 * - no ZWJ/emoji allowance: every default-ignorable code point is refused.
 * Same-script homoglyphs are not detected. React renders text as text; this check does not replace that.
 */
export type DisplayTextRejection =
  | 'not_a_string' | 'too_long' | 'bidi_control' | 'default_ignorable' | 'private_use'
  | 'tag_character' | 'control_character' | 'unpaired_surrogate';
export type DisplayTextResult =
  | { readonly ok: true; readonly text: string; readonly mixedScript: boolean }
  | { readonly ok: false; readonly reason: DisplayTextRejection };

/** G16 bounds payment instructions to 4 KiB of UTF-8, so 4096 UTF-16 units is never the binding limit for valid terms. */
export const MAX_DISPLAY_TEXT_UNITS = 4096;
const BIDI = /\p{Bidi_Control}/u;
const TAG = /[\u{E0000}-\u{E007F}]/u;
const IGNORABLE = /\p{Default_Ignorable_Code_Point}/u;
const PRIVATE = /\p{Co}/u;
const CONTROL = /\p{Cc}/u;
const SURROGATE = /\p{Cs}/u;
const LATIN = /\p{Script=Latin}/u;
const LOOKALIKE_SCRIPT = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;
const TOKEN = /\S+/gu;

const rejected = (reason: DisplayTextRejection): DisplayTextResult => Object.freeze({ ok: false, reason });

function badCharacter(character: string): DisplayTextRejection | null {
  if (SURROGATE.test(character)) return 'unpaired_surrogate';
  if (BIDI.test(character)) return 'bidi_control';
  if (TAG.test(character)) return 'tag_character';
  if (PRIVATE.test(character)) return 'private_use';
  if (character !== '\n' && CONTROL.test(character)) return 'control_character';
  if (IGNORABLE.test(character)) return 'default_ignorable';
  return null;
}

/** Linear-time check. Returns the exact input on success, with a flag when a token mixes Latin with Cyrillic/Greek. */
export function checkDisplayText(input: unknown): DisplayTextResult {
  if (typeof input !== 'string') return rejected('not_a_string');
  if (input.length > MAX_DISPLAY_TEXT_UNITS) return rejected('too_long');
  for (const character of input) {
    const bad = badCharacter(character);
    if (bad !== null) return rejected(bad);
  }
  let mixedScript = false;
  for (const [token] of input.matchAll(TOKEN)) if (LATIN.test(token) && LOOKALIKE_SCRIPT.test(token)) { mixedScript = true; break; }
  return Object.freeze({ ok: true, text: input, mixedScript });
}
