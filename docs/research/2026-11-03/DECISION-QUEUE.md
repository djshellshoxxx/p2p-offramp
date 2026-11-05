# Decisions and evidence to commission next

This queue translates the research into bounded follow-up work. It does not approve a protocol, change the canonical remainder, assign an absent owner, or claim that a qualification experiment has run. The baseline and source limitations are in the [dossier index](README.md); the exact original remainder IDs are in the [gap map](GAP-MAP.md).

**Active ownership:** continue the proposed D1/D2/D3/D4/D6/D7/D8 packets in PR #29, the repair work in PR #28, and intake of PR #31's separately reported findings. The [concurrent-work note](CONCURRENT-WORK.md) identifies source pins and alternatives. This queue supplies evidence to those decisions; it does not start replacement owner packets.

## 1. Core path: choose one coherent qualification target

**Recommended candidate:** canonical EVM basic-v1, one explicitly selected native asset/network, an explicitly qualified ordinary signing-account class, manual seller receipt confirmation, and no optional economic modules. This narrows the first qualification target while preserving existing escrow economics and original-deployment exits. It is a research recommendation awaiting the project's normal protocol selection, not a new release configuration. [EVM analysis](01-evm-and-settlement.md)

| Order | Research has established | Next concrete deliverable | Evidence that permits the next step |
| --- | --- | --- | --- |
| 1 | Main and PR26 are different delivery states; local success records have their own source checkpoints. | Reconcile the active implementation owner's PR26 change set, current checks and review findings. | Named source/artifact baseline; exact-head check outcomes; unresolved findings explicitly retained. Research notes do not merge or qualify PR26. |
| 2 | Canonical funding does not verify buyer acceptance; a communication-level `terms-accept` is not wallet consent. | Versioned private acceptance envelope, key-role binding, replay/expiry policy and an end-to-end consent-to-preparation contract. | Independent exact-byte vectors and a real two-client exchange tied to the same reviewed terms. [Reports 01](01-evm-and-settlement.md) and [02](02-peer-acceptance-and-relays.md) |
| 3 | Public offer kind30078 conflicts with current NIP-78 usage guidance; the current parser does not answer NIP-42 authentication. | Select a public-offer event profile and concrete relay/inbox/authentication policy. | An explicit standards/compatibility decision followed by actual selected-relay publish, receive, reject, timeout and restart traces. This research did not test live relays. [Report 02](02-peer-acceptance-and-relays.md) |
| 4 | G14 negotiated records and G16 signed capabilities have different fields and limits. | Keep the first core qualification capability set empty; separately freeze the mapping before admitting any nonempty optional profile. | Exact module-to-policy commitments, version negotiation and independent canonicalization vectors. An empty set does not excuse missing core acceptance binding. [Report 02](02-peer-acceptance-and-relays.md) |
| 5 | Repeated finalized-anchor checks still depend on the RPC trust model; terminal state can coexist with deferred credit. | Select the chain-observation trust arrangement, asset policy and user-visible settlement/recovery semantics. | Provider capability/independence record and artifact-specific traces distinguishing escrow state, actual delivery, aggregate credit and uncertain broadcast. [Report 01](01-evm-and-settlement.md) |
| 6 | G15 verifies assets but deliberately rejects nonempty deployments; rotation and archive interpretation remain separate decisions. | Testnet bootstrap identity plus exact deployment profile; a separately reviewed production trust-transition and recovery-archive design. | Authenticated roots, immutable deployment/build evidence, deterministic codec vectors and independently verified recovery artifacts. [Report 04](04-release-trust-and-recovery.md) |
| 7 | A standards-compatible connector or emulated browser does not establish actual wallet handoff, durable restart or assistive-technology behavior. | A small named wallet/browser/device matrix with reproducible test records and explicit exclusions. | Real target-version observations covering approval/rejection, account/network changes, interrupted handoff, storage lifecycle, accessibility and original-deployment recovery. [Report 05](05-wallet-mobile-qr-and-browser.md) |
| 8 | Sender cancellation, bank fraud recovery, seller-observed receipt and cryptographic receipt verification are different claims. | Select the actual rail, institution/account product, operating facts and reviewed release copy. | Current applicable provider terms, loss/dispute handling and a scoped jurisdiction/privacy review of the actual operating model. [Reports 01](01-evm-and-settlement.md) and [09](09-operator-and-jurisdiction-evidence.md) |

