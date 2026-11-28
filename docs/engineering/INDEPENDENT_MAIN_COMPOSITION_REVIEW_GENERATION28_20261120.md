# Independent main-target composition review — generation 28

## Decision and exact scope

**No actionable composition or qualification-evidence finding.** The aggregate
preserves every assigned published ancestor and the reviewed source boundaries.
The coordinator's one complete Node suite and five additional commands succeeded
on this exact source. This reviewer independently verified their actual log
bytes, every emitted file, and all six build graphs without repeating the tests.

| Role | Immutable identity |
| --- | --- |
| Reviewed source | `2a0b26f3392d86c1cd3e056771c59438ece92927` |
| Reviewed complete tree | `92beca7b34957889156260d1167df81ebcf4aa84` |
| Frozen PR235 baseline | `bca96b796db18d69563ae5f0395452494a0dacd5` |
| Baseline complete tree | `bfcdf96410df7bbb59996537c8388abaafefbb7c` |
| Assigned main target | `8e836baa877b676a863c877003e277b638fc5061` |

The exact source was checked out in isolated worktree
`p2p-main-composition-review-g28` on
`codex/main-composition-independent-review-g28-20261120`. This review supports
advancing one aggregate candidate to actual main-target hosted qualification.
It does not establish a completed hosted gate. The target above is the assigned
immutable checkpoint; this reviewer performed no fresh remote read or mutation.

## Standards

**Findings: 0.** The complete production delta after PR235 consists of four
admission guards and the G26 explanatory comment in `VaultForms.tsx`. The guards
read existing request refs before input reads, controller replacement, notice
changes, file reads, or facade calls. They introduce no new policy, dependency,
timer, abstraction, or alternate request state. Both regression files follow
the existing maintained-TSX, controlled-hook approach and are byte-identical to
their original RED and GREEN versions. No additional worker or application test
was started by this reviewer.

## Specification and composition

**Findings: 0.** All four assigned checkpoints remain exact ancestors:

| Checkpoint | Preserved commit | Complete tree |
| --- | --- | --- |
| Main | `8e836baa877b676a863c877003e277b638fc5061` | `9693f90d2ef73a06b3557d57ddc2239ae65065f5` |
| PR233 | `92663e46508b06645111d9c713beb82d3a6d1a0f` | `8a75938288a394e8e7b836eba48bf56bcd98a41d` |
| PR234 | `477777dc152cd3148ba7f25a75ce8f00dc1b03b5` | `7a474d82db7668b0ebbff26ae7a9d75d5030db7a` |
| PR235 | `bca96b796db18d69563ae5f0395452494a0dacd5` | `bfcdf96410df7bbb59996537c8388abaafefbb7c` |

All **55** G21, G22–23, and G24–25 publication mapping rows were independently
resolved. Every local and published tree equals its recorded tree, every ordered
parent list matches the actual Git object, and every mapped published commit is
an ancestor. This verifies immutable local objects for the recorded publications.

Of PR235's **2,763 existing entries, 2,762 retain exact mode, type, and object
ID**. No entry is deleted. Only `apps/web/src/ui/VaultForms.tsx` changes. The two
new non-documentation paths are `apps/web/test/unlock-form-admission.test.mjs`
and `apps/web/test/vault-form-admission.test.mjs`. The aggregate preserves
**1,019** other non-documentation entries. Its other additions are G26 evidence.

The full VaultForms file intentionally changes with G27. Preservation was
checked at the correct boundaries:

- Reversing exactly four `busy || request.current !== null` replacements and
  removing the one explanatory comment reconstructs the complete PR235 file
  byte-for-byte. No other production edit is hidden in composition.
- The exact `UnlockForm` function matches accepted G26 source
  `a2a854a285563d4560610577a0df099b041643bf`. Its 3,401 bytes have SHA-256
  `2762e054fca5f438f04bb4bf817b7b664839dc7506994ab60b48eff2111f5f96`.
  This fingerprint excludes the following helper's explanatory comment.
- The full composed form matches G27 author source `0df0e19`; both new tests
  match their original regression/fixed commits and applied coordinator commits.
- `NoticeText`, `useInventory`, `ProfileChoices`, `saveCiphertext`, and
  `takeSecrets` remain byte-identical. The other ten G21 implementation/test
  blobs retain their recorded identities. Semantic notices, locale resolution,
  consent, secret handling, and restore reconciliation retain their prior code.

All privacy reader/policy, facade/runtime/Worker, updater/security, protocol,
schema/storage, EVM/Solana implementation and financial guard entries remain
equal to PR235. Production locale configuration, npm/Cargo locks, the native
updater fixture and command, and every workflow are unchanged. The nine optional
package directories remain absent. No optional PR224–232 or audit PR184–186
source or ownership is incorporated by these deltas; no remote operation was
performed against those scopes.

Dedicated G26/G27 behavioral reviews remain separate evidence. This review
establishes that their named source/test bytes survive composition. It does not
turn controlled event sequences into native DOM reachability or establish new
storage rollback, rate-policy, or financial qualification.

## Actual local qualification

