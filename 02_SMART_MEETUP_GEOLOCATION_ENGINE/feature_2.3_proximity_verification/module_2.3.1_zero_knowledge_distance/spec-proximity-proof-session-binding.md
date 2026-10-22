# Proximity proof session binding

## 1. Metadata

- **Specification ID:** MEET09
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Section:** 02_SMART_MEETUP_GEOLOCATION_ENGINE
- **Feature:** feature_2.3_proximity_verification
- **Module:** module_2.3.1_zero_knowledge_distance
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5

## 2. Objective

Bind each optional distance predicate to one mutually agreed trade session and prevent replay or adaptive-threshold probing. Local budget enforcement cannot stop malicious peers proving statements elsewhere.

This is a Phase 5 optional extension. MUST is normative. Core manual offer, funding, chat, seller release and timeout refund MUST work when this module and all map/proof/WebRTC packages are absent. No location output changes funded trade terms or grants settlement authority. All concrete provider/library versions, supported browser entries and artifact digests must be recorded at implementation; no unreviewed integration is implied.

## 3. Architecture and data flow

The coordinator derives tradeHash and termsHash from canonical core terms, obtains both participants’ authenticated consent and reserves a MEET03 distance unit. Commitments are exchanged through encrypted trade chat. Unknown proof adapters produce unsupported and leave manual coordination available.

## 4. Algorithms and invariants

Create 32 random challenge bytes after both witness commitments are received. Challenge binds domain p2p-offramp/distance/v1, full core TradeBinding, termsHash, ordered participant keys, both commitments, chartId, fixed thresholdCm=5000 and expiry. Serialize this object with RFC8785 JCS and hash with SHA-256; no concatenated ambiguous strings.
Both participants acknowledge the same digest before proof work. Challenge expires after 60s and cannot be extended; monotonic local verification deadline applies even if the clock rolls back. Each session accepts at most one proof result for a given ordered commitment pair and nonce. Store consumed challenge digests encrypted for 24h; max 100/trade, after which stop proof requests. MEET03 imposes the tighter answered-query limits.
Mark a challenge consumed atomically before presenting valid results; duplicates return the prior result without repeating side effects. Changed trade terms, account, session, chart or consent generation invalidate outstanding work. Retry after a failed worker requires a fresh nonce and budget authorization if a result could have been disclosed.

## 5. Interfaces and failure behavior

```typescript
interface DistanceChallenge {v:1; domain:"p2p-offramp/distance/v1"; tradeHash:string; termsHash:string; participants:[string,string]; commitments:[string,string]; chartId:string; thresholdCm:5000; nonceHex:string; issuedAtMs:number; expiresAtMs:number}
acceptProof(challenge:DistanceChallenge, proof:Uint8Array): Promise<"unsupported"|"invalid"|"expired"|"replay"|"valid-claimed-coordinates">;
```
Canonical full trade binding is included in the hashed object alongside tradeHash. Nonce is exactly 64 lowercase hex characters. Duplicate JSON keys, unknown fields, unsorted participant mapping and unknown versions are rejected before hashing.

## 6. Threat assessment

Cross-trade replay and proof substitution fail only when every public input is constrained by the verifier. Authenticated channels do not bind an unconstrained circuit input. Repeated adaptive commitments can triangulate one peer; fixed threshold, three-answer trade budget and no public verifier oracle reduce exposure. A relayed live challenge still does not prove proximity.

## 7. Verification and references

Generate one valid fixture then change chain network, deployment, trade, terms, participant order, commitment, chart, nonce or expiry independently; every mutation fails. Two concurrent verifications consume one challenge exactly once. Reconnect and reload do not reset consumed IDs. Verify JCS/digest interoperability across two implementations, including Unicode and duplicate-key rejection. No result changes escrow authority.

Acceptance evidence MUST record fixture inputs, expected outputs, actual browser/provider versions and failures; these planned cases are not passing test results. Independent review and the core-only regression remain release gates.

Primary shared authority: [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md), [roadmap](../../../DEVELOPMENT_ROADMAP.md), [G05 routing](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md). Protocol references are design inputs, not evaluated dependencies: [Geolocation Recommendation, 2024-06-13](https://www.w3.org/TR/2024/REC-geolocation-20240613/), [WebRTC Recommendation, 2025-03-13](https://www.w3.org/TR/2025/REC-webrtc-20250313/), [RFC8785 JCS, June 2020](https://www.rfc-editor.org/rfc/rfc8785), [Mapbox Vector Tile 2.1](https://github.com/mapbox/vector-tile-spec/tree/master/2.1). Select only applicable references when implementing and freeze evaluated upstream revisions in the dependency manifest.
