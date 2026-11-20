# Independent optional privacy-controls review — November 19, 2026

## Verdict and exact scope

**PASS for the isolated source scope. No open High or Medium finding was identified.** This is an independent review of source authored by another worker; fresh hosted qualification remains required for the published integration head.

| Reference | Exact value |
| --- | --- |
| Reviewed final head | `fe14b8f0b4e5be083e886d0c22dd27959423c9e1` |
| Reviewed final tree | `b680f3a3ae16934bd946731ffb7637f17a96997e` |
| Integration base | `ac9a4b0ffc3ca50a299398e72554e7964a634cd4` |
| Original PR #160 source | `30a38a607a48c630c0eec2aecc2f3a5e49ab7d22` |
| Failing regression checkpoint | `1d57d9243f4770cc0156b9c976f1cad581d1cfda` |
| Repair | `c53410eaf3f4b46b6428063bc539f2dbe4f0721e` |

The review compared `git diff ac9a4b0ffc3ca50a299398e72554e7964a634cd4...fe14b8f0b4e5be083e886d0c22dd27959423c9e1`, read all four production modules and the public facade, inspected native-vault and browser tests, and checked the documented local choices against the duress action, compartment and sweep authorization specifications. The canonical accepted-decision index's November 18 D7 decision permits this one-package source extraction; default application composition remains separately gated.

The author's worktree was not modified. Execution used a separate detached verification worktree, first at the failing checkpoint and then at the reviewed final head, with physical in-checkout dependencies. This report is the only change in its review commit.

## Standards

No documented-boundary or coding-standard violation requiring repair was found. Ten of the original twelve package files remain byte-identical; only the diagnostic mapper and its regression test differ. Dependency metadata is unchanged. The root package change adds exactly `test:privacy-controls:browser`, preserving every prior script. Removing the single additive three-line browser step makes `vault-foundation.yml` byte-identical to the base workflow.

The failure mapper now reads only own data descriptors for the returned `error` and `code`, without invoking their getters or string coercion. It preserves the previous exact allowlist and authentication-to-authorization mapping, and converts reflection refusal or unsupported diagnostics to the fixed `UNAVAILABLE` fallback. The success branch is unchanged. This does not claim arbitrary same-origin JavaScript isolation: the native G02 adapter returns fixed plain data, and the reproduced defect concerns a substituted adapter diagnostic.

Physical admission is set before owner callbacks and remains held until the underlying promise drains. Cancellation and disposal prevent late publication. Native leases are checked after awaits; revision pinning and freshness CAS reject concurrent destination/record changes. Cleanup removes local ownership before calling foreign disposal, and a cleanup exception does not skip other owned resources. Confirmed durable writes preserve scalar receipts after a late lock without restoring private view access.

## Spec

No deviation requiring repair was found within the declared local scope. The duress action policy requires lock-first behavior and forbids transfers, destructive deletion, remote alerts and escrow settlement. The controller retains exactly the lock/open-decoy/hide-notification metadata action sequence, requires normal authenticated consent to configure it, and exposes only a read-only decoy view with `walletAuthority:false`. The native profile is separately created and keyed; only the bounded marker is accepted for demo exposure, and unknown records are refused rather than hidden.

The sweep authorization baseline describes a reviewable plan with account/generation, network, destination, explicit asset caps, fee cap, expiry, nonce and policy revision. The implementation validates and detaches those fields, generates a fresh native nonce, binds the persisted encrypted plan hash, invalidates prior handles on replacement and retains `requiresFreshWalletConsent:true` / `executionSupported:false`. Schedule maturation, reload and cancellation grant no transfer authority. The missing standalone monetary intent, hidden credential bootstrap and UI composition remain explicit in `DECISIONS.json`; this review does not turn them into completed features.

## Independently executed evidence

Environment: Node 24.22.3, npm 11.19.1. No complete repository baseline, local browser or deployment was run for this review.

| Check | Observed result |
| --- | --- |
| Focused returned-diagnostic regression at `1d57d924` | Expected RED: 11 entries, 4 passed / 7 failed; six adverse scenarios plus the enclosing test failed |
| Same focused regression at `fe14b8f0` | GREEN: 11/11 passed, no failures/skips/cancellations |
| Complete privacy-controls package suite at `fe14b8f0` | 47/47 passed, no failures/skips/cancellations |
| `npm run check:boundaries` | Passed: 239 production files, 140 core modules |
| Original-source package comparison | Exactly `src/shared.ts` and `test/sweep.test.mjs` differ |
| Root script/workflow preservation comparison | Passed; only the necessary browser command and additive step |
| Exact-head diff whitespace check | Passed |

The focused command was `node --import ./scripts/test-support/register-tsx.mjs --test --test-name-pattern='returned vault diagnostics' packages/privacy-controls/test/sweep.test.mjs`. The package command was `node --import ./scripts/test-support/register-tsx.mjs --test packages/privacy-controls/test/*.test.mjs`.

The regression uses the actual encrypted G02 vault while substituting only a failed `list` reply. It verifies zero diagnostic getter/coercion calls, unchanged encrypted rows and write count, and successful native loading after restoration. The passing package suite additionally exercises lock-before-decoy exposure, cancellation with ignored decrypt/CAS work, late cleanup failures, authenticated reload, idle expiry and concurrent destination replacement.

The retained browser harness uses two documents with native IndexedDB/WebCrypto, checks independent profile keys, source ciphertext preservation, reauthentication, reminder-only behavior and explicit other-tab freshness conflict. Its step still receives the workflow-selected Chromium executable. This is source inspection of the gate, not a new browser result. The author's four typechecks and byte-identical default-build results are recorded in `OPTIONAL_PRIVACY_CONTROLS_20261119.md`; they were not relabeled as reviewer executions.

## Evidence digests

| Reviewer log | SHA-256 |
| --- | --- |
| `independent-privacy-controls-red.tap` | `8601d4c07d0096f4b0a4e50db4308103ede5dc054c73f34f8dab4e1f7bb3a964` |
| `independent-privacy-controls-green.tap` | `7e2c191aaa0846b16f8557f5a60931f29b6be347004fc99addcd1716e5a37c0e` |
| `independent-privacy-controls-package.tap` | `655ab235be8ddd01571b3c1dfbc1b76bf4deed8a227b27cf072bf7cf8008f9b2` |
| `independent-privacy-controls-boundaries.log` | `0e23b8056e6c5fff551130d3b5f06ca01885474ac2fbf068b3f8baa598a8ca72` |

Standards: zero open findings. Spec: zero open findings within the isolated local source scope. No coercion resistance, physical erasure, default-app or production-release qualification is claimed.
