/** Trusted compiled display composition, with complete-catalog selection and no economic authority.
 * Catalog metadata is never a review capability. This implementation has no published translation policy:
 * every selection remains ineligible for funds, including the draft English source and development fixtures.
 */
import { formatMessage, localeFormattingTag, validateLocale, LocaleError, type LocaleCatalog,
  type MessageEntry, type MessageValues, type MessageVariables } from './catalog.ts';
import { sourceCatalog, SOURCE_LOCALE, type SourceGroup, type SourceKey, type SourceVariables, type SourceStaticGroup } from './en.ts';
import { bundledLocaleConfiguration } from './bundled.ts';

export interface CompiledLocaleFixture {
  readonly id: string; readonly locale: LocaleCatalog['locale']; readonly messages: Readonly<Record<string, string>>;
}
export interface BundledLocaleConfiguration {
  readonly developmentFixtures: boolean; readonly fixtures: readonly CompiledLocaleFixture[];
  readonly preferences?: LocalePreferencePort;
}
/** Local preference capability supplied by trusted composition. It stores only a bundled ID, never identity or private data. */
export interface LocalePreferencePort { read(): unknown; write(id: string): void; }
export interface LocaleSnapshot {
  readonly id: string; readonly locale: LocaleCatalog['locale']; readonly direction: 'ltr' | 'rtl'; readonly revision: number;
  readonly display: 'source-draft' | 'development-fixture'; readonly fallback: boolean;
  readonly reason: 'LOCALE_INCOMPLETE' | null; readonly fundsLocaleEligible: false;
}
export interface BundledLocaleStore {
  getSnapshot(): LocaleSnapshot; subscribe(listener: () => void): () => void;
  /** Explicit selection only; no browser-language sniffing, network or imported catalog registration. */
  select(requested: unknown): LocaleSnapshot;
  format<V extends MessageVariables>(source: MessageEntry<V>, values: MessageValues<V>): string;
  integer(value: number | bigint): string;
}
const incomplete = (): never => { throw new LocaleError('LOCALE_INCOMPLETE'); };
const sourceTexts = Object.freeze(Object.fromEntries(Object.entries(sourceCatalog).map(([key, entry]) => [key, entry.source])));
const sourceLocale = validateLocale({ locale: SOURCE_LOCALE.locale, translator: null, reviewer: null, revision: SOURCE_LOCALE.revision,
  status: 'draft', messages: sourceTexts }, sourceCatalog);
type Bundle = Readonly<{ id: string; catalog: LocaleCatalog; display: LocaleSnapshot['display'] }>;
const sourceBundle: Bundle = Object.freeze({ id: 'en', catalog: sourceLocale, display: 'source-draft' });

/** Constructor arguments are compiled application capabilities, not a parsed locale/reviewer/status envelope.
 * The app singleton is closed over bundled.ts. Only explicit development builds can include draft fixture text.
 * An invalid fixture is unavailable as a whole; individual strings never fall back across languages.
 */
