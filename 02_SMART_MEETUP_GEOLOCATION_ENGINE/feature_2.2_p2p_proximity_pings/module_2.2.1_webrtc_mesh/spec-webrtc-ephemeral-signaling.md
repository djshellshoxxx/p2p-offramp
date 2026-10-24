# WebRTC ephemeral signaling

## 1. Metadata

- **Specification ID:** MEET05
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Section:** 02_SMART_MEETUP_GEOLOCATION_ENGINE
- **Feature:** feature_2.2_p2p_proximity_pings
- **Module:** module_2.2.1_webrtc_mesh
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5

## 2. Objective

Exchange authenticated short-lived signaling only between already matched trade participants, using the existing encrypted NIP-17/44/59 trade session. No public discovery event carries SDP or ICE candidates.

This is a Phase 5 optional extension. MUST is normative. Core manual offer, funding, chat, seller release and timeout refund MUST work when this module and all map/proof/WebRTC packages are absent. No location output changes funded trade terms or grants settlement authority. All concrete provider/library versions, supported browser entries and artifact digests must be recorded at implementation; no unreviewed integration is implied.

## 3. Architecture and data flow

The trade messaging adapter authenticates participant keys and supplies termsHash plus the full core TradeBinding. Signaling is an application payload inside that encrypted session; relay event signatures alone are insufficient to authenticate the inner participant. No custom Nostr kind or cryptographic construction is introduced here.

## 4. Algorithms and invariants

Initiator is the participant with lexicographically lower bound messaging public key; this avoids offer glare. Create a random 128-bit sessionId and generation=0. Send offer, accept one answer, then exchange bounded trickle candidates. Each envelope has monotonic per-sender seq starting at zero; duplicate IDs are ignored, sequence gaps up to 32 buffered for <=5s, larger gaps terminate.
Envelope lifetime is <=60s; accept local clock skew <=30s and enforce an additional monotonic local negotiation timeout of 30s. Bind both participant keys, terms hash, trade binding, session ID and consent generation. ICE restart requires incremented generation and fresh nonce, maximum two restarts per session. Messages from old generations are ignored without reopening channels.
Keep replay IDs in encrypted storage until session expiry plus five minutes, max 256 entries/session. No auto-resend after reconnect until active consent is revalidated. Expiry is local processing policy, not relay deletion; use underlying Nostr expiry where supported without claiming erasure.

## 5. Interfaces and failure behavior

```typescript
interface SignalV1 {v:1; type:"offer"|"answer"|"candidate"|"close"; tradeHash:string; termsHash:string; sessionId:string; generation:number; seq:number; sender:string; recipient:string; issuedAtMs:number; expiresAtMs:number; payload:string}
receiveSignal(authenticatedPeer:string, message:SignalV1): Promise<void>;
```
Canonical tradeHash is the shared trade-terms binding digest, not a display ID. Total encoded envelope <=72KiB; candidate payload <=2KiB. Unknown type/version, peer mismatch, stale consent or replay returns a local typed error and never sends an echo containing payload.

## 6. Threat assessment

A hostile relay can reorder or suppress messages, causing availability loss only. Binding defeats cross-trade SDP replay and recipient substitution. SDP can contain IPs and fingerprints; apply MEET04 before sending and receiving. Never log signaling content, place it in URLs or upload it to analytics. Encryption cannot hide relay timing and sender/recipient metadata completely.

## 7. Verification and references

Two independent clients exchange offer/answer/candidates through the core messaging adapter. Alter every binding field in a valid authenticated envelope and expect rejection. Replay after restart, change participant account, reorder 33 messages, send oversized SDP and expire consent during offer construction. Assert no channel is created from any rejected envelope. Simulated relay outage returns to manual coordination within 30s.

Acceptance evidence MUST record fixture inputs, expected outputs, actual browser/provider versions and failures; these planned cases are not passing test results. Independent review and the core-only regression remain release gates.

Primary shared authority: [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md), [roadmap](../../../DEVELOPMENT_ROADMAP.md), [G05 routing](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md). Protocol references are design inputs, not evaluated dependencies: [Geolocation Recommendation, 2024-06-13](https://www.w3.org/TR/2024/REC-geolocation-20240613/), [WebRTC Recommendation, 2025-03-13](https://www.w3.org/TR/2025/REC-webrtc-20250313/), [RFC8785 JCS, June 2020](https://www.rfc-editor.org/rfc/rfc8785), [Mapbox Vector Tile 2.1](https://github.com/mapbox/vector-tile-spec/tree/master/2.1). Select only applicable references when implementing and freeze evaluated upstream revisions in the dependency manifest.
