/** Optional local meetup primitives. No default app registration, sensor, transport, wallet or proof provider. */
export {
  createLocationConsentController,
  MAX_CONSENT_MS,
  SENSOR_OPTIONS,
} from "./src/consent.ts";
export type {
  LocationConsentController,
  LocationConsent,
  ConsentControllerOptions,
  ConsentRequest,
  ConsentExplanation,
  ConsentView,
  ConsentState,
} from "./src/consent.ts";
export { assessClaim } from "./src/location-claim.ts";
export type {
  LocationClaim,
  AuthenticityResult,
} from "./src/location-claim.ts";
export {
  encodeGeohash,
  decodeGeohash,
  regionFor,
  validateDiscoveryRegion,
  GEOHASH_ALPHABET,
} from "./src/geohash.ts";
export type {
  GeoBounds,
  BlurredMarker,
  DiscoveryRegion,
} from "./src/geohash.ts";
export type { MeetupResult, MeetupErrorCode } from "./src/shared.ts";
export {
  createDisclosureBudget,
  BUDGET_LOCK_NAME,
  BUDGET_OPERATION_MS,
  DISTANCE_THRESHOLD_CM,
  LEDGER_RECORD_ID,
  MARKER_RECORD_ID,
  MAX_BUDGET_ENTRIES,
  MAX_LIFETIME_TRADES,
} from "./src/disclosure-budget.ts";
export type {
  DisclosureBudget,
  DisclosureBudgetOptions,
  OriginBudgetCoordinator,
  ExclusiveBudgetLock,
  DisclosureReservation,
  BudgetCounts,
} from "./src/disclosure-budget.ts";
/** T56 local optional policies. No native transport, sensor, proof, map renderer or registry activation. */
export {
  inspectRelayCandidate,
  inspectRelaySdp,
  relayConfigurationTemplate,
  rtcAvailability,
  assessSelectedPair,
} from "./src/rtc-policy.ts";
export type { RtcResult, RelayCandidate } from "./src/rtc-policy.ts";
export {
  parseVenueRecord,
  parseVenueRevocation,
  encodeVenueRecord,
  encodeVenueRevocation,
  createVenueDirectory,
} from "./src/venue-directory.ts";
export type {
  VenueRecord,
  VenueRevocation,
  VenueDecision,
  DirectoryView,
  VenueDirectory,
  VenueDirectoryOptions,
} from "./src/venue-directory.ts";
export {
  parseFencePlan,
  createGeofence,
  parseMeetupClaimEvent,
  encodeMeetupClaimEvent,
  createMeetupReplayProjection,
} from "./src/geofence.ts";
export type {
  FencePlan,
  FenceScope,
  FenceState,
  FenceObservation,
  FenceController,
  MeetupClaimEvent,
  MeetupReplayProjection,
} from "./src/geofence.ts";
export {
  MAP_LIMITS,
  parseMapManifest,
  encodeMapManifest,
  mapTileKey,
  xyzForDisplay,
  checkMapDecodeLimits,
  createMapValidator,
} from "./src/map-manifest.ts";
export type {
  TileRef,
  MapManifest,
  MapEvidence,
  MapSigningProfile,
  MapValidationOptions,
  MapBundleProjection,
  MapValidator,
} from "./src/map-manifest.ts";
export type {
  PolicyScope as MeetupPolicyScope,
  PolicyResult as MeetupPolicyResult,
  PolicyCode as MeetupPolicyCode,
  PolicyVaultOptions as MeetupPolicyVaultOptions,
} from "./src/policy-data.ts";

export {createSignalDiagnosticModel} from './src/signaling-model.ts';
export type {SignalDiagnosticOptions} from './src/signaling-model.ts';
