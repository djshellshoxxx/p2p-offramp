/** Plain-text source profile: {name}, count-only {name|one text|other text}, or named
 * count branches {name|zero=text|one=text|two=text|few=text|many=text|other=text}.
 * No nesting, escapes, markup, arbitrary formatter, full ICU grammar or executable translations.
 * This module formats display text only. Canonical amounts, signed bytes and stored data never enter it for parsing.
 */
export const LOCALE_TARGETS = Object.freeze(['en', 'fr', 'es', 'pt-BR', 'de', 'it', 'nl', 'ar', 'hi', 'zh-Hans', 'zh-Hant', 'ja', 'ko', 'id', 'tr', 'ru', 'uk', 'vi', 'th'] as const);
export type VariablePurpose = 'text' | 'identifier' | 'count' | 'date' | 'base-unit amount' | 'currency' | 'chain' | 'duration' | 'address';
export type MessageVariables = Readonly<Record<string, VariablePurpose>>;
export type MessageValues<V extends MessageVariables> = { readonly [K in keyof V]: V[K] extends 'count' | 'date' ? number : string };
export interface MessageEntry<V extends MessageVariables = MessageVariables> {
  readonly key: string; readonly source: string; readonly context: string; readonly severity: 'information' | 'warning' | 'critical';
  readonly variables: V; readonly reviewRequired: boolean; readonly docsAnchor: string;
}
export function localeDirection(locale: typeof LOCALE_TARGETS[number]): 'ltr' | 'rtl' {
  if (!LOCALE_TARGETS.includes(locale)) throw new LocaleError('LOCALE_INCOMPLETE');
  return locale === 'ar' ? 'rtl' : 'ltr';
}
export interface LocaleCatalog {
  readonly direction: 'ltr' | 'rtl';
  readonly locale: typeof LOCALE_TARGETS[number]; readonly translator: string | null; readonly reviewer: string | null;
  readonly revision: number; readonly status: 'draft' | 'reviewed' | 'published'; readonly messages: Readonly<Record<string, MessageEntry>>;
}
export class LocaleError extends Error {
  readonly code: 'MESSAGE_VARIABLE_MISMATCH' | 'LOCALE_INCOMPLETE';
  constructor(code: LocaleError['code']) { super('The message or locale is unavailable.'); this.name = 'LocaleError'; this.code = code; }
}
const refuse = (code: LocaleError['code'] = 'MESSAGE_VARIABLE_MISMATCH'): never => { throw new LocaleError(code); };
const purposes: readonly VariablePurpose[] = ['text', 'identifier', 'count', 'date', 'base-unit amount', 'currency', 'chain', 'duration', 'address'];
const names = /^[A-Za-z][A-Za-z0-9]*$/, identifiers = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const unsafe = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ud800-\udfff]/u;
type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
type Part = string | Readonly<{ name: string; forms?: Readonly<Partial<Record<PluralCategory, string>>> }>;
export interface MessageFormatOptions { readonly locale: LocaleCatalog['locale']; }
/** Explicit numeral policy for the bundled Arabic display profile. Canonical numeric parsing never uses it. */
export function localeFormattingTag(locale: LocaleCatalog['locale']): string {
  if (!LOCALE_TARGETS.includes(locale)) return refuse('LOCALE_INCOMPLETE');
  return locale === 'ar' ? 'ar-u-nu-arab' : locale;
}
const compiled = new WeakMap<object, readonly Part[]>();
function data(value: unknown, keys: readonly string[], code: LocaleError['code'] = 'MESSAGE_VARIABLE_MISMATCH'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return refuse(code);
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) return refuse(code);
  const copy: Record<string, unknown> = Object.create(null);
  for (const key of keys) { const d = Object.getOwnPropertyDescriptor(value, key); if (!d || !d.enumerable || !('value' in d)) return refuse(code); copy[key] = d.value; }
  return copy;
}
function plain(value: unknown, max = 8192): value is string { return typeof value === 'string' && value.length <= max && !unsafe.test(value); }
function parts(source: string, variables: MessageVariables): readonly Part[] {
  const result: Part[] = [], used = new Set<string>(); let from = 0;
  for (const match of source.matchAll(/\{([^{}]*)\}/g)) {
    const literal = source.slice(from, match.index); if (/[{}]/.test(literal)) return refuse(); result.push(literal);
    const tokens = match[1]!.split('|'), name = tokens[0]!;
    if (!names.test(name) || !Object.hasOwn(variables, name) || tokens.length > 7 || tokens.length > 1 && variables[name] !== 'count') return refuse();
    used.add(name);
    if (tokens.length === 1) result.push(Object.freeze({ name }));
    else {
      const forms: Partial<Record<PluralCategory, string>> = Object.create(null);
      if (tokens.length === 3 && !tokens[1]!.includes('=') && !tokens[2]!.includes('=')) {
        forms.one = tokens[1]!; forms.other = tokens[2]!;
      } else for (const branch of tokens.slice(1)) {
        const match = /^(zero|one|two|few|many|other)=(.+)$/s.exec(branch);
        if (!match || Object.hasOwn(forms, match[1]!)) return refuse();
        forms[match[1] as PluralCategory] = match[2]!;
      }
      if (!forms.other) return refuse();
      result.push(Object.freeze({ name, forms: Object.freeze(forms) }));
    }
    from = match.index + match[0].length;
  }
  const tail = source.slice(from); if (/[{}]/.test(tail) || used.size !== Object.keys(variables).length) return refuse();
  result.push(tail); return Object.freeze(result);
}
/** Constructs a detached frozen entry; foreign accessors/toJSON are never evaluated. */
export function createMessage<const V extends MessageVariables>(input: MessageEntry<V>): MessageEntry<V> {
  try {
    const raw = data(input, ['key', 'source', 'context', 'severity', 'variables', 'reviewRequired', 'docsAnchor']);
    if (!plain(raw.key, 160) || !/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(raw.key) ||
        !plain(raw.source) || !raw.source || /[<>]/.test(raw.source) || !plain(raw.context, 500) || !raw.context ||
        !['information', 'warning', 'critical'].includes(raw.severity as string) || typeof raw.reviewRequired !== 'boolean' ||
        !plain(raw.docsAnchor, 500) || !/^[A-Za-z0-9_./-]+\.md(?:#[A-Za-z0-9-]+)?$/.test(raw.docsAnchor)) return refuse();
    if (!raw.variables || typeof raw.variables !== 'object') return refuse();
    const keys = Reflect.ownKeys(raw.variables); if (keys.length > 8 || keys.some(key => typeof key !== 'string' || !names.test(key))) return refuse();
    const values = data(raw.variables, keys as string[]), variables: Record<string, VariablePurpose> = Object.create(null);
    for (const key of keys as string[]) { if (!purposes.includes(values[key] as VariablePurpose)) return refuse(); variables[key] = values[key] as VariablePurpose; }
    const entry: MessageEntry = Object.freeze({ key: raw.key, source: raw.source, context: raw.context, severity: raw.severity as MessageEntry['severity'],
      variables: Object.freeze(variables), reviewRequired: raw.reviewRequired, docsAnchor: raw.docsAnchor });
    compiled.set(entry, parts(entry.source, entry.variables)); return entry as MessageEntry<V>;
  } catch { return refuse(); }
}
function displayValue(purpose: VariablePurpose, value: unknown): string {
  if (purpose === 'count') return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : refuse();
  if (purpose === 'date') return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000 ? new Date(value).toISOString() : refuse();
  if (!plain(value, 4096)) return refuse();
  if (purpose === 'base-unit amount' || purpose === 'duration') { if (!/^(0|[1-9][0-9]{0,77})$/.test(value)) return refuse(); }
  else if (purpose === 'currency') { if (!/^[A-Z]{3}$/.test(value)) return refuse(); }
  // Display shape only: this neither validates chain membership/checksums nor authenticates an address.
  else if (purpose === 'address') { if (!/^(?:0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(value)) return refuse(); }
  else if (purpose === 'identifier' || purpose === 'chain') { if (!identifiers.test(value)) return refuse(); }
  return value;
}
export function formatMessage<V extends MessageVariables>(entry: MessageEntry<V>, values: MessageValues<V>, options?: MessageFormatOptions): string {
  try {
    const tokens = compiled.get(entry); if (!tokens) return refuse();
    const raw = data(values, Object.keys(entry.variables)), display: Record<string, string> = Object.create(null);
    const locale = options?.locale ?? 'en', tag = localeFormattingTag(locale);
    const number = new Intl.NumberFormat(tag, { useGrouping: false, maximumFractionDigits: 0 });
    const plural = new Intl.PluralRules(tag);
    for (const name of Object.keys(entry.variables)) {
      const purpose = entry.variables[name]!, checked = displayValue(purpose, raw[name]);
      const machine = ['identifier', 'base-unit amount', 'currency', 'chain', 'duration', 'address'].includes(purpose);
      display[name] = purpose === 'count' ? number.format(raw[name] as number) : purpose === 'date' && locale !== 'en' ?
        new Intl.DateTimeFormat(tag, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC', timeZoneName: 'short', hourCycle: 'h23' }).format(raw[name] as number) :
        localeDirection(locale) === 'rtl' && machine ? `\u2066${checked}\u2069` : checked;
    }
    const text = tokens.map(part => typeof part === 'string' ? part : part.forms === undefined ? display[part.name] :
      part.forms[plural.select(raw[part.name] as number)] ?? part.forms.other).join('');
    if (text.length > 16384) return refuse(); return text;
  } catch { return refuse(); }
}
/** Structural validation only: imported reviewer names/status never grant review, selection or signing authority. */
export function validateLocale(input: unknown, source: Readonly<Record<string, MessageEntry>>): LocaleCatalog {
  try {
    const raw = data(input, ['locale', 'translator', 'reviewer', 'revision', 'status', 'messages'], 'LOCALE_INCOMPLETE');
    if (!LOCALE_TARGETS.includes(raw.locale as typeof LOCALE_TARGETS[number]) || !['draft', 'reviewed', 'published'].includes(raw.status as string) ||
        typeof raw.revision !== 'number' || !Number.isSafeInteger(raw.revision) || raw.revision < 1) return refuse('LOCALE_INCOMPLETE');
    for (const name of ['translator', 'reviewer']) if (raw[name] !== null && (!plain(raw[name], 160) || !identifiers.test(raw[name]))) return refuse('LOCALE_INCOMPLETE');
    if (raw.status !== 'draft' && (raw.translator === null || raw.reviewer === null ||
        (raw.translator as string).toLowerCase() === (raw.reviewer as string).toLowerCase())) return refuse('LOCALE_INCOMPLETE');
    const keys = Object.keys(source); if (!keys.length || keys.length > 1024) return refuse('LOCALE_INCOMPLETE');
    const texts = data(raw.messages, keys, 'LOCALE_INCOMPLETE'), messages: Record<string, MessageEntry> = Object.create(null);
    for (const key of keys) {
      const original = source[key]!; if (!compiled.has(original) || original.key !== key) return refuse('LOCALE_INCOMPLETE');
      messages[key] = createMessage({ ...original, source: texts[key] as string });
    }
    return Object.freeze({ locale: raw.locale as LocaleCatalog['locale'], direction: localeDirection(raw.locale as LocaleCatalog['locale']), translator: raw.translator as string | null, reviewer: raw.reviewer as string | null,
      revision: raw.revision, status: raw.status as LocaleCatalog['status'], messages: Object.freeze(messages) });
  } catch (error) { if (error instanceof LocaleError) throw error; return refuse('LOCALE_INCOMPLETE'); }
}
