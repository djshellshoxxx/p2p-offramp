# Frontend, wallet, QR, localization, and quality reuse research

Research date: **2026-11-04 UTC**. Scope: source review and upstream code selection, with integration notes for the unfinished frontend and wallet features. This memo changes no runtime code and makes no release approval claim.

## 1. Recommendation and evidence scope

**Finish the existing transaction journey and its release blockers first.** PR #26 already contains the wallet discovery, explicit transaction review, persistent transaction lifecycle, compiled locale runtime, and browser test framework that this project needs. The immediate upstream opportunities are better tests and maintenance tooling around those implementations. QR interchange and external mobile wallet support are real future gaps, but their application profiles still need decisions. Installing a QR renderer or wallet modal alone would not complete those features. [Current package][T-package], [wallet discovery][T-discovery], [transaction lifecycle][T-life], [locale runtime][T-locale], [remainder ledger][T-remainder].

The source snapshots used here are:

- Main: `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa`.
- [PR #26][PR26]: `94554ecf9854e4604f9f56afe5bebedeee931994`, the implementation branch. All target code links below use this commit.
- [PR #27][PR27]: `2f839b12768700ac6c3b674f75a144c6ec19fa93`, containing the [next-run prompt][T-next]. Its reported CI failures and bot findings are prior observations, not tests rerun for this research.

The current package requires Node >=24 and uses React/React DOM 19.3.1, TypeScript 7.0.2, Vite 8.3.5, and `playwright-core` 1.64.1, with native Node tests and separate contract tooling. Existing browser scripts launch Playwright directly. There is no need to introduce another UI framework, browser runner, state framework, or generic wallet abstraction to repair the identified defects. New tool versions must be checked against the project's actual lockfile and browser executables; the upstream commits in §8 are research snapshots, not approved package upgrade versions. [Package and scripts][T-package], [browser harness][T-browser].

**Selection:** extend Playwright; evaluate fast-check and axe-core as development dependencies; introduce a pinned formatter in an isolated mechanical change; use viem selectively as an independent test oracle. For QR, prefer a small local Nayuki encoder plus a bounded jsQR decoder worker for evaluation, with Nimiq's scanner as an alternative camera lifecycle wrapper. Preserve the existing locale and injected-wallet modules. WalletConnect remains a conditional candidate with a custom license and unresolved integration choices. Wallet Standard is a useful future Solana discovery interface; it does not settle the native escrow design.

## 2. What is actually unfinished, and where code belongs

| Area | Verified target state | Exact place for the next work | Reuse decision |
| --- | --- | --- | --- |
| Draft save cancellation | The controller passes `job.abort.signal`; the application service accepts `signal` but calls the runtime without it. This is a concrete boundary defect. | `apps/web/src/app-services.ts` → `commitTradeDraftChange`; regression in `apps/web/test/app-services.test.mjs`, with controller coverage retained. | Repair the existing forwarding call, then test the whole cancellation chain. No new library required. [Service][T-services], [controller][T-draft], [existing service tests][T-services-test]. |
| Recovery of never-sent approvals | Recovery snapshots prepared **fund** intents before `life.recover()`; its later approval-selection path can have no chosen intent. The next-run document reports a never-sent approval becoming stuck in `RECOVERY_SELECTION_REQUIRED`. | `apps/web/src/journey/private-trade.ts` → `createPrivateTradeJourney`, `watch` path; `apps/web/test/journey-private-trade.test.mjs`; lifecycle tests. | Repair action-aware recovery; use fast-check to generate preparation/cancel/reload sequences. Do not replace the journal. [Journey][T-journey], [test file][T-journey-test], [reported finding][T-next]. |
| Resume-listener/browser failure | Browser instrumentation counts all `visibilitychange`/`pageshow` listeners and asserts [1,1]. Prior CI reportedly observed [2,3]. Source alone does not prove which owner leaked or whether the measurement is overbroad. | `scripts/test-locale-layout-browser.mjs` and the actual subscription owners reached by Settings. | Extend existing Playwright clock and lifecycle tests. Identify owners before changing behavior or the assertion. [Harness][T-browser], [failure report][T-next]. |
| EVM wallet lifecycle | Bounded injected-provider discovery, generation checks, explicit selection, and read/submit paths already exist. Discovery expressly disclaims complete lifetime-listener EIP-6963 conformance. | `packages/wallet/src/discovery.ts`, `evm-adapter.ts`, `evm-submit.ts`; existing wallet tests. | Retain; use mipd and the EIPs for conformance comparison. A policy change would be a separate decision. [Discovery][T-discovery], [adapter][T-adapter], [submit/read adapter][T-wallet]. |
| QR interchange | Specification and pending decision files exist; no selected production QR profile. The decision has empty reviewers and status `proposed`. | Existing QR spec and governance files; proposed new `packages/qr/` codec and `apps/web/src/sharing/qr-*` UI/worker modules. These are proposed destinations, not existing paths. | Evaluate Nayuki + jsQR after the profile is fixed; keep decode separate from validation and action. [Spec][T-qr-spec], [proposal][T-qr-proposal], [decision][T-qr-decision]. |
| External mobile wallet | Existing intake evaluated WalletConnect helpers at an exact pin. It did not select or integrate a production provider, relay, wallet URI, or callback contract. | Existing `docs/execution/profiles/05-mobile.md`, `security/intake/mobile-wallet/`; later a narrow connector beside existing wallet adapters. | Extend the existing intake; avoid repeating it or claiming mobile support from the injected adapter. [Profile][T-mobile], [intake][T-mobile-intake], [pins][T-mobile-pins]. |
| Locale publication | Typed catalogs, compiled selection, local preferences, help, and layout tests exist. Runtime explicitly says all selections remain ineligible for funds, including draft English and fixtures. | `apps/web/src/ui/locale/{catalog,en,runtime,bundled}.ts`, `ControlHelp.tsx`, help registry. | Complete review/translation evidence and tests. FormatJS/i18next are optional future tools, not blockers for the current release. [Runtime][T-locale], [source catalog][T-en], [bundles][T-bundled], [help][T-help]. |
| Physical/browser qualification | Current ledger separates local completion from physical/device qualification. Firefox/WebKit tooling and exact physical wallet/assistive-tech observations cannot be inferred from Chromium emulation. | Existing browser scripts and `Q-PHYSICAL-LOCALE` / mobile qualification records in the remainder ledger. | Extend Playwright where tooling permits; record the real device/browser/wallet versions for physical runs. [Ledger][T-remainder], [emulation capabilities][pw-emulation]. |
| Production peer exchange/release | PR #26 provides local proof; production peer acceptance and release trust are separate unfinished work. | Root research's protocol and release lanes; keep this memo's tests compatible with them. | Do not let frontend library installation mark those capabilities complete. [PR #26][PR26], [next-run priorities][T-next]. |

These are proposed task boundaries, not a new completion ledger. Use the repository's authoritative task process and current PR owners. The subsequent implementation should recheck the active head before changing these paths; this research does not authorize merging the large open implementation PR.

## 3. Immediate reusable code: quality and transaction state

### 3.1 Playwright — extend the current runner

**Decision: extend now; do not migrate.** The project already depends on Playwright. Upstream's [accessibility integration example][playwright-access], [browser documentation][playwright-browser], and [browser revision manifest][playwright-manifest] provide concrete reusable patterns. The browser manifest also demonstrates why an arbitrary installed browser is not evidence for a different package version. License is Apache-2.0; current researched default-branch commit is dated 2026-11-03. See U1 in §8.

Use the existing `scripts/test-locale-layout-browser.mjs`, `scripts/test-journey-browser.mjs`, `scripts/test-journey-origin-browser.mjs`, and `scripts/test-lifecycle-tabs-browser.mjs`. Keep the current Node assertions and explicit server/browser setup unless a small refactor pays for itself. Reuse browser contexts for isolation, deterministic clock control, explicit page-error capture, and trace/screenshot artifacts on failure. [Locale harness][T-browser], [journey][T-browser-journey], [origin tests][T-browser-origin], [tab lifecycle tests][T-browser-tabs].

The listener failure deserves focused diagnosis. The current init script wraps both targets' global listener methods, so its count includes any component installing these events. An acceptable fix identifies the intended owners, tests mount/unmount and locale/profile changes, and proves each owner disposes its own subscription. Merely changing expected [1,1] to [2,3] would not establish disposal correctness. Conversely, removing legitimate unrelated listeners to satisfy a global count would be a regression. Measure an explicit ownership invariant and retain an integration check that repeated transitions do not grow the total.

Suggested acceptance cases:

- Repeated Settings entry/exit and locale selection do not accumulate timers or subscriptions; the last unmount disposes them.
- `pageshow`, visibility return, and clock advancement refresh observations without manufacturing an unlocked vault or transaction authority.
- Two isolated clients complete the selected native/ERC20 journey with independent profiles; reload/reconnect exercise durable recovery.
- Chromium, Firefox, and WebKit results record exact runner and browser versions, with unavailable engines explicitly unexecuted. Browser downloads require the normal environment's permitted host/tooling; no successful run is inferred here.
- A narrow headed/device run supplements emulation for focus, camera, mobile app switching, and file sharing.

Playwright's [emulation documentation][pw-emulation] describes browser/device parameters; it cannot demonstrate a physical wallet process resuming correctly after the operating system suspends the app. That remains measured qualification, not a browser fixture result.

### 3.2 fast-check — model-based tests around the existing lifecycle

**Decision: evaluate as a development-only dependency.** Relevant actual modules are [`commands.ts`][fc-commands] and [`AsyncCommand.ts`][fc-async]. They expose generated command sequences and asynchronous command contracts suitable for the project's Node tests. License is MIT; source inspected at a 2026-11-03 default-branch commit. This is a test generator, not a reason to rewrite the production state machine.

Best destinations are `packages/domain/test/tx-lifecycle.test.mjs`, `apps/web/test/journey-private-trade.test.mjs`, `apps/web/test/draft-controller.test.mjs`, and `apps/web/test/app-services.test.mjs`. Keep the test model smaller and independent of the implementation: whether a native send may have happened, whether a durable marker exists, current wallet/account generation, current draft revision, and whether reconciliation is required. [Lifecycle tests][T-life-test], [journey tests][T-journey-test], [draft tests][T-draft-test], [service tests][T-services-test].

Generate sequences such as prepare approval → cancel before send → lock → reload → recover; prepare fund → uncertain native response → account/chain change → reload → reconcile; preview save → cancel → delayed runtime response; and repeated return/visibility events. Avoid generating a mirror of every production enum branch: that can reproduce the same mistake in the oracle.

Acceptance criteria should include no second send after uncertain submission, a usable terminal outcome for a never-sent prepared approval, no late write once cancellation is effective at the storage boundary, stale generation responses discarded, and no state transition from a UI callback alone. When a failure shrinks, save the minimized scenario as an ordinary regression test. Retain seed/replay information for reproducibility.

Prerequisites are the two direct bug fixes in §2, a lockfile-reviewed package selection, and independent review of recovery invariants. Passing generated tests would improve evidence; it would not prove finality, a safe contract, or production wallet interoperability.

### 3.3 axe-core — accessible states in the real app

**Decision: add automated checks to the existing browser harness.** The inspected upstream [`run.js`][axe-run] implements the runner; its [README][axe-readme] and Playwright's [official accessibility guide][pw-access] explain the intended test integration and its limits. The actual core license is **MPL-2.0**, not MIT. Preserve applicable notices and review obligations if modifying or redistributing core files. An optional `@axe-core/playwright` adapter needs its own package/license review; inspecting core's license does not clear every wrapper.

Run the local test bundle against the real rendered pages: setup/unlock, explicit signing review, recovery selection and outcomes, Settings, and any eventual QR preview. Keep it outside the shipped application bundle. Use the existing typed locale selection and help states rather than a detached demo component. [Help][T-help], [locale runtime][T-locale], [browser UI tests][T-browser].

Automated checks should be accompanied by keyboard tab order, Escape/close behavior, restoration of focus to the opening control, zoom and narrow-width layout, visible labels, loading/error announcements, and a focused review of amounts, network identifiers, and addresses under RTL. W3C's [focus-not-obscured guidance][wcag-focus] and [target-size guidance][wcag-target] are useful acceptance references; the latter specifies 24×24 CSS pixels with stated exceptions. Automated zero-violation output alone is not a complete WCAG or assistive-technology qualification claim.

The remaining operator evidence is exact VoiceOver/TalkBack and device/version behavior and reviewed translations. Do not copy third-party app screenshots or accessibility badges as proof for this app.

### 3.4 Prettier — an isolated reviewability improvement

**Decision: use a pinned development formatter after integrating or splitting the active implementation work.** Upstream's [README][prettier-readme] describes the formatting tool; the inspected license is MIT and source is recently active. The immediate value here is making dense application-service and recovery logic reviewable, not changing runtime behavior.

The concrete candidates are `apps/web/src/journey/private-trade.ts`, `apps/web/src/app-services.ts`, and other files selected by the next implementation owner. Start with an agreed configuration and a small path scope; put any bulk mechanical formatting in its own reviewable change after resolving overlap with PR #26. Run a formatting check in CI only once the intended scope is formatted. Do not hand-edit generated fixtures or byte-level canonical payloads to satisfy a style rule. Where whitespace participates in a fixture, confirm which bytes are intentional before enabling formatting there. [Dense journey source][T-journey], [service boundary][T-services], [next-run reviewability priorities][T-next].

No formatter can make a 617-file change independently reviewed. It supports the next-run document's smaller coherent PR approach; it does not replace that integration work.

### 3.5 viem — an independent oracle, with the existing lifecycle retained

**Decision: adapt into dev/test fixtures first; no broad runtime replacement.** Actual inspected source includes [`hashTypedData.ts`][viem-typed] and [`waitForTransactionReceipt.ts`][viem-receipt]. The latter distinguishes replacement reasons such as cancelled/replaced/repriced. These are useful external comparison cases for the custom EVM modules. MIT is verified in **`src/LICENSE`**; the repository's coarse metadata reported no asserted license, so the source-file license is the relevant evidence. See U5.

Extend the existing [ethers 6.15.0 fixture generator](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/test/fixtures/g16-independent-generate.mjs) and its [retained cross-implementation vectors](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/test/fixtures/g16-independent-README.md) before adding viem as another typed-data oracle; these fixtures already cover native/ERC20 domain separators, struct hashes, digests and both parties' signatures without adding ethers to the runtime dependency graph.

Use independent expected digests and receipt/replacement fixtures to test the custom terms binding and `packages/domain/src/tx-lifecycle.ts`. A replacement receipt from a library still needs the project's account/chain/nonce/calldata checks and durable journal reconciliation. Preserve the project's separate prepared, pending, confirmed, finalized, replaced, dropped, reverted, and reorged outcomes. [Lifecycle source][T-life], [wallet read/submit code][T-wallet].

Do not replace uncertain-send handling with a new SDK's polling or resend defaults. A small test-only package surface also avoids assuming that adopting all of viem is required to get trustworthy vectors. The root escrow/protocol research owns the broader EIP-712/ABI recommendations; this lane's contribution is the frontend lifecycle comparison and adversarial regression cases.

### 3.6 mipd — a discovery reference, not a drop-in replacement

**Decision: use for conformance review and fixtures; defer runtime adoption.** The actual [`createStore` implementation][mipd-store] collects announcements, deduplicates UUIDs, subscribes, resets, and destroys; [`requestProviders`][mipd-utils] installs an announcement listener and dispatches a request event. These are compact, MIT-licensed patterns. The inspected default-branch commit is from **2024-04-04** despite more recent repository activity metadata.

The current `createWalletDiscovery` intentionally uses a three-second bounded discovery window with provider/announcement limits, selection handles, and unverified branding. It is not a missing implementation. [Existing source][T-discovery]. [EIP-6963][eip6963] describes lifetime DApp announcement listening, so changing to full conformance affects the product's privacy/resource policy. The mipd store does not automatically preserve this project's bounds, stale-handle rules, or hostile-object checks.

Add comparisons to `packages/wallet/test/discovery.test.mjs`: duplicate UUIDs, late arrivals, disposal/reset, malformed metadata, chain/account changes after selection, and provider identity versus display name. Never infer account ownership from RDNS, an icon, or a session announcement. [Existing tests][T-discovery-test], [EIP-6963][eip6963], [EIP-1193][eip1193].

## 4. QR interchange: three actual candidates and a narrow architecture

The existing specification caps the v1 envelope at **2,048 UTF-8 bytes**, uses `protocol: "p2p-offramp-qr"`, includes typed payload/hash/expiry fields, and forbids scanning from directly granting navigation, wallet connection, signing, or import authority. It requires local processing and defers animated multipart QR. Its pending decision has not selected the complete type-specific codec/signature profile. [Specification][T-qr-spec], [decision][T-qr-decision].

The most useful separation is: local image/camera → bounded decoded bytes → strict QR envelope parser → type-specific validation → human review → existing typed action. The encoder and scanner only own the first/last optical steps; they must not own payment or recovery authority.

| Candidate | Actual source to reuse | Target placement | Decision and tradeoff |
| --- | --- | --- | --- |
| Nayuki QR-Code-generator | TypeScript [`QrCode`, `encodeBinary`, segment/encoding implementation][nayuki] | Proposed `packages/qr/src/encode.ts`, behind a pure byte-in/matrix-out interface; rendering in proposed sharing UI. | Preferred encoder evaluation. Small local primitive; embedded MIT header verified. Does not provide a scanner, typed envelope validation, or trust semantics. |
| jsQR | [`src/index.ts`][jsqr], including `binaryData`, decoded text/chunks, version and location | Proposed `packages/qr/src/decode-worker.ts`, used by a bounded image/camera controller | Preferred decoder evaluation where exact bytes matter. Apache-2.0. Last inspected default-branch code is 2021, so require corpus tests and maintenance ownership. |
| Nimiq qr-scanner | [`src/qr-scanner.ts`][scanner], including camera stop/pause/destroy and BarcodeDetector/Worker engine choice | Alternative camera/scan UI adapter outside domain schemas | Conditional convenience wrapper. MIT. Last default-branch commit inspected is 2022. Verify byte fidelity, worker packaging, strict CSP and stream disposal before choosing it. |

Before adding a new camera/controller layer, compare the companion [optional and sibling reuse assessment](optional-and-sibling-reuse.md). That lane inspected the owner's GhostPay QR assembler/camera/multipart code at `0014bc5b26c7487ea1f9fb230194c36673193236`; it may provide a closer existing fit for bounded assembly and owned-stream cancellation. Its GPQ1 payload profile is not this project's selected QR format, and its CRC/hash prefix does not establish authenticity. Same-owner reuse and third-party notice obligations are covered in that companion assessment. This lane did not independently inspect those sibling modules.

**Encoder integration:** pass canonical UTF-8 bytes to a fixed encoding profile; choose and record error correction, maximum QR version, quiet-zone/rendering rules, and output size. Treat 2,048 bytes as a parser ceiling, not a guarantee that a screen-sized QR will scan reliably. The current spec's larger-payload fallback should remain a file plus local hash. Reject unsupported payload type, excessive bytes, malformed UTF-8, expired envelope, and mismatched payload hash before any downstream action. The exact profile must settle canonicalization/hash scope and which types require signatures; these are application decisions, not properties of the optical library. [QR specification][T-qr-spec], [Nayuki source][nayuki].

**Decoder integration:** jsQR's returned `binaryData` is a useful basis for exact byte validation. Define the accepted segment/encoding profile and reject unhandled ambiguity; do not silently use human-readable `data` text as signature input. The inspected decoder mutates its shared default-options object while applying options, so test repeat invocations with differing options and prefer a fixed per-worker configuration. Bound image dimensions, pixel buffers, decode duration, request queue and worker lifetime; support cancellation and clean disposal. [Actual jsQR entrypoint][jsqr].

**Camera/UI integration:** Nimiq's source already contains lifecycle cleanup and a native BarcodeDetector/worker fallback. That can reduce camera boilerplate, but a string-based decode path must satisfy the selected byte contract. Its input helper can accept image/URL forms; the app adapter should expose only the local sources permitted by the QR spec. Check built worker location and CSP compatibility rather than assuming every library packaging mode works with the current app. Camera permission and track shutdown on closing, locking, navigation and backgrounding belong to this adapter. [Scanner source][scanner], [QR local-processing requirements][T-qr-spec].

**Acceptance before selecting a pair:**

- Round-trip each allowed payload type, Unicode edge cases, the maximum allowed byte length, and small/large matrices with the chosen profile.
- Corpus tests cover rotated, blurred, low-contrast, partially obscured and inverted images; state the tested conditions rather than asserting universal scan reliability.
- Invalid JSON, duplicate fields, unsupported types/versions, hash mismatch, expiry, and malformed/oversize decoded data never enter an action.
- Closing during camera initialization or decode produces no late preview or leaked stream; multiple callbacks do not trigger multiple actions.
- A recovery fingerprint remains a reference checked by existing `packages/schemas/src/recovery-reference.ts`; it does not import keys or create transaction authority. [Existing recovery-reference boundary][T-recovery-schema].
- Browser tests demonstrate zero remote image/QR requests and no secret/session material in URLs, logs or share previews.
- Real mobile cameras and screen-to-screen sharing are qualified separately, including a usable non-camera/file fallback.

Do not implement a generic URL opener as part of QR support. Public app/share links and a WalletConnect pairing URI are different payload classes; the latter carries sensitive session material and should not become a public trade invite. [QR spec][T-qr-spec], [mobile profile][T-mobile].

## 5. External wallet handoff and future Solana interfaces

### WalletConnect EthereumProvider

**Decision: continue the existing exact-pin intake; conditional integration only.** The inspected [EthereumProvider implementation][wc-provider] and [URI utilities][wc-uri] are the same upstream commit already referenced by the repository's mobile intake: `63094dcb6fded05dcbc2b08b8895ada75a31dcb5`, provider/utils 2.26.0. The existing profile identifies AppKit 1.8.19 and UniversalProvider 2.26.0 in that dependency graph. Re-evaluating the identical helper without a new question would duplicate accepted work. [Profile][T-mobile], [intake][T-mobile-intake], [pins][T-mobile-pins].

The intake records **4/5 helper checks**, with a retained mismatch between the application's stronger URI round-trip expectation and the utility's protocol field. In actual source, `parseUri` removes `wc:`/`wc://` before deriving `protocol`; `formatUri` emits the protocol. Do not describe this as a newly proven upstream vulnerability or assume the test expectation is the intended upstream contract. Specify which parsed fields the application actually relies on, then preserve a regression for that agreed contract. This research did not execute the helper suite. [URI source][wc-uri], [existing results][T-mobile-intake].

The provider directory's license is **WalletConnect Community License Agreement, release 20 August 2025**. It is not a standard MIT permission grant. The project owner must review its applicable terms and any commercial/deployment implications before adoption; the reviewed source/license is evidence for that decision, not an acceptance on the owner's behalf. Dependency notices and artifact provenance also remain part of intake. [Actual license][U7-license].

Before adding a live adapter, select exact wallet applications/versions, connector/version, chain and method/event allowlists, URI schemes/hosts/paths, the registered return origin/path, relay/project configuration and egress policy. Define session expiry, revocation, account/chain changes, storage ownership, suspension and pending-request recovery. The existing profile already lists these fields. A session namespace is routing/authorization context; it does not by itself prove escrow acceptance or current account ownership. [Mobile profile][T-mobile], [provider source][wc-provider], [EIP-1193 events][eip1193].

Placement should be a narrow external connector adjacent to `packages/wallet/src/evm-adapter.ts`, with serialization and send/recovery remaining in the established domain/journal boundaries. Before leaving the app, persist the intended operation and current account/chain generation. A return event triggers fresh reconciliation; it must not grant finality, replay a send, or trust URL-supplied transaction details. Test repeated returns, wrong account/chain, expired session, disconnect, pending or lost response, cancelled/disposed controller and stale callback generations locally; then run the selected Android/iOS app-switch cases on physical devices. [Adapter][T-adapter], [lifecycle][T-life], [mobile acceptance notes][T-mobile].

No relay registration, live provider initialization, wallet pairing, paid service, or physical test occurred in this research.

### Wallet Standard; Solana Kit interface boundary

**Decision: retain as future native-lane candidates, not immediate frontend dependencies.** Wallet Standard's inspected [`getWallets` registry][ws-wallets] and [standard event feature][ws-events] provide the relevant wallet-discovery and account/chain-change interface. The verified `packages/core/app/LICENSE` is Apache-2.0. A later Solana frontend adapter can consume this narrow interface and invalidate selection on the standard events; it must still negotiate required features and validate actual accounts/capabilities.

For orientation only, Solana Kit's inspected [transaction-sending signer][kit-signer] and [transaction confirmation module][kit-confirm] provide native transaction submission and confirmation primitives; license MIT. Its confirmation package distinguishes recent transaction, blockheight, and durable-nonce concerns. Those belong to the native lane's selected lifecycle and program profile, not a mechanical translation of EVM confirmation counts. The root native research owns exact custody/program/account/IDL, token policy, build pins, test harness and recovery choices. Do not add Token-2022 or extensions merely because a candidate SDK can represent them.

The missing frontend contract is the adapter boundary and exact native acceptance conditions, not another wallet picker. Wallet Standard metadata and features do not select the escrow program or satisfy native recovery. [Current remainder][T-remainder], [Wallet Standard source][ws-wallets], [Kit source][kit-signer].

## 6. Localization: retain the current implementation and its authority boundary

The current `catalog.ts`, `en.ts`, `runtime.ts`, and `bundled.ts` already provide typed messages, explicit complete compiled-catalog selection, controlled interpolation and local preference composition. Bundled development fixtures are disabled by default. All current catalogs remain draft/ineligible under the runtime's own statement. Translators/reviewers, reviewed economic language, and publication criteria are the outstanding evidence. [Catalog][T-catalog], [English metadata][T-en], [runtime][T-locale], [bundle configuration][T-bundled].

| Alternative | Inspected code and actual license | Appropriate use | Decision |
| --- | --- | --- | --- |
| FormatJS | [intl-messageformat entrypoint][formatjs-msg], [ICU parser entrypoint][formatjs-parser]; intl-messageformat is [New BSD / BSD-3-Clause][U13-license], while the parser has a separate [MIT license][formatjs-parser-license]. | Test-only formatting/pluralization comparison if the team defines a compatible ICU profile, or a later deliberate catalog migration. | Defer runtime migration; evaluate only for a concrete missing formatting requirement. |
| i18next | [`src/i18next.js`][i18next]; [MIT][U14-license]. | Later translation-management requirements after source-message, fallback and loading policies are defined. | Do not add for the current release; it does not supply reviewed translations. |

The project's present message syntax must not be assumed to be ICU syntax. Adding a parser without converting and reviewing messages can change interpolation/plural behavior. i18next exposes language detection/backend/fallback mechanisms; enabling dynamic catalogs or silent fallbacks would need an explicit policy compatible with the current complete compiled-catalog contract. Neither library makes translator metadata a spending capability.

Extend the current locale tests instead: exact key/variable correspondence, control-character and bidi handling for machine values, long text and RTL layout, deterministic amount/date formatting, focus after locale changes, readable error/help text, and refusal to present an incomplete translation as fully reviewed. Keep chain/address/amount semantic values separate from localized prose. The [help registry][T-help-registry] and [existing browser stress tests][T-browser] are the correct integration points.

Acceptance requires reviewed text for every user-facing state in the selected core journey, with named language review evidence and physical assistive-technology observations where required. An automatic pseudo-locale or a library's locale identifier alone cannot supply that evidence. [Locale runtime][T-locale], [qualification ledger][T-remainder].

## 7. Ordered implementation handoff

These priorities are recommendations based on the reviewed snapshot. They are not completed work or estimated delivery dates.

| Priority | Concrete task and target | Upstream help | Completion evidence |
| --- | --- | --- | --- |
| P0 | Forward cancellation through `app-services.ts`; regression at the service/runtime boundary. | Existing code; fast-check can broaden later. | Cancelled draft/favorite change cannot produce a late durable write once cancellation is effective; current intended unknown-outcome behavior preserved. |
| P0 | Repair never-sent approval recovery in `private-trade.ts` and add the exact failing sequence. | Existing lifecycle; fast-check command sequences. | Prepared-but-unsent approval reaches a usable cancelled/recovered state, never resubmits, and does not loop on selection. |
| P0 | Diagnose the global resume-listener assertion and fix the responsible lifecycle or ownership measurement. | Existing Playwright clock, contexts and browser scripts. | Repeated mount/unmount/locale/profile transitions bounded; both resume events refresh correctly; no weakened observation-authority checks. |
| P0 | Integrate/split PR #26 with its current owner and complete the real two-client core journey required by the next-run priority. | Existing Playwright; protocol lane owns peer carrier. | Final-head tests and meaningful independent reviews, rather than historical passing totals or skipped bot review. |
| P1 | Add property-based recovery/cancellation tests and automated accessibility checks. | fast-check; axe-core. | Minimal counterexamples retained; browser state coverage and manual accessibility gaps explicitly listed. |
| P1 | Add formatter configuration and scoped mechanical formatting after active code overlap is resolved. | Prettier. | Clean mechanical diff, unchanged intended serialized fixtures, check-only CI. |
| P2 | Freeze QR profile; evaluate local optical pair in isolation. | Nayuki + jsQR; compare Nimiq only if camera integration saves work. | Strict bytes/schema/expiry/hash tests, cancellation/resource limits, zero external QR requests, physical scan matrix. |
| P2 | Complete mobile contract decision, then bounded local connector tests and selected wallet integration. | Existing WalletConnect intake and exact pin. | WCCA review and connector/network/session policy; current native reconciliation on return; physical wallet/version evidence. |
| P2 | Finish catalog review and physical locale/accessibility qualification. | Existing catalogs/help; optional FormatJS oracle. | Reviewed complete catalogs, source-language claims correct, keyboard/zoom and actual AT results. |
| Native lane | Select wallet feature profile after native escrow and transaction contracts are settled. | Wallet Standard; Kit primitives by native owner. | Native program/token/lifecycle tests and explicit adapter capability negotiation. |

A small isolated first PR can fix the dropped signal and add its service-boundary regression without importing any package. The next coherent change can repair approval recovery with explicit one-send tests. Optional QR, mobile, localization framework and Solana dependency work should not delay those changes. [Observed service call][T-services], [recovery source][T-journey], [next-run priorities][T-next].

## 8. Reproducible upstream source and license inventory

The following are **commit pins from branch/commit responses**, not tree SHAs. Dates are the selected default-branch commit's committer date, not a guarantee of ongoing support. A recent repository `pushed_at` does not establish that the relevant code changed recently. In particular, mipd, jsQR and qr-scanner require the older default-source dates to remain visible in the decision.

| ID | Repository/source commit | Full immutable commit | Commit date UTC | License text actually inspected |
| --- | --- | --- | --- | --- |
| U1 | [microsoft/playwright][U1-commit] | `0ea36910324ed8aa2a5f460317cbd35881ee88d4` | 2026-11-03 | [Apache-2.0][U1-license] |
| U2 | [dubzzz/fast-check][U2-commit] | `d0cf851f6551f474d4ca822f710ec701909ee2fa` | 2026-11-03 | [MIT][U2-license] |
| U3 | [dequelabs/axe-core][U3-commit] | `73b05b710a39693bbe8c0db57479f20ab50db486` | 2026-11-03 | [MPL-2.0][U3-license] |
| U4 | [prettier/prettier][U4-commit] | `d5d30c11e87a245cae6e91ce8dc910e57afddb20` | 2026-11-04 | [MIT][U4-license] |
| U5 | [wevm/viem][U5-commit] | `bf3ffc52b5633afebacf3d728d846080f1668f30` | 2026-11-04 | [MIT in src/LICENSE][U5-license] |
| U6 | [wevm/mipd][U6-commit] | `0fda4481a31a28a4571c10a1d99568c9b4fed226` | 2024-04-04 | [MIT][U6-license] |
| U7 | [WalletConnect/walletconnect-monorepo][U7-commit] | `63094dcb6fded05dcbc2b08b8895ada75a31dcb5` | 2026-10-08 | [WalletConnect Community License Agreement, 2025-08-20][U7-license] |
| U8 | [wallet-standard/wallet-standard][U8-commit] | `c49b56d60fbac2e68e0f3536707fa33030652f9e` | 2026-06-03 | [Apache-2.0 in core/app][U8-license] |
| U9 | [anza-xyz/kit][U9-commit] | `4f9b869e81ccb599d9b61f22b554508185b3ef98` | 2026-11-03 | [MIT][U9-license] |
| U10 | [nayuki/QR-Code-generator][U10-commit] | `bcfe1b018cec5f1f91b5705eca5bb4cdd34e9f8d` | 2026-10-29 | [MIT, TypeScript source header][U10-license] |
| U11 | [nimiq/qr-scanner][U11-commit] | `abcfe1bce2703721408d8ce7ebde94a359998506` | 2022-11-23 | [MIT][U11-license] |
| U12 | [cozmo/jsQR][U12-commit] | `8e6a036beafa7053dd44b1b76ac578d22b1b3311` | 2021-08-24 | [Apache-2.0][U12-license] |
| U13 | [formatjs/formatjs][U13-commit] | `d097f4e3d5fae1bf6a99976e424b05fddd6dd5dd` | 2026-11-04 | [New BSD / BSD-3-Clause, intl-messageformat][U13-license] |
| U14 | [i18next/i18next][U14-commit] | `14faff4f7d9c86230c49018f804b30899566e4f6` | 2026-11-03 | [MIT][U14-license] |

The source modules linked in §§3–6 were read, along with these license files. This selection deliberately includes alternatives that should **not** be adopted now. Fourteen inspected repositories does not imply fourteen new dependencies.

MIT and BSD notices must be retained for copied/substantial redistributed code; Apache-2.0 and MPL-2.0 have their own notice and other conditions in the linked texts. WCCA needs a separate terms decision. Verify the exact package artifact, transitive dependency graph, and any NOTICE/third-party files before installation or vendoring. A source license check does not establish package integrity or license compatibility with every destination. This repository's final distribution license is a separate project-wide decision; this memo grants no blanket clearance.

## 9. Confidence, limits, and next decisions

**High confidence:** concrete dropped-signal boundary, existing controller forwarding, the recovery path's prepared-fund filter, existing framework/dependency footprint, draft-only locale authority statement, pending QR decision, and the inspected upstream modules/licenses. These are visible in the pinned source.

**Moderate confidence:** the proposed QR pair and fast-check integration are good architectural fits. They still need an isolated dependency evaluation and project-specific acceptance runs. Old decoder/source dates, byte fidelity, browser worker packaging and CSP behavior are material unknowns.

**Needs direct measurement or owner choice:** listener failure root cause, current CI at a later head, exact QR canonical/signature profiles, selected mobile wallets and return URLs, provider/relay/project terms, license decisions, physical camera/app-switch/assistive-technology behavior, reviewed translations, and native Solana design. The existing next-run/remainder files name the larger production peer and release gates.

No implementation, package installation, browser execution, native transaction, pairing, device test, or CI rerun was performed in this lane. Prior target results are explicitly attributed to their source documents. One attempted official Reown mobile-linking URL could not be retrieved; mobile conclusions here use the inspected provider/URI source and the repository's existing pinned intake instead. Upstream default branches and mutable standards documentation should be rechecked when an implementation ticket starts; preserve these pins so the present recommendation remains auditable.


## Primary-source links

[T-package]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/package.json
[T-discovery]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/discovery.ts
[T-discovery-test]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/test/discovery.test.mjs
[T-life]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/domain/src/tx-lifecycle.ts
[T-life-test]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/domain/test/tx-lifecycle.test.mjs
[T-wallet]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/evm-submit.ts
[T-adapter]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/evm-adapter.ts
[T-draft]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/trade/draft-controller.ts
[T-draft-test]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/test/draft-controller.test.mjs
[T-services]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/app-services.ts
[T-services-test]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/test/app-services.test.mjs
[T-journey]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/journey/private-trade.ts
[T-journey-test]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/test/journey-private-trade.test.mjs
[T-browser]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/scripts/test-locale-layout-browser.mjs
[T-browser-journey]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/scripts/test-journey-browser.mjs
[T-browser-origin]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/scripts/test-journey-origin-browser.mjs
[T-browser-tabs]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/scripts/test-lifecycle-tabs-browser.mjs
[T-catalog]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/ui/locale/catalog.ts
[T-en]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/ui/locale/en.ts
[T-locale]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/ui/locale/runtime.ts
[T-bundled]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/ui/locale/bundled.ts
[T-help]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/ui/ControlHelp.tsx
[T-help-registry]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/ui/help-registry.ts
[T-qr-spec]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion/module_0.12.4_qr_interchange/spec-qr-everywhere-secure-sharing-and-import-export.md
[T-qr-proposal]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/qr-profile.proposal.json
[T-qr-decision]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/qr-profile.decision.json
[T-recovery-schema]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/schemas/src/recovery-reference.ts
[T-mobile]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/profiles/05-mobile.md
[T-mobile-intake]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/security/intake/mobile-wallet/README.md
[T-mobile-pins]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/security/intake/mobile-wallet/pins.json
[T-remainder]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.json
[T-all]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/ALL-REMAINING-WORK-PROMPT.md
[T-next]: https://github.com/djshellshoxxx/p2p-offramp/blob/2f839b12768700ac6c3b674f75a144c6ec19fa93/docs/execution/NEXT-RUN-PROMPT-2026-11-04.md
[PR26]: https://github.com/djshellshoxxx/p2p-offramp/pull/26
[PR27]: https://github.com/djshellshoxxx/p2p-offramp/pull/27
[playwright-access]: https://github.com/microsoft/playwright/blob/0ea36910324ed8aa2a5f460317cbd35881ee88d4/docs/src/accessibility-testing-js.md
[playwright-browser]: https://github.com/microsoft/playwright/blob/0ea36910324ed8aa2a5f460317cbd35881ee88d4/docs/src/browsers.md
[playwright-manifest]: https://github.com/microsoft/playwright/blob/0ea36910324ed8aa2a5f460317cbd35881ee88d4/packages/playwright-core/browsers.json
[fc-commands]: https://github.com/dubzzz/fast-check/blob/d0cf851f6551f474d4ca822f710ec701909ee2fa/packages/fast-check/src/arbitrary/commands.ts
[fc-async]: https://github.com/dubzzz/fast-check/blob/d0cf851f6551f474d4ca822f710ec701909ee2fa/packages/fast-check/src/check/model/command/AsyncCommand.ts
[axe-run]: https://github.com/dequelabs/axe-core/blob/73b05b710a39693bbe8c0db57479f20ab50db486/lib/core/public/run.js
[axe-readme]: https://github.com/dequelabs/axe-core/blob/73b05b710a39693bbe8c0db57479f20ab50db486/README.md
[prettier-readme]: https://github.com/prettier/prettier/blob/d5d30c11e87a245cae6e91ce8dc910e57afddb20/README.md
[viem-typed]: https://github.com/wevm/viem/blob/bf3ffc52b5633afebacf3d728d846080f1668f30/src/utils/signature/hashTypedData.ts
[viem-receipt]: https://github.com/wevm/viem/blob/bf3ffc52b5633afebacf3d728d846080f1668f30/src/actions/public/waitForTransactionReceipt.ts
[mipd-store]: https://github.com/wevm/mipd/blob/0fda4481a31a28a4571c10a1d99568c9b4fed226/src/store.ts
[mipd-utils]: https://github.com/wevm/mipd/blob/0fda4481a31a28a4571c10a1d99568c9b4fed226/src/utils.ts
[wc-provider]: https://github.com/WalletConnect/walletconnect-monorepo/blob/63094dcb6fded05dcbc2b08b8895ada75a31dcb5/providers/ethereum-provider/src/EthereumProvider.ts
[wc-uri]: https://github.com/WalletConnect/walletconnect-monorepo/blob/63094dcb6fded05dcbc2b08b8895ada75a31dcb5/packages/utils/src/uri.ts
[ws-wallets]: https://github.com/wallet-standard/wallet-standard/blob/c49b56d60fbac2e68e0f3536707fa33030652f9e/packages/core/app/src/wallets.ts
[ws-events]: https://github.com/wallet-standard/wallet-standard/blob/c49b56d60fbac2e68e0f3536707fa33030652f9e/packages/core/features/src/events.ts
[kit-signer]: https://github.com/anza-xyz/kit/blob/4f9b869e81ccb599d9b61f22b554508185b3ef98/packages/signers/src/transaction-sending-signer.ts
[kit-confirm]: https://github.com/anza-xyz/kit/blob/4f9b869e81ccb599d9b61f22b554508185b3ef98/packages/transaction-confirmation/README.md
[nayuki]: https://github.com/nayuki/QR-Code-generator/blob/bcfe1b018cec5f1f91b5705eca5bb4cdd34e9f8d/typescript-javascript/qrcodegen.ts
[scanner]: https://github.com/nimiq/qr-scanner/blob/abcfe1bce2703721408d8ce7ebde94a359998506/src/qr-scanner.ts
[jsqr]: https://github.com/cozmo/jsQR/blob/8e6a036beafa7053dd44b1b76ac578d22b1b3311/src/index.ts
[formatjs-msg]: https://github.com/formatjs/formatjs/blob/d097f4e3d5fae1bf6a99976e424b05fddd6dd5dd/packages/intl-messageformat/index.ts
[formatjs-parser]: https://github.com/formatjs/formatjs/blob/d097f4e3d5fae1bf6a99976e424b05fddd6dd5dd/packages/icu-messageformat-parser/index.ts
[formatjs-parser-license]: https://github.com/formatjs/formatjs/blob/d097f4e3d5fae1bf6a99976e424b05fddd6dd5dd/packages/icu-messageformat-parser/LICENSE.md
[i18next]: https://github.com/i18next/i18next/blob/14faff4f7d9c86230c49018f804b30899566e4f6/src/i18next.js
[eip6963]: https://eips.ethereum.org/EIPS/eip-6963
[eip1193]: https://eips.ethereum.org/EIPS/eip-1193
[pw-emulation]: https://playwright.dev/docs/emulation
[pw-access]: https://playwright.dev/docs/accessibility-testing
[wcag-focus]: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
[wcag-target]: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
[U1-commit]: https://github.com/microsoft/playwright/commit/0ea36910324ed8aa2a5f460317cbd35881ee88d4
[U1-license]: https://github.com/microsoft/playwright/blob/0ea36910324ed8aa2a5f460317cbd35881ee88d4/LICENSE
[U2-commit]: https://github.com/dubzzz/fast-check/commit/d0cf851f6551f474d4ca822f710ec701909ee2fa
[U2-license]: https://github.com/dubzzz/fast-check/blob/d0cf851f6551f474d4ca822f710ec701909ee2fa/packages/fast-check/LICENSE
[U3-commit]: https://github.com/dequelabs/axe-core/commit/73b05b710a39693bbe8c0db57479f20ab50db486
[U3-license]: https://github.com/dequelabs/axe-core/blob/73b05b710a39693bbe8c0db57479f20ab50db486/LICENSE
[U4-commit]: https://github.com/prettier/prettier/commit/d5d30c11e87a245cae6e91ce8dc910e57afddb20
[U4-license]: https://github.com/prettier/prettier/blob/d5d30c11e87a245cae6e91ce8dc910e57afddb20/LICENSE
[U5-commit]: https://github.com/wevm/viem/commit/bf3ffc52b5633afebacf3d728d846080f1668f30
[U5-license]: https://github.com/wevm/viem/blob/bf3ffc52b5633afebacf3d728d846080f1668f30/src/LICENSE
[U6-commit]: https://github.com/wevm/mipd/commit/0fda4481a31a28a4571c10a1d99568c9b4fed226
[U6-license]: https://github.com/wevm/mipd/blob/0fda4481a31a28a4571c10a1d99568c9b4fed226/LICENSE
[U7-commit]: https://github.com/WalletConnect/walletconnect-monorepo/commit/63094dcb6fded05dcbc2b08b8895ada75a31dcb5
[U7-license]: https://github.com/WalletConnect/walletconnect-monorepo/blob/63094dcb6fded05dcbc2b08b8895ada75a31dcb5/providers/ethereum-provider/LICENSE.md
[U8-commit]: https://github.com/wallet-standard/wallet-standard/commit/c49b56d60fbac2e68e0f3536707fa33030652f9e
[U8-license]: https://github.com/wallet-standard/wallet-standard/blob/c49b56d60fbac2e68e0f3536707fa33030652f9e/packages/core/app/LICENSE
[U9-commit]: https://github.com/anza-xyz/kit/commit/4f9b869e81ccb599d9b61f22b554508185b3ef98
[U9-license]: https://github.com/anza-xyz/kit/blob/4f9b869e81ccb599d9b61f22b554508185b3ef98/LICENSE
[U10-commit]: https://github.com/nayuki/QR-Code-generator/commit/bcfe1b018cec5f1f91b5705eca5bb4cdd34e9f8d
[U10-license]: https://github.com/nayuki/QR-Code-generator/blob/bcfe1b018cec5f1f91b5705eca5bb4cdd34e9f8d/typescript-javascript/qrcodegen.ts
[U11-commit]: https://github.com/nimiq/qr-scanner/commit/abcfe1bce2703721408d8ce7ebde94a359998506
[U11-license]: https://github.com/nimiq/qr-scanner/blob/abcfe1bce2703721408d8ce7ebde94a359998506/LICENSE
[U12-commit]: https://github.com/cozmo/jsQR/commit/8e6a036beafa7053dd44b1b76ac578d22b1b3311
[U12-license]: https://github.com/cozmo/jsQR/blob/8e6a036beafa7053dd44b1b76ac578d22b1b3311/LICENSE
[U13-commit]: https://github.com/formatjs/formatjs/commit/d097f4e3d5fae1bf6a99976e424b05fddd6dd5dd
[U13-license]: https://github.com/formatjs/formatjs/blob/d097f4e3d5fae1bf6a99976e424b05fddd6dd5dd/packages/intl-messageformat/LICENSE.md
[U14-commit]: https://github.com/i18next/i18next/commit/14faff4f7d9c86230c49018f804b30899566e4f6
[U14-license]: https://github.com/i18next/i18next/blob/14faff4f7d9c86230c49018f804b30899566e4f6/LICENSE

