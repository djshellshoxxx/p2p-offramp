# Generation11 transport-core qualification — 2026-11-20

## Result and source

The exact PR212 source passed one new full suite: **2311/2311**, with zero failures, skips, cancellations or todos. All **12 serialized qualification commands** passed, including 44 tooling tests, 57 policy tests, four TypeScript configurations and 32 Python specification tests. The runner duration was 103011.796034 ms. The source remained frozen and clean throughout.

Independent worker42 reproduced the original refusal cases (0 passed / 2 failed), verified the identical corrected cases (2/2), and passed 44 maintained affected tests including those two regressions. It found no open High/Medium or actionable integration finding. Its subsequent report supplement checked all 12 author logs, 27 actual output files and 256 graph-module hashes. These are distinct evidence scopes, not additive test totals.

| Identity | Exact value |
| --- | --- |
| Read-before-edit PR200 handoff | `b01aa60a7eb893d0359449f335f1862864eec179` / tree `86c7f44cd323601ffa9817defdbcabb2ed241054` |
| Published generation10 core base | `701f3866e60978c945c5a0148dcda5b65f58fdbc` / tree `976a729bc359d331214924abab617969aa066950` |
| Original test-first predecessor | `56e1ae0fd50c40109aea3f40ce8505e85fc1a5c2` |
| **Frozen, tested PR212 source** | **`540e1fe2660e0a6084600726d5f6f75fd5c1ee05`** |
| **Tested source tree** | **`e54743e3dd8cd7f1c8115d8692974ebe34d67405`** |
| Author branch | `codex/generation11-transport-core-20261120` |
| Author checkout | `/workspace/scratch/6bd6e00af1c0/p2p-offramp-generation11-core` |

The actual chain is corrected212 -> its test-first predecessor -> published701f core. The test-first commit and source-owner history remain intact. This worker made no runtime or test edit and no remote mutation. The companion `generation11-core-plan.json` contains complete source preservation, commands, log digests, artifact maps, environment and independent bindings. Author and independent evidence are appended as report-only descendants; their exact final identities are supplied separately.

## Bounded change and preservation

The complete delta against701f is exactly three paths: `packages/transport/src/http-driver.ts`, the new `http-driver-preflight-zeroization.test.mjs`, and the external author's report. The runtime delta is exactly two existing refusal returns augmented with clearing of the driver's detached body copy. Cancellation and the eight-operation cap keep their existing error results. Caller-owned buffers, admitted operations, pending-slot accounting and the later cleanup path are unchanged.

This is **one Low temporary-copy cleanup cause with two refusal variants**. The independent tests observe real JavaScript byte-array erasure using public input bytes. No network disclosure, financial effect or authority bypass was demonstrated; complete process-memory sanitization is not established. Root owns adding this independently corrected candidate to its ledger after integration. Source composition itself adds no further cause.

All **2,488 unchanged base entries** remain byte/mode/type-identical; the base/source trees contain 2,489 / 2,491 entries. All 37 generation10 component paths are preserved. All 158 existing scripts, six workflows, 65 contract entries, 56 npm commands, the complete npm lock and exact PR209 Cargo lock remain unchanged. The four earlier corrected-core repairs, relay guards, backup lifecycle boundaries, QR timing checks and measured-warmth transport qualification remain intact.

The physical-send counts, durable intent markers, signatures, principal/fee assertions, complete 503/error/teardown checks and both real 1,800-second refund minima are exact. There is no new endpoint, consent or registry authority, signed-update UI, optional default import, release setting or deployment.

The ctutils 0.4.4 version/checksum is preserved, together with the retained crypto-bigint 0.5.5 advisory and maintenance findings. No new Cargo audit, upstream library test, SBPF result, incompatible upgrade or waiver is claimed.

## Actual execution

Execution ran from `2026-11-20T04:46:17.697822+00:00` to `2026-11-20T04:48:54.088032+00:00`. The full suite ran once. Earlier 2,309 and 2,709 results remain attached to their generation10 sources and were not transferred. All retained log byte lengths and SHA-256 values were checked before this report.

