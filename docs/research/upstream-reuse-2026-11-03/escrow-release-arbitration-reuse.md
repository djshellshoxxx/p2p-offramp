# EVM escrow, release trust, recovery distribution and optional arbitration

Research date: 2026-11-03, America/Vancouver. This is a source review and reuse proposal, not an implementation or dependency upgrade.

## 1. What is actually unfinished

The inspected main commit is [e9b9db3](https://github.com/djshellshoxxx/p2p-offramp/commit/e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa). The pending implementation is [PR 26 at 94554ec](https://github.com/djshellshoxxx/p2p-offramp/pull/26). References below distinguish main from that branch.

The canonical [BasicEscrow.sol](https://github.com/djshellshoxxx/p2p-offramp/blob/e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa/contracts/evm/src/BasicEscrow.sol) already imports OpenZeppelin IERC20, SafeERC20 and ReentrancyGuard. It implements seller-funded native/ERC-20 deposits, terms hashing, seller release, timeout refund and deferred withdrawal to the original beneficiary. Its blob is identical on the inspected PR 26 head. Existing [invariant tests](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/contracts/evm/test/BasicEscrowInvariant.t.sol) cover conservation, double payout and terminal-state properties. Existing [token/recipient mocks](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/contracts/evm/test/mocks/Mocks.sol) include fee, blacklist, non-returning, false-returning and callback cases. Recommending that the project start these from scratch would duplicate implemented work.

The historical [October 26 inventory](https://github.com/djshellshoxxx/p2p-offramp/blob/e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa/docs/reviews/REUSE_INVENTORY_2026-10-26.md) says no Solidity implementation was found. That observation is superseded by current source; retain it as historical evidence, not a current backlog.

| Remaining area | Existing component to preserve | Actual missing piece | Reuse opportunity |
| --- | --- | --- | --- |
| G16 peer acceptance | Terms hashing, signature checks, encrypted messaging, durable transaction journal | Versioned carrier tying wallet acceptance to the authenticated peer and exact trade | Independent typed-data vectors; Nostr dossier covers transport |
| G14 capability commitments | Bundled extension registry | Exact mapping from negotiated capability/schema set to signed policy commitment | Canonicalization vectors; no library can select the protocol fields |
| G15 release/update | Signed manifest and locator verification | Root transition rules, nonempty deployment schema, archive profile and actual trusted root | TUF verification patterns, Sigstore build evidence, bounded codec |
| G25 recovery | Canonical ABI and recovery builder | Authenticated distribution binding both original registry and ABI | Reuse existing builder; improve the signed artifact profile |
| Core contract assurance | Foundry tests and native journeys | Specific evidence gaps for the final qualified artifact | Extend existing handler/tests where a documented gap remains |
| G33/G34 arbitration | PR 26 local selection/vote/accounting models | Separate immutable opted-in custody, evidence and certificate profile | Kleros interfaces/tests as references; Chainlink VRF adapter study |
| Optional liquidity | PR 26 reservation/conservation model | Quote signature domain and atomic funding/refund contract | Reuse design/test patterns, not another exchange's custody |

These distinctions are grounded in the [current remainder record](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.json), [extension boundary](https://github.com/djshellshoxxx/p2p-offramp/blob/e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa/packages/extensions/README.md), and the PR 26 [arbitration](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/arbitration/DECISIONS.json) and [liquidity](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/liquidity/DECISIONS.json) decisions.

## 2. Candidate matrix

Pins are retrieved source snapshots, not a recommendation to install the newest branch. License statements below come from the linked license files and, where relevant, the selected source headers.

| Candidate | Verified license and inspected revision | Useful code | Decision and destination |
| --- | --- | --- | --- |
| OpenZeppelin Contracts | [MIT](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/c64a1edb67b6e3f4a15cca8909c9482ad33a02b0/LICENSE); c64a1edb, package 5.4.0 | SafeERC20 and contract primitives already imported | **Keep existing dependency.** contracts/evm/src/BasicEscrow.sol and existing mocks; no upgrade justified by this research |
| Forge Standard Library | [Apache-2.0](https://github.com/foundry-rs/forge-std/blob/8e40513d678f392f398620b3ef2b418648b33e89/LICENSE-APACHE) and [MIT](https://github.com/foundry-rs/forge-std/blob/8e40513d678f392f398620b3ef2b418648b33e89/LICENSE-MIT) files; 8e40513d | StdInvariant and test utilities | **Extend existing test setup** only for a verified uncovered requirement |
| viem | [MIT](https://github.com/wevm/viem/blob/bf3ffc52b5633afebacf3d728d846080f1668f30/src/LICENSE); bf3ffc52 | hashTypedData, custom transport | **Additional test comparator** if a specific independence or coverage need warrants it. Runtime RPC adapter remains conditional |
| ethers | [MIT](https://github.com/ethers-io/ethers.js/blob/3ea4c226dd0b3a074abf90748de9d11192027f4f/LICENSE.md); 3ea4c226 | TypedDataEncoder | **Extend the existing ethers 6.15.0 vector generator first.** This current source pin is research, not an upgrade request |
| TUF JavaScript | [MIT](https://github.com/theupdateframework/tuf-js/blob/f14b2facd4389f1441c88f21b07abb2788cb8ccd/LICENSE); f14b2fac | TrustedMetadataStore.updateRoot and Updater | **Adapt protocol/tests; optional Node release tooling.** Not a drop-in browser dependency |
| Sigstore JavaScript | [Apache-2.0](https://github.com/sigstore/sigstore-js/blob/bfd9abe023da05d2e64873320648d955d81b5982/LICENSE); bfd9abe0 | Verifier, bundle and identity policy validation | **Build/release evidence**, separate from app trust-root approval |
| JCS reference implementation | [Apache-2.0](https://github.com/cyberphone/json-canonicalization/blob/32a48195b9b20fe67b1795e39e4509f14d860b45/LICENSE); 32a48195 | node-es6/canonicalize.js | **Test vectors and encoding oracle** after choosing exact profiles |
| fflate | [MIT](https://github.com/101arrowz/fflate/blob/dcb3714a6c25db3a2748641019c5277413d09714/LICENSE); dcb3714a | Incremental Unzip and per-entry callbacks | **Conditional ZIP codec** if ZIP is selected; never an archive policy |
| node-tar | [BlueOak-1.0.0](https://github.com/isaacs/node-tar/blob/2a22bfc5d3a432a606d9da0e2d87ba634aa3b1cb/LICENSE.md); 2a22bfc5 | Node extraction implementation | **Release-tool alternative only**, rejected for the browser graph |
| Kleros escrow-contracts | [MIT](https://github.com/kleros/escrow-contracts/blob/417f4262a66ae49b9e856858051abd3414c4d8e2/LICENSE); 417f4262 | Arbitrable escrow, appeal and evidence interfaces | **Historical design/test reference**, not a BasicEscrow replacement |
| Kleros v2 | [MIT](https://github.com/kleros/kleros-v2/blob/38d778a4dd39606528c2b0725d0fff3f090aad30/LICENSE); 38d778a4 | Arbitration interfaces and Foundry test organization | **Optional reference only**; governed/upgradeable core conflicts with immutable basic escrow |
| Chainlink EVM | Selected VRF files [MIT headers](https://github.com/smartcontractkit/chainlink-evm/blob/982da1fb36c737664187c787fe5bfcba19d651a7/contracts/src/v0.8/vrf/VRFConsumerBaseV2Plus.sol); [mixed repository license](https://github.com/smartcontractkit/chainlink-evm/blob/982da1fb36c737664187c787fe5bfcba19d651a7/LICENSE); 982da1fb | VRFConsumerBaseV2Plus, VRFV2PlusClient, VRFCoordinatorV2_5Mock | **Optional provider intake and contract tests**, after exact arbitration profile |

### Maintenance observations

The official repository/commit APIs were checked during this review. OpenZeppelin and forge-std had default-branch commits on November 2, 2026; viem and Sigstore on November 3 Vancouver time; TUF on October 29; JCS on October 11; Kleros v2 on October 28; Chainlink EVM on October 29. Ethers' inspected default-branch commit is June 18, fflate's May 16, and node-tar's July 24. Kleros escrow-contracts' inspected default-branch commit is June 14, 2023. These are activity observations, not security ratings or promises of support. Repository metadata showed the selected repos unarchived. The [chainlink-brownie-contracts mirror](https://api.github.com/repos/smartcontractkit/chainlink-brownie-contracts) was archived; use the canonical Chainlink EVM source for new research.

Pinned commit pages provide the source dates: [OpenZeppelin](https://github.com/OpenZeppelin/openzeppelin-contracts/commit/efaa6f78ab1dde05416246e801c0baaf4f900d49), [forge-std](https://github.com/foundry-rs/forge-std/commit/dc647cc030d9d65910d8f1172a0cde48d7106e32), [viem](https://github.com/wevm/viem/commit/bf3ffc52b5633afebacf3d728d846080f1668f30), [Sigstore](https://github.com/sigstore/sigstore-js/commit/bfd9abe023da05d2e64873320648d955d81b5982), [TUF](https://github.com/theupdateframework/tuf-js/commit/f14b2facd4389f1441c88f21b07abb2788cb8ccd), [ethers](https://github.com/ethers-io/ethers.js/commit/3ea4c226dd0b3a074abf90748de9d11192027f4f), [JCS](https://github.com/cyberphone/json-canonicalization/commit/32a48195b9b20fe67b1795e39e4509f14d860b45), [fflate](https://github.com/101arrowz/fflate/commit/dcb3714a6c25db3a2748641019c5277413d09714), [node-tar](https://github.com/isaacs/node-tar/commit/2a22bfc5d3a432a606d9da0e2d87ba634aa3b1cb), [legacy Kleros](https://github.com/kleros/escrow-contracts/commit/417f4262a66ae49b9e856858051abd3414c4d8e2), [Kleros v2](https://github.com/kleros/kleros-v2/commit/38d778a4dd39606528c2b0725d0fff3f090aad30), and [Chainlink EVM](https://github.com/smartcontractkit/chainlink-evm/commit/982da1fb36c737664187c787fe5bfcba19d651a7).

## 3. EVM: reuse the existing foundation

### OpenZeppelin and forge-std

The checked-in submodule revisions, rather than older research candidate versions, are authoritative. The [gitmodules file](https://github.com/djshellshoxxx/p2p-offramp/blob/e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa/.gitmodules), gitlink tree entries and [Foundry configuration](https://github.com/djshellshoxxx/p2p-offramp/blob/e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa/contracts/evm/foundry.toml) establish the actual dependency wiring. The [pinned OpenZeppelin package manifest](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/c64a1edb67b6e3f4a15cca8909c9482ad33a02b0/package.json) says 5.4.0. Do not silently substitute the 5.6.1 candidate mentioned in a historical research document.

The inspected [SafeERC20 implementation](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/c64a1edb67b6e3f4a15cca8909c9482ad33a02b0/contracts/token/ERC20/utils/SafeERC20.sol) provides safeTransferFrom and trySafeTransfer, which the canonical contract already uses. It normalizes token-call behavior; it does not establish that a token will never rebase, blacklist or change its economics. Preserve the contract's exact-deposit check and its explicit supported-token policy. Copying another token wrapper is not an improvement unless a supported-token case proves the need.

Use [StdInvariant](https://github.com/foundry-rs/forge-std/blob/8e40513d678f392f398620b3ef2b418648b33e89/src/StdInvariant.sol) through the existing Foundry dependency. Any new stateful scenario belongs with the current EscrowHandler and invariant suite, not a parallel harness that omits pendingWithdrawals. The useful acceptance model distinguishes terminal trade state, outstanding beneficiary credit and completed payment. Existing formal UNKNOWN outcomes must remain UNKNOWN; another fuzz run does not discharge a theorem.

**Next implementation task:** compare the final integration head's supported token and payout policy with existing handler coverage. Add only a demonstrated missing case, with a bounded deterministic regression. Reuse the existing native settlement/recovery scripts. No new runtime dependency is needed for that task.

### viem versus ethers for independent G16 encoding

Viem's [hashTypedData](https://github.com/wevm/viem/blob/bf3ffc52b5633afebacf3d728d846080f1668f30/src/utils/signature/hashTypedData.ts) and ethers' [TypedDataEncoder](https://github.com/ethers-io/ethers.js/blob/3ea4c226dd0b3a074abf90748de9d11192027f4f/src.ts/hash/typed-data.ts) are practical independent encoding oracles for the project's [evm-terms.ts](https://github.com/djshellshoxxx/p2p-offramp/blob/e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa/packages/wallet/src/evm-terms.ts). Existing independent fixtures already cover baseline terms. The new opportunity is to cross-check newly approved peer-acceptance or capability-profile vectors, rather than regenerate unchanged baseline evidence.

Recommended destination: packages/wallet/test/fixtures and its existing [g16-independent-generate.mjs](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/test/fixtures/g16-independent-generate.mjs); contracts/evm/test/TermsVector.t.sol for the corresponding contract interpretation. The existing generator already checks ethers 6.15.0, with version and npm integrity recorded in its [provenance](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/wallet/test/fixtures/g16-independent-README.md). Extend that tool first. Add viem only for a concrete independent-comparison or coverage requirement. A newly admitted development-only oracle should have exact package integrity and dependency graph recorded. A source commit alone does not establish npm artifact correspondence.

Acceptance should include native and ERC-20 terms, large integer values represented exactly, both roles, chain and verifying-contract changes, differing revisions and capability hashes, expiry boundaries and modified private-agreement commitments. Independent implementations must agree on the exact bytes and digest. Signature validity alone is insufficient to associate a wallet with a particular authenticated message peer; that association belongs to the versioned acceptance protocol.

Viem's [custom transport](https://github.com/wevm/viem/blob/bf3ffc52b5633afebacf3d728d846080f1668f30/src/clients/transports/custom.ts) accepts an injected request function and retry configuration. This makes a narrow read adapter possible, but not automatically worthwhile: P2P already has canonical readers and journaled execution. A future adapter must route through packages/transport, retain explicit read budgets, and never retry economic submissions. Do not import a complete wallet client just to obtain an ABI codec. There is no demonstrated reason to bundle both libraries in the app.

## 4. G15 and G25: release trust is a protocol problem with reusable parts

### TUF: strongest reference for root rotation and rollback

The current [release manifest verifier on PR 26](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/security/src/release-manifest.ts) deliberately refuses nonempty deployment entries and does not invent root rotation. It already verifies bounded assets, signatures, sequence and lifetime context. Preserve that source rather than replace it wholesale.

The most useful upstream code is [TrustedMetadataStore.updateRoot](https://github.com/theupdateframework/tuf-js/blob/f14b2facd4389f1441c88f21b07abb2788cb8ccd/packages/client/src/store.ts). Its sequence and predecessor/new-root signature checks illustrate a concrete transition verifier. The [TUF specification](https://theupdateframework.github.io/specification/v1.0.36/) explains the trust model and metadata roles. The review recommendation is to choose either a clearly specified TUF profile or a narrower P2P transition profile that explicitly states which TUF properties it retains. Do not label a custom signed JSON file TUF-compatible.

The [Updater](https://github.com/theupdateframework/tuf-js/blob/f14b2facd4389f1441c88f21b07abb2788cb8ccd/packages/client/src/updater.ts) imports Node filesystem/path modules and has fetch/cache behavior. It is appropriate for a separate maintainer release tool, not direct inclusion in this browser-only app. Browser verification must continue receiving bounded bytes and trusted material through existing ports.

**Exact target:** packages/security/src/release-manifest.ts and associated tests for transition validation; packages/schemas for the versioned deployment/rotation schema; scripts/distribution for optional maintainer tooling. Introduce a separate transition module only once the accepted schema warrants it.

**Required decisions:** old/new key authorization, threshold, monotonically increasing version rules, key revocation, recovery from lost trust state, bootstrap distribution, nonempty deployment identities and original-ABI retention. A library cannot choose the real trusted keys or the project's recovery policy.

**Acceptance:** reject a transition authorized only by the new key, incorrect versions, unknown roles, repeated signers counted twice, stale metadata and mismatched assets; retain the previous usable state after cancellation; separately demonstrate that old funded escrow recovery remains available when a newer frontend expires. These are local validation requirements, not claims that a public deployment has been qualified.

### Sigstore: provenance beside the application signature

The [Sigstore Verifier](https://github.com/sigstore/sigstore-js/blob/bfd9abe023da05d2e64873320648d955d81b5982/packages/verify/src/verifier.ts) verifies bundles against supplied trust material and policy; the [package documentation](https://github.com/sigstore/sigstore-js/blob/bfd9abe023da05d2e64873320648d955d81b5982/packages/verify/README.md) identifies its Node requirements. Its best fit is a release-qualification command, using explicit signer/workflow identity and issuer constraints and the artifact digest. An otherwise valid signature from an unintended identity must not satisfy the policy.

**Exact target:** scripts/distribution/manifest.mjs and the eventual CI release job, with evidence attached to the staged artifact. Keep the current [unsigned staging behavior](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/distribution/README.md) accurately labeled until signing is actually implemented and authorized. Do not convert Sigstore identity into permission to enable funds. The application release trust root and original deployment/ABI proof remain separate.

A controlled proof of concept can verify a retained public bundle offline with explicit trust inputs. Default trust retrieval and transparency services must be inventoried if the chosen tool uses them. No live signing identity or workflow was configured during this research.

### Canonical JSON: use an oracle, preserve bounds

The [JCS reference canonicalizer](https://github.com/cyberphone/json-canonicalization/blob/32a48195b9b20fe67b1795e39e4509f14d860b45/node-es6/canonicalize.js) can supply independent byte vectors for approved G14/G15 profiles. P2P already has bounded canonicalization in its manifest verifier; upstream formatting alone does not preserve its input-byte, depth, node, field and safe-integer restrictions.

**Exact target:** tests beside packages/security/src/release-manifest.ts and the future capability commitment schema. First state whether the protocol is JCS or a deliberate subset. Define large amounts as exact strings where the schema requires them. Include invalid Unicode, duplicate-key parsing, unexpected properties, key ordering, numeric aliases and object-shape rejection in the application-level acceptance set. Do not replace a stricter validator with a serializer that merely emits canonical output.

### Archive alternatives: fflate or Node tar, only after choosing a format

The [release locator](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/security/src/release-locator.ts) verifies a selected CID/hash profile and explicitly does not grant installation authority. A digest check is not an extraction policy.

If a ZIP profile is selected, [fflate's source](https://github.com/101arrowz/fflate/blob/dcb3714a6c25db3a2748641019c5277413d09714/src/index.ts) provides Unzip and per-entry streams. The recommended adapter would admit only paths in the authenticated manifest and enforce entry count, compressed and expanded byte limits, total output, cancellation, duplicate-path rejection and supported compression methods before exposing assets. Avoid convenient whole-archive allocation for untrusted data. Exact expansion controls require a spike against the pinned implementation; no performance or memory-limit proof is claimed here.

If extraction occurs only in a Node maintainer tool, [node-tar's Unpack](https://github.com/isaacs/node-tar/blob/2a22bfc5d3a432a606d9da0e2d87ba634aa3b1cb/src/unpack.ts) is an alternative reference. It depends on Node filesystem primitives and is excluded from the browser graph. Its current license is BlueOak-1.0.0, not an assumed MIT license. Neither archive choice should be installed before the codec, path, symlink, overwrite and signed-manifest contract is settled.

## 5. Optional arbitration and liquidity

### Kleros is useful for comparison, not inherited authority

[MultipleArbitrableTransactionWithAppeals](https://github.com/kleros/escrow-contracts/blob/417f4262a66ae49b9e856858051abd3414c4d8e2/contracts/MultipleArbitrableTransactionWithAppeals.sol) implements a different dispute and appeal lifecycle, uses Solidity 0.8.9, and imports arbitration/evidence interfaces. P2P's canonical contract has no arbitrator or admin and uses an exact 0.8.30 compiler recipe. Porting the old contract would change custody semantics rather than fill a missing helper.

The newer [KlerosCore](https://github.com/kleros/kleros-v2/blob/38d778a4dd39606528c2b0725d0fff3f090aad30/contracts/src/arbitration/KlerosCore.sol) includes Initializable/UUPSProxiable and governance-dependent behavior. That is useful evidence for rejecting it as a basic escrow base class. Its arbitration interfaces and test categories can inform a separately opted-in design. Public chain evidence metadata also needs a privacy review; do not publish chat contents merely because an evidence interface permits a URI.

**Exact target:** packages/arbitration/DECISIONS.json for design options; future separate contracts/evm arbitration files only after the native certificate/custody profile is accepted. Keep case identifiers, appeals, fee accounting, evidence commitments and settlement certificates distinct. Do not modify funded BasicEscrow positions.

The [liquidity model](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/liquidity/README.md) already models local accounting. Its remaining quote-domain, maker-account, atomic consume/fund and refund/reorg definitions are not solved by importing another exchange. The payment-proof dossier compares ZKP2P; any reusable code must be isolated from its payment-verifier and escrow authority.

### Chainlink VRF: exact provider contract before adapter

The selected [VRFConsumerBaseV2Plus](https://github.com/smartcontractkit/chainlink-evm/blob/982da1fb36c737664187c787fe5bfcba19d651a7/contracts/src/v0.8/vrf/VRFConsumerBaseV2Plus.sol) checks the coordinator on callbacks but also inherits owner-related behavior and permits coordinator migration through its specified authority. Those facts must be reconciled with P2P's intended immutable opt-in tribunal. It is not a free immutable-randomness primitive.

[VRFV2PlusClient](https://github.com/smartcontractkit/chainlink-evm/blob/982da1fb36c737664187c787fe5bfcba19d651a7/contracts/src/v0.8/vrf/libraries/VRFV2PlusClient.sol) supplies the request/extra-argument encoding. [VRFCoordinatorV2_5Mock](https://github.com/smartcontractkit/chainlink-evm/blob/982da1fb36c737664187c787fe5bfcba19d651a7/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol) is a test candidate for request fulfillment and subscription behavior.

**Exact target:** packages/arbitration/src/draft.ts and a future native provider adapter, plus contract tests. First pin the package artifact, network, coordinator/code identity, consumer authorization, subscription owner, confirmation count, fee policy and request-to-case mapping. The current local word port and sampling model should remain. The provider adapter must authenticate callback context, bind one request to one case/round, handle duplicate/late responses, and preserve the defined unavailable-provider behavior. A local mock does not establish live subscription readiness or unpredictability.

The repository license is mixed: the inspected VRF files have MIT SPDX headers, while another subtree is LGPL. Record selected paths and all imported files, rather than assigning a single permissive license to the entire monorepo.

## 6. Recommended implementation order

1. Finish the independent review/integration of PR 26 and the versioned peer-acceptance carrier. Extend the existing G16 vector machinery using one oracle if the new byte profile needs it.
2. Produce one concrete G15 root-transition/deployment/archive decision. Use TUF's source and tests to make the alternatives explicit; retain the existing bounded verifier.
3. Connect the approved profile to the current G25 recovery builder so the release authenticates both registry and ABI. Add build provenance separately.
4. Extend native and browser checks only where the accepted feature creates a new risk. Do not rerun the exhausted formal tranche as if it were new research.
5. Pursue arbitration/liquidity only as separate opt-in milestones after their exact contracts are accepted. Their research should not delay the two-client core journey.

## 7. Admission checklist and limits of this review

Before copying or installing a candidate, record the source commit and files, package version/integrity, selected license and notices, transitive dependencies, install/build hooks, runtime network calls, and exact destination. Run focused offline tests and import-boundary/build checks on the resulting change. Document any modifications to copied code in docs/REUSE.md and preserve notices in THIRD_PARTY_NOTICES.md and emitted artifacts.

The inspected P2P root has no general LICENSE file, and canonical BasicEscrow has SPDX UNLICENSED. Upstream permissive licensing is useful evidence for consideration; this dossier does not relicense the application or declare every possible combined distribution compatible.

No upstream code was installed or copied into the product in this research. No application, contract, browser, performance or formal tests were executed for this dossier. Source/API reads establish the mappings above; proposed acceptance criteria remain future work. The mistaken initial repository lookup tufjs/tuf-js returned 404 and was corrected to the official theupdateframework/tuf-js project through primary-source search. This is recorded to avoid preserving a plausible but invalid upstream link.
