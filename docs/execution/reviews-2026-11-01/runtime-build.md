# Fresh runtime/build/release audit 2026-11-01

Baseline f264cab, plus ongoing local guidance/privacy candidate. Read-only review, no implementation changes. Prior report /workspace/work/p2p-continue-audit-runtime-build.md retains extensive exact scope and historical findings/closure. Hash comparison found72 prior-reviewed source/support identities unchanged; reused those traces rather than claiming a new every-line semantic audit of unchanged tests. Fresh full reads include recovery builder/CLI/runtime, current shared CLI entry detection, main/bootstrap/App/privacy integration, artifact scanner/plugin, and current locale native harness; reviewed intervening diffs for build/acceptance/import-boundary/fuzz/shared-tooling changes. Remaining package/crypto/contract implementations have independent assigned reviewers.

## Finding and closure

P2 locale RTL layout validation gap, scripts/test-locale-layout-browser.mjs stress: HTML dir-only mutation was overridden by App's explicit .app-shell dir=ltr. Native Chromium probe with exact DOM direction structure reproduced htmlrtl/shellltr/reviewltr, so Arabic text substitution did not exercise RTL layout. Reported root; owner corrected to override bothdocument+shell, restore exact originalattributes, and assert computed shell/main direction. Corrected source reviewed and approved; owner native4groups evidence, not rerun wholeharness. Corrected harness SHA1bcee3f3b498710dc382968b16bd85e7a8db7b17e04329a323efb70e13db860c.

No new reproduced authority/cancellation/export/artifact/release/recovery implementation finding. Recovery builder verifies opaque proof before readingproperties, bounds bytes, pins canonicalABI, checks live proof before/after publishing and cleans partial output. CLI embedded assethashes/limitedinputs and historical fixeddeployment profile do not authorize spending. Recovery uses bounded native reads with timeout/cancel guards, numbered state anchors, repeated chain/genesis/header checks and fixed unsigned plans; no signer/send. Shared isMain guards symlink identity and eval/print imports. Static app/worker graph forbids network/provider/testmodules, application unsafe tokens and unreviewed node dependencies; token/regex policy is explicitly not an XSS proof.

Privacy preliminary integration review: App passes real service and selectionScope via existing dual useSyncExternalStore subscriptions. Panel exposes independent unknown defaults for all absent network/messaging/proof providers; only local snapshot is projected. No preferences or importedJSON make networkevidence. Fresh focused render4/4 pass; monotonic clock increasing1ms perread produces genuineUnlocked observation correctly under current domain completion-time validation. Exceptions suppressed. Snapshot observationtimestamp and refresh-on-render/status text accurately limit freshness; no timer-based continuous telemetry claim. Domain model semantic audit assigned elsewhere; owner finalfreeze pending.

Locale package command test:locale:browser is enrolled in existing browserjob with P2P_CHROMIUM from pinned installeraction, readonlypermissions/no dependencies added. Harness uses temporary demooutput, loopbackserver, egress interception, cleanup; expanded/RTL/CJK are explicitly test-only text/layout simulations and real400percentzoom/physicaltouch/assistivetechnology remainunqualified. No broadsuite rerun, no hostedCI outcome claimed. Trading remains disabled; audit is not independentcrypto/device/releaseapproval.

## Current reviewed source identities

