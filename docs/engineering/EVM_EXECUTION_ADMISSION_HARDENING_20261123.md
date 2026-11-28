# EVM execution admission — historical scope-retirement regression recovery (2026-11-23)

**Source baseline:** current `main@01f6f4feca051d68de24a04299cd3bb444bce40c` (tree `437323a382952b9623a875c818f8af005a5d4563`), before this isolated draft. Original regression-source provenance: owner [PR #40](https://github.com/djshellshoxxx/p2p-offramp/pull/40), `packages/wallet/test/evm-execution.test.mjs` blob `66246d3a824c900cf7e2d714d4d66670d15fa4da`. Existing current-main test blob `d08491dabbe6c6f46a6617656bc8de5ebe2b3d31`, source blob `8c0727c48fdc9c884510b8828e87f4da451122f6`.

## Scope
- Restore five maintained historical test cases, without copying old financial execution code wholesale: final account accessor rejection; scope retirement on account-descriptor reflection; scope retirement during final provider capability capture; disposal reentrancy during the last `isCurrent` callback; disposal reentrancy on the initial callback.
- Implement only targeted fail-closed changes in `packages/wallet/src/evm-execution.ts`: recheck `disposed` *after* the caller-provided `isCurrent` callback; use own-data account descriptors rather than invoking unknown indexed getters; guard execution scope *after* acquiring the final `provider.request` capability and *before* invoking it.
- Preserve durable journal marker => `BROADCAST_UNKNOWN`, existing exact hash/chain/nonce/fee checks, physical single-send slot, no automatic resend, and all current-main APIs. Preserve `ReleaseEnabled=0`; no default activation, live funds or deployment.

## Evidence and acceptance boundary
The recovered tests were placed in a **test-first Git commit** followed by a separate narrow source-fix commit. The historical tests are provenance, **not a recorded RED execution** against current main. The source changes were statically checked for the exact anchors and guard ordering; **no local Node / Foundry / Chromium run occurred** because shell GitHub DNS is unavailable. GitHub hosted exact-source `wallet/evm` tests, full Node/TS, real native acceptance where applicable, independent Tier C review and explicit recorded owner authorization are mandatory before any guarded main merge. Older PR40's C-tier native release and source code cannot be mechanically merged, because current main has newer `BROADCAST_UNKNOWN` semantics.

## Remaining adjacent risk
Historical overridden/hostile AbortSignal hook tests are **not yet ported**. Their behavior requires a separate reviewed change; do not imply this patch hardens every signal boundary. Original failure receipts and PR40 ownership remain intact.
