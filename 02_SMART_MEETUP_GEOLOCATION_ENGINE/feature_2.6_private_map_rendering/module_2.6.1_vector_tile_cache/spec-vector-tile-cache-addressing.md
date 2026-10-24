# Vector tile cache addressing

## 1. Metadata

- **Specification ID:** MEET14
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Section:** 02_SMART_MEETUP_GEOLOCATION_ENGINE
- **Feature:** feature_2.6_private_map_rendering
- **Module:** module_2.6.1_vector_tile_cache
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 5

## 2. Objective

Address and validate optional offline vector-map bundles with explicit licensing and attribution. No map dataset, gateway, style package or IPFS client is approved merely by this specification.

This is a Phase 5 optional extension. MUST is normative. Core manual offer, funding, chat, seller release and timeout refund MUST work when this module and all map/proof/WebRTC packages are absent. No location output changes funded trade terms or grants settlement authority. All concrete provider/library versions, supported browser entries and artifact digests must be recorded at implementation; no unreviewed integration is implied.

## 3. Architecture and data flow

A reviewed signed map manifest binds provider/dataset version, tile grid, content digest and license. The cache accepts only bytes referenced by that manifest. Default mode is map-disabled with textual/manual venue coordination; a missing or unlicensed bundle cannot cause a third-party fallback.

## 4. Algorithms and invariants

Use Web Mercator XYZ grid zoom 0..14; x,y integers in [0,2^z). Latitude is clipped only for map display to ±85.05112878°, never modifying location evidence. Tile key is datasetId/version/z/x/y/sha256hex; wrap x only when converting a viewport, reject out-of-range external keys. Do not mix TMS y origin with XYZ; manifest grid must be xyz-v1.
Manifest cap 2MiB and 50000 tile entries; tile compressed byte cap 2MiB, decompressed cap 8MiB, feature cap 100000 and coordinate-count cap 1000000. Stream enforce limits before decode. Validate SHA-256 of exact fetched bytes before persistent cache or parser invocation. Reject unknown compression; no sniffed executable content. Manifest contains plain attribution text, source URL for user inspection, license ID and expiry; no remote glyph/sprite/style URLs.
Cache namespace includes manifest digest. Store validated bundles in encrypted G02 storage, LRU cap 100MiB; eviction is atomic and cannot delete core vault/trade records. Corrupt tile is evicted and fetched at most once more under MEET15 policy. Expired manifests render cached tiles only with stale label, no venue safety inference. IPFS CID verification, if supported, is additional and must verify complete DAG/block semantics; a gateway URL containing a CID is not verification.

## 5. Interfaces and failure behavior

```typescript
interface TileRef {z:number; x:number; y:number; sha256:string; byteLength:number}
interface MapManifest {v:1; datasetId:string; version:string; grid:"xyz-v1"; format:"mvt-2.1"; tiles:TileRef[]; license:string; attribution:string; issuedAtMs:number; expiresAtMs:number; signature:string}
loadTile(manifestDigest:string, ref:TileRef):Promise<Uint8Array>;
```
Signature envelope uses the approved content-signing registry; until a key/dataset policy exists return MAP_UNCONFIGURED. Errors: HASH_MISMATCH, LICENSE_UNSUPPORTED, DECODE_LIMIT, CACHE_FULL, EXPIRED_MANIFEST. Never substitute a same-coordinate tile from another dataset.

## 6. Threat assessment

Map poisoning can misdirect users despite correctly reported GPS. Signed manifests authenticate publishers, not real geography. Vector parser exploits and decompression bombs require isolated workers and byte/feature limits. Tiles and cache keys expose regions to anyone accessing unlocked state; exact user marker layers are never stored in tiles.

## 7. Verification and references

Verify XYZ fixtures at zoom 0, dateline and max zoom against an independent implementation. Flip a tile byte, swap dataset namespace, use TMS y, inflate a compression bomb and exceed feature counts; all reject before rendering. Evict under full cache while a core trade record exists; core remains untouched. Test required attribution visibly offline. Enablement requires dataset license review, parser/version pin and signed-manifest vectors.

Acceptance evidence MUST record fixture inputs, expected outputs, actual browser/provider versions and failures; these planned cases are not passing test results. Independent review and the core-only regression remain release gates.

Primary shared authority: [system context](../../../00_PLANNING_AND_THREAT_MODELING/feature_0.4_architecture_planning/module_0.4.1_system_boundaries/spec-system-context-contract.md), [roadmap](../../../DEVELOPMENT_ROADMAP.md), [G05 routing](../../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.1_network_privacy/module_5.1.2_transport_policy/spec-transport-policy-enforcement.md). Protocol references are design inputs, not evaluated dependencies: [Geolocation Recommendation, 2024-06-13](https://www.w3.org/TR/2024/REC-geolocation-20240613/), [WebRTC Recommendation, 2025-03-13](https://www.w3.org/TR/2025/REC-webrtc-20250313/), [RFC8785 JCS, June 2020](https://www.rfc-editor.org/rfc/rfc8785), [Mapbox Vector Tile 2.1](https://github.com/mapbox/vector-tile-spec/tree/master/2.1). Select only applicable references when implementing and freeze evaluated upstream revisions in the dependency manifest.
