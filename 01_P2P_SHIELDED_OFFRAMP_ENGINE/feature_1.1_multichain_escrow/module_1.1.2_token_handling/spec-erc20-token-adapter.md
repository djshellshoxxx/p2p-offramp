# Erc20 token adapter

- **Repository:** djshellshoxxx/p2p-offramp
- **Section:** 01_P2P_SHIELDED_OFFRAMP_ENGINE
- **Feature:** feature_1.1_multichain_escrow
- **Module:** module_1.1.2_token_handling
- **Status:** Expanded technical baseline — review required
- **Specification:** spec-erc20-token-adapter.md

## Scope

Define allowance, transfer, decimals, and balance-delta handling. Specify explicit policies for fee-on-transfer, rebasing, and callback-enabled assets.

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

## Token compatibility policy
MVP accepts only explicit allowlisted ERC-20 addresses per chain, after validating deployed code and exact decimals metadata; decimals are display-only and not proof of token legitimacy. Prefer pinned OpenZeppelin SafeERC20. Before funding, snapshot balance and require actual received delta equals requested deposit; reject fee-on-transfer, rebasing, ERC-777-like callbacks or other tokens with nonstandard accounting unless separately audited. Reject native-token confusion and unknown chain IDs. Token transfer failures revert atomically. Never use unbounded approvals by default; show exact spender and allowance and provide revoke guidance.

## Test and audit contract
Unit: zero/false/no-return tokens, revert, transfer fees, rebasing balance, reentrant callback, malicious decimals, nonexistent token, duplicate symbols, wrong chain, partial transfer, max uint, dust/rounding. Invariants: each escrow's verified funded balance equals eventual released/refunded amount; no cross-trade balance theft. Static analysis and adversarial mock tokens in Foundry. References: [OpenZeppelin SafeERC20](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/utils/SafeERC20.sol) and [ERC-20](https://eips.ethereum.org/EIPS/eip-20).
