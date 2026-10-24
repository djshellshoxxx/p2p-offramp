# Proof system selection and admission

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M3 membership / M4 evidence optional.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Choose proof implementations per statement rather than selecting a universal “ZK engine.” No proof system is enabled by this design. Basic escrow has no proof verifier or dependency on proof providers; a valid proof cannot authorize seller release or establish irreversible fiat settlement.

## 3. Architecture and data contracts

Each candidate needs a SelectionRecord: `{id,statementVersion,sourceCommit,license,proofSystem,curve,setupModel,setupArtifactHashes,proverArtifactHash,verifierArtifactHash,supportedTargets,maxWitnessBytes,maxProofBytes,maxJobMs,reviewReports,status}`. Status is proposed, benchmarked, reviewed, admitted, retired or rejected. Exact implementation/version and circuit statement remain mandatory admission fields, not invented placeholders interpreted as support. Membership and bank transcript authentication have separate records and trust assumptions.

## 4. Algorithms and lifecycle

Evaluate candidates against a fixed corpus: valid claims, invalid signatures/transcripts, boundary amounts/timestamps, malformed encodings and resource exhaustion. Measure cold download, initialization, peak memory, median/p95 prove/verify duration and on-chain cost separately on lowest supported mobile hardware. Initial operational ceilings are 16 MiB proof input and 120 seconds worker job; an admission record MUST specify tighter actual bounds where possible. Exceeding a ceiling means unsupported or cancellable failure, never silently sending witnesses to a server. Trusted setup requires ceremony provenance, contribution transcript, verification procedure and compromised-setup consequences. Browser/WASM feasibility and license compatibility are veto criteria.

## 5. Interfaces and integration

`evaluateCandidate(record,corpusDigest,targetMatrix)` emits immutable benchmark evidence. `getProofCapability(statementVersion)` returns supported with exact record digest, or unsupported with reason. Terms bind the admitted verifier/circuit and policy digests. New admission requires security reviewer and product owner approval recorded against source/artifact hashes; an automated benchmark cannot approve cryptographic soundness.

## 6. Errors, abuse and residual threats

Reject candidates with missing setup verification, unsupported browser primitives, unavailable source, unbounded witness allocation, or undocumented trust. PROOF_UNSUPPORTED is normal, not a reason to downgrade to screenshot verification or upload secrets. Risks include unsound circuits, malicious WASM, compromised setup, obsolete dependencies and misleading “trustless” claims. G06 provenance and G05 routing apply to artifact/provider fetches.

## 7. Verification and primary references

Publish reproducible evaluation scripts, hardware/browser versions and corpus hashes. Independently verify proofs and invalid-proof rejection using the pinned verifier. Test provider outage and core-only builds with all prover packages absent. Admission is pending implementation, measured feasibility and independent review; documents alone do not select or certify a system.

Primary references (exact implementation revisions must be pinned in the evidence record): [WebAssembly security](https://webassembly.org/docs/security/); [snarkjs project](https://github.com/iden3/snarkjs); [Semaphore protocol](https://docs.semaphore.pse.dev/).
