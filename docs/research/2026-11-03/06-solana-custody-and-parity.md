# Solana custody and parity: remaining research

**Review date:** 2026-11-03, America/Vancouver; source retrieval 2026-11-04 UTC.  
**Status:** research and proposed decisions; no program, wallet, RPC provider, deployment or transaction has been qualified. No chain transactions or runtime tests were performed.  
**Repository snapshot:** main `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa`; inspected unmerged PR26 `94554ecf9854e4604f9f56afe5bebedeee931994`. Repository references below pin PR26.

## Decision summary

**Solana needs a complete native custody profile before adapter implementation can establish parity.** `P-SOLANA-PROFILE` and `P-SOLANA-ENGINEERING` remain exact-contract/tooling remainders. The proposal is still `pending-selection`; the inspected tree has no Rust source, `Cargo.toml` or `Anchor.toml`. It does contain canonical Solana terms encoding, design constraints and governance preparation. Those are useful inputs, not a deployed program or working Solana wallet path. [SO-R01] [SO-R02] [SO-R03] [SO-R04]

Recommended sequence: evaluate a narrowly scoped native-SOL basic escrow first, then qualify explicitly selected mints under the original SPL Token Program. Keep Token-2022, program/multisig wallets and additional transaction formats outside that first profile unless their exact contracts are independently reviewed. This sequencing is a research recommendation; existing specifications and pending decisions are unchanged.

The most consequential new compatibility finding is in wallet signing. The pinned Wallet Standard permits a wallet to return modified `signedMessage` bytes, while G16 requires signatures over one exact raw binary message. Its separate off-chain-message feature constructs another format. Accepting either result without validating the approved byte contract would break acceptance semantics. [SO-R04] [SO17] [SO18]

## 1. Reuse existing work, identify the actual gaps

| Existing evidence | What still needs to be established |
|---|---|
| `encodeSolanaTerms` encodes the domain, genesis/program identities, parties, asset identities, commitments, seller nonce, revision, amount and deadlines. It neither verifies signatures nor enables funding. [SO-R04] | Independently generated encoding/signature vectors tied to the actual program and wallet profile. |
| G16 already requires a program-side immutable network-domain constant, both raw Ed25519 acceptances, exact instruction verification and seller-nonce replay protection. [SO-R05] | Exact implementation, account layout, verification-instruction arrangement and native program evidence. Client genesis checks alone do not satisfy this design. |
| SPL design already selects original SPL Token only, rejects delegated paths and unsupported extensions, and fixes release/refund beneficiaries. [SO-R06] | Exact token-program/mint list, authority policy, vault and destination derivations, IDL and runtime fixtures. |
| Native accounting already separates principal, rent and unsolicited surplus and prohibits account closure in v1. [SO-R07] | Account sizes, reserve ownership, persistent terminal/nonce records and program-level conservation evidence. |
| G12 already describes Solana blockhash expiry and history-based reconciliation; its Solana lifecycle remains unimplemented. [SO-R08] [SO-R01] | Native journal transitions, wallet mutation rules, exact observation schema and recovery fixtures. |

Do not turn a successful Solana SDK installation, generated Anchor IDL or passing TypeScript encoder test into a claim that these gaps are closed. Governance explicitly requires a selected coherent native profile. [SO-R02]

## 2. The profile that must be frozen

The next decision packet should publish the following together. These are **requirements for the proposed packet**, not invented field names or an approved IDL.

| Boundary | Required exact content and decision |
|---|---|
| Deployment identity | Cluster genesis bytes, program ID, loader and ProgramData identity where applicable, executable artifact hash, source/toolchain locks, deployment observation, and exact upgrade-authority state. |
| PDA derivation | Versioned seed bytes, fixed field lengths/order, nonce representation, canonical bump rule, trade/vault/nonce-record relationships and independent expected addresses. |
| Account format | Owner, data length, version/state tags, exact discriminator bytes/length, integer endianness, allowed initialization states and unknown-version refusal. |
| Instruction contract | Every instruction’s encoded arguments, ordered account metas, signer/writable requirements, supported CPI targets, sysvars, error mapping and terminal-state behavior. |
| Custody | Separate principal, reserve and surplus; fixed seller/buyer; replay prevention; treatment of missing/frozen destination accounts; no undeclared authority or beneficiary override. |
| Acceptance and time | Exact raw terms/signature scheme, both-party verification policy, authenticated chain time, checked integer conversion and disjoint release/refund deadline guards. |
| Observation and recovery | Selected transaction format, blockhash lifetime, commitment levels, history availability, full transaction-body reconciliation and durable handling of unknown outcomes. |

