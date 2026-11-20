# Optional stealth extraction — task date 2026-11-19

## Exact source and allowed scope

- Integration base: `ac9a4b0ffc3ca50a299398e72554e7964a634cd4`.
- Original single-package PR: [#161](https://github.com/djshellshoxxx/p2p-offramp/pull/161), source `1d78c89bb62895878b108e77c8711f2a2c88fe79`.
- Exact extraction checkpoint: `42c5aa9420fa7de76bab9a96178eb19a5b649be5`.
- Reproduced failing regression: `b69f4592b9fffe2bb2831d8e7384a07dd21f50f5`.
- Narrow source repair: `19792ad333a93db6e21cc5147234cc4e22629c5a`.
- Branch: `codex/optional-stealth-20261119`.

The extraction checkpoint recovers the complete package subtree byte for byte. The maintained root test and TypeScript globs already cover it, so no redundant root commands or workflow copies are introduced. D7's canonical accepted-decision index supersedes the original parking decision on November 18 and permits this independent source extraction. Default application wiring retains its separate gate.

Only `src/store.ts` and `test/pages.test.mjs` differ from the original package after the repair below. Dependency pins, native G02 vault implementation, runtime/trust boundaries and default App/Worker composition remain unchanged.

## Behavior and source finding

The package provides two explicitly named offline diagnostic math profiles, strict Announcer log parsing, native viewing-only handles and an encrypted local comparison store. A caller supplies local fixture pages; the package has no RPC client, named live Announcer, wallet support or spending key input/export. Its output remains diagnostic and carries `economicAuthority:false`. The two compared profiles deliberately preserve their different 64-byte and 33-byte shared-point Keccak inputs; this extraction selects no interoperable scheme and authorizes no funds.

The returned-vault failure mapper previously read `result.error.code` directly. Returned accessors therefore executed and inherited wrapper/code properties selected specific outcomes. This is a defensive adapter-boundary defect: the unchanged native G02 vault returns its own fixed data wrappers. The regression does not establish a current imported-data or network exploit.

The regression calls the public encrypted store constructor with an actual native G02 vault and a substituted failing `captureSession` reply. Ten subcases cover wrapper/code accessors, inherited properties, throwing descriptor traps, unknown/non-string values and valid own codes. It asserts zero getter/coercion calls, unchanged encrypted rows/write count, and successful construction after restoring the native adapter. Before repair, six scenarios fail (seven failed results including the parent); both accessor cases explicitly observe one forbidden read. Four subcases already pass.

The repair reads only own data descriptors for `error` and `code` and catches reflection refusal. It preserves the exact previous code mapping, including quota-to-capacity normalization and conservative `COMMIT_UNKNOWN` fallback. Successful results, native lease/durability handling, public math and admission behavior remain unchanged.

## Executed qualification

Node `24.22.3`, npm `11.19.1`, existing pinned repository dependencies copied physically into this isolated checkout.

| Check | Observed result |
|---|---|
| Original package on the current base | 44/44 passed before the regression was added |
| `node --import ./scripts/test-support/register-tsx.mjs --test --test-name-pattern='returned vault diagnostics' packages/stealth/test/pages.test.mjs` before repair | Expected failure: 11 results, 4 passed and 7 failed |
| Same focused command after repair | 11/11 passed; zero failures or skips |
| `node --import ./scripts/test-support/register-tsx.mjs --test packages/stealth/test/*.test.mjs` | 55/55 passed; zero failures or skips, including optional and economic-authority isolation |
| `npm run typecheck` | All four maintained TypeScript projects passed |
| `npm run check:boundaries` | 243 production source files; core entry graph visited 140 modules; passed |
| `node packages/stealth/test/fixtures/verify-native-keccak.mjs /workspace/scratch/6bd6e00af1c0/toolchain/cast` | Three independent byte checks passed with actual pinned Foundry 1.5.1 cast `b0a9dd9` |
| `node apps/web/scripts/build.mjs` | Passed; all 13 emitted files byte-match the generation 2 default artifact; zero stealth modules in document, vault or QR graphs |
| `git diff --check` | Passed |

The independent native oracle checked the two fixture preimages and Announcer event topic:

| Input | Native Keccak-256 |
|---|---|
| Reference profile, 64 bytes | `0x569058e4fc044dda07c8ddccecb8008b2ebb1f7d8062b1a1b57416f263389037` |
| SDK-source comparison profile, 33 bytes | `0x0b3ea9e004b5289e3ac54a9bd15dfd39401349697746970bbe89fc3327c978ff` |
| Announcer event signature | `0x5f0eab8057630ba7676c49b4f21a0231414e79474595be8e4c432fbf6bf0f4e7` |

The probe did not execute the upstream SDK and proves no native deposit, balance, chain canonicality or interoperability. Static import checks alone do not establish runtime isolation.

## Hosted evidence and remaining gate

The original immutable PR #161 head reports ten successful checks; its review endpoint returned no reviews. Its historical browser job is [134707898919](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44277099074/job/134707898919). Historical success does not qualify this new base and repair.

The present environment cannot launch Chromium under its socket policy. No local browser result is claimed. The maintained hosted checks must run on this extraction's exact published head, and independent source review remains a separate pre-merge check. This package has no dedicated browser harness to restore and adds no default feature wiring. Wallet spending, durable viewing-key recovery, live source/reorg policy, network/Announcer identity and a scheme-encoding decision remain outside this offline source slice.

## Reproducible log digests

Execution logs are transient; these commands, counts and SHA-256 digests record the observed runs without claiming qualification of future heads.

| Log | SHA-256 |
|---|---|
| `optional-stealth-errors-red.tap` | `6cb524f8e191725e57afc7c54101d9643bdf4f7a6e7042f006392f281a8e4eb6` |
| `optional-stealth-errors-green.tap` | `5b5df48de6df87fa581d5cf42c4b3e724b7f68f6185e1914d15bb55dffc762e4` |
| `optional-stealth-final.tap` | `748320b775b4a03ffe7befb8076d94cfb75b0c75c8bb20dde23334691996001a` |
| `optional-stealth-final-typecheck.log` | `fcb72ed0da406b29ba721f43edde185dcadfc6559accb55fca89cc9647205d53` |
| `optional-stealth-final-boundaries.log` | `6f4bbf9afc4e6100785e0e38245a43664944dec9f99bb01665c7d0dd8ac329d3` |
| `optional-stealth-native-keccak.log` | `3db79b7044bab24ec9bf2608e3ca4a846f6a34bb842702061c9ea673965142ce` |
| `optional-stealth-build.log` | `7b9390930423662cf709b35c4d5322f509299708e5aa9af026d5521f85108902` |
