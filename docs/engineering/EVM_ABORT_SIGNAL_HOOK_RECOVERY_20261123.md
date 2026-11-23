# EVM AbortSignal boundary recovery — 2026-11-23 UTC

**Base:** parent draft [PR247](https://github.com/djshellshoxxx/p2p-offramp/pull/247), exact source commit `3f23c774b2464b04de6cfece9ab1721dd5130f86`, itself based on `main@01f6f4feca051d68de24a04299cd3bb444bce40c`. This is an isolated dependent draft; no parent/main branch was modified.

## Unique recovered work
Seven historic signal-specific tests from owner [PR40](https://github.com/djshellshoxxx/p2p-offramp/pull/40), original test blob `66246d3a824c900cf7e2d714d4d66670d15fa4da`, were appended to `packages/wallet/test/evm-execution.test.mjs` in a separate test-first commit. Cases: hostile/malformed/revoked inputs, three overridden native signal properties, validation/provider cancellation, and proxy introspection that retires the session. **Test-first does not imply an executed RED outcome.**

## Narrow test-only hardening
`packages/wallet/src/evm-execution.ts` is expressly a test-only executor, not application-exported or bundled. A native AbortSignal accessor and captured EventTarget methods validate inputs without reading foreign signal properties; accepted native input is linked to a privately owned AbortController and cleanup is insulated from caller property overrides. Foreign or malformed inputs are refused before validator/journal work; proxy reflection rechecks owner liveness. A private signal, never the foreign input, crosses journal calls. Explicit one-send marker, `BROADCAST_UNKNOWN` after marker uncertainty, no automatic resend, existing chain/account/nonce guards, and `ReleaseEnabled=0` stay unchanged.

## Verification boundaries
Only GitHub source/tree objects and the isolated Node native-intrinsic probe have been used at publication. **No full local Node, executed RED/GREEN, Anvil, Chromium, Solana validator, or independent Tier C review is claimed.** Require child exact-source/current-parent hosted Node/TS/CI, focused independent security review, parent PR247 qualification and recorded owner authorization before any guarded main integration. Retain historical failures and owner PR40. No funds, deployment, release, policy waiver, forced ref movement or optional default activation.
