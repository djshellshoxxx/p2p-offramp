# Independent review of generation 2 integration

## Verdict and source identity

**No blocking composition or security finding was identified in the reviewed source.**
The combined source qualifies for continued exact-head hosted verification. One
current-policy documentation correction was reported to the coordinator; it does
not require a runtime change. This review does not establish a browser, physical
device, deployed-host or release qualification.

| Identity | Exact value |
| --- | --- |
| Reviewed source | `4689ee4e15950f3c50084c74ec5509eb909607bb` |
| Reviewed tree | `f3ee86ab68eb60e4ab516037c58c9c498fc30ff4` |
| Comparison base | `a728ce290eb2fcbe9b4a9e857cc84ced401da70f` |
| Delta | 75 files; 6,719 insertions and 10 deletions |

The fresh successor read the persisted handoff, machine state, extraction reports
and independent module reviews before creating its own worktree. The review
focused on composition after those individually reviewed changes were combined.
The coordinator's full test/build run was not repeated or reported as this
reviewer's execution. Only this report was added to the review branch.

## Source preservation and authority boundaries

Six scoped comparisons against the reviewed component heads produced no source
differences:

| Component | Preserved source |
| --- | --- |
| Internal asset-update source and its tests | `8a496b020e60dcb5fbcddb267f20d2d548b6e5fa` |
| Portal, distribution, governance, historical packets and wiki bindings | `880082004eb88a1c4857eb4c7a58128c8d7cd749` |
| Personalization package, including diagnostic repair | `c639b949f5e3862e1960cfb703526cccd5d833e7` |
| Three QR fixture/oracle files | `9611d6a5cb404fed5d41eeb176dafb31c01de640` |
| Package scripts and additive workflow wiring | `2db79a7` |
| Dated audit-ledger additions | `06c6b9ab3728fcf743b2c003dd69b0310078b0ad` |

The combined delta does not change any application or Worker implementation,
application build policy, contract source, dependency lockfile, schema, domain or
storage source. The maintained security facade and release-context entry are also
unchanged. Package metadata outside `scripts`, including every dependency and
version, compares equal to the base. No integration conflict has silently changed
the reviewed component implementations.

The updater and its untrusted parser helpers remain absent from
`packages/security/index.ts`. The two helpers added inside existing private
modules call the existing bounded parsers only; they do not create registered
release proofs or add a trust decision. Source searches found no application
reference to release-update, personalization, governance or those helpers. The
personalization and governance package indexes expose their local APIs, but no
application/Worker composition imports them. Recovery of these libraries does
not enable an update screen, favorites editor or template editor.

The independent AST boundary run inspected 234 production files while the core
entry traversal remained at 140 modules. This is structural evidence, not a claim
to have executed a browser or independently inspected every emitted bundle.

## CI and QR fixture integration

All 49 existing npm commands are preserved. The existing tooling command retains
its original prefix and appends the three recovered suites. The three new commands
are portal browser qualification, distribution browser qualification and the
governance checker. Governance package tests also fall under the unchanged
`packages/*/test/*.test.mjs` full-suite glob.

The only workflow changed is `vault-foundation.yml`. Every one of its 116 original
lines remains in order. The additions retain existing job names, commands and
`contents: read` permissions; no failure suppression or release action is added.
Both new browser commands resolve to the recovered local harnesses and receive
the existing `P2P_CHROMIUM` path. Full checkout history is necessary because
distribution invokes documentation verification against an immutable source
commit. The docs-tooling job already fetches that history; its new governance
command invokes evidence refresh with `--check` and cannot rewrite the manifest.

The QR repair changes external fixture/oracle code only. Every synthetic stream
owns its actual canvas track and frame producer; the producer terminates after
the application ends that track. Preview diagnostics retain the original wait.
The explicit unlock/lock journey permits only empty, versioned `activity`
messages emitted during a trusted `keydown` or `pointerdown` dispatch. The
existing AppRuntime handler posts that control synchronously. The oracle checks
the exact message fields, trusted active event, sequence values, operation order
and count; other private operations, extra payloads, asynchronous reuse and
untrusted input remain failures. Network, storage, CSP, Worker and ended-track
assertions remain. The independent oracle unit run passed all three tests.

