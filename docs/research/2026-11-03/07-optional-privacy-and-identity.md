# Optional privacy, identity, and recovery: remaining research

**Research date:** 2026-11-03 (America/Vancouver); primary sources retrieved 2026-11-04 UTC.  
**Repository snapshot:** PR26 at `94554ecf9854e4604f9f56afe5bebedeee931994`, with main at `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa`. PR26 evidence is pending-branch evidence, not a claim that its work is merged.  
**Disposition:** research recommendations only. All five assigned remainder records remain open; this report supplies decision inputs and closure criteria, not provider activation, an executed experiment, or production qualification.[R01]

## Findings that change the next work

The reusable work is substantial: T63 already evaluated actual Semaphore membership proof generation/verification in a bounded Node environment; T51 supplies two explicitly named stealth mathematical profiles; T90 preserves passive XMTP artifact/source comparisons; T59 implements local sweep plans and reminders. Repeating those demonstrations will not resolve the missing application contracts.[R02] [R04] [R05] [R10]

Three current-source findings sharpen the decisions:

- **Semaphore revocation has a time-policy dependency.** The pinned contract accepts superseded roots for a configurable interval, defaulting to one hour in its simple `createGroup` overloads. Removing an identity does not imply immediate rejection of every proof against an older root.[PI03]
- **Current XMTP documentation describes a third, incompatible candidate generation.** The Browser migration guide, updated October 29, recommends matching SDK/backend `8.0.0-rc4`, changes the network and signer interfaces, and removes the browser database-encryption-key option. These statements apply to that migration target, not automatically to either pinned 7.0.0 snapshot.[PI11]
- **The archived JoinMarket implementation has a separately maintained candidate to investigate.** Its final release notes point to JoinMarket NG without endorsing it. The latter is a native Python implementation with its own wallet/backend assumptions; neither an automatic browser replacement nor an approved provider follows.[PI19] [PI20]

| Open record | What already exists | Remaining decision and evidence |
|---|---|---|
| `P-REPUTATION-ENGINEERING` | Concrete membership feasibility and artifact/dependency receipts | Named issuer, root/revocation policy, durable identity, application scope/message, optional score circuit and actual nullifier consumer |
| `L-PRIV-STEALTH-SPEND` | Generation/scanning math under two local profiles | Exact interoperable encoding plus an external wallet that owns and can spend the derived keys, bound to unfunded terms |
| `L-PRIV-OPTIONAL-PROVIDER` | Empty registries and passive provider research | A coherent protocol/build/network/storage/routing/retention profile for each provider separately |
| `L-PRIV-PROFILE-REMOVAL` | Record deletion, locking, encrypted storage | A profile-scoped export/removal/recovery contract reconciling the lifecycle specification with MEM01 |
| `L-PRIV-SWEEP-EXECUTION` | Local EVM plans/reminders | A separately versioned standalone transfer intent and durable observation/recovery contract |

The classifications above follow the pinned remainder, not a fresh completion percentage.[R01]

## 1. Reputation: decide the statement before integrating the proof

T63's experimental candidate uses SDK 4.14.5 with documented dependency overrides and explicit 4.13.0 depth-2 artifacts. Its recorded Node checks do not establish browser performance, production identity storage, issuer legitimacy, a score proof, or global nullifier consumption. Those historical measurements were not rerun here.[R02] [R03]

The inspected upstream identity holds an EdDSA/Poseidon private key and supports private export/import. Proof generation binds membership, a message, and a scope; it defaults to downloading depth-specific artifacts if none are supplied. Neither primitive checks that one commitment corresponds to one human, a successful fiat trade, or an honest credit score. Those are application/issuer assertions. Retain explicit artifact supply and avoid treating an arbitrary wallet signature as an approved identity-recovery scheme.[PI01] [PI02]

**Recommended first profile:** an optional, accurately labeled membership statement under a named issuer's policy and root, shown before signing new unfunded terms. Defer score claims and global single-use eligibility until their separate semantics and consumers exist. This keeps the research outcome concrete without granting the proof authority over basic escrow recovery.[R03]

