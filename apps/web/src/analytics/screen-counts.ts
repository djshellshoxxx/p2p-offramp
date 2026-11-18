/** Opt-in memory-only category counts. No routes, identities, clocks, persistence or event payloads. */
export const SCREEN_CATEGORIES = Object.freeze(['home', 'offers', 'trade', 'recovery', 'settings'] as const);
export type ScreenCategory = typeof SCREEN_CATEGORIES[number];
export type ScreenCounts = Readonly<Record<ScreenCategory, number>>;
export interface ScreenCountPreview { readonly text: string; }
export interface ScreenCountSnapshot {
  readonly enabled: boolean;
  readonly retired: boolean;
  readonly counts: ScreenCounts;
  readonly preview: ScreenCountPreview | null;
}
/** User controls only. The Settings component receives no observer capability. */
export interface ScreenCountsController {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ScreenCountSnapshot;
  optIn(): void;
  optOut(): void;
  clear(): void;
  reviewExport(): ScreenCountPreview | null;
  confirmExport(preview: unknown): string | null;
}
export interface ScreenCountsObserver {
  /** Trusted App composition supplies only an actually committed category and native foreground state. */
  commit(category: ScreenCategory | null, foreground: boolean): void;
  /** Owner/lock/pagehide retirement is permanent; replacement sessions start off. */
  retire(): void;
}
const ZERO: ScreenCounts = Object.freeze({ home: 0, offers: 0, trade: 0, recovery: 0, settings: 0 });
const MAX_COUNT = 65535, MAX_EXPORT_UNITS = 1024, MAX_SUBSCRIBERS = 16;

export function createScreenCounts(): Readonly<{ controller: ScreenCountsController; observer: ScreenCountsObserver }> {
  let enabled = false, retired = false, foreground = false;
  let category: ScreenCategory | null = null, counts = ZERO, preview: ScreenCountPreview | null = null;
  let snapshot: ScreenCountSnapshot = Object.freeze({ enabled, retired, counts, preview });
  const listeners = new Set<() => void>();
  let notifying = false, dirty = false, activeListener: (() => void) | undefined;
  const mutators = new Set<() => void>();
  const publish = () => {
    snapshot = Object.freeze({ enabled, retired, counts, preview });
    if (notifying) {
      dirty = true;
      if (activeListener) mutators.add(activeListener);
      return;
    }
    notifying = true;
    // A fixed cohort of at most16 listeners excludes each mutator after its first change.
    // Stable readers catch up synchronously; subscribing cannot enlarge this publication.
    const cohort = [...listeners]; mutators.clear();
    try {
      do {
        dirty = false;
        for (const listener of cohort) {
          if (!listeners.has(listener) || mutators.has(listener)) continue;
          activeListener = listener;
          try { listener(); } catch { /* UI observers cannot interrupt erasure. */ }
          finally { activeListener = undefined; }
        }
      } while (dirty);
    } finally {
      notifying = false; activeListener = undefined; mutators.clear();
      // Reentrant retirement must reach stable readers before subscriptions are released.
      if (retired) listeners.clear();
    }
  };
  const count = (entry: ScreenCategory) => {
    if (counts[entry] < MAX_COUNT) counts = Object.freeze({ ...counts, [entry]: counts[entry] + 1 });
    preview = null; publish();
  };
  const erase = () => {
    if (retired) return;
    enabled = false; counts = ZERO; preview = null; publish();
  };
  const controller: ScreenCountsController = Object.freeze({
    subscribe(listener: () => void) {
      if (retired || typeof listener !== 'function' || listeners.size >= MAX_SUBSCRIBERS) return () => {};
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot: () => snapshot,
    optIn() {
      if (retired || enabled) return;
      enabled = true;
      if (foreground && category !== null) count(category); else publish();
    },
    optOut: erase,
    clear: erase,
    reviewExport() {
      if (retired || !enabled || !foreground) return null;
      // Literal ASCII keys/format and bounded integers make this also the UTF-8 byte bound.
      const text = JSON.stringify({ format: 'p2p-offramp/local-screen-counts/v1', counts }, null, 2) + '\n';
      if (text.length > MAX_EXPORT_UNITS) return null;
      const issued = Object.freeze({ text }); preview = issued; publish();
      return preview === issued && !retired && enabled && foreground ? issued : null;
    },
    confirmExport(input: unknown) {
      // Identity comparison reads no foreign fields/getters. Every count/consent/lifetime change revokes it.
      return !retired && enabled && foreground && preview !== null && input === preview ? preview.text : null;
    },
  });
  const observer: ScreenCountsObserver = Object.freeze({
    commit(next: ScreenCategory | null, visible: boolean) {
      if (retired || typeof visible !== 'boolean' || next !== null && !SCREEN_CATEGORIES.includes(next)) return;
      const entry = visible && (!foreground || next !== category);
      category = next; foreground = visible;
      if (enabled && entry && next !== null) count(next);
      else if (!visible && preview !== null) { preview = null; publish(); }
    },
    retire() {
      if (retired) return;
      retired = true; enabled = false; foreground = false; category = null; counts = ZERO; preview = null;
      publish();
    },
  });
  return Object.freeze({ controller, observer });
}
