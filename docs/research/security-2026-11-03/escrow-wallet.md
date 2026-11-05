# EVM escrow, wallet authority, and recovery assurance

Date: 2026-11-03 (America/Vancouver). Review candidate: PR #26, `94554ecf9854e4604f9f56afe5bebedeee931994`; comparison main: `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa`. The parent review verified all 653 originally selected source blobs against the candidate. This is a static review of that bounded snapshot plus official specifications, not a complete repository audit or a review of later changes. No new tests, native builds, network probes, transactions, or exploit reproductions were executed.

**Recommendation:** finish the narrowly selected peer acceptance profile and the terminal-to-payout recovery presentation before expanding wallet or token support. Preserve the existing production block while governance and qualification evidence remain incomplete. The priorities below concern release assurance; they are not claims of demonstrated exploits.

## Existing controls and limits

The canonical escrow already binds the complete trade digest, consumes seller nonces, restricts early release to the seller, fixes payout destinations, and allows refund only after expiry. Reentrancy protection and terminal-state-before-payout ordering accompany failed-push credits. Recovery already supports `pendingWithdrawals` and `withdraw`; transaction reconciliation preserves unknown broadcasts, checks canonical receipts and prepared transaction identity, and does not automatically resend. These are existing controls, not findings from this pass. [C1] [C2] [C3]

The November 2 domain/EVM audit repaired two asynchronous boundary issues. This pass does not reopen those repairs, the separately owned PR #28 browser/AbortSignal repairs, or the accepted manual-settlement limitation: the contract cannot determine whether fiat was paid. `CURRENT-REMAINDER.md` and `PENDING-DECISIONS.md` already identify the missing production carrier and unresolved trust/commitment decisions. The additional research below specifies what resolving those decisions must establish. [C4] [C5] [C6]

| ID | Consequence if qualification is skipped | Confidence and status | Priority |
| --- | --- | --- | --- |
| EVM-R1 | Terms consent could be presented as stronger peer-identity evidence than the signed data establishes | High confidence in current schema; future-carrier integration requirement | Before production carrier |
| EVM-R2 | A past signature observation could be mistaken for current wallet-policy authorization | High confidence in standards and local-only boundary; proposed profile decision | Before additional wallet profiles |
| EVM-R3 | Terminal escrow state could leave users without a clear view of outstanding payout credit | High confidence in contract, helpers, and candidate presentation; usability/security assurance gap | Before end-to-end release qualification |
| EVM-R4 | Recently retrieved but old or inconsistent chain state could support overconfident payment guidance | High confidence in observed checks; endpoint failure behavior untested | Before production RPC profile |
| EVM-R5 | Token or experimental-contract evidence could be applied outside its actual assumptions | High confidence in source/profile differences; proposed evidence controls | Before token/deployment approval |

## EVM-R1 — Bind the peer identities as deliberately as the economic terms

**Confirmed static observation.** Canonical `TradeTerms` binds order, revision, both wallet addresses, network/deployment, asset/principal, commitments, nonce, and deadlines. It does not explicitly name either messaging public key. The private agreement fields examined also do not establish a wallet-to-messaging-key link. `evm-agreement.ts` verifies local EOA acceptance bundles while marking them `testOnly` and `economicPreparationAllowed:false`. The existing encrypted `terms-accept` message remains a revision acknowledgment. [C1] [C6] [C7]

EIP-712 supplies typed hashing and domain separation, but applications must supply replay policy. An authenticated messaging sender and a verified wallet signature establish two different facts; the production carrier must specify their association. Merely adding unsigned messaging-key fields beside an existing terms signature does not make those fields wallet-authorized. [S1]

**Proposed decision and integration.** In `docs/governance/PENDING-DECISIONS.md`, select one explicit identity-binding construction before changing the carrier: a versioned signed commitment that includes both messaging identities, or a separate wallet-signed peer-binding statement scoped to the exact terms digest, role, both peer identities, and acceptance-profile version. Neither construction is selected by this note. Changing the commitment preimage requires versioning and compatibility evidence; a separate statement requires its own reviewable signing presentation. Keep the canonical contract's off-chain-consent model explicit rather than silently substituting the isolated signature-checking contract. [C6]

**Acceptance conditions.** Publish independent-client fixtures for the same canonical bytes and digest; document how reconnects, messaging-key changes, conflicting acceptances, revision changes, expiry, and replay affect authority. The receiving client's authoritative peer/session mapping must be checked against the wallet-authorized binding before economic preparation. Wire compatibility must preserve the meaning of existing `{revision}` acknowledgments. Integrate at `packages/wallet/src/evm-agreement.ts`, `packages/wallet/src/evm-terms.ts`, and the carrier selected through governance, with the actual signed statement displayed to the user. This is a proposed qualification contract, not a vulnerability demonstrated in a shipped carrier.

