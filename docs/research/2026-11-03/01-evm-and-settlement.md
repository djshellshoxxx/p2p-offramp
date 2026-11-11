# EVM escrow, chain evidence, and manual fiat settlement: remaining decisions

**Research date:** 2026-11-03 America/Vancouver; sources retrieved 2026-11-04 UTC. **Status:** research and proposed acceptance criteria only. No implementation, deployment, transaction, formal run, or qualification approval was performed for this report.

## Finding

The next useful work is to qualify one precise escrow, account, asset, RPC, and fiat-rail profile. Rebuilding already implemented escrow or retry logic would duplicate substantial work. The unresolved issues are the meaning of accepted consent, the trust placed in chain observations, payment-rail recovery rights, and evidence connecting the exact application artifact to its intended deployment.

The reviewed baseline is `main` **e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa** and the still-unmerged PR26 head **94554ecf9854e4604f9f56afe5bebedeee931994**. The canonical `BasicEscrow.sol`, EVM reader, agreement verifier, terms encoder, and payment-preflight files have identical blob identities across these two snapshots; `evm-execution.ts` differs. PR26's historical local acceptance therefore remains distinct from merged delivery and production qualification. Its remainder records `ReleaseEnabled: 0`, `approvedReleasePin: null`, and English safety-copy revision 3 as draft and ineligible for funds use. Nothing below promotes those states. [R01] [R03] [R04] [R05] [R06] [R07] [R08]

## Existing behavior that the next tranche must preserve

| Area | Observed implementation or recorded evidence | Remaining boundary |
|---|---|---|
| Canonical basic-v1 | Seller funds and alone releases before expiry; anyone can trigger expiry refund to the stored seller. No operator destination override. | Seller cooperation and fiat receipt are not enforced on-chain. [R01] [R02] |
| Consent | Canonical funding binds the EIP-712 terms digest and a single-use seller nonce. It does **not** verify buyer signatures on-chain. The separate agreement helper verifies two EOA acceptances but returns `testOnly: true` and `economicPreparationAllowed: false`. | Require evidence of the actual accepted-consent-to-preparation integration. A helper result is not launch authority. [R01] [R05] [R06] |
| Chain evidence | Canonical payment preflight checks chain/genesis/runtime identity and repeated finalized anchors. A separately anchored latest-state read can veto guidance and tighten the expiry window. | A consistently dishonest single RPC is not independently detected by these checks. [R03] [R04] |
| Terminal state | Release/refund attempts payment, then records a fixed-beneficiary withdrawal credit if payment fails. | Terminal state does not necessarily mean the beneficiary received funds. [R01] [R02] [R09] |
| Recovery | Canonical recovery constructs unsigned original-deployment calls, rereads native state, and keeps uncertain broadcast separate from a safe retry. | Actual wallet/device/off-device recovery and authenticated distribution remain qualification evidence. [R07] [R09] |
| Formal status | One partition is proved under its declared model; unauthorized-release and early-refund atomicity remain `PROOF_UNKNOWN_QUERY_TIMEOUT`; attempts are 3/3. | Guard-only proofs, a native refinement witness, and whole-contract/bytecode proofs are different claims. [R08] [R10] |

**Do not combine the two escrow profiles.** The canonical contract uses `getTrade` and deferred payout credits. The isolated `packages/escrow-evm` contract checks EOA/ERC-1271 signatures, has a different getter layout and compiler profile, and reverts a failed payout. `packages/chain-evm` documents the isolated `escrows(bytes32)` layout and is excluded from the default application build. Its tests cannot qualify the canonical preflight merely because both return six ABI words. [R03] [R04] [R11]

## Decision register and closure criteria

Categories describe the next required work: **R** research-answerable; **I** implementation/integration evidence; **Q** qualification against actual artifacts or counterparties; **O** owner selection. Several decisions require more than one category.