| Contract to freeze | Decision needed | Closure evidence |
|---|---|---|
| Issuer and admission | Authority keys, rotation, admission rules, duplicate enrollment and recovery rules | Signed policy/root fixtures; issuer key transitions; explicit uniqueness assumptions |
| Root and revocation | Network/group, monotonic epoch, expiry, canonical observation, permitted old-root interval | Removed-member behavior at the chosen boundary; conflicting/stale roots remain distinguishable |
| Durable identity | Random creation, encrypted storage, backup, lost/compromised identity replacement | Restore preserves intended identity; replacement invalidates the old credential under issuer policy |
| Scope and message | Relying party, deployment, issuer, purpose, epoch, terms/trade binding and exact serialization | Public cross-implementation preimages; no ambiguous tuple encoding or accidental scope reuse |
| Nullifier consumer | Local duplicate observation, per-trade use, or global single use | If global: a selected durable authority consumes the proof atomically with the intended action |
| Score, if requested | Authenticated credential, score meaning/range, threshold, freshness and dispute policy | A separate circuit and issuer evidence; membership alone is insufficient |

These are proposed decision fields; this report does not introduce a new wire format.[R03]

Two distinctions deserve explicit tests later. Upstream `verifyProof` is read-only, whereas `validateProof` checks and records a nullifier within a group. Therefore a successful verification is not a consumed credential. Also, its old-root allowance can keep a removed member's prior proof eligible until the selected grace interval ends. Immediate revocation, delayed delivery and offline operation cannot all be inferred from “Semaphore supported.” A current-root-only policy has different availability consequences and must be selected deliberately.[PI03]

Restoring the same identity should preserve its scoped nullifier behavior; generating a new identity during every restore can undermine the intended admission policy. Human uniqueness still requires issuer controls, and small or adversarially populated groups can provide weak practical anonymity. The existing public synthetic fixture is not evidence for either property.[PI01] [PI02] [R02] See [report 03](03-payment-proofs-and-providers.md) for the different question of proving authenticated chat statements.

## 2. Stealth: wallet ownership and interoperability precede funding

The existing ambiguity remains material. The ERC-5564 reference notebook hashes the 64-byte concatenated shared-point coordinates; the inspected ScopeLift generator hashes the result of `getSharedSecret` without specifying compression; its referenced noble 2.0.0 API defaults to the compressed point. T51 already preserves distinct local vectors for these preimages. These sources were checked again; no implementation was executed here, and no claim is made about every current wallet or SDK.[R04] [PI06] [PI07] [PI08]

ERC-5564 defines stealth-address generation and announcements. ERC-6538 adds registration, including delegated registration with signature/nonce checks. An announcement is not a transfer receipt; a registered meta-address is not evidence that the connected external wallet can recover and spend every derived account.[PI04] [PI05]

**Recommended candidate boundary:** nominate one external wallet/companion that supplies a purpose-bound viewing capability and retains spending authority outside site JavaScript. Before any funded trial, require its exact derivation/import/signing/recovery documentation and independently reproduced interoperability vectors. Do not resolve the gap by importing a seed or spending secret into the web application.[R04] [R11]

The proposed decision packet must cover:

1. Exact scheme, shared-point encoding, exceptional-scalar behavior and network/emitter identity.
2. Proof of wallet control over the spending public key and actual derived-account signing support, including account change and lock invalidation.
3. A commitment in new unfunded terms to the selected profile and recipient derivation inputs/output. Registry updates must not silently rewrite an existing recipient.
4. Independent deposit observation, bounded scanner completeness/reorg rules, and separation of a matching announcement from an observed asset transfer.
5. Gas funding, fee limits, failed-spend recovery and the metadata exposed by those flows.
6. Viewing-key recovery/revocation separately from spending-key recovery, with a fresh application session after restore.

These are application design requirements inferred from the standards and the repository's external-wallet boundary. ERC-5564/6538 do not supply the missing wallet workflow. Keep the existing generation/scanner work available as diagnostic evidence until this packet is selected and qualified.[PI04] [PI05] [R04]

## 3. XMTP: select one generation and resolve durable storage

The exact-generation problem is larger than choosing a package version string:

