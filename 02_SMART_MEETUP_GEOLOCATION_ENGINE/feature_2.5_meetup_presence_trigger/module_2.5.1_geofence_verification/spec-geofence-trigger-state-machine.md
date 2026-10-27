# Geofence trigger state machine

## 1. Metadata

- **Specification ID:** MEET13
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Section:** 02_SMART_MEETUP_GEOLOCATION_ENGINE
- **Feature:** feature_2.5_meetup_presence_trigger
- **Module:** module_2.5.1_geofence_verification
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5

## 2. Objective

Produce a conservative local arrival prompt from reported coordinates with dwell and hysteresis. Geofence presence alone never authorizes cash settlement; background geofencing is unsupported in this static browser baseline.

This is a Phase 5 optional extension. MUST is normative. Core manual offer, funding, chat, seller release and timeout refund MUST work when this module and all map/proof/WebRTC packages are absent. No location output changes funded trade terms or grants settlement authority. All concrete provider/library versions, supported browser entries and artifact digests must be recorded at implementation; no unreviewed integration is implied.

## 3. Architecture and data flow

The controller consumes fresh browser-reported MEET08 claims and a user-approved public meetup center. Center changes invalidate the session and dwell history. It emits local status to UI and, after explicit user confirmation, MEET12 events. It has no wallet or settlement command interface.

## 4. Algorithms and invariants

States: inactive, outside, uncertain, entering, dwelling, arrival-prompt, arrival-confirmed, leaving, ended. Default entry radius 50m, exit radius 100m, required continuous dwell 30s and three accepted samples at least 5s apart. For distance d and reported accuracy a, enter only if d+a<=50m and a<=25m. Exit only if d-a>=100m. Values between bounds are uncertain and do not establish entry/exit. Distances use a locally pinned geodesic adapter; missing adapter is unsupported.
Start outside on fresh consent. First inside sample starts entering; later qualified samples accumulate monotonic dwell. Any stale, inconsistent, manual or inaccurate input resets dwell to uncertain. At 30s with three qualified samples show arrival-prompt; explicit user click changes to arrival-confirmed and may emit a claim. Never auto-confirm. Confirmed arrival retains label “claimed”; two exit-qualified samples >=5s apart create departure prompt. Ambiguity displays uncertain immediately and does not fabricate a departure.
Pause/hide/lock, >30s without sample, location denial, changed plan or consent revocation stops the watch and resets dwell. Resume requires new consent and fresh samples. Ended is terminal for that generation. Deadline and escrow chain time do not enter this state machine.

## 5. Interfaces and failure behavior

```typescript
interface FencePlan {v:1; planHash:string; centerLatE6:number; centerLonE6:number; enterM:50; exitM:100; dwellMs:30000}
interface FenceObservation {state:string; provenance:"browser-reported"; confirmedByUser:boolean; generation:number; reason?:string}
stepFence(plan:FencePlan, sample:LocationClaim, monotonicNowMs:number): FenceObservation;
confirmArrival(generation:number): Promise<void>;
```
No coordinates appear in FenceObservation. Reject changed plan hash, unsupported radius values, stale generations and confirmations outside arrival-prompt. Failure returns uncertain/inactive and leaves manual meetup messaging available.

## 6. Threat assessment

Spoofed GPS, carried devices and colluding peers bypass physical assumptions. Accuracy intervals are heuristic statistical bounds, not guaranteed containment. Hysteresis reduces jitter but cannot validate a sensor. Malicious repeated callbacks must not advance dwell faster than monotonic elapsed time.

## 7. Verification and references

Replay deterministic tracks with boundary jitter at 49/51/99/101m, large accuracy, delayed samples, duplicate timestamps, dateline center, page hide and clock changes. No arrival prompt before 30 monotonic seconds and three separated samples; no event before a user gesture. Inject perfect fabricated coordinates and verify provenance remains browser-reported. No geofence transition produces wallet calls or changes core release/refund guards.

Acceptance evidence MUST record fixture inputs, expected outputs, actual browser/provider versions and failures; these planned cases are not passing test results. Independent review and the core-only regression remain release gates.

Primary shared authority: [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md), [roadmap](../../../DEVELOPMENT_ROADMAP.md), [G05 routing](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md). Protocol references are design inputs, not evaluated dependencies: [Geolocation Recommendation, 2024-06-13](https://www.w3.org/TR/2024/REC-geolocation-20240613/), [WebRTC Recommendation, 2025-03-13](https://www.w3.org/TR/2025/REC-webrtc-20250313/), [RFC8785 JCS, June 2020](https://www.rfc-editor.org/rfc/rfc8785), [Mapbox Vector Tile 2.1](https://github.com/mapbox/vector-tile-spec/tree/master/2.1). Select only applicable references when implementing and freeze evaluated upstream revisions in the dependency manifest.