| ID | Category | Decision or evidence still needed | Concrete closure condition |
|---|---|---|---|
| EVM-01 | O → I → Q | Select canonical basic-v1 consent/account profile. | Written profile names contract ABI, account types, who verifies acceptance, verification time, and exact persisted binding; a source-bound end-to-end witness connects both accepted terms to permitted preparation. |
| EVM-02 | R → O → Q | Choose the trust model for chain evidence. | Named providers or node/light-client arrangement, independence assessment, supported RPC methods, stale/disagreement policy, and measured traces for the exact deployment. |
| EVM-03 | R → O → Q | Qualify payment time margin and head freshness. | Rail-specific payment/review/inclusion measurements justify a margin; stale or conflicting time evidence blocks guidance; near-expiry UX and late-arrival handling are reviewed. |
| EVM-04 | R → O → Q | Choose native-only or individually admitted tokens. | Each chain/token has an immutable identity record, effective implementation/issuer-control review, exact-transfer evidence, and explicit freeze/upgrade disposition. |
| EVM-05 | I → Q | Prove user-visible settlement and recovery claims. | Receipt, stored state, delivered amount, deferred credit, and unknown broadcast remain distinguishable through restart and standalone recovery. |
| EVM-06 | Q | Qualify a Sepolia artifact before considering production. | Exact source/build/ABI/deployment identity and real testnet wallet traces cover funding, release, expiry refund and deferred withdrawal; exclusions are recorded. |
| FIAT-01 | R → O → Q | Select jurisdiction, currency, rail, bank/account product, and permitted activity. | Written current provider terms and operator facts establish permitted use, relevant returns/disputes, record needs, and responsibility for loss. |
| FIAT-02 | R → I → Q | Define seller-confirmation semantics. | Copy distinguishes personally observed receipt from irreversibility and cryptographic verification; bank notification/screenshots do not become native-chain evidence. |
| FORMAL-01 | R → O → Q | Decide whether a new proof scope is worthwhile. | A separately frozen model, budget, source/tool pins, assumptions, outcomes and reviewer disposition; original UNKNOWN results remain retained. |

### 1. Finality and canonicality: retain the existing conservative rule

Ethereum proof-of-stake finality is a consensus property based on checkpoint votes; it is not established by a fixed elapsed period. JSON-RPC distinguishes `latest`, `safe`, and `finalized`. Continue refusing missing or malformed finalized evidence; do not add a confirmation-count or `latest` fallback merely to make payment guidance available. [E05] [E07]

The canonical preflight currently reads by block number and repeats anchors around code and state calls. A possible **new** provider-profile decision is EIP-1898 hash-bound reads with `requireCanonical: true`, where supported. This reduces cross-call ambiguity and explicitly asks the server for its canonicality judgment. It still trusts that server: the EIP says canonical “according to the callee.” It does not transform an RPC answer into a consensus proof. Unsupported providers require an explicit profile decision, not a silent downgrade. [R03] [E04]

Select among three defensible arrangements: a named single-provider trust assumption; corroboration from meaningfully independent providers with disagreement causing refusal; or a separately qualified own-node/light-client arrangement. Corroboration improves fault detection but common upstreams and coordinated stale responses remain limitations. Record independence, authentication, freshness, archive availability, and outage behavior. The existing reader explicitly says independent corroboration/light-client verification is absent; no claim of either should be inferred from current local tests. [R04]

The latest-state veto is useful because a release/refund can occur after the finalized snapshot. It cannot guarantee that state remains unchanged while a buyer opens a banking application. The remaining research is a defensible **payment opportunity window**, including fiat transfer delay, manual review, wallet interaction, and transaction inclusion. No universal “wait N minutes” value can establish both timely payment and fiat irreversibility. Retain binding-specific preflight invalidation after account, network, terms, deployment, or generation changes. [R03] [R07] [E05] [E14] [E15] [E16] [E17]

### 2. Consent, account types, and nonce semantics

EIP-712 supplies typed data and domain separation; it explicitly supplies no replay protection. Here, the application’s terms schema and contract nonce/trade-ID checks carry those additional obligations. Evidence must bind chain ID, verifying contract, order/revision, parties, base-unit amount, asset, private-agreement and capability hashes, and both deadlines to the same reviewed terms. The registry meaning of `networkId` and `deploymentId` remains off-chain. [E01] [R01] [R02] [R06]

