# Circuit public input contract

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M3/M4 optional.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Bind each optional proof to exactly one application statement, trade, chain, verifier and action. Public inputs are not encrypted; exclude bank account numbers, names, raw transcripts and secrets. This contract precedes any circuit implementation.

## 3. Architecture and data contracts

Application envelope: `{v:1,app:"p2p-offramp",statementId,circuitId,circuitVersion,vkHash,chainNamespace,chainReference,deploymentId,tradeId,termsHash,action,policyHash,issuedAt,expiresAt,challenge,claimCommitment,nullifier}`. Hashes and challenge are 32-byte lowercase hex; timestamps are UTC integer seconds encoded as decimal strings; chain and deployment identifiers use the chain registry. No floating-point amounts. A statement-specific schema declares amount/currency/time fields, byte bounds and private witness layout. Nullifier scope and unlinkability analysis are mandatory per statement; a global identity-derived nullifier is prohibited by default.

## 4. Algorithms and lifecycle

Reject unknown/duplicate fields and oversized envelope before canonicalization. Encode RFC 8785 canonical JSON with all amounts and timestamps as validated canonical decimal strings. Compute domain digest SHA-256 over UTF-8 `p2p-offramp/proof-input/v1
` followed by canonical envelope bytes excluding proof bytes. A reviewed circuit adapter must constrain this digest to the full witness-derived statement, not accept it as an unconstrained public label. Field conversion is versioned: each 32-byte digest becomes two big-endian unsigned 128-bit limbs in order, never modulo-reduced. The selected circuit must prove range constraints for limbs and bind all fields; circuit admission records list the exact ordered public vector. Challenge is 32 random bytes from the verifier session, scoped to trade/action, expires in at most 10 minutes and is consumed once after successful acceptance.

## 5. Interfaces and integration

`encodePublicInputs(envelope,statementSchema)` returns canonical bytes, digest and ordered field vector. `verifyBoundProof(proof,envelope,expectedContext)` compares every expected chain/deployment/trade/action/policy field before expensive verification, then checks circuit allowlist and nullifier/challenge state. Proofs are at most 16 MiB and run off the UI thread; tighter statement-specific limits override. Persist accepted claim digest and verifier version, not witness data.

## 6. Errors, abuse and residual threats

PROOF_CONTEXT_MISMATCH, NONCANONICAL_INPUT, PUBLIC_INPUT_RANGE, CHALLENGE_EXPIRED, PROOF_REPLAY and VERIFIER_UNSUPPORTED reject without updating accepted state. Wall-clock expiry is an evidence UI policy, never a chain deadline authority. A proof replayed on another origin/trade/chain cannot satisfy a fresh challenge; exported proof receipts remain publicly linkable. Locally consumed challenges cannot provide global replay protection across independent verifiers.

## 7. Verification and primary references

Golden byte/limb vectors include empty/maximum strings, reordered JSON, Unicode, leading-zero decimal rejection and both 128-bit limbs at bounds. Mutate every public field while retaining the same proof and require rejection. Circuit review must demonstrate no unconstrained public digest or witness field. Concurrent acceptance tests require one local state commit; global uniqueness requires a separately specified on-chain nullifier registry.

Primary references (exact implementation revisions must be pinned in the evidence record): [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785); [Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/).
