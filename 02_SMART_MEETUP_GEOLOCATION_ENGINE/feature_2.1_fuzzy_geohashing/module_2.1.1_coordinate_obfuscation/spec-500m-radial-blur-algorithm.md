# 500m radial blur algorithm

## 1. Metadata

- **Specification ID:** MEET01
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Section:** 02_SMART_MEETUP_GEOLOCATION_ENGINE
- **Feature:** feature_2.1_fuzzy_geohashing
- **Module:** module_2.1.1_coordinate_obfuscation
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5

## 2. Objective

Provide an explicitly approximate discovery marker with selectable 500, 1000 or 2000 meter blur. This is a disclosure transform, not anonymity, differential privacy, GPS authentication or a physical safety guarantee. Sparse areas MAY be hidden entirely; no population provider is currently approved.

This is a Phase 5 optional extension. MUST is normative. Core manual offer, funding, chat, seller release and timeout refund MUST work when this module and all map/proof/WebRTC packages are absent. No location output changes funded trade terms or grants settlement authority. All concrete provider/library versions, supported browser entries and artifact digests must be recorded at implementation; no unreviewed integration is implied.

## 3. Architecture and data flow

The location controller supplies one accepted sample to a local blur worker. The worker receives no wallet key or relay handle. Only the blurred result passes to the disclosure budget; raw coordinates remain memory-only. The same result is reused for the complete disclosure epoch and across counterparties in that epoch, preventing fresh-noise averaging.

## 4. Algorithms and invariants

1. Reject nonfinite coordinates, latitude outside [-85,85], longitude outside [-180,180), or invalid radius. Polar operation returns unsupported rather than projecting incorrectly.
2. Draw two independent 53-bit uniforms U,V from Web Crypto; use r=R*sqrt(U), bearing=2*pi*V. Compute the spherical destination with radius 6371008.8 meters; normalize longitude to [-180,180). This samples area in the local disk approximately; numerical tolerances do not imply a minimum displacement.
3. Persist only the encrypted blurred marker, radius, epoch ID and consent generation for at most 15 minutes; never persist source or randomness. Reuse it on duplicate requests. New sample, radius or epoch requires budget authorization, not automatic resampling.
4. Display a disk of radius R+reportedAccuracy around the marker as an uncertainty explanation, capped at 5000 meters; above that, suppress the marker. Do not claim the true location is guaranteed in that disk because sensor accuracy is statistical and spoofable.
5. No automatic density-based precision increase. Unknown density uses coarse default; a user may choose a larger radius or suppress disclosure.

## 5. Interfaces and failure behavior

```typescript
interface BlurInput {lat: number; lon: number; accuracyM: number; radiusM: 500|1000|2000; epoch: string; consentGeneration: number}
interface BlurredMarker {v: 1; latE6: number; lonE6: number; radiusM: number; uncertaintyM: number; epoch: string; expiresAtMs: number}
blur(input: BlurInput): Promise<BlurredMarker>; // local-only operation
```
Round output to integer microdegrees after transformation. Errors: INVALID_COORDINATE, UNSUPPORTED_LATITUDE, INACCURATE, CONSENT_REVOKED, RNG_UNAVAILABLE, BUDGET_EXHAUSTED. RNG failure MUST suppress disclosure, never use Math.random. Consent generation is rechecked before return and send.

## 6. Threat assessment

A disk can contain one household and reveal its identity. Repeated epochs and movement reveal paths; the disclosure budget caps updates but cannot defeat colluding observers. Deterministic rounding alone is not a blur. Injected RNG or geolocation callbacks invalidate privacy claims; CSP and dependency review remain required. Recipients can retain markers forever.

## 7. Verification and references

Deterministic injected-RNG tests cover U=0, near-one, dateline crossing and invalid inputs; independent geodesic calculation checks displacement <=R+2m before rounding. Over 100000 samples, empirical mean r²/R² must be within 0.01 of 0.5 (statistical diagnostic, not a privacy proof). One hundred requests in one epoch yield byte-identical markers. Revoke during computation yields no send. Polar and missing-RNG cases return explicit errors.

Acceptance evidence MUST record fixture inputs, expected outputs, actual browser/provider versions and failures; these planned cases are not passing test results. Independent review and the core-only regression remain release gates.

Primary shared authority: [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md), [roadmap](../../../DEVELOPMENT_ROADMAP.md), [G05 routing](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md). Protocol references are design inputs, not evaluated dependencies: [Geolocation Recommendation, 2024-06-13](https://www.w3.org/TR/2024/REC-geolocation-20240613/), [WebRTC Recommendation, 2025-03-13](https://www.w3.org/TR/2025/REC-webrtc-20250313/), [RFC8785 JCS, June 2020](https://www.rfc-editor.org/rfc/rfc8785), [Mapbox Vector Tile 2.1](https://github.com/mapbox/vector-tile-spec/tree/master/2.1). Select only applicable references when implementing and freeze evaluated upstream revisions in the dependency manifest.
