# M2B Solana/SPL gap record — 2026-11-10

This is a read-only preparation record for M2B. It adds no Solana code, stubs or fixtures. No EVM fixture counts as Solana parity. It was built from a source and spec sweep against main `300287d`. Source: the L6 lane of the [M2A orchestration prompt](MILESTONE-M2A-ORCHESTRATION-PROMPT-2026-11-10.md).

## Specified, but with missing pieces

The table lists what the specs fix, and what is still unknown. All paths are under `01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/` unless shown otherwise.

| Spec | What is fixed | What is missing |
| --- | --- | --- |
| `../feature_1.8_trade_coordination/module_1.8.1_trade_terms/spec-signed-trade-terms.md` §Solana | Terms preimage field order: domain `p2p-offramp/solana/basic/v1`+0x00, genesis, programId, orderId, seller, buyer, mint, tokenProgram, hashes, nonce, version, revision u64LE, assetKind, principal/acceptBefore/expiry u64LE, mode. SHA-256 termsHash. Ed25519 signature over the raw bytes | Byte widths of orderId, privateAgreementHash, capabilitiesHash and sellerNonce. Ed25519-instruction offset layout. Nonce replay account seeds |
| `module_1.1.2_token_handling/spec-spl-token-adapter.md` | SPLDeposit field names. Original SPL Token only; Token-2022 unsupported. transfer_checked, balance-delta check, delegate/frozen rejection | Trade/vault PDA seed bytes, order and bump. Instruction data, discriminators and account order. Who pays for ATA creation and rent |
| `module_1.1.1_escrow_state_machine/spec-chain-adapter-contract.md` | Prepared native output `{messageBase64, blockhash, lastValidBlockHeight}` | Message version (legacy/v0), fee payer, compute budget, ALT use |
| `module_1.1.1_escrow_state_machine/spec-state-transitions-and-events.md` | Event fields "equivalent" to EVM, plus the trade account | IDL event layout. Slot versus height anchor |
| `module_1.1.1_escrow_state_machine/spec-escrow-timeout-and-refunds.md` | Expiry window 1800–604800 s | Clock field used |
| `../feature_1.6_wallet_connectivity/module_1.6.2_rpc_registry/spec-chain-network-registry.md` | `solana-program {programDataSha256, upgradeAuthority:null}`, genesis identity, `finalized` | Which bytes programDataSha256 covers |
| `../feature_1.6_wallet_connectivity/module_1.6.1_provider_boundary/spec-wallet-provider-interface.md` | Solana session family | Wallet Standard features: signMessage, signTransaction or signAndSend |
| `../feature_1.7_transaction_recovery/module_1.7.1_transaction_journal/spec-transaction-lifecycle-journal.md` | Submission `{signature, blockhash, lastValidBlockHeight}` | Confirmation/expiry algorithm. Durable nonce |

## Contract questions for maintainers

1. Trade PDA and vault-authority PDA: literal seed bytes, order, widths and bump handling. One PDA or two?
2. Anchor or native program? Account discriminators, state layout, event layout and error codes.
3. Byte widths of the preimage hash and nonce fields. Seeds of the seller-nonce replay account.
4. Ed25519 precompile instruction: index, offsets and position relative to fund. Exact fund/release/refund instruction data, account order and flags.
5. Native SOL vault: a PDA system account or a program-owned one? Rent-exemption and lamport-conservation rule.
6. Reviewed token program ID, allowed mint properties (freeze/mint authority) and decimals source. ATA rule.
7. Transaction message: legacy or v0, fee payer, blockhash or durable nonce, compute budget, preflight commitment.
8. Wallet Standard features required, and whether the wallet signs the raw preimage as is.
9. Time source: Clock `unix_timestamp` or slot. Mapping of the `{height, hash}` anchor.
10. programDataSha256 preimage: ProgramData account bytes or the ELF file, and whether the header is included.
11. Program authorship, audit, license and pinned toolchain (G06).

## Code seams (types only; no Solana logic)

- Schemas already accept `solana`:
  - `packages/schemas/src/core.ts`
  - `intent.ts` (submission variant)
  - `registry.ts` (spl, solana-program, genesis identity)
  - `recovery-reference.ts`
- These EVM-only paths will need a chain-family counterpart behind an interface:
  - `packages/chain-evm/src/reader.ts`
  - `packages/domain/src/{tx-lifecycle,intent-journal,payment-preflight,terms-review,journey-view}.ts`
  - `packages/wallet/src/evm-*.ts`
  - `packages/escrow-evm`
  - `contracts/` (holds only `evm/`)
- No chain-generic `EscrowAdapter`/`WalletSession` interface exists in code yet.

## Toolchain

- **Present in this container:** cargo/rustc 1.97.
- **Absent:** solana/agave CLI, anchor, spl-token, solana-program-test, solana-test-validator, and JS Solana libraries.
- **Correction:** GUIDANCE-REMAINING-2026-11-01 says Cargo is absent. That is outdated for this container.
- **Toolchain is not enough:** installing it would not answer any of the questions above.

## Not done here, and why

| Gate | Why it stays open |
| --- | --- |
| M2B | Every enabling contract above is undefined |
| M2C | Needs M2B, plus external release evidence |
