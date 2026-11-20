# Independent optional courier review — 2026-11-19

## Verdict and exact scope

**PASS for isolated local source intake. No unresolved High or Medium source finding was established.** Exact reviewed head: `e7f54bdaf35b0112de0eaaf920e1c143fb7e90fb`, based on `ac9a4b0ffc3ca50a299398e72554e7964a634cd4`. Hosted checks on the published head remain a separate gate.

Compared with original #146 source `636a3372cfe1a2306578b5a70ab9eb42858a83ac`, only the package README, `src/secrets.ts` and `test/secrets.test.mjs` change. The other 19 package files match. The recovered package and its author report introduce no dependency, shared workflow, default App/Worker or trust-root change. The README accurately treats the governance assurance packet as historical source-bound evidence rather than fresh courier verification.

## Source and diagnostic review

The reviewer traced the public facade, strict data admission, verifier-owned evidence and current-owner lifetime, bounded signing/hash ports, secret provisioning and logged reveal, custody/challenge binding, route disclosure signers, financial projections and conservative locker uncertainty. Secret writes retain native G02 lease/revision checks; late lock, expiry or custody changes refuse publication. Timeout retires the verifier when an ignored provider operation could remain pending. The facade exposes no native wallet, network, financial or locker executor.

The returned-error repair reads own data descriptors at both the wrapper and code levels, catches reflection refusal and preserves the fixed `LOCKED`, `CONFLICT` and `CANCELLED` mapping. Unknown, inherited or accessor-backed diagnostics fall back to `UNAVAILABLE`; successful results and lease/storage logic are unchanged. The regression demonstrates defensive handling of a malformed trusted-adapter diagnostic, not an imported peer exploit or economic authority escalation.

## Independent execution

The reviewer reused a clean detached probe provided by the previous reviewer, checked out each exact checkpoint sequentially, and made no author-worktree changes. Broad baseline tests, typechecking and builds were not duplicated.

| Check | Observed result |
|---|---|
| Diagnostic regression at RED `6cff236e0768d39b09b26a793b630a9ea0a2f2d3` | Expected failure: 10 results, 3 passed / 7 failed; six adverse subcases plus the enclosing test |
| Same regression at reviewed final head | 10/10 passed; no failures or skips; zero accessor/coercion calls and no vault read/commit on refusal |
| Targeted native secret-store lock, expiry, reentry, substituted commitment and custody interleavings | 8/8 passed; zero failures or skips |
| Verifier, existing validation regressions and authority tests | 11/11 passed; zero failures or skips, including finite pending-port retirement |
| Independent Python compact-JSON/SHA-256 calculation | Canonical text, all 278 preimage bytes and digest match the committed container fixture |
| Independent inspection of author-emitted default artifact | All 13 files byte-match generation 2; no courier module in document, vault or QR graphs |

Commands used for the targeted tests:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test --test-reporter=tap --test-name-pattern='returned native diagnostics' packages/courier/test/secrets.test.mjs
node --import ./scripts/test-support/register-tsx.mjs --test --test-reporter=tap --test-name-pattern='lock during|owner callback reentry|authenticated private slot|closing the selected verifier|audit regression' packages/courier/test/secrets.test.mjs
node --import ./scripts/test-support/register-tsx.mjs --test --test-reporter=tap packages/courier/test/verification.test.mjs packages/courier/test/validation-regressions.test.mjs packages/courier/test/authority.test.mjs
```

The independently recomputed opening digest is `efac3704c9b3115180a0688c1d821a77657d47924ec9e4c62caf2e1e3aa3b97f`; unchanged fixture SHA-256 is `60eef009c1e431ec3317f512674ba3fa279e5a375a2ddd991964c6239cb919f1`. This is a byte-commitment oracle, not evidence of cash, custody or delivery.

## Remaining boundaries and log digests

This review ran no Chromium, chain provider, device, deployment or release. No financial-asset, physical-presence, native unlock, production eligibility or privacy qualification is inferred. D7 permits this isolated package extraction; default application wiring remains separately gated. The implementing worker's full 61/61 suite and TypeScript/build evidence are documented separately and are not relabelled as this reviewer's runs.

| Log | SHA-256 |
|---|---|
| `cross-review-courier-diagnostics-red.tap` | `c9361675d1dff217b506652c2363d6792c42a2599d980b447ea9211da4c531ff` |
| `cross-review-courier-diagnostics-green.tap` | `0112c084bed84bc7c42cdf3346d8c4d91a399a30382e82082399c7ce3cb6c981` |
| `cross-review-courier-native-storage.tap` | `f9ad690affba1009e3bdd0c13ac47d94b4f7aa4d88498eb05715af259e095926` |
| `cross-review-courier-boundaries.tap` | `196143d1dd96a51c32c0dbae94a5971a4d63f561d24ce8921e847c7a43f17292` |
| `cross-review-courier-native-vector.json` | `f8d861ddf80b6146d7a5cb09bcf4897cf462a2026a210adfc9417f50a4d1dd08` |