| Candidate | Verified source distinction | Consequence |
|---|---|---|
| Published browser 7.0.0 source `eb362c47…` | Manifest requires WASM 1.10.0 | Reuse T90's comparison receipts; this is not the T50 source tree |
| T50 source `8993ef24…` | Also calls itself 7.0.0, but requires WASM `1.11.0-nightly.20260603.89c3fc3` | Do not combine the old package archive with this source by an undocumented override |
| Current self-hosted migration target | Guide names SDK/backend 8.0.0-rc4 and compares a separate libxmtp source generation | New intake and architecture evaluation, not a silent upgrade of either row above |

The two historical manifests were inspected directly. T90 already records the seven differing SDK source files and explicitly says the comparison lock is not a selected coherent runtime.[PI09] [PI10] [R05]

For the current migration target, the guide replaces `env/apiUrl/gatewayHost` with an explicit backend URL and removes `dbEncryptionKey` from the Browser API. Its documented browser storage lacks SDK database encryption. The pinned new-generation storage specification also describes an OPFS namespace and limits the scope of deletion. This presents a direct fit question for MEM01/G02's encrypted durable-state requirements: setting an obsolete option or wrapping a few app records does not establish protection for the SDK's own database and identity material.[PI11] [PI12] [R11]

The migration overview says older network SDKs cannot use the new backend, and imported conversation history remains inactive. It does not promise transparent continuity of existing conversations. A chosen external backend also needs a named operator and documented availability, retention and authentication; the application must not quietly acquire an app-owned backend contrary to its client-side architecture.[PI23] [R14]

Retain all ten T90 contract areas, with new-generation evidence where applicable: coherent build; network/egress; wallet–inbox/participant authentication; installation limits/revocation; conversation consent; trade-envelope mapping; database/key/recovery; bounded history/retention; disposal/errors/resource bounds; independent browser/interoperability/privacy qualification.[R05] Resolve storage feasibility before spending effort on a full adapter.

**Recommendation:** keep the provider unsupported before import or identity signing. Produce a short generation-selection ADR comparing the two retained legacy snapshots with the new target, including whether an encrypted persistence design is feasible within the existing authority model. A new-generation research choice would require a fresh complete SDK/backend/artifact pin and restore/lifecycle evaluation. The guide's recommendation is vendor guidance, not this project's selection or a verified deployment.

## 4. Tor: choose an enforcing environment

Tor's SOCKS interface is a TCP proxy interface with remote-resolution and stream-isolation semantics. The standard page WebSocket API does not provide raw socket access. It follows that compiling Tor-related code to WASM alone does not establish an ordinary web page's access to the required transport or control over all browser traffic.[PI15] [PI16]

The research comparison should be between a controlled Tor-browser/native routing environment and an authenticated local companion with explicitly scoped channels. A remote HTTPS gateway introduces a distinct intermediary and observation boundary. None is presently selected.[R06]

Current Tor specifications also distinguish legacy isolation credentials from newer formats, with implementation/version support stated separately. Pin the actual enforcing component rather than assuming one behavior from a generic “SOCKS5” label.[PI15] Qualification must measure DNS, static load/update, RPC, relay, Worker/WASM, WebRTC and external-wallet paths that the product intends to label as protected, plus route failure and lifecycle invalidation. Successful connectivity and self-reported settings alone cannot supply that evidence. Unknown external-wallet routing remains outside an app-channel claim.[R06]

## 5. Shielded assets and CoinJoin: separate chain and wallet choices

The existing empty registries are correct for an unselected protocol. A generic “privacy provider” cannot establish note custody, proving artifacts, exits or wallet compatibility.[R07]

ZIP-316 is useful evidence for protocol-specific addresses and viewing authority, not an EVM pool adapter. Its current page explicitly separates active revision 0, withdrawn revision 1 and draft revision 2. A future candidate must name a revision and receiver policy; parsing a Unified Address cannot alone promise that a particular transfer is shielded. Full and incoming viewing keys also disclose different information.[PI17]

