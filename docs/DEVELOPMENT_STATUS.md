# Development status and continuation contract

## Latest main checkpoint — November 18, 2026 (after locale merge)

Merged `main@af4835b58146fc970af90790b635ea7c75a724af` now includes [PR #135](https://github.com/djshellshoxxx/p2p-offramp/pull/135), following [consolidation PR #134](https://github.com/djshellshoxxx/p2p-offramp/pull/134). The #135 locale changes set document `lang`/`dir` from the selected compiled bundle and conditionally show a language selector. The production bundle still supplies English only; this merge does **not** establish published translations or browser/device compatibility. The source-pinned `eef9a803` checkpoint below remains a **historical** pre-#135 snapshot, not the current main head.

As checked here, the new ChatGPT test-only [draft PR #149](https://github.com/djshellshoxxx/p2p-offramp/pull/149) at `90b9b85715f1e04522b828ecdbc4858e92a1b88e` adds a synthetic, fresh-key local-backup recovery regression to the static-client worker test suite. Its exact-head CI must be independently checked; neither the proposed test nor the merge implies wallet send, settlement, or authenticated recovery. The separate audit [draft PR #138](https://github.com/djshellshoxxx/p2p-offramp/pull/138) and docs [draft PR #139](https://github.com/djshellshoxxx/p2p-offramp/pull/139) each had **seven successful GitHub Actions jobs** at their previous exact heads (`487aabe` and `9373fe0` respectively), **before** later ledger/docs edits; do not borrow their old results for the new heads.

Active owner [draft PR #140](https://github.com/djshellshoxxx/p2p-offramp/pull/140) proposes Tier C signed release and QR changes, outside this continuation's implementation ownership. Other draft consolidation/optional-package PRs likewise remain separate and unmerged. SonarCloud Security Rating A is still **unverified**, along with D1 peer acceptance, D8 independent owner/security approval, D9 historic send provenance, live bootstrap, and release evidence. `ReleaseEnabled=0`: no production deployment, real funds, live Wiki publication or release is authorized.

## Current consolidation checkpoint — November 18, 2026 (static client only)

At merged `main@eef9a80312e7ac1cb84ff79307e0cdc60d6e1cc9`, [consolidation PR #134](https://github.com/djshellshoxxx/p2p-offramp/pull/134) landed the integration trunk; [PR #61](https://github.com/djshellshoxxx/p2p-offramp/pull/61), [PR #132](https://github.com/djshellshoxxx/p2p-offramp/pull/132) and [Wiki-source PR #68](https://github.com/djshellshoxxx/p2p-offramp/pull/68) now report merged. Earlier ChatGPT handoff/audit PRs #66/#67 are closed and their *final file contents* were carried through #134, rather than every intermediate status-only commit. This is a repository integration event, **not** a public static-site publication, release, owner approval or real-funds readiness.

At the exact pre-merge #134 head `7be1dbef7fe38204db441ffb9c29e6f06acfaecd`, four GitHub Actions workflow families (Vault foundation, EVM escrow, Solana escrow, Specification inventory) returned successful conclusions; the separate Snyk status was successful. The author additionally [reported local checks](https://github.com/djshellshoxxx/p2p-offramp/pull/134#issuecomment-6971473083), which are author-reported evidence, not independently rerun here. The GitHub connector returned **no pull-request-triggered workflow runs** for the new merge commit itself. SonarCloud Security Rating **A is not independently verified** by these results; D1 buyer/seller peer acceptance, D8 release approval, D9 historic record provenance, independently qualified client trust/bootstrap, and all real-funds/release restrictions remain separate gates.

Active [draft PR #135](https://github.com/djshellshoxxx/p2p-offramp/pull/135) (locale selection) and [draft PR #136](https://github.com/djshellshoxxx/p2p-offramp/pull/136) (Lane B handoff) are **not included in this main snapshot**. This ChatGPT lane is restricted by the November 12 owner direction to the static GitHub Pages client; no server, native, CLI, relayer or contract development is authorized here. `ReleaseEnabled=0`; no deployments/publication or real-funds use.

The dated November 16 sections below are historical snapshots of their explicitly named source commits and must not be read as the current PR merge state.

## Development continuation — November 16, 2026

The cumulative development baseline is `claude/confident-fermi-g6wjp3@7461c87`,
which contains the recovery-label fix, canonical runtime-policy reader, and D9
versioned intent migration through PRs #119, #120 and #122. These are development
capabilities; `main@cdde998` and the shipped static client remain separate.
The [current continuation report](consolidation/2026-11-16-canonical-qualification.md)
records fresh local validation, the integrated documentation branch, and remaining
features. The dated snapshot below describes its named main commit, not this newer
development tree. D1 peer acceptance and browser trading are still unfinished.

## Current scope snapshot — 2026-11-16 (static GitHub Pages client only)

At merged `main@cdde998cf1d0e54c6cfb6fe9cdde0fc22a80e10e`, the static client supports encrypted local profile creation/unlock, explicit encrypted-backup export and fresh-key restore, and read-only inspection workflows. The **Offers** page can import and validate a local EVM trade-terms file for read-only review **only when a trusted registry is available**. The default build has **no approved registry**; the explicitly labelled `npm run build:demo` synthetic build supplies local example terms/registry data. This is **not live marketplace discovery, counterparty acceptance, a wallet send or an escrow payment**. Source: [README current state](../README.md), [Offers UI](../apps/web/src/ui/trade/TradePages.tsx), [static service boundary](../apps/web/src/app-services.ts).

**Current implementation scope (owner direction, November 12): static GitHub Pages client only.** Existing server, relay, CLI, native-app and contract versions/branches are retained as historical or test dependencies, **not active implementation work** in this lane. Unmerged integration [PR #61](https://github.com/djshellshoxxx/p2p-offramp/pull/61), independent recovery-label [PR #117](https://github.com/djshellshoxxx/p2p-offramp/pull/117), and stacked [PRs #118](https://github.com/djshellshoxxx/p2p-offramp/pull/118), [#119](https://github.com/djshellshoxxx/p2p-offramp/pull/119) and [#120](https://github.com/djshellshoxxx/p2p-offramp/pull/120) are **not merged into main** as of this snapshot. Their checks and any proposed features are not shipped client capabilities, independent security approval or deployment authorization. SonarCloud Security Rating A and external acceptance remain unverified. `ReleaseEnabled=0`, no real funds, no publication or release without separate approval.

**Historical record:** the milestones and original scoped statements below describe earlier implementation checkpoints; source/current-PR qualification takes precedence for present capability status. Do not interpret old dates, test counts or planning claims as current release qualification.


Current source-derived continuation: [incomplete-work inventory](execution/INCOMPLETE-WORK-2026-10-31.md),
[execution prompt](execution/AUTONOMOUS-NEXT-PROMPT-2026-10-31.md) and
[task ledger](../tasks/todo.md). The historical milestone descriptions below do
not reopen tasks already completed in merged `eaa1fe5` or PR #20 (`b700085`).
Current continuation evidence and fresh whole-source audit are recorded in
[the continuation report](execution/CONTINUATION-RESULT-2026-10-31.md) and
[audit coverage](execution/CONTINUATION-AUDIT-2026-10-31.md).

Current combined-source status and audit: [consolidation report](execution/CONSOLIDATED-AUDIT-2026-10-30.md). All published compatible work is integrated; historical local-only reports below are superseded.


Updated: 2026-10-30 (America/Los_Angeles). The specification expansion baseline is complete structurally; product implementation has begun. The application is not complete. Current continuation scope and verification are tracked in [delivery coordination](handoffs/DELIVERY-2026-10-30.md); earlier implementation history remains in `handoffs/SESSION_STATUS.md` and `HANDOFF-2026-10-24-CLIENT-SHELL.md`.

Latest continuation: [autonomous execution status](execution/EXECUTION-STATUS.md) and
[full first-party code audit](execution/CODE-AUDIT-2026-10-30.md). Local escrow, native chain reads,
journaled wallet execution and bounded offer/transport modules now have real local-EVM integration
evidence. They are excluded from the offline app; trading and release gates remain disabled.
Historical milestone counts below are retained as historical evidence.

## Authoritative scope and branches

`DEVELOPMENT_ROADMAP.md` controls delivery phases: M0 foundation, M1 recoverable static shell,
M2A EVM trade slice, M2B Solana parity, and M2C standalone release. Phases 3–6 add optional
privacy, evidence, physical coordination and dispute extensions. The product-completion document
supplements the roadmap; its earlier P0–P5 shorthand does not override those milestones.
Basic manual trades do not have a juror or automatic fiat receipt oracle. Seller withholding
risk remains explicit. Solana parity remains required for the full requested Phase 2 scope.

- `main` contains the scaffold and phased delivery roadmap.
- `docs/security-spec-expansion-20261021` contains further off-ramp designs, security modules,
  reusable adapter source, and wiki drafts. This pass builds on that branch without discarding it.
- `feat/custodial-ledger-foundation` contains a separate PostgreSQL custodial ledger. It is preserved;
  its internal balances and holds must not become authority for the noncustodial off-ramp.
- `docs/spec-readiness-and-foundations` holds this spec audit and foundation expansion.

## What this pass establishes

An exhaustive filename inventory includes 173 specification documents. The original master catalog
omitted ten of them; those entries are now linked. All 171 technical specs now have substantive seven-section design baselines; the other two
files are the navigation catalog and supplemental product plan. Parallel domain passes expanded
meetup (16), courier (17), arbitration (19), privacy (30), engine (36) and planning (22) specs;
root completed shared foundations/governance and reconciled existing reference designs. All still
require implementation, actual protocol/provider/dependency pins, interoperability evidence and
independent review for enabled production capabilities. Unsupported provider registries remain
explicitly disabled; these gates are not fabricated as passing evidence.

A focused contract review found and fixed four gaps: non-idempotent prepared-only journal CAS
before send, explicit vault-session-bound identity methods, a separate internal migration/reseal
API, and correction of the falsely enforced lifetime nonce budget. The G02 per-handle attempt
cap is 4096; revision does not enforce global multi-tab/restart encryption counts.

`SPEC_READINESS.md` records every specification, declared readiness, numbered-section gaps and
local file link failures. The checker never certifies semantic completion from headings. Bullet, plain-line and table-form status metadata are parsed; that parsing is classification only,
not automatic semantic approval. A design baseline with headings is never labeled audited.

Commands:

```sh
python -m unittest discover -s scripts/tests -v
python scripts/spec_audit.py --check-links
python scripts/spec_audit.py --markdown docs/SPEC_READINESS.md
python scripts/spec_audit.py --check
```

The last command now passes structural expansion checks; it will fail if scaffolds, outlines,
missing sections, catalog omissions or broken local links are reintroduced. The links-only CI check is
not a product-readiness check. Remote source URLs and heading anchors are not automatically
verified by the local link checker. Protocol revisions/provider versions must be pinned and
interoperability checked when the corresponding spec is completed for implementation.

## Remaining work and required order

1. Implement the foundation plan in `docs/superpowers/plans/2026-10-22-vault-foundation.md`.
   Start with strict schema/encoding validation, then native Web Crypto, real IndexedDB sessions,
   fresh-key recovery and the remaining M0 contracts. Keep RED/GREEN and actual test evidence.
2. Reconcile implementation choices against all relevant design contracts. Pin real dependencies,
   protocol revisions, proof artifacts and deployments before enabling each capability. Disabled
   research adapters must remain unsupported until that evidence exists.
3. Continue EVM then Solana trading, core-only recovery and optional extensions to their own gates.
   Audit every enabled module and run independent security review before any real-funds release.
4. Track implementation/test/browser/device evidence separately from specification expansion.
   Structural spec completion is not module implementation or commercial/production approval.

This file must be updated as work advances, including actual check results, unresolved design
questions and module evidence. Never mark the repository complete while the specification audit,
implementation inventory, browser matrix or release gates remain incomplete.

## Implementation evidence

- Task 1 parser/encoding boundary: 22 Node tests pass, including independent base64 encodings, exact profile/length checks, authenticated-format parsing boundaries, canonical snapshot bytes, Unicode, aggregate-size rejection and hostile reflection. Strict TypeScript 7.0.2 passes.
- Task 2 native Web Crypto helper: 15 additional Node tests pass, matching a Python-produced G02 envelope byte-for-byte and covering wrong-password/tamper/inner-format failures, secret-copy cleanup, disposal races and the 4096 attempted-encryption cap. Independent Python fixture verification passes. These helpers do not implement IndexedDB, browser sessions, wallet signing or live trading.
- Compiler is a pinned development-only dependency; core schema code has no runtime package dependencies. Node v24.19.0 is the local test runtime.

The 37-test figure above describes the initial parser/crypto tranche only. The 2026-10-24 client-shell milestone has 273 passing Node tests, 11 specification-tool tests, strict TypeScript checks, 173 structurally checked specifications, three native-browser fixtures, emitted-static-app browser checks, and five artifact/import-policy tests. These are local Chromium/fixture results, not deployed-host, device or independent-audit acceptance. Existing authorized Git credentials now support source work-branch checkpoints; no deployment or signing is authorized.

The current static React/Vite shell creates a local encrypted profile after explicit no-reset consent, unlocks, reports locked/unlocked state, locks, lists opaque local profile IDs (bounded at 16 per origin, enforced atomically in the IndexedDB add transaction), explicitly exports unchecked encrypted backup bytes, and restores a backup into a separate fresh-key locked profile. It does not discover **live** offers, trade, sign or send. The separate, explicitly labelled synthetic `demo` build supports local, read-only Offers trade-terms import and review but never live offers discovery or funds movement. `ReleaseEnabled=0` and an empty network allowlist remain enforced. Client-side application logic, user-controlled keys and local private data are a normative requirement; see `adr/ADR-CLIENT-SIDE-2026-10-24.md`. The incompatible custodial branch remains excluded. Next ordered work: registry/manifest (G11/G15) and transport/discovery qualification before any trading authority is enabled; see `handoffs/SESSION_STATUS.md`.
