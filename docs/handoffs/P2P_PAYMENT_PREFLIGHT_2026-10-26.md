# P2P funded-trade payment-guidance preflight — fixture milestone

2026-10-26 UTC, clean base **2228ee82419cbdaed514db8fb2f436161ebe3fc0**. Added only `packages/domain/src/payment-preflight.ts` and `packages/domain/test/payment-preflight.test.mjs` outside documentation/evidence. Final source/test SHA-256, commands, timestamps and terminal exits are in `docs/evidence/P2P_PAYMENT_PREFLIGHT_20261026.json`; the committed checkpoint is identified by the following private delivery receipt. No remote source publication is claimed.

## Product behavior now implemented privately

The existing `spec-escrow-deadline-preflight.md:20–40` requires immutable funded terms/deployment/chain time checks before payment guidance. The evaluator applies these executable rules to decoded fixtures:

- Exact EVM binding, chainId, contract, terms hash, seller/buyer, asset, principal and expiry agreement. No arbitrary identifier is promoted to a native deployment identity.
- Fixture chain time must match the escrow-read anchor hash and height. Missing/unfinalized evidence returns fixed G13 UNAVAILABLE; reorg or contradictory anchor returns INTEGRITY_FAILURE. It does not manufacture empty canonical fields or use wall time as chain time.
- Payment guidance requires **remaining >900 seconds**. At900, expiry, or after expiry it blocks. This is the existing payment buffer, distinct from G16's1800..604800 funding-duration rule. An already-funded trade ignores later advertisement acceptance expiry.
- Strict **age <30000ms**, reusing G08 DISPLAY_MAX_AGE_MS, with supplied monotonic start/current time and unchanged generation. Clock reversal, suspension-generation mismatch or stale health blocks. No timer automatically releases/refunds, and no recovery/export UI is altered.
- Exact data-descriptor schema, closed choices and bounded hex/decimal values; uint256 principal/uint64 expiry/time remain strings/BigInt, no money floats. Unknown/accessor/prototype/revoked-proxy input is refused with fixed errors; no raw provider text is copied.

Every successful evaluation returns **evidence=fixture-only** and **economicPreparationAllowed=false**, even when decision=allow-guidance. The latter applies to the fixture scenario, not real payment instructions. The evaluator is private and absent from the public facade and emitted application/Worker graphs. No state engine, writer/cache, network, wallet, submission, dependency or registry approval was introduced.

## Evidence and deliberate limits

Inputs are decoded fixture assertions. The function does **not** authenticate RPC responses, finality, clock provenance, chain/deployment identity, acceptance signatures or expected-hash/term consistency. Tests derive expectations from the existing G16 native vector and use its existing EVM hash implementation; expected values require separate verified G16/native integration before a production flow. No ABI was invented or decoded. There is no new public wire/import format. Future work must not strip the fixture tag and call this authenticated merely because fields agree.

The returned preflight retains the canonical binding/termsHash/finalizedAnchor/checkedChainTime/expiry/remainingSeconds/decision/reason shape plus explicit fixture/spending tags. Missing evidence uses the already-required CoreResult/G13 failure path instead of inventing timestamps or sentinel strings. No financial policy changes:900-second buffer, strict existing30-second boundary, fixed-fill immutable funded terms and disabled spending remain fixed rather than caller-configurable.

## Actual RED/GREEN and aggregate checks

1. RED before runtime existed: `node --test packages/domain/test/payment-preflight.test.mjs`, exit1,0pass/1fail, missing private evaluator. Original failure retained.
2. Initial GREEN after implementation: same file, exit0,1pass.
3. Expanded focused run: exit0,11pass; then final strengthened fixture/zero-bound cases run: **11pass/0fail/0skip**. Separate logs/hashes distinguish these source versions.
4. `npm test`: **367pass/0fail/0skip**.
5. `npm run check:boundaries`: exit0,45 production sources/18 core graph modules; static check only.
6. `npm run test:build-policy`: **5pass/0fail/0skip**.
7. `npm run build`: exit0, includes all four strict typechecks followed by Vite meta static build. ReleaseEnabled0, empty origins and no new evaluator in emitted graphs verified.

Eleven tests cover G16 native901-second funded case after acceptance expiry;900/expiry boundaries; exact30-second/fractional monotonic freshness and resume; every identity/term mismatch; missing/unfinalized data; reorg/time-anchor mismatch; absent/terminal states; oversized/noncanonical/overflow values; full-width amounts/address byte identity; hostile objects; frozen detached fixture-only output and no app export. Existing G16 vector file is byte-identical to base, SHA-256 e876b2f6ee1cb8a2088d64215749038b55ecfbfe66877860eb6f27561370db70. No independent crypto qualification is inferred from recomputing existing test vectors.

Final source/vector hashes stayed frozen during aggregate checks. All8 original logs/terminal records are preserved; gzip hashes/decompression equality retain exact output without whitespace-gate changes. Installed Node24.19.0/npm11.9.0 only. No KDF/resource cost/deadline/case/coverage threshold weakened. Browser/Python/spec suites were not rerun for this private evaluator; no device, host, audit, real-RPC or production acceptance asserted.

## Remaining dependencies and restart

This implements a real missing payment-guidance predicate, not native on-chain authentication or an off-ramp. The next substantive dependency is a separately reviewed native reader/ABI path binding actual deployed trade fields and chain-header time at the same anchor to verified expected terms, registry identity and approved finality. G11.validateLive/G15 trust path remain absent/unapproved; do not choose trust roots/networks/deployments in this helper. Trusted G12 hash/observe/reconcile lifecycle and wallet/escrow/offer/trade UI/two-party flow still need implementation and acceptance. Keep recovery/export access independent of payment-guidance refusal.

There is no demonstrated remaining runtime defect in this bounded evaluator after the listed tests; do not invent a fix or widen it to live RPC. Browser cross-tab acceptance can use the installed harness in a separately scoped step; it was not run here. Client-side/noncustodial architecture and all preserved extras remain intact. GhostPay reserved recovery/EVM files stayed untouched at3bb55f683b1ba2a0a6a1da05e19ddf7b2d2c330a.

Coordinator integration/review only, no workers started. No pushes/CI/merge/deploy/release, paid/external-Claude calls, new software, credentials/security/network settings, environment replacement or denied retries. Guarded same private handoff target: **libfile_b5734354657c81919d25ed4930348dc9**, last confirmed version3; preserve prior versions and canonical queue V55/Library57. The private artifact will include exact source/test additions, patches and evidence after source commit; delivery receipt follows successful producing result. No consumer retrieval or fresh-remote-clone claim.
