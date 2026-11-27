# Optional policy isolation completion — November 27, 2026

This successor preserves [#227](https://github.com/djshellshoxxx/p2p-offramp/pull/227) and its corrective child [#273](https://github.com/djshellshoxxx/p2p-offramp/pull/273), including the latter's native registry drain and disposal fixes. The local integration baseline combines #273 head `5b074513704d4c8c75ef0b93069d004c76d82665` with main `fdf346ab8e6aacc60b501007ec10ec7ee840a701`; original branches are unchanged.

## Reproduced gap and completed plan

PP-A2 was independently reproduced with the actual G05 broker and G14 registry. A purely local optional module was retired while an unrelated core relay operation was running. Its controller called the shared broker's `invalidate()`, advancing the broker generation and cancelling the core operation even though route evidence remained current.

The repair:

1. Qualifies the existing #273 implementation against current main with actual G05/G14 dependencies.
2. Adds paired optional/core operation regressions for ordinary and strict modes: evidence loss, direct disposal, cancellation during initialization, and synchronous reentrant disposal.
3. Removes shared-broker invalidation only from incidental retirement, cancellation and disposal. Controller generation, G14 abort, owned registry cleanup and physical drains remain intact.
4. Preserves explicit `requestMode` invalidation and mode changes, and proves genuine shared-broker revocation still cancels both kinds of work.
5. Documents the trusted extension contract: bind transport scopes to the G14 initialization signal and dispose owned resources.

## Evidence

- Existing #273 package baseline after current-main integration: 30 tests passed, no failures or skips.
- New paired-scope regressions against that baseline: all eight fail, reproducing unintended core revocation.
- After repair and the genuine-broker-revocation control, the combined privacy-policy, extensions and transport suites pass 97 tests, with no failures, skips, cancellations or TODOs.
- An independent reviewer reran all 97 tests and found no open High or Medium issue. Reviewed mode implementation blob: `9a4f134871c658d378884d98576a79a627d309e5`.
- The static build and all four TypeScript projects pass. All 13 emitted files match the build from the current-main-derived claims-freshness tree, which has no optional privacy-policy package; the optional package is absent from the default runtime graph.
- The PR records the complete current-head checks and integration status.

The older reentrant-disposal regression now binds its permit to the actual G14 signal. It still requires immediate owned-scope revocation, exactly one cleanup and all callers waiting for the held drain. It no longer encodes unrelated core revocation as expected behavior.

Run the focused qualification with:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test packages/privacy-policy/test/*.test.mjs packages/extensions/test/*.test.mjs packages/transport/test/*.test.mjs
```

## Remaining gates

This completes local controller isolation, not production privacy integration. No approved advanced provider or catalog is supplied, browser static loading remains an unbrokered path, and a G14-to-G16 wire commitment remains undefined. The shared optional admission guard (#280), original integration-lane reconciliation, current-head CI and the D8 named CodeRabbit/Qodo review remain prerequisites for the optional-package intake. No optional import is enabled in the default app, and no release, deployment or financial authority changes.