export function createBundledLocaleStore(configuration: BundledLocaleConfiguration, preferences: LocalePreferencePort | undefined = configuration.preferences): BundledLocaleStore {
  const bundles = new Map<string, Bundle>([['en', sourceBundle]]), listeners = new Set<() => void>();
  if (!configuration || typeof configuration !== 'object' || typeof configuration.developmentFixtures !== 'boolean' ||
      !Array.isArray(configuration.fixtures) || configuration.fixtures.length > 19 ||
      !configuration.developmentFixtures && configuration.fixtures.length !== 0) return incomplete();
  for (const fixture of configuration.fixtures) {
    try {
      if (!fixture || typeof fixture !== 'object' || Object.keys(fixture).length !== 3 ||
          !['id', 'locale', 'messages'].every(key => Object.hasOwn(fixture, key)) ||
          typeof fixture.id !== 'string' || !/^fixture-[a-z0-9-]{1,48}$/.test(fixture.id) || bundles.has(fixture.id)) return incomplete();
      const catalog = validateLocale({ locale: fixture.locale, translator: null, reviewer: null, revision: 1, status: 'draft', messages: fixture.messages }, sourceCatalog);
      bundles.set(fixture.id, Object.freeze({ id: fixture.id, catalog, display: 'development-fixture' }));
    } catch { /* The entire incomplete fixture remains unavailable; source is retained atomically. */ }
  }
  let selected = sourceBundle;
  let snapshot: LocaleSnapshot = Object.freeze({ id: 'en', locale: 'en', direction: 'ltr', revision: 0, display: 'source-draft',
    fallback: false, reason: null, fundsLocaleEligible: false });
  function select(requested: unknown, persist: boolean): LocaleSnapshot {
    const next = typeof requested === 'string' ? bundles.get(requested) : undefined;
    const bundle = next ?? sourceBundle, fallback = next === undefined;
    const changed = snapshot.id !== bundle.id || snapshot.fallback !== fallback;
    if (changed) {
      selected = bundle;
      snapshot = Object.freeze({ id: bundle.id, locale: bundle.catalog.locale, direction: bundle.catalog.direction,
        revision: snapshot.revision + 1, display: bundle.display, fallback, reason: fallback ? 'LOCALE_INCOMPLETE' : null, fundsLocaleEligible: false });
    }
    // Persist before notifying: a reentrant observer's newer explicit choice must be the final retained preference.
    if (persist && next && preferences) { try { preferences.write(bundle.id); } catch { /* Selection is local for this session if storage refuses. */ } }
    if (changed) for (const listener of [...listeners]) { try { listener(); } catch { /* One observer cannot suppress the coherent selection for others. */ } }
    return snapshot;
  }
  const store: BundledLocaleStore = Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { if (typeof listener !== 'function') return incomplete(); listeners.add(listener); return () => { listeners.delete(listener); }; },
    select: (requested: unknown) => select(requested, true),
    format<V extends MessageVariables>(source: MessageEntry<V>, values: MessageValues<V>): string {
      if (sourceCatalog[source.key] !== source) return incomplete();
      const entry = selected.catalog.messages[source.key]; if (!entry) return incomplete();
      return formatMessage(entry as MessageEntry<V>, values, { locale: selected.catalog.locale });
    },
    integer(value: number | bigint) {
      if (typeof value === 'number' ? !Number.isSafeInteger(value) || value < 0 : typeof value !== 'bigint' || value < 0n || value >= 10n ** 78n) return incomplete();
      return new Intl.NumberFormat(localeFormattingTag(selected.catalog.locale), { useGrouping: false, maximumFractionDigits: 0 }).format(value);
    },
  });
  if (preferences) { try { const saved = preferences.read(); if (saved !== null && saved !== undefined) select(saved, false); } catch { select(undefined, false); } }
  return store;
}

export const localeStore = createBundledLocaleStore(bundledLocaleConfiguration);
/** Typed dynamic messages retain the exact source variable contract, regardless of selected display text. */
export function message<G extends SourceGroup, K extends SourceKey<G>>(group: G, key: K, values: MessageValues<SourceVariables<G, K>>): string {
  const entry = sourceCatalog[`${group}.${String(key)}`]; if (!entry) return incomplete();
  return localeStore.format(entry as MessageEntry<SourceVariables<G, K>>, values);
}
/** Static message views evaluate at property access; spreading them would freeze a language at module load. */
export function messageGroup<G extends SourceGroup>(group: G): SourceStaticGroup<G> {
  const view: Record<string, string> = Object.create(null), prefix = `${group}.`;
  for (const [key, entry] of Object.entries(sourceCatalog)) if (key.startsWith(prefix) && Object.keys(entry.variables).length === 0)
    Object.defineProperty(view, key.slice(prefix.length), { enumerable: true, get: () => localeStore.format(entry, {}) });
  return Object.freeze(view) as SourceStaticGroup<G>;
}
export function messageText(key: string): string {
  const entry = sourceCatalog[key]; if (!entry || Object.keys(entry.variables).length !== 0) return incomplete();
  return localeStore.format(entry, {});
}
/** Preserve live getters when adding typed dynamic adapters to a static catalog group. */
export function mergeMessageViews<A extends object, B extends object>(first: A, second: B): Readonly<A & B> {
  return Object.freeze(Object.defineProperties({}, { ...Object.getOwnPropertyDescriptors(first), ...Object.getOwnPropertyDescriptors(second) })) as Readonly<A & B>;
}