| Command | Actual result | Retained log | SHA-256 |
| --- | --- | --- | --- |
| `npm test` | 2311/2311; fail 0, skip 0, cancel 0, todo 0 | `generation11-core-full.log` | `3487749188993e24278195714ac5e9c5279cb4a918f94647db852701ecb2bcb5` |
| `npm run test:tooling` | 44/44; fail 0, skip 0, cancel 0, todo 0 | `generation11-core-tooling.log` | `933f784932834412adc0a77c465a3a925659d9955f7c1412d273d09b0ce7423a` |
| `npm run typecheck` | exit 0 | `generation11-core-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `npm run test:build-policy` | 57/57; fail 0, skip 0, cancel 0, todo 0 | `generation11-core-policy.log` | `fdb9c627c5361d9ff80b0874dfbe4bce71e19f37a79f8f8defa93a2b191a20ce` |
| `npm run check:boundaries` | exit 0 | `generation11-core-boundaries.log` | `a2afff1ba06119367082cb0aec36223a649eae2fcc0580855c50a042cf9f7684` |
| `node apps/web/scripts/build.mjs` | exit 0 | `generation11-core-build.log` | `7ca541327da9491fad262a0850575e4e48b6ad858ff954957e2660deb4822f9b` |
| `node apps/web/scripts/build.mjs demo` | exit 0 | `generation11-core-build-demo.log` | `60457443897be590f2d7cc48cf64339ccf26f72009e2ac7ee20d92ce741cb4a3` |
| `npm run check:docs` | exit 0 | `generation11-core-docs.log` | `daf413a4cebdd09e5376e2b1c01e17243116981faa90927bdb4a9935032f02c4` |
| `npm run check:governance` | exit 0 | `generation11-core-governance.log` | `42f9556636da25ed29969162b2b491dc3b013911d5d1488a709864b931dd7194` |
| `npm run check:specs` | exit 0 | `generation11-core-specs.log` | `25a3cbad6db1d8c778d8964481e666c962f5802d482d42d41ea0945dcd4290b9` |
| `npm run test:specs` | 32 Python tests; OK | `generation11-core-spec-tests.log` | `e22e5f50be28983fdadc402611d43d4b43f54023fed7a558c236bda2943adadb` |
| `git diff --check 701f3866e60978c945c5a0148dcda5b65f58fdbc 540e1fe2660e0a6084600726d5f6f75fd5c1ee05` | exit 0 | `generation11-core-source-whitespace.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

Boundaries checked 238 production files and 142 core modules. Documentation reports engineering consistency true, six claims, semantic approval/publication false and approved release null. The specification inventory covers 173 documents with zero broken links or unindexed specifications. Governance retains 12 historical / 0 pending records, 57 evidence rows and 13 stale references; economic preparation remains false. Stale immutable distribution evidence is preserved.

## Fresh artifacts and environment

The new builds produced 13 default and 14 demo files. All 27 actual file hashes equal the retained generation10 core maps. All 256 graph-module source hashes were checked. Default document/private-Worker/QR counts are 93 / 30 / 4; demo counts 95 / 30 / 4. The changed HTTP driver is absent from all six default/demo graphs. This explains artifact equality; it does not qualify every consumer of the transport library or physical browser behavior.

Every graph has zero optional-package imports. Both variants preserve ReleaseEnabled=0, false release acceptance/signed release/testnet, empty connection origins and CSP `connect-src 'none'`. Only the demo has syntheticDemo=true. The public QR graph retains authority:none, privateRuntime:false and network:false.

The observed tools are Node v24.22.3, npm 11.19.1, Python 3.12.14, pinned Foundry 1.5.1 and solc 0.8.30. Full executable hashes and paths are in the plan. Required Python oracle packages were present. Root authorized an atomic move of the completed generation10 author's matching physical dependency directory into this new checkout after exact-lock, ignored/untracked, clean-source and no-active-source-process checks. No dependency installation, duplicate cache, symlinked dependency root or other-owner cleanup was used. Older dependency graph receipts can resolve their same matching cache at its recorded new physical location.

## Independent binding and continuation

The independent initial source-review commit is `c2d77ffce27253c14f7ebce16aecfb07ec92b0b5`. Its evidence-complete report is `92ba098fe87bb648e49b5e72f9b31ee7dee68804`, tree `27b13a505138fd5485ae8b81190d7b99eb7eb150`, at `docs/engineering/INDEPENDENT_TRANSPORT_PREFLIGHT_REVIEW_GENERATION11_20261120.md`. The final report SHA-256 is `2ae118a3203b6628b370a034882af47277e4859ce94dc313326c02ecfd1f2035`. The initial report remains preserved; the later commit changes only that report. This author's two files and the exact independent report may form the final core checkpoint. Report-only validation will check documentation and whitespace without a duplicate full suite.

Root alone publishes and verifies the remote tree/ancestry and owned-ref lease. Original212, other component heads and PR191–199 refs remain unchanged. The next nine-layer optional preparation must use this final reported core base after its published mapping is verified, run its own new full qualification and compare with fresh builds of that exact base.

Applicable exact-source hosted/browser/native financial/SBPF gates remain separate. No local Chromium or extended native financial harness ran here. Ancestor results do not qualify the new source or a later merge checkout. Optional standalone named-review conditions, retained dependency findings, physical-device/trust inputs and release restrictions remain unwaived. There is no main merge, release, deployment, fund movement or credential/settings change by this worker.
