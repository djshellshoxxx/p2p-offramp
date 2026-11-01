# T29 independent runtime/panel review

Approved frozen candidate, read-only. Broker policy itself separately reviewed by audit_storage; this review covers UI composition and native fixture.

Panel waits for successful subscribeInvalidation registration bound to exact transport prop before any positive inspection. Server render does not touch suppliedbroker. Replacement suppresses oldprop immediately; stale callback activeguard is disabled before unsubscribe. Registrationfailure produces unknownroutes/local-only view and fixederror while retaining independentvault. Selectedpolicy derives real mode; generation/mode checked around freshreaderinspection. Callbacks are invalidationhints only, no routeevidence or permitauthority. Timer/resume cleanup retains previousbound; no defaultbroker is passed by actual app. Source trace includes effectsetup/cleanup replay safety; no dynamicStrictModefixture or physicaldeviceapproval claim.

Independent tests: localprivacyrender4 +transportSSRnegative1 PASS. Independent native emitted browser6/6 PASS Chromium154.0.8037.57, /workspace/work/t29-independent-browser.log. Realbroker ordinarydirect, strictblocked, revokeunknown, renewal, inspect-onlyTTLunknown, disposalunsupported, replacementunsubscribe/latecallback suppression, actual64observerexhaustion preventinginspection, activeunmount cleanup and no lateinspection. Failedsubscription keeps explicitly syntheticLocked localservice observation. Capture/authorizecounts0, unexpectedrequests0, ReleaseEnabledfalse. Existing expiry/resume/unmount/realvaultlock and layouthelp checks remaingreen. Real400percentzoom/physicaltouch/translatedlocale/accessibilityacceptance remainunqualified and output saysso. Fixture builds under separate test-only URL and is not an applicationmodule or runtime capability; finalproductiongraphpolicy excludes tests/fixtures/transportproviders.

No new blocker or source edit.

| Path | SHA256 |
|---|---|
| `apps/web/src/ui/PrivacyStatusPanel.tsx` | `c2661e62d95e72683c977b5743eae3d84e0af2cb5be8a2eee72ed6631ecd5b3d` |
| `apps/web/test/privacy-status-transport.render.test.mjs` | `ea0eacb24ef02cccf88f4105a2213a858338a7b88a00895f403fc3f1c8e662a1` |
| `scripts/fixtures/privacy-status-fixture.tsx` | `dccbe6e0b30f56c42492b4d1f3eebb24ce3d71e045a666f7b1405e707cdd15b5` |
| `scripts/test-locale-layout-browser.mjs` | `268b94a84514863ee080ac18678484350d64f99461a2d3e86e4185361199dc8e` |

## Approval superseded pending same-identity lease correction

Root found actual lifecycle gap missed by this review: React subscription ready state for A remains after A→null cleanup; reattaching same A can inspect on its first render before new registration, even if that later fails/exhausts. Prior approval superseded. UI owner implementing current active ownership lease and fixture owner adding same-identity reattach under64observer exhaustion with noinspection. Await freeze and independent re-review.

## Final superseding lease correction approved

Root's same-identity lifecycle finding was valid and missed in prior review. Owner nativeRED recorded6 pre-registration inspections after A→null→sameA under actual64observerexhaustion. Frozen correction tracks actual current successful subscription in ref, sets only after valid unsubscribefunction returned, clears before unsubscribe, and requires ref exacttransport as well as Reactreadystate. Thus retainedreadystate no longer grants inspection after detach. Failednewregistration leaves nolease; oldcallback activeguard remainsfalse.

Independent emittedbrowser6/6 PASS Chromium154.0.8037.57, /workspace/work/t29-lease-independent-green.log. Reviewed regression detaches successfulA, exhausts actualsamebroker at64, reattaches exactsameobject, and checks inspectiondelta0/fixederror/unknown while syntheticLocked localservice remains. Fourthfreshbroker independently proves activeunmountunsubscribe and latenoreinspection. Zero unexpectedrequests, capture/authorize0, ReleaseEnabledfalse. This final approval supersedes prior pending/superseded status; no sourcewrites.

SupersedingSHA256 panel c6ed6d93fa4f5096203c5acf347980140e57551c313e5450e46ae8f4422addf2; fixture b91f1815e278f7f8bb5d5611018e6735667d5e154c7a22c67fa314953e266556; browser 9aebe2d2a172daefcea4a698c2bd02f9a734d94ee36a04ba13b11dd9b3e4f85f. TransportSSRnegative testidentity unchanged. StrictMode reviewed by lifecycle source trace, not dynamicallyqualified. No defaultbroker, protectedrouting or releaseapproval.