Do not describe the basic contract as cryptographically proving mutual agreement: funding proves that the seller authorized funding under those terms. Buyer acceptance is a client requirement by design. Promoting the isolated signature escrow would be a new protocol, ABI, payout, migration and review decision—not a transparent implementation swap. [R01] [R05] [R11]

For an initial profile, explicitly select supported EOA behavior and reject or separately qualify contract/delegated accounts. ERC-1271 validity may depend on changing state, time and wallet authorization; a valid historical check does not establish permanent validity. EIP-7702 also allows an EOA to carry delegation code. Avoid inferring account behavior solely from the label “EOA” or from traditional code-empty heuristics. If these profiles are admitted, record which chain-anchored account/delegation state is checked, when consent must remain valid, and what invalidates a prepared action. This is a compatibility and acceptance-policy question, not evidence of a reproduced defect. [E02] [E10]

Keep separate the **seller terms nonce** that prevents term reuse and the **wallet transaction nonce** used for broadcast ordering/replacement. An unknown post-send outcome must remain unresolved until exact native evidence resolves it; lack of a receipt is not permission to resend or refund. Existing durable markers and recovery rules already establish that policy. [R01] [R07] [R09]

### 3. Assets, deferred liabilities, and recovery

A native-only first qualification candidate reduces issuer-policy variables, but still requires recipient and wallet behavior qualification. It is a recommendation for owner selection, not an approved release configuration.

ERC-20 compatibility is insufficient admission evidence. The standard requires handling `false`; OpenZeppelin’s wrappers also support no-return tokens. Neither establishes exact economic transfer, constant balances, absence of fees/hooks, or future transfer availability. Review the exact deployed token and the repository’s pinned library version, not merely current generic documentation. [E03] [E08] [R02] [R11]

Circle illustrates why token qualification must be precise. Its published implementation uses a proxy with upgrade, pause and address-blocklisting controls. Circle separately explains that blocklisting can prevent transfers and make balances inaccessible, while distinguishing that from reversal of a completed transfer. A stable proxy-code hash alone does not freeze effective implementation behavior. Admission therefore needs implementation/admin identification and an explicit change policy, or exclusion where those controls conflict with the basic-v1 asset policy. This is not a finding that any particular deployment has been verified or frozen. [E11] [E12]

For recovery and UI, represent three independent facts: the trade’s terminal state, actual recipient delivery, and remaining fixed-recipient credit. `pendingWithdrawals[recipient][asset]` aggregates liabilities across trades; it is not a newly attributable per-trade amount. A failed withdrawal preserves the credit, but a permanently rejecting recipient or externally frozen token can prevent eventual delivery. Therefore “recoverable credit exists” is supportable; “funds can always be recovered” is not. Changing recipients would require a separate custody/authorization design. [R01] [R02] [R09]

### 4. Manual fiat confirmation: the essential research result

Use a narrow claim such as: **“I checked my receiving account and observed the agreed amount and currency. I choose to release the escrow.”** Accompany it with the selected rail’s reviewed explanation of disputes and recovery rights. The app cannot infer this claim from a screenshot, payer message, email, or blockchain receipt; the canonical contract cannot verify fiat payment. [R02] [E13] [E14]

Interac’s published fraud guidance says a sender cannot reverse a transfer once deposited. RBC’s public disclosure nevertheless says deposited Interac funds may be returned following a fraud claim or suspected fraudulent, unlawful, or improper activity, including by debiting the receiving account into overdraft. These statements concern different actors and processes. “Not sender-cancellable after deposit” must not become “the bank can never recover the funds.” The RBC disclosure is evidence of one institution’s published position, not a universal rule or confirmation of the eventual operator’s account contract. [E13] [E14]

Other rail rules cannot be copied across products: FCAC describes a usual 90-calendar-day reporting window for unauthorized preauthorized debits; Nacha’s summary limits erroneous-entry reversals to specified errors and five banking days; PayPal Canada lists exclusions from seller protection, including financial products and personal payments. None establishes a generic cryptocurrency-trade guarantee, and the ACH reversal window is not an exhaustive boundary for all returns or claims. [E15] [E16] [E17]

