# Local assurance evidence packet

This packet advances LEGAL01/02 intake, ATTACK01 defensive traceability and G26 local preparation. It grants no legal, release, custody, provider, device or spending authority. It contains public repository paths and synthetic regression references only. The separate [local drill records](../drills/README.md) retain thirteen observed offline checks and unchanged historical two-origin evidence. No actual incident, professional assessment, operational incident drill, publication or disclosure contact is claimed.

`role-facts.json` and `jurisdiction-matrix.json` intentionally contain empty arrays. Repository source can establish properties of the canonical basic escrow, but does not establish who operates a service, receives fees, handles fiat/cash, controls separate deployments or acts in a jurisdiction. Unknown operational facts must not become false booleans in a finalized RoleFactsV1. A future intake needs every LEGAL02 fact, explicit jurisdiction scope and the actual operator's source-backed evidence. Missing jurisdiction or reviewer is unassessed, not an exemption. Named reviewers, official-source URLs/digests and `approved-profile` labels remain claims until independently authenticated; the validator never offers a commercial profile.

The exact LEGAL01 schema has no assessed-role-revision hash field. No binding or canonicalization policy is invented here. `diffRoleFacts` exposes changed fields and invalidates assessment bindings on every new revision, including a revision-only update; it cannot authenticate an assessment against a changed fact revision. An eventual reviewed release-canonicalization composition must bind the exact fact revision. Review windows are checked structurally at no more than 90 days, and packet freshness is an advisory comparison against an explicit supplied UTC time.

## Concrete attack-to-regression mapping

All thirty C-01 through C-30 rows are now represented in `attack-cases.json` using
the existing exact AttackCase schema. Every row remains `specified`: a concrete
defensive code/test reference is not certification of an entire attack family.
Each rationale identifies assertion anchors, applicable sub-scope, excluded or
missing capability, residual risk, accountable role and next action. No row is
declared reproduced, mitigated or verified by this source inventory.

The core-only/default artifact still has trading disabled. Applicability refers
to the implemented canonical escrow, client libraries and explicitly bounded local
fixtures, not an enabled deployment. Oracle/swap, upgrade/admin, proof-authorized
fiat release, batch settlement, permits, bridges and advanced privacy each have
distinct absent or unqualified sub-scopes. Those exclusions do not waive related
core ordering, amount, signature, routing, metadata or recovery requirements.

`evidence-manifest.json` binds the exact current bytes of the finite public
reference set (at most64 files), excluding its own self-hash. The existing focused
assurance test checks paths/SHA256 and validates every AttackCase. Its success
proves packet integrity for that invocation, not that every referenced suite ran.
Selected actual local checks and reused receipt identities are recorded separately
under `drills/`; current native aggregate execution belongs to root.

| Attack | Exact existing assertion / source | Scope and residual limit |
| --- | --- | --- |
| C-01 / C-02 | `BasicEscrow.t.sol`: `test_reentrancy_buyerReentersRefundDuringReleasePush`, `test_reentrancy_sellerReentersReleaseDuringRefundPush`, `test_reentrancy_callbackTokenDuringPayoutBlocked` | Canonical BasicEscrow callback fixtures and terminal state. Distinct isolated escrow ABI is not interchangeable; no proof over every adversarial asset. |
| C-04 / C-05 | `BasicEscrow.t.sol`: `test_fund_rejectsSellerNonceReuseAcrossOrders`, `test_tradeId_isDeploymentAndChainBound`; `evm-terms.test.mjs`: `G16 EVM terms hash binds every field, domain chain and verifying contract` | Exact existing economic-field/domain and nonce assertions. EIP-712 is not replay prevention by itself; live wallet/contract acceptance remains profile-specific. |
| C-06 | `BasicEscrow.t.sol`: `test_fundToken_rejectsFeeOnTransfer`, `test_reentrancy_callbackTokenDuringFundingBlocked` | Admission and balance/callback fixtures. Allowlist/issuer honesty, future token freezing/rebase/proxy changes require evaluated asset profiles. |
| C-13 | `BasicEscrow.t.sol`: `test_refund_atDeadlineByStrangerPaysSellerOnly`, `test_release_rejectsAtDeadline`, terminal/race tests; `BasicEscrowFuzz.t.sol`: `testFuzz_settlementTimeGuards` | Fixed native deadline/recipient and terminal-state boundaries. Halted chains, censorship, fiat reversibility and physical delivery have no wall-clock guarantee. |
| C-17 / C-24 | `evm-payment-preflight.test.mjs` and `evm-submit.test.mjs`; canonical code/genesis/header/receipt checks and reorg/late-read refusals | Local hostile-RPC fixtures and anchored readers. No light-client consensus verification; consistently dishonest providers and transport allocation before decoding remain residual risks. |
| C-23 | `diagnostics.test.mjs`: `known secret strings in every candidate field are refused and getters and foreign errors stay opaque`; `courier/test/secrets.test.mjs` lock/expiry/pending-commit regressions | Allowlisted export and owned borrowed-buffer behavior under synthetic fixtures and actual G02. Same-origin XSS/extensions, screenshots, JavaScript strings and caller/backup copies can still disclose data. |
| C-29 | `apps/web/scripts/artifact-policy.test.mjs`, `scripts/tests/import-boundaries.test.mjs`, lockfile/source graph | Existing build-policy and graph assertions. No supply-chain or professional cryptographic certification; signed release roots and dependency provenance remain separate. |

The table above preserves the original bounded examples; the machine-readable
matrix now supplies the remaining twenty rows as well. All thirty remain partial
defensive traceability. Missing native oracle/automatic fiat settlement, actual
independent-provider split-view evidence, qualified physical custody, legal and
professional security review are explicit gaps. No headings, hash equality or
test names alone establish mitigation. Follow each row's next action and the
[G24 acceptance inventory](../acceptance/README.md), keeping actual outcomes and
missing mandatory target combinations separate.

## Local checks

```sh
node --import ./scripts/test-support/register-tsx.mjs packages/governance/test/assurance.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node scripts/check-import-boundaries.mjs
```

The first command checks the packet's exact source hashes as well as hostile-input validators and inert projections. If evidence bytes change, review the changed assertions and regenerate the manifest deliberately; do not relabel old results as the new source. Existing regression commands and recovery steps are in the adjacent checklist. No command in this document sends messages, signs transactions or publishes an advisory.
