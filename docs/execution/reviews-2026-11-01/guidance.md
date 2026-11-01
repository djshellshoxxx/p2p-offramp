# Independent T19/T21 source review

Read-only review of the initial frozen guidance implementation. No production edits or commits.

## Required findings

1. P2: Hover-only tooltip cannot be dismissed by Escape while keyboard focus remains elsewhere. ControlHelp attaches its Escape handler only to its wrapper; an input outside that wrapper receives the key event and neither bubbles through it nor invokes dismissal. Add a listener while open, dismiss hover content without stealing external focus, and restore focus only when appropriate. T20 owner was asked to reproduce with actual input focus + pointer hover + Escape and assert focus unchanged.
2. P2: Closed help has a dangling aria-controls IDREF. Actual React SSR emitted aria-controls="unlock-profile-tooltip" while the conditional tooltip node was absent. Remove the control relation while closed or retain a hidden existing target. Existing aria-describedby is correctly conditional. SSR reproduction used the real component and renderToStaticMarkup, targetExists:false.

## Verified behavior

Focused help registry/catalog/source suite passes16/16 under managed network/IPC permission. Registry descriptor snapshots avoid accessor evaluation, bounds arrays at64 and fixed interaction inventory, rejects unknown fields/duplicates/dynamic messages/unsafe links, and returns frozen records without mutation API. Help content derives only from static catalog entries; associated input values are never read. Existing critical consent and passphrase guidance remains visible in VaultForms. No new network, wallet or storage authority.

Locale address-purpose behavior is display-shape validation and exact preservation only (EVM hex or bounded base58-looking text); no native chain/address qualification follows. Direction derives Arabic RTL and remaining supported target LTR without adding input fields or a locale selector. Imported published/reviewer text still cannot grant selection/funds authority. Canonical amount/address parsing algorithms and signed bytes are unaffected.

## Limits

This report is source review plus focused model/SSR tests, not assistive-device or WCAG acceptance. T20 owns native interaction/layout proof. Initial findings must be fixed and independently rechecked before acceptance; passing current16 tests is not approval. No broad suite, build output, native chain, paid resource or external message was initiated.

## Reviewed snapshot SHA-256
- `apps/web/src/ui/ControlHelp.tsx` `81b647129927e795994dc90548f717ff230c359112b33a15484c9be8b8968711`
- `apps/web/src/ui/help-registry.ts` `3b7e75fe597f30572197600b2585d095122b32eda655e7518195a7b7f9c77286`
- `apps/web/src/ui/VaultForms.tsx` `1700537b5dc79ed5a46525b0d29e5a8889a984c3c3570931c319503beb6b4a69`
- `apps/web/src/ui/locale/catalog.ts` `a279b4f2b2ae0be066309329f1b19c0f2c3984b2da04d60a47c2da7098964048`
- `apps/web/src/ui/locale/en.ts` `ad583c18941854bd3ea3613bf517165bdde07503f7e006f6fafcd471dbfb97f6`
- `apps/web/test/help-registry.test.mjs` `fef47429ac9cd8aded2f7efb5795b001c6e64cb727881bec9ae6125a447ce062`
- `apps/web/test/locale-catalog.test.mjs` `0533697718d9a3f6647932e915acfba7b8017a24439358bf669c8e7f794c3a6c`
- `apps/web/test/locale-source.test.mjs` `ae79e52db639b8c251b9120785d293e4897ec2aec0387d4a9564dc539d7fe5b8`

## Final frozen-snapshot re-review

Both initial P2 findings are resolved in the reviewed final source. ControlHelp installs an Escape listener on document capture only while open, removes it on effect cleanup, closes hover help regardless of external keyboard focus, and only stops the event/restores trigger focus when focus belongs to the wrapper. External input focus is retained. Both aria-controls and aria-describedby now exist only with their rendered tooltip target. A repeated real-component SSR probe confirmed closed markup has neither dangling relation and still has its trigger.

Independent focused execution passed25/25, zero failures/skips/cancellations: help-registry, locale-catalog, locale-source, trade-terms-review.render via register-tsx. Reviewed added bdi dir=ltr wrappers in recovery references and trade review: these retain the exact existing React text values and do not transform parsing, stored values, signed/canonical bytes, or private instructions. Address-purpose validation remains display shape only; direction metadata does not authorize translation selection or certify an unsupported chain. No new required findings on this snapshot.

Limits remain: native interaction and layout qualification is T20's responsibility; these25 tests and SSR do not independently prove browser focus/event behavior or assistive technology acceptance. No production changes or commits made by reviewer.

### Final snapshot SHA-256
- apps/web/src/ui/ControlHelp.tsx: 4fcaaed07fd1ac86b58aa9d759a2349344448fdc6d892e824a96c2962901c99f
- apps/web/src/ui/help-registry.ts: 3b7e75fe597f30572197600b2585d095122b32eda655e7518195a7b7f9c77286
- apps/web/src/ui/VaultForms.tsx: 1700537b5dc79ed5a46525b0d29e5a8889a984c3c3570931c319503beb6b4a69
- apps/web/src/ui/locale/catalog.ts: bb185fdf92d2ca2af7fa4f956b6cc3459ecd22576a1f26c49bfaaa35b2577d65
- apps/web/src/ui/locale/en.ts: ad583c18941854bd3ea3613bf517165bdde07503f7e006f6fafcd471dbfb97f6
- apps/web/src/ui/RecoveryReferencesPanel.tsx: 4966798b98cab22fb591d507356ff9800cd12c60bb0d4b7f1b17c7bdcc2a94d6
- apps/web/src/ui/trade/TradeTermsReview.tsx: bbbed968027516f9addd7f1b0d6aeabd4fdc3de61f5428be6670797b350bed46
- apps/web/test/help-registry.test.mjs: fef47429ac9cd8aded2f7efb5795b001c6e64cb727881bec9ae6125a447ce062
- apps/web/test/locale-catalog.test.mjs: 0533697718d9a3f6647932e915acfba7b8017a24439358bf669c8e7f794c3a6c
- apps/web/test/locale-source.test.mjs: ae79e52db639b8c251b9120785d293e4897ec2aec0387d4a9564dc539d7fe5b8
- apps/web/test/trade-terms-review.render.test.mjs: 878fd374b6d58bbf81efa57ce61bfb50d869c0194d32de9bc8430f99229c0c36
