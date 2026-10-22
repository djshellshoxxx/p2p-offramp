# Basic escrow formal properties

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M2A / M2B.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Specify economic and authorization properties for immutable basic escrow; proofs do not prove fiat receipt, user honesty, browser safety or network liveness. EVM and Solana models must refine the same economic state machine through chain-specific transition rules.

## 3. Architecture and data contracts

Model state per escrow: `{seller,buyer,asset,principal,deadline,termsHash,status}` where status is Unfunded, Funded, Released or Refunded. Participants, asset, principal, deadline and terms hash are immutable after funding. Principal is a positive bounded base-unit integer, never floating point. Allowed assets exclude unsupported transfer behavior. Chain time, not local UI time, selects deadline guards. Fees, if introduced, must be explicit immutable terms and separately conserved; the initial basic model assumes no protocol fee.

## 4. Algorithms and lifecycle

Transitions: fund by seller transfers exactly principal into custody and sets Funded; release requires seller authority and chainTime < deadline and pays the bound buyer; refund requires chainTime >= deadline and pays the seller, with any caller permitted to trigger it. Terminal states cannot transition. Invariants: escrow liability equals principal only while Funded; payouts to buyer+seller never exceed deposited principal; exactly one terminal payout; no participant substitution; no caller-controlled payout destination; external calls cannot observe a still-spendable liability after settlement. Donation balances are not escrow principal. For EVM, model revert atomicity and checks-effects-interactions/reentrancy guards. For Solana, model atomic instructions, signer/owner constraints, PDA derivation and valid token/mint ownership explicitly.

## 5. Interfaces and integration

Each property record is `{id,plainStatement,formalStatement,modelCommit,implementationFunction,assumptions,toolVersion,result,counterexampleDigest}`. Prove safety under arbitrary authorized/unauthorized call ordering and include transition refinement obligations. Liveness is conditional: if valid refund/release can be submitted, funded by gas and eventually included before relevant guards, it can settle. No proof may claim timely inclusion, fiat recovery, or seller cooperation. Token behavior and chain-time assumptions must match the allowlist and deployed chain.

## 6. Errors, abuse and residual threats

PROOF_UNKNOWN, MODEL_IMPLEMENTATION_GAP or COUNTEREXAMPLE_FOUND blocks the affected property gate. Solver timeout is unknown, not proved. Unbounded loops, arithmetic overflow, account aliasing and malicious token hooks must be addressed in the real implementation model or explicitly excluded by enforced validation. Separate program correctness from trusted compiler/runtime assumptions.

## 7. Verification and primary references

Provide executable boundary tests at deadline-1, deadline and deadline+1, adversarial call sequences, randomized amounts, repeated settlements and failed transfers. Review every model assumption against implementation checks; link counterexamples to regression tests. Independent proof/model review and chain-specific deployment validation are required before claiming coverage. Basic escrow always retains explicit dishonest-seller withholding risk.

Primary references (exact implementation revisions must be pinned in the evidence record): [Solidity SMTChecker](https://docs.soliditylang.org/en/latest/smtchecker.html); [Solana transactions](https://solana.com/docs/core/transactions); [Solidity security considerations](https://docs.soliditylang.org/en/latest/security-considerations.html).
