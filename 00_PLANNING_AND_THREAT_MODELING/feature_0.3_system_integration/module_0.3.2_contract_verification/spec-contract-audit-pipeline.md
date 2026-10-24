# Contract security review pipeline

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M2A / M2B / M2C.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Define evidence required before any basic escrow deployment can be advertised for real funds. Automated analysis, property tests, formal proofs and independent human review cover different failure classes and are recorded separately.

## 3. Architecture and data contracts

ReviewUnit is `{chain,sourceCommit,compilerVersion,compilerFlags,dependencyLockDigest,artifactDigest,deploymentParameters,interfaceDigest,threatModelDigest,propertySetDigest,reviewReports,findings}`. Separate EVM and Solana units; an EVM audit does not certify a Solana port. Findings contain severity, invariant, reproducer, affected artifacts, owner, fix commit and independent retest. Status: draft → testnet → review → remediation → approved-for-specific-artifact; every bytecode/program change invalidates artifact approval.

## 4. Algorithms and lifecycle

Freeze canonical terms, amount/token policies and the immutable state machine first. Run build reproducibility, compiler warnings, chain-appropriate static analyzers, dependency review, unit/adversarial integration tests, stateful fuzzing and differential accounting checks. Analyze EVM reentrancy/token returns/fee-on-transfer assumptions and Solana signer/owner/PDA/mint/token-program/account substitution independently. Generate invariant evidence from the formal-properties specification. An independent reviewer examines authorization, arithmetic, deadlines, deployment configuration, frontend transaction construction and recovery paths, with findings reproduced by maintainers. Remediation requires regression tests and reviewer retest; no unresolved critical/high finding can be waived into real-funds release. Medium/low acceptance requires named rationale and mitigation.

## 5. Interfaces and integration

`ReviewReport` must disclose scope, exact commit/artifact, methods, excluded components, unresolved risks and date. CI emits tool versions, inputs and report hashes without labeling them an audit. Deployment approval checks on-chain code/program identity, constructor/initialization parameters and absence of hidden release/admin/upgrade powers. Solana authority removal/immutability facts are demonstrated by chain inspection, not a README assertion.

## 6. Errors, abuse and residual threats

ARTIFACT_DRIFT, FINDING_OPEN, TOOL_INCOMPLETE and DEPLOYMENT_MISMATCH block promotion. Tool crash or timeout is not a clean result. Formal assumptions may omit malicious tokens or scheduler behavior; report them explicitly. Privileged ownership, upgrade authority, compiler compromise and wrong deployments remain threats outside narrow source review.

## 7. Verification and primary references

Required negative cases: unauthorized release, buyer refund theft, release/refund double payout, expiry equality, reentrancy/repeated instructions, malformed token accounts, transaction reorder and crash recovery. Re-run relevant evidence after any fix; publish exact final report scope and artifact hash. Independent review and test evidence remain pending, not completed by this baseline.

Primary references (exact implementation revisions must be pinned in the evidence record): [Solidity security considerations](https://docs.soliditylang.org/en/latest/security-considerations.html); [Solana core concepts](https://solana.com/docs/core); [Foundry invariant testing](https://getfoundry.sh/forge/invariant-testing).