The owner must obtain the applicable institution/product agreement and permitted-use answer for the actual activity. Collect sufficient transaction references, identity-matching expectations, return/dispute mechanisms and deadlines, handling of partial/late/third-party payments, and loss allocation. Keep sensitive payment records out of public research notes.

The accepted manual-settlement economic risk also remains: a seller can observe fiat receipt, withhold release, and later receive the escrow refund. Better wording cannot remove that incentive. Eliminating it would require a separately selected enforcement/dispute/oracle design and corresponding research; it is deferred from basic-v1 qualification. [R02]

## Bounded acceptance experiments to commission next

These are proposed benign tests in controlled local fixtures or explicitly authorized testnet environments. Existing successful evidence should be reused where the same exact property, source and environment are already covered.

| Experiment | Required observation / closure evidence |
|---|---|
| Canonical ABI separation | The canonical preflight and recovery decode canonical `getTrade` fields; an isolated-profile witness cannot satisfy that acceptance record. |
| Finalized evidence | Missing, malformed, stale, inconsistent and changing anchors block guidance; selected provider combinations produce retained agreement/disagreement traces. |
| Deadline transition | Latest state/time can veto a previously finalized funded observation; expiry equality and late receipt are described consistently across app and recovery. |
| Consent identity | Changing one accepted binding field or account/profile invalidates preparation; valid happy-path acceptance is demonstrated through the actual application carrier. |
| Broadcast uncertainty | Disconnect/restart after the durable send marker retains unknown status, prevents automatic resend, and reconciles only against the exact transaction and stored escrow state. |
| Native deferred credit | Controlled rejecting then accepting recipient demonstrates terminal-plus-credit, failed-withdrawal preservation, fixed beneficiary, and eventual observed delivery. |
| Shared-recipient liability | Two controlled trades distinguish per-trade state from aggregate recipient/asset credit; display never assigns the whole aggregate to one trade. |
| Token candidate | Each admitted exact artifact meets declared debit/receipt and payout assumptions; upgrades, freezes and unsupported behavior follow an explicit refusal or review policy. |
| Real Sepolia wallets | Source/build/runtime/ABI/registry pins and wallet versions accompany actual testnet transaction evidence and original-deployment recovery. |
| Fiat copy comprehension | Reviewers correctly distinguish sender cancellation, bank recovery, seller observation, crypto delivery, and withholding risk for the selected rail. |

Sepolia is currently Ethereum’s recommended application testnet and uses a permissioned validator set. Successful Sepolia execution qualifies that tested environment and artifact combination; it does not establish production liquidity, fee conditions, bank acceptance, economic fairness, independent audit coverage, or production deployment identity. The existing `scripts/sepolia/trade.mjs` is a qualification starting point, not a completed witness. [E06] [R12]

## New formal scope: useful alternatives to an exhausted rerun

Keep the **three original whole-target UNKNOWN results** separate from the later T91 partition results: constructor proved under its declared compiler model, two partitions still `PROOF_UNKNOWN_QUERY_TIMEOUT`, and the 3/3 attempt budget spent. Neither evidence layer overwrites the other. Solidity explains that a timeout cannot decide either case and that external calls are generally modeled as unknown code. Its `require`/`assert` framework proves a stated specification under assumptions; changing assumptions is a new claim. [R08] [R10] [E09]

A useful next proposal is **one-call native frame verification against the exact compiled runtime**, using a bounded symbolic tool such as Halmos. Freeze a reachable funded-state setup, then separately examine unauthorized release and early refund; require refusal and preservation of all relevant escrow and pending-credit fields. Avoid repeatedly exploring unrelated constructor/hash/setup paths. The plan must identify whether the initial state is concrete or symbolic, establish how it is reached, and state the limits of any amount/time/account bounds. This adds a bytecode/state-preservation question; simply reproving the already proved revert predicates would add no closure. Halmos’s own description makes its bounded treatment of loops and variable-length inputs explicit. [R10] [E18]

