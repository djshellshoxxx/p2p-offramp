# Implementation dependency plan

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M0–M6.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Turn the authoritative DEVELOPMENT_ROADMAP milestone order into explicit implementation prerequisites. Specification expansion is a design baseline; it is not completion of any milestone or permission to use real funds.

## 3. Architecture and data contracts

WorkItem schema: `{id,milestone,specPaths,specDigests,predecessors,owner,reviewer,status,evidenceDigests,blockingFindings}`. Status: proposed → specified → implementing → evidence-ready → independently-reviewed → accepted; blocked is a reason-bearing condition, not an accepted state. A spec change invalidates affected evidence by digest. No custodial-ledger branch database becomes authority for noncustodial escrows. React/TypeScript/Vite and external wallets are the initial core architecture.

## 4. Algorithms and lifecycle

Topologically order mandatory work: M0 G06 provenance → G01 key separation → G02 vault → G03 fresh-key backup restore → G04 content and G05 transport enforcement. M1 consumes M0: static shell, state authority/migrations, wallet/network adapters, transaction journal, optional-module interface and G15 release trust. M2A consumes M1: canonical immutable terms → EVM escrow/token validation → discovery/chat → complete UI and recovery. M2B implements separate Solana/SPL parity with equivalent economic properties. M2C requires both and G24 QA/G25 deployment/G26 incident rehearsals; remove every advanced package and repeat core flow. M3 optional privacy; M4 optional fiat evidence; M5 physical coordination; M6 opt-in arbitration. Later optional modules depend on core extension contracts and their own primitives, not availability of every previous service. A research prototype cannot satisfy a funds-enabled predecessor gate.

## 5. Interfaces and integration

`canStart(item,ledger)` checks accepted mandatory predecessor records and unresolved blocking decisions. `canPromote(milestone)` additionally checks the acceptance matrix and exact source/artifact evidence. Implementation starts in independently reviewable slices with testable interfaces. Unsupported optional capabilities are explicit descriptors and cannot appear as enabled in terms. Parallel work, if performed later, may use frozen contracts but cannot mark integration accepted until combined evidence passes.

## 6. Errors, abuse and residual threats

DEPENDENCY_CYCLE, PREDECESSOR_UNACCEPTED, SPEC_DRIFT and EVIDENCE_MISSING block acceptance. Missing prover/provider must not block basic M2C or result in silent false support. Scope reduction cannot rename M2A “full Phase 2”; Solana parity remains required. Critical/high findings block release; integration failures reopen dependent items.

## 7. Verification and primary references

Validate DAG cycles and orphan dependencies, map each roadmap deliverable to an owner/evidence record, and rehearse invalidation after key/schema/terms changes. Manual review checks semantic completeness rather than counting headings. Required next gates are implementation tests, browser interoperability, chain test-network evidence, independent security review and release rehearsal; none is declared passed here.

Primary references (exact implementation revisions must be pinned in the evidence record): [Vite guide](https://vite.dev/guide/); [Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/). Repository DEVELOPMENT_ROADMAP.md is authoritative for scope/order.
