# Native Solana and SPL: reusable code for the unfinished chain implementation

Research date: 2026-11-03, America/Vancouver. Target snapshots: main e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa and PR 26 at 94554ecf9854e4604f9f56afe5bebedeee931994. This dossier proposes integration work; no Solana program was built or deployed.

## 1. Start from the real gap

The project already has [encodeSolanaTerms](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/domain/src/trade-terms.ts), including a domain prefix, genesis/program identity, parties, token program/mint, exact u64 values and commitments. That is a byte encoding, not a program, wallet adapter or custody implementation. Preserve it and generate matching Rust vectors when the remaining program profile is selected.

The existing [SPL specification](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.1_multichain_escrow/module_1.1.2_token_handling/spec-spl-token-adapter.md) is unusually important to candidate selection: **v1 supports the reviewed original SPL Token program only. Token-2022 and extensions remain unsupported pending a separate policy.** It also requires exact account ownership, PDA and authority checks, checked transfers, exact amount accounting, original beneficiaries and no automatic economic resubmission.

The [pending decision](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/solana-profile.decision.json) remains proposed, with no artifact hash or reviewers. The [proposal](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/solana-profile.proposal.json) remains draft. The remaining work is the exact PDA seed/account/discriminator/instruction/IDL profile, native program, chain reader, external-wallet integration, journal semantics and frontend-independent recovery. It is not another chain-neutral reference model.

## 2. Source and license shortlist

Every license below was read from the linked file. Revisions were obtained from commit endpoints, not inferred from Git tree hashes. The source snapshots are research pins; a coherent toolchain and artifact lock still need evaluation.

