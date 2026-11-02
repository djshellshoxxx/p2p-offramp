/** Offline diagnostics only. No default math profile, network client, secret import, funding or spending authority. */
export { createOfflineStealth } from './src/service.ts';
export type { OfflineStealth, OfflineStealthOptions, ViewingHandle, MatchReport } from './src/service.ts';
export { createEncryptedComparisonStore } from './src/store.ts';
export type { EncryptedComparisonStore, ComparisonStoreOptions } from './src/store.ts';
export { decodeAnnouncement, parseMetadataHex, ANNOUNCEMENT_TOPIC0 } from './src/announcer.ts';
export type { Announcement, DecodedAnnouncement, RawAnnouncementLog } from './src/announcer.ts';
export type { ComparisonRequest, OfflinePageSource, OfflinePageQuery, ComparisonReport } from './src/pages.ts';
export type { ClaimedCursor, ObservedAnnouncement } from './src/records.ts';
export type { LocalProfileId, OfflineContext } from './src/profiles.ts';
export type { StealthResult, StealthError, DiagnosticOnly } from './src/shared.ts';