| Path | SHA256 |
|---|---|
| `apps/web/src/runtime/app-runtime.ts` | `9bd7f2c5a6aeb843fd2aebf1f0c28394eaa7eb5e084b51a5c433c63bef791164` |
| `apps/web/src/runtime/pending-metadata.ts` | `2660f60828d7d4a7b524b14ca952268e3f3b5838d29f25e710027baad3f213dd` |
| `apps/web/src/runtime/worker-endpoint.ts` | `28a78e3406455eb59e83f01cf78492edf2bcf0c3e4105840621795b887791a5b` |
| `apps/web/src/app-services.ts` | `26708746736cc91f463153916ffd1559fab291c13b1eaf02ef0cf76f3c0beae1` |
| `apps/web/src/main.tsx` | `f1a2163ba88ac04a115091e7ca382d6cfe053629c1d60c185e349d4dd213f861` |
| `apps/web/src/diagnostics.ts` | `fa760d26a8928d3501164585d4afaab43c70e34b1453175c0829a05525227559` |
| `apps/web/src/trade/review-controller.ts` | `633f5779bc13369c35a6c1323e1bb58395db81ce6e513057053faf2de290d8a0` |
| `apps/web/scripts/build.mjs` | `a9eb5cb5a566b2ffd70b26f6a82964a82a80efc236e283e8b40f154481a6edcd` |
| `apps/web/scripts/artifact-policy.mjs` | `6535cb93ee7817eabd07e7b9cda2db90b378474f1e1e6c8a5c43a8d379a67cb7` |
| `apps/web/scripts/static-build-plugin.mjs` | `47030c17ae0885cc3f9df8810b4b1815db47a6d608a98b99e5846b866aa98ea8` |
| `scripts/recovery/build-evm.mjs` | `986ccec90db4df3e98d61d69e7f30c409becd339b89fa3c8dc96a53e40391fc6` |
| `scripts/recovery/evm-cli.mjs` | `67d9db1d4b627d61912a911650f4f7683fe0e39b78daa9938f904b6c38afd8cf` |
| `scripts/recovery/evm-recovery.mjs` | `fec5fcf398c538ad40eb0e9cb8d431204fdcdbb8be13a177379d48db407002b2` |
| `scripts/lib/is-main.mjs` | `122a4e55eb0f064ecbc3bd48e4ef21a5880267418af0fc0dc23d0a96654af3eb` |
| `scripts/acceptance-report.mjs` | `22a681c14cf3dc64f7ed3040042f4e628be3d58eef5c3f25738a8b76b34a1c8e` |
| `scripts/check-import-boundaries.mjs` | `77f7f72309c427a94b8bd29a1a0abf2755152ca6b8f656f03618158a3481e46e` |
| `scripts/test-locale-layout-browser.mjs` | `1bcee3f3b498710dc382968b16bd85e7a8db7b17e04329a323efb70e13db860c` |
| `apps/web/src/ui/PrivacyStatusPanel.tsx` | `2a42b7e2fec8c3e7bf6bd272bddc0d9cf4fd7c944f1aa4a5554a1b2f784eae0d` |
| `apps/web/src/ui/App.tsx` | `832ca9b975265b71957c0f30d60c3a607476bce8aad4c66be48304b2706ddd28` |
| `apps/web/src/ui/Pages.tsx` | `a33d73dd5d4d68fbc3a71a8e10d1b8f6b5167f5d5913346934282eb422235ded` |
| `apps/web/test/privacy-status-panel.render.test.mjs` | `77d76b1a4f657ad86d5ff648ce875231252e31eaa616562120fec7af1d5797ef` |
| `package.json` | `892d78718e9f005c68f23b834814b70fa5b2f881ba1d4c1a7792c4c0b0d4ffb8` |
| `.github/workflows/vault-foundation.yml` | `4e503b209035285ae784d34cb22a6b15044aee5b3ebdcfba25fc2925cef521f8` |

Final privacy integration freeze reviewed/approved after owner notification. Focused4/4 independently passed, advancing clock probe passed. Final panel/Pages/App/en/test identities above unchanged at freeze (en SHA9a07138673edf4df49b636d1ed0291bea5d6716672d4c0b775c029aad6c7a1ff). No remaining reproduced findings in assigned runtime/build/release/tooling slice. New guidance UI receives separate owner tests; no claim of professional accessibility/device/crypto approval.

Final superseding absence-label correction reviewed/approved: null services omit expectedScope despite App fallbackscope0, yielding unknown/not-observed rather than misleading scope-changed. Actual scope mismatch tests retained. Fresh UI4/4 PASS. Superseding panel SHA d403d741add871ae9b711f96c49b18f97b02816b29ecb020b790b161dd296956; test SHA81ea403a3c5750c9ca677bd85a97c3a0a7369be8764581260155ae155b04b4f2. No implementation source writes by auditor.

## T27 stale mounted observation follow-up

CodeRabbit identified mounted Settings could retain its original observation beyond30s without vault transitions; accepted and independently reviewed owner correction. One local deadline is renewed after inspection; activeguard, timeout/listener cleanup, pageshow and visible-state callbacks cover unmount/resume without network/authority expansion. Independent emitted native browser harness5/5 PASS Chromium154.0.8037.57: >30000ms with no vaulttransition advances actual monotonic inspectedAt, exactly1deadline, each resumeevent independently refreshes, unmount clears timer+bothlisteners and staysclean after60s, realunlock-to-lock refreshes immediate. Zero unexpectedrequests, ReleaseEnabledfalse. Real400percentzoom remainedunqualified with explicit320CSS reflowfallback; touchscreenemulation not physicaldevicequalification. Superseding hashes panel0fe6dd11d0414735d8f4cfbfd6881d3701b734d04191ccee4e0eb262fb5f1d97; en2da03ee222262d5a66c4cbfedc4dd0b9861e5644485a0f275bb9dc761d5790ac; harness8bbbb7cedf3d8dd0afcba1ec19bdfb093374820f11e12ad9515bbc9b0ad378f9.

Three root doc corrections reviewed/approved: G23 suppliedtrustedport conditional clock/scope language avoids claim of broker in currentpanel; repositoryinstructions read ifpresent; guidance receipt retains historicalT19/T21hash and explicitly separates laterprivacycatalog/T27ownership and supersedingidentities. No falsified priorreceipt. No sourcewrites.
