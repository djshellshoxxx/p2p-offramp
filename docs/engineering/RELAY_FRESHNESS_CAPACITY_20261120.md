# Relay advertisement freshness and order-book capacity — isolated continuation

Repository: djshellshoxxx/p2p-offramp. Source base: draft core candidate PR #205 at `cd7d54ba075118a7ec043788c17718be842ee405`, tree `ce3c69ddc36245f756005c540e521a26a3ce59b8`. The latest read coordination PR #200 was `9d1129f189c2b7e5661384ade94da5270227af2e` and main remained `5c5a84ef6300330700c8b0ca54d074ac113f08be`.

## Scope and concrete defects

This isolated change owns only `packages/relay/src/ad.ts`, `packages/relay/test/ad.test.mjs`, and this report. It does not touch the active Solana, portal, routing, IndexedDB, personalization, optional-composition, or dependency workers. The default client import graph, contracts, networking endpoints, financial authority, CI/workflow configuration, versions, and release settings are unchanged.

1. `validateAdEvent(event, nowSeconds)` was exported but did not reject non-finite, fractional, negative or missing clocks. Comparisons against NaN are all false; a structurally valid event could therefore be returned as discovery-only valid even though freshness was unknown. The order-book wrapper separately checked its own clock, so no demonstrated default-client funds impact is claimed. The exported standalone API now rejects malformed clocks with the existing `INVALID` reason; valid clock semantics are unchanged.
2. `createOrderBook({ maxOrders })` used its bound directly. `Infinity`, `NaN` and out-of-range values defeated or distorted the documented 1–1000 retained-order bound; zero and negative values gave nonsensical eviction behavior. The constructor now rejects invalid capacity with a fixed `RangeError('INVALID_ORDER_BOOK_CAPACITY')` before storing anything. Valid bounds 1, 5 and 1000, plus omitted options, keep the original behavior.

## Immutable source evidence

- Original source `ad.ts` Git blob: `1a62b726ee8c1883dcaaa10c0be72bdeed619ecd`.
- Original test `ad.test.mjs` Git blob: `73def02a8cd4bd59313eb024c6644a4ad961b7a6`.
- Test-first commit: `2994e6e8b0b3803e1b062e0915a17f4c8b652984`, tree `27a0eba56487adc9e6ce41dd82b345f4a53dd217`, parent PR205 exact head; production source unchanged.
- Product repair: `3a7d1b2e3cee26f5c9300b89d5502048b37280e4`, tree `976818881fe910b12d3ecbd8ad67268b407e25a9`, parent the test-first commit.
- Test cases: six invalid clock samples, six invalid capacity options, three valid explicit capacities, one valid clock control, plus existing relay assertions. The existing test suite and original thresholds are unchanged.

Local Node 22 standalone predicate smoke executed 16 assertions successfully (not the original repository module or test suite). The regression-only commit was verified by source inspection to retain the old wrong outcomes; it was **not** executed against the full dependency graph, so no direct RED command is claimed. The corrected repository package and native relay runs, TypeScript and import-boundary checks, independent reviewer signoff and source-bound hosted CI are **not yet qualified**. No browser or native Nostr execution has been claimed.

## Integration gate and coordination

This is a narrow stacked candidate for the existing PR205 line, **not** approval to merge PR205 or deploy. Its known Medium Solana reconciliation defect remains separately owned and unresolved at this checkpoint. Before promotion: confirm no concurrent change to the two relay paths; obtain independent source review; run the original relay tests and native Nostr acceptance plus all applicable combined-source CI on an exact checkout/tree; preserve every previously failing native/browser result and both 1800-second refund waits. Do not change original 192-head inventory, security gates, accepted D7/D8 decisions or stale immutable locale evidence.

The main consolidation coordinator owns edits to `docs/engineering/CONSOLIDATION_HANDOFF.md` and `consolidation-state.json`; this report and a PR200 coordination note provide an additive handoff without overwriting those actively maintained files. Record the new scoped defect IDs when integrating; do not relabel the existing 25 reproduced repairs as tested under this source.
