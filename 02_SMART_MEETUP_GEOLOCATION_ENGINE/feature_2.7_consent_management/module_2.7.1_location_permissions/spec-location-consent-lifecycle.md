# Location consent lifecycle

## 1. Metadata

- **Specification ID:** G31
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Section:** 02_SMART_MEETUP_GEOLOCATION_ENGINE
- **Feature:** feature_2.7_consent_management
- **Module:** module_2.7.1_location_permissions
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5

## 2. Objective

Make meetup location collection and sharing separately opt-in per trade session. Browser permission is necessary but is not application consent. Denial, unsupported devices and revocation MUST preserve the complete manual core trade.

This is a Phase 5 optional extension. MUST is normative. Core manual offer, funding, chat, seller release and timeout refund MUST work when this module and all map/proof/WebRTC packages are absent. No location output changes funded trade terms or grants settlement authority. All concrete provider/library versions, supported browser entries and artifact digests must be recorded at implementation; no unreviewed integration is implied.

## 3. Architecture and data flow

The extension controller owns an opaque consent generation and passes it to every sensor, blur, proof, map and outgoing disclosure task. Collection permission, peer sharing, direct networking and map fetch authorization are separate switches, all initially off. No location prompt appears on startup or merely opening an offer.

## 4. Algorithms and invariants

States: inactive -> explaining -> awaiting-browser -> collecting -> paused -> revoked/expired. Enter awaiting-browser only from a user gesture after showing recipient, precision, frequency, maximum 30-minute session, local retention and external retention limits. Use watchPosition only while foreground and session is active; initial options enableHighAccuracy=false, maximumAge=0, timeout=10000.
On hide, lock, account change, trade close, 30-minute expiry or permission loss: increment generation, clearWatch, cancel workers, close proximity channel and discard raw samples immediately. Pending callback generations are rejected. Resume requires a visible gesture and new application consent, even if browser permission remains granted.
Raw samples are memory-only and expire after 30 seconds; accepted coarse markers expire after 15 minutes or session end. Session consent is not restored from backup. Revocation stops future disclosure but cannot revoke recipient copies. A separate explicit action clears encrypted cached markers; disclosure counters remain without coordinates.

## 5. Interfaces and failure behavior

```typescript
interface LocationConsent {v:1; sessionId:string; tradeHash:string; generation:number; collect:boolean; shareCoarse:boolean; mapFetch:boolean; directNetwork:boolean; grantedAtMs:number; expiresAtMs:number}
startLocation(consent: LocationConsent): Promise<"collecting"|"denied"|"unsupported">;
revokeLocation(sessionId:string): Promise<void>;
```
Consent objects are internal capabilities, not accepted from relays. Errors include INSECURE_CONTEXT, PERMISSION_DENIED, SENSOR_UNAVAILABLE, TIMEOUT, STALE_GENERATION. No error causes permission reprompt loops or direct network fallback.

## 6. Threat assessment

A malicious peer can pressure precision increases; no remote message can alter consent. OS location spoofing, browser extensions and compromised sensors remain possible. XSS in an unlocked origin can defeat local controls; G04 is required. Explanations must say coordinate evidence cannot verify personal safety or authorize payment.

## 7. Verification and references

Instrument navigator.geolocation: no calls before gesture; permission denied leaves discover/chat/release/refund functional. Revoke during callback, worker completion and queued send; zero stale-generation packets leave. Hide/lock/session expiry clears the watch and memory within one event-loop turn after handler execution. Browser restart restores no active consent. Test supported browsers with denied Permissions API access and insecure origins, returning unsupported explicitly.

Acceptance evidence MUST record fixture inputs, expected outputs, actual browser/provider versions and failures; these planned cases are not passing test results. Independent review and the core-only regression remain release gates.

Primary shared authority: [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md), [roadmap](../../../DEVELOPMENT_ROADMAP.md), [G05 routing](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md). Protocol references are design inputs, not evaluated dependencies: [Geolocation Recommendation, 2024-06-13](https://www.w3.org/TR/2024/REC-geolocation-20240613/), [WebRTC Recommendation, 2025-03-13](https://www.w3.org/TR/2025/REC-webrtc-20250313/), [RFC8785 JCS, June 2020](https://www.rfc-editor.org/rfc/rfc8785), [Mapbox Vector Tile 2.1](https://github.com/mapbox/vector-tile-spec/tree/master/2.1). Select only applicable references when implementing and freeze evaluated upstream revisions in the dependency manifest.
