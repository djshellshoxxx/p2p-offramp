# 08 — Arbitration, liquidity, meetup and physical delivery

**Research date:** 2026-11-03 (America/Vancouver); sources retrieved 2026-11-04 UTC.  
**Baseline:** main `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa`; proposed local work at PR #26 head `94554ecf9854e4604f9f56afe5bebedeee931994`. This report preserves canonical remainder statuses. It adds research, candidate choices and acceptance criteria; it does not select a provider, deploy a contract, conduct a paid VRF request, contact a locker, or qualify a profile.

## Finding and scope

The remaining work concerns **authority, exact interoperable bytes, and evidence from the eventual implementation**. Existing local models and fail-closed boundaries are useful foundations. They do not establish that a vault can act as a seller, that an oracle provides fair jurors, that coordinates prove physical presence, or that a door event proves cash custody. These optional systems must remain separable from basic trading. [OR01], [OR19]

| Canonical remainder | Existing foundation to reuse | Still missing |
|---|---|---|
| P-LIQUIDITY-PROFILE / P-LIQUIDITY-ENGINEERING | Quote/reservation and segregated maker-accounting models | Native authority profile, exact signature domain, atomic funding/refund integration and qualification |
| L-ARB-NATIVE / L-ARB-VRF-PROFILE | Diagnostic tribunal and VRF boundary models | Native custody/settlement authority and an exact consumer, subscription and coordinator policy |
| L-MEET-PROOF / L-MEET-PROOF-BINDING | Bounded distance statement and session commitments | Witness ownership, full TradeBinding encoding, proof family/circuit and browser qualification |
| L-MEET-MAP-CACHE | Manifest/tile policy and encrypted-vault primitives | Compatible large-object format, renderer/data rights and bounded integration |
| L-CIT-LOCKER-LIVE / L-CIT-COLLATERAL-CONTRACT | Locker protocol boundary and collateral accounting | Vendor/hardware qualification and separately audited collateral contract |

These are research and engineering gaps, not permission to promote a profile. Completion records for local primitives remain intact. [OR01]

## 1. Maker liquidity: settle the seller identity before choosing a vault

The current design specifies a single-maker segregated vault, exact-fill quotes, zero maker fee in the baseline, quote lifetime capped at 120 seconds, and atomic consumption/funding. It does not specify pooled LP shares or a shared NAV. Adding those concepts would create a separate accounting and economic design. [OR02], [OR03] [OR04]

**The central integration constraint is who becomes the seller.** BasicEscrow requires the terms' seller to equal `msg.sender`, records that caller as seller, authorizes release by the stored seller, and directs timeout refunds to that seller. A vault that calls funding is consequently the seller; its controlling EOA is not automatically the seller. A signed quote from the controller does not change this custody rule. [OR05]

One candidate is a native, immutable, per-maker vault whose address is explicitly bound as seller, with narrowly specified controller authority for permitted vault actions. This is a proposed integration direction, not an approved profile. The acceptance/signature path must support that contract identity. Any alternative retaining an EOA seller must explain how funding remains atomic under BasicEscrow's caller check.

The decision packet should freeze five items:

1. **Quote bytes and domain:** exact types, ordering, version, chain ID, verifying contract, maker vault, controller where relevant, taker, trade commitment, asset, principal, nonce and expiry. EIP-712 supplies typed encoding and domain separation; it expressly leaves replay protection to the application. Cancellation and one-time consumption require state. [OE01], [OR03]
2. **Signature roles:** distinguish quote authorization, peer acceptance, funding and seller release. Specify EOA or ERC-1271 validation for each. Contract signature validity can depend on state, time and authorization; earlier client-side success cannot substitute for validation when authority is consumed. Core peer identity constraints are examined in [report 02](02-peer-acceptance-and-relays.md). [OE02]
3. **Atomic funding:** consume the quote, debit reserved principal and invoke the selected escrow in one native transaction; downstream failure must roll back the bookkeeping. A client Promise sequence does not supply this guarantee. [OR03], [OR04]
4. **Refund reconciliation:** distinguish a terminal outcome, claimable credit and tokens actually returned to the vault. Free inventory only at the defined custody transition, with each return uniquely associated with its reservation. [OR04], [OR05]
5. **Uncertain submissions:** recover through the existing quote/trade identity and transaction state. Quote expiry is not proof that a submitted funding action failed.

