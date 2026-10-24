# ICE candidate privacy policy

## 1. Metadata

- **Specification ID:** MEET04
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Section:** 02_SMART_MEETUP_GEOLOCATION_ENGINE
- **Feature:** feature_2.2_p2p_proximity_pings
- **Module:** module_2.2.1_webrtc_mesh
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5

## 2. Objective

Constrain peer-address exposure before constructing a WebRTC connection. Relay-only is an address-disclosure policy, not Tor/I2P protection; TURN still sees client IP addresses.

This is a Phase 5 optional extension. MUST is normative. Core manual offer, funding, chat, seller release and timeout refund MUST work when this module and all map/proof/WebRTC packages are absent. No location output changes funded trade terms or grants settlement authority. All concrete provider/library versions, supported browser entries and artifact digests must be recorded at implementation; no unreviewed integration is implied.

## 3. Architecture and data flow

The transport controller checks G05 and location consent before RTCPeerConnection construction. Strict-private mode disables WebRTC unless an independently evaluated adapter can enforce its complete routing policy. Ordinary relay-only mode requires an explicitly configured, reviewed TURN service; no service is approved by this design.

## 4. Algorithms and invariants

Default policy is disabled. Relay-only mode constructs RTCConfiguration with iceTransportPolicy="relay", an allowlisted TURN configuration and no public STUN fallback. Filtering candidate events after gathering is insufficient. Direct mode uses policy="all" only after separate explicit IP-disclosure consent and is labeled direct.
Inspect outgoing and incoming SDP/candidate structures before forwarding: relay-only permits relay candidates only, rejects embedded host/srflx/prflx addresses and mDNS names; cap SDP at 64KiB and candidates at 32 per generation. Selected candidate-pair stats must confirm relay use when available; unavailable stats mean unknown, never verified. A non-relay pair closes the connection and emits POLICY_VIOLATION.
TURN credentials are ephemeral, held only in memory, never in static bundles. Expired credentials, blocked UDP/TCP, unsupported browser enforcement or missing TURN config disable proximity; no direct retry. Changing policy closes the old connection and requires a new session and consent.

## 5. Interfaces and failure behavior

```typescript
type IcePolicy="disabled"|"relay-only"|"direct-consented";
interface IcePolicyDecision {policy:IcePolicy; consentGeneration:number; turnConfigId?:string; visibility:"disabled"|"relay-observed"|"direct"|"unknown"}
prepareIce(decision:IcePolicyDecision): Promise<RTCConfiguration>;
```
Error codes: TURN_UNCONFIGURED, TURN_EXPIRED, ROUTING_UNSUPPORTED, CANDIDATE_REJECTED, POLICY_VIOLATION. Never include SDP, candidate IP or credentials in diagnostics.

## 6. Threat assessment

Host, reflexive and peer-reflexive candidates can expose addresses; browser mDNS does not remove all network leakage. TURN operators correlate sessions; unique relay usernames also link activity. Malicious peers can put addresses in arbitrary SDP fields; rejecting them prevents this client forwarding metadata but cannot make remote messages truthful. Packet capture is necessary to validate actual routing.

## 7. Verification and references

On each supported browser perform packet captures for relay-only under healthy TURN, expired credentials, TURN outage and IPv4/IPv6 networks. No peer-directed connectivity checks may occur in relay-only tests. Inject host/srflx/mDNS candidates in standalone and bundled SDP; reject before forwarding. A mock selected direct pair closes immediately. No TURN provider/browser pair is enabled until these tests and routing review are recorded.

Acceptance evidence MUST record fixture inputs, expected outputs, actual browser/provider versions and failures; these planned cases are not passing test results. Independent review and the core-only regression remain release gates.

Primary shared authority: [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md), [roadmap](../../../DEVELOPMENT_ROADMAP.md), [G05 routing](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md). Protocol references are design inputs, not evaluated dependencies: [Geolocation Recommendation, 2024-06-13](https://www.w3.org/TR/2024/REC-geolocation-20240613/), [WebRTC Recommendation, 2025-03-13](https://www.w3.org/TR/2025/REC-webrtc-20250313/), [RFC8785 JCS, June 2020](https://www.rfc-editor.org/rfc/rfc8785), [Mapbox Vector Tile 2.1](https://github.com/mapbox/vector-tile-spec/tree/master/2.1). Select only applicable references when implementing and freeze evaluated upstream revisions in the dependency manifest.
