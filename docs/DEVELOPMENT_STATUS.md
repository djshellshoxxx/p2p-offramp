# Development status and continuation contract

Current source-derived continuation: [incomplete-work inventory](execution/INCOMPLETE-WORK-2026-10-31.md),
[execution prompt](execution/AUTONOMOUS-NEXT-PROMPT-2026-10-31.md) and
[task ledger](../tasks/todo.md). The historical milestone descriptions below do
not reopen tasks already completed in merged `eaa1fe5`.

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

The current static React/Vite shell creates a local encrypted profile after explicit no-reset consent, unlocks, reports locked/unlocked state, locks, lists opaque local profile IDs (bounded at 16 per origin, enforced atomically in the IndexedDB add transaction), explicitly exports unchecked encrypted backup bytes, and restores a backup into a separate fresh-key locked profile. It does not discover offers, trade, sign or send. `ReleaseEnabled=0` and an empty network allowlist remain enforced. Client-side application logic, user-controlled keys and local private data are a normative requirement; see `adr/ADR-CLIENT-SIDE-2026-10-24.md`. The incompatible custodial branch remains excluded. Next ordered work: registry/manifest (G11/G15) and transport/discovery qualification before any trading authority is enabled; see `handoffs/SESSION_STATUS.md`.