Engineering should reuse accounting vectors while demonstrating conservation with concurrent reservations, cancellation/expiry, rejected funding and actual custody returns. Independent review must cover native authorization and atomicity; model conservation alone cannot close P-LIQUIDITY-ENGINEERING. See [report 01](01-evm-and-settlement.md).

## 2. Tribunal authority and VRF are separate contracts

The arbitration package labels current results `diagnosticOnly: true` and `economicAuthority: false`. Its state machine is not an enforcement contract. A native profile must bind case, funded terms, chain, deployment, round and certificate bytes, then constrain the enforcement adapter. Unresolved domain literals and ABI types for randomness expansion and evidence commitments must be fixed before cross-implementation vectors can be authoritative. [OR06], [OR07] [OR08], [OR09]

Settlement must target predetermined buyer/seller beneficiaries and funded principal, separate fees and juror stake, enforce single application, and preserve the declared timeout path. It must not accept arbitrary recipient lists or convert a diagnostic winner into general transfer authority. BasicEscrow has no adjudicated settlement interface; a UI certificate cannot grant it new authority. Tribunal-capable custody requires a separate authority and audit boundary. The predetermined seller fallback is a liveness choice, not evidence that a cash dispute was resolved fairly. [OR05], [OR09]

### The inspected Chainlink source is more specific than “use VRF 2.5”

The source snapshot is `smartcontractkit/chainlink-evm@982da1fb36c737664187c787fe5bfcba19d651a7`. Its manifest declares `@chainlink/contracts` version `2.0.0`. This is **source-declared metadata**, not verification of a published npm artifact: registry metadata was inaccessible. The package lists BUSL-1.1; the two inspected VRF Solidity files individually declare MIT. Licensing and reproducibility review must follow the shipped files and dependency graph. [OE06], [OE07] [OE08]

| Boundary | Observed primary evidence | Profile consequence |
|---|---|---|
| Import paths | Pinned source uses `src/v0.8/vrf/VRFConsumerBaseV2Plus.sol` and `vrf/libraries/VRFV2PlusClient.sol`; migration examples show `vrf/dev/` | Freeze a real package/archive and its paths; examples are not a lockfile |
| Request tuple | `bytes32 keyHash`, `uint256 subId`, `uint16 requestConfirmations`, `uint32 callbackGasLimit`, `uint32 numWords`, `bytes extraArgs` | Use the v2.5 ABI and tagged native-payment encoding |
| Callback authority | Fulfillment is accepted from the current stored coordinator | Coordinator identity is part of the trust boundary |
| Coordinator mutation | `setCoordinator` permits owner **or current coordinator** | Changing owner authority alone does not eliminate the coordinator path |
| Sepolia documentation | Subscription coordinator `0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B`, minimum confirmations 3, maximum callback gas 2,500,000 | Documentation observations are not deployment verification or chosen project settings |

Sources: [OE04], [OE05] [OE07], [OE08].

**Coordinator mutation is a concrete policy mismatch.** The repository expects migration to affect new policy versions while preserving funded cases' callback compatibility. The inspected base permits the current coordinator to replace the stored coordinator independently of the owner; `setCoordinator` is not virtual. Restricting or changing owner authority alone does not establish the intended immutability. Compare a separately reviewed consumer design with a versioned authority-policy change; do not weaken callback authentication to accommodate old requests. No adaptation or ownership workaround is demonstrated here. [OR08], [OE07]

Chainlink guidance requires request-ID association rather than fulfillment order, frozen inputs before requesting randomness, no discretionary rerolls/cancellation, and a callback that does not revert: failed callbacks are not automatically retried. A bounded callback should record authenticated randomness; expensive drafting and settlement should execute separately and deterministically. Randomness does not establish juror eligibility, honest participation, unbiased evidence or payment truth. [OE03]

Official notices observed here schedule VRF v1 shutdown for November 18, 2026 and v2 for November 30, 2026. Retain v2.5 as the candidate family, but freeze source, package integrity, compiled ABI, consumer/coordinator identities, network, subscription ID and authorized consumers, subscription ownership/funding, billing mode, key hash, confirmations, callback bound and outage rule. Local mocks and funded testnet requests are separate qualification stages; neither was performed here. [OE03], [OE04] [OE05]

