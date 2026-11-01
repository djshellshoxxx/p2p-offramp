# T24 independent journey projection review

APPROVED as partial terminal-receipt projection, not full G22 reducer. No blocking finding reproduced.

Only fresh finalized native terminal state with zero unresolved journal IDs resolves receipt. Stale/reorg/unavailable/loading, provisional finality, absent/funded and missing prerequisites stay blocked; no payment/fiat/accept/fund/release/refund authority is granted. Every projection keeps empty actions and economicPreparationAllowed=false. Binding is detached/reparsed and same-binding chain checked. Generation/freshness remain underlying private composition responsibility. Own cancel/dispose/supersession suppress late results and do not dispose underlying composition. No claim of prompt settlement for dependency ignoringabort; no UI/funds integration claimed.

Focused direct tests7/7 PASS; outer node --test wrapper1file pass. Tests cover real authority+composition invalidation, malformedsource, sanitized errors, fiatclaims no authority and cancellation/disposal. No sourcewrites/whole suite.

## Source hashes
- `packages/domain/src/journey-view.ts` `a49f441d309daa7b986babc8b661a15596f2e196e994a86d64126d77e2b0b52f`
- `packages/domain/test/journey-view.test.mjs` `a209fdf0d092355ccfd6dc635c2216e5ff4ff7a7344037d35d2dd0bc042b9d37`
- `packages/domain/src/trade-composition.ts` `294fa9c249fc56cc68e7ff317a8c90ecf5d73b41e4cea3b1967052be21b75ddd`
- `packages/domain/src/authority.ts` `410a6dfc063d2fcf0811fe3a6f6aeec04072bec9f471f4f8b1851b4724b6430f`
