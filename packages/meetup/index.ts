/** Optional local meetup primitives. No default app registration, sensor, transport, wallet or proof provider. */
export { createLocationConsentController, MAX_CONSENT_MS, SENSOR_OPTIONS } from './src/consent.ts';
export type { LocationConsentController, LocationConsent, ConsentControllerOptions, ConsentRequest, ConsentExplanation, ConsentView, ConsentState } from './src/consent.ts';
export { assessClaim } from './src/location-claim.ts';
export type { LocationClaim, AuthenticityResult } from './src/location-claim.ts';
export { encodeGeohash, decodeGeohash, regionFor, validateDiscoveryRegion, GEOHASH_ALPHABET } from './src/geohash.ts';
export type { GeoBounds, BlurredMarker, DiscoveryRegion } from './src/geohash.ts';
export type { MeetupResult, MeetupErrorCode } from './src/shared.ts';
export { createDisclosureBudget, BUDGET_LOCK_NAME, BUDGET_OPERATION_MS, DISTANCE_THRESHOLD_CM, LEDGER_RECORD_ID, MARKER_RECORD_ID, MAX_BUDGET_ENTRIES, MAX_LIFETIME_TRADES } from './src/disclosure-budget.ts';
export type { DisclosureBudget, DisclosureBudgetOptions, OriginBudgetCoordinator, ExclusiveBudgetLock, DisclosureReservation, BudgetCounts } from './src/disclosure-budget.ts';
