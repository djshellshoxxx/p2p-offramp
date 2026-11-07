# Reusable code for core transport, peer acceptance, wallets, and native Solana

Research date: **2026-11-03 America/Vancouver** (some observed commits are dated 2026-11-04 UTC). Source review only: no dependency was installed, upstream executable run, implementation imported, or acceptance gate changed.

## Decision

The strongest immediate reuse is **independent interoperability evidence around the existing Nostr and EIP-712 implementation**, followed by **selected Solana SDK modules for a separately defined native program**. A large relay or wallet framework cannot supply the missing peer acceptance protocol. WalletConnect and Reown are technically relevant mobile candidates, but their inspected community licenses contain material network, commercial, and modification conditions; they are conditional choices.

This report evaluates **13 repositories**, with immutable code and actual license-file links. It distinguishes existing implementation, integration gaps, dependency candidates, test oracles and architecture references. These recommendations do not establish a production package version, custody safety, source-to-package reproducibility, or release approval.

## 1. Baseline and actual remaining work

The application source baseline is open PR #26 at `94554ecf9854e4604f9f56afe5bebedeee931994`; remote main was `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa`. The coordinating review verified the local tracked source/test/config snapshot against PR #26. Reconcile recommendations with the eventual merged head.

| Area | Already implemented or evaluated | Remaining work |
|---|---|---|
| EVM wallets | Explicit bounded discovery, EIP-1193 account/network invalidation, typed-data signing, canonical terms hashing, EOA verification, separate contract-account acceptance verifier. | Independent vectors, real supported-wallet qualification, production peer acceptance carrier. |
| Agreement verification | `verifyEvmAgreementBundle` receives private agreement/domain/terms and two role/account/signature acceptances. | Private worker protocol is not peer transport. Its result is explicitly test-only and disallows economic preparation. |
| Nostr | Noble-backed NIP-44/NIP-59/NIP-17, relay pool, authenticated envelopes, durable chat. | Cross-client interoperability, release-qualified provider/profile, carrier-to-verifier bridge. |
| Mobile | Actual isolated `@walletconnect/utils 2.26.0` evaluation. | Real provider/session/pairing, launch/return, encrypted persistence, revocation/resume, routing, physical-device qualification. |
| Solana/SPL | Explicit native-parity workstream and missing-profile decision packet; inspected journey interfaces are EVM-specific. | Native program/PDA/account/IDL/instruction definitions, wallet adapter, token policy, observation/journal/recovery, local-validator evidence. |
| Host WebSocket | Actual isolated `ws 8.22.1` receiver evaluation. | Selected companion/host authentication, routing, packaging, lifecycle and support profile. This cannot change browser WebSocket allocation behavior. |

Evidence: [EVM adapter](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/evm-adapter.ts), [discovery](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/discovery.ts), [terms crypto](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/evm-terms.ts), [agreement verifier](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/evm-agreement.ts), [contract acceptance](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/evm-contract-acceptance.ts), [Nostr provider](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/nostr-crypto/src/provider.ts), [durable chat](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/messaging/src/durable-chat.ts), [native interfaces](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/src/journey/native-contracts.ts), [pending decisions](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/PENDING-DECISIONS.md).

The current `terms-accept` body is exactly `{revision}`. It is communication consent, not delivery of two wallet signatures. Preserve that wire contract until a separately versioned carrier is defined. [Message schema](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/exchange/src/messages.ts), [processing](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/exchange/src/exchange.ts), [remaining-work packet](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/ALL-REMAINING-WORK-PROMPT.md).

The mobile intake reports four of five actual cases passing. The fifth preserves a stronger application's URI-roundtrip expectation: the parser returns an empty protocol field after removing `wc:`. The intake does **not** classify it as a demonstrated upstream-contract defect. It constructs no SignClient/provider and qualifies no real handoff. Waku and XMTP intake likewise should not be mislabeled as missing research or completed production integration. [Mobile](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/security/intake/mobile-wallet/README.md), [Waku](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/security/intake/waku/README.md), [XMTP](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/security/intake/xmtp/README.md), [notices](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/THIRD_PARTY_NOTICES.md).

## 2. Ranked shortlist

**P0** advances immediate EVM peer interoperability. **P1** advances required native/mobile work after exact profile selection. **P2** is a conditional alternative or supporting reference.

