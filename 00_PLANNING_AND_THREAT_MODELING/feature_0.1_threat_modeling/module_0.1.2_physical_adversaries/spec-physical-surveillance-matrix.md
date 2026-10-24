# Physical surveillance and location disclosure matrix

## 1. Metadata

- **Specification ID:** TH04
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 0
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Map location and identity leakage from optional physical coordination. The core manual off-ramp must work without device location permissions or a map provider. A geographic assertion is not authenticated physical presence.

## 3. Architecture and observation matrix

| Data | Potential observer | Default handling |
|---|---|---|
| Exact coordinates | Counterparty, map server, device, relay if sent publicly | Never in public order; absent in core |
| Meetup venue/time | Counterparty and retained chat copies | Private negotiated terms; explicit reveal |
| Photos and EXIF | Recipient and evidence storage | Not collected by core; later importer must sanitize and disclose limits |
| Courier route | Courier/provider and observers | Disabled until separately scoped consent and custody contracts |
| Wallet/account linkage | Public chain observers/counterparty | Do not add location to transaction memo or public advertisement |

No location, photo, venue, network, or timing observation alone proves identity, cash contents or successful handover.

## 4. Required algorithms and invariants

Location collection requires an explicit purpose-specific user action, never page load. Do not request background geolocation, precise coordinates, Bluetooth, camera or microphone permissions in core. Future coordination imports must validate and quantize public region labels before publication and keep exact details private. A permission denial leaves manual text coordination usable. Revocation stops future collection and clears transient coordinates; it cannot remove remote copies. Third-party map tiles and geocoding are G05 channels, not local-only rendering. Retention periods for future evidence are configured before collection, not guessed after a dispute.

No new cryptographic primitive or ZK circuit is defined in this threat model.

## 5. Interfaces and failure recovery

A later location adapter returns `{accuracyMeters, capturedAt, source, coordinates}` as untrusted assertions; `source` identifies provider/device, not authenticity. Core stores none of these fields. Public advertisement schemas reject coordinates, full street addresses, exact meetup times and personal contact fields. Private negotiated information is encrypted using the approved chat adapter and may be stored only in G02. UI exposes what will be shared and with whom before sending.

## 6. Threat assessment

GPS spoofing, replayed images, compromised devices, geofence leakage, relay metadata and physical observers remain possible. A zero-knowledge proof about supplied coordinates proves a predicate over that input, not that the input reflects physical reality. Exact meetup information can endanger privacy even when encrypted in transit because the counterparty receives it. Data minimization and permission boundaries reduce exposure without establishing safety of a physical exchange.

## 7. Verification and references

Test the core in browsers with all location/camera permissions denied: discover, negotiate, release/refund and recovery remain functional. Assert no map or geolocation call on initial load or public order rendering. Inject coordinate/address fields into public offers and ensure schema rejection. Test permission revocation, metadata-bearing image imports in future module fixtures, and G05 strict-mode map refusal. Evidence of physical presence is never inferred from synthetic GPS alone.

Normative project dependency: [development roadmap](../../../DEVELOPMENT_ROADMAP.md). See G01–G06 for key, vault, backup, content, transport and dependency enforcement. Threat models define required properties; passing fixtures is not a whole-product security certification.