PDA derivation computes an address; it does not create an account or establish its owner. Seeds are application-defined, bounded byte strings. Consequently, the actual program must validate derivation and account state, not just accept a familiar-looking address. Fixed-length seed components and independent address vectors make the selected contract reviewable. [SO01] [SO02]

**Nonce uniqueness needs its own argument.** G16 requires a seller nonce to remain unique across orders, while the SPL design includes the terms hash among trade-PDA inputs. Changing terms can therefore change the PDA despite nonce reuse. This is a design inference from the specified inputs: initialization-once of that PDA alone cannot prove deployment-wide seller-nonce uniqueness. Specify the persistent nonce-consumption mechanism separately, including failed funding and terminal trades. [SO-R05] [SO-R06]

Anchor can generate an IDL describing instructions and accounts, but that IDL still has to match the chosen source and executable. Pin the actual discriminator bytes and lengths rather than deriving custody compatibility from an Anchor version label. Verifiable builds support artifact/source comparison; they do not establish correct business logic or authority. [SO03] [SO04]

An unchanged program ID also does not guarantee unchanged behavior when upgrade authority remains. For the documented immutable basic-custody model, evaluate an immutable deployment and independently inspect its actual loader/authority state. If an upgradeable model is wanted, it needs an explicit new authority and funded-trade recovery decision. This report makes neither deployment choice. [SO05] [SO-R09]

## 3. Native SOL, original SPL and Token-2022 are separate profiles

### Native SOL

Retain the current separation of funded principal, reserve and unsolicited credits. Solana account ownership controls data modification and lamport debit; the account’s address is a separate property. Rent-exempt minimums are storage balances, and reclaiming them requires an allowed closure path. Under the repo’s current no-close rule, disclose that the replay-state reserve remains allocated. Do not promise a rent refund merely because the trade’s principal settled. [SO02] [SO-R07]

The candidate program should demonstrate that exact principal reaches only the bound buyer or seller, unsolicited credits create no new entitlement, and settlement leaves enough reserve for the state that must persist. Define who pays each account’s creation cost and transaction fees. A ledger balance alone must not be interpreted as trade principal. [SO-R07]

G16 expresses timestamps as unsigned 64-bit seconds, while the Solana SDK’s `UnixTimestamp` is a signed 64-bit value. The selected implementation needs checked range conversion and a defined refusal for negative/out-of-range observations; wrapping a signed clock value into an unsigned integer is not an acceptable interpretation. Chain-time deadline tests must distinguish seconds from slots and block height. [SO-R04] [SO-R05] [SO06]

### Original SPL Token

The account’s runtime owner must be the selected Token Program; the token account’s data also contains a distinct owner/authority. Validate both, plus mint, initialized/frozen state, delegation policy and vault/destination authority. The original Token Program transfer implementation supports delegated transfers; P2P Offramp’s stricter no-delegate policy therefore requires its own validation rather than assuming `transfer_checked` enforces it. [SO07] [SO08] [SO-R06]

Associated token accounts are derived from owner, token-program ID and mint under the Associated Token Program. An ATA is not owned at runtime by the Associated Token Program. Specify whether destinations must be the derived ATA, who funds its creation, and how an already-existing account is verified. The creation payer is not automatically the eventual storage-refund beneficiary. [SO07]

A selected legacy mint can still have a freeze authority. The processor refuses transfers involving frozen accounts, so accepting original SPL tokens does not establish unconditional payout liveness. Per-mint review must state mint/freeze authority policy, permitted changes, observation freshness and the user-visible consequence of issuer freezes. A source-level transfer check cannot overrule the token issuer. [SO08] [SO-R06]

### Token-2022

