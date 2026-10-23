# Escrow timeout and refunds

- **Repository:** djshellshoxxx/p2p-offramp
- **Section:** 01_P2P_SHIELDED_OFFRAMP_ENGINE
- **Feature:** feature_1.1_multichain_escrow
- **Module:** module_1.1.1_escrow_state_machine
- **Status:** Expanded technical baseline — review required
- **Specification:** spec-escrow-timeout-and-refunds.md

## Scope

Define funding, evidence, dispute, and refund deadlines. Specify permissionless timeout execution and mutually exclusive terminal outcomes.

## Iteration 3 Completion Checklist

- Define boundaries, dependencies, and explicit non-goals.
- Specify normative requirements using MUST, SHOULD, and MAY.
- Define applicable schemas, interfaces, errors, and versioning.
- Describe state transitions, invariants, and failure recovery.
- Assess adversaries, trust assumptions, privacy leakage, and mitigations.
- Separate verified cryptographic facts from external assertions.
- Cite authoritative sources and pin evaluated protocol versions.
- Define acceptance criteria, negative tests, and interoperability tests.
- Record unresolved decisions, feasibility limits, and deployment blockers.

## Timeout and refund algorithm
Expiry is an absolute Unix timestamp in signed trade terms; bound allowed interval at funding. Release permitted strictly before expiry; refund permitted at/after expiry. The seller may invoke refund; no third-party fee extraction or privileged drain. UI MUST show block-time uncertainty, estimated transaction fees and finality threshold. At expiry boundary, refund takes priority by mutually exclusive conditions. Fiat already sent is not automatically recoverable: show buyer-specific risk disclosure and a safe dispute/documentation path outside the basic escrow. Never auto-refund based on browser clock.

## Security and tests
Test expiry minus one, expiry exact, expiry plus one; timestamp manipulation within consensus limits, mempool race, token transfer failure, seller contract wallet, RPC inconsistency, reorg and idempotent retry. Escrow balance conservation and terminal-state invariants are mandatory. No extension module can retroactively change existing refund rights. Recovery documentation MUST cover chain outage and expired escrow when seller loses keys. [EIP-712](https://eips.ethereum.org/EIPS/eip-712).