## EVM-R2 — Choose wallet authority semantics before broadening signature support

**Confirmed static observation.** `evm-contract-acceptance.ts` already performs bounded EIP-1271 reads, validates the deployment and chain, brackets an anchor, rechecks wallet code, and guards session generations. Its result is explicitly local/test-only. The source itself correctly states that proxy code identity cannot freeze mutable signing policy. This is not a missing-verifier finding. [C8]

ERC-1271 validity may depend on time, state, and signer authorization. EIP-7702 permits an EOA to carry delegation code, so nonempty code is not a complete conventional “EOA versus contract wallet” classification. ERC-6492 additionally introduces simulated deployment or preparation calls into verification. These standards do not justify automatically broadening the existing supported profile. [S2] [S3] [S4]

**Proposed decision.** Define whether an acceptance proves control of an account key, satisfaction of a contract's current signing policy, or a specifically qualified delegated-account policy. Record that profile alongside the digest and observation block. Do not choose a different verifier merely to turn a failed verification into success. Keep unsupported delegated or counterfactual profiles unavailable until their semantics and resource bounds are selected and independently qualified.

For policy-based acceptance, a stored observation is historical evidence. Recheck the required policy before a new economic action under the selected profile; do not treat unchanged bytecode or a prior magic-value result as permanent approval. Conversely, later revocation must not erase the historical agreement or disable already-earned canonical refund/withdrawal exits. Governance must decide the transition rule after an irreversible off-chain payment has begun; signature revocation alone cannot resolve that economic dispute.

**Acceptance conditions.** Specify revalidation points, block/finality policy, code/delegation changes, session invalidation, and revocation behavior in the profile. Keep `economicPreparationAllowed:false` until the real peer carrier, UI, and registry composition enforce it together. Extend evidence at `evm-contract-acceptance.ts`, `evm-adapter.ts`, and `evm-agreement.ts` only for the selected profile. This pass did not test any smart wallet or establish an account-policy bypass.

## EVM-R3 — Expose payout credit separately from terminal escrow state

**Confirmed static observation.** Release/refund may become terminal while a failed push creates credit. `pendingWithdrawals[recipient][asset]` aggregates credit across trades, and `Withdrawn` identifies the recipient/asset/amount rather than a trade. Existing ABI helpers and `scripts/recovery/evm-recovery.mjs` already provide a recovery path. The candidate browser receipt presents escrow outcome and chain fees without an explicit payout-credit state. Its “chain receipt” wording avoids claiming fiat verification, but does not fully explain deferred crypto delivery. [C1] [C2] [C9]

The repository already contains local deferred-payout and recovery scenarios. The Sepolia trade verifier instead rejects `PayoutDeferred` as unexpected, so that happy-path qualification cannot establish a positive deferred-payout wallet experience. This observation concerns the intended evidence scope, not a claim that those tests were executed here. [C10] [C16] [C17] [C18]

**Proposed integration.** Extend the receipt/recovery model used by `apps/web/src/journey/presentation.ts` to distinguish escrow terminal outcome, immediate payout versus deferred credit, and the current recipient/asset aggregate credit at an identified canonical block. Reuse `buildPendingWithdrawals`, `buildWithdraw`, and log decoding from `packages/wallet/src/evm-escrow.ts`. Provide a reviewed browser recovery action or a clear handoff to the existing recovery tool.

**Acceptance conditions.** Demonstrate that a finalized deferred payout remains visibly recoverable across restart and reconciliation, that failed withdrawal preserves the credit, and that a canonical successful withdrawal updates the aggregate balance. Require multi-trade credit accounting: a later aggregate withdrawal must not be labeled a uniquely attributable payout for one trade without additional reconciliation evidence. Keep destination, token, chain, and deployment fixed to the recorded obligation. Review reorg behavior for both terminal and withdrawal receipts without introducing automatic resends.

## EVM-R4 — Separate observation freshness, chain progress, and provider trust

**Confirmed static observation.** `evm-payment-preflight.ts` already expires guidance after 30 seconds using monotonic time. It establishes funding from finalized state, uses separately anchored latest state only to veto or tighten guidance, and requires a 900-second expiry buffer. It brackets numbered state reads with block-header rechecks. Its composition remains local-only and trusts injected registry/RPC services. [C11]

Those controls bound the age and internal consistency of an observation. A newly obtained response from a stalled endpoint can still describe old chain time. The examined checks compare latest against finalized but do not select an independent maximum head-age/progress policy. Repeated consistent answers from one endpoint are not independent chain verification.

