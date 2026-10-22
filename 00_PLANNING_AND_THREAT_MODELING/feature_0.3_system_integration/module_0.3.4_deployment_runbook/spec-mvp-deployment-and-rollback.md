# G25 deployment, rollback and independent recovery

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M2C.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Deploy a specific reviewed static release and separately verified EVM/Solana escrows; support frontend rollback without pretending immutable funded terms or public artifacts can be rolled back. Testnet deployment precedes independent real-funds release review.

## 3. Architecture and data contracts

DeploymentRecord contains `{releaseManifestDigest,chainId,genesisIdentity,contractOrProgramId,codeDigest,initializationTx,authorityModel,assetAllowlistDigest,rpcPolicyDigest,explorerTemplate,reviewEvidenceDigest}`. Inspect actual chain state for immutable EVM deployment and Solana program authority; no hidden administrative release or late-installed juror. Keep contract/program deployment records separate from frontend release sequence. Recovery package contains ABI/IDL, addresses/code hashes, exact release/refund parameters, chain-time instructions and receipt/journal formats; no wallet private keys.

## 4. Algorithms and lifecycle

Before publication: verify reproducible source/artifact evidence, deploy to selected test network, confirm chain/genesis identity, inspect code and initialization, exercise full release/refund then fund-loss/crash recovery. Promote signed frontend only after G24/G15 gates. On incident, stop promoting unsafe builds and publish a new higher-sequence advisory/recovery release; never overwrite old immutable artifacts. Rollback means a newly signed higher-sequence frontend built from a previously reviewed source, with compatible storage reader and current deployment registry. Storage downgrade is forbidden; incompatible clients offer read-only export. Existing escrow addresses and deadlines stay unchanged. New funding can be disabled in UI advisories but maintainers cannot pause immutable on-chain settlement.

## 5. Interfaces and integration

Runbook actions require operator, UTC timestamp, exact input digests, expected result, independent witness and actual chain evidence. `recoverTrade(receipt)` verifies network/code, reads authoritative escrow, shows bound seller/buyer/asset/deadline, and constructs release or refund through an external wallet. A seller can release only before expiry; anyone can trigger post-expiry refund only to seller. A receipt is a discovery aid, not custody authority. Offer independent CLI/explorer/manual instructions with verified ABI/IDL and privacy disclosure.

## 6. Errors, abuse and residual threats

WRONG_NETWORK, CODE_MISMATCH, SCHEMA_TOO_NEW, RPC_UNAVAILABLE and STATE_UNCERTAIN stop transaction construction until resolved. An unknown broadcast must be reconciled through the journal/chain before retry. Frontend rollback cannot reverse transactions, recover fiat, remove old CIDs or guarantee an untrusted origin serves an honest recovery page. Recovery instructions must remain usable without proof/map/arbitration packages.

## 7. Verification and primary references

Rehearse gateway outage, bad frontend promotion, schema-forward-only state, lost origin, unavailable primary RPC and wallet account change. Execute recovery from downloaded independent bundle on both chain families using test funds. Record measured recovery steps/time, finalized transactions and independent observer results. Release remains blocked until independent security review and all chain-specific gates pass.

Primary references (exact implementation revisions must be pinned in the evidence record): [Vite deployment](https://vite.dev/guide/static-deploy); [Solana program deployment](https://solana.com/docs/programs/deploying); [Ethereum JSON-RPC](https://ethereum.org/en/developers/apis/json-rpc/).
