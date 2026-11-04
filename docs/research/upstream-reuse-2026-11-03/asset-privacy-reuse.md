# Optional shielded assets and CoinJoin: bounded reuse assessment

Research date: **2026-11-03 America/Vancouver**; source retrieval on 2026-11-04 UTC. Target: PR26 [`94554ecf9854e4604f9f56afe5bebedeee931994`](https://github.com/djshellshoxxx/p2p-offramp/commit/94554ecf9854e4604f9f56afe5bebedeee931994). Research/design only; no builds, wallet activity, transactions, services or operational privacy workflow were performed.

## Decision and actual gap

**Useful code exists for profile validation and independent fixtures; none of these repositories is a drop-in provider for the current static application with initial EVM/Solana scope.** Keep spending authorization in explicitly selected external wallets and preserve the empty optional provider registry. Do not add an application-owned backend or wallet key store to accommodate an upstream SDK.

The existing [asset-privacy profile](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/profiles/07-asset-privacy.md) correctly distinguishes Zcash-specific shielded protocols from EVM pools and Bitcoin CoinJoin from account-based assets. The [L-PRIV-OPTIONAL-PROVIDER ledger](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.json) identifies unselected shielded-note/proof and UTXO coordinator/wallet profiles. Libraries cannot make those decisions. This is deferred optional work, separate from the core peer-acceptance and release-trust blockers.

## Three primary repositories

These immutable pins were resolved through commit endpoints. All three repositories were unarchived when inspected; dates are selected commit dates in UTC, not audit dates.

| Candidate | Examined commit / maintenance signal | Verified license |
|---|---|---|
| Zcash librustzcash | [`a551fac8a233f54799ca1920ef78ef098cfda929`](https://github.com/zcash/librustzcash/commit/a551fac8a233f54799ca1920ef78ef098cfda929), 2026-10-27, cargo-vet maintenance | [COPYING.md](https://github.com/zcash/librustzcash/blob/a551fac8a233f54799ca1920ef78ef098cfda929/COPYING.md) expressly offers MIT OR Apache-2.0; both linked license texts were read |
| Wasabi / WabiSabi | [`8360f593c151785e5874b97d06acc15d5e601838`](https://github.com/WalletWasabi/WalletWasabi/commit/8360f593c151785e5874b97d06acc15d5e601838), 2026-11-03, peer-rotation change | [MIT LICENSE.md](https://github.com/WalletWasabi/WalletWasabi/blob/8360f593c151785e5874b97d06acc15d5e601838/LICENSE.md); separate [NOTICE.md](https://github.com/WalletWasabi/WalletWasabi/blob/8360f593c151785e5874b97d06acc15d5e601838/NOTICE.md) records third-party components |
| Zcash lightwalletd | [`18b2a3fb05511311f0677fb54987701375111abf`](https://github.com/zcash/lightwalletd/commit/18b2a3fb05511311f0677fb54987701375111abf), 2026-11-02, maintenance merge | [MIT LICENSE](https://github.com/zcash/lightwalletd/blob/18b2a3fb05511311f0677fb54987701375111abf/LICENSE); selected protocol source also declares MIT |

### 1. librustzcash: address and external-signer format references

The most suitable narrow sources are:

- [`components/zcash_address/src/kind/unified/address.rs`](https://github.com/zcash/librustzcash/blob/a551fac8a233f54799ca1920ef78ef098cfda929/components/zcash_address/src/kind/unified/address.rs): `Receiver`, `Address`, `has_receiver_of_type`, with Orchard, Sapling and transparent receiver distinctions. Adjacent [`address/test_vectors.rs`](https://github.com/zcash/librustzcash/blob/a551fac8a233f54799ca1920ef78ef098cfda929/components/zcash_address/src/kind/unified/address/test_vectors.rs) supplies interoperability fixtures.
- [`pczt/src/lib.rs`](https://github.com/zcash/librustzcash/blob/a551fac8a233f54799ca1920ef78ef098cfda929/pczt/src/lib.rs): `Pczt`, parsing and serialization for Partially Created Zcash Transactions, separating creation roles across entities. This is a stronger external-wallet design reference than embedding a full spending wallet; it is not Bitcoin PSBT or a universal shielded-note format.
- [`zcash_client_backend/src/data_api/chain.rs`](https://github.com/zcash/librustzcash/blob/a551fac8a233f54799ca1920ef78ef098cfda929/zcash_client_backend/src/data_api/chain.rs): `ChainState` and `scan_cached_blocks`; [`data_api.rs`](https://github.com/zcash/librustzcash/blob/a551fac8a233f54799ca1920ef78ef098cfda929/zcash_client_backend/src/data_api.rs): `WalletRead`, `WalletWrite`, `truncate_to_height` and chain-state rollback contracts.

**Use:** isolated synthetic address/format vectors and recovery-model comparison after selecting a Zcash profile. The backend documents viewing-key scanning and caller-supplied or externally delegated spending authority; adopting it still introduces a substantial wallet/database subsystem. Rust source availability and `no_std` PCZT code do not establish browser/WASM qualification. Keep wallet scanning, note secrets and spending operations in the external wallet unless an explicit future architecture decision changes that boundary.

### 2. Wasabi/WabiSabi: transaction-review invariants, not an embedded coordinator client

[`ConstructionState.cs`](https://github.com/WalletWasabi/WalletWasabi/blob/8360f593c151785e5874b97d06acc15d5e601838/WalletWasabi/WabiSabi/Models/MultipartyTransaction/ConstructionState.cs) supplies `AddInput`, `AddOutput` and `Finalize`; [`SigningState.cs`](https://github.com/WalletWasabi/WalletWasabi/blob/8360f593c151785e5874b97d06acc15d5e601838/WalletWasabi/WabiSabi/Models/MultipartyTransaction/SigningState.cs) validates witnesses against the constructed transaction. [`MultipartyTransactionTests.cs`](https://github.com/WalletWasabi/WalletWasabi/blob/8360f593c151785e5874b97d06acc15d5e601838/WalletWasabi.Tests/UnitTests/WabiSabi/Models/MultipartyTransactionTests.cs) provides concrete independent review-test categories.

**Use:** adapt transaction-consistency and witness-validation test expectations for a future explicitly selected Bitcoin profile. Retain original beneficiary/output commitments, exact fees and uncertain-broadcast reconciliation. Its .NET/NBitcoin implementation is a reference or isolated test oracle, not TypeScript-ready browser code.

Do not transplant [`CoinJoinClient.cs`](https://github.com/WalletWasabi/WalletWasabi/blob/8360f593c151785e5874b97d06acc15d5e601838/WalletWasabi/WabiSabi/Client/CoinJoin/Client/CoinJoinClient.cs): it depends on `IKeyChain`, coordinator interactions and blame-round continuation. Those behaviors require their own wallet consent, disclosure, reservation and retry policies. A maintained source repository does not establish an available or approved coordinator. Neither PSBT support nor WabiSabi code makes EVM/Solana escrow assets compatible Bitcoin inputs.

### 3. lightwalletd: protocol reference and external dependency

[`walletrpc/service.proto`](https://github.com/zcash/lightwalletd/blob/18b2a3fb05511311f0677fb54987701375111abf/walletrpc/service.proto) defines `CompactTxStreamer`, compact-block ranges, tree-state observations and a separate transaction-submission method. These schemas help specify observation provenance and recovery requirements for a selected external Zcash wallet.

**Use:** interface/fixture reference only. The [README](https://github.com/zcash/lightwalletd/blob/18b2a3fb05511311f0677fb54987701375111abf/README.md) describes a blockchain backend service and states review limitations. Do not make it a mandatory P2P Offramp backend or infer that its data alone proves complete consensus, privacy or spendability. Service compatibility and failure handling belong to the selected external-wallet/provider contract.

## Destination and prerequisites

Update `docs/execution/profiles/07-asset-privacy.md` and the existing shielded/CoinJoin specifications with this selection evidence. Reuse `packages/extensions/src/registry.ts` for capability admission and the existing transaction-journal design, invariants and tests as references for uncertain outcomes. Direct storage of Bitcoin/Zcash operations in current `IntentV1` is unsupported: [intent.ts](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/schemas/src/intent.ts) permits only EVM/Solana submissions and approve/fund/release/refund actions, and [core.ts](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/schemas/src/core.ts) defines those two chain families. Select a versioned chain-specific external-wallet journal/recovery contract before integrating another chain. **Proposed**, not existing: `scripts/asset-privacy-vectors/` for isolated synthetic generators; only after profile approval, a separately scoped external-wallet adapter under `packages/asset-privacy/`.

Before implementation, select chain/network/asset, exact receiver or transaction format, external wallet capabilities, protocol/circuit/artifact hashes, viewing versus spending authority, recovery serialization, endpoint policy and cancellation ownership. Accept only independently checked fixtures for wrong-network/receiver, unsupported format, amount/output mismatch, stale recovery, chain rollback and unavailable provider. Preserve refusal before key collection or signing and verify basic escrow recovery with the optional package absent.

The target's root distribution license remains unresolved; upstream licenses do not relicense it. Preserve selected-file notices and inspect transitive/generated artifacts during any later intake. No candidate here was built, packaged, benchmarked or qualified for deployment.
