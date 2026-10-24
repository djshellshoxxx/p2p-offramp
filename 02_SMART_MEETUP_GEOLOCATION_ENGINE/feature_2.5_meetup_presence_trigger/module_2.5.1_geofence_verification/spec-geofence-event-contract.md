# Geofence event contract

## 1. Metadata

- **Specification ID:** MEET12
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Section:** 02_SMART_MEETUP_GEOLOCATION_ENGINE
- **Feature:** feature_2.5_meetup_presence_trigger
- **Module:** module_2.5.1_geofence_verification
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5

## 2. Objective

Exchange minimal optional meetup coordination hints without raw location histories. Events authenticate a participant assertion; they do not establish cash receipt, human identity or an escrow release condition.

This is a Phase 5 optional extension. MUST is normative. Core manual offer, funding, chat, seller release and timeout refund MUST work when this module and all map/proof/WebRTC packages are absent. No location output changes funded trade terms or grants settlement authority. All concrete provider/library versions, supported browser entries and artifact digests must be recorded at implementation; no unreviewed integration is implied.

## 3. Architecture and data flow

MEET13 produces local candidate state. Only explicit confirmation may emit an encrypted trade-chat event to the bound counterparty. No public Nostr event, on-chain log, telemetry stream or directory record receives a geofence hint. Remote events are rendered separately from local observations.

## 4. Algorithms and invariants

Event domain is p2p-offramp/meetup/v1. Bind full core TradeBinding, termsHash, meetupPlanHash, participant, random session ID, monotonic sequence and expiry. meetupPlanHash commits mutually acknowledged venue/meeting plan without copying its coordinates into events. Types are arrival-claimed, departure-claimed and unavailable; raw distance, bearing, coordinates, accuracy and sensor time are prohibited.
Events expire within 5 minutes; receiver accepts <=30s clock skew, preserves expiry and never renews from reception time. Keep at most the last 32 event IDs/session and last state; duplicates are idempotent and lower sequences ignored. Encrypted history retention defaults to session end or 24h maximum, while recipient copies cannot be recalled.
Arrival requires a user gesture after local dwell; automatic background sends are forbidden. A remote arrival cannot trigger another local event. No automatic payment request, release, timeout change or courier handoff is generated. Unknown plan or changed terms marks event superseded, not a current arrival.

## 5. Interfaces and failure behavior

```typescript
interface MeetupEvent {v:1; domain:"p2p-offramp/meetup/v1"; tradeHash:string; termsHash:string; meetupPlanHash:string; sessionId:string; sender:string; seq:number; kind:"arrival-claimed"|"departure-claimed"|"unavailable"; issuedAtMs:number; expiresAtMs:number; eventId:string}
receiveMeetupEvent(peer:string, event:MeetupEvent): "accepted"|"duplicate"|"stale"|"rejected";
```
Envelope <=2KiB; eventId is random 128-bit hex. Authentication uses the core encrypted participant message contract. Strict field allowlist rejects extra coordinate fields rather than dropping them silently. No identity/signature scheme is defined independently here.

## 6. Threat assessment

Arrival timing reveals behavior even without coordinates; encrypted delivery still has metadata. Replayed arrival, substituted venue and forged participant are rejected by session/plan/authentication binding. A legitimate participant can lie about arrival; the UI states “counterparty reports arrival,” with provenance. Export is opt-in and redacts session identifiers by default.

## 7. Verification and references

Mutate every binding field; spoof sender; replay an arrival into another plan or trade; append lat/lon; exceed payload cap; expire event during reconnect. All fail without state/economic effects. Send the same valid event 100 times and assert one UI transition. Instrument all network adapters to ensure no public relay or chain emission. Two client versions with unknown event version display unsupported rather than interpreting it as arrival.

Acceptance evidence MUST record fixture inputs, expected outputs, actual browser/provider versions and failures; these planned cases are not passing test results. Independent review and the core-only regression remain release gates.

Primary shared authority: [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md), [roadmap](../../../DEVELOPMENT_ROADMAP.md), [G05 routing](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md). Protocol references are design inputs, not evaluated dependencies: [Geolocation Recommendation, 2024-06-13](https://www.w3.org/TR/2024/REC-geolocation-20240613/), [WebRTC Recommendation, 2025-03-13](https://www.w3.org/TR/2025/REC-webrtc-20250313/), [RFC8785 JCS, June 2020](https://www.rfc-editor.org/rfc/rfc8785), [Mapbox Vector Tile 2.1](https://github.com/mapbox/vector-tile-spec/tree/master/2.1). Select only applicable references when implementing and freeze evaluated upstream revisions in the dependency manifest.
