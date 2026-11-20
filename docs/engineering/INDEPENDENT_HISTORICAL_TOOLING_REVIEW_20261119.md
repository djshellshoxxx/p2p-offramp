# Independent historical tooling extraction review

## Verdict and exact source

**Qualified for the scoped source integration. No blocking defect remains in the reviewed extraction.** This is an independent source and local execution review, not a browser, deployed-host, independent-builder or release approval.

Reviewed source: `880082004eb88a1c4857eb4c7a58128c8d7cd749` on `codex/historical-tooling-recovery-20261119`, based on `84814328f5534d6fceb2bbe74509fe37c5b48689`. Its two extraction commits are `ab19f0ec21f5567b9a3189cc611e6cd3925b744b` and `880082004eb88a1c4857eb4c7a58128c8d7cd749`.

The reviewer worked in a separate physical worktree with its own installed dependencies. Source tests ran at the exact detached source commit. Original-source substitutions used for RED verification were confined to that worktree and restored afterward. This review commit changes documentation only.

The diff has 50 files, 4,141 insertions and three deletions: the scriptless portal, local unsigned distribution, inert governance/assurance validators and evidence tooling, historical packet, supporting documentation and two current docs bindings. It does not alter the application/Worker implementation, maintained release keys, deployment records, dependency lockfile or hosted workflows. The separate #155 provider experiments were not imported.

## Independently inspected boundaries

### Portal and unsigned distribution

The portal's only downloads are the explicit BasicEscrow ABI, Solidity source and canonical recovery instructions. Its closed HTML/attribute grammar, restrictive CSP, exact local href set and CSS restrictions reject executable or external content. The validator is for this authored source template; it is not represented as a general HTML sanitizer. The report retains missing trust, unsigned source, disabled trading and unverified hosted-header state.

Source reads admit explicit files, reject symlink components, use bounded regular-file reads, and compare descriptor identity/size/timestamps around reads. Destination creation is exclusive. An existing output remains untouched. The output verifier checks the exact retained report bytes, file set, lengths and hashes.

Distribution staging uses the existing default client build and scanner, independently builds twice in local child processes, compares evidence and artifact bytes, binds scoped source inputs, and verifies the new output after writing. It rejects unexpected assets/directories, symlinks, nonregular files and executable permissions. Its closed profile requires exactly one index JS/CSS, OfflineRoot chunk, vault Worker and decoder Worker, plus the QR graph. QR source membership uses the maintained `QR_DECODER_MODULES`; only the exact pinned jsQR subpaths are permitted. No general dependency or arbitrary JavaScript allowance was added.

The retained manifest is a local consistency reference. Every approval field is false, independent witnesses remain zero, and the review packet does not manufacture a trust key or executable recovery artifact. A caller-controlled unsigned manifest does not authenticate a distribution; the code and documentation make that limit explicit.

### Governance and assurance

The decision/proposal validators copy exact own-data fields into detached snapshots. The repaired historical classification uses the same snapshot that supplies the returned status. Accessors cannot supply status, and historical status requires the historical pointer while live statuses refuse it. Inactive historical proposals cannot authorize compatibility or economic preparation.

The evidence checker resolves contained paths, opens nonblocking descriptors without following a substituted final symlink, verifies descriptor/name consistency, and enforces document, individual evidence and aggregate byte limits. Imported source files are hashed rather than executed. The tests exercise swapped/growing files, same-length edits and aggregate exhaustion.

Assurance projections validate record structure and claimed review windows while explicitly returning false for legal, custody, release and evidence-integrity authority. Reviewer labels and claimed status are not authenticated by those validators. The maintained empty role/jurisdiction arrays do not invent operational facts.

The evidence manifest preserves historical source `8649b7a1994ec21fe5557179d44e861b746bcda8`: 57 rows, 12 owned working-tree rows and 45 immutable-source rows. All 12 decision/proposal records are historical; none is pending. The check reports 12 changed historical references as stale. The recovered README files explicitly distinguish retained historical observations from current execution. The refresh check rewrites nothing and reports the manifest current under that existing binding.

## Independently executed verification

