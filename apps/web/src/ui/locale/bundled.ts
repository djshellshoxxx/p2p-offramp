/** Maintained build composition. No reviewed translated bundle is configured.
 * Test builds may explicitly replace this module with draft fixtures; production never reads a remote catalog.
 */
import type { BundledLocaleConfiguration } from './runtime.ts';
export const bundledLocaleConfiguration: BundledLocaleConfiguration = Object.freeze({
  developmentFixtures: false,
  fixtures: Object.freeze([]),
  preferences: Object.freeze({
    read() { return typeof window === 'undefined' ? null : window.localStorage.getItem('p2p-offramp.locale.v1'); },
    write(id: string) { if (typeof window !== 'undefined') window.localStorage.setItem('p2p-offramp.locale.v1', id); },
  }),
});