The current design explicitly excludes it. Retain that boundary for the first profile. Extensions change more than metadata: transfer fees affect credited amounts, transfer hooks introduce additional CPI/account requirements, permanent delegates introduce another authority, and default/frozen/non-transferable/pausable states can constrain movement. Even apparently benign extensions need a defined parser and compatibility policy. [SO-R06] [SO09]

A later proposal needs exact mint and account extension allowlists, unknown-extension behavior, size/rent calculation, authority transitions and transfer/payout accounting for each supported combination. Wrapped SOL must also be distinguished explicitly from native lamports. There is no general “SPL compatible” decision that can stand in for these contracts. [SO07] [SO09]

## 4. Wallet signing and transaction construction

### A material mismatch between guidance and the typed interface

The current Solana signing guide describes raw `signMessage` as signing the supplied bytes directly. However, pinned upstream `anza-xyz/wallet-standard@c4d06f9f2668ebec3f2747c9fcf5e2382a2fc36f` explicitly permits the returned `signedMessage` to be prefixed or otherwise modified. The conservative integration contract is to inspect the returned bytes and require exact equality to approved G16 bytes before verifying the Ed25519 signature. This is a documented interface distinction, not a demonstrated wallet defect. [SO17] [SO25] [SO-R04]

The separate `solana:signOffchainMessage` feature takes UTF-8 content and required signers and returns a constructed signed message. OCMS v1 signs a domain/version/signer preamble plus the content. G16 currently signs raw binary terms directly. Simply switching methods, text-encoding binary terms or verifying only a returned digest would define a different acceptance profile. Any OCMS adoption needs versioned canonical content, signer ordering, explicit binding of all G16 fields, caps, compatibility vectors and an updated program verifier. [SO18] [SO19] [SO-R05]

OCMS itself does not guarantee hardware-wallet clear signing; the specification makes that device-dependent. Check exact wallet/account features and physical-device behavior. Mobile Wallet Adapter’s current web installation guidance describes Android Chrome and Android Intents; registering its Wallet Standard bridge is not evidence for iOS Safari or every browser. Coordinate those experiments with [report 05](05-wallet-mobile-qr-and-browser.md). [SO19] [SO20]

### The transaction returned by the wallet must also be reconciled

The pinned `signTransaction` interface allows modified signed transactions, including program/multisig-wallet arrangements. Its transaction-version type includes `legacy`, `0` and `1`; `signAndSendTransaction` exposes supported versions and returns a signature rather than the entire final transaction. Select and qualify actual wallet behavior before advertising compatibility. [SO21] [SO22]

For an initial ordinary-key profile, require review of the compiled economic instruction, every account and beneficiary, fee/rent limits and any allowed blockhash mutation. After sending, reconcile the actual transaction and program state. A method name or signature-shaped callback is insufficient. Unsupported program-wallet rewriting should refuse rather than silently being treated as ordinary-key parity. [SO-R10] [SO-R08]

**Measure the complete funding transaction.** G16’s current Solana terms serialization is 383 bytes: a 28-byte domain, ten 32-byte fields and 35 trailing bytes, calculated from the inspected encoder. This is encoding arithmetic, not a validator test. Both acceptances, verification instructions, account keys, funding arguments and optional ATA creation consume additional space. The current documentation gives different limits/layouts for legacy/v0 and v1 transactions. Do not use the adapter’s 64 KiB preparation cap as an on-chain size budget or assume a newly supported format is enabled in the selected stack. [SO-R04] [SO-R11] [SO23]

Ed25519 precompiles are top-level verification instructions and cannot be called through CPI. Their ability to reference transaction data does not relieve the escrow program of checking the exact message/key relationship. Preserve G16’s stricter offset/reference policy unless explicitly revised, and resolve the message placement/duplication and compute budget with serialized fixtures. [SO24] [SO-R05]

## 5. Finality, expiry and restart recovery

Use chain-native observations with separate meanings. `processed` can roll back; `confirmed` and `finalized` express different cluster commitment levels. The program’s expiry clock, RPC block height and transaction observation slot are not interchangeable. A cluster-label string also does not replace the genesis hash required by G16 and the registry. [SO10] [SO16] [SO-R05]

