# T38-G whole App source audit

**Complete: all 64 production files read semantically; both P3 copy findings resolved by root.** Scope includes 7,055 lines and 606,696 bytes across unchanged runtime/worker/native/retention/compatibility/UI/localization, READMEs, declarations and CSS. No high or medium severity defect was established.

Final inventory SHA256: `2f235ba6bd7c9ddffb38c10b367151d3f1f3754ba13f32d2b02c466787ae5eca`. Exact hashes and individual semantic assessments for every file are in `audit-app-runtime-ui.json`.

## Findings and final delta

1. `ui/locale/en.ts:230` previously claimed the shell displayed no private records. Intentional saved-review/template viewers contradicted it. Root now states that records appear on explicit load/review and trading remains disabled. **Resolved.**
2. `ui/locale/en.ts:559` previously claimed no reviews loaded when a saved row failed review. The loader correctly merges independently valid fresh rows. Root now says valid reviews may have loaded and encrypted data was retained. **Resolved.**

`en.ts` root correction: `1725098cff11cd549a65cb8f0fbde76f3f6fbbe3ca7eef734f0839ac05c459bb` → `fca621bcb0eb8e64e9ff30df5be424980a015473745beec8e815a4f7284667ed`. Reversing precisely the two sentence fixes, revision 2→3 and eight added critical risk/consent/help keys reproduces the exact initial hash. The other 62 production hashes are unchanged; the separately reviewed `GenericAppShare.tsx` root delta adds page-global physical clipboard admission retained until real settlement, including route/remount. Its before/final hashes are bound in JSON. English remains draft with no translator/reviewer approval. The matching test delta adds severity assertions and revision 3; no checks were weakened. Root reported 15/15 formal+locale pass; this reviewer did not rerun it or independently bind its new log.

## Reviewed behavior

Default provider/trading gates remain closed. Selected vault/worker generation, strict IPC and owned secret buffers guard profile boundaries and late replies. Exact native review/fingerprint/expiry/epoch checks reach the final durable marker read. Unknown broadcast requires durable reconciliation; physical request admission survives early logical cancellation/timeout. Retention protects complete dependencies and unknown facts; favorites reopen freshly validated records, drafts require fresh canonical review, and sharing excludes private context.

Analytics counts real fixed-category navigation after consent in session memory only, with bounded fixed-cohort notifications. Lock/owner/pagehide/BFCache retirement erases counts/consent/preview. Export/clear/opt-out are explicit; no IDs, times, values, persistence, IPC or network. Diagnostics remains separate. Accessibility/focus/labels/status, localization contracts, exact financial display and untrusted text screening were reviewed.

## Evidence and limits

No test suite was rerun by this reviewer. Hash checks matched 34 existing evidence entries and all 19 frozen T81 snapshots. T80 later native/ERC20 consumer records 11 submissions / 16 signatures / 32 explicit reviews and binds current private-trade.ts. T81 current graph matches 18/19 files; its declared pre-factory private-journey delta is covered by that followon. T89 current five owned files match; its 19-group actual Chromium run and zero wallet/unexpected requests bind the initial source, followed by the reviewed final catalog and clipboard admission deltas. No new native run is inferred for those deltas. Retained red/failing attempts were preserved.

Production carriers/providers, physical devices, deployed framing and release acceptance remain distinct unqualified gates. This is source review with finite local evidence, not vendor certification. The reviewer edited no source/ledger and made no commit.

## Per-file review inventory

