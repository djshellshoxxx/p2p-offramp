# Fuzzy geohash ring calculation

## 1. Metadata

- **Specification ID:** MEET02
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Section:** 02_SMART_MEETUP_GEOLOCATION_ENGINE
- **Feature:** feature_2.1_fuzzy_geohashing
- **Module:** module_2.1.1_coordinate_obfuscation
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5

## 2. Objective

Provide bounded coarse discovery regions at approximately 500 meters to 2 kilometers without publishing a raw coordinate or assuming that geohash cells have constant physical size.

This is a Phase 5 optional extension. MUST is normative. Core manual offer, funding, chat, seller release and timeout refund MUST work when this module and all map/proof/WebRTC packages are absent. No location output changes funded trade terms or grants settlement authority. All concrete provider/library versions, supported browser entries and artifact digests must be recorded at implementation; no unreviewed integration is implied.

## 3. Architecture and data flow

The ring consumes a BlurredMarker from MEET01, never the original sensor position. It emits a set of standard base32 geohash cells for local filtering or consented discovery. Raw peer positions MUST NOT be sent to a geocoding service to compute the region.

## 4. Algorithms and invariants

1. Use standard geohash alphabet 0123456789bcdefghjkmnpqrstuvwxyz, longitude-first bit interleaving and midpoint bisection. Precision is selected from lengths 4..7.
2. Choose the longest prefix whose cell diagonal at the marker latitude is at least the selected radius; enumerate that cell and its eight neighbors with longitude wrap. Merge duplicate cells and sort lexicographically. Reject latitude outside [-85,85].
3. Compute each candidate cell bounding box locally. Keep the entire 3x3 region rather than pruning based on raw coordinates; expose actual enclosing dimensions, because the radius is a target rather than a coverage promise.
4. Reject a region with more than nine cells or enclosing diagonal above 50km as UNSUPPORTED_RESOLUTION. Do not issue finer queries at cell edges or when no offers are found. Only a new consented budget epoch permits another region.
5. The UI displays coarse-region dimensions and may offer manual region selection. Manual selection uses the same budget and must be labeled user-selected rather than sensor-observed.

## 5. Interfaces and failure behavior

```typescript
interface DiscoveryRegion {v:1; precision:4|5|6|7; cells:string[]; source:"blurred"|"manual"; epoch:string; expiresAtMs:number; diagonalM:number}
regionFor(marker: BlurredMarker): DiscoveryRegion;
```
Validate characters, common precision, unique sorted cells and nine-cell cap before matching peer advertisements. A peer-supplied region is untrusted descriptive intent. Unknown versions are UNSUPPORTED_VERSION; malformed region is rejected without fallback to exact coordinates.

## 6. Threat assessment

Cell size varies with latitude; displaying a precision label as a fixed anonymity radius misleads. Cross-epoch cell intersection and colluding peers refine location. Advertisements expose coarse movement to relay observers unless invite-only encrypted discovery is used. Sybil queries cannot increase precision automatically.

## 7. Verification and references

Use independently generated fixtures at equator, 60°, 84.9°, cell corners and ±180°; encode/decode contains marker within one microdegree tolerance. Assert <=9 distinct cells, stable order, same region across repeated calls and no raw input use. Invalid alphabet, mixed lengths, ten cells and near-pole positions fail. Two independently implemented encoders must agree on at least 1000 fixed points before enabling discovery.

Acceptance evidence MUST record fixture inputs, expected outputs, actual browser/provider versions and failures; these planned cases are not passing test results. Independent review and the core-only regression remain release gates.

Primary shared authority: [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md), [roadmap](../../../DEVELOPMENT_ROADMAP.md), [G05 routing](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md). Protocol references are design inputs, not evaluated dependencies: [Geolocation Recommendation, 2024-06-13](https://www.w3.org/TR/2024/REC-geolocation-20240613/), [WebRTC Recommendation, 2025-03-13](https://www.w3.org/TR/2025/REC-webrtc-20250313/), [RFC8785 JCS, June 2020](https://www.rfc-editor.org/rfc/rfc8785), [Mapbox Vector Tile 2.1](https://github.com/mapbox/vector-tile-spec/tree/master/2.1). Select only applicable references when implementing and freeze evaluated upstream revisions in the dependency manifest.
