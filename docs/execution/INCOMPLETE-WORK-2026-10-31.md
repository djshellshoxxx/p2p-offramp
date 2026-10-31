# Current incomplete-work inventory

Source intake: merged `eaa1fe5`. This is the current continuation index; dated
handoffs and prior test counts remain historical evidence. The execution contract
is [the single prompt](AUTONOMOUS-NEXT-PROMPT-2026-10-31.md); implementation state
is tracked in [the task ledger](../../tasks/todo.md).

The local tasks below are now implemented and independently reviewed; the table
preserves what was missing at intake. [Final evidence](AUTONOMOUS-RESULT-2026-10-31.md)
records 1,028 passing tests. The external/undefined and later milestones remain
incomplete. Verify publication/merge state from the final PR's live metadata.

## Specified implementation that can proceed locally

| ID | Missing behavior at intake | Spec/source evidence | Qualification boundary |
| --- | --- | --- | --- |
| T1 | Signed release locator/CID/archive digest verifier | G15 exact locator contract; release-manifest header excludes locator | Synthetic pinned keys; no bootstrap/install/rotation |
| T2 | Application chat envelope + durable encrypted history/dedup | G20/NIP17 implementation leaves G02 history to caller; application-envelope spec | Text only; authenticated participants; no network/UI sending |
| T3 | Bundled extension registry/lifecycle | G14 exact manifest/interfaces absent | Empty default; no remote code or economic terms mapping |
| T4 | Canonical finalized native payment-guidance adapter | G18; domain preflight is fixture-only; isolated reader has incompatible ABI | Injected registry/local chain; no wallet/send |
| T5 | Local allowlisted diagnostics and Settings export/clear | G26 exact allowlist/limits/interfaces absent; Settings static | Collection requires an authenticated manifest; unsigned default refuses |
| T6 | Offline acceptance-evidence evaluator/report | G24 GateRecord/evaluateGate specified but absent | Imported review names never grant approval |
| T7 | Offline journal-reference inspection/export | G12 recovery/export; current Worker lacks bounded purpose | Unverified scalar references only, never calldata/signatures/authority |
| T8 | Source-derived continuation entrypoints | Old live handoffs describe fixed/missing work incorrectly | Preserve historical receipts and actual test provenance |
| T9 | Registered endpoint URL binding before canonical relay sockets | Final reassessment of G05/G21 and pool header's explicit known limit | No production issuer; explicit fixture destinations; no fallback |

These are implementation tasks, not release acceptance. Root assigns disjoint
writers and independent reviewers in the plan/ledger. Additional discoveries must
be reconciled there before another agent starts work.

## Already complete; reuse

Encrypted vault/CAS/migration, fresh-key backup recovery, restored identity
adoption, profile UI, offline terms review/save/delete, Nostr primitives, bounded
relay and signed terms exchange, both isolated/canonical escrow profiles, durable
transaction lifecycle, actual canonical encrypted exchange/native settlement and
unknown-result recovery are implemented. The previous integrated suite passed
908 tests. See [the consolidated audit](CONSOLIDATED-AUDIT-2026-10-30.md) for exact
coverage and retained limits; that count is not this pass's final verification.

G11 live identity checks already exist for the isolated deployment profile; T4
fills the canonical-profile gap. A second generic wrapper/qualification runner
would duplicate those services or CI and is not a separate task.

## External inputs or missing protocol definitions

- Real registry/release trust fingerprints and authenticated bootstrap; actual
  deployment/asset/endpoint qualification; named professional cryptographic,
  security and wallet/device review; real security contact and operational owner.
- G15 trust-transition/rotation wire schema, nonempty release deployment item
  schema, and selected archive extraction format/parser contract.
- Exact G14 capability-to-G16 policy commitment mapping. A local registry cannot
  invent funded terms or change already funded escrow rights.
- Secret-bearing messaging provider approval before exposing identity authority
  in the default Worker; public EIP-712 digest integration must not silently pull
  the excluded wallet/signing graph into the preview.
- Permanently rejecting recipient liveness is a retained immutable-beneficiary
  limitation, not permission to add a different payout destination.

These block the corresponding authority or interoperability claim. They do not
block the synthetic/offline tasks above. No approval is manufactured here.

## Deliberately later milestones

Solana/SPL parity, opt-in stealth/reputation/proofs, fiat evidence, pools/partial
fills/liquidity, physical coordination/courier/lockers and arbitration remain
separate roadmap milestones with their own pinned profiles, custody contracts and
acceptance matrices. The basic local EVM pass does not complete them. Implementing
their unspecified or unqualified protocols solely to inflate this pass would not
be a verified core feature. The custodial ledger remains archival and excluded.
