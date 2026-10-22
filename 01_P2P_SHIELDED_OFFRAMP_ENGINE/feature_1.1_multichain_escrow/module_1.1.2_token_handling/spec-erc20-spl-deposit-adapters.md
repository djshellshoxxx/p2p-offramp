# EVM/Solana deposit adapter contract

## 1. Metadata

- **Specification:** spec-erc20-spl-deposit-adapters
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 2
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Coordinate asset validation and deposit preparation without hiding native approval or account requirements.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
type DepositPlan =
 | {chain:"evm"; assetKind:"native"|"erc20"; approvalRequired:boolean;
 allowance:string; spender:string; principal:string; prepared:NativePrepared}
 | {chain:"solana"; assetKind:"native"|"spl"; mint:string|null;
 tokenProgram:string|null; source:string; vault:string; rentLamports:string;
 principal:string; prepared:NativePrepared};
quoteDeposit(binding:TradeBinding,amount:string):Promise<CoreResult<DepositPlan>>
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Accept decimal base-unit strings matching ^(0|[1-9][0-9]*)$, then range-check uint256 EVM or u64 Solana; zero is invalid funding. Validate G11 asset identity and exact-transfer policy before querying balance. EVM exact spender allowance and native value use distinct paths; Solana signer/owner/mint/token-program/vault accounts are validated. Quote exposes fee/rent separately and never modifies principal. Serialize approval then funding via G12; refresh funding preflight after allowance finality. No cross-chain movement, float conversion or implicit swap.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Unsupported transfer behavior returns UNSUPPORTED_PROVIDER; insufficient balance/allowance is INVALID_INPUT with edit-input; live asset mismatch INTEGRITY_FAILURE. Quote timeout is a bounded read retry, never a send retry. Wallet/network change invalidates plan.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Token decimals/symbols are unauthenticated display hints unless registry-bound. Wallet approval success is not funded escrow. Rent and gas requirements can change after a quote.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Boundary integers, scientific notation/leading zeros/negative strings, wrong mint/program, fake decimals, approval changed after quote, chain switch, dropped funding, fee token and stale rent. Assert rent/gas never reduce principal and no EVM request crosses Solana interface.

Sources: [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271), [Solidity security](https://docs.soliditylang.org/en/latest/security-considerations.html), [Solana transactions](https://solana.com/docs/core/transactions), [token accounts](https://solana.com/docs/tokens/basics/create-token-account). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
