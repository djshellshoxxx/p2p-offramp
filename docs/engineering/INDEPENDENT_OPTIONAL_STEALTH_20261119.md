# Independent optional stealth review — November 19, 2026

## Verdict and exact scope

**PASS for the isolated offline diagnostic source. No open High or Medium finding was identified.** The reviewed source was authored by another worker. Fresh exact-head hosted checks remain required; this review does not select a wire profile or qualify spending.

| Reference | Exact value |
| --- | --- |
| Reviewed final head | `ef482997ef75b529e397b171a09a61d72bd4d77d` |
| Reviewed final tree | `618849346b3298bc3ca992bd95e46014ba358940` |
| Integration base | `ac9a4b0ffc3ca50a299398e72554e7964a634cd4` |
| Original PR #161 source | `1d78c89bb62895878b108e77c8711f2a2c88fe79` |
| Failing regression checkpoint | `b69f4592b9fffe2bb2831d8e7384a07dd21f50f5` |
| Repair | `19792ad333a93db6e21cc5147234cc4e22629c5a` |

The review compared the three-dot diff from the pinned base, read all eight production modules and the public facade, inspected package tests and decision records, and read the historical local contract directly from immutable commit `494703e837897d04bce1cb04134fa8be6b747377`. Its absence from the extraction is intentional: the README links the historical evidence instead of importing unrelated old files. D7's accepted November 18 source-extraction scope applies; default application wiring remains separate.

The author's worktree was not modified. Tests ran in a separate detached verification worktree at the failing and final checkpoints, with physical in-checkout dependencies. This report is the only change in its review commit.

## Standards

No documented-boundary or coding-standard violation requiring repair was found. Seventeen of the nineteen original package files are byte-identical; only `src/store.ts` and `test/pages.test.mjs` differ. Root scripts, package lock and the maintained vault workflow are byte-identical to the base. No package-specific browser harness existed to recover.

The repaired failure path reads only own data descriptors, refuses inherited/accessor diagnostics and catches reflection refusal. It preserves exact `LOCKED`, `CONFLICT` and `CANCELLED` outcomes, maps quota/limit/rekey codes to `CAPACITY_EXCEEDED`, and otherwise retains `COMMIT_UNKNOWN`. Successful results, native leases and storage mutation logic are unchanged. The native vault returns fixed plain data; the test demonstrates defensive handling of a substituted adapter reply, not an imported-message exploit.

One service job and one store operation reserve admission before owner callbacks. Cancellation resolves the logical caller while ignored source/storage work retains both physical slots until drain. Checks after callbacks and awaits suppress late publication. Bound store revocation remains subscribed after job completion, so idle lock or explicit store closure retires the viewing capability. Owned view, entropy and derivation byte buffers are cleared on retirement; the source does not promise physical erasure of runtime copies or bigint temporaries.

The comparison store commits matched claims and the completed cursor in one G02 CAS only after all pages validate. Persisted candidates are parsed and rederived under the live viewing capability; their stored presence does not establish a match. Exact cursor progression, page/token caps, conflicting duplicates and native revision changes refuse the whole update. Occupied record IDs include unrelated consumers, preventing a deterministic candidate ID from overwriting their preferences. Ambiguous commits remain unknown and are not retried or represented as rollback.

## Spec

No deviation requiring repair was found within the declared offline slice. The historical contract and current `DECISIONS.json` require explicit named profiles, no default or automatic detection, and no approved interoperability or financial authority. The implementation preserves the separate 64-byte uncompressed x/y and 33-byte compressed shared-point Keccak inputs. Its exceptional scalar policy refuses zero and values at or above the curve order, matching the declared local contract rather than silently choosing another profile.

Public methods accept a distinct spending public point and an opaque, service-owned viewing handle. They expose neither spending-secret input nor derived private-key output. Native viewing entropy is bounded, copied/foreign handles are rejected, and source-supplied logs, anchors and cursors remain offline claims. Exact Announcer ABI offsets, lengths, padding and compressed points are validated. Output retains `diagnosticOnly:true` and `economicAuthority:false`; a match grants no balance, terms, funding, release or refund authority.

The selected network/emitter identity, live canonicality/reorg rules, external-wallet spend flow, durable view recovery and independent interoperability qualification remain explicitly unimplemented. This source verdict does not close those activation gates.

## Independently executed evidence

Environment: Node 24.22.3, npm 11.19.1; pinned official Foundry `cast` 1.5.1, commit `b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2`. No complete repository baseline or browser was executed.

| Check | Observed result |
| --- | --- |
| Returned-diagnostic regression at `b69f4592` | Expected RED: 11 entries, 4 passed / 7 failed; six adverse scenarios plus the enclosing test failed |
| Same focused regression at `ef482997` | GREEN: 11/11 passed; no failures/skips/cancellations |
| Complete stealth package suite at `ef482997` | 55/55 passed; no failures/skips/cancellations |
| `npm run check:boundaries` | Passed: 243 production files, 140 core modules |
| Native `cast` fixture verification | Three independent byte checks passed |
| Source and root-preservation comparisons | Passed |
| Exact-head diff whitespace check | Passed |

Commands were `node --import ./scripts/test-support/register-tsx.mjs --test --test-name-pattern='returned vault diagnostics' packages/stealth/test/pages.test.mjs`, the same test runner over `packages/stealth/test/*.test.mjs`, and `node packages/stealth/test/fixtures/verify-native-keccak.mjs /workspace/scratch/6bd6e00af1c0/toolchain/cast`.

The diagnostic test uses an actual native encrypted vault with only `captureSession` replaced by a failed reply. It verifies zero getter/coercion calls and unchanged encrypted storage, then successfully constructs and closes a store after restoring the native method. The complete suite also exercises opaque handles, entropy bounds, callback reentry, cancellation/drain, idle revocation, ambiguous writes and clock expiry.

Independent `cast` recomputation produced `0x569058e4fc044dda07c8ddccecb8008b2ebb1f7d8062b1a1b57416f263389037` for the 64-byte profile, `0x0b3ea9e004b5289e3ac54a9bd15dfd39401349697746970bbe89fc3327c978ff` for the 33-byte profile and `0x5f0eab8057630ba7676c49b4f21a0231414e79474595be8e4c432fbf6bf0f4e7` for the Announcer topic. This independently verifies these public bytes; the upstream SDK was not executed and no native deposit was proven.

The author's four typechecks and byte-identical default artifact are documented in `OPTIONAL_STEALTH_20261119.md`; they are not claimed as reviewer executions. Static boundary checks do not establish a runtime sandbox. Current hosted qualification and any future provider or product activation remain separate.

## Evidence digests

| Reviewer log | SHA-256 |
| --- | --- |
| `independent-stealth-red.tap` | `3c4ff5833acea8acaff66be1400f40b18d837be28a66da1a8c33d29ad138f393` |
| `independent-stealth-green.tap` | `d66a3a1e1545a275c0837223f7c5b93671400013cb9c698eeb7ae378a12a0ad3` |
| `independent-stealth-package.tap` | `148fbf34fd01b0de6253bdfa2407a7091ca15e7a8fdcb2555808c43bab8aef83` |
| `independent-stealth-boundaries.log` | `6f4bbf9afc4e6100785e0e38245a43664944dec9f99bb01665c7d0dd8ac329d3` |
| `independent-stealth-keccak.log` | `3db79b7044bab24ec9bf2608e3ca4a846f6a34bb842702061c9ea673965142ce` |

Standards: zero open findings. Spec: zero open findings within the offline diagnostic source scope.
