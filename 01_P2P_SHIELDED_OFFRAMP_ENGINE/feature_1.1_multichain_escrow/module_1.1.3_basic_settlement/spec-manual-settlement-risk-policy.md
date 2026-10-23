# Manual settlement risk policy

- **Specification ID:** G17
- **Section:** 01_P2P_SHIELDED_OFFRAMP_ENGINE
- **Feature:** feature_1.1_multichain_escrow
- **Module:** module_1.1.3_basic_settlement
- **Owner:** p2p-offramp maintainers
- **Version:** 0.1
- **Status:** Scoped requirements outline; detailed Iteration 3 expansion required before implementation
- **Delivery phase:** 2

## Scope

Define the Phase 2 settlement model without fiat proofs or a jury. State precisely which party authorizes release and who receives timeout refunds.

## Required behavior

1. Seller deposits crypto; the funded escrow binds seller and buyer; only seller authorizes release to buyer before the on-chain deadline.
2. At or after the deadline, refund goes only to the seller; release and refund have disjoint guards and terminal status is set before transfer effects.
3. Cash receipt is manually confirmed by the seller; the buyer can lose fiat if the seller withholds release and later refunds, so no trustless cash-settlement or payment-protection claim is allowed.

## Dependencies

- [G16: Signed trade terms](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.8_trade_coordination/module_1.8.1_trade_terms/spec-signed-trade-terms.md)
- [G12: Transaction lifecycle journal](../../../01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.7_transaction_recovery/module_1.7.1_transaction_journal/spec-transaction-lifecycle-journal.md)

## Acceptance evidence

- Boundary-time, double-call, reentrancy, wrong-party, and double-spend tests pass.
- UI shows finality and settlement risk before fiat payment; buyer payment claims never become cryptographic proof.

## Detailed specification completion gate

Before implementation, expand this outline using the seven-section Iteration 3 format in [the development roadmap](../../../DEVELOPMENT_ROADMAP.md#iteration-3-document-standard). Include concrete data contracts, bounded algorithms, interfaces, security mitigations, and executable acceptance cases. This outline is not a claim of completed implementation or security review.

## MVP manual fiat settlement policy
The crypto seller funds escrow; the buyer transfers fiat using independently agreed instructions; only seller can release after verifying receipt before expiry. This is a cooperative exchange, **not trustless fiat settlement**. Bank screenshots, payment messages and zkTLS attestations are evidence only; none proves irrevocable settlement or prevents chargebacks. The buyer can lose fiat if seller refuses to release; the seller can face reversal after releasing crypto. The UI MUST display these asymmetric risks before any fiat payment, distinguish pending/cleared/reversible payment, show exact deadline and avoid misleading guarantees.

## Engineering acceptance
Terms require explicit acknowledgment, supported payment rail, fee/FX display, expiry, buyer/seller roles and evidence-handling consent. Evidence encrypted before transport; minimize bank identifiers; allow selective disclosure. Do not store credentials or expose payment metadata in relay event tags. Provide cancel/refund/dispute guidance and no auto-release based solely on a screenshot. Negative tests: forged receipt, altered amount, wrong beneficiary, replayed payment proof, delayed bank transfer, partial payment, chargeback, seller withholding, expiring escrow and network outage. Jurisdiction/payment-service classification and legal review are blockers to real-money launch.
