# Core consolidation evidence — 2026-11-18

This is an implementation and qualification record. `ReleaseEnabled=0`; no public deployment, release publication, mainnet enablement, or real-funds transaction is authorized by this record.

## Repository provenance

- Starting main: `97ce6a41805ab4d8fc6fccbcfb9dd79463deebd7`.
- PR #141 source `87af4088a2fde86ed7485fdc7d229b7c04a2be87` merged as `d6344b66b5537b146b6aad06b542a246c18cc497` after all ten hosted checks and the Snyk status succeeded. The fetched merge tree matched the independently tested local merge tree.
- PR #149 source `90b9b85715f1e04522b828ecdbc4858e92a1b88e` merged as `f3fb73921c75ec6aa1075ab2ca516e6c5fe3a3dc` after all ten hosted checks and Snyk succeeded. The current-main combination passed four recovery-reference tests and matched the fetched merge tree.
- PR #143 source `579b02f3775323ba273dfe2bc624b5860897431e` is fully integrated into this candidate, with the further anchored-read repairs described in [EVM-ANCHOR-REMEDIATION-2026-11-18.md](EVM-ANCHOR-REMEDIATION-2026-11-18.md).
- PR #159 is only partially extracted: commits `8370fdb24da7aaf122da7c20433fd70a8dd208d2` (external peer-acceptance signing) and `1d3f59a9474a058b4b09c1fc4cdbe00f46335302` (isolated localnet build profile). The older alternate exchange implementation was not imported. Current-main D1 exchange verification remains authoritative. This does not make #159 fully superseded.
- Local candidate before this report: `ab884ea`; complete passing core gate tree before the final signer continuation repair: `d7c74f796c4ddd068ab2379c06924e87d7c0cca8`.

Git transport could fetch but had no write credential. The GitHub connector publishes the tested tree as a new commit on the current main, preserving the fully integrated #143 source head as an additional parent. Connector-created commit identity may differ from the local commit identity. Qualification requires an exact tree comparison after fetching, plus checks of the published head; a local SHA alone is not a hosted-CI claim.

## External-wallet signing repairs

The extracted peer signer was adapted to the current five-argument D1 verification API. Review then confirmed three authority-lifetime defects:

1. Silent account or chain changes while the wallet prompt was open could return a stale signature. Both signing methods now reread account and chain after verifying the signature and reject a changed session.
2. Concurrent terms and peer-acceptance signing could open overlapping prompts. A single physical authorization slot covers both methods. Cancellation/disconnect does not free that slot until the provider's pending operation settles.
3. A disposal or cancellation in the continuation after the final identity helper could still publish success. The final adapter-owned continuation now checks cancellation and session ownership again. Public wrappers return that promise directly. Existing failure codes remain unchanged.

The third finding was independently reproduced with four regressions failing on `8f6a015`, then repaired in `75972eef7cfa28d05170b88cad07e15fffdc8ccd` and integrated as `ab884ea`. The complete adapter suites pass **32/32**, no skips, including cancellation, reconnection, one-prompt enforcement, and both late-result paths. TypeScript checking passes. Consumers must still fence their own asynchronous work after receiving a settled signature; no adapter can cancel a value already delivered by a settled promise.

## Localnet build boundary

The build profile is accessible only through the explicit build library option. It admits only chain 31337, a strictly validated registry digest, independently supplied escrow runtime layout hashes, and one loopback relay origin. The default, demo, and testnet artifacts continue to exclude the localnet modules. The new wallet facade exports the current peer verifier/ports required by D1.

The placeholder localnet root in this candidate only verifies configuration and exercises module admission. It is **not** a completed trading UI. Browser journey implementation and qualification are a separate change.

## Verification and limits

At `d7c74f796c4ddd068ab2379c06924e87d7c0cca8`, after an integration assertion was updated to require the exact canonical EIP-1898 selector:

| Gate | Result |
| --- | --- |
| npm run typecheck | Pass |
| npm test | 1,724 passed, 0 failed, 0 skipped |
| npm run test:specs | Pass |
| npm run check:specs | Pass |
| npm run check:boundaries | Pass |
| npm run test:build-policy | 50 passed, 0 failed |
| npm run build | Pass |
| npm run build:demo | Pass |

Native EVM trade, payment, recovery, reconciliation, independent oracle, and 92 Foundry contract tests passed on the focused EVM implementation; see the linked EVM report for exact scope. Those native results do not substitute for browser qualification.

Two initial environment failures were retained in the work log: using another worktree's node_modules through a symlink correctly triggered the source-boundary policy; a fresh local `npm ci --ignore-scripts` fixed that setup error. Chromium could not launch because the execution host denies AF_UNIX sockets. The policy rejected a request for elevated execution; no access-control workaround was attempted. Local browser gates therefore remain blocked, and current published-head hosted browser checks are required before merge.

## Proven supersedence closures

PR #39 (`404dc3daa8b19904c7da29d71d49d8df0f5e03ba`) and PR #41 (`dd2a648140e79b0c0148ffb2a6be87fdf1b3c330`) were closed with per-file evidence comments against main `f3fb73921c75ec6aa1075ab2ca516e6c5fe3a3dc`. Their heads were revalidated before closure. No source branch was deleted.

- #39: 7/11 changed paths byte-identical; four retain the original behavior and add verifier-lifetime checks, inherited-handler validation, failover bounds, and stronger exchange/session tests.
- #41: 36/40 changed paths byte-identical; the others provide an equivalent local display type, stronger warning-visibility checks, selector copy, and immutable bundled-locale enumeration.

These closures do not assert supersedence of the rest of the historical split stack or PR #26.
