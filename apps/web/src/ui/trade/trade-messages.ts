/** Compatibility views; all rendered English copy lives in locale/en.ts. */
import { message as english, messageGroup as englishGroup, mergeMessageViews } from '../locale/runtime.ts';
export const tradeMessages = mergeMessageViews(englishGroup('trade'), {
  baseUnits: (units: string, decimals: number) => english('trade', 'baseUnits', { units, decimals }),
});
export const tradePageMessages = mergeMessageViews(englishGroup('tradePage'), {
  // Timestamps are typed display values; source English retains ISO. Canonical registry bytes are unchanged.
  testnetLocalProofBanner: (keyId: string, sequence: number, expiresAt: number) => english('tradePage', 'testnetLocalProofBanner', {
    key: keyId.slice(0, 16), sequence, expires: expiresAt * 1000,
  }),
  testnetBanner: (keyId: string, sequence: number, expiresAt: number) => english('tradePage', 'testnetBanner', {
    key: keyId.slice(0, 16), sequence, expires: expiresAt * 1000,
  }),
  sessionItem: (orderId: string, revision: string) => english('tradePage', 'sessionItem', { orderId, revision }),
  savedSkipped: (count: number) => english('tradePage', 'savedSkipped', { count }),
  unreviewableItem: (recordId: string) => english('tradePage', 'unreviewableItem', { record: recordId.slice(0, 8) }),
  savedBusy: englishGroup('tradePageSavedBusy'), savedDone: englishGroup('tradePageSavedDone'),
  savedFailed: englishGroup('tradePageSavedFailed') as Readonly<Record<string, string>>,
  rejected: englishGroup('tradePageRejected'),
});
