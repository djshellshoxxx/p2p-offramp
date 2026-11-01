/** Build/dev HTML copy shares the app's draft English catalog. No runtime locale fetch or authority. */
import { englishGroup, SOURCE_LOCALE } from '../src/ui/locale/en.ts';

const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
export function localizeShellHtml(template) {
  const copy = englishGroup('document');
  const values = { LANG: SOURCE_LOCALE.locale, DIRECTION: SOURCE_LOCALE.direction, TITLE: copy.title,
    LOADING: copy.loading, NOSCRIPT: copy.noscript, POLICY_NOTICE: copy.policyNotice };
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    const marker = `__P2P_SOURCE_${key}__`;
    if (output.split(marker).length !== 2) throw new Error('SOURCE_LOCALE_PLACEHOLDER');
    output = output.replace(marker, () => escapeHtml(value));
  }
  if (output.includes('__P2P_SOURCE_')) throw new Error('SOURCE_LOCALE_PLACEHOLDER');
  return output;
}
export function sourceLocalePlugin() {
  return { name: 'p2p-source-locale', transformIndexHtml: { order: 'pre', handler: localizeShellHtml } };
}