A second, independent model could cover **native liabilities across two trades sharing a beneficiary**, with separate active principal, pending credit, paid principal and forced-ETH surplus. Begin with fixed, reviewed receiver behaviors and a finite action sequence; document every abstraction and relation to actual contract storage. This extends the current one-trade witness but does not prove arbitrary receiver behavior, unbounded interleavings, ERC-20 semantics, or guaranteed eventual delivery. [R10]

Before execution, freeze a new task ID, exact source/compiler/runtime/tool pins, assertions, setup reachability argument, bounds, finite resource budget, and criteria for PASS/FAIL/UNKNOWN/unsupported outcomes. Require an independently reviewed mapping from the model to the contract. No new run was performed here. The production review still needs the exact deployed artifact, dependency review and unresolved-finding disposition; neither a new symbolic pass nor this research report substitutes for it. [R02] [R08]

## Source ledger

All 18 external sources below were opened/read on **2026-11-04 UTC**. Standards establish semantics; issuer/operator material establishes its publisher’s position. None independently audits P2P Offramp. Historical material is identified. Repository citations are pinned, and repository test counts remain historical rather than newly executed evidence.

| ID | Primary source / publisher / type | Claim supported and boundary |
|---|---|---|
| [E01] | *Typed structured data hashing and signing* — Ethereum EIP-712; standard | Typed domains; no built-in replay protection. Does not specify this app’s lifecycle. |
| [E02] | *Standard Signature Validation Method for Contracts* — ERC-1271; standard | Contract validation can be time/state dependent. Does not qualify any wallet implementation. |
| [E03] | *Token Standard* — ERC-20; standard | Callers must handle false returns. No exact-transfer or issuer-risk certification. |
| [E04] | *Add blockHash to defaultBlock methods* — EIP-1898; standard | Hash-bound reads and server canonicality check. Provider support and honesty require separate evidence. |
| [E05] | *Proof-of-stake (PoS)* — ethereum.org; protocol documentation | Checkpoint-based economic finality. Not an RPC authenticity guarantee or fixed-time promise. |
| [E06] | *Networks* — ethereum.org; network guidance | Sepolia application role and permissioned validators. Testnet evidence does not qualify mainnet. |
| [E07] | *JSON-RPC API* — ethereum.org; API documentation | Distinct latest/safe/finalized block tags. Does not certify a particular endpoint. |
| [E08] | *ERC20 / SafeERC20* — OpenZeppelin Contracts 5.x; library documentation | No-return support and boolean-returning try-transfer helper. Current 5.x docs are not the repository’s exact dependency audit. |
| [E09] | *SMTChecker and Formal Verification* — Solidity 0.8.30; compiler documentation | Assertions, timeout UNKNOWN, external-call abstraction. No inference that repo UNKNOWNs have been resolved. |
| [E10] | *Set Code for EOAs* — EIP-7702; standard | Delegation code changes EOA assumptions. Does not establish support by an app/wallet/chain tuple. |
| [E11] | *Understand Circle’s stablecoin blocklisting process* — Circle Help Center; issuer guidance | Transfer restrictions and inaccessible balances; completed-transfer reversal distinguished. Not an asset/deployment approval. |
| [E12] | *Circle’s Stablecoin Smart Contracts on EVM-compatible blockchains* — circlefin/stablecoin-evm; issuer source README | Proxy, pause, upgrade, blocklisting controls. Pinned source description is not proof of any selected deployed address. |
| [E13] | *Interac e-Transfer fraud guidance* — Interac; historical PDF under 2020/01 | Sender cannot reverse after deposit. Historical sender guidance does not settle recipient-bank fraud recovery rights. |
| [E14] | *3. Accessing Your Account* — RBC Royal Bank; public account disclosure | Interac fraud-return/debit provision. Product applicability and current operative terms require confirmation. |
| [E15] | *Pre-authorized debits (PAD)* — Financial Consumer Agency of Canada; regulator guidance | Usual 90-day unauthorized-PAD reporting rule. Not an Interac rule. |
| [E16] | *RMAG Originator Essentials* — Nacha; official October 2024 summary | Five-banking-day reversal timing and specific-error limitation. Summary is not the full current rules or all return/dispute rights. |
| [E17] | *PayPal’s Seller Protection Program* — PayPal Canada; program terms | Listed financial-product and personal-payment exclusions. Not a determination that a proposed trade is eligible/permitted. |
| [E18] | *Symbolic testing with Halmos for formal verification* — a16z, now a16z Frontier; tool-author explanation | Bounded symbolic execution and completeness limits. Historical explanation requires exact current tool/version qualification before use. |