[Report 03](03-payment-proofs-and-providers.md) covers selective-chat proof source/circuit mismatches; [report 07](07-optional-privacy-and-identity.md) covers identity-issuer semantics. Neither evidence stream supplies tribunal authority without case-specific binding.

## 3. Distance proofs: freeze the claim and who holds its witnesses

MEET07 specifies bounded integer coordinates, a fixed 50 m threshold, squared-distance arithmetic bounded by 8,000,000,000,000 square centimetres, a maximum 1 MiB proof, 60-second proof work and one active proof job per tab. Its projection-error allowance is a requirement, not a measurement already obtained. These constraints narrow circuit selection but do not select a proof system. [OR10]

The W3C Geolocation publication inspected is the **2026-10-30 Candidate Recommendation Draft**. It is source-agnostic, does not guarantee that returned coordinates represent the device's actual location, and defines reported horizontal accuracy as a 95% confidence value. Browser geolocation supplies a coordinate claim, not cryptographic presence attestation. A proof can correctly establish proximity of supplied coordinates while leaving their real-world authenticity unresolved. [OE09], [OR12]

Two decisions must precede circuit selection:

- **Witness ownership:** specify who learns both coordinate witnesses. A conventional single-prover construction needs its witnesses; hiding coordinates from the verifier does not hide them from that prover. If neither participant may disclose coordinates to the other, a joint-proving protocol, separately justified trust arrangement or narrower product claim is needed. This is an architectural inference from the proposed statement, not a claim that a particular MPC implementation already exists.
- **Trade binding:** MEET09 prose calls for the full TradeBinding to be hashed, while its DTO presents `tradeHash` without an explicit full-binding field. Freeze a versioned encoding and clarify whether the input carries the full binding or a separately validated commitment. Specify chain/deployment, participants, trade identity, session, challenge/expiry and domain bytes without silently changing the DTO. [OR11]

PROJ's topocentric documentation is a useful independent numerical reference: geographic input requires geodetic-to-cartesian conversion before Earth-centered coordinates are transformed to local east/north/up. Its default ellipsoid is GRS80, so a WGS84 application profile must select WGS84 explicitly and fix origin, height treatment, integer scaling and rounding. A reference comparison should cover geographic boundaries and threshold-adjacent cases; it has not established the proposed error budget here. [OE10], [OR10]

Groth's original preprocessing-SNARK abstract and the original Bulletproofs abstract provide a narrow family comparison: succinct pairing-based proofs with preprocessing versus transparent range/general-circuit proofs. Bulletproofs' described multiparty range aggregation is not evidence of a ready-made private two-party distance protocol. Only the original abstract pages were inspectable; both full PDFs returned 403. These sources cannot substitute for circuit review, setup provenance, parameter selection or browser measurements. [OE11], [OE12]

Keep the proof badge unsupported until witness ownership and exact public inputs are decided, followed by a pinned implementation, circuit/setup review and measured size, timing and cancellation behavior. Do not turn successful local arithmetic into a physical-presence claim.

## 4. Offline maps: resolve the storage contradiction before selecting a renderer

MEET14 allows a 2 MiB compressed tile and a 100 MiB encrypted LRU cache. G02 permits a maximum 8 MiB snapshot and 256 KiB record, explicitly excluding large map payloads. The inspected schema constants independently enforce 8,388,608 and 262,144 bytes. Consequently, “put MEET14 tiles in the G02 vault” is not an implemented compatible profile: one permitted tile exceeds a record limit, and the allowed cache exceeds a snapshot. [OR13], [OR14] [OR15]

A narrow candidate is an explicit manifest plus bounded MVT files in a **separately versioned encrypted map store**. Specify chunk/object authentication, index integrity, size accounting, interrupted-write recovery and eviction that cannot remove core trading records. Do not raise G02 limits as an incidental renderer change. MEET14 also bounds decompression and feature/coordinate counts; authenticated compressed content still needs those parser limits. [OR13]

