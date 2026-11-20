# Public QR image decoder intake

This intake pins **jsQR 1.4.0** for bounded local public-image decoding in a disposable module Worker. It does not grant wallet, trade, recovery, network, or private-vault authority. `ReleaseEnabled` remains `0`.

## Exact source and artifact

| Item | Recorded value |
| --- | --- |
| Registry package | [`jsqr@1.4.0`](https://registry.npmjs.org/jsqr/1.4.0) |
| Archive | [`jsqr-1.4.0.tgz`](https://registry.npmjs.org/jsqr/-/jsqr-1.4.0.tgz) |
| Archive bytes / SHA-256 | `64745` / `b5299b37917a1fe7a8cab9dd5cc6b8accf82663add80abe5bf7761a921cc6602` |
| Lockfile integrity | `sha512-dxLob7q65Xg2DvstYkRpkYtmKm2sPJ9oFhrhmudT1dZvNFFTlroai3AWSpLey/w5vMcLBXRgOJsbXpdN9HzU/A==` |
| Release metadata `gitHead` | [`49a9633931fb8030ac2fc9cecc121d6e5a19f9a3`](https://github.com/cozmo/jsQR/commit/49a9633931fb8030ac2fc9cecc121d6e5a19f9a3) |
| Actual runtime source | [`dist/jsQR.js` at that commit](https://raw.githubusercontent.com/cozmo/jsQR/49a9633931fb8030ac2fc9cecc121d6e5a19f9a3/dist/jsQR.js) |
| Runtime bytes / SHA-256 | `256885` / `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859` |
| License | Apache-2.0; full package [LICENSE](LICENSE) text retained and emitted with the browser artifact |
| Runtime dependencies | None in the installed package metadata |

The npm archive's distributed runtime and the official raw GitHub file at the recorded release commit were compared byte for byte and matched. This is source/artifact correspondence; the registry's `gitHead` field is metadata, not a signed source-provenance attestation. The newer upstream default branch was not substituted for the published artifact. The archive contains 17 ordinary files; their exact lengths and SHA-256 values are in [tarball-files.json](tarball-files.json). No archive links, install scripts, remote image assets, WASM modules, or CDN loaders were used. The readable license copy omits one trailing blank line; emitted attribution uses the unmodified installed package license.

An online `npm audit --omit=dev --package-lock-only --json` on 2026-11-19 reported zero known vulnerabilities for the resulting runtime dependency graph. The complete report is [runtime-audit-2026-11-19.json](runtime-audit-2026-11-19.json). This is a dated registry observation, not proof that the decoder is free of defects. The upstream package's development dependencies are not runtime dependencies of this application.

## Why the dependency has this boundary

The application accepts hostile local images. jsQR's entry accepts raw RGBA pixels and performs grayscale allocation, binarization, finder-pattern search, extraction, Reed–Solomon correction, and text parsing synchronously. Its source allocates work proportional to image dimensions and can perform substantial candidate search. It also mutates its module-level default options object. The wrapper therefore supplies `inversionAttempts: 'attemptBoth'` explicitly for each call, runs only within a newly created dedicated Worker, bounds input before copies, and terminates the Worker after success, failure, cancellation, or the one-second deadline.

The source review examined the entry point, pixel/dimension allocations, locator/decoder loops, exports and bundled dependencies. A lexical capability check rejects `eval`, constructed functions, fetch, XHR and WebSocket use in the exact artifact. This check supplements source review; it is not a complete sandbox or a general JavaScript security proof. The browser's existing `connect-src 'none'` policy is retained.

The exact permitted decoder graph is four modules: `decode.worker.ts`, `decoder.ts`, `protocol.ts`, and this one pinned `dist/jsQR.js`. The normal document and private-vault Worker cannot import the decoder runtime. The emitted `qr-graph-worker.json` binds the dedicated Worker asset and dependency source hashes; the build scanner rejects missing, extra, misplaced, unpinned, or unlicensed decoder artifacts. The existing private-Worker graph and count checks remain intact. No blanket Worker or `node_modules` allowance was added.

## Intake and installation limits

The first local offline `npm ci --ignore-scripts` attempt exited `137`. The cause was not established. Local authoring used a physical copy of the existing pinned dependency directory from the main checkout and the verified cached jsQR archive; it did not modify the source directory and did not use cross-worktree symlinks. The copied base lockfile SHA-256 was `8872a625711d1f38268be2b52d1b1645618bd5ee1b473e4770790cc24a9a2cda`. A fresh hosted `npm ci --ignore-scripts` remains an independent required gate. The local dependency reuse is not reported as a successful fresh install.

## Qualification scope

`apps/web/test/qr-decoder-oracle.test.mjs` gives an outside scanner the 25 committed matrix vectors, including the 2,048-byte envelope, plus rotated, inverted, damaged and unreadable images. These matrices are frozen independently of the new decoder. The actual emitted-browser gate is `npm run test:qr:browser`; it uses the real SVG, image primitives and emitted decoder Worker. Its permission-denial and late-permission schedules use a synthetic camera permission port backed by a real canvas MediaStream. Neither test is an iOS, Android, physical camera, print, low-light, or minimum phone-performance qualification.

Multiple clearly detected symbols are refused. The second scan after masking the first symbol cannot prove that an overlapping, damaged or otherwise unreadable second symbol is absent. Every recovered candidate still requires full explicit review. This intake does not resolve the D6 invite signing-key profile, enable economic handoff, or satisfy the separate Tier B reviews for PRs #171 and #172.

Current execution results and remaining external gates are recorded in [the QR execution report](../../../docs/execution/qr-public-flow-2026-11-19.md).
