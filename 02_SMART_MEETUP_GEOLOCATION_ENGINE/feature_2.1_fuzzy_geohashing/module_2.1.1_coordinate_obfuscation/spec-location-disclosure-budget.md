# Location disclosure budget

## 1. Metadata

- **Specification ID:** MEET03
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Section:** 02_SMART_MEETUP_GEOLOCATION_ENGINE
- **Feature:** feature_2.1_fuzzy_geohashing
- **Module:** module_2.1.1_coordinate_obfuscation
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5

## 2. Objective

Limit cumulative location releases across tabs, peers and repeated proximity challenges. Limits are best-effort within one installation; reinstalling or colluding identities cannot be prevented without an additional identity system.

This is a Phase 5 optional extension. MUST is normative. Core manual offer, funding, chat, seller release and timeout refund MUST work when this module and all map/proof/WebRTC packages are absent. No location output changes funded trade terms or grants settlement authority. All concrete provider/library versions, supported browser entries and artifact digests must be recorded at implementation; no unreviewed integration is implied.

## 3. Architecture and data flow

One origin-wide encrypted budget ledger authorizes markers, geohash regions and boolean distance disclosures before emission. Use the G02 transaction boundary and a browser cross-tab lock; if exclusive coordination is unavailable, sharing is disabled. Receivers and relay storage remain outside local erasure control.

## 4. Algorithms and invariants

Use a 15-minute sticky marker epoch, maximum four distinct epochs per rolling hour and twelve per rolling 24 hours across all peers. Permit at most three answered distance predicates per trade and twelve per rolling 24 hours globally; repeated identical challenge IDs return the cached result without new information. Exact location sharing is disabled in this baseline.
Reserve a unit atomically before computation; commit when output may have left the process. An uncertain send consumes the unit. Only confirmed pre-send cancellation releases a reservation. Do not reset counters on logout, trade deletion, failed transport or changing radius. Clock rollback blocks new epochs until prior recorded time is reached or explicit local reset with visible privacy-loss notice. No automatic reset or relay-directed budget override.
Marker requests inside the epoch return the same marker regardless of peer; manual region changes consume a new epoch. Purge ledger entries older than 24 hours plus 15 minutes; keep no coordinates in it. A loss/corruption of ledger suspends location sharing until user acknowledges a new privacy epoch.

## 5. Interfaces and failure behavior

```typescript
interface DisclosureReservation {id:string; kind:"region"|"distance"; epoch:string; tradeHash?:string; state:"reserved"|"consumed"; createdAtMs:number}
reserve(kind:"region"|"distance", tradeHash?:string): Promise<DisclosureReservation>;
consume(id:string): Promise<void>;
cancelBeforeSend(id:string): Promise<void>;
```
Identifiers are random 128-bit values. Ledger operations are idempotent. Errors distinguish EXHAUSTED, CLOCK_ROLLBACK, LEDGER_UNAVAILABLE and CONSENT_REVOKED. Budget rejection never affects escrow or manual chat.

## 6. Threat assessment

Fresh random noise for every request enables averaging. Multiple independent precision thresholds enable triangulation; require fixed 50m distance policy per trade and cap answers. Browser storage clearing defeats this protection and must be disclosed. Aggregate diagnostics contain counts only, never coordinates, peer IDs or regions.

## 7. Verification and references

Race 20 requests in two tabs at the last available unit: exactly one reservation succeeds. Crash after reservation and before send consumes conservatively after recovery. One hundred requests by different peers within an epoch expose one marker. Advance/backdate the clock, corrupt the vault, deny locks and simulate uncertain sends; none permits extra release. A 24-hour simulation records the exact maximum number of unique markers and predicates.

Acceptance evidence MUST record fixture inputs, expected outputs, actual browser/provider versions and failures; these planned cases are not passing test results. Independent review and the core-only regression remain release gates.

Primary shared authority: [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md), [roadmap](../../../DEVELOPMENT_ROADMAP.md), [G05 routing](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md). Protocol references are design inputs, not evaluated dependencies: [Geolocation Recommendation, 2024-06-13](https://www.w3.org/TR/2024/REC-geolocation-20240613/), [WebRTC Recommendation, 2025-03-13](https://www.w3.org/TR/2025/REC-webrtc-20250313/), [RFC8785 JCS, June 2020](https://www.rfc-editor.org/rfc/rfc8785), [Mapbox Vector Tile 2.1](https://github.com/mapbox/vector-tile-spec/tree/master/2.1). Select only applicable references when implementing and freeze evaluated upstream revisions in the dependency manifest.