For CoinJoin, BIP-174 specifies a partially signed Bitcoin transaction format and signer checks, not a coordination or anonymity protocol. Selecting Bitcoin/network, wallet ownership, supported scripts, fee/sighash policy, input reservations and final transaction recovery is additional work.[PI18]

The old JoinMarket final release notes identify JoinMarket NG as a candidate to examine. Its pinned README describes a Python implementation, Bitcoin Core or Neutrino backends, and a maker/taker market; its interoperability statements and ongoing-audit acknowledgment are upstream claims, not qualification performed here. This improves the candidate list without treating archival of one implementation as abandonment of the whole protocol.[PI19] [PI20]

**Recommendation:** treat shielded-chain and Bitcoin wallet integration as separately scoped product decisions after the basic off-ramp flow is qualified. A candidate comparison must first show compatibility with external custody and the static client. Then obtain exact program/protocol/build pins, backup/exit documentation, fee and cancellation rules, data-flow analysis and independent interoperability evidence. No EVM fixture should be relabeled as a valid shielded note or collaborative Bitcoin spend.[R07]

## 6. Profile removal: define the unit of deletion and surviving authority

The lifecycle specification names `requestProfileRemoval`; MEM01 explicitly says G02 v1 has no routine whole-vault deletion API. Both require separate recovery-aware semantics. The implementation opens the shared database `p2p-offramp-vault`, whose `vaults` object store is keyed by `profileId`; the schema bounds the number of profiles. [R15] Consequently, deleting the whole database is not a profile-scoped implementation: it would include other real or decoy profiles.[R08] [R09] [R11]

**Proposed contract, requiring review:** authenticate the chosen profile; inventory pending trade/journal and optional-provider state; offer an explicit recovery/export choice; quiesce owned work; perform only the selected profile mutation with a documented commit boundary; and report confirmed, failed or uncertain outcomes. Keep cancellation before commit distinct from losing the result of a mutation already committed. Removal must never be an error-handler reset or automatic logout action.[R08] [R10] [R11]

IndexedDB's database deletion algorithm waits for open connections and may emit `blocked`; its API does not supply an AbortSignal parameter for cancelling a submitted deletion request. A dialog disappearing cannot be treated as rollback. For any future implementation, test multiple tabs, version changes, process termination and successful deletion with a lost completion notification using the actual chosen profile-scoped operation.[PI21]

Local deletion, provider revocation and removal of other copies must be separate results. Current XMTP guidance explicitly states that deleting the local database does not revoke its installation, while revoking an installation does not delete earlier local messages. These current-generation semantics illustrate why the provider-specific contract is necessary; they are not retroactive proof of legacy SDK behavior.[PI13] [PI14]

NIST SP 800-88r2 makes cryptographic erasure contingent on appropriate encryption/key handling and treatment of other key copies. A browser cannot certify that OS snapshots, backups and prior plaintext copies satisfy those conditions. Label the result logical local removal, with exact scope and surviving exports/remote/chain records.[PI22] [R11]

Finally, specify what restoration reactivates: G03 fresh vault encryption keys do not by themselves rotate an XMTP installation, revoke an issuer credential or change a spending wallet. A retained backup can restore old protocol authority unless the selected provider's revocation/recovery rules prevent it. This is a cross-provider design question, not a reason to modify or delete existing vaults during research.[R03] [R05] [R11]

## 7. Sweep execution: add a monetary contract, not a timer capability

The implemented reminder reports `executionSupported:false` and requires fresh wallet consent. Its wall/monotonic checks are local reminder behavior; no contract-enforced timelock exists. The G12 intent schema admits trade-bound `fund/release/refund/approve`, so inventing a trade binding for an independent transfer would obscure authority and recovery.[R10] [R12] [R13]

**Recommended first execution candidate:** a separately versioned native-asset transfer on one already selected EVM network. Its contract must bind account/generation, recipient, amount/cap, current spendable balance, fee/gas limits, nonce policy and exact native observations. Keep ERC-20 peculiarities and Solana in separate profiles; see [report 01](01-evm-and-settlement.md) and [report 06](06-solana-custody-and-parity.md).

