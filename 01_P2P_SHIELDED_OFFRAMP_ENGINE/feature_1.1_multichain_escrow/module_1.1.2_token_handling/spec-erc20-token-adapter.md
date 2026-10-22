# Erc20 token adapter

## 1. Metadata

- **Specification:** spec-erc20-token-adapter
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 2
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Allowlist exact-transfer ERC-20 assets with explicit allowance and balance accounting.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface ERC20Policy { networkId:string; token:string; decimals:number;
 runtimeIdentity:string; transferPolicy:"exact-transfer"; }
interface AllowancePlan {owner:string; spender:string; current:string;
 required:string; approval:"none"|"exact"|"zero-then-exact";}
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Require deployed approved token code and registry decimals; decimals do not determine token legitimacy. Native value MUST be zero. Snapshot escrow balance immediately before transferFrom; SafeERC20 transferFrom then require exact principal delta with checked subtraction. Both no-data and bool-return standard-compatible transfers pass library policy; false/revert fail atomically. No rebasing, transfer fee, arbitrary callback, share-price or dynamically mutable implementation asset is enabled without a separate reviewed adapter. Exact allowance is default; approval is independently journaled, zero-first where approved token requires it, and funding revalidates allowance. No implicit permit support.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Approval rejection changes no custody. Ambiguous approval remains unresolved G12; never issue a second approval automatically. Transfer failure reverts trade creation and nonce consumption. Show revoke instructions for remaining allowance without claiming disconnect revokes it.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Malicious balanceOf/decimals, token upgrades, arbitrary callbacks and cross-trade balance theft require allowlist review plus contract guard; balance deltas alone do not prove honest token behavior. Freezing/blacklisting remains issuer risk and must be disclosed for any such allowlisted token.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Mock false/no return, revert, fee, rebase during transfer, malicious balanceOf, reentrant transfer, zero-first token, duplicate symbols, spoofed decimals, max uint, noncontract and changed code. Fuzz no funded trade exists unless exact receipt; payouts cannot draw another trade balance.

Sources: [ERC-20](https://eips.ethereum.org/EIPS/eip-20), [SafeERC20](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/utils/SafeERC20.sol). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
