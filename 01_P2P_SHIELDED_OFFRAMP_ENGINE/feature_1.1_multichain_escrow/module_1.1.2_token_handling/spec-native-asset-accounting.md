# Native-asset escrow accounting

## 1. Metadata

- **Specification:** spec-native-asset-accounting
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 2
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Account for native principal separately from gas, rent and unsolicited balances on each chain.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface NativeAccounting {fundedPrincipal:string; releasedPrincipal:string;
 refundedPrincipal:string; unsolicitedSurplus:string; rentReserve:string;}
// EVM amounts uint256 wei; Solana u64 lamports. No decimal float storage.
// Invariant per trade: released + refunded <= fundedPrincipal.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

EVM fund requires msg.value == principal; release/refund use guarded checked-effects transfer of exactly principal; on EVM a failed push credits the bound recipient's pending withdrawal (see [escrow contract interface](../module_1.1.1_escrow_state_machine/spec-escrow-contract-interface.md) §4), never another address. No payable fallback creates a trade. Forced ETH does not create liabilities or withdrawable shares. Solana program-owned trade PDA tracks principal independently of rent-exempt reserve; System Program transfer funding validates seller signer, PDA seeds, program ownership and exact lamport delta. Settlement leaves required rent while trade state must persist to prevent replay; account closure is unsupported in v1. Sum outstanding principal cannot exceed available native balance minus reserved rent. No arbitrary surplus sweep in basic v1.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

A failed EVM native push leaves the trade terminal with principal credited to the bound recipient for `withdraw`; it never redirects funds. Low fee balance is distinct from insufficient principal. Incorrect delta or undercollateralized observation blocks funding and returns INTEGRITY_FAILURE. Reconcile rather than infer payout from wallet balance.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Forced donations and rent changes must not mutate principal. Recipient contracts can reject payment; immutable recipient and no redirection limit recovery. Ledger assertions do not prevent externally compromised chain/wallet.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Forced ETH, over/under msg.value, reentrant/reverting recipient, many trades, zero principal, max overflow, substituted Solana PDA/system program, rent shortage and duplicate account initialization. Property-test per-asset outstanding liabilities <= custody minus rent.

Sources: [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271), [Solidity security](https://docs.soliditylang.org/en/latest/security-considerations.html), [Solana transactions](https://solana.com/docs/core/transactions), [token accounts](https://solana.com/docs/tokens/basics/create-token-account). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
