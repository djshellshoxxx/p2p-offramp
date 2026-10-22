# Liquidity vault accounting

## 1. Metadata

- **Specification:** spec-liquidity-vault-accounting
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** Post-MVP optional; independently gated
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Specify an optional single-asset reserve vault without treating pooled funds as basic escrow or enabling a vague NAV/share system.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface VaultAccountingV1 {assetId:string;maker:string;deposited:string;
 available:string;reserved:string;inEscrow:string;withdrawn:string;
 releasedToBuyers:string;version:1;}
// No LP shares, multi-asset NAV, lending or management fees in v1.
// Deposited = available + reserved + inEscrow + withdrawn + releasedToBuyers.
// Actual exact-transfer custody covers available+reserved; inEscrow separately held.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Only maker funds/withdraws its own segregated vault; no pooled third-party share issuance. Deposits exact-transfer only; unsolicited donations tracked surplus and never inflate maker ledger. Reserve moves available->reserved atomically; consume moves reserved->inEscrow by exact approved escrow funding and immutable quote terms. Terminal refund returns inEscrow->available only after verified atomic custody return; release moves inEscrow->releasedToBuyers. Withdraw only available, never reserved or escrow principal. Zero fee, integer arithmetic, no price oracle. All state transitions checked and reentrancy guarded; no discretionary operator drains.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Invariant failure disables new deposit/reserve/consume, preserves safe available withdrawal and chain recovery where proven solvent. Unsupported token/upgrade behavior fails closed. Partial off-chain reconciliation cannot credit refunds or withdrawals. Future pooled share/NAV economics require separate specification and deployment.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Segregated automation still introduces custody and authority risk; maker signing policy and deployment authorities need review. Accounting does not make off-chain market quotes guaranteed. Donation/rounding and double allocations must not create liabilities.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Random deposit/reserve/consume/cancel/release/refund/withdraw sequences; simultaneous reservations; donation; undercollateralization; reentrancy; token freeze; transfer failure; max integer. Assert conservation after every successful operation and no share inflation path.

Sources: [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [EIP-1271](https://eips.ethereum.org/EIPS/eip-1271), [Solidity security](https://docs.soliditylang.org/en/latest/security-considerations.html), [ERC-20](https://eips.ethereum.org/EIPS/eip-20). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Optional vault unavailable until separate contracts/programs, immutable authority, exact atomic basic escrow funding compatibility, legal/role assessment and independent economic/security review. LP share vaults deferred by explicit unsupported scope.
