/** Compatibility views; all rendered English copy lives in locale/en.ts. */
import { english, englishGroup } from '../locale/en.ts';
export const tradeMessages = Object.freeze({
  ...englishGroup('trade'),
  baseUnits: (units: string, decimals: number) => english('trade', 'baseUnits', { units, decimals }),
});
export const tradePageMessages = Object.freeze({
  ...englishGroup('tradePage'),
  // These projections preserve the existing abbreviated fingerprint and ISO display. Neither changes canonical data.
  testnetLocalProofBanner: (keyId: string, sequence: number, expiresAt: number) => english('tradePage', 'testnetLocalProofBanner', {
    key: keyId.slice(0, 16), sequence, expires: new Date(expiresAt * 1000).toISOString(),
  }),
  testnetBanner: (keyId: string, sequence: number, expiresAt: number) => english('tradePage', 'testnetBanner', {
    key: keyId.slice(0, 16), sequence, expires: new Date(expiresAt * 1000).toISOString(),
  }),
  sessionItem: (orderId: string, revision: string) => english('tradePage', 'sessionItem', { orderId, revision }),
  savedSkipped: (count: number) => english('tradePage', 'savedSkipped', { count }),
  unreviewableItem: (recordId: string) => english('tradePage', 'unreviewableItem', { record: recordId.slice(0, 8) }),
  savedBusy: englishGroup('tradePageSavedBusy'), savedDone: englishGroup('tradePageSavedDone'),
  savedFailed: englishGroup('tradePageSavedFailed') as Readonly<Record<string, string>>,
  rejected: englishGroup('tradePageRejected'),
});
