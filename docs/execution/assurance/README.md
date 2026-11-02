# Local assurance evidence packet

This packet advances LEGAL01/02 intake, ATTACK01 traceability and G26 preparation. It grants no legal, release, custody, provider, device or spending authority. It contains public repository paths and synthetic regression references only. No legal assessment, professional review, actual incident, publication, disclosure contact or operational drill was performed for this packet.

`role-facts.json` and `jurisdiction-matrix.json` intentionally contain empty arrays. Repository source can establish properties of the canonical basic escrow, but does not establish who operates a service, receives fees, handles fiat/cash, controls separate deployments or acts in a jurisdiction. Unknown operational facts must not become false booleans in a finalized RoleFactsV1. A future intake needs every LEGAL02 fact, explicit jurisdiction scope and the actual operator's source-backed evidence. Missing jurisdiction or reviewer is unassessed, not an exemption. Named reviewers, official-source URLs/digests and `approved-profile` labels remain claims until independently authenticated; the validator never offers a commercial profile.

The exact LEGAL01 schema has no assessed-role-revision hash field. No binding or canonicalization policy is invented here. `diffRoleFacts` exposes changed fields and invalidates assessment bindings on every new revision, including a revision-only update; it cannot authenticate an assessment against a changed fact revision. An eventual reviewed release-canonicalization composition must bind the exact fact revision. Review windows are checked structurally at no more than 90 days, and packet freshness is an advisory comparison against an explicit supplied UTC time.

## Concrete attack-to-regression mapping

All rows remain `specified`: the mapping identifies real source and an assertion to execute, rather than certifying an entire attack family. `evidence-manifest.json` binds the current bytes of these local files. The focused assurance test checks every path and SHA256; its success proves file integrity for that invocation, not test correctness or that every listed test was executed in this slice.

| Attack | Exact existing assertion / source | Scope and residual limit |
| --- | --- | --- |
| C-01 / C-02 | `BasicEscrow.t.sol`: `test_reentrancy_buyerReentersRefundDuringReleasePush`, `test_reentrancy_sellerReentersReleaseDuringRefundPush`, `test_reentrancy_callbackTokenDuringPayoutBlocked` | Canonical BasicEscrow callback fixtures and terminal state. Distinct isolated escrow ABI is not interchangeable; no proof over every adversarial asset. |
| C-04 / C-05 | `BasicEscrow.t.sol`: `test_fund_rejectsSellerNonceReuseAcrossOrders`, `test_tradeId_isDeploymentAndChainBound`; `evm-terms.test.mjs`: `G16 EVM terms hash binds every field, domain chain and verifying contract` | Exact existing economic-field/domain and nonce assertions. EIP-712 is not replay prevention by itself; live wallet/contract acceptance remains profile-specific. |
| C-06 | `BasicEscrow.t.sol`: `test_fundToken_rejectsFeeOnTransfer`, `test_reentrancy_callbackTokenDuringFundingBlocked` | Admission and balance/callback fixtures. Allowlist/issuer honesty, future token freezing/rebase/proxy changes require evaluated asset profiles. |
| C-13 | `BasicEscrow.t.sol`: `test_refund_atDeadlineByStrangerPaysSellerOnly`, `test_release_rejectsAtDeadline`, terminal/race tests; `BasicEscrowFuzz.t.sol`: `testFuzz_settlementTimeGuards` | Fixed native deadline/recipient and terminal-state boundaries. Halted chains, censorship, fiat reversibility and physical delivery have no wall-clock guarantee. |
| C-17 / C-24 | `evm-payment-preflight.test.mjs` and `evm-submit.test.mjs`; canonical code/genesis/header/receipt checks and reorg/late-read refusals | Local hostile-RPC fixtures and anchored readers. No light-client consensus verification; consistently dishonest providers and transport allocation before decoding remain residual risks. |
| C-23 | `diagnostics.test.mjs`: `known secret strings in every candidate field are refused and getters and foreign errors stay opaque`; `courier/test/secrets.test.mjs` lock/expiry/pending-commit regressions | Allowlisted export and owned borrowed-buffer behavior under synthetic fixtures and actual G02. Same-origin XSS/extensions, screenshots, JavaScript strings and caller/backup copies can still disclose data. |
| C-29 | `apps/web/scripts/artifact-policy.test.mjs`, `scripts/tests/import-boundaries.test.mjs`, lockfile/source graph | Existing build-policy and graph assertions. No supply-chain or professional cryptographic certification; signed release roots and dependency provenance remain separate. |

The matrix is intentionally incomplete. It is not a waiver for C-03, C-07 through C-12, C-14 through C-16, C-18 through C-22, C-25 through C-28, C-30 or additional variants of mapped rows. Some have other repository tests; their coverage requires separate scoped evidence. No headings or test names alone establish mitigation. Native oracle/automated fiat settlement, VRF/provider attestation, physical-custody devices, legal review and professional security review are not qualified by this packet.

## Local checks

```sh
node --import ./scripts/test-support/register-tsx.mjs packages/governance/test/assurance.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node scripts/check-import-boundaries.mjs
```

The first command checks the packet's exact source hashes as well as hostile-input validators and inert projections. If evidence bytes change, review the changed assertions and regenerate the manifest deliberately; do not relabel old results as the new source. Existing regression commands and recovery steps are in the adjacent checklist. No command in this document sends messages, signs transactions or publishes an advisory.
