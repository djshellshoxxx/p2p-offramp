# Development status and continuation contract

Updated: 2026-10-22. The specification expansion baseline is complete structurally; product implementation has begun. The application is not complete.

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
