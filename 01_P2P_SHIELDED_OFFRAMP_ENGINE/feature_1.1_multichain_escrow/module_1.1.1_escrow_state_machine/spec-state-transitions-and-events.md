# State transitions and events

- **Repository:** djshellshoxxx/p2p-offramp
- **Section:** 01_P2P_SHIELDED_OFFRAMP_ENGINE
- **Feature:** feature_1.1_multichain_escrow
- **Module:** module_1.1.1_escrow_state_machine
- **Status:** Expanded technical baseline — review required
- **Specification:** spec-state-transitions-and-events.md

## Scope

Define permitted escrow creation, locking, verification, release, timeout, and dispute transitions. Specify authorized actors, events, and balance invariants for each transition.

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

## Normative state machine
UNINITIALIZED -> FUNDED -> RELEASED or REFUNDED. Only bound seller may release before expiry; seller refunds at or after expiry. Terminal states MUST be immutable. Every state-changing call MUST emit exactly one canonical event after successful token transfer; reverted calls emit no persistent events. On-chain state, not relay/chat/UI, is authoritative. Trade ID MUST be domain-separated by chain ID, contract address, version and nonce. Buyer MUST verify amount, token, expiry and recipient before paying fiat. No automatic fiat finality or arbitration path in MVP.

## Engineering and security acceptance
Implement custom InvalidState, Unauthorized, Expired and NotExpired errors. Define event indexing for ID, seller and buyer; avoid emitting private payment instructions. Fuzz arbitrary action sequences for single terminal outcome and conservation of deposits. Test simultaneous refund/release around expiry, duplicate funding, unauthorized calls, reorg rollback, delayed receipts, malicious token callbacks and contract-wallet seller. Preserve receipt reconciliation after browser restart. Independent review required before real funds. See escrow interface and [Solidity security](https://docs.soliditylang.org/en/latest/security-considerations.html).