Reserve each intent durably before the one permitted wallet-send attempt. If broadcast may have happened, reconcile its native outcome before admitting a retry or conflicting transfer. A batch needs explicit partial-completion and cancellation semantics; stopping the remaining queue cannot reverse earlier transfers. These are proposed acceptance conditions, not a new API or an assertion that the current journal supports them.[R10] [R13]

## Closure order and evidence still unavailable

First reconcile profile-removal/export/restore semantics because they intersect existing encrypted recovery. Next decide the narrow reputation statement and standalone transfer intent. For each optional network provider, settle version, storage and authority fit before engineering. Stealth spending additionally needs a named compatible external wallet and independent vectors. Shielded/CoinJoin remain separate chain/custody product decisions.

Closure requires recorded owner decisions, exact selected artifacts and subsequently observed results. No live issuer, current root service, global consumer, stealth spending wallet, XMTP backend, enforced Tor environment, shielded pool or CoinJoin wallet was selected or exercised in this research. Public source inspection also does not establish browser memory budgets, mobile behavior, remote deletion or privacy against an actual observer.[R01]

## Source ledger

All sources below were opened and relevant content inspected on 2026-11-04 UTC. The list contains **23 external primary sources** and **15 pinned repository references**. Repository historical test receipts are cited as existing evidence, not tests executed for this report. Mutable documentation is dated where provided; a source pin is provenance, not approval.

| ID | Primary source and evidence boundary |
|---|---|
| [PI01] | Semaphore identity source, `dbab5553…`; key/export primitives, no application admission policy |
| [PI02] | Semaphore proof generation, same pin; membership/message/scope and artifact default |
| [PI03] | Semaphore contract, same pin; read-only verification, nullifier consumption and old-root window |
| [PI04] | ERC-5564; generation/announcement standard, not selected wallet support |
| [PI05] | ERC-6538; registry/signature/nonce behavior, not derived-key custody evidence |
| [PI06] | ERC-5564 reference notebook, `90bed817…`; inspected preimage, not executed |
| [PI07] | ScopeLift generator, `88bcc27c…`; inspected source only |
| [PI08] | noble-secp256k1 2.0.0 source, `d38ed222…`; compression default, not an installed SDK lock |
| [PI09] | Published browser 7.0.0 source manifest, `eb362c47…`; WASM dependency |
| [PI10] | T50 browser source manifest, `8993ef24…`; different nightly dependency |
| [PI11] | XMTP Browser migration guide, updated 2026-10-29; current target's API/storage change, no runtime test |
| [PI12] | XMTP client-storage specification, `610175f3…`; explicitly draft, layout/lifecycle scope |
| [PI13] | Current XMTP client guide; deletion versus backend revocation |
| [PI14] | Current XMTP inbox guide, updated 2026-10-26; installation revocation versus retained messages |
| [PI15] | Tor SOCKS extensions; version-dependent transport/isolation specification |
| [PI16] | WHATWG WebSockets living standard, updated 2026-10-19; raw-network-access boundary |
| [PI17] | ZIP-316; active/withdrawn/draft revisions and distinct receiver/viewing authority |
| [PI18] | BIP-174, document version 1.4.4; PSBT v0 format and signer responsibilities |
| [PI19] | JoinMarket 0.9.12 final release notes, `c2dd2534…`; archival and alternative lead |
| [PI20] | JoinMarket NG README, `7c592e75…` (commit 2026-11-03); candidate architecture, no audited-adoption claim |
| [PI21] | IndexedDB 2.0 W3C Recommendation, 2018-01-30; deletion/connection/commit mechanics |
| [PI22] | NIST SP 800-88r2, September 2025; sanitization prerequisites, not a browser certification |
| [PI23] | XMTP migration overview; backend-generation incompatibility and history migration limits |

