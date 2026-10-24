# Proximity channel lifecycle

## 1. Metadata

- **Specification ID:** MEET06
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Section:** 02_SMART_MEETUP_GEOLOCATION_ENGINE
- **Feature:** feature_2.2_p2p_proximity_pings
- **Module:** module_2.2.1_webrtc_mesh
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5

## 2. Objective

Provide bounded liveness hints over an optional authenticated data channel. Round-trip time or a connected WebRTC channel does not measure physical distance or prove presence.

This is a Phase 5 optional extension. MUST is normative. Core manual offer, funding, chat, seller release and timeout refund MUST work when this module and all map/proof/WebRTC packages are absent. No location output changes funded trade terms or grants settlement authority. All concrete provider/library versions, supported browser entries and artifact digests must be recorded at implementation; no unreviewed integration is implied.

## 3. Architecture and data flow

Use one RTCPeerConnection and one ordered reliable data channel labeled p2p-offramp-proximity-v1 per trade session. No audio/video tracks, microphone, camera, mesh fanout or arbitrary file transfer is allowed. Signaling and ICE policies are MEET05/MEET04.

## 4. Algorithms and invariants

States: disabled -> negotiating -> authenticating -> connected -> degraded -> closed. Negotiation deadline 30s; authentication deadline 5s. After DTLS opens, each side sends a fresh 32-byte challenge and a signed response binding challenge, sessionId, participant keys, termsHash and negotiated DTLS fingerprints using the shared messaging identity signing adapter. If that adapter cannot sign this domain, capability is unsupported; do not invent a substitute identity.
Send heartbeat every 10s while foreground, containing only sequence and nonce; three unanswered heartbeats mark degraded. Close after 60s without authenticated activity, on consent loss, page hide, account change, trade end or policy violation. At most two automatic reconnections with 2s then 5s delays, still within consent; then require manual retry. Closing clears timers, challenges, buffers and peer object.
Application frames <=1024 bytes, receive cap 10/s and queue cap 32KiB. On overflow close rather than retaining unbounded data. Local teardown is idempotent; a late callback cannot transition closed back to connected.

## 5. Interfaces and failure behavior

```typescript
interface ProximityFrame {v:1; sessionId:string; generation:number; seq:number; type:"challenge"|"auth"|"ping"|"pong"|"close"; body:string}
interface ChannelStatus {state:"disabled"|"negotiating"|"authenticating"|"connected"|"degraded"|"closed"; physicalPresence:"unverified"; reason?:string}
closeProximity(reason:string): void;
```
Frames are rejected before application dispatch unless channel session, sequence and authenticated peer match. Errors distinguish AUTH_FAILED, NEGOTIATION_TIMEOUT, RATE_LIMIT and POLICY_CHANGE. Closed status cannot alter escrow state.

## 6. Threat assessment

A relay or distant colluding peer can forward challenges in real time; authentication proves key control, not co-location. IP geolocation and low latency are not acceptable presence checks. Floods and reconnect loops waste battery; bounds and foreground-only operation limit damage. A compromised peer can stop heartbeat replies without affecting core trading.

## 7. Verification and references

Fault-inject SDP loss, auth signature corruption, reflected challenges, swapped fingerprints, duplicate sequences, 11 frames/s, a full send buffer and remote silence. Each transitions to the specified bounded state without settlement effects. After 100 open/close cycles there are zero live peer connections, timers or sensor watches. Two supported browser families must authenticate interoperably before capability advertisement.

Acceptance evidence MUST record fixture inputs, expected outputs, actual browser/provider versions and failures; these planned cases are not passing test results. Independent review and the core-only regression remain release gates.

Primary shared authority: [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md), [roadmap](../../../DEVELOPMENT_ROADMAP.md), [G05 routing](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md). Protocol references are design inputs, not evaluated dependencies: [Geolocation Recommendation, 2024-06-13](https://www.w3.org/TR/2024/REC-geolocation-20240613/), [WebRTC Recommendation, 2025-03-13](https://www.w3.org/TR/2025/REC-webrtc-20250313/), [RFC8785 JCS, June 2020](https://www.rfc-editor.org/rfc/rfc8785), [Mapbox Vector Tile 2.1](https://github.com/mapbox/vector-tile-spec/tree/master/2.1). Select only applicable references when implementing and freeze evaluated upstream revisions in the dependency manifest.
