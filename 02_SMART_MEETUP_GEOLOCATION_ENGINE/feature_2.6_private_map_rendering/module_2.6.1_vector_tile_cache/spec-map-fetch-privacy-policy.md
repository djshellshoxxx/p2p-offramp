# Map fetch privacy policy

## 1. Metadata

- **Specification ID:** MEET15
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Section:** 02_SMART_MEETUP_GEOLOCATION_ENGINE
- **Feature:** feature_2.6_private_map_rendering
- **Module:** module_2.6.1_vector_tile_cache
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5

## 2. Objective

Reduce viewport disclosure through explicit offline bundles and consented coarse fetches. Encryption, IPFS addressing and bulk prefetch do not hide request metadata from gateways, peers or the network.

This is a Phase 5 optional extension. MUST is normative. Core manual offer, funding, chat, seller release and timeout refund MUST work when this module and all map/proof/WebRTC packages are absent. No location output changes funded trade terms or grants settlement authority. All concrete provider/library versions, supported browser entries and artifact digests must be recorded at implementation; no unreviewed integration is implied.

## 3. Architecture and data flow

All map, glyph, style, sprite, directory and geocoder requests pass through G05 transport policy. A self-contained local style and fonts prevent renderer-initiated third-party fetches. Remote geocoding is disabled; manual text/venue selection works without maps. No map request occurs merely because geolocation permission was granted.

## 4. Algorithms and invariants

Modes are disabled, offline-bundle, consented-gateway and strict-routed. Default disabled. Offline-bundle loads a user-imported reviewed MEET14 bundle without networking. Gateway mode needs explicit disclosure that the selected gateway sees IP, bundle and timing; strict-routed requires enforceable G05 routing for every fetch, otherwise unsupported.
Choose a fixed rectangular bundle from the already disclosed coarse region, not the precise viewport or live marker. Prefetch a fixed zoom 10..14 bundle capped at 256 tiles/20MiB per user action; if larger, ask user to choose a smaller manual region without making requests. Limit concurrency to two and total request deadline to 60s; no endless retries, one retry maximum after transient failure. Panning outside a loaded bundle displays blank space and a fetch button, never automatic fetch. No fetch on sensor update.
Gate before DNS/fetch; allowlist exact HTTPS origin, prohibit credentials/referrer, reject redirects to other origins, disable analytics and strip coordinates from query strings. Content addresses still reveal selected region through manifest mapping. No browser libp2p/DHT participation or background gateway rotation in this baseline. Cancellation aborts queued/in-flight requests and discards completion from old consent generation.

## 5. Interfaces and failure behavior

```typescript
type MapMode="disabled"|"offline-bundle"|"consented-gateway"|"strict-routed";
interface MapFetchPlan {mode:MapMode; manifestDigest:string; bundleId:string; tileCount:number; maxBytes:number; consentGeneration:number; transportPolicyId:string}
fetchBundle(plan:MapFetchPlan, signal:AbortSignal):Promise<"loaded"|"cancelled"|"unsupported">;
```
Renderer has a request interceptor that rejects every URL not present in the approved fetch plan. Errors distinguish ROUTING_UNSUPPORTED, OUTSIDE_BUNDLE, REDIRECT_REJECTED, BUDGET_EXCEEDED and NETWORK_UNAVAILABLE; none enables a direct fallback.

## 6. Threat assessment

Viewport-shaped request sequences reveal movement; fixed action-bound bundles reduce this but do not hide region choice. TURN/Tor status for another channel says nothing about tile routing. Imported tile manifests may contain tracking URLs; reject arbitrary URL fields. Gateway success is not content authenticity; MEET14 digests are mandatory.

## 7. Verification and references

Capture all browser requests while opening app, denying map consent, moving a simulated GPS marker, panning and importing an offline bundle: zero unsolicited map/style/font/geocoder requests. Block routing and assert no direct DNS/HTTP fallback. Test redirects, abort during response, oversized bundle and expired consent; stale completions never populate renderer. Compare request sets for two viewports within one selected bundle: identical approved bundle retrieval, independent of precise position. Actual gateway/routing configurations remain disabled until packet-capture and licensing evidence are reviewed.

Acceptance evidence MUST record fixture inputs, expected outputs, actual browser/provider versions and failures; these planned cases are not passing test results. Independent review and the core-only regression remain release gates.

Primary shared authority: [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md), [roadmap](../../../DEVELOPMENT_ROADMAP.md), [G05 routing](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md). Protocol references are design inputs, not evaluated dependencies: [Geolocation Recommendation, 2024-06-13](https://www.w3.org/TR/2024/REC-geolocation-20240613/), [WebRTC Recommendation, 2025-03-13](https://www.w3.org/TR/2025/REC-webrtc-20250313/), [RFC8785 JCS, June 2020](https://www.rfc-editor.org/rfc/rfc8785), [Mapbox Vector Tile 2.1](https://github.com/mapbox/vector-tile-spec/tree/master/2.1). Select only applicable references when implementing and freeze evaluated upstream revisions in the dependency manifest.