A successful `sendTransaction` result means the RPC accepted the submission, not that the cluster processed it. Record the originally approved message, relevant blockhash, `lastValidBlockHeight`, observation context and signature when available. If a wallet can replace the blockhash, define how the final signed lifetime becomes known; retaining only the pre-wallet height would be an incomplete recovery record. [SO11] [SO12] [SO21] [SO-R08]

The current confirmation guide uses chain-reported block height to determine expiry and distinguishes durable-nonce transactions. Preserve the existing G12 refusal of durable nonces until a separate lifecycle is defined. Its zero-automatic-resubmission policy also takes precedence over generic RPC guidance that recommends repeated propagation. Any bounded identical-byte propagation must be a separately selected adapter policy; rebuilding, re-signing or starting a new economic intent is a different action. [SO13] [SO-R08]

A null recent-cache status does not prove that a transaction never executed. `getSignatureStatuses` requires history search for older records, and node ledger data may be purged. `searchTransactionHistory: true` is a request, not a retention guarantee. Qualify provider history coverage and reconciliation of the original custody state before releasing a reservation; otherwise retain uncertainty. [SO14] [SO15] [SO-R08]

RPC corroboration can expose inconsistency but is not light-client verification. Recovery should work with the original program/IDL and account derivation even if a newer frontend or optional module disappears. The selected release/archive profile in [report 04](04-release-trust-and-recovery.md) must therefore preserve Solana recovery artifacts too. [SO-R11]

## 6. Concrete closure plan

| Work item | Deliverable and evidence that closes it |
|---|---|
| **Profile decision** | One versioned packet covering every boundary in §2, explicit native-SOL/original-SPL scope, acceptance mode, wallet family and transaction version. Named review and compatibility records, without claiming execution. |
| **Independent vectors** | Two independently produced implementations agree on terms bytes/signatures, PDA/bump addresses, account layouts, instruction encodings and nonce identity. Include boundary values and incompatible versions. |
| **Native program validation** | Locked native toolchain and artifact; conservation, single settlement, deadline boundaries, retained replay state, signer/owner/mint validation and failed-funding rollback evidence. No escrow implementation currently exists to validate. |
| **Wallet/adapter evidence** | Explicit-connect lifecycle, session changes, exact returned signing bytes, actual transaction-body checks, prompt cancellation and unsupported-feature refusal on named software/hardware devices. |
| **Recovery evidence** | Restart and two-tab reservations; known/unknown signatures; expired blockhash with historical execution; unavailable history; contradictory observations; old funded-trade recovery after frontend update. |
| **External qualification** | Independent program review, deployment/artifact/authority observation, selected mint and RPC policy, and actual device/test-network results. Research notes cannot supply these facts. |

A first native-SOL implementation slice becomes meaningful after profile and vector selection. Original SPL support should follow only after its separate mint/authority and destination-account policy is concrete. Nothing in this report promotes either canonical remainder record to complete or enables a production capability.

## Sources and limitations

All external sources are primary maintainer documentation, generated SDK documentation or upstream source. Relevant original content was inspected; no claim is made that every page or repository was audited. Mutable documentation is retrieval-dated. Wallet Standard and Token Program source are commit-pinned; those pins are research snapshots, not selected dependencies or deployed-bytecode attestations. The indexed `solana-clock` pages reported version 4.0.0, but attempted explicit version URLs failed; the bibliography records that limitation. The attempted older `solana.com/docs/core/sysvars` URL also failed and is not supporting evidence.

### Repository evidence