| File | Semantic checks | SHA256 |
|---|---|---|
| `apps/web/src/analytics/screen-counts.ts` | authority, privacy, bounds, ownership, reentrancy | `b12b1ecf2237754a1de9339bc377e73b20943e9ff63ba34b1149be1320039ae7` |
| `apps/web/src/app-services.ts` | authority, ownership, cancellation, profile | `3f9fa7202474ff2c7f8b9544e0e77c51dca29b62b1101173723e3aa3333c2af8` |
| `apps/web/src/build-flags.d.ts` | default-gates, authority | `bf8b084bcce8934c9785fb384b7657e3bf3a614cd36d16c52dba0fb5173ac89c` |
| `apps/web/src/compatibility/model.ts` | qualification, authority, bounds | `5720fbbf12ebb3a805afd721f94ab90a91453462f959c6dc56efe502907d7d28` |
| `apps/web/src/compatibility/probe.ts` | privacy, bounds, cancellation, qualification | `e393f4dfadc098fdf74afd5a2c737142720280b12e92197f5f2b2b2b902b4793` |
| `apps/web/src/compatibility/startup.ts` | default-gates, qualification | `b258f8cecb4e5574b2bc3ec0e8d8212c32a132c55e9c8710a807693025a3907b` |
| `apps/web/src/content-policy/local-policy.ts` | authority, privacy, bounds, default-gates | `427ec5e3da97cd0dfd07ba363422716c99570e4c94824e201dc8630a127fca61` |
| `apps/web/src/context-adapters/README.md` | authority, qualification | `f106a5abc6247b84a71c7627f41645dd55053f56f08ef9119c0839e306478302` |
| `apps/web/src/context-adapters/observations.ts` | authority, privacy, bounds, ownership | `23ef1962f87d6dd4d504c2d8456fd86f708fe662b74b4e9b0c37a21c921101d7` |
| `apps/web/src/demo/synthetic-data.ts` | default-gates, provenance, bounds | `5da69478862d29c7dbb9ab91e2d58eb95764ac0350be67e00f82576e254d2ccd` |
| `apps/web/src/demo/synthetic-local.ts` | default-gates, ownership, bounds | `35eb9d134c50e293b711f12bda0bcb773922a85ec17196f557dfe86d1a37086f` |
| `apps/web/src/diagnostics.ts` | privacy, default-gates | `fa760d26a8928d3501164585d4afaab43c70e34b1453175c0829a05525227559` |
| `apps/web/src/journey/README.md` | authority, qualification, unknown-outcome | `1beb089f6d7060eb185db7d5b0dd09d113f7b6840a671cb6b6a9ab385b3694a0` |
| `apps/web/src/journey/native-contracts.ts` | authority, ownership, bounds | `eae22020872aad8187f16fc57693dbc621f1bec10dc4158742360311fd126a34` |
| `apps/web/src/journey/presentation.ts` | authority, privacy, localization, unknown-outcome | `bcb7d5435d7afc34681cf437c7dd781f223bc1fa7f76bb178a25d9f5e9b13523` |
| `apps/web/src/journey/private-trade.ts` | authority, profile, ownership, cancellation, physical-drain, unknown-outcome, bounds | `3af0152c41c7186b0e904620069f3b90ed9e97f4b05e4bf92af790ce9ac178f9` |
| `apps/web/src/journey/screen.ts` | authority, privacy, accessibility, ownership | `1f1ad2c51fb77189fc5a4123c26aed5f6435c2af159fbcaf45f2b1aca220a0d2` |
| `apps/web/src/journey/vault-composition.ts` | authority, profile, ownership, cancellation | `325a9f9455c5e9e5061694fd3a848e3bc1711643a9aa89212c873c7cc8730bb7` |
| `apps/web/src/main.tsx` | default-gates, authority, ownership, privacy | `91ca3e07e1671d6d7ae8321539a7785431462594e60ff3feb68f6423aebc6f7c` |
| `apps/web/src/privacy/policy-controller.ts` | authority, ownership, profile, cancellation, bounds | `6dc74fdb5c83ad7c3467910038bf5948afccf53fe0345a7b6df36a6e034367ca` |
| `apps/web/src/retention/native-retention.ts` | authority, profile, unknown-outcome, bounds | `8a3d082347e1ed74d74af286ce53981025d09fc559684253925716ba126bc0d8` |
| `apps/web/src/runtime/app-runtime.ts` | authority, profile, ownership, cancellation, physical-drain, bounds | `77a5431fe3c0e3bc60b18d18970ff3309d842e95bbefba21f4aa291207a7c0f6` |
| `apps/web/src/runtime/pending-metadata.ts` | privacy, authority, bounds | `1d2bf3b83a9d3a7bad97cefecba6dddac78d90c90cd764be978bb5a67b27ae9b` |
| `apps/web/src/runtime/worker-endpoint.ts` | authority, profile, ownership, cancellation, physical-drain, bounds | `0d19e84ad3be12ee547a5ab97c686d537c639652bebcccfe5d2cb2e237f2437d` |
| `apps/web/src/sharing/generic-app-link.ts` | privacy, authority, bounds | `a6a0f81b2430d4d4c2d66712c9679f722f5b3aa707364d1bbfaad057972b7f71` |
| `apps/web/src/testnet/sepolia-network.ts` | default-gates, authority, provenance | `971cb235c38250a7d78c18d760b5dc0b810e4422a037e3f67b4da97db727f704` |
| `apps/web/src/testnet/sepolia-source.ts` | default-gates, authority, provenance, ownership | `8911e9d6bd1981351901e40eeb4b44f5e3e2e0d54094988c27245d5ec8e1551f` |
| `apps/web/src/trade/draft-controller.ts` | authority, profile, ownership, cancellation, bounds | `2e8c750b48267582d630e61d4b5c24c23c889b475fba43b31f6c1df6961b0a6b` |
| `apps/web/src/trade/review-controller.ts` | authority, profile, ownership, cancellation, bounds | `c1fb01bb9df1d24b641173e6513cbd672f175f9422dd01274e80db5c81e5b9ae` |
| `apps/web/src/ui/App.tsx` | authority, profile, ownership, accessibility, localization, privacy | `f489bd5c62372570758b926cf14e60142fef254d15184ce6141b41a148a551ca` |
| `apps/web/src/ui/BackupVerificationForm.tsx` | privacy, ownership, cancellation, accessibility, bounds | `d72d79a5efa6af26bee4e16a16bd4fbb10aa58e5f62f30f3b8f05ce27533a4bd` |
| `apps/web/src/ui/ControlHelp.tsx` | privacy, accessibility, localization | `b9e0f6431935a4bd2731d2c4f8301155c90c7c451a8df59a8f7838ec010fc69c` |
| `apps/web/src/ui/DiagnosticsPanel.tsx` | privacy, bounds, ownership, accessibility | `af0e388530656953e93453e1a3c9314b86c7217a8f07948a4f3f9c42e6ee9131` |
| `apps/web/src/ui/FavoriteSavedReviews.tsx` | authority, profile, ownership, cancellation, physical-drain, bounds | `3261acea055de16af9a95ae3bc06e49e793a19318826a70eb1ec9358a79d727c` |
| `apps/web/src/ui/GenericAppShare.tsx` | privacy, ownership, accessibility | `3185010cbfa3070f7345d6ca316c6946400582b65f08a6b5466f6a4d3229db8d` |
| `apps/web/src/ui/LocalScreenAnalytics.tsx` | privacy, authority, bounds, ownership, accessibility | `57990434a61aa0aec0e367b87605657d2b4b985cfb644a79041a082c5979e47c` |
| `apps/web/src/ui/Pages.tsx` | authority, privacy, profile, accessibility, localization | `4bc69541063a8426f45a21fbddbb6d0efd05cd75e7548ff6c79af8be3d52b18a` |
| `apps/web/src/ui/PrivacyPolicySelector.tsx` | authority, privacy, profile, ownership, cancellation, accessibility | `2e27c7daf0a902414232015eafdf01971dd5f41a0ca89750faccafcdfb132a26` |
| `apps/web/src/ui/PrivacyStatusDetails.tsx` | authority, privacy, localization | `960acfac3ce28e597d84ca991f7591b63dd003cbf043459e1b371ee7e44272a9` |
| `apps/web/src/ui/PrivacyStatusPanel.tsx` | authority, privacy, ownership, bounds, accessibility | `4c9638dc3c900444ffce912a0398ed7661a619d5adbcb315ab81973023566928` |
| `apps/web/src/ui/RecoveryReferencesPanel.tsx` | privacy, profile, ownership, cancellation, bounds, accessibility | `4966798b98cab22fb591d507356ff9800cd12c60bb0d4b7f1b17c7bdcc2a94d6` |
| `apps/web/src/ui/RetentionPanel.tsx` | authority, profile, ownership, cancellation, accessibility | `1a256f271e1d4275d288debdbdf92235433fec61061de6fa40c28ca6f76675c8` |
| `apps/web/src/ui/StartupCompatibilityNotice.tsx` | qualification, accessibility, localization | `73e8f5d5c9b3cc16f19834255438dc5cbeece42688c0bb20c91829cb6c0efaf9` |
| `apps/web/src/ui/VaultForms.tsx` | privacy, profile, ownership, cancellation, physical-drain, bounds, accessibility | `6308584152327ccdb0bb500d223f00b0a0a9d88640945c964039bd7513338cdd` |
| `apps/web/src/ui/app.css` | accessibility, bounds, simplicity | `2e475c8a3af6be68c82b09224777f525c0d49bf80d62eeffb9b4c0faccf3c26b` |
| `apps/web/src/ui/diagnostics-messages.ts` | localization, privacy | `8725c7b5f7abb508259f06a73a3526fa8330714766af9531ebac6f3f6c5a900f` |
| `apps/web/src/ui/help-registry.ts` | localization, authority, bounds | `b4c2f82bd172887c52034a7026e83fecd873c6d1f4ef75532cc8e1a61fd775c4` |
| `apps/web/src/ui/locale/bundled.ts` | localization, default-gates, provenance | `50cd19e37c7190e914e21fd5431dd32636b4cabe06d18e6bb0002fb477f452d0` |
| `apps/web/src/ui/locale/catalog.ts` | localization, authority, bounds | `78c36cb66c884929bf1fe0731e5530893e7300c651bb1600b1c84e1e19d14e61` |
| `apps/web/src/ui/locale/en.ts` | localization, truthful-outcomes, privacy | `fca621bcb0eb8e64e9ff30df5be424980a015473745beec8e815a4f7284667ed` |
| `apps/web/src/ui/locale/runtime.ts` | localization, privacy, authority, bounds | `5418018a6baf144d5b9525e0c572c9641697470501f51c25a7289129dbdd3ccf` |
| `apps/web/src/ui/messages.ts` | localization, privacy | `cd5bed7de8138abf6217d4e70b47b7c4f07fd4c41eb5aec84e74c68186112ef5` |
| `apps/web/src/ui/recovery-reference-messages.ts` | localization, privacy, authority | `19a55e9fe869fba8a0653f7e232856a12db0c0abc438446e6cdbb03d78660f6e` |
| `apps/web/src/ui/routes.ts` | bounds, authority, privacy | `2b866314571cb1c7e610b246f87d334de8fbd4cad53b06649d930ac722c4d7f1` |
| `apps/web/src/ui/styles.d.ts` | default-gates | `28e0b0de8c50a7e1daa4f6dca791beb9dcf4084e164c9468694f579406a63d73` |
| `apps/web/src/ui/trade/TradeDraftEditor.tsx` | authority, profile, ownership, bounds, accessibility, localization | `41cea3b1e885dc142b07c9d43cafac2fa134b50ee5042f06db16bd0c8f0724d8` |
| `apps/web/src/ui/trade/TradePages.tsx` | authority, ownership, cancellation, bounds, accessibility, localization | `0d94c36af5167aa42c9d13c8514fce0e9755a5ed288109b3862d2b3067892d49` |
| `apps/web/src/ui/trade/TradeTermsReview.tsx` | authority, privacy, bounds, accessibility, localization | `b8dc6a0a70f79f990e01609d06008df973c3ff582042cb699fd3cddbf56b642b` |
| `apps/web/src/ui/trade/display-text.ts` | privacy, bounds, provenance | `34bc307987270784e9c5fa68789e6eb3d699d0fb9dcff6edb1f6a1f5576bf5c3` |
| `apps/web/src/ui/trade/draft-copy.ts` | localization, truthful-outcomes | `c2cfb16803a99526bbd5dba1c9146605dbd965d2366f39350045a68e35b702e1` |
| `apps/web/src/ui/trade/trade-messages.ts` | localization, authority | `1392da9d5d8a5db7ebd35969b37fdb164e2370550350492718f51b8783294eee` |
| `apps/web/src/ui/trade/trade-terms-display.ts` | bounds, authority, localization | `09c9c88a1f7ac99fed2351bfdf9b7f6172831698043633ddfe65abc864ac112f` |
| `apps/web/src/ui/use-screen-counts.ts` | privacy, ownership, cancellation, bounds | `c83532023e90297635a28616cbfea912f3d1048d14b443cf42488075097f41c7` |
| `apps/web/src/workers/vault.worker.ts` | authority, default-gates, ownership | `005357465e3eb8c6f8bccdf5124524aa692063de6c21c146ef1a26ed4d47397e` |
