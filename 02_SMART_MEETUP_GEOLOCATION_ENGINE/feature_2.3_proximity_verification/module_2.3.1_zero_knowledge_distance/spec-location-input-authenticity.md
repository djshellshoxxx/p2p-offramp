# Location input authenticity

## 1. Metadata

- **Specification ID:** MEET08
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Section:** 02_SMART_MEETUP_GEOLOCATION_ENGINE
- **Feature:** feature_2.3_proximity_verification
- **Module:** module_2.3.1_zero_knowledge_distance
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5

## 2. Objective

Label provenance and freshness of coordinate claims honestly. Browser geolocation is an untrusted reported observation. No available browser API by itself supplies cryptographic physical-presence attestation.

This is a Phase 5 optional extension. MUST is normative. Core manual offer, funding, chat, seller release and timeout refund MUST work when this module and all map/proof/WebRTC packages are absent. No location output changes funded trade terms or grants settlement authority. All concrete provider/library versions, supported browser entries and artifact digests must be recorded at implementation; no unreviewed integration is implied.

## 3. Architecture and data flow

A local sensor adapter normalizes GeolocationPosition into a memory-only LocationClaim. The proof worker may consume its coordinates but cannot strengthen provenance. A future hardware/OS attestation adapter requires a reviewed trust root, signed challenge schema, revocation policy and device/firmware matrix; none is approved.

## 4. Algorithms and invariants

Accept finite latitude/longitude, accuracy >0 and <=100m, timestamp no more than 30s old or 5s in the future. Timestamp is a local plausibility check, not trusted time. Record monotonic receipt time and reject after 30s regardless of wall-clock changes. Do not collect altitude, speed or heading.
Claims with accuracy>25m are unsuitable for 50m proximity hints and yield uncertain; they may still feed coarse discovery up to the 100m limit. A jump exceeding 100m/s between accepted samples resets dwell and marks inconsistent, not fraudulent; genuine travel and faulty clocks are possible. Never “repair” a stale coordinate by overwriting its timestamp.
Raw coordinates are not signed as physical truth or sent in public events. Manual coordinates receive provenance=manual and cannot satisfy sensor-based geofence inputs. Unsupported attestation requests fail closed. Consent revocation invalidates the claim by generation even before freshness expiry.

## 5. Interfaces and failure behavior

```typescript
interface LocationClaim {v:1; lat:number; lon:number; accuracyM:number; sampledAtMs:number; receivedMonotonicMs:number; provenance:"browser-reported"|"manual"; consentGeneration:number}
interface AuthenticityResult {status:"reported"|"uncertain"|"unsupported"|"rejected"; reason?:"stale"|"inaccurate"|"inconsistent"|"invalid"}
assessClaim(claim:LocationClaim, nowMonotonicMs:number): AuthenticityResult;
```
Any future attestation has a separate versioned envelope and explicit trust-root registry. No opaque provider boolean upgrades provenance to authenticated.

## 6. Threat assessment

Mock-location tools, browser devtools, malware and colluding peers can fabricate inputs. Replay-resistant attestations still may be relayed, and trusted devices may be carried by another person. Sensor freshness does not bind a human or cash exchange. UI and evidence exports retain provenance and accuracy limits, not “GPS verified” labels.

## 7. Verification and references

Mock timestamps at -30001ms/+5001ms, NaN/Infinity, negative/zero accuracy, impossible jumps and manual inputs. None becomes authenticated presence. Wall-clock rollback cannot extend monotonic lifetime. Delete raw claims on consent revoke and assert no coordinates in persistent storage, network logs or diagnostics. No attestation capability is advertised without published device-specific spoofing/relay tests and revocation-outage behavior.

Acceptance evidence MUST record fixture inputs, expected outputs, actual browser/provider versions and failures; these planned cases are not passing test results. Independent review and the core-only regression remain release gates.

Primary shared authority: [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md), [roadmap](../../../DEVELOPMENT_ROADMAP.md), [G05 routing](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md). Protocol references are design inputs, not evaluated dependencies: [Geolocation Recommendation, 2024-06-13](https://www.w3.org/TR/2024/REC-geolocation-20240613/), [WebRTC Recommendation, 2025-03-13](https://www.w3.org/TR/2025/REC-webrtc-20250313/), [RFC8785 JCS, June 2020](https://www.rfc-editor.org/rfc/rfc8785), [Mapbox Vector Tile 2.1](https://github.com/mapbox/vector-tile-spec/tree/master/2.1). Select only applicable references when implementing and freeze evaluated upstream revisions in the dependency manifest.
