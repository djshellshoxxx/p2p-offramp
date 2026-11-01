/** Test-only expansion. This module is outside the production graph and provides no locale selection. */
import { createMessage } from '../src/ui/locale/catalog.ts';
export const pseudoMetadata = Object.freeze({ locale: 'test-pseudo', status: 'draft' });
export const pseudoProfiles = Object.freeze(['expanded', 'rtl', 'cjk']);
const expand = text => text.replace(/[aeiouAEIOU]/g, letter => ({ a: 'áa', e: 'ée', i: 'íi', o: 'óo', u: 'úu', A: 'ÁA', E: 'ÉE', I: 'ÍI', O: 'ÓO', U: 'ÚU' })[letter]);
export function pseudoMessage(entry, profile = 'expanded') {
  if (!pseudoProfiles.includes(profile)) throw Error('Unknown test-only pseudolocale profile.');
  const literalText = text => profile === 'rtl' ? `اختبار ${text} نص طويل` : profile === 'cjk' ? `試験${text}漢字かな折返` : expand(text);
  const source = entry.source.replace(/\{([^{}]*)\}|([^{}]+)/g, (match, token, literal) => {
    if (literal !== undefined) return literalText(literal);
    const parts = token.split('|');
    return parts.length === 1 ? match : `{${parts[0]}|${literalText(parts[1])}|${literalText(parts[2])}}`;
  });
  return createMessage({ ...entry, source: `[${source}]` });
}
