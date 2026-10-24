# Safe zone publication policy

## 1. Metadata

- **Specification ID:** MEET11
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Section:** 02_SMART_MEETUP_GEOLOCATION_ENGINE
- **Feature:** feature_2.4_safe_zone_discovery
- **Module:** module_2.4.1_signed_zone_directory
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5

## 2. Objective

Control public recommendation admission, revision, suspension and revocation. The static client has no global moderation authority; local publisher trust policy must be transparent and exportable.

This is a Phase 5 optional extension. MUST is normative. Core manual offer, funding, chat, seller release and timeout refund MUST work when this module and all map/proof/WebRTC packages are absent. No location output changes funded trade terms or grants settlement authority. All concrete provider/library versions, supported browser entries and artifact digests must be recorded at implementation; no unreviewed integration is implied.

## 3. Architecture and data flow

A directory bundle contains MEET10 signed records and signed publisher revocations. A separately reviewed local policy selects approved publisher keys and licenses. Default registry is empty: directory recommendations remain disabled until maintainers publish an approved signed bundle, provenance and moderation ownership. Manual venue coordination remains usable.

## 4. Algorithms and invariants

Submission is an offline record proposal; no automatic public upload or user location telemetry. Moderator checks public-place status, license/attribution, source provenance and observation dates before accepting. Residential addresses and unverifiable “guaranteed safe” claims are rejected. Publication requires the publisher's signed increasing revision; two records with equal revision and different digest quarantine the venue as equivocation.
Select latest valid revision per (publisher,venueId), then apply revocation before ranking. Revocation envelope binds publisher, venueId or publisher scope, sequence, effectiveAt and reason code. A publisher may revoke its own records; local policy may block any publisher. A locally blocked publisher cannot self-unblock.
Refresh only under map/directory fetch consent, no more than once per hour. Cache revocation high-water marks encrypted for 90 days; never resurrect a lower revision from an old bundle. Records older than 30 days expire; a directory not refreshed for 24h displays stale and disables recommendations until refreshed or user explicitly views cached informational entries. Local clock uncertainty labels freshness unknown.

## 5. Interfaces and failure behavior

```typescript
interface VenueDecision {recordDigest:string; state:"pending"|"recommended"|"stale"|"expired"|"revoked"|"quarantined"|"blocked"; reason:string; policyVersion:string}
interface VenueRevocation {v:1; publisherKey:string; venueId:string|"*"; sequence:number; effectiveAtMs:number; reason:"closed"|"incorrect"|"abuse"|"key-compromise"; signature:string}
applyDirectory(records:VenueRecord[], revocations:VenueRevocation[]): Promise<VenueDecision[]>;
```
Bundle cap 5000 records/10MiB. Reject invalid entries individually, report counts and never retain raw user reports by default. Key compromise requires reviewed trust-policy update, not a signature by the compromised key alone.

## 6. Threat assessment

Sybil publishers cannot acquire trust through record volume. Publisher reputation does not certify a venue. Suppressed revocations and rollback bundles are detected only against retained high-water marks; fresh installs still trust current configured bundle distribution. Reports can be abusive or expose victims; do not publish reporter identities or trade transcripts.

## 7. Verification and references

Replay a pre-revocation bundle, insert conflicting same-revision records, revoke publisher scope, rotate an unapproved key and load a 5001-record bundle. No revoked or quarantined venue may be recommended. Simulate offline 24h/30d thresholds and wall-clock rollback; stale/unknown labels are mandatory. Verify core trade flow with empty directory and corrupt bundle. Enabling requires named moderation owner and key recovery runbook.

Acceptance evidence MUST record fixture inputs, expected outputs, actual browser/provider versions and failures; these planned cases are not passing test results. Independent review and the core-only regression remain release gates.

Primary shared authority: [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md), [roadmap](../../../DEVELOPMENT_ROADMAP.md), [G05 routing](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md). Protocol references are design inputs, not evaluated dependencies: [Geolocation Recommendation, 2024-06-13](https://www.w3.org/TR/2024/REC-geolocation-20240613/), [WebRTC Recommendation, 2025-03-13](https://www.w3.org/TR/2025/REC-webrtc-20250313/), [RFC8785 JCS, June 2020](https://www.rfc-editor.org/rfc/rfc8785), [Mapbox Vector Tile 2.1](https://github.com/mapbox/vector-tile-spec/tree/master/2.1). Select only applicable references when implementing and freeze evaluated upstream revisions in the dependency manifest.
