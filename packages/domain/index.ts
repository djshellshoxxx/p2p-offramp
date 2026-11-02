/** Public diagnostic boundary; no storage, provider or private journal access is exported. */
export { createCoreError, createOperationId, normalizeError } from './src/errors.ts';
export type { CoreError, CoreErrorCode, CoreResult, RecoveryAction } from './src/errors.ts';
export { RegistryService } from './src/registry.ts';
export { encodePrivateAgreement, encodeCapabilities, encodeSolanaTerms, checkFundingWindow, sha256Hex, TermsError } from './src/trade-terms.ts';
export type { PrivateAgreementV1, CapabilityV1, SolanaTermsInput } from './src/trade-terms.ts';
export { reviewTermsBytes, reviewTermsDocument, TERMS_REVIEW_FORMAT, MAX_TERMS_REVIEW_BYTES } from './src/terms-review.ts';
export type { EvmTradeTermsV1, TermsReviewDocumentV1, TermsReviewRejection, RegistryLookup, ReviewedEvmTerms, TermsReviewResult } from './src/terms-review.ts';
export { createPrivacyViewReader } from './src/privacy-view.ts';
export type { PrivacyView, PrivacyViewReader, PrivacyTransportPort, PrivacyObservationPort, PrivacyObservationSnapshot, PrivacyCapabilityObservation, PrivacyIndicator, PrivacyRouteIndicator, PrivacyReason, VaultPrivacyState, MessagingPrivacyState, ProofPrivacyState } from './src/privacy-view.ts';
export { createJourneyProjection } from './src/journey-view.ts';
export type { JourneyStep, JourneyView, JourneyProjection, JourneyPaymentGuidanceObservation, JourneyPaymentGuidancePort } from './src/journey-view.ts';
export { createObservationDispatcher, OBSERVATION_TTL_MS, MAX_HINT_OBSERVERS } from './src/observation-dispatcher.ts';
export type { ObservationDispatcher, ObservationDispatcherOptions, ContextHintPublisher, ContextHintSnapshot } from './src/observation-dispatcher.ts';

export type { PrivacyEndpointConfiguration, PrivacyEndpointSnapshot, PrivacyEndpointPort, PrivacyEndpointOrigin, PrivacyEndpointDetails } from './src/privacy-view.ts';
