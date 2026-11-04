# G24 coverage and resumable acceptance

[g24-coverage.json](g24-coverage.json) reconciles the exact 23 clauses of G24 with
real existing assertion sources and bounded execution receipts. It records all
seven completion specifications and the ten architecture topic references. It is
a documentation inventory, not an `AcceptanceCandidate`, `GateRecord`, test log or
second evaluator. It grants no runtime, signing, deployment or review authority.

`sources` binds exact observed file bytes by repository-relative path, size and
SHA-256. `sourceCommitAtObservation` identifies HEAD at intake, not a claim that
dirty working bytes are committed. A changed source/spec/dependency/recipe or
artifact invalidates affected applicability. Historical receipts retain their
actual profile, recorded source pins and limitations; their presence is not a new
execution, authenticated reviewer identity or transfer to the final source.

The separate fields deliberately answer different questions:

- `evidence` in each case identifies an existing source assertion or a reported
  passing fixture at its receipt scope; a clause's `localEvidence` links those
  receipt IDs. Neither means an entire mandatory target combination passed.
  Exact source assertions are not themselves executions.
- `result` is `not-run` for the complete required row/target at an accepted final
  artifact. Existing native local results are preserved separately. No row is
  silently skipped or counted as a release pass.
- `remainingAcceptance`, `owner` and `nextAction` state the specific work and
  accountable role. Root owns combined regression; chain/device/rail owners own
  their actual missing profiles and target evidence. These role labels appoint
  no human or external reviewer.
- `finalCombinedEvidence` is explicitly pending and root-owned. New optional
  T58/T59/T61 bytes are not bound or represented as final by this inventory.

The schema in `packages/security/src/acceptance-gates.ts` remains authoritative
for the existing tool: `AcceptanceCandidate` binds source, specs and exact
asset/compiler/dependencies/build-recipe identities (and deployment when real);
`GateRecord` adds per-case `pass/fail/unsupported/not-run`, actual target kinds and
environment, report hashes, scoped reviewer, decision and change invalidation.
`TestCase` context required by G24 is retained here for resumption, not invented as
an executable wire format. No dummy artifact/compiler/deployment hash is supplied
to manufacture a candidate for documentation.

After real artifacts exist, use the existing interface:

```sh
npm run acceptance:report -- candidate.json records.json
```

The CLI cannot load a review policy from files/environment. Imported `passed` or
reviewer names are claims; only separately trusted library composition can
authenticate scope. Even a passing local consistency report has
`scopeOnly:true`, `releaseEnabled:false` and `promotionAllowed:false`. Mandatory
Solana, recovery, device or advertised targets cannot be waived as `unsupported`.
An optional unadvertised unavailable capability has different semantics and must
not be used to hide missing mandatory parity. Preserve failures append-only and
link applicable trusted successors instead of deleting the earlier result.

## Resume without repeating work

Root first freezes the combined source/lock/recipe and supplies its final receipt;
review only changed applicability before running affected existing commands. The
matrix lists source assertions and command keys. Reuse `test:exchange:evm`,
`test:evm:local`, `test:evm:reconcile`, `test:recovery:evm`, existing journey/origin,
build/locale/portal/browser harnesses, core boundary checks and the existing G24
evaluator. This documentation change runs none of those native suites. Do not
substitute the isolated escrow profile for canonical BasicEscrow.

Native Anvil accounts, local relay/RPC, synthetic accepted keys and fake fiat are
test fixtures. They establish only their measured serialization/state/cancellation
boundary. Real wallet permission/handoff, external test-network deployments,
distinct-node split views, physical camera/low-memory/assistive technology and
actual host distribution require separate measured target records. Browser-engine
automation is not physical Android/iPhone/iPad evidence. RTL/pseudo/Intl probes
are not reviewed translations or actual 400% zoom/WCAG approval.

Solana native/SPL parity is independent engineering, not a human-approval excuse:
select/implement the actual program/profile/account/token/finality contract,
local-validator native/SPL adapters and recovery, then execute their mandatory
rows. The existing unselected governance packet makes undefined profile choices
visible; it supplies no executable program or acceptance result. External
deployment, signing trust, fee/rail/legal choices, professional review and device
qualification remain exact prerequisites for their own enabled claims, not reasons
to stop unrelated local source work.

After affected rows and independent recovery/incident exercises, complete the
final core-only regression at the exact authenticated signed artifact. Root's
local unsigned regression can advance engineering evidence but cannot satisfy
the signed-artifact gate. Trading stays disabled and default connection origins
remain empty throughout this packet.
