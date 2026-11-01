# T28 independent journey/G18 seam review

Read-only review of frozen packages/domain/src/journey-view.ts and test/journey-view.test.mjs, with existing trade-composition.ts and canonical EvmPaymentPreflight read/view contract traced. No edits, commits, native sends or full-suite run.

No reproduced actionable defect found in the frozen candidate. Focused journey suite15/15PASS. Source/test hashes match implementer's freeze.

Verified: absent optional port preserves prior behavior; fresh finalized terminal receipt bypasses payment availability; funded path requires fresh EVM finalized funding and no unresolved G12 IDs before native read; composition is reread after asynchronous G18 even on gate failure; original binding, wallet generation, chain generation, state, health, finality, anchor height/hash and G12 veto are applied before coordination. Changed original scope blocks instead of mixing bindings. Final native view is inspected synchronously for freshness and bound digest/anchor; native-rpc/economic-false and coherent decision/reason are required via own data descriptors. Accessor fields, mismatched hash/network/deployment/trade/anchor, native failure/near-expiry/stale, cancellation, supersession and disposal remain blocked or cancelled. Output contains no private journal IDs, fiat assertions or raw provider errors; actions stay empty and economicPreparationAllowed=false.

Actual G18 retains ownership of native RPC identity/immutable fields/900-second buffer/30-second monotonic freshness. This seam clones none of those checks. The injected port is trusted bundled composition, not authentication of an arbitrary JSON object merely bearing native-rpc. It does not establish negotiation signatures, fiat receipt, wallet consent, transaction preparation or whole G22 completion. Native end-to-end integration and broader verification are owned by root. Review is engineering verification, not external crypto approval or real-funds readiness.

Frozen source SHA-256:
c1c4827fe287846806270b0975b6728b542d1781147da2aa118a34f86e90314f  packages/domain/src/journey-view.ts
dfd782ca18e7146f00b5770d4373e93f8939d2903b5cd479efee180e190de1f5  packages/domain/test/journey-view.test.mjs
294fa9c249fc56cc68e7ff317a8c90ecf5d73b41e4cea3b1967052be21b75ddd  packages/domain/src/trade-composition.ts
7b8b6b058d81d3314a04e9c25d94aa34c446b06151bb01c53cb4bdc02944bec0  packages/wallet/src/evm-payment-preflight.ts

## Root native integration source review

Read-only review of scripts/test-exchange-evm-local.mjs root diff after actual native log completed. No additional reproduced source defect found. The new fixture helper uses canonical getTrade/log decoding, checks selected chain/genesis/runtime code, reads finalized numbered state+logs and rechecks the same header. It is expressly a native loopback fixture composition, not a shipped G08 reader or registry approval.

Encrypted G12 bridge preserves every non-finalized matching record as unresolved. A stored finalized label alone is insufficient: it invokes the existing lifecycle reconcile and checks both native finalized outcome and journal.isTerminalVerified before excluding the record. No new verifier, terminal mutator or reservation clear is introduced; the existing lifecycle owns any reconciliation persistence. Bounds32 journal records/64 fixture logs are assertions and failure is conservative.

Positive release/refund legs first require raw pending/unknown G12 to block even though native funding is finalized, then explicit reconciliation permits payment-coordination with actions[] and economicPreparationAllowed=false; unchanged send count is asserted. Invalidation blocks stale chain state; native900-second refund window blocks guidance; original finalized receipts remain available with payment gate invalidated. Contexts close both on success and in outerfinally; journal/wallet/key cleanup is retained.

Read metric journeyReads counts only the dedicated G08/G18 read wrapper; it does not count all native lifecycle/reconciliation RPC. The wrapper method allowlist excludes sends/signs, and global wallet submissions remain4 with4 durable markers. Parent native log journey-t28-native-anchored.log reports12 checks,2 settled trades,4 submissions,128 scoped journey reads and0 journey send/sign calls; no native rerun by this reviewer. Original actual accepted terms/both EOA acceptance checks and canonical ABI path remain intact.

Reviewed integration SHA-256:
ff1bed5a40c11b5fbea08e9498ed77b2802860a049aaa1e3b5c4a7fbe67fd3e0  scripts/test-exchange-evm-local.mjs
