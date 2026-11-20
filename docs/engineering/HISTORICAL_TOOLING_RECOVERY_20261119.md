# Historical portal, distribution and governance tooling recovery

Recovery base: `84814328f5534d6fceb2bbe74509fe37c5b48689`.
This source-only extraction adds local public review tools. It does not change
release authority, application providers, maintained keys, deployment records,
workflows, dependencies or repository settings.

## Source provenance and disposition

| Candidate | Immutable source | Disposition |
| --- | --- | --- |
| #44 portal and unsigned distribution | `f8a9aa1430129fd57fd9217402577106bebeca7a` on `claude/loving-einstein-xgzvdy-m0-s08-portal-lab-docs` | Extracted `apps/portal`, `scripts/portal`, `scripts/distribution`, the scriptless browser harness and corresponding docs. Adapted the closed distribution artifact set to the current default client. |
| #156 governance and assurance | `7a60893c4c1ccdf4e66bb1cffc0f38d89ec5e19b` on `nodata/youthful-maxwell-uwy8hx-b4-governance` | Extracted inert validators/checkers, the historical decision and assurance packets, and evidence-refresh regression tests. Fixed status getter execution and inconsistent double reads before integration. |
| #155 provider evaluation intake | `9f03e0e014bd999c266eee944e46e9be002bdcfc` on `nodata/youthful-maxwell-uwy8hx-b4-intake` | Preserved at this separate immutable source. No evaluation dependency project or optional provider is added to the application. Concrete retained failures and missing qualification are listed below. |
| Earlier #154 docs/lab/claims tooling | `3591dcbb84ff7280be3d93a27b5b160066074c06` | Already recovered and repaired by #174 (`030ba10169531dc9a6324d862bb4fad71fbb117b`). Its older tooling and workflow versions are not restored. |

## Recovered behavior and repairs

The portal remains a scriptless source-reference page. It includes exact local
BasicEscrow ABI, Solidity source and canonical recovery instructions, with a
dedicated restrictive response-header recipe. An unset maintained trust pin stays
explicit; no executable recovery bundle or approved deployment is invented.

Distribution staging builds the actual default client and portal twice in
isolated child processes, checks exact byte equality, binds scoped source inputs,
and writes a new local directory only. It retains strict asset roles, bounded
regular-file reads, symlink/FIFO/executable refusals, fixed public copies and
post-write byte verification. All approval flags remain false and independent
builder witnesses remain zero. A retained unsigned manifest checks local
consistency; it cannot authenticate its own distribution.

The earlier artifact set predates the lazy `OfflineRoot` chunk and public QR
decoder. The recovered profile now requires exactly one of each current artifact
role. It also requires the QR graph, pins the exact jsQR dependency source inputs,
and checks that graph against `QR_DECODER_MODULES`. The existing default build
scanner still verifies the decoder pin, attribution and separation from private
runtime authority. Arbitrary JavaScript chunks or new dependency subpaths remain
refused. The fixed wiki copy list now has an accurate source README. The two docs
records were regenerated against the recovery base to bind its current locale
source; empty reviewers, null approved release and unpublished status remain.

The governance schemas preserve exact inert decision/proposal data. A reproduced
defect read `input.status` before exact data validation, executing accessors. A
second regression demonstrated that reading status twice could let a proxy return
different classifications and an inconsistent historical pointer. Validation now
checks the relationship using a single detached record snapshot. Historical
records remain inactive and cannot authorize economic preparation. Historical D3
prose now points to the implementation accepted on 2026-11-18.

All 12 maintained decision/proposal records are historical, with zero pending
records. The assurance manifest retains source commit
`8649b7a1994ec21fe5557179d44e861b746bcda8`: 57 rows, including 12 owned working-tree
rows and 45 immutable-source rows. The check reports 12 later-changed reference
files as stale. Only the owned README hashes changed to label the recovered
observations explicitly; old native/browser receipts were not relabeled as new
execution evidence. No source-commit rebinding or row removal was performed.

## Verification

On Node `24.22.3` and npm `11.19.1`:

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

The focused suite passes 31 tests with no failures or skips. Its actual staging
case builds two complete output directories, each with two independent local
child-process passes; it compares bytes and rejects tampering. Type checking
passes, and static boundary checks cover 228 production files with 140 core entry
modules. The two governance regressions and the current distribution-role test
were observed failing before their fixes.

The preserved browser harnesses require an actual Chromium run. No browser pass,
deployed header verification, physical device qualification, independent builder
witness, signed release or production acceptance is claimed by this recovery.
The consolidation workspace cannot launch its Chromium socket environment; the
hosted browser gate remains required. The integration owner must attach the new
tooling and browser commands to its maintained checks rather than restoring old
workflow files.

## Separate experimental intake

The source-only assessment preserves #155 as a separate evaluation source. Its
recorded upstream versions and audit results describe the original observation,
not a fresh advisory or vendor-support claim.

| Evaluation in #155 | Retained result and concrete integration limit |
| --- | --- |
| `security/intake/relay-transport` | The historical `ws 8.22.1` receiver fixture records 6/6 cases. It supplies no application companion, authenticated route, target policy or browser allocation guarantee. |
| `security/intake/mobile-wallet` | Historical `@walletconnect/utils 2.26.0` helpers record 4/5 cases. The stronger full `wc:` protocol roundtrip expectation remains failing; no connector, session lifecycle, return-origin policy or physical app-switch qualification was selected. |
| `security/intake/waku` | Historical codecs record 13/14 cases. The strict signed-64-bit minimum encoding check remains failing against an independent oracle. The source explicitly does not support complete `sint64` encoding or an application Waku profile. |
| `security/intake/xmtp` | Passive comparison only: the package and source candidate require different WASM snapshots, and the retained lock is not a coherent runtime. No SDK import, Worker/WASM execution, wallet association or lifecycle result was recorded. |
| `scripts/reputation` and `docs/reputation` | The original Semaphore dependency graph remains blocked by retained audit findings. A separately named experimental graph uses five explicit dependency overrides and records 24 historical public Node fixture checks. Its pinned Docker image/artifacts, browser memory budget, issuer/scope/nullifier policy and adoption review remain separate qualification work. |

No Docker CLI is available in this recovery environment. The intake's exact
network-disabled, unprivileged container profile therefore cannot be reproduced
here, and its intentionally failing or passive candidates cannot be promoted to
passing product dependencies. Their scripts, lockfiles, pins and original results
remain available at the immutable #155 source above without weakening tests,
changing the default lockfile, or adding optional provider imports.