MapLibre GL JS is a renderer candidate. The inspected README at commit `2b68611a4e2d4f7f076f6c6ebf758e2d53f91471` identifies GPU vector rendering and BSD-3-Clause licensing. This does not qualify a package build, its workers/parsers or target devices. Its remotely fetched examples are not a privacy-preserving application configuration. [OE13]

PMTiles v3 is a second, optional packaging candidate: a read-only single-file archive supporting range retrieval. It does not itself supply this repository's encrypted-cache format, signed manifest, per-tile integrity contract or work limits. Archive updates require replacement/rewrite; range responses need their own integrity and truncation handling. Range selections also expose requested portions to a remote server unless another mechanism addresses that exposure—an architectural inference, not a claim of a PMTiles vulnerability. Prefer the simpler explicit-file profile unless an evidenced archive requirement justifies the extra reader surface. [OE14], [OR13]

Keep **renderer license, map-data license and hosting permission separate**. OpenStreetMap data is under ODbL, with attribution and applicable database share-alike obligations. The OSM Foundation's public raster tile service prohibits bulk/offline prefetch and provides no SLA; this policy is specific to that service, not every OSM-derived dataset or commercial provider. A licensed offline export or explicitly permitted provider dataset is therefore needed for offline distribution. [OE15], [OE16]

Freeze the entire resource graph: style, sprites, glyphs/fonts, optional language plugins and tile data. Protomaps' own guidance identifies these additional remote dependencies; local tiles alone do not establish a network-private map. Record source versions, redistribution rights, attribution, bounds and a signed publisher identity. A publisher signature authenticates an artifact's origin; it does not establish geographical correctness. [OE17], [OR13]

## 5. Locker protocols and courier collateral require different evidence

CIT-10 already defines a bounded locker envelope with command ID, shipment/locker/profile identity, reservation/counter/capability binding and expiry. Its baseline has no enabled live adapters. Unknown command outcomes must be reconciled, not interpreted as permission to issue a second unlock. Door state, lock state and cash custody remain different claims. A selected device must demonstrate the protocol mapping, rather than be assumed to implement a universal locker API. [OR16]

### One concrete vendor example exposes the integration questions

The igloohome individual-account guide describes client-credentials access to devices in one's own account, intended for server-to-server use. RFC 6749 restricts that grant to confidential clients and classifies browser applications as public clients. Therefore, embedding a shared vendor client secret in the static application is not a compatible authentication design. A user-controlled companion, a different documented authorization mode, or excluding that vendor are possible future choices; none authorizes an application-owned backend contrary to the architecture. Other vendor account modes require separate inspection. [OE18], [OE19] [OR19]

Its job API also shows why “HTTP success means opened” is inadequate:

| Vendor surface | Observed meaning | Required treatment |
|---|---|---|
| Job creation | Returns a job identifier before later device work completes | Separate accepted, pending and final states |
| Job-status response | `jobResponse.jobStatus`: 0 completed, 1 pending, 2 expired | Decode in the endpoint's response context |
| Job-result webhook | `jobStatus`: 0 success, 1 generic failure, 2 another operation in progress | Do not reuse the status-endpoint enum |
| Physical fields | `lockOpen` and `doorOpen` are separate | Preserve sensor distinctions; infer no cash delivery |

Sources: [OE20], [OE21]. These are inspected provider documents, not live calls or hardware qualification.

A vendor-selection packet must map every CIT-10 identity/counter/capability/expiry field to authenticated native fields or to a specified trusted adapter boundary. Record exact model, firmware, bridge, SDK/protocol versions, credential provisioning/revocation, clock assumptions, transport authentication, callback verification, duplicate handling, account permissions and operator recovery. A job ID is not evidence of end-to-end idempotency or replay protection. The inspected pages do not establish that the required mapping exists. [OR16], [OE18] [OE20], [OE21]

Physical qualification should record controlled cases for uncertain submission, device/bridge disconnection, delayed callbacks, restart, jammed hardware and disagreement between door and lock observations. The evidence should show safe reconciliation and an intelligible operator recovery path. None of these observations should automatically release escrow or assert that a parcel contained the agreed cash.

### Courier collateral is a native custody profile of its own

