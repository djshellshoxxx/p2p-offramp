# T31 independent broker follow-up review

Prior T29 approval is superseded: that review missed display-only expiry revoking unrelated permits and stale end-state for an earlier observer after later reentrant mutation. Both failures now have explicit regressions.

APPROVED final T31 candidate: displaywatch expiry only emits a hint, does not bump generation or abort actualscope; actualpermit expiry retains transition/revocation. Fixed<=64observer cohort, activeobserver tagging and mutators excluded from catchup guarantee each dirty pass adds a new excludedmutator, <=65passes and no recursively queuednotification microtasks. Nonmutating earlier observers receive finalmode/closedunsupported after latermutators; disposeclear occurs only aftercatchup. Newsubscriptions do not grow cohort. Callbackexceptions do not suppress cleanup orotherlisteners.

Independent directfocusedtests27/27PASS, including63mutator reverseorderedchain bound, explicit longpermit/liveoperation survival at shortdisplayTTL, actualpermitexpiry, finalstate+dispose delivery and repeatedmalformed asyncinspect. No fullsuite/sourcewrites.

## Final source hashes
- `packages/transport/src/policy.ts` `3c43f86148864a500f3e7d74dbcd7a7c4a990701c6566c67edd6b18841d46fa6`
- `packages/transport/test/policy.test.mjs` `e2362d75405b492b7c634cb40c10958c5f8d4c6fba972b6425c9ab4d60f618fb`