| ID | Repository | Recommended reuse | Priority | Appropriate destination |
|---|---|---|---|---|
| N1 | nbd-wtf/nostr-tools | Test oracle and fixtures first | P0 | Existing Nostr tests/provider boundary |
| E1 | wevm/viem | Development-only typed-data oracle | P0 | Existing EVM terms tests |
| E2 | ethers-io/ethers.js | Alternative independent oracle | P0 | Static vectors or separate interoperability test |
| N3 | MostroP2P/mostro-core | Architecture/protocol-test patterns | P0 | Proposed peer-acceptance schema/exchange modules |
| W1 | wallet-standard/wallet-standard | Selected discovery/features dependency | P1 | Proposed Solana discovery adapter |
| W2 | anza-xyz/wallet-standard | Selected Solana feature contracts | P1 | Proposed native wallet/execution adapter |
| S1 | anza-xyz/kit | Modular native dependencies | P1 | Proposed `packages/chain-solana` |
| S2 | otter-sec/anchor | Program framework after profile selection | P1 | Proposed `contracts/solana` |
| S3 | solana-program/token | Generated client dependency/program reference | P1 | Proposed token adapter/CPI paths |
| M1 | WalletConnect/walletconnect-monorepo | Conditional real-provider dependency | P1 | Existing EIP-1193 port |
| M2 | reown-com/appkit | Conditional alternative; defer broad UI adoption | P2 | Optional wallet UI |
| H1 | websockets/ws | Host-only dependency; retain existing intake | P2 | Proposed companion `RelayConnector` |
| N2 | nostr-dev-kit/ndk | Architecture/test reference; defer full replacement | P2 | Existing relay lifecycle tests |

No candidate is acceptable merely because it appears in this table. Actual source, licensing, glue and boundaries follow.

## 3. Nostr and the missing peer acceptance carrier

### N1 — nostr-tools: independent interoperability first

