# Product, recovery and release: reusable-code research

Research date: **2026-11-03, America/Vancouver**. This is source-level research. No dependencies were installed, imported into the product or qualified by execution.

## Findings

The strongest reuse opportunities are **a single evaluated ZXing reader/writer stack for QR, JCS canonicalization behind a strict adapter, selected accessibility and IndexedDB tests, and TUF/multiformats/CAR components for explicitly defined release profiles**. Existing encrypted storage, localization and asset-update services already contain substantial implementation. Broad replacements would create migration work without resolving the actual gaps.

The reviewed repository revisions are main `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa` and open PR #26 at `94554ecf9854e4604f9f56afe5bebedeee931994`. Local inspection used 653 source/test/configuration blobs matched by the coordinator to PR #26 plus separately fetched documents, not a claimed complete clone.

The [current remainder ledger][remainder] separates unfinished integration from existing local implementation:

| Area | Existing work to reuse | Remaining work |
| --- | --- | --- |
| QR | PR #26's `CandidateAttemptAdmission`, bounded file imports and generic application sharing | P-QR-PROFILE's exact type-specific payload/signature/codec contract and P-QR-ENGINEERING's actual scanner/producer. The [specification][qr-spec] caps single envelopes at 2,048 UTF-8 bytes and explicitly defers animated backups. |
| Locale/accessibility | Main's typed catalog and PR #26's complete bundled locale selection/Intl/direction runtime | Reviewed source/translated safety text and actual physical accessibility/device qualification |
| Storage/recovery | Encrypted snapshot store, compare-and-swap, migrations, fresh-key recovery and PR #26's current-backup verification | Target-browser/device qualification and identified persistence regressions; no reason to replace encryption/storage wholesale |
| Release/distribution | Main's release/locator verifiers; PR #26's asset updater, accepted-release floor, staging and scriptless portal | P-G15-PROFILE's bootstrap, rotation/threshold/revocation, deployment and archive-extraction contracts; real distribution evidence |

**Destination availability:** `apps/web/src/ui/locale/catalog.ts`, `scripts/test-locale-layout-browser.mjs`, `packages/storage/src/idb-vault-store.ts`, `packages/security/src/release-manifest.ts` and `packages/security/src/release-locator.ts` are on examined main. `apps/web/src/content-policy/local-policy.ts`, `apps/web/src/sharing/generic-app-link.ts`, `apps/web/src/ui/locale/runtime.ts`, `packages/security/src/release-update*.ts`, `scripts/test-browser-zoom.mjs`, `scripts/distribution/` and `scripts/portal/` depend on PR #26. Proposed paths below do not exist yet.

## Candidate register

Every commit and license-file link below was inspected. Source package versions are reported where read; they do **not** establish correspondence to an npm tarball. Default-branch commit dates are limited maintenance evidence, not support guarantees. All sixteen repositories reported `archived:false` at observation. Advisory/transitive-license audits, package provenance, browser bundles and test execution remain admission work.

