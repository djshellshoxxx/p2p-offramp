# Review disposition at source 2d3135b

The source and specification reviewers examined both Qodo findings on exact runtime SHA-256 `263aaf875c457e444aae904fc3f7d53c440e6e2fccc6888a234d932b9af7ae2a`. Neither found a remaining package-level merge blocker. Both behaviors were reproduced and remain visible availability limitations; they were not dismissed as nonexistent or silently changed.

## Acceptance delivered at/after deadline

The committed `accept-delivery-boundary.mjs` imports actual exchange/messages/machine through the existing explicitly synthetic lifecycle harness. Buyer accepts at 149 with deadline 150. Receipt at 149 succeeds on both sides; receipt at 150 and 151 returns EXPIRED and leaves seller offered while buyer stays accepted. All three assertions pass. The independent specification reviewer separately reproduced the same matrix; these are lifecycle checks, not real cryptographic/relay/funding evidence.

Normative basis at the exact source:
- `packages/exchange/src/machine.ts` lines 2–4 define accepted as a local communication record, not funds or obligations.
- `spec-encrypted-order-envelope.md` sections 2 and 4 distinguish negotiation from custody and advance local state after wrapping, without any peer acknowledgment guarantee; section 3 makes accepted terminal.
- `spec-order-lifecycle-reconciliation.md` sections 4–6 keep negotiation local/non-authoritative, end accept/funding eligibility at acceptBefore and explicitly anticipate delayed relay acceptance.

Keep receipt-time expiry. Signing authenticates the supplied timestamp, not when signing occurred; trusting rumor.created_at would permit sender backdating. A delivery margin or shorter envelope expiry cannot guarantee delivery or matching local states. Before app enablement, show local preparation/delivery/expiry separately and derive expired eligibility without rewriting the historical acceptance. Mutual acknowledgment would need an explicit protocol extension and tests.

## Accepted sessions retain capacity

The standards reviewer executed `/tmp/p2p-standards-capacity-deadline.mjs` against the exact runtime (exit 0, mocked crypto/review). With maxSessions=1, an accepted session caused outgoing and incoming new takes to return LIMIT_EXCEEDED; same-pair restart returned OUT_OF_ORDER. At the old advertisement's expiry, a different live advertisement succeeded on both sides with one retained session each. The probe also independently confirmed the delayed-receipt state divergence.

Normative basis: envelope spec section 3 permits restart only after cancellation/rejection and sets bounded refusal; its security assessment bounds session memory. Lifecycle spec section 6 explicitly records ad-lifetime slot starvation as a known availability limit. Retaining accepted records preserves no-restart until expiry. A separate bounded tombstone map can reduce retained data but still requires its own capacity/refusal policy; a caller release API needs a defined trust/lifecycle contract. The current capacity cost is retained and should be clear in app/API documentation before enablement.

The source was not changed merely to satisfy automated suggestions. Original comments remain in GitHub; no automated-review setting was changed or finding dismissed through an external service. Exact-head full CI and prior source reviews support the package merge, not release acceptance or an independent whole-project audit.