**Code inspected:** [NIP-44 functions](https://github.com/nbd-wtf/nostr-tools/blob/a59c053e820d58bfc85372612d1515b7cdd9fa5c/nip44.ts); [createRumor/createSeal/createWrap/unwrapEvent](https://github.com/nbd-wtf/nostr-tools/blob/a59c053e820d58bfc85372612d1515b7cdd9fa5c/nip59.ts); [wrapEvent/wrapManyEvents](https://github.com/nbd-wtf/nostr-tools/blob/a59c053e820d58bfc85372612d1515b7cdd9fa5c/nip17.ts); [AbstractSimplePool](https://github.com/nbd-wtf/nostr-tools/blob/a59c053e820d58bfc85372612d1515b7cdd9fa5c/abstract-pool.ts). The inspected NIP-17 API accepts explicit `createdAt`, allowing rumor identity to remain stable across retries while wrapping is a separate layer.

**Use here:** proposed `packages/nostr-crypto/test/interop/nostr-tools-vectors.test.mjs`, exercising existing `createTradeChat`, `createSeal`, `createGiftWrap` and `unwrapGiftWrap`. A selected runtime adapter belongs behind `NostrMessagingProvider`; do not insert key handling directly into UI code. Existing crypto is not missing. [Local chat](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/nostr-crypto/src/nip17.ts), [wrapping](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/nostr-crypto/src/nip59.ts).

**Glue/tests:** independently generate local→upstream and upstream→local fixtures. Compare canonical event IDs and rumor bytes while accounting for randomized wrapper details. Cover recipient/self copies, size limits, expiration, duplicate rumors with different outer wraps, wrong bindings, cancellation and changed revisions. Retain local bounded validation if generic upstream accepts a wider event shape. Use only public fixture keys.

**Boundary:** NIP-59 defines encapsulation rather than the application protocol. Successful unwrap or relay acknowledgement does not prove wallet ownership, payment, agreement validity or finality. [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md), [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md).

**License/identity/maintenance:** actual **Unlicense**, not MIT. Inspected commit is the 2026-11-02 optional timestamp change. It identifies a repository snapshot, not a selected published artifact: historical `nostr-tools` and current `@nostr/tools` naming must be reconciled during package intake. No automatic migration is recommended. Preserve source/dependency provenance.

### N3 — Mostro core: versioned transport pattern

**Code inspected:** [Transport, WrapOptions, wrap_message_nip44, unwrap_message_nip44, wrap_message_with, unwrap_incoming](https://github.com/MostroP2P/mostro-core/blob/97a1fa84fa81d92368c852b943eabf3711564aa2/src/transport.rs); [Message types](https://github.com/MostroP2P/mostro-core/blob/97a1fa84fa81d92368c852b943eabf3711564aa2/src/message.rs); [chat wrapping](https://github.com/MostroP2P/mostro-core/blob/97a1fa84fa81d92368c852b943eabf3711564aa2/src/chat/wrap.rs). Its transport enumeration associates envelope behavior with protocol version, a useful explicit dispatch pattern.

**Use here:** proposed `packages/schemas/src/peer-acceptance.ts` and `packages/exchange/src/acceptance-carrier.ts`. These are proposed paths. Preserve current `messages.ts` and revision-only acceptance until compatibility rules are selected.

**Glue/tests:** define discriminator/version, fields/tags, size/errors, both role/account/terms-hash acceptances, EOA versus EIP-1271 profile, messaging-key-to-wallet binding, trade/revision binding, expiry and replay/duplicate/conflict policy. Define how a verified carrier reaches `verifyEvmAgreementBundle`. Test an independently implemented second client, late/reordered delivery, conflicting signatures and version negotiation.

**Boundary/license:** Rust protocol code in a Lightning/Mostro ecosystem. Reuse version/correlation design and test approach, not financial state, daemon authority or order semantics. It is not a drop-in EVM carrier. MIT; preserve notices if adapting code. Inspected commit explicitly releases mostro-core 0.17.3 on 2026-10-07.

### N2 — NDK: reference existing relay lifecycle

**Code inspected:** [NDKPool](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/relay/pool/index.ts); [NDKSubscription](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/subscription/index.ts); [NDKEvent publication](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/core/src/events/index.ts). The pool maintains `autoConnectRelays` and connection lifecycle, broader than a passive codec.

**Use here:** compare concrete edge cases with `packages/relay/src/pool.ts:createRelayPool`, `RelayConnector` and transport policy. Adapt a small behavior/test only if it addresses an observed gap. [Existing relay](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/relay/src/pool.ts).

**Glue/tests:** endpoint authorization before connection, cancellation, finite reconnect/backoff, cleanup, EOSE versus live events, duplicates, and `accepted/rejected/unknown` publication state. Contain automatic connection/discovery/cache behavior inside selected transport policy.

**Disposition:** defer wholesale replacement. MIT notice retention applies. Inspected default-branch commit is 2026-04-05; metadata showed an April 16 push. Those are observations, not proof of abandonment, release quality or current compatibility.

## 4. EVM: strengthen existing hashing/signing evidence

### E1 — viem

**Code inspected:** [hashTypedData](https://github.com/wevm/viem/blob/bf3ffc52b5633afebacf3d728d846080f1668f30/src/utils/signature/hashTypedData.ts); [verifyTypedData utility](https://github.com/wevm/viem/blob/bf3ffc52b5633afebacf3d728d846080f1668f30/src/utils/signature/verifyTypedData.ts); [signTypedData action](https://github.com/wevm/viem/blob/bf3ffc52b5633afebacf3d728d846080f1668f30/src/actions/wallet/signTypedData.ts). The utility explicitly supports EOAs only and distinguishes the public-client path for broader account support.

**Use here:** proposed `packages/wallet/test/interop/evm-terms-viem.test.mjs`, comparing existing `evmTermsHash`/`verifyEoaAcceptance` with independently constructed typed data and `eth_signTypedData_v4` request payloads. Future runtime adapters should use existing provider/RPC ports.

**Glue/tests:** exact field order/types, domain chain/verifying contract, integer/base-unit boundaries, private-agreement/capability hashes, nonce/revision/role and deadlines. Include independent valid 65-byte signatures and fixed wrong-domain/signature fixtures; retain local low-s/v27/28 policy. Test account/network changes during signing. EIP-1271 stays in `createContractAcceptanceVerifier` with current network observations; the EOA utility cannot substitute. [Terms](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/evm-terms.ts), [contract verifier](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/evm-contract-acceptance.ts).

**License/maintenance:** actual MIT despite unhelpful repository license metadata. Retain notices. Inspected commit 2026-11-04 UTC is a research snapshot; select/reproduce a release separately.

### E2 — ethers

**Code inspected:** [TypedDataEncoder.hash/hashDomain/getPayload and verifyTypedData](https://github.com/ethers-io/ethers.js/blob/3ea4c226dd0b3a074abf90748de9d11192027f4f/src.ts/hash/typed-data.ts); [BrowserProvider/discover](https://github.com/ethers-io/ethers.js/blob/3ea4c226dd0b3a074abf90748de9d11192027f4f/src.ts/providers/provider-browser.ts).

**Use here:** alternative proposed `packages/wallet/test/interop/evm-terms-ethers.test.mjs`, or static vectors with provenance next to `packages/wallet/test/evm-terms.test.mjs`. Do not add both full viem and ethers runtime stacks to validate one path. Avoid optional name resolution changing canonical inputs.

**Acceptance:** cross-check independently authored vectors against local code and independent libraries before freezing expected bytes. Test E1's domain/signature/session cases. Runtime signing stays behind application review and session boundaries.

**Discovery distinction:** EIP-6963 requires page-lifetime listening. Local discovery intentionally uses a bounded, user-triggered three-second window and calls itself event-compatible rather than fully conformant. Preserve that distinction; a discovery helper cannot select the app's privacy policy. [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963), [local discovery](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/discovery.ts).

**License/maintenance:** MIT; retain Richard Moore notices. Inspected commit 2026-06-18 updates distribution artifacts. No real wallet matrix was executed by this review.

## 5. Mobile provider candidates: explicit conditions

### M1 — WalletConnect EthereumProvider and SignClient

**Code inspected:** [EthereumProvider.connect/request/disconnect/registerEventListeners](https://github.com/WalletConnect/walletconnect-monorepo/blob/63094dcb6fded05dcbc2b08b8895ada75a31dcb5/providers/ethereum-provider/src/EthereumProvider.ts); [SignClient engine](https://github.com/WalletConnect/walletconnect-monorepo/blob/63094dcb6fded05dcbc2b08b8895ada75a31dcb5/packages/sign-client/src/controllers/engine.ts); [URI helpers](https://github.com/WalletConnect/walletconnect-monorepo/blob/63094dcb6fded05dcbc2b08b8895ada75a31dcb5/packages/utils/src/uri.ts). The provider forwards requests through its signer and maps account/chain/session-deletion events. These are actual session functions beyond the existing helper intake.

**Use here:** proposed `packages/wallet/src/walletconnect-provider.ts` implementing existing `Eip1193Provider` for `evm-adapter.ts`; proposed `apps/web/src/journey/mobile-wallet.ts` for explicit launch/return UX. Retain `createEvmExecution` and journal reservation/sending/broadcast ownership. [Execution port](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/evm-execution.ts).

**Glue/tests:** select least required account/chain/method/event namespaces, relay/project/routing and session lifetime; encrypted persistence/purge; resume after process loss; account/chain/session invalidation; expiry; cancellation/unknown outcomes; allowed launch and registered return origin/path. Qualify actual Android/iOS/browser-wallet combinations. A callback is a return event, not finality or permission to resend. Test rejection, timeout, late replies and lost handoff against one-send journal semantics. Keep real pairing material out of logs.

**License disposition: conditional.** Root and provider package texts are the **WalletConnect Community License**, release 2025-08-20. They include attribution, a proprietary Network connection requirement absent explicit permission otherwise, commercial triggers above **2,500,000 monthly RPCs or 500 MAUs**, and assignment of rights in modifications/derivative works to Reown, with a limited grant back and an obligation to provide their source and binary code. The text reserves threshold changes and incorporates other terms; it distinguishes applications/wallets from modifications to licensed items. This evidence does not support copying/relicensing it as MIT or assuming unrestricted self-hosted gateway use. Resolve applicable terms and service/routing policy before adoption. [Exact provider license](https://github.com/WalletConnect/walletconnect-monorepo/blob/63094dcb6fded05dcbc2b08b8895ada75a31dcb5/providers/ethereum-provider/LICENSE.md).

**Maintenance/evidence:** source snapshot dated 2026-10-08. Preserve existing 2.26.0 intake, historical signature limitations and source/bundle correspondence work. Reading a newer commit does not replace package qualification.

### M2 — Reown AppKit

**Code inspected:** [WagmiAdapter configuration/watchers/connectors](https://github.com/reown-com/appkit/blob/8f9f39f1dfe0a21bb619dd9a33b6d7500523298b/packages/adapters/wagmi/src/client.ts). It builds Wagmi configuration, manages account/connection watchers and integrates multiple connector paths, broader than the provider-only seam.

**Use here:** only if that UX/configuration model is selected, proposed `apps/web/src/wallet-ui/reown.ts`. Keep journey state, agreement verification and economic execution outside connector/modal callbacks.

**Glue/tests:** enumerate enabled connectors/features and endpoint behavior; verify no unintended pre-action wallet/account activity, policy-compliant routing, unsubscribe/disconnect cleanup and stale-session rejection. Test modal dismissal, app switching, late selection and process resume with existing journal ownership.

**Disposition/license:** prefer M1's smaller seam if its terms/profile are accepted; defer full AppKit unless extra features are wanted. Actual **Reown Community License**, release 2025-08-25, likewise contains Network, commercial-threshold and modification provisions; it is not MIT. [Exact AppKit license](https://github.com/reown-com/appkit/blob/8f9f39f1dfe0a21bb619dd9a33b6d7500523298b/LICENSE.md). Snapshot commit 2026-10-10 migrates to Wagmi v3, so compatibility needs an exact build profile. No claims about enabled telemetry/default features were inferred without a complete configuration audit.

## 6. Native Solana/SPL: reusable building blocks

A library cannot select application custody semantics. Define program/deployment identity, PDA seeds/bumps, ownership/layout/discriminators, instruction bytes/IDL hash, SOL/SPL token programs/mint policies, deadlines, finality/history and recovery first. [Existing decisions](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/PENDING-DECISIONS.md). PDA derivation computes an address; account initialization is separate. [Official PDA documentation](https://solana.com/docs/core/pda/pda-derivation).

### W1 — Wallet Standard core

**Code inspected:** [getWallets/get/on](https://github.com/wallet-standard/wallet-standard/blob/c49b56d60fbac2e68e0f3536707fa33030652f9e/packages/core/app/src/wallets.ts); [registerWallet](https://github.com/wallet-standard/wallet-standard/blob/c49b56d60fbac2e68e0f3536707fa33030652f9e/packages/core/wallet/src/register.ts); [StandardConnect](https://github.com/wallet-standard/wallet-standard/blob/c49b56d60fbac2e68e0f3536707fa33030652f9e/packages/core/features/src/connect.ts); [StandardEvents](https://github.com/wallet-standard/wallet-standard/blob/c49b56d60fbac2e68e0f3536707fa33030652f9e/packages/core/features/src/events.ts).

**Use here:** proposed `packages/wallet/src/solana-discovery.ts` and `solana-adapter.ts`. Consume the app registry; `registerWallet` is wallet-side reference code, not authority to impersonate installed wallets. Bridge registration/account changes to generation-bound sessions using EVM invalidation conventions.

**Glue/tests:** exact chain/feature checks, bounded untrusted metadata, registration/unregistration, connect rejection, account changes during review/signing, disconnect, stale generation and disposal. Discovery returns objects with executable features; it is not ownership or a capability grant. Apache-2.0, with relevant license/notice/modification obligations. Observed release-merge commit 2026-06-03.

### W2 — Solana Wallet Standard features

**Code inspected:** [SolanaSignTransaction](https://github.com/anza-xyz/wallet-standard/blob/c4d06f9f2668ebec3f2747c9fcf5e2382a2fc36f/packages/core/features/src/signTransaction.ts); [SolanaSignAndSendTransaction](https://github.com/anza-xyz/wallet-standard/blob/c4d06f9f2668ebec3f2747c9fcf5e2382a2fc36f/packages/core/features/src/signAndSendTransaction.ts); [SolanaSignMessage](https://github.com/anza-xyz/wallet-standard/blob/c4d06f9f2668ebec3f2747c9fcf5e2382a2fc36f/packages/core/features/src/signMessage.ts). Sign-only returns signed transaction bytes; sign-and-send returns a signature and requires a chain. Transaction version support is explicit; inspected types include legacy, 0 and 1.

**Use here:** proposed `solana-adapter.ts` plus `packages/wallet/src/solana-execution.ts`. Check connected account features/supported versions; listing version 1 in a type does not qualify every wallet or program.

**Glue/tests:** choose one broadcast owner, reject unsupported versions before requesting action, validate returned signed bytes against the prepared transaction, persist signature/lifetime before observation, and invalidate on account/chain changes. Define native signed-terms messages independently of EIP-712. Exercise sign-only and wallet-broadcast modes separately; a delayed result must not trigger another send. Apache-2.0; release-merge commit 2026-10-05.

### S1 — Solana Kit

**Code inspected:** [getProgramDerivedAddress](https://github.com/anza-xyz/kit/blob/4f9b869e81ccb599d9b61f22b554508185b3ef98/packages/addresses/src/program-derived-address.ts); [RPC construction](https://github.com/anza-xyz/kit/blob/4f9b869e81ccb599d9b61f22b554508185b3ef98/packages/rpc/src/rpc.ts); [createBlockHeightExceedencePromiseFactory](https://github.com/anza-xyz/kit/blob/4f9b869e81ccb599d9b61f22b554508185b3ef98/packages/transaction-confirmation/src/confirmation-strategy-blockheight.ts); [recent-transaction and nonce confirmation waiters](https://github.com/anza-xyz/kit/blob/4f9b869e81ccb599d9b61f22b554508185b3ef98/packages/transaction-confirmation/src/waiters.ts).

**Use here:** proposed `packages/chain-solana/src/pda.ts`, `rpc.ts`, `prepare.ts` and `observe.ts`, a sibling to existing `packages/chain-evm`. Choose modular dependencies. Integrate native observations with `packages/domain/src/intent-journal.ts:createLifecycleJournal` after selecting native observation fields. [Existing journal](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/domain/src/intent-journal.ts).

**Glue/tests:** bind RPC answers to exact network/program/accounts and commitment; persist blockhash, last-valid-block-height and signature; bound/cancel RPC/subscriptions; distinguish observed, confirmed/finalized, expired and unknown. Test slow wallets, lagging/disagreeing RPCs, expired blockhashes, reload after submission and cancellation before/after sending. Expiry requires reconciliation and explicit new preparation, not silent re-sign/resend. [Official confirmation/expiration](https://solana.com/developers/cookbook/transactions/confirmation).

**License/maintenance:** MIT; retain notices. Observed commit 2026-11-03. SDK success is not a custody-program or finality-policy qualification.

### S2 — Anchor

**Code inspected:** [Account::try_from](https://github.com/otter-sec/anchor/blob/5193a025c12476634df435c442ff0358058e003f/lang/src/accounts/account.rs); [Signer](https://github.com/otter-sec/anchor/blob/5193a025c12476634df435c442ff0358058e003f/lang/src/accounts/signer.rs); [account constraint generation](https://github.com/otter-sec/anchor/blob/5193a025c12476634df435c442ff0358058e003f/lang/syn/src/codegen/accounts/constraints.rs). Checked account conversion validates program owner and deserializes the expected account. The explicit unchecked-discriminator alternative should not become a default substitute.

**Use here:** proposed `contracts/solana/programs/basic-escrow/src/lib.rs` and adjacent generated IDL/fixtures. Checked accounts and signer/constraint machinery reduce bespoke parsing; they do not define account relations, conservation, deadlines or exits.

**Glue/tests:** independent instruction/account discriminator/PDA vectors; signer/owner/account binding; native SOL and approved SPL conservation; duplicate instructions; deadline edges; rent/closure; interruption and both exits. Use a pinned actual local validator after implementation. Keep Rust program selection distinct from JavaScript client compatibility.

**License/maintenance:** Apache-2.0. Inspected canonical repository is `otter-sec/anchor`; earlier owner URLs redirected. Observed commit 2026-11-03. Select compatible stable framework/compiler/validator artifacts rather than moving HEAD. No example escrow was promoted to production custody.

### S3 — SPL Token

**Code inspected:** [getTransferCheckedInstruction and data codec](https://github.com/solana-program/token/blob/737788ff5bcc3f1f44cfb222f25483187650be76/clients/js/src/generated/instructions/transferChecked.ts); [Processor::process_transfer](https://github.com/solana-program/token/blob/737788ff5bcc3f1f44cfb222f25483187650be76/program/src/processor.rs). The client encodes integer amount/expected decimals. Program processing checks frozen state, balances, source/destination mint agreement, expected mint decimals, authority and checked arithmetic.

**Use here:** proposed `packages/chain-solana/src/spl-token.ts` and native program transfer/CPI paths. Consume selected generated-client dependencies rather than maintaining hand-edited generated copies. Bind mint/token-program/account ownership and integer base units to the selected profile.

**Glue/tests:** wrong mint/decimals/program, unsupported assets, freeze/delegate behavior, deposit/exit conservation, associated-token-account creation/rent, closure and independent instruction decoding. Legacy SPL Token and Token-2022 require distinct profiles; evaluate extensions individually instead of claiming all SPL assets work. [Official extensions](https://solana.com/solutions/token-extensions).

**License/maintenance:** Apache-2.0 with generated-source provenance. Observed commit 2026-10-27. Token2022 extension implementation was not independently audited here.

## 7. H1 — ws belongs at a selected host boundary

**Code inspected:** [Receiver limits](https://github.com/websockets/ws/blob/335a610c216c982174e746ecec1db448c1a6ec1b/lib/receiver.js); [browser entry](https://github.com/websockets/ws/blob/335a610c216c982174e746ecec1db448c1a6ec1b/browser.js). Receiver code has finite payload/fragment/buffered-chunk controls. The browser entry directs browser users to native WebSocket.

**Use here:** if a host is selected, proposed `apps/relay-companion/src/connector.ts` can implement existing `packages/relay/src/pool.ts:RelayConnector`. This is a proposed app, not an existing architecture decision.

**Preserve completed intake:** version 8.22.1 already has six passing isolated cases, including a 65,536-byte fixture, oversize refusal, fragmentation/chunk caps, compression off and incomplete-message cleanup. Do not repeat it and call it newly implemented transport. [Actual intake](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/security/intake/relay-transport/README.md).

**Remaining acceptance:** host packaging/authentication/current-scope binding, routing/endpoint policy, IPC backpressure, process lifecycle and supported versions. Verify browser/host shutdown and cancellation together. Browser complete-message allocation remains separate. MIT actual license; inspected 2026-11-03 commit concerns mask-buffer retention and does not automatically replace the evaluated 8.22.1 pin.

## 8. Immutable source/license manifest

All linked license files were read as actual text. The date is the observed GitHub commit timestamp for the inspected snapshot, **not** a verified latest published release, vulnerability assessment or complete maintenance rating. Retrieval was during the research date stated above.

| ID | Repository | Inspected commit | Observed commit date (UTC) | License evidence |
|---|---|---|---|---|
| N1 | [nbd-wtf/nostr-tools](https://github.com/nbd-wtf/nostr-tools) | [`a59c053e820d`](https://github.com/nbd-wtf/nostr-tools/commit/a59c053e820d58bfc85372612d1515b7cdd9fa5c) | 2026-11-02 | [Actual license file](https://github.com/nbd-wtf/nostr-tools/blob/a59c053e820d58bfc85372612d1515b7cdd9fa5c/LICENSE) |
| N2 | [nostr-dev-kit/ndk](https://github.com/nostr-dev-kit/ndk) | [`4b86acd13fe3`](https://github.com/nostr-dev-kit/ndk/commit/4b86acd13fe3c1284fddcb81a7f0d63e491db64a) | 2026-04-05 | [Actual license file](https://github.com/nostr-dev-kit/ndk/blob/4b86acd13fe3c1284fddcb81a7f0d63e491db64a/LICENSE) |
| N3 | [MostroP2P/mostro-core](https://github.com/MostroP2P/mostro-core) | [`97a1fa84fa81`](https://github.com/MostroP2P/mostro-core/commit/97a1fa84fa81d92368c852b943eabf3711564aa2) | 2026-10-07 | [Actual license file](https://github.com/MostroP2P/mostro-core/blob/97a1fa84fa81d92368c852b943eabf3711564aa2/LICENSE) |
| E1 | [wevm/viem](https://github.com/wevm/viem) | [`bf3ffc52b563`](https://github.com/wevm/viem/commit/bf3ffc52b5633afebacf3d728d846080f1668f30) | 2026-11-04 | [Actual license file](https://github.com/wevm/viem/blob/bf3ffc52b5633afebacf3d728d846080f1668f30/LICENSE) |
| E2 | [ethers-io/ethers.js](https://github.com/ethers-io/ethers.js) | [`3ea4c226dd0b`](https://github.com/ethers-io/ethers.js/commit/3ea4c226dd0b3a074abf90748de9d11192027f4f) | 2026-06-18 | [Actual license file](https://github.com/ethers-io/ethers.js/blob/3ea4c226dd0b3a074abf90748de9d11192027f4f/LICENSE.md) |
| W1 | [wallet-standard/wallet-standard](https://github.com/wallet-standard/wallet-standard) | [`c49b56d60fba`](https://github.com/wallet-standard/wallet-standard/commit/c49b56d60fbac2e68e0f3536707fa33030652f9e) | 2026-06-03 | [Actual license file](https://github.com/wallet-standard/wallet-standard/blob/c49b56d60fbac2e68e0f3536707fa33030652f9e/LICENSE) |
| W2 | [anza-xyz/wallet-standard](https://github.com/anza-xyz/wallet-standard) | [`c4d06f9f2668`](https://github.com/anza-xyz/wallet-standard/commit/c4d06f9f2668ebec3f2747c9fcf5e2382a2fc36f) | 2026-10-05 | [Actual license file](https://github.com/anza-xyz/wallet-standard/blob/c4d06f9f2668ebec3f2747c9fcf5e2382a2fc36f/LICENSE) |
| M1 | [WalletConnect/walletconnect-monorepo](https://github.com/WalletConnect/walletconnect-monorepo) | [`63094dcb6fde`](https://github.com/WalletConnect/walletconnect-monorepo/commit/63094dcb6fded05dcbc2b08b8895ada75a31dcb5) | 2026-10-08 | [Actual license file](https://github.com/WalletConnect/walletconnect-monorepo/blob/63094dcb6fded05dcbc2b08b8895ada75a31dcb5/LICENSE.md) |
| M2 | [reown-com/appkit](https://github.com/reown-com/appkit) | [`8f9f39f1dfe0`](https://github.com/reown-com/appkit/commit/8f9f39f1dfe0a21bb619dd9a33b6d7500523298b) | 2026-10-10 | [Actual license file](https://github.com/reown-com/appkit/blob/8f9f39f1dfe0a21bb619dd9a33b6d7500523298b/LICENSE.md) |
| S1 | [anza-xyz/kit](https://github.com/anza-xyz/kit) | [`4f9b869e81cc`](https://github.com/anza-xyz/kit/commit/4f9b869e81ccb599d9b61f22b554508185b3ef98) | 2026-11-03 | [Actual license file](https://github.com/anza-xyz/kit/blob/4f9b869e81ccb599d9b61f22b554508185b3ef98/LICENSE) |
| S2 | [otter-sec/anchor](https://github.com/otter-sec/anchor) | [`5193a025c124`](https://github.com/otter-sec/anchor/commit/5193a025c12476634df435c442ff0358058e003f) | 2026-11-03 | [Actual license file](https://github.com/otter-sec/anchor/blob/5193a025c12476634df435c442ff0358058e003f/LICENSE) |
| S3 | [solana-program/token](https://github.com/solana-program/token) | [`737788ff5bcc`](https://github.com/solana-program/token/commit/737788ff5bcc3f1f44cfb222f25483187650be76) | 2026-10-27 | [Actual license file](https://github.com/solana-program/token/blob/737788ff5bcc3f1f44cfb222f25483187650be76/LICENSE) |
| H1 | [websockets/ws](https://github.com/websockets/ws) | [`335a610c216c`](https://github.com/websockets/ws/commit/335a610c216c982174e746ecec1db448c1a6ec1b) | 2026-11-03 | [Actual license file](https://github.com/websockets/ws/blob/335a610c216c982174e746ecec1db448c1a6ec1b/LICENSE) |

MIT candidates require covered copyright/permission notices. Apache-2.0 candidates require license/relevant notice retention, identification of modifications, and attention to patent/trademark conditions. Unlicense dedication does not remove dependency provenance work. Reown/WalletConnect require the separate acceptance decision described above. These are intake findings, not legal approval.

The coordinating review found no root project LICENSE and noted existing source-level licensing, including the canonical escrow's SPDX declaration. Upstream licensing cannot resolve target-project ownership or permission to relicense its code. Update `THIRD_PARTY_NOTICES.md` and selected package/license evidence before source adaptation or new distribution.

**Evidence scope:** all 13 recommendations have inspected implementation/type source, not just a README. Official EIP/NIP/Solana documentation supplements code inspection. High-level setup/search leads were not promoted into code recommendations. No complete upstream security audit, package-lock audit, physical-wallet trial or local-validator run was performed for this report.

## 9. Recommended implementation order

1. **Freeze the peer carrier.** Specify version/schema, signature/account/messaging-key binding, size and replay/expiry rules through the existing decision workflow. Preserve revision-only chat acceptance and deployed ABI semantics.
2. **Add independent fixtures.** Use N1 and E1 or E2 to establish canonical bytes and accepted/rejected public cases across implementations. Passing tests must not remove qualification flags.
3. **Implement the chosen carrier bridge.** Proposed schema/exchange modules feed the existing verifier. Require independent second-client vectors, version compatibility, duplicate/late/reordered delivery and recovery.
4. **Select the mobile profile.** Resolve license/service/routing conditions, then implement session/handoff glue behind existing wallet/journal ports. Physical devices/wallets produce separate acceptance evidence.
5. **Implement native Solana against a frozen profile.** Select program/toolchain, then W1/W2/S1/S2/S3 modules where appropriate. Build native SOL first, then approved SPL profiles, with actual validator exits and recovery.
6. **Add a companion only if the selected transport profile needs it.** Reuse H1 intake and preserve policy authorization/lifecycle ownership.

The remaining custom work is protocol definition, identity/account binding, lifecycle ownership and native chain semantics. These upstream candidates supply encoding, signing interfaces and transport machinery at precise integration points while retaining the significant implementation already present.