| Upstream | Inspected commit | License | Best reuse |
| --- | --- | --- | --- |
| [Solana Foundation program-examples](https://github.com/solana-foundation/program-examples) | [22eadfc0](https://github.com/solana-foundation/program-examples/commit/22eadfc074f9e1e48cc78e4010a4d21445e27af9) | [MIT](https://github.com/solana-foundation/program-examples/blob/22eadfc074f9e1e48cc78e4010a4d21445e27af9/LICENSE) | Account constraints, PDA custody and checked-transfer examples; not its swap economics |
| [Anchor, current canonical repository](https://github.com/otter-sec/anchor) | [5193a025](https://github.com/otter-sec/anchor/commit/5193a025c12476634df435c442ff0358058e003f) | [Apache-2.0](https://github.com/otter-sec/anchor/blob/5193a025c12476634df435c442ff0358058e003f/LICENSE) | Account validation and IDL tooling |
| [solana-program/token](https://github.com/solana-program/token) | [737788ff](https://github.com/solana-program/token/commit/737788ff5bcc3f1f44cfb222f25483187650be76) | [Apache-2.0](https://github.com/solana-program/token/blob/737788ff5bcc3f1f44cfb222f25483187650be76/LICENSE) | Original SPL Token instruction definitions and checked transfer |
| [associated-token-account](https://github.com/solana-program/associated-token-account) | [eb7f86e8](https://github.com/solana-program/associated-token-account/commit/eb7f86e8888e959500b66cfd882e4d03f72eab43) | [Apache-2.0](https://github.com/solana-program/associated-token-account/blob/eb7f86e8888e959500b66cfd882e4d03f72eab43/LICENSE) | Canonical address derivation with explicit token program |
| [solana-program/token-2022](https://github.com/solana-program/token-2022) | [f052d0aa](https://github.com/solana-program/token-2022/commit/f052d0aa91884157861bd724b70c016026517697) | [Apache-2.0](https://github.com/solana-program/token-2022/blob/f052d0aa91884157861bd724b70c016026517697/LICENSE) | Unsupported-profile test fixtures and future extension analysis only |
| [Solana Kit](https://github.com/anza-xyz/kit) | [4f9b869e](https://github.com/anza-xyz/kit/commit/4f9b869e81ccb599d9b61f22b554508185b3ef98) | [MIT](https://github.com/anza-xyz/kit/blob/4f9b869e81ccb599d9b61f22b554508185b3ef98/LICENSE) | Modular transaction codecs, lifetime/confirmation and signer interfaces |
| [LiteSVM](https://github.com/LiteSVM/litesvm) | [aff262da](https://github.com/LiteSVM/litesvm/commit/aff262da627cbd6dfef24d24fb435fbaa5e61bc4) | [Apache-2.0](https://github.com/LiteSVM/litesvm/blob/aff262da627cbd6dfef24d24fb435fbaa5e61bc4/LICENSE) | Local SVM stateful program tests |
| [Mollusk](https://github.com/anza-xyz/mollusk) | [8e287e77](https://github.com/anza-xyz/mollusk/commit/8e287e77d37777e28b675f74485ebcc631dc9c0c) | [Apache-2.0](https://github.com/anza-xyz/mollusk/blob/8e287e77d37777e28b675f74485ebcc631dc9c0c/LICENSE) | Focused instruction/account checks and compute-unit tests |

The selected commit dates range from October 27 to November 3, 2026 in Vancouver; all eight repositories were unarchived when inspected. Activity is a maintenance signal, not a security qualification. The original coral-xyz/anchor API location returned a move to repository ID 325891672; resolving that stable ID returned otter-sec/anchor. Do not preserve the old owner as the source pin. The old [solana-labs/solana-program-library](https://github.com/solana-labs/solana-program-library) is archived and directs readers to the separate solana-program repositories.

## 3. What code should actually be reused

### A. Account validation and PDA scaffolding

The official escrow example's [make_offer.rs](https://github.com/solana-foundation/program-examples/blob/22eadfc074f9e1e48cc78e4010a4d21445e27af9/tokens/escrow/anchor/programs/escrow/src/instructions/make_offer.rs) demonstrates account initialization, seed constraints and token-account relationships. [refund_offer.rs](https://github.com/solana-foundation/program-examples/blob/22eadfc074f9e1e48cc78e4010a4d21445e27af9/tokens/escrow/anchor/programs/escrow/src/instructions/refund_offer.rs) demonstrates PDA-authorized transfer and close-account handling. [shared.rs](https://github.com/solana-foundation/program-examples/blob/22eadfc074f9e1e48cc78e4010a4d21445e27af9/tokens/escrow/anchor/programs/escrow/src/instructions/shared.rs) calls transfer_checked with the actual mint decimals.

These examples exchange token A for token B. P2P Offramp instead requires seller-funded custody, seller release before expiry and seller refund afterward. **Do not copy take_offer as P2P settlement logic.** Borrow the account/transfer mechanics only; implement the project's state machine against the accepted native profile.

Proposed destination: a NEW contracts/solana program with separate instructions, state, errors and tests. No such program path is claimed to exist today. Keep exact interface definitions in the existing governance decision/spec rather than allowing generated scaffolding to choose economics.

Anchor's [Signer](https://github.com/otter-sec/anchor/blob/5193a025c12476634df435c442ff0358058e003f/lang/src/accounts/signer.rs) checks the signature flag. [InterfaceAccount](https://github.com/otter-sec/anchor/blob/5193a025c12476634df435c442ff0358058e003f/lang/src/accounts/interface_account.rs) supplies account-wrapper behavior. Neither alone establishes that the signer is the bound seller, that the program/mint is supported, or that the token account is the intended beneficiary. Those relationships remain explicit application constraints.

**Recommendation:** evaluate Anchor as the default implementation framework for readability and account validation. Retain native Rust/Pinocchio examples as comparison material; an immediate low-level rewrite is not justified by an unmeasured performance need.

### B. Token transfers and associated accounts

Use the original token program's [instruction module](https://github.com/solana-program/token/blob/737788ff5bcc3f1f44cfb222f25483187650be76/interface/src/instruction.rs) rather than hand-encoding SPL instructions. Use the associated-token library's [get_associated_token_address_with_program_id](https://github.com/solana-program/associated-token-account/blob/eb7f86e8888e959500b66cfd882e4d03f72eab43/interface/src/address.rs) or the exact generated equivalent. Its inputs include the token program as well as owner and mint; relying on a generic address helper without checking the program is insufficient.

Proposed destinations: the NEW program's fund/release/refund handlers and a NEW packages/chain-solana adapter. Exact program ID, mint, owner, PDA authority, amount and decimals must be checked before custody decisions. Any permitted associated-account creation must show rent separately from principal.

Anchor's [token_interface.rs](https://github.com/otter-sec/anchor/blob/5193a025c12476634df435c442ff0358058e003f/spl/src/token_interface.rs) supports an interface spanning token implementations. That generality does not authorize Token-2022 for this product. For the first profile, reject unsupported token-program identities and account extensions. The [Token-2022 extension modules](https://github.com/solana-program/token-2022/blob/f052d0aa91884157861bd724b70c016026517697/program/src/extension/mod.rs) are useful to design explicit refusal cases and a later separate policy.

Account closure deserves a deliberate design: the target specification says closing or reassigning a vault is unsupported until terminal replay protection is retained. A tutorial that closes the offer account after payment must not silently erase P2P's one-time trade/nonce protection. Decide whether a retained terminal record or another authenticated permanent replay mechanism provides that property.

### C. Browser adapter, transaction lifetime and wallet boundary

Solana Kit's [block-height confirmation strategy](https://github.com/anza-xyz/kit/blob/4f9b869e81ccb599d9b61f22b554508185b3ef98/packages/transaction-confirmation/src/confirmation-strategy-blockheight.ts) handles lastValidBlockHeight and cancellation. It is a concrete source for a native observation adapter. The [HTTP transport](https://github.com/anza-xyz/kit/blob/4f9b869e81ccb599d9b61f22b554508185b3ef98/packages/rpc-transport-http/src/http-transport.ts) uses fetch; direct use would need to respect the existing G05 broker and explicit endpoint policy.

Proposed destinations: NEW packages/chain-solana read/observe modules and NEW packages/wallet Solana adapter files, integrating with existing authority, error and durable intent interfaces. Keep integer amounts exact. Bind the selected genesis hash/program and account generation on every result. Observation cancellation invalidates local work but cannot undo a submitted transaction.

Kit's [TransactionSendingSigner](https://github.com/anza-xyz/kit/blob/4f9b869e81ccb599d9b61f22b554508185b3ef98/packages/signers/src/transaction-sending-signer.ts) may modify a transaction before signing and sending it, then returns signatures rather than a finalized transaction for pre-send inspection. That result cannot satisfy P2P's pre-send journal/review requirement by itself. Prefer a capability exposing the finalized transaction before submission; otherwise defer sign-and-send-only capabilities until a separately approved wallet/submission contract preserves those guarantees. Post-send inspection cannot retroactively provide pre-send validation. Preserve the existing uncertain-outcome/no-resend policy. The frontend dossier covers Wallet Standard discovery and physical wallet handoff evidence.

Do not reuse EVM receipt/finality code by renaming fields. The official [confirmation documentation](https://solana.com/de/developers/cookbook/transactions/confirmation) distinguishes blockhash expiry and confirmation observations. The native adapter needs its own coherent blockhash/last-valid-height, signature status, account-state, fork and history profile.

### D. Native testing: choose a primary harness

The [LiteSVM implementation](https://github.com/LiteSVM/litesvm/blob/aff262da627cbd6dfef24d24fb435fbaa5e61bc4/crates/litesvm/src/lib.rs) provides an in-process Solana VM, suitable for repeated stateful escrow sequences. The official example already uses LiteSVM. [Mollusk's harness](https://github.com/anza-xyz/mollusk/blob/8e287e77d37777e28b675f74485ebcc631dc9c0c/harness/src/lib.rs) explicitly supplies an instruction execution environment without a complete validator runtime, useful for focused account/error/compute tests.

**Recommendation:** consider LiteSVM as the initial development harness; add Mollusk only if its isolated instruction control resolves a concrete remaining coverage need. The existing SPL specification's verification section explicitly names solana-program-test conservation and replay sequences. Retain that acceptance lane unless the pending native-profile decision explicitly approves and justifies a replacement; this research does not silently substitute LiteSVM for the stated gate. Running equivalent suites without a distinct purpose is not automatically stronger evidence. Neither in-process harness proves real RPC behavior, browser-wallet switching, live finality or deleted-frontend recovery. Those need a separate local-validator/testnet integration lane when the profile and tools are ready.

## 4. Make the dependency selection coherent

The inspected official example [Cargo manifest](https://github.com/solana-foundation/program-examples/blob/22eadfc074f9e1e48cc78e4010a4d21445e27af9/tokens/escrow/anchor/programs/escrow/Cargo.toml) selects anchor-lang/anchor-spl 1.2.1 and LiteSVM 0.18.1. The inspected Anchor [workspace](https://github.com/otter-sec/anchor/blob/5193a025c12476634df435c442ff0358058e003f/Cargo.toml) declares version 1.2.2 and distinct curated Solana dependency cohorts. These are two snapshots, not a tested combined dependency set.

Before implementation, choose one release/toolchain cohort, commit Cargo.lock and exact JS package locks, pin compiler/build tooling and capture the resulting program artifact/IDL hashes. Build the unmodified chosen example locally as a tooling check, then implement the actual P2P semantics. Do not combine latest versions from each repository without testing their compatibility. Record all transitive and generated-code notices.

## 5. Concrete implementation sequence

| Slice | Existing anchor or proposed location | Completion evidence required |
| --- | --- | --- |
| Native profile decision | Existing docs/governance/solana-profile proposal and SPL spec | Exact PDA seeds, account layouts, discriminator/version, instructions, rent, terminal replay and authority policy |
| Cross-language terms | Existing packages/domain/src/trade-terms.ts; NEW Rust fixtures | Matching canonical bytes/hash for native SOL and original SPL, including boundary integers |
| Custody program | NEW contracts/solana | Fund/release/refund authorization, expiry, conservation and immutable beneficiaries under native execution |
| Read and wallet adapters | NEW packages/chain-solana and wallet modules | Broker-controlled RPC, supported-wallet contract, account/network invalidation, exact transaction review |
| Durable submission/recovery | Existing domain journal interface plus explicit Solana profile; NEW recovery CLI | Interrupted send, expired blockhash, fork/history uncertainty and original-program recovery without automatic resend |
| Real integration | Existing acceptance framework plus native lane | Two independent clients, supported token, release/refund and recovery with the frontend absent |

Native contract acceptance should cover signer and owner relationships, wrong program/mint/discriminator, duplicate initialization, unsupported Token-2022 profiles, decimals and integer bounds, immutable beneficiary, transfer failure rollback, expiry boundaries, account/rent handling and retained terminal replay protection. These are validation criteria; no executable misuse instructions or claim of existing passing tests is supplied.

Program deployment and upgrade authority must match the accepted custody policy. The official [deployment documentation](https://solana.com/docs/core/programs/program-deployment) explains how loader-v3 upgrade authority controls mutability. Decide this before qualifying a deployment, and record the actual program/ProgramData identity. A source hash or generated IDL does not establish the deployed upgrade-authority state.

## 6. Rejected shortcuts and research limits

- Do not import a token-swap tutorial's economics as the manual-fiat escrow contract.
- Do not turn TokenInterface support into blanket Token-2022 support.
- Do not count an existing Solana terms encoder as native-chain parity.
- Do not treat wallet sign-and-send convenience as permission to bypass the durable journal.
- Do not infer live finality or recovery from in-process SVM tests.
- Do not adopt abandoned SPL monorepo paths when the canonical packages have moved.

No Rust/Cargo/Anchor installation, package download, program compilation, wallet signing, RPC transaction or deployment was performed. Source paths, licenses and activity were inspected. The proposed destination paths labeled NEW are suggestions, not existing files. The actual implementation remains conditional on the exact native custody/interface profile; external wallet/device qualification remains distinct from local engineering.
