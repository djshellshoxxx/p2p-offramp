# G05 HTTP detached-copy cleanup at preflight refusal — 2026-11-20 UTC

## Scope and reproduced finding

On the published generation-10 core descendant of PR #210 (head `701f3866e60978c945c5a0148dcda5b65f58fdbc`), `BoundedHttpDriver.request` copied a caller-owned POST body into an internal byte array before checking the scope's cancellation state and the eight-operation capacity limit. If either check refused the request, the copy was never erased; the native-operation path already wiped its copy in `finally`. A refused transport never dispatched this copied request, and the original caller buffer remained unaffected. This is a bounded secret-lifetime/hygiene defect, **not evidence of data exfiltration, extra network requests, financial authority, or a release vulnerability**.

The repair erases the already-created internal byte array at those two preflight exits. All existing error codes, request limits, physical operation slot semantics, and post-dispatch cleanup remain unchanged. It does not alter policy/consent issuers, scope implementation, endpoints, signatures, wallet calls, workflows, dependencies, financial harnesses, or release settings.

## Exact source and focused RED/GREEN

- Published base Git blob of `packages/transport/src/http-driver.ts`: `eeb37ae3cd01d991d02a9c28c7794a9b9d7f3fd4`.
- Local unmodified copy was verified **byte-for-byte** with `git hash-object` before testing.
- Corrected runtime Git blob: `bfef9101941de5a2a0cf1ed932e6847e643809a6`.
- New test blob (the same in RED and GREEN): `31be680e50959e9e6bba0aba449da1b343acaeb0`.
- Local toolchain: Node `v22.16.0` with `--experimental-strip-types`; direct Node native test runner, no installed third-party dependencies.
- Exact focused command: `node --experimental-strip-types --test packages/transport/test/http-driver-preflight-zeroization.test.mjs`, using the same local package paths as the repository.
- Unmodified runtime: **0 passed / 2 failed**, exit 1. Both tests observed the actual detached POST body retaining the input bytes on refusal.
- Corrected runtime: **2 passed / 0 failed**, exit 0. Both detached copies were erased. On the capacity test the original eight in-flight operations subsequently completed normally, with capacity returning to zero.
- Local RED raw-log SHA-256: `067df4491407a547d1e3f9b18d21a41d8277b5b48fa2ec000df8a2741e6cd8fb`.
- Local GREEN raw-log SHA-256: `e806e37a8d624d289b09a6bb72f437196338b9d6a362cf6f959c8890d18d2346`.
- Test file SHA-256: `26a93de5d2e4b5a4c73a39004b2631a376238c0d7c907d86fa214852abfec248`.

The tests instrument only the current global typed-array constructor while preserving intrinsic typed-array prototypes and brand checks, capturing the driver's own short-lived copy. The instrumentation is restored in `finally`. Inputs and assertions use public test bytes. No credential, wallet, browser, native Solana transaction or financial test executed.

## Limits, review and integration ownership

This was an isolated local reproduction of the **exact fetched source blob**, not a full monorepo test, typecheck, hosted CI, managed Chromium/native browser, or external independent security review. The isolated draft must remain unmerged until the normal applicable exact-head gates and independent scoped review qualify it. The existing coordinator owns integration into PR #210 and any later main promotion. No shared branch, PR #200 handoff, PR #207 component, optional package, or active native-worker worktree is modified by this task.

`ReleaseEnabled=0`; no deployment, release, wallet transaction, fund movement, forced update or security-gate relaxation.