| Candidate | Inspected immutable source / commit date (UTC) | Verified license file | Decision |
| --- | --- | --- | --- |
| **1. @zxing/browser 0.2.1** | [9ad027d](https://github.com/zxing-js/browser/commit/9ad027d88d4533bd6d29f9d8d7e517e23cd361ff) · 2026-07-06 | [MIT](https://github.com/zxing-js/browser/blob/9ad027d88d4533bd6d29f9d8d7e517e23cd361ff/LICENSE) | Preferred QR reader + renderer evaluation |
| **2. qr-scanner 1.4.2** | [abcfe1b](https://github.com/nimiq/qr-scanner/commit/abcfe1bce2703721408d8ce7ebde94a359998506) · 2022-11-23 | [MIT](https://github.com/nimiq/qr-scanner/blob/abcfe1bce2703721408d8ce7ebde94a359998506/LICENSE) | Alternative; older default branch |
| **3. qrcode 1.5.4** | [3848ed2](https://github.com/soldair/node-qrcode/commit/3848ed2c17de5bcdead487417dbf14c5dd017f8d) · 2024-08-05 | [MIT](https://github.com/soldair/node-qrcode/blob/3848ed2c17de5bcdead487417dbf14c5dd017f8d/license) | Alternate renderer / independent oracle |
| **4. @ngraveio/bc-ur 2.0.0-beta.9** | [428b039](https://github.com/ngraveio/bc-ur/commit/428b039e6e658b920c7d540ba34be8a676d45409) · 2026-02-19 | [MIT](https://github.com/ngraveio/bc-ur/blob/428b039e6e658b920c7d540ba34be8a676d45409/LICENSE) | Deferred animated-QR reference |
| **5. canonicalize 5.1.0** | [31fb117](https://github.com/erdtman/canonicalize/commit/31fb117afde3ef305b2e1d99bde539bf6300bc62) · 2026-09-18 | [Apache-2.0](https://github.com/erdtman/canonicalize/blob/31fb117afde3ef305b2e1d99bde539bf6300bc62/LICENSE) | Candidate JCS adapter / test oracle |
| **6. idb 8.0.4** | [654c746](https://github.com/jakearchibald/idb/commit/654c746bef13f9fe7f5871e03ac58015cebace5a) · 2026-10-06 | [ISC](https://github.com/jakearchibald/idb/blob/654c746bef13f9fe7f5871e03ac58015cebace5a/LICENSE) | Connection-lifecycle reference |
| **7. fake-indexeddb 6.2.7** | [09e7f76](https://github.com/dumbmatter/fakeIndexedDB/commit/09e7f7684193e9c3a206054200f6f991595cb6ec) · 2026-10-30 | [Apache-2.0](https://github.com/dumbmatter/fakeIndexedDB/blob/09e7f7684193e9c3a206054200f6f991595cb6ec/LICENSE) | Development-only targeted tests |
| **8. FormatJS intl-messageformat** | [d097f4e](https://github.com/formatjs/formatjs/commit/d097f4e3d5fae1bf6a99976e424b05fddd6dd5dd) · 2026-11-04 | [BSD-3-Clause](https://github.com/formatjs/formatjs/blob/d097f4e3d5fae1bf6a99976e424b05fddd6dd5dd/packages/intl-messageformat/LICENSE.md) | Locale test reference; defer grammar migration |
| **9. i18next** | [14faff4](https://github.com/i18next/i18next/commit/14faff4f7d9c86230c49018f804b30899566e4f6) · 2026-11-03 | [MIT](https://github.com/i18next/i18next/blob/14faff4f7d9c86230c49018f804b30899566e4f6/LICENSE) | Not selected; overlaps current runtime |
| **10. axe-core** | [73b05b7](https://github.com/dequelabs/axe-core/commit/73b05b710a39693bbe8c0db57479f20ab50db486) · 2026-11-03 | [MPL-2.0](https://github.com/dequelabs/axe-core/blob/73b05b710a39693bbe8c0db57479f20ab50db486/LICENSE) | Preferred development-only checks |
| **11. Playwright** | [0ea3691](https://github.com/microsoft/playwright/commit/0ea36910324ed8aa2a5f460317cbd35881ee88d4) · 2026-11-03 | [Apache-2.0](https://github.com/microsoft/playwright/blob/0ea36910324ed8aa2a5f460317cbd35881ee88d4/LICENSE) | Retain existing project pin 1.64.1 |
| **12. Web Platform Tests** | [b3ab3b1](https://github.com/web-platform-tests/wpt/commit/b3ab3b13babb3798490d2e6b2d6e6f84bc326f65) · 2026-11-04 | [BSD-3-Clause](https://github.com/web-platform-tests/wpt/blob/b3ab3b13babb3798490d2e6b2d6e6f84bc326f65/LICENSE.md) | Adapt selected native browser tests |
| **13. tuf-js** | [f14b2fa](https://github.com/theupdateframework/tuf-js/commit/f14b2facd4389f1441c88f21b07abb2788cb8ccd) · 2026-10-29 | [MIT](https://github.com/theupdateframework/tuf-js/blob/f14b2facd4389f1441c88f21b07abb2788cb8ccd/LICENSE) | Trust-transition design; separate Node tooling |
| **14. multiformats 14.0.5** | [0dcd129](https://github.com/multiformats/js-multiformats/commit/0dcd129adb06743d5005245c0e39631f13b86251) · 2026-07-23 | [MIT OR Apache-2.0](https://github.com/multiformats/js-multiformats/blob/0dcd129adb06743d5005245c0e39631f13b86251/LICENSE) | Candidate CID/block-validation adapter |
| **15. @ipld/car 5.4.7** | [ed820dd](https://github.com/ipld/js-car/commit/ed820dddeaaf79f46f6b18a3116a47bb2a180e3a) · 2026-07-30 | [MIT OR Apache-2.0](https://github.com/ipld/js-car/blob/ed820dddeaaf79f46f6b18a3116a47bb2a180e3a/LICENSE) | Candidate CAR reader after archive profile |
| **16. @helia/http 4.0.8** | [cba1ed6](https://github.com/ipfs/helia/commit/cba1ed69b4369924790d9eccdb8c9089435f4f20) · 2026-09-29 | [MIT OR Apache-2.0](https://github.com/ipfs/helia/blob/cba1ed69b4369924790d9eccdb8c9089435f4f20/packages/http/LICENSE-MIT) | Optional retrieval; reject default networking |

The examined project has no root license. [THIRD_PARTY_NOTICES.md][project-notices] does not grant blanket compatibility clearance. Preserve full notices and component-specific obligations when selecting code. In particular: ZXing's browser layer is MIT but its core decoder is Apache-2.0; FormatJS's examined package is BSD-3-Clause; idb is ISC; axe-core is MPL-2.0 with separate bundled notices.

## 1. QR: codecs plus explicit public-data validation

### ZXing: preferred reader and renderer together

**Inspected code:** [BrowserQRCodeReader][c1s1] delegates to `@zxing/library`; [BrowserCodeReader][c1s2] provides `decodeFromStream`, image decoding, camera acquisition and stoppable controls; [BrowserQRCodeSvgWriter][c1s3] supplies `write`/`writeToDom` with correction-level and margin hints. One evaluated stack can cover both reading and rendering.

**Where:** proposed `apps/web/src/sharing/qr-camera.ts` and `qr-renderer.ts`, and a separately defined `packages/schemas/src/qr-candidate.ts`. Keep camera ownership in the app layer and validated import authority in the existing domain services. Reuse PR #26's `CandidateAttemptAdmission` for the real consumer; it currently implements only attempt accounting.

**Missing glue:** user gesture/permission lifecycle, track cleanup after accept/cancel/background/unmount, late permission-resolution cleanup, image-dimension and decoded-byte limits, one candidate per confirmation, expiry/chain/hash checks, deduplication and accessible review. Prefer selected files/media over URL-loading conveniences. [Media Capture and Streams][media-spec] is the platform reference.

**Acceptance:** independent producer/decoder roundtrips for every allowed type; 2,048-byte code and 64 KiB public-file boundaries; camera denial/manual fallback; cancellation and background cleanup; no scan-triggered network, navigation, signing or storage writes; printed/low-light tests on real iOS/Android/desktop.

The [package manifest][c1s4] requires `@zxing/library ^0.23.0` and optionally `@zxing/text-encoding`. Core v0.23.0 resolves to `1722d0744fb5e8b47aebfbeb2b648e17c95e8595` with [Apache-2.0 terms][zxing-core-license]. Pin and qualify both layers and their complete emitted graph. The current browser package's dev dependency differs from its peer range; this research does not assert the chosen pair was executed.

### qr-scanner and node-qrcode: alternatives, not automatic extra dependencies

[qr-scanner][c2s1] supports `scanImage`, `BarcodeDetector`, a dynamically loaded worker fallback and `destroy`/`pause`. It can replace the codec inside proposed `qr-camera.ts`, but the inspected default branch remains v1.4.2 from 2022. Compare physical decode quality, worker teardown, permission races and image bounds against ZXing. Its worker assets need an exact CSP/build review. Do not use its arbitrary URL input convenience in the product.

[node-qrcode's browser entry][c3s1] offers `create`, `toCanvas`, `toDataURL` and SVG rendering. Use as an alternate `qr-renderer.ts` implementation or independent test producer, not a second renderer without evidence of need. The [manifest][c3s2] also includes CLI/server dependencies: inspect the emitted browser graph. Prefer canvas/controlled generated elements over generic HTML insertion. Test UTF-8 byte boundaries, correction level, quiet zone, contrast and cross-decoding.

PR #26's generic application sharing does not establish a QR protocol. The present type list does not automatically include an `app-link` type, and private trade/profile/wallet-session data must not enter generic sharing.

### canonicalize: candidate JCS serializer and independent oracle

[canonicalize][c5s1] implements UTF-16 key ordering, primitive serialization, nonfinite-number and ill-formed-string refusal, and iterative traversal. [Version 5.1.0][c5s2] has ESM exports and no declared runtime dependencies. It fits the specified RFC 8785 payload hashing more closely than a generic “stable stringify” package.

**Where:** proposed `packages/schemas/src/qr-canonicalization.ts` and independent vectors in `packages/schemas/test/qr-canonicalization.test.mjs`. Do not change existing signed trade-term or release encodings as part of this integration.

**Glue/tests:** accept validated plain JSON only; bound depth, nodes, strings and final output; retain duplicate-key rejection at input parsing; compare exact UTF-8 bytes to [RFC 8785][rfc8785] vectors. The serializer supports JavaScript `toJSON` behavior and is not a hostile-object parser. Existing [`parseStrictJsonBytes`][registry-source] has a registry-specific six-level/non-negative-safe-integer grammar. Do not globally loosen it to satisfy QR's eight-level ceiling; select a compatible subset or a separately reviewed QR parser. Source uses `String.prototype.isWellFormed`, which belongs in browser qualification. Hash equality authenticates no sender.

### BC-UR: future animated transport only

The examined [package][c4s3] is **2.0.0-beta.9**. Current [`UrFountainDecoder.receivePartUr`][c4s1] and [`FountainDecoder`][c4s2] differ from older `URDecoder` examples. They supply multipart reconstruction/checksums, not application signatures or backup recovery policy.

**Where if separately selected:** future `apps/web/src/sharing/qr-ur-session.ts` with a chosen UR type/CBOR profile. It must not enter current G03 backups: the QR spec defers animated backups and specifies files for oversized payloads. Before admission, define aggregate byte/fragment/work/time limits, session/type isolation, reset behavior, dependency intake and independent encoder/decoder vectors. Stop clears session state; checksums do not replace authentication.

## 2. Storage and recovery: reuse tests before abstractions

### idb: connection-lifecycle reference

[`openDB`][c6s1] exposes `upgrade`, `blocked`, `blocking` and `terminated` callbacks. [The official README][c6s2] explains transaction auto-close around unrelated asynchronous work. These are useful references for `IndexedDbVaultStore` and PR #26's `IndexedDbAcceptedReleaseStore`.

**Decision:** retain the existing stores. Their atomic compare-and-swap, expected-envelope checks, invalidation and abort semantics matter more than promise syntax. If a verified lifecycle gap appears, adapt a small pattern or test; a full idb migration would need equivalence evidence.

**Acceptance:** blocked upgrade, version-change/abnormal closure, two-tab CAS conflict, quota/write refusal, cancellation before/after actual commit, preserved source ciphertext during fresh-key restore, and completion only after the transaction commits. IndexedDB `strict` is a durability hint, not a universal crash-proof guarantee; see [Indexed Database API 3.0][idb-spec].

Dexie was also screened: [transaction source][dexie-code] and [Apache-2.0 license][dexie-license] were inspected at `45aade72aa19a601e6a13aa877beb7389e15b5d2`. It would introduce a larger transaction/query framework without supplying missing device or backup-retention evidence, so it is not selected.

### fake-indexeddb: targeted development-only coverage

[`FDBFactory`][c7s1] and [official usage guidance][c7s2] provide an in-memory implementation, isolated factories and abnormal-close testing. Use only for new cases in `packages/storage/test/idb-vault-store.test.mjs` or accepted-release-store tests, with scoped test state. Never use it as production persistence fallback.

Useful cases include connection/version events, rollback, CAS contention and deterministic write refusal. The inspected factory explicitly does not implement storage keys. An in-memory engine also cannot establish real eviction, origin partitioning, disk durability or mobile OS termination behavior. Preserve native browser/Worker qualification and avoid duplicating cases already covered.

### Web Platform Tests: adapt selected native cases

Inspected [explicit commit][c12s1], [abort][c12s2] and [Worker termination during upgrade][c12s3] tests. They provide platform expectations for committed data visibility, transaction state, abort ordering and interrupted upgrades.

**Where:** existing `scripts/test-lifecycle-tabs-browser.mjs`, `scripts/test-reseal-crash-browser.mjs` and related native fixtures, only where current coverage has a gap. Preserve provenance and individual source notices for copied code. The upstream Worker test generates blob-worker source; adapt its expected behavior to the project's static Worker/CSP boundary.

**Acceptance:** execute with the actual pinned Chromium/Firefox/WebKit engines and identify each executed engine. Node/fake-indexeddb results cannot substitute for those runs, and WPT conformance cannot establish power-loss recovery or off-device retention.

## 3. Locale, accessibility and mobile qualification

### FormatJS: test reference, possible later formatter

[`IntlMessageFormat`][c8s1] and [its tests][c8s2], including Arabic plural branches, are useful semantic references. The engine supports broader ICU grammar/rich-text results than P2P Offramp's bounded plain-text `formatMessage`. The project already uses native Intl and keeps canonical signing bytes outside localization.

**Where:** selected examples/oracles for `apps/web/src/ui/locale/catalog.ts` and its tests. A runtime migration needs an explicit grammar version, exact variable parity, text-only policy, size limits and catalog migration. It must not touch signing or canonical amount parsing.

**Acceptance:** whole-catalog safety fallback, complete keys/variables, bidi-safe presentation with unchanged copy bytes, supported plural branches and canonical amount preservation. Neither the formatter nor generated translations supplies reviewed/published safety-language status. The inspected package license is BSD-3-Clause.

### i18next: credible but unnecessary for the present gap

[Translator][c9s1] and [defaults][c9s2] cover fallback, namespaces, interpolation and optional backend/missing-key integration. These overlap with the complete-catalog store while adding policy translation work.

**Decision:** preserve the current runtime and prioritize reviewed catalogs and physical assistive tests. If future requirements justify i18next, keep it at the presentation boundary; use explicitly bundled resources and selection, prohibit private values in reporting, and separately review any backend or detection plugin. `saveMissing` is off by default; network reporting is not an unavoidable property of the library. Its tests would need to demonstrate the same all-or-nothing safety fallback and locale-independent signed bytes.

### axe-core with the existing Playwright harness

[axe's `run`][c10s1] returns structured DOM audit results. Admit it as an exact development dependency, retaining [third-party notices][c10s2]; load it locally in tests, not from a CDN or the production bundle.

**Where:** `scripts/test-locale-layout-browser.mjs` and app/portal fixtures. A proposed focused `scripts/test-accessibility-browser.mjs` is reasonable only if sharing the existing harness is clearer. Cover backup verification, terms review, errors, confirmations, privacy controls and future QR review. Inspect the rendered scriptless portal without weakening its served policy.

**Acceptance:** actionable rule/node results, retained incomplete/manual-review outcomes, keyboard/focus restoration, accessible names and textual state/error changes. Automated checks cannot certify WCAG. [Playwright's official accessibility guidance][c11s2] requires complementary manual assessments.

Playwright is already pinned at **1.64.1** in the repository. The inspected [BrowserType source][c11s1] and [emulation guide][c11s3] are references, not a recommendation to upgrade to moving main. Reuse the current fixtures and qualify its actual browser binaries. Device descriptors simulate viewport/user-agent/touch characteristics; they do not execute physical wallet handoffs, OS camera flows, screen readers or app-switch eviction. [W3C Reflow guidance][reflow] describes the 320 CSS-pixel/400% relationship; retain viewport, real zoom and physical accessibility results as distinct evidence.

## 4. Authenticated static release and archives

### TUF / tuf-js: strongest trust-transition reference examined

Inspected [`Updater`][c13s1], [`TrustedMetadataStore`][c13s2] and [tests][c13s3]. The trust store verifies the next root with both old and new root authority, enforces sequential root versions and checks signed timestamp/snapshot/expiry relationships. This directly informs P-G15-PROFILE's missing rotation and threshold decisions.

**Where:** a decision record adjacent to G15 specs, then—if chosen—separate Node/operator tooling such as proposed `scripts/distribution/tuf-profile-check.mjs` and transition fixtures in `packages/security/test/`. Preserve `verifyRelease` and `verifyReleaseLocator` for the current format.

**Fit limitation:** `Updater` imports Node `fs`/`path`, reads local trusted metadata and speaks TUF metadata. Browser integration needs an explicit storage/network/cancellation/format mapping. Browserifying it or borrowing one rotation function is not full TUF conformance. [TUF 1.0.37][tuf-spec] (observed at the official latest-spec URL; last modified 8 October 2026) requires an initial trust root and roles; it does not select project key holders or authenticate the first browser page retroactively.

**Acceptance:** prior/new-root thresholds, skipped/repeated versions, expiry, target hash/length, persistent rollback floors, revocation and original-release recovery after update. Define how TUF composes with the current locator, or choose a new versioned contract; avoid two ambiguous authorities.

### multiformats: standard CID and digest handling

[`CID`][c14s1] and [browser SHA-2][c14s2] supply CID parsing/encoding and multihash support. Use a pinned subpath in a separately defined CID/archive adapter adjacent to `packages/security/src/release-locator.ts`. Keep existing accepted CID constraints until a new codec profile is explicit.

**Acceptance:** exact version/base/codec/hash allowlists, canonical textual representation, actual-byte digest comparison, bounded identifier length, extra-byte refusal and full release-signature checks. A parsed CID establishes neither publisher trust nor availability.

For hosting, preserve CID-scoped subdomain origins. [IPFS gateway documentation][ipfs-origins] distinguishes their isolation from shared-origin path gateways. A library cannot repair a hosting origin that conflicts with the private store's origin assumptions.

### @ipld/car: bounded parser, not verified extraction by itself

[`CarBlockIterator.fromIterable`][c15s1] parses a header and yields blocks; [`CarReader.fromIterable`][c15s3] retains the decoded archive in memory. The [decoder][c15s2] returns CID/bytes pairs; the consumer must independently recompute and compare block digests. [Iterator tests][c15s4] provide chunking/reference cases.

**Where:** proposed `packages/security/src/release-archive-car.ts` after the archive contract is selected; staging/fixtures in `scripts/distribution/` and `packages/security/test/`. Existing locator archive-digest support is not an already implemented CAR extractor.

**Missing glue:** aggregate/header/section/block count and length limits; cancellation/drain; root policy; reachable-block validation; signed asset-path mapping; filename restrictions; exact file hashes; old ABI/registry retention; atomic publication. CAR is a block archive, not automatically a filesystem or release manifest. Choose any UnixFS traversal contract explicitly.

**Acceptance:** independent producer/consumer vectors; truncated/extra/duplicate blocks; altered bytes; unknown codecs; multiple roots; absent signed assets; staged cancellation; and measured memory on supported targets. An iterable API alone does not prove a hard peak-memory bound.

### Helia: optional retrieval, no default networking

The current [`@helia/http` implementation][c16s1] exposes `withHTTP` and demonstrates `withHTTP(createHeliaLight(), options)`. Older `createHeliaHTTP` examples do not describe this pin. Its [package manifest][c16s2] declares MIT OR Apache-2.0. Defaults add delegated HTTP routers and recursive trustless gateways. Content validation does not make those routing requests private.

**Where if selected:** a distinct G05-mediated retrieval adapter with explicit router/gateway allowlists, cancellation, no direct fallback and a pinned block-verification graph. Do not initialize it just to display a fingerprint or parse a CID, and do not insert package defaults into `createAssetUpdateController`.

**Decision:** evaluate offline multiformats/CAR first; defer the full retrieval runtime unless actual IPFS requirements justify it. Tests must establish no calls before consent, no implicit default endpoints, full broker mediation, bounded work/retries and teardown. Bootstrap and distribution witnesses remain separate.

## 5. Concrete next tasks

1. Reconcile the receiving source with PR #26 before changing its supported import/locale/update paths.
2. Add focused axe/WPT/fake-indexeddb coverage only for an identified remaining state/engine gap; avoid repeating completed suites.
3. Define QR v1 payloads, signature domains, canonical bytes, correction profile and independent vectors; then evaluate the single ZXing stack and JCS adapter. Keep file recovery independent and animated backups deferred.
4. Use TUF as the trust-transition review baseline and define the archive profile before importing multiformats/CAR. Preserve the current supported asset updater.
5. At adoption, complete artifact/source correspondence, full dependency/license inventory, exact browser/Worker bundle review and targeted execution. These research pins alone are not dependency admission.
6. Finish project-specific evidence: reviewed safety text/translations, real devices/wallets/cameras/assistive systems, trust-root custody and real publication/operator records.


[c1s1]: https://github.com/zxing-js/browser/blob/9ad027d88d4533bd6d29f9d8d7e517e23cd361ff/src/readers/BrowserQRCodeReader.ts
[c1s2]: https://github.com/zxing-js/browser/blob/9ad027d88d4533bd6d29f9d8d7e517e23cd361ff/src/readers/BrowserCodeReader.ts
[c1s3]: https://github.com/zxing-js/browser/blob/9ad027d88d4533bd6d29f9d8d7e517e23cd361ff/src/writers/BrowserQRCodeSvgWriter.ts
[c1s4]: https://github.com/zxing-js/browser/blob/9ad027d88d4533bd6d29f9d8d7e517e23cd361ff/package.json
[c2s1]: https://github.com/nimiq/qr-scanner/blob/abcfe1bce2703721408d8ce7ebde94a359998506/src/qr-scanner.ts
[c3s1]: https://github.com/soldair/node-qrcode/blob/3848ed2c17de5bcdead487417dbf14c5dd017f8d/lib/browser.js
[c3s2]: https://github.com/soldair/node-qrcode/blob/3848ed2c17de5bcdead487417dbf14c5dd017f8d/package.json
[c4s1]: https://github.com/ngraveio/bc-ur/blob/428b039e6e658b920c7d540ba34be8a676d45409/src/classes/UrFountainDecoder.ts
[c4s2]: https://github.com/ngraveio/bc-ur/blob/428b039e6e658b920c7d540ba34be8a676d45409/src/classes/FountainDecoder.ts
[c4s3]: https://github.com/ngraveio/bc-ur/blob/428b039e6e658b920c7d540ba34be8a676d45409/package.json
[c5s1]: https://github.com/erdtman/canonicalize/blob/31fb117afde3ef305b2e1d99bde539bf6300bc62/lib/canonicalize.js
[c5s2]: https://github.com/erdtman/canonicalize/blob/31fb117afde3ef305b2e1d99bde539bf6300bc62/package.json
[c6s1]: https://github.com/jakearchibald/idb/blob/654c746bef13f9fe7f5871e03ac58015cebace5a/src/entry.ts
[c6s2]: https://github.com/jakearchibald/idb/blob/654c746bef13f9fe7f5871e03ac58015cebace5a/README.md
[c7s1]: https://github.com/dumbmatter/fakeIndexedDB/blob/09e7f7684193e9c3a206054200f6f991595cb6ec/src/FDBFactory.ts
[c7s2]: https://github.com/dumbmatter/fakeIndexedDB/blob/09e7f7684193e9c3a206054200f6f991595cb6ec/README.md
[c8s1]: https://github.com/formatjs/formatjs/blob/d097f4e3d5fae1bf6a99976e424b05fddd6dd5dd/packages/intl-messageformat/core.ts
[c8s2]: https://github.com/formatjs/formatjs/blob/d097f4e3d5fae1bf6a99976e424b05fddd6dd5dd/packages/intl-messageformat/tests/index.test.ts
[c9s1]: https://github.com/i18next/i18next/blob/14faff4f7d9c86230c49018f804b30899566e4f6/src/Translator.js
[c9s2]: https://github.com/i18next/i18next/blob/14faff4f7d9c86230c49018f804b30899566e4f6/src/defaults.js
[c10s1]: https://github.com/dequelabs/axe-core/blob/73b05b710a39693bbe8c0db57479f20ab50db486/lib/core/public/run.js
[c10s2]: https://github.com/dequelabs/axe-core/blob/73b05b710a39693bbe8c0db57479f20ab50db486/LICENSE-3RD-PARTY.txt
[c11s1]: https://github.com/microsoft/playwright/blob/0ea36910324ed8aa2a5f460317cbd35881ee88d4/packages/playwright-core/src/client/browserType.ts
[c11s2]: https://github.com/microsoft/playwright/blob/0ea36910324ed8aa2a5f460317cbd35881ee88d4/docs/src/accessibility-testing-js.md
[c11s3]: https://github.com/microsoft/playwright/blob/0ea36910324ed8aa2a5f460317cbd35881ee88d4/docs/src/emulation.md
[c12s1]: https://github.com/web-platform-tests/wpt/blob/b3ab3b13babb3798490d2e6b2d6e6f84bc326f65/IndexedDB/idb-explicit-commit.any.js
[c12s2]: https://github.com/web-platform-tests/wpt/blob/b3ab3b13babb3798490d2e6b2d6e6f84bc326f65/IndexedDB/idbtransaction_abort.any.js
[c12s3]: https://github.com/web-platform-tests/wpt/blob/b3ab3b13babb3798490d2e6b2d6e6f84bc326f65/IndexedDB/worker-termination-aborts-upgrade.window.js
[c13s1]: https://github.com/theupdateframework/tuf-js/blob/f14b2facd4389f1441c88f21b07abb2788cb8ccd/packages/client/src/updater.ts
[c13s2]: https://github.com/theupdateframework/tuf-js/blob/f14b2facd4389f1441c88f21b07abb2788cb8ccd/packages/client/src/store.ts
[c13s3]: https://github.com/theupdateframework/tuf-js/blob/f14b2facd4389f1441c88f21b07abb2788cb8ccd/packages/client/tests/updater.test.ts
[c14s1]: https://github.com/multiformats/js-multiformats/blob/0dcd129adb06743d5005245c0e39631f13b86251/src/cid.ts
[c14s2]: https://github.com/multiformats/js-multiformats/blob/0dcd129adb06743d5005245c0e39631f13b86251/src/hashes/sha2-browser.ts
[c14s3]: https://github.com/multiformats/js-multiformats/blob/0dcd129adb06743d5005245c0e39631f13b86251/LICENSE-MIT
[c14s4]: https://github.com/multiformats/js-multiformats/blob/0dcd129adb06743d5005245c0e39631f13b86251/LICENSE-APACHE
[c15s1]: https://github.com/ipld/js-car/blob/ed820dddeaaf79f46f6b18a3116a47bb2a180e3a/src/iterator.js
[c15s2]: https://github.com/ipld/js-car/blob/ed820dddeaaf79f46f6b18a3116a47bb2a180e3a/src/decoder.js
[c15s3]: https://github.com/ipld/js-car/blob/ed820dddeaaf79f46f6b18a3116a47bb2a180e3a/src/reader-browser.js
[c15s4]: https://github.com/ipld/js-car/blob/ed820dddeaaf79f46f6b18a3116a47bb2a180e3a/test/test-iterator.spec.js
[c15s5]: https://github.com/ipld/js-car/blob/ed820dddeaaf79f46f6b18a3116a47bb2a180e3a/LICENSE-MIT
[c15s6]: https://github.com/ipld/js-car/blob/ed820dddeaaf79f46f6b18a3116a47bb2a180e3a/LICENSE-APACHE
[c16s1]: https://github.com/ipfs/helia/blob/cba1ed69b4369924790d9eccdb8c9089435f4f20/packages/http/src/index.ts
[c16s2]: https://github.com/ipfs/helia/blob/cba1ed69b4369924790d9eccdb8c9089435f4f20/packages/http/package.json
[c16s3]: https://github.com/ipfs/helia/blob/cba1ed69b4369924790d9eccdb8c9089435f4f20/packages/http/LICENSE-APACHE
[remainder]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.json
[qr-spec]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion/module_0.12.4_qr_interchange/spec-qr-everywhere-secure-sharing-and-import-export.md
[project-notices]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/THIRD_PARTY_NOTICES.md
[registry-source]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/schemas/src/registry.ts
[zxing-core-license]: https://github.com/zxing-js/library/blob/1722d0744fb5e8b47aebfbeb2b648e17c95e8595/LICENSE
[media-spec]: https://www.w3.org/TR/2025/CRD-mediacapture-streams-20251009/
[rfc8785]: https://www.rfc-editor.org/rfc/rfc8785
[idb-spec]: https://www.w3.org/TR/IndexedDB/
[dexie-code]: https://github.com/dexie/Dexie.js/blob/45aade72aa19a601e6a13aa877beb7389e15b5d2/src/classes/transaction/transaction.ts
[dexie-license]: https://github.com/dexie/Dexie.js/blob/45aade72aa19a601e6a13aa877beb7389e15b5d2/LICENSE
[reflow]: https://www.w3.org/WAI/WCAG21/Understanding/reflow
[tuf-spec]: https://theupdateframework.github.io/specification/latest/
[ipfs-origins]: https://docs.ipfs.tech/concepts/ipfs-gateway/