**Proposed integration.** Add an explicit endpoint qualification policy to the G15 deployment/network profile: supported finalized semantics, acceptable head lag/stall behavior, reference-clock tolerance, and the conditions that withdraw payment guidance. Select an independent reference if assurance against a consistently incorrect endpoint is required. Do not equate two URLs operated by the same authority with independent evidence.

Where supported, EIP-1898 `blockHash` selectors with `requireCanonical` can pin related state queries to one identified block; retain a documented refusal or separately qualified fallback for unsupported providers. This improves read coherence but does not authenticate a provider or create finality. Preserve current receipt/reorg checks in `packages/domain/src/tx-lifecycle.ts`. [S5]

**Acceptance conditions.** Qualification evidence should cover stalled heads, endpoint disagreement, canonical-anchor changes during reads, unsupported hash selectors, resume after backgrounding, and loss of sufficient expiry margin. Proposed tests must establish a closed guidance gate under uncertain evidence; none of these provider scenarios was reproduced in this pass.

## EVM-R5 — Keep asset and build evidence inside its actual scope

**Confirmed static observation.** Canonical funding checks an exact ERC-20 deposit balance delta; constructor admission requires code and a fixed allowlist. Neither property independently establishes immutable future token behavior. The security notes explicitly exclude problematic token behavior and disclose issuer/freezing assumptions. Browser token checks establish code, allowlisting, decimals, balance, and allowance, rather than proving those policy assumptions for all future token states. [C1] [C12] [C19]

**Proposed asset dossier.** Before G15 admits a concrete token, record its exact chain/address and code identity, relevant proxy/implementation/admin authority, transfer behavior assumptions, and the effect of pause/freeze or upgrades on outstanding obligations. Define who observes changes and how new funding is disabled while old exits and recovery evidence remain discoverable. A policy mismatch must not silently rewrite an existing trade's token or destination.

**Evidence isolation.** Canonical Foundry uses solc 0.8.30, optimizer enabled, `via_ir=false`, Cancun; the isolated package uses solc-js 0.8.38, optimizer enabled, `viaIR=true`, Shanghai. The contracts also differ in signature handling, read tuples, and failed-payout semantics. Passing isolated tests cannot qualify the canonical deployment. Independent review records should bind source commit, compiler/settings, dependency identity, ABI/runtime hashes, registry profile, and scenario scope. A compiler-known-bugs review must evaluate the exact pipeline/settings rather than transfer a disposition from the other package. [C13] [C14] [C20]

The existing formal evidence has explicit native-only assumptions and retained unresolved results. Keep those qualifications visible; this research supplies no new ERC-20 theorem and does not justify another unbounded prover campaign. [C15]

## Review handoff

Resolve R1/R2 as written profile decisions, implement R3 using existing recovery capabilities, and collect R4/R5 evidence against the exact approved deployment and asset set. Keep private payment data and raw peer messages out of public qualification records. Every reported result should name its source commit and distinguish a proposed scenario, a locally executed check, a real-wallet qualification, and independent review. The candidate remains unqualified for production by this note.

## Sources

Repository links are pinned to the reviewed candidate.

[C1]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/contracts/evm/src/BasicEscrow.sol
[C2]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/scripts/recovery/evm-recovery.mjs
[C3]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/domain/src/tx-lifecycle.ts
[C4]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/audit-2026-11-02/domain-evm.md
[C5]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.md
[C6]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/PENDING-DECISIONS.md
[C7]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/evm-agreement.ts
[C8]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/evm-contract-acceptance.ts
[C9]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/journey/presentation.ts
[C10]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/scripts/sepolia/trade.mjs
[C11]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/evm-payment-preflight.ts
[C12]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/contracts/evm/SECURITY-NOTES.md
[C13]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/contracts/evm/foundry.toml
[C14]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/escrow-evm/scripts/compile.mjs
[C15]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/contracts/evm/formal/properties.json
[S1]: https://eips.ethereum.org/EIPS/eip-712
[S2]: https://eips.ethereum.org/EIPS/eip-1271
[S3]: https://eips.ethereum.org/EIPS/eip-7702
[S4]: https://eips.ethereum.org/EIPS/eip-6492
[S5]: https://eips.ethereum.org/EIPS/eip-1898

[C16]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/scripts/test-evm-local-trade.mjs
[C17]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/scripts/test-evm-reconcile-local.mjs
[C18]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/scripts/test-evm-recovery-local.mjs
[C19]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/journey/private-trade.ts
[C20]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/escrow-evm/contracts/BasicEscrow.sol