CIT-14/CIT-13 specify separate collateral accounting, at most 64 active reservations, bounded unbonding/withdrawal state and a fixed resolution deadline. Baseline deductions require the specified cooperative courier/payer authorization; a tribunal is only eligible if its authority was bound into the reservation's policy in advance. Photographs, timers, locker events and a diagnostic tribunal output do not independently grant slashing authority. [OR17], [OR18]

A first native candidate should preserve that cooperative, segregated model: exact reservation/signature domains, fixed beneficiaries, one-time deductions, the deposited/reserved/unbonding/withdrawable accounting invariant, actual asset-balance reconciliation and deterministic release after the deadline when no authorized deduction exists. Audit this contract and its ABI separately from BasicEscrow and separately from locker adapters. Do not introduce arbitrary administrator slashing or pooled insolvency sharing as implementation details. Native authorization, conservation and recovery evidence remain outstanding. [OR17], [OR18]

## 6. Bounded work packets and stopping conditions

| Next packet | Work class | Evidence needed to close it |
|---|---|---|
| Vault-as-seller and signature roles | Profile choice, then engineering | Exact quote/acceptance domains and a native trace showing atomic consumption, funding and refund attribution |
| Tribunal enforcement | Native authority design | Certificate bytes, immutable case-to-funding mapping and fixed-beneficiary/single-application review |
| VRF integration | Source/authority choice, then qualification | Published artifact integrity, actual ABI, resolved coordinator policy, bounded mock cases and separately recorded funded-network evidence |
| Distance witness/binding | Research decision | Who knows each witness; versioned full-binding/commitment DTO and exact public-input encoding |
| Distance implementation | Engineering, then qualification | Pinned circuit/setup, independent projection/threshold vectors and measured browser limits |
| Map store and dataset | Format/rights choice, then engineering | Sharded authenticated storage compatible with declared limits, complete licensed resource graph and recovery/eviction evidence |
| Locker adapter | Vendor selection, then physical qualification | Authenticated field mapping, supported hardware identity and recorded uncertain-outcome recovery |
| Courier collateral | Native custody engineering and audit | Cooperative authority, reservation lifecycle, balance conservation and fixed-timeout recovery |

Published package integrity, a selected proof circuit, subscription configuration, a locker model and native audits remain outstanding. The choices and qualification records above are required to close the corresponding rows; existing local model completion remains valid. [OR01]

## Source ledger and access limits

The 21 external sources below are original standards, original paper abstract pages, upstream source or official provider documentation. The 19 repository records establish this project's actual baseline. Multiple pages from one publisher are not independent corroboration, and design prose is not implementation evidence.

| Sources | Inspected material and limits |
|---|---|
| [OE01], [OE02] | EIP-712 and ERC-1271: encoding/signature contracts, not a selected liquidity integration |
| [OE03], [OE04], [OE05] | Official VRF security, migration and network documentation; mutable provider statements |
| [OE06], [OE07], [OE08] | Chainlink manifest and two VRF Solidity files at the full commit above; source inspection, not package publication or audit |
| [OE09], [OE10] | Dated W3C draft and PROJ conversion documentation; no physical authenticity or measured projection guarantee |
| [OE11], [OE12] | Original Groth/Bulletproofs abstract pages only; full PDFs returned 403 |
| [OE13], [OE14] | Pinned MapLibre README and PMTiles documentation; candidates, not qualified dependencies |
| [OE15], [OE16], [OE17] | OSM data license, public raster service policy and Protomaps dependency/privacy guidance |
| [OE18], [OE19], [OE20], [OE21] | Vendor authentication/jobs/payloads and OAuth client-type rules; no live account or device evidence |
| [OR01], [OR02], [OR03], [OR04], [OR05] | Canonical remainder, liquidity decisions/specifications and actual BasicEscrow source |
| [OR06], [OR07], [OR08], [OR09] | Arbitration decisions/implementation notes and VRF/enforcement specifications |
| [OR10], [OR11], [OR12] | Distance statement, session binding and input-authenticity specifications |
| [OR13], [OR14], [OR15] | Map format, G02 encrypted-record specification and actual schema limits |
| [OR16], [OR17], [OR18], [OR19] | Locker/collateral requirements and client-side architecture decision |

