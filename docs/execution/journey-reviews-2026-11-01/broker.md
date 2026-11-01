# T29 independent broker invalidation review

APPROVED no blocking finding in final frozen candidate. Read-only review.

Notifications are hints only and deferred until capability cleanup. Bounded64listener set, validated6channel inspectexpiry/fault maps, sharedownedtimer, callbackexception isolation and reentranttransition coalescing checked. Repeated malformed asyncinspect is faultlatched to avoid generation/render livelock; validresult or realissuerinvalidations resetfault appropriately. Closed subscriptions cannot recursivelynotify. Lastunsubscribe clears inspectionwatches while retaining actualpermit expiry. Defaultbroker still no positiveauthority, evidenceprojection shapeunchanged, strictmode nofallback unchanged.

Independent directfocusedtests24/24PASS, zero skips; nofullsuite/nativeI/O. Custom asyncfaultprobe callbacks1/generation1 passes. Disposal and staleprivateproof must still be interpreted through currentbroker inspection, not notification itself. No sourcewrites.

## Final hashes
- `packages/transport/src/policy.ts` `50d5e3a02c6dbeca49807e020e479ca5f448abd1722a683721f2d76ef2fe41f4`
- `packages/transport/test/policy.test.mjs` `16559ce0a65ca2ca0e47b46a6e737704fc29bd3041abe0e5bca9685fc8ae87ca`

This initial approval is historical and superseded by broker-followup.md: hosted review reproduced two missed defects, repaired and independently rechecked as T31.