[PI01]: https://github.com/semaphore-protocol/semaphore/blob/dbab5553c486a09d5e1042e5271e3316224cc176/packages/identity/src/index.ts
[PI02]: https://github.com/semaphore-protocol/semaphore/blob/dbab5553c486a09d5e1042e5271e3316224cc176/packages/proof/src/generate-proof.ts
[PI03]: https://github.com/semaphore-protocol/semaphore/blob/dbab5553c486a09d5e1042e5271e3316224cc176/packages/contracts/contracts/Semaphore.sol
[PI04]: https://ercs.ethereum.org/ERCS/erc-5564
[PI05]: https://ercs.ethereum.org/ERCS/erc-6538
[PI06]: https://github.com/ethereum/ERCs/blob/90bed817701ba554ad0ef80494497a55c50a1a3b/assets/erc-5564/minimal_poc.ipynb
[PI07]: https://github.com/ScopeLift/stealth-address-sdk/blob/88bcc27c3b6163080ee18f330dfd6336dc8bd2e2/src/utils/crypto/generateStealthAddress.ts
[PI08]: https://github.com/paulmillr/noble-secp256k1/blob/d38ed222f1a6d5d296a9e4f815a1c174e46c335f/index.ts
[PI09]: https://github.com/xmtp/xmtp-js/blob/eb362c47b6ac92ec56fbae5c54b2a8c1ea4266cc/sdks/browser-sdk/package.json
[PI10]: https://github.com/xmtp/xmtp-js/blob/8993ef24144532e53fdfcfd04eddf27dce8a5a53/sdks/browser-sdk/package.json
[PI11]: https://xmtp.org/get-started/migrate-to-self-hosted/browser-sdk-upgrade-guide/
[PI12]: https://github.com/xmtp/libxmtp/blob/610175f3b3108e7d8c6b8b01df6d99296a6e08b2/docs/specs/STORE-client-storage.md
[PI13]: https://xmtp.org/sdk/client/
[PI14]: https://xmtp.org/sdk/inboxes/
[PI15]: https://spec.torproject.org/socks-extensions
[PI16]: https://websockets.spec.whatwg.org/
[PI17]: https://zips.z.cash/zip-0316
[PI18]: https://bips.dev/174/
[PI19]: https://github.com/JoinMarket-Org/joinmarket-clientserver/blob/c2dd2534afa59ddcb7f7d9a67e4b57cefcf9e4a4/docs/release-notes/release-notes-0.9.12.md
[PI20]: https://github.com/joinmarket-ng/joinmarket-ng/blob/7c592e75a154f226c745c1ca7d0b16de191b3374/README.md
[PI21]: https://www.w3.org/TR/2018/REC-IndexedDB-2-20180130/
[PI22]: https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-88r2.pdf
[PI23]: https://xmtp.org/get-started/migrate-to-self-hosted/

### Pinned repository references

- [R01] Canonical remainder; assigned five records.
- [R02] T63 concrete Semaphore evaluation, measurements and limitations.
- [R03] Reputation profile and exact missing application semantics.
- [R04] Stealth decision record, including both local profiles and spending gaps.
- [R05] Passive XMTP intake and the ten missing profile contracts.
- [R06] Tor/private-transport candidate profile.
- [R07] Shielded-pool and CoinJoin candidate profile.
- [R08] Local storage lifecycle specification.
- [R09] G02 vault schema, including bounded multiple profiles.
- [R10] Local privacy-control decisions and missing contracts.
- [R11] MEM01, especially persistent storage and deletion boundaries.
- [R12] Actual local sweep implementation.
- [R13] G12 trade-bound intent schema and action set.
- [R14] Client-side architecture decision.
- [R15] Actual IndexedDB database/object-store and profile-key implementation.

[R01]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.json
[R02]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/reputation/SEMAPHORE-V4-EVALUATION.md
[R03]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/profiles/02-reputation.md
[R04]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/stealth/DECISIONS.json
[R05]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/security/intake/xmtp/README.md
[R06]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/profiles/06-tor.md
[R07]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/profiles/07-asset-privacy.md
[R08]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.1_decoy_storage/spec-local-storage-lifecycle.md
[R09]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/schemas/src/vault.ts
[R10]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/privacy-controls/DECISIONS.json
[R11]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.3_client_security/spec-rainbow-book-data-remanence-and-memory-sanitization.md
[R12]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/privacy-controls/src/sweep.ts
[R13]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/schemas/src/intent.ts
[R14]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/adr/ADR-CLIENT-SIDE-2026-10-24.md
[R15]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/storage/src/idb-vault-store.ts