**Access limits:** npm registry metadata could not be retrieved, so source-declared version 2.0.0 is not called the latest published release. Original paper PDF access failed; their abstracts support only the narrow family comparison stated. The official Protomaps privacy page was located after an obsolete guessed path failed. Search mirrors were excluded when official Chainlink pages were available. None of these retrieval failures proves absence of an artifact or capability.

[OE01]: https://eips.ethereum.org/EIPS/eip-712
[OE02]: https://eips.ethereum.org/EIPS/eip-1271
[OE03]: https://docs.chain.link/vrf/v2-5/security
[OE04]: https://docs.chain.link/vrf/v2-5/migration-from-v2
[OE05]: https://docs.chain.link/vrf/v2-5/supported-networks
[OE06]: https://github.com/smartcontractkit/chainlink-evm/blob/982da1fb36c737664187c787fe5bfcba19d651a7/contracts/package.json
[OE07]: https://github.com/smartcontractkit/chainlink-evm/blob/982da1fb36c737664187c787fe5bfcba19d651a7/contracts/src/v0.8/vrf/VRFConsumerBaseV2Plus.sol
[OE08]: https://github.com/smartcontractkit/chainlink-evm/blob/982da1fb36c737664187c787fe5bfcba19d651a7/contracts/src/v0.8/vrf/libraries/VRFV2PlusClient.sol
[OE09]: https://www.w3.org/TR/2026/CRD-geolocation-20261030/
[OE10]: https://proj.org/en/stable/operations/conversions/topocentric.html
[OE11]: https://eprint.iacr.org/2016/260
[OE12]: https://eprint.iacr.org/2017/1066
[OE13]: https://github.com/maplibre/maplibre-gl-js/blob/2b68611a4e2d4f7f076f6c6ebf758e2d53f91471/README.md
[OE14]: https://docs.protomaps.com/pmtiles/
[OE15]: https://www.openstreetmap.org/copyright
[OE16]: https://operations.osmfoundation.org/policies/tiles/
[OE17]: https://docs.protomaps.com/guide/security-privacy
[OE18]: https://docs.igloohome.co/home/individual-account
[OE19]: https://www.rfc-editor.org/rfc/rfc6749
[OE20]: https://docs.igloohome.co/home/api_jobs
[OE21]: https://docs.igloohome.co/home/job-result-payloads
[OR01]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.json
[OR02]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/liquidity/DECISIONS.json
[OR03]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.5_liquidity_provision/module_1.5.1_market_maker_vaults/spec-quote-reservation-interface.md
[OR04]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.5_liquidity_provision/module_1.5.1_market_maker_vaults/spec-liquidity-vault-accounting.md
[OR05]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/contracts/evm/src/BasicEscrow.sol
[OR06]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/arbitration/DECISIONS.json
[OR07]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/arbitration/README.md
[OR08]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/04_WEB3_DISPUTE_ARBITERS/feature_4.1_juror_selection/module_4.1.1_vrf_drafting/spec-vrf-chainlink-juror-selector.md
[OR09]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/04_WEB3_DISPUTE_ARBITERS/feature_4.6_dispute_settlement/module_4.6.1_escrow_enforcement/spec-adjudicated-release-interface.md
[OR10]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.3_proximity_verification/module_2.3.1_zero_knowledge_distance/spec-distance-proof-statement.md
[OR11]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.3_proximity_verification/module_2.3.1_zero_knowledge_distance/spec-proximity-proof-session-binding.md
[OR12]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.3_proximity_verification/module_2.3.1_zero_knowledge_distance/spec-location-input-authenticity.md
[OR13]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/02_SMART_MEETUP_GEOLOCATION_ENGINE/feature_2.6_private_map_rendering/module_2.6.1_vector_tile_cache/spec-vector-tile-cache-addressing.md
[OR14]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-indexeddb-encrypted-records.md
[OR15]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/schemas/src/vault.ts
[OR16]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.4_locker_access/module_3.4.1_smart_locker_adapter/spec-locker-command-interface.md
[OR17]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.5_courier_collateral/module_3.5.1_staking_vault/spec-courier-stake-accounting.md
[OR18]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/03_CASH_IN_TRANSIT_BLIND_COURIERS/feature_3.5_courier_collateral/module_3.5.1_staking_vault/spec-courier-slashing-authorization.md
[OR19]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/adr/ADR-CLIENT-SIDE-2026-10-24.md
