# Transaction ordering and reorganization threat model

## 1. Metadata

- **Specification ID:** TH06
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 0
- **Reviewed source baseline:** docs/security-spec-expansion-20261021
- **Normative language:** MUST is a release gate; SHOULD deviations require a recorded reason.

## 2. Objective

Model visible mempools, adversarial ordering, replacement, delayed inclusion and reorganizations for supported chain adapters. A UI button order is not a transaction ordering guarantee. The escrow contract must enforce immutable binding and deadline invariants independently of the client.

## 3. Architecture and observation matrix

| Condition | Required outcome |
|---|---|
| Release executes before deadline by authorized seller | One release to immutable buyer |
| Release executes at/after deadline | Contract rejects release |
| Refund executes at/after deadline | One refund to immutable seller |
| Release/refund race | At most one terminal transfer; contract state decides |
| Broadcast response missing | Journal remains uncertain; reconcile original hash/nonce/signature |
| Confirmed receipt removed by reorg | Roll back observed state and disable economic progression |
| Replayed command on another deployment/network | Reject binding mismatch |

Client preflight is advisory. Chain execution evaluates actual contract time/state; local clocks and stale block observations cannot authorize settlement.

## 4. Required algorithms and invariants

Persist prepared economic intent and transaction identity before reporting broadcast status. Never blindly resend after a timeout. Reconcile replacement/expiry semantics using the chain-specific journal contract and registry finality settings. On network/account change retain the old intent under its original binding, cancel fresh preparation and require new consent. Wait for configured funding finality before presenting payment instructions as actionable. A reorg can still invalidate an earlier observation; notify the trader and stop automatic progression. Solana blockhash expiry and EVM nonce replacement are separate algorithms, not one shared retry implementation. Do not implement private mempool promises or transaction bundling as a hidden prerequisite.

No new cryptographic primitive or ZK circuit is defined in this threat model.

## 5. Interfaces and failure recovery

The journal identifies `(chain, networkId, deploymentId, tradeId, account, clientIntentId)` plus chain-specific submitted hash/nonce or signature/blockhash validity. Its public projection has explicit `prepared`, `broadcast-unknown`, `pending`, `confirmed`, `finalized`, `failed`, `reorged`, `expired` states; these are observations, not stored money balances. A refreshed on-chain escrow state overrides stale local/relay statuses. Typed errors distinguish rejected preparation from uncertain broadcast. Exact serialization and retry methods remain owned by the transaction-journaling spec.

## 6. Threat assessment

Front-running may copy publicly visible data or reorder a deadline race. Bind seller, buyer, asset, amount, chain/deployment and terms commitment in escrow state, reject mutable recipients and enforce authorization on every transition. Miner/validator discretion near deadlines and chain liveness remain risks. A successful simulation is not inclusion or finality. Private routing does not make chain transaction contents secret or guarantee ordering.

## 7. Verification and references

Simulate reversed release/refund order, exact deadline equality, block timestamp changes, duplicate calls, nonce replacements, disappearing receipts and reorged funding. Assert one terminal transfer and no double credit. Simulate provider success followed by missing transaction and provider timeout after accepted broadcast; neither may cause a fresh economic submission without reconciliation. Run separate EVM and Solana transaction-lifecycle fixtures before claiming parity.

Normative project dependency: [development roadmap](../../../DEVELOPMENT_ROADMAP.md). See G01–G06 for key, vault, backup, content, transport and dependency enforcement. Threat models define required properties; passing fixtures is not a whole-product security certification.
