/** Test-only expansion. This module is outside the production graph and provides no locale selection. */
import { createMessage } from '../src/ui/locale/catalog.ts';
export const pseudoMetadata = Object.freeze({ locale: 'test-pseudo', status: 'draft' });
const expand = text => text.replace(/[aeiouAEIOU]/g, letter => ({ a: 'áa', e: 'ée', i: 'íi', o: 'óo', u: 'úu', A: 'ÁA', E: 'ÉE', I: 'ÍI', O: 'ÓO', U: 'ÚU' })[letter]);
export function pseudoMessage(entry) {
  const source = entry.source.replace(/\{([^{}]*)\}|([^{}]+)/g, (match, token, literal) => {
    if (literal !== undefined) return expand(literal);
    const parts = token.split('|');
    return parts.length === 1 ? match : `{${parts[0]}|${expand(parts[1])}|${expand(parts[2])}}`;
  });
  return createMessage({ ...entry, source: `[${source}]` });
}
