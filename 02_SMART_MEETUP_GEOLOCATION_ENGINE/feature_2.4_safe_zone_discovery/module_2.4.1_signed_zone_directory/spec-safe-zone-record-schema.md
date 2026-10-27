# Safe zone record schema

## 1. Metadata

- **Specification ID:** MEET10
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Section:** 02_SMART_MEETUP_GEOLOCATION_ENGINE
- **Feature:** feature_2.4_safe_zone_discovery
- **Module:** module_2.4.1_signed_zone_directory
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5

## 2. Objective

Represent signed public venue recommendations with provenance, accessibility and expiry. “Safe zone” is a historical feature name: a signature authenticates publication, never safety, opening hours or staff cooperation.

This is a Phase 5 optional extension. MUST is normative. Core manual offer, funding, chat, seller release and timeout refund MUST work when this module and all map/proof/WebRTC packages are absent. No location output changes funded trade terms or grants settlement authority. All concrete provider/library versions, supported browser entries and artifact digests must be recorded at implementation; no unreviewed integration is implied.

## 3. Architecture and data flow

Directory readers validate a record signature under a locally approved publisher key, then apply MEET11 moderation. Venues are public places; records must not contain trader coordinates, residential meeting points or private participant identifiers. Records are content, never executable map style or HTML.

## 4. Algorithms and invariants

Use UTF-8 RFC8785 JCS for the unsigned object and Ed25519 signature with domain p2p-offramp/venue/v1 over its canonical bytes. Keys/signatures are lowercase hex (32/64 bytes); Web Crypto implementation support and known-answer vectors are required before enablement. Reject duplicate keys, floats, unknown fields and noncanonical encodings.
Record ID is publisherKey+":"+venueId; venueId is a random 128-bit hex ID stable across revisions. Coordinates are integer microdegrees for a public venue, bounds lat [-85000000,85000000], lon [-180000000,180000000). Revisions are increasing safe integers. Record expiry <=30 days after issuance; future issuance tolerance 5 minutes. Text fields are plain text and limited to 160 characters name, 1000 notes, 300 address. At most 16 facility/accessibility entries from fixed enums, each with status yes/no/unknown and lastCheckedAtMs.
Reject remote image/style URLs and arbitrary facility claims. License identifier and attribution are required; unknown license prevents distribution. Published observation is not a live availability guarantee.

## 5. Interfaces and failure behavior

```typescript
interface VenueRecord {v:1; venueId:string; publisherKey:string; revision:number; latE6:number; lonE6:number; name:string; address:string; notes:string; facilities:Array<{kind:"lighting"|"staffed"|"step-free"|"public-transport"; status:"yes"|"no"|"unknown"; lastCheckedAtMs:number}>; issuedAtMs:number; expiresAtMs:number; license:string; attribution:string; signature:string}
validateVenue(bytes:Uint8Array): Promise<VenueRecord>;
```
Record cap 8KiB. Errors distinguish MALFORMED, BAD_SIGNATURE, UNTRUSTED_PUBLISHER, EXPIRED, UNSUPPORTED_LICENSE and REVISION_CONFLICT. Untrusted records may be imported for inspection but cannot be recommended or silently fetch links.

## 6. Threat assessment

Malicious publishers can lure users or claim nonexistent security. UI shows publisher, check date and “recommendation, not safety certification.” Sanitize text, reject bidi control characters in key identifiers and never render HTML. Valid signatures do not authorize publisher key rotation; trust updates require local reviewed configuration.

## 7. Verification and references

Fixed Ed25519/JCS vectors must verify across browser and independent verifier. Flip one byte in each field, inject duplicate JSON keys, absurd coordinates, stale expiry, oversized notes and unknown license: reject. Signed records from an unapproved key never enter recommendations. Accessibility unknown must remain visibly unknown rather than default yes. Review evidence must include a malicious but correctly signed venue.

Acceptance evidence MUST record fixture inputs, expected outputs, actual browser/provider versions and failures; these planned cases are not passing test results. Independent review and the core-only regression remain release gates.

Primary shared authority: [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md), [roadmap](../../../DEVELOPMENT_ROADMAP.md), [G05 routing](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md). Protocol references are design inputs, not evaluated dependencies: [Geolocation Recommendation, 2024-06-13](https://www.w3.org/TR/2024/REC-geolocation-20240613/), [WebRTC Recommendation, 2025-03-13](https://www.w3.org/TR/2025/REC-webrtc-20250313/), [RFC8785 JCS, June 2020](https://www.rfc-editor.org/rfc/rfc8785), [Mapbox Vector Tile 2.1](https://github.com/mapbox/vector-tile-spec/tree/master/2.1). Select only applicable references when implementing and freeze evaluated upstream revisions in the dependency manifest.