Runtime: Node `v24.22.3`, npm `11.19.1`. No symlinked dependency root was used.

| Verification | Observed result |
| --- | --- |
| Portal, distribution, governance records/assurance and refresh tests | 31/31 pass; zero failed, skipped or cancelled |
| Distribution test's actual repeated staging | Two complete destinations, each built with two local child-process passes; exact repeated bytes and tamper refusals pass |
| Original #156 `records.ts` against the current records tests | RED: 8 pass, 2 expected failures; status accessor and detached-snapshot regressions |
| Restored reviewed `records.ts` | GREEN: 10/10 pass; zero skipped or cancelled |
| Original #44 `manifest.mjs` against the filtered current distribution-role test | RED: 0 pass, 1 expected failure |
| Restored reviewed `manifest.mjs`, same filtered test | GREEN: 1/1 pass; zero skipped or cancelled |
| `npm run typecheck` | All four TypeScript projects pass |
| `npm run check:boundaries` | Pass: 228 production files, 140 core modules |
| Maintained governance check | 12 checked, 12 historical, zero pending; 57 bound rows; 12 stale references explicitly reported |
| Evidence refresh `--check` | `evidence manifest current`; no writes |
| `git diff --check`, restored worktree status | Pass; clean before this documentation addition |

Commands for the full targeted verification:

```sh
node --import ./scripts/test-support/register-tsx.mjs --test \
  scripts/portal/build.test.mjs scripts/distribution/stage.test.mjs \
  packages/governance/test/records.test.mjs \
  packages/governance/test/assurance.test.mjs \
  scripts/tests/refresh-evidence-manifest.test.mjs
npm run typecheck
npm run check:boundaries
node --import ./scripts/test-support/register-tsx.mjs scripts/governance/check-all.mjs
node scripts/governance/refresh-evidence-manifest.mjs --check
```

The RED records source was exactly `7a60893c4c1ccdf4e66bb1cffc0f38d89ec5e19b:packages/governance/src/records.ts`; the RED manifest source was exactly `f8a9aa1430129fd57fd9217402577106bebeca7a:scripts/distribution/manifest.mjs`. The latter used `--test-name-pattern='the default distribution requires'`. Only the indicated implementation file was substituted for each comparison; all replacements were restored to reviewed source before the next run.

## Evidence digests

Execution logs reside in the coordinating workspace's `verification` directory. Their digests retain the exact observed outputs; they do not qualify a later source commit.

| Log | SHA-256 |
| --- | --- |
| `historical-independent-targeted.tap` | `43f7d54e341b3accd9bf133cb5a9db56fc61bda19d8d132632af1d5a0d5f9851` |
| `historical-independent-governance-red.tap` | `40fdae65290aed2982855312df3c40ca9716832b15a56af7cf37f1206f40c8ff` |
| `historical-independent-governance-green.tap` | `3769f2c3d98a7cbf34c1967cb3d82b7e3b4127f057ba2c37610e9ecc1f590634` |
| `historical-independent-distribution-red.tap` | `1185e3444ee9a3273163437e11f55fffc83f17efdff0eeadc6ee0b93f1bb7aca` |
| `historical-independent-distribution-green.tap` | `da7215d960dd55753efd54b2751775c4c39eeb3ec6278a342796c2d86c1817ad` |
| `historical-independent-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `historical-independent-boundaries.log` | `d1a048ee08fb1b83af20b94d47e2b5af27b4fa84ddd02b969e7fa6878011649e` |
| `historical-independent-governance.log` | `9c5ee6d3de8735827973c9c04938ab1a1a64756e410c223b80f23573754a5831` |
| `historical-independent-evidence.log` | `4f2b268b4ad56fd4d37de322fc5513127c1f6c9805199197ec09e0a5292c3137` |

## Integration and qualification limits

The integration owner should run the combined-source checks and attach the recovered commands to maintained tooling without restoring obsolete workflows. The preserved browser harnesses still need actual Chromium evidence on the integrated source. This review did not execute them or refresh any historical browser receipt. Deployed headers, physical devices, independent builder witnesses, signed release acceptance and the separate experimental provider intake remain outside this approval.