### Repository evidence inspected

- [R01] — canonical contract at main; also read at PR26 with identical blob.
- [R02] — canonical security self-review and explicit open items at PR26.
- [R03] — native canonical payment preflight at PR26; identical main blob.
- [R04] — isolated read-only adapter README and `reader.ts` at PR26; reader identical on main.
- [R05] — EOA agreement verifier at PR26; identical main blob.
- [R06] — terms encoder at PR26; identical main blob.
- [R07] — execution/journal boundary at PR26; compared with main.
- [R08] — `CURRENT-REMAINDER.json`, including historical checkpoint timestamps, formal attempt budget and qualification state.
- [R09] — canonical recovery instructions at PR26.
- [R10] — formal property/model manifest at PR26.
- [R11] — PR26 domain/EVM review profile comparison; historical author/source-review evidence only.
- [R12] — Sepolia trade script at PR26.

Additional inspected context: `contracts/evm/README.md`, `packages/escrow-evm/README.md`, `packages/domain/src/payment-preflight.ts`, `docs/adr/ADR-CLIENT-SIDE-2026-10-24.md`, `docs/handoffs/LEAN_RELEASE_SCOPE.md`, and the current all-remaining-work prompt. No runtime source or existing status ledger was changed.

[E01]: https://eips.ethereum.org/EIPS/eip-712
[E02]: https://eips.ethereum.org/EIPS/eip-1271
[E03]: https://eips.ethereum.org/EIPS/eip-20
[E04]: https://eips.ethereum.org/EIPS/eip-1898
[E05]: https://ethereum.org/developers/docs/consensus-mechanisms/pos/
[E06]: https://ethereum.org/developers/docs/networks/
[E07]: https://ethereum.org/developers/docs/apis/json-rpc/
[E08]: https://docs.openzeppelin.com/contracts/5.x/api/token/erc20
[E09]: https://docs.soliditylang.org/en/v0.8.30/smtchecker.html
[E10]: https://eips.ethereum.org/EIPS/eip-7702
[E11]: https://help.circle.com/support/en/understand-circle-s-stablecoin-blocklisting-process?id=support_article_view&sysparm_article=KB0011513
[E12]: https://github.com/circlefin/stablecoin-evm/blob/fc85788bc7c23cefe3df1a757133048bfddadeaa/README.md
[E13]: https://www.interac.ca/wp-content/uploads/2020/01/Fraud_E-Transfer_EN.pdf
[E14]: https://www.rbcroyalbank.com/onlinebanking/servicech/disclosures/part2B.html
[E15]: https://www.canada.ca/en/financial-consumer-agency/services/banking/preauthorized-debit.html
[E16]: https://www.nacha.org/sites/default/files/2024-10/RMAG_Originator_Essentials.pdf
[E17]: https://www.paypal.com/ca/legalhub/paypal/seller-protection?locale.x=en_CA
[E18]: https://a16zfrontier.com/posts/article/symbolic-testing-with-halmos-leveraging-existing-tests-for-formal-verification/
[R01]: https://github.com/djshellshoxxx/p2p-offramp/blob/e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa/contracts/evm/src/BasicEscrow.sol
[R02]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/contracts/evm/SECURITY-NOTES.md
[R03]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/evm-payment-preflight.ts
[R04]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/chain-evm/README.md
[R05]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/evm-agreement.ts
[R06]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/evm-terms.ts
[R07]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/src/evm-execution.ts
[R08]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.json
[R09]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/recovery/CANONICAL-EVM.md
[R10]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/contracts/evm/formal/properties.json
[R11]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/audit-2026-11-02/domain-evm.md
[R12]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/scripts/sepolia/trade.mjs
