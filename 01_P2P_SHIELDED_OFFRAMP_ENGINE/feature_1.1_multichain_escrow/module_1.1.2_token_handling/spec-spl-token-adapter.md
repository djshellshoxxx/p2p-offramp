# Solana SPL escrow adapter

## 1. Metadata

- **Specification:** spec-spl-token-adapter
- **Version:** 1.0
- **Owner:** p2p-offramp maintainers
- **Status:** Expanded design baseline — implementation and independent review pending
- **Delivery phase:** 2
- **Normative language:** MUST is a release gate; SHOULD deviations need a recorded reason.

## 2. Objective and boundaries

Specify Solana token custody with native account constraints rather than EVM transfer assumptions.

This contract uses CTX01 `TradeBinding`, CTX02 observations, G08 authority, G10 wallet sessions, G11 approved registry and G12 transaction intents. `CoreResult`/error codes follow G13. Native transactions/signatures retain their chain formats; local or relay observations never establish custody or fiat receipt.

## 3. Architecture and data contracts

```typescript
interface SPLDeposit {programId:string; tokenProgram:string; mint:string;
 seller:string; buyer:string; sellerTokenAccount:string; vaultPda:string;
 vaultTokenAccount:string; buyerTokenAccount:string; amount:string; decimals:number;}
// v1 supports reviewed original SPL Token program only.
// Token-2022 and every extension remain unsupported until separate policy.
```

Types containing native ABI/IDL declarations describe that chain interface, not a shared executable TypeScript module. Public strings/keys must use the selected chain/protocol canonical encoding; unknown fields and incompatible versions fail closed.

## 4. Algorithms and invariants

Derive trade PDA from fixed versioned seeds, seller public key, nonce and terms hash under approved escrow program; validate bump/program owner/discriminator and initialization exactly once. Validate actual token program ownership of mint and token accounts, mint equality, seller authority/signature, vault authority PDA and destination owner buyer (refund owner seller). Use transfer_checked with registry/mint decimal agreement and u64 exact amount, then verify balance delta. Validate every CPI executable program, sysvar and writable/signer flag. Reject delegated authority paths, frozen/uninitialized accounts and unsupported extensions. No caller-selected substitute beneficiary or arbitrary CPI.

All externally supplied records require exact schema/version validation and byte/count caps before cryptographic work. Decimal money is never a JavaScript float; strings are parsed to bounded integers and overflow is rejected. G13 read retries are bounded; economic commands have zero automatic resubmission.

## 5. Interfaces, errors and recovery

Missing destination ATA may be created in the same approved transaction after derivation check with separately shown rent; creating it changes no principal. Failed CPI rolls back state. Close/reassign vault is unsupported until terminal replay protection is retained. Wallet blockhash expiry is G12 uncertainty reconciliation.

Boundary failures map to fixed G13 errors; raw provider exceptions, signed payloads, credentials and witness material MUST NOT enter diagnostics. Cancellation stops owned work and rejects late generation outputs, but cannot retract already transmitted data or transactions. Existing funded trade recovery retains its original deployment and authority.

## 6. Security and privacy assessment

Account substitution, fake token programs, unauthorized PDA signing, mutable authorities and mint freeze risk are explicit. SPL support is not Token-2022 support or an assertion that mint supply cannot change.

No basic escrow proof, chat assertion, reputation result or later-installed extension can authorize buyer release or change seller refund rights. Separate opt-in custody versions require explicit new terms and independent review. Verified cryptographic statements remain limited to their authenticated inputs and do not establish fiat irreversibility or physical human identity.

## 7. Verification, references and evidence gates

Wrong mint/token program/authority, malicious executable account, PDA seed collision, duplicate initialize, fake Clock, delegated source, frozen token, decimals mismatch, overflow, ATA substitution, transfer CPI failure and release/refund at expiry. Run solana-program-test conservation and replay sequences.

Sources: [Solana transactions](https://solana.com/docs/core/transactions), [token accounts](https://solana.com/docs/tokens/basics/create-token-account). Protocol identifiers above identify the design profile; mutable documentation URLs do not pin implementation. G06 must record evaluated upstream source commit, dependency/toolchain lock, artifact/key hashes, official vectors where available and independently generated integration fixtures. Record actual test commands/results, browser/chain matrix and reviewer disposition; this specification reports none as already passing.

Before enablement, supply exact deployment/provider configuration, cross-module compatibility fixtures and independent review evidence for the stated invariants. No production readiness follows from document structure or status.