The coordinator ran all six commands on exact `2a0b26f`, beginning at
**18:06:31 UTC** and finishing at **18:08:19 UTC** on November 20, 2026.
Every receipt names the same source/tree and exit zero. The reviewer rehashed
each raw log and checked its length before retaining a lossless gzip copy.

| Command | Directly observed result |
| --- | --- |
| `npm test` with the coordinator's Foundry tool path | **2,505/2,505 passed**, zero failures/skipped/cancelled/todo |
| `npm run typecheck` | Four TypeScript projects passed |
| `npm run test:build-policy` | **58/58 passed**, zero failures/skipped/cancelled/todo |
| `npm run check:boundaries` | **241 production files / 148 core modules** passed |
| `node apps/web/scripts/build.mjs` | **12 assets / 795,725 bytes**, passed |
| `node apps/web/scripts/build.mjs demo` | **13 assets / 807,823 bytes**, passed |

These are directly observed results of the composed-source invocation, not sums
of earlier or overlapping suites. The complete Node log contains 253,936 bytes,
with SHA-256 `dd3c29c48af60a466514b12d2bbc7e4ea45bf4818623e278671dcfd1e802cec1`.
Node reports a duration of 96,383.95962 milliseconds.

No fresh native fixture preparation, tooling, documentation, governance, Python
specification, browser, or financial run is claimed here. Relevant source and
commands remain at the qualified PR235 baseline; applicable current-target
hosted gates remain required. The six G24 native updater scenarios still require
actual hosted execution. Earlier build-only success remains preparation.

## Actual artifacts and authority limits

The reviewer directly rehashed **27 emitted files**: twelve default assets and
their evidence JSON, plus thirteen demo assets and their evidence JSON. Every
asset length/hash matches its emitted evidence; that evidence matches the
coordinator receipt.

| Graph | Default modules | Demo modules | Verification |
| --- | ---: | ---: | --- |
| Document | 95 | 97 | Membership unchanged; only VaultForms source hash changes |
| Vault Worker | 30 | 30 | Graph/module hashes and emitted Worker bytes unchanged |
| QR Worker | 4 | 4 | Graph/module hashes and emitted Worker bytes unchanged |

All **260 recorded module entries across six graphs** were independently hashed
against frozen Git source or actual installed dependency bytes. Shared modules
occur more than once; this is not a count of 260 distinct files.

The actual graphs exclude executable updater modules, the type-only updater
view, all nine optional packages, and the checked Solana/localnet runtime paths.
Both builds retain `ReleaseEnabled=0`, `signedRelease=false`,
`releaseAcceptance=false`, empty connection origins, and CSP `connect-src 'none'`.
Complete emitted content policies equal the prior qualified policies. Document
assets change with the guards; whole-build byte identity is not claimed.

Production trust remains unset, the default updater remains unconfigured, and
production locale support remains English-only/draft. This review supplies no
semantic approval, release activation, origin transition, deployment, physical
device acceptance, or live-funds authority.

## Main-target hosted requirements

There is **no workflow alteration or gate reduction**. Both existing Solana
event path filters include `apps/web/**`, so this UI delta is within their
configured scope. The original 150-minute job and 50-/60-minute validator/browser
limits, both real 1,800-second refund minima, and financial assertions remain.

Before a guarded main integration, verify the final published head, actual
target, proposed merge checkout/tree, and completed applicable logs for:

- Vault foundation, including its browser suite, native updater composition,
  and Firefox/WebKit backup matrix.
- EVM/Foundry/Cast/browser and native Nostr interoperability.
- Solana SBPF, lint, LiteSVM, IDL, validator/refund, and actual Worker browser
  execution under the retained limits.
- Documentation/specification and applicable CodeQL/external status checks.
  Dynamic CodeQL execution cannot be established from tracked workflows alone.

Queued, absent, cancelled, or older component checks are not aggregate passes.
Ancestry and preserved gate definitions do not supply completed current-target
execution. The aggregate handoff must explicitly supersede the older sequential
PR233/234/235 retarget plan while preserving it as dated history. That later
coordination update is outside this frozen source and is not reviewed here.

## Durable evidence and reviewer verification

The [structured review](main-composition-independent-review-generation28.json)
records source identities, findings, reviewer commands, log hashes, artifacts,
and limits. Complete verification outputs and helpers, the coordinator receipt,
and all six raw command logs are retained under
`evidence/main-composition-independent-review-generation28/`.

The source checker passed **119** identity/boundary assertions; the separate
qualification checker passed **362** receipt/artifact assertions. These are
reviewer checks, not additional application tests. The full
`git diff --check 8e836baa877b676a863c877003e277b638fc5061...2a0b26f3392d86c1cd3e056771c59438ece92927`
passed with empty output. Final packaging also checks the complete
main-to-review range.

This commit contains only its report, receipt, and evidence. Subsequent
documentation integration/publication must preserve every tested
non-documentation entry and retain an explicit source/tree mapping. This
reviewer ran no browser, native/financial suite, remote operation, main merge,
release, or deployment.

Standards findings: **0**. Specification/composition findings: **0**.
Current-target hosted completion remains outstanding at this review boundary.