- [SO-R01] [Canonical current remainder](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.json), `P-SOLANA-PROFILE` and `P-SOLANA-ENGINEERING`; internal source checkpoint retained separately from this review snapshot.
- [SO-R02] [Pending Solana profile decisions](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/PENDING-DECISIONS.md).
- [SO-R03] [Solana proposal](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/solana-profile.proposal.json) and [inspected source tree](https://github.com/djshellshoxxx/p2p-offramp/tree/94554ecf9854e4604f9f56afe5bebedeee931994).
- [SO-R04] [Canonical terms encoder](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/domain/src/trade-terms.ts).
- [SO-R05] [G16 signed trade terms](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.8_trade_coordination/module_1.8.1_trade_terms/spec-signed-trade-terms.md).
- [SO-R06] [SPL adapter design](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.2_token_handling/spec-spl-token-adapter.md).
- [SO-R07] [Native accounting design](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.2_token_handling/spec-native-asset-accounting.md).
- [SO-R08] [G12 transaction journal design](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.7_transaction_recovery/module_1.7.1_transaction_journal/spec-transaction-lifecycle-journal.md). Its historical EVM implementation descriptions are not used to infer current PR26 EVM integration status.
- [SO-R09] [Basic escrow interface and authority model](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.1_escrow_state_machine/spec-escrow-contract-interface.md).
- [SO-R10] [External wallet boundary](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.6_wallet_connectivity/module_1.6.1_provider_boundary/spec-wallet-provider-interface.md).
- [SO-R11] [Native chain adapter contract](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.1_escrow_state_machine/spec-chain-adapter-contract.md).

### External primary sources

- [SO01] Solana Foundation, [PDA derivation](https://solana.com/docs/core/pda/pda-derivation).
- [SO02] Solana Foundation, [Account structure](https://solana.com/docs/core/accounts/account-structure).
- [SO03] Anchor maintainers, [Program IDL file](https://www.anchor-lang.com/docs/basics/idl).
- [SO04] Anchor maintainers, [Verifiable builds](https://www.anchor-lang.com/docs/references/verifiable-builds).
- [SO05] Solana Foundation, [Program deployment and upgrade authority](https://solana.com/docs/core/programs/program-deployment).
- [SO06] Solana SDK maintainers, [UnixTimestamp](https://docs.rs/solana-clock/latest/solana_clock/type.UnixTimestamp.html), displayed crate 4.0.0; mutable/latest retrieval limitation.
- [SO07] Solana Foundation, [Token accounts, ATAs and storage payer](https://solana.com/docs/tokens/basics/create-token-account).
- [SO08] Token Program maintainers, [Transfer processor](https://github.com/solana-program/token/blob/737788ff5bcc3f1f44cfb222f25483187650be76/program/src/processor.rs), commit `737788ff5bcc3f1f44cfb222f25483187650be76`, 2026-10-27; relevant transfer/approval code inspected.
- [SO09] Solana Foundation, [Token-2022 extensions](https://solana.com/docs/tokens/extensions).
- [SO10] Solana Foundation, [RPC commitment overview](https://solana.com/docs/rpc).
- [SO11] Solana Foundation, [getLatestBlockhash](https://solana.com/docs/rpc/http/getlatestblockhash).
- [SO12] Solana Foundation, [sendTransaction](https://solana.com/docs/rpc/http/sendtransaction).
- [SO13] Solana Foundation, [Transaction confirmation and expiration](https://solana.com/developers/cookbook/transactions/confirmation).
- [SO14] Solana Foundation, [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses).
- [SO15] Solana Foundation, [minimumLedgerSlot](https://solana.com/docs/rpc/http/minimumledgerslot).
- [SO16] Solana Foundation, [getGenesisHash](https://solana.com/docs/rpc/http/getgenesishash).
- [SO17] Anza Wallet Standard maintainers, [signMessage contract](https://github.com/anza-xyz/wallet-standard/blob/c4d06f9f2668ebec3f2747c9fcf5e2382a2fc36f/packages/core/features/src/signMessage.ts), pinned 2026-10-05.
- [SO18] Anza Wallet Standard maintainers, [signOffchainMessage contract](https://github.com/anza-xyz/wallet-standard/blob/c4d06f9f2668ebec3f2747c9fcf5e2382a2fc36f/packages/core/features/src/signOffchainMessage.ts), same pin.
- [SO19] Anza, [Off-chain message signing v1](https://docs.anza.xyz/proposals/off-chain-message-signing/).
- [SO20] Solana Mobile, [Installing Mobile Wallet Standard](https://docs.solanamobile.com/get-started/web/installation), updated 2026-10-26.
- [SO21] Anza Wallet Standard maintainers, [signTransaction contract](https://github.com/anza-xyz/wallet-standard/blob/c4d06f9f2668ebec3f2747c9fcf5e2382a2fc36f/packages/core/features/src/signTransaction.ts), same pin.
- [SO22] Anza Wallet Standard maintainers, [signAndSendTransaction contract](https://github.com/anza-xyz/wallet-standard/blob/c4d06f9f2668ebec3f2747c9fcf5e2382a2fc36f/packages/core/features/src/signAndSendTransaction.ts), same pin.
- [SO23] Solana Foundation, [Versioned transactions](https://solana.com/developers/cookbook/transactions/versions), retrieved table and native-format distinctions; selected cluster/wallet capabilities still require qualification.
- [SO24] Solana Foundation, [Precompiled programs](https://solana.com/docs/core/programs/precompiles).
- [SO25] Solana Foundation, [Sign messages and authenticate users](https://solana.com/docs/frontend/messages-and-auth), interpreted alongside the more permissive pinned typed interface.

[SO01]: https://solana.com/docs/core/pda/pda-derivation
[SO02]: https://solana.com/docs/core/accounts/account-structure
[SO03]: https://www.anchor-lang.com/docs/basics/idl
[SO04]: https://www.anchor-lang.com/docs/references/verifiable-builds
[SO05]: https://solana.com/docs/core/programs/program-deployment
[SO06]: https://docs.rs/solana-clock/latest/solana_clock/type.UnixTimestamp.html
[SO07]: https://solana.com/docs/tokens/basics/create-token-account
[SO08]: https://github.com/solana-program/token/blob/737788ff5bcc3f1f44cfb222f25483187650be76/program/src/processor.rs
[SO09]: https://solana.com/docs/tokens/extensions
[SO10]: https://solana.com/docs/rpc
[SO11]: https://solana.com/docs/rpc/http/getlatestblockhash
[SO12]: https://solana.com/docs/rpc/http/sendtransaction
[SO13]: https://solana.com/developers/cookbook/transactions/confirmation
[SO14]: https://solana.com/docs/rpc/http/getsignaturestatuses
[SO15]: https://solana.com/docs/rpc/http/minimumledgerslot
[SO16]: https://solana.com/docs/rpc/http/getgenesishash
[SO17]: https://github.com/anza-xyz/wallet-standard/blob/c4d06f9f2668ebec3f2747c9fcf5e2382a2fc36f/packages/core/features/src/signMessage.ts
[SO18]: https://github.com/anza-xyz/wallet-standard/blob/c4d06f9f2668ebec3f2747c9fcf5e2382a2fc36f/packages/core/features/src/signOffchainMessage.ts
[SO19]: https://docs.anza.xyz/proposals/off-chain-message-signing/
[SO20]: https://docs.solanamobile.com/get-started/web/installation
[SO21]: https://github.com/anza-xyz/wallet-standard/blob/c4d06f9f2668ebec3f2747c9fcf5e2382a2fc36f/packages/core/features/src/signTransaction.ts
[SO22]: https://github.com/anza-xyz/wallet-standard/blob/c4d06f9f2668ebec3f2747c9fcf5e2382a2fc36f/packages/core/features/src/signAndSendTransaction.ts
[SO23]: https://solana.com/developers/cookbook/transactions/versions
[SO24]: https://solana.com/docs/core/programs/precompiles
[SO25]: https://solana.com/docs/frontend/messages-and-auth
[SO-R01]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.json
[SO-R02]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/PENDING-DECISIONS.md
[SO-R03]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/solana-profile.proposal.json
[SO-R04]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/domain/src/trade-terms.ts
[SO-R05]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.8_trade_coordination/module_1.8.1_trade_terms/spec-signed-trade-terms.md
[SO-R06]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.2_token_handling/spec-spl-token-adapter.md
[SO-R07]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.2_token_handling/spec-native-asset-accounting.md
[SO-R08]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.7_transaction_recovery/module_1.7.1_transaction_journal/spec-transaction-lifecycle-journal.md
[SO-R09]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.1_escrow_state_machine/spec-escrow-contract-interface.md
[SO-R10]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.6_wallet_connectivity/module_1.6.1_provider_boundary/spec-wallet-provider-interface.md
[SO-R11]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.1_escrow_state_machine/spec-chain-adapter-contract.md
