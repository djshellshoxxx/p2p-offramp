# Distance proof statement

## 1. Metadata

- **Specification ID:** MEET07
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Section:** 02_SMART_MEETUP_GEOLOCATION_ENGINE
- **Feature:** feature_2.3_proximity_verification
- **Module:** module_2.3.1_zero_knowledge_distance
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5

## 2. Objective

Specify an optional zero-knowledge predicate over committed coordinate claims. No proof system, circuit or trusted setup is approved yet; proof generation and verified badges remain disabled until reviewed artifacts and interoperability vectors exist. A proved numerical predicate never authenticates sensor truth.

This is a Phase 5 optional extension. MUST is normative. Core manual offer, funding, chat, seller release and timeout refund MUST work when this module and all map/proof/WebRTC packages are absent. No location output changes funded trade terms or grants settlement authority. All concrete provider/library versions, supported browser entries and artifact digests must be recorded at implementation; no unreviewed integration is implied.

## 3. Architecture and data flow

The eventual prover consumes MEET08 input claims and MEET09 session binding in an isolated bounded worker. The verifier receives only public commitments, a fixed threshold and proof bytes. No core escrow contract consumes these results. An on-chain distance authority would require a separate opt-in version and review.

## 4. Algorithms and invariants

The design baseline uses a shared local tangent chart chosen from the public coarse region. Public origin is integer lat/lon microdegrees within [-85,85]. Project claimed coordinates to east/north integer centimeters with a specified projection implementation to be pinned before enabling; witnesses are signed integers in [-1000000,1000000] (10km). Reject outside-chart coordinates rather than wrap or saturate.
The circuit MUST range-check every signed coordinate, commitment salt and subtraction, then enforce (xA-xB)^2+(yA-yB)^2 <= 5000^2 for the fixed 50m claimed-coordinate threshold. Maximum squared sum is 8*10^12; field modulus must exceed this with explicit signed encoding constraints. No modular-wrap distance comparison is valid.
Projection plus quantization error MUST be independently bounded to <=1m across the supported chart. Display “claimed projected distance <=50m, model error <=1m”; do not display actual distance or exact presence. Threshold, chart origin, circuit version, commitments and challenge digest are public inputs. Commitment primitive, curve, field, setup, proof format and verifier hashes are unresolved implementation gates, not guessed choices.

## 5. Interfaces and failure behavior

```typescript
interface DistanceStatement {v:1; circuitId:string; chartId:string; originLatE6:number; originLonE6:number; thresholdCm:5000; commitmentA:string; commitmentB:string; challengeDigest:string}
interface DistanceVerification {status:"unsupported"|"invalid"|"valid-claimed-coordinates"; statementDigest?:string}
verifyDistance(statement:DistanceStatement, proof:Uint8Array): Promise<DistanceVerification>;
```
Proof cap 1MiB, worker deadline 60s, one job/tab. Until approved registry entries exist, return unsupported before downloading proving assets. Reject unknown circuit IDs; no heuristic verifier or client-supplied verification keys.

## 6. Threat assessment

Unchecked arithmetic permits field-wrap proofs; explicit range constraints are mandatory. Weak commitment randomness enables coordinate enumeration. A true predicate about invented witnesses remains physically false. A malicious prover can choose any coordinate absent an evaluated authenticity adapter. Repeated threshold queries leak location; the fixed threshold and MEET03 limit oracle access.

## 7. Verification and references

Before enablement publish circuit/source/compiler/verifier/setup provenance and independent constraint review. Required vectors include exact 5000cm equality, 5001cm axis distance, diagonal boundary, negatives, maximal ranges, modular-overflow witnesses, changed public commitments and changed chart. Compare at least 10000 generated pairs to an independent integer oracle and geodesic error bounds. Missing artifacts and worker timeout return unsupported/failure, never valid.

Acceptance evidence MUST record fixture inputs, expected outputs, actual browser/provider versions and failures; these planned cases are not passing test results. Independent review and the core-only regression remain release gates.

Primary shared authority: [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md), [roadmap](../../../DEVELOPMENT_ROADMAP.md), [G05 routing](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md). Protocol references are design inputs, not evaluated dependencies: [Geolocation Recommendation, 2024-06-13](https://www.w3.org/TR/2024/REC-geolocation-20240613/), [WebRTC Recommendation, 2025-03-13](https://www.w3.org/TR/2025/REC-webrtc-20250313/), [RFC8785 JCS, June 2020](https://www.rfc-editor.org/rfc/rfc8785), [Mapbox Vector Tile 2.1](https://github.com/mapbox/vector-tile-spec/tree/master/2.1). Select only applicable references when implementing and freeze evaluated upstream revisions in the dependency manifest.