## Historical evidence and current-policy correction

The historical assurance source remains
`8649b7a1994ec21fe5557179d44e861b746bcda8`. Independent current execution reported
12 historical records, zero pending records and 57 evidence rows: 12 owned rows
and 45 immutable-source rows. Thirteen current reference files are explicitly
stale. The owned hashes match and the refresh check writes nothing. The recovered
README introductions label their receipts as historical; neither those receipts
nor the dated read-only audit ledger are new test executions or current source
authority. The higher stale count than the isolated extraction's 12 is reported
as observed, not hidden by rebinding old evidence.

**Documentation finding:** the personalization extraction report cites original
D7 Option 2 and describes the nine optional packages as parked. The canonical
[accepted-decision index](../adr/ACCEPTED-DECISIONS-2026-11-04.md) explicitly
records that this parking decision was superseded on 2026-11-18 by the owner's
accepted [consolidation gameplan](../consolidation/2026-11-18-branch-consolidation-gameplan.md).
Those packages are accepted for separate, one-package-per-PR extraction with an
import-boundary check; default application wiring still requires its own gate.
The coordinator and rediscovery successor were notified to correct the current
queue wording and assess those isolated candidates. This is not authorization
to bypass their tests, independent review or application-composition gates.

## D8 classification

The combined source contains genuine Tier C release-verification/recovery work,
including `packages/security/**`; generation 1 likewise contains Tier C recovery
and terms-boundary changes. The accepted [D8 packet](../adr/proposed/D8-merge-policy-and-branch-protection.md)
lists Tier C conditions as passing required checks and explicit owner approval.
It does not state that Tier C inherits Tier B's named CodeRabbit/Qodo condition.
The canonical index's 2026-11-18 Tier C approval records exact-head green CI and
independent review with no open High or Medium finding.

The current maximum-consolidation directive explicitly authorizes autonomous
source integration and eligible merges. Preserve its provenance in the PR and
handoff; old requests to seek source permission again do not cancel that newer
authorization. This review does not waive validation. In particular, absent
named-bot review is not, by itself, an established additional D8 blocker for these
Tier C combined PRs. Do not generalize that conclusion to a standalone Tier B PR
or to any additional observed server-enforced gate. All applicable exact-head
checks, including native financial/browser qualifications, remain necessary.
This report is an independent native-worker review and does not claim to be a
CodeRabbit or Qodo pass.

## Independently executed checks

Node `v24.22.3`, npm `11.19.1`; a physical worktree received its own successful
`npm ci --ignore-scripts --offline` installation. No dependency symlink was used.

| Check | Result |
| --- | --- |
| Six component comparisons against the source heads above | Exact matches |
| Protected-path and dependency/metadata comparison | No changes |
| Existing npm/workflow command preservation checks | Passed; 49 commands and 116 original workflow lines preserved |
| `node scripts/check-import-boundaries.mjs` | Passed: 234 production files, 140 core modules |
| `npm run check:governance` | Passed: 12 historical, zero pending, 57 rows, 13 stale references; manifest current |
| `node --test apps/web/test/qr-browser-oracle.test.mjs` | 3/3 passed; no failures, cancellations or skips |
| `git diff --check` across the reviewed delta | Passed |

The coordinating workspace retains the execution logs below. Their hashes bind
these observed outputs to this review, not to a later source head.

| Log | SHA-256 |
| --- | --- |
| `generation2-independent-install.log` | `5a71a3d47d6a3aaf767c7869a37554b842cd83214f5df9fe1dabe8c5c9da07f1` |
| `generation2-independent-boundaries.log` | `a99ab96edd08bfb4b42d6e7d9800948c746d480084b04e4d3970133a48fd0015` |
| `generation2-independent-governance.log` | `42f9556636da25ed29969162b2b491dc3b013911d5d1488a709864b931dd7194` |
| `generation2-independent-qr-oracle.tap` | `405886cb2a63fd3ddb0f9c1888a8a46d3e2e528aca1f4a80fcdd2bf006f9409c` |

No browser launch, validator execution, main merge, remote write, deployment,
release, credential change or repository-setting change was performed by this
reviewer. The coordinator owns combined-source results and live hosted gates.