Do not serialize all preparation behind the first unresolved choice. Documentation of the actual operating model, source/version inventory, independent encoding fixtures and controlled local qualification planning can proceed in parallel. Actual external evidence must name its own artifact and environment.

## 2. Optional roadmap: research now, admit separately

| Track | Useful conclusion from this batch | Remaining selection or evidence |
| --- | --- | --- |
| Payment proofs | Existing structural inputs and the bounded proof-job lifecycle are implemented. TLSNotary, Reclaim and vlayer/Vouch have different trust, execution and maintenance boundaries. A bank-page proof does not make a transfer irreversible. | Exact source/rail statement, coherent provider artifacts, signer/notary policy, licensing, disclosure binding, browser measurements and review scope. Keep unsupported providers unsupported. [Report 03](03-payment-proofs-and-providers.md) |
| Solana | EVM parity requires a native custody and wallet profile; chain vocabulary and a terms encoder do not supply one. | Program/PDA/layout/IDL/instruction contract, supported token and account types, exact returned signing bytes, upgrade/rent/finality/history policy and native recovery evidence. [Report 06](06-solana-custody-and-parity.md) |
| Identity and privacy | Membership, unique human identity, reputation, private messaging and spend authority are separate capabilities. Earlier source evaluations cannot silently qualify another SDK generation. | Issuer/root/nullifier/score profile; coherent messaging provider; external-wallet stealth spending; precise deletion and independent transfer semantics. [Report 07](07-optional-privacy-and-identity.md) |
| Arbitration and liquidity | Optional authority and atomic funding need their own native contracts and signed capability semantics; basic-v1 supplies neither an arbitrary arbiter override nor a generic liquidity vault. | Exact opted-in ABI, quote/certificate domains, authority/nonce/funding/refund rules, provider versions and deployment evidence. [Report 08](08-arbitration-liquidity-and-physical.md) |
| Meetup and courier | A proof of a supplied location claim is not physical presence; a locker response is only as meaningful as its selected vendor protocol. Existing map and vault limits conflict. | Source-bound proof statement, data/renderer/cache profile, authenticated hardware protocol, separate collateral custody and physical qualification. [Report 08](08-arbitration-liquidity-and-physical.md) |

## 3. What should not be reopened as generic research

- **Escrow and recovery foundations:** preserve the selected canonical implementation and its source-bound local evidence; resolve integration and qualification boundaries. Do not substitute the isolated signature escrow without a new protocol decision.
- **Proof-job lifecycle:** selecting a real proof provider is the missing step; another generic Worker wrapper cannot establish authenticated payment semantics.
- **Release verification:** a second manifest verifier cannot choose root ownership, nonempty deployment fields or archive interpretation.
- **Stealth and reputation primitives:** reuse the evaluated math and bounded verifier work; define actual wallet authority and issuer/root semantics before activation.
- **Exhausted formal targets:** preserve the three original whole-target UNKNOWN results separately from T91's later constructor proof, two partition timeout UNKNOWNs and spent 3/3 attempt budget. A new proof scope needs a distinct model, reachability argument, bounds and review; renaming the same rerun supplies no new evidence.

These boundaries follow the corresponding reports and the pinned canonical remainder. An implementation change after the reviewed commits may alter them; recheck the relevant source before starting work.

## 4. Minimum handoff record for each selected decision

Record the decision ID and exact source baseline; alternatives considered and why one was selected; authority and trust assumptions; versioned bytes/interfaces and artifact identities; compatibility/recovery behavior; relevant source IDs from the bibliography; acceptance evidence and observed limitations; accountable decision/review roles; and conditions requiring re-review. Separate a planned experiment from its later result.

This allows the next implementation task to start with an answerable contract and a defined stopping condition. Source quantity, an agent's conclusion, a local fixture or an imported status document does not replace that record.
