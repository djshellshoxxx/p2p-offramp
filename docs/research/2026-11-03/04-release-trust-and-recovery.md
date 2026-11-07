# Release trust, deployment identity and durable recovery

Research date: **2026-11-03, America/Vancouver**. Retrieval window began 2026-11-04 UTC.
Status: research recommendations; no trust key, deployment, runtime flag or governance approval changed.
Scope: `P-G15-PROFILE`, `Q-RELEASE`, and the qualification boundary of the existing G15/G25 implementation.

## Decision

**Concurrent proposal:** PR #29 now includes D2 testnet trust and D3 maintained recovery packets. Apply the evidence below to that existing work, including D3's reported manifest-composition mismatch; see the [coordination note](CONCURRENT-WORK.md) for exact pins and the distinction between inspected proposals and reproduced results.

Preserve the implemented G15 verifier and local update/recovery work. Complete three explicit protocol decisions before a funded release: **how trust can change, what a verified deployment means, and how an authenticated recovery archive is produced and retained**. Build provenance and an IPFS CID are useful evidence, but neither establishes these three decisions.

For the next testnet qualification, use a separately identified testnet trust ceremony and exact immutable deployment evidence. For production, first evaluate a standard update-metadata design against G15. TUF is the most directly relevant comparison because it explicitly treats role separation, key thresholds, version continuity and expiration; copying selected concepts does not make G15 TUF-compatible. [R1] [R2]

## 1. What the repository already has

The findings below concern PR #26 at `94554ecf9854e4604f9f56afe5bebedeee931994`, which was **open and unmerged** when inspected. Main remained `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa`. Do not reopen completed local work solely because an older specification still says implementation pending.

| Evidence | Observed boundary | Consequence |
| --- | --- | --- |
| [release-manifest.ts](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/security/src/release-manifest.ts) | `ReleaseManifest.deployments` is `readonly never[]`; a nonempty array is rejected; successful values retain `deploymentsVerified:false` and `releaseEnabled:false`. Limits include a 1 MiB manifest, 10,000 assets and 256 MiB bundle. | Asset authenticity is implemented; nonempty deployment qualification is still a schema and authority decision. |
| [release-update.ts](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/security/src/release-update.ts) | Update composition uses compiled key/channel/sequence trust, verifies assets, checks stored accepted state, and refuses unconfigured composition. | Do not add another generic updater. Specify rotation and bootstrap separately. |
| [distribution staging](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/scripts/distribution/stage.mjs) | The local stage is explicitly unsigned; it contains no signer, archive, deployment or publication operation. | A successful stage is not a published authenticated release. |
| [testnet trust](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/scripts/testnet-trust.mjs) | Separate Sepolia trust inputs, accepted sequence state and registry checking already exist. | Reuse the kit after the owner supplies the intended public trust identity and testnet evidence. |
| [pending decisions](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/governance/PENDING-DECISIONS.md) and [remainder](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.json) | Rotation/threshold/revocation, nonempty deployments, extraction and retention remain unspecified; governance records are inert proposals. | Research can provide concrete choices, but cannot turn unsigned labels into authority. |

The project-specific [manifest design](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/00_PLANNING_AND_THREAT_MODELING/feature_0.3_system_integration/module_0.3.1_static_deployment/spec-content-addressed-release-manifest.md) already selects P-256/SHA-256, fixed-width r||s signatures, canonical JSON and a distinct locator domain. RFC 8785 and the published WebCrypto Recommendation are suitable reference points for encoding compatibility. The current generic W3C URL redirected to a Level 2 **working draft**, so the stable Recommendation is cited explicitly instead of describing draft material as a final standard. [R7] [R8]

## 2. Trust bootstrap and rotation

### Evidence and alternatives

TUF's current specification requires a newly accepted root version to continue from a trusted predecessor and satisfy both old and new root signature thresholds, with bounded update traversal and expiration checks. An expired previously trusted root can still be used to traverse successor roots; the specification checks the final trusted root's expiration after rotation. An executable profile must preserve that ordering rather than rejecting every expired intermediate root. Its security documentation separately identifies rollback, freeze and fast-forward threats. These are comparison requirements for a proposed G15 design, not properties established by the present implementation. [R1] [R2]

| Option | Benefit | Cost or unresolved condition | Recommendation |
| --- | --- | --- | --- |
| Keep one pinned key; distribute a separately authenticated new client when it changes | Smallest client change; matches current single-key composition | Revocation and recovery are manual; users need an independent bootstrap route | Appropriate bounded testnet starting point if its limits are explicit |
| Add a versioned G15 transition profile | Preserves existing manifest domain and app architecture | Creates a new protocol requiring encoding, threshold, revocation, clock and compatibility review | Candidate only; no implicit selection |
| Adopt a reviewed TUF-compatible distribution layer that binds G15 artifacts | Uses a defined update-metadata model and role separation | Requires a concrete implementation/browser-or-operator integration assessment, migration plan and new trust metadata | Evaluate before committing to a custom production rotation design |

**Proposed decision packet**, not a wire format: identify current trust root, independent recovery root, signing roles and threshold; who holds each key; how predecessor and successor authorization are checked; exact transition version and signed bytes; channel separation; expiration/clock assumptions; bounded chain traversal; duplicate-key treatment; revocation semantics; initial bootstrap procedure; and preservation of historical recovery artifacts.

The key count and threshold remain owner/security choices. This research does not invent people, attestations, fingerprints, a 2-of-3 policy or an approval. Key compromise must have an independent recovery route; a replacement public key supplied only by the compromised distribution channel cannot establish its own legitimacy. The repository's own manifest specification already records the hostile-first-visit limitation.

### Closure evidence

A selected profile needs independent serialization/signature fixtures and a reviewed operational exercise. Minimum cases are normal rotation; skipped intermediate transition; insufficient distinct signatures; expired metadata; clock anomaly; missing metadata; interrupted persistence; new origin with no accepted sequence; and removal of a compromised signing role. Old funded recovery must remain available without accepting a newly enabled economic profile. These are proposed bounded qualification cases, not tests executed in this research.

## 3. Nonempty deployment identity

The existing [deployment recorder](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/scripts/sepolia/record-deployment.mjs) is a reusable source of deployment observations. It must not be silently treated as the selected G15 nonempty-deployment contract.

**Recommended candidate field groups**:

| Group | Required decision/evidence |
| --- | --- |
| Network identity | Chain namespace and identifier, genesis identity, environment and exact finality policy |
| Contract identity | Address, canonical escrow profile, deployment transaction/receipt and canonical block, deployed runtime digest |
| Build identity | Source commit, compiler and build settings, lockfile/dependency identities, ABI digest, construction recipe and immutable arguments |
| Asset identity | Native versus token, exact contract/mint identity where applicable, supported behavior and independent asset review |
| Authority | Immutable or upgradeable status, relevant owner/upgrade roles, permitted operations and their consequences |
| Observation | Reader/provider identities, observed block/time, independent cross-check, conflicts and stale/unknown handling |
| Recovery | Original ABI, registry, network assumptions and instructions bound to the artifact; retention owner and compatibility set |

This is a proposal for review. A code hash must be defined over the actual selected byte representation; source hash, creation bytecode, deployed runtime and an ABI hash are distinct identities. Qualification must specify which observation establishes each fact and retain ambiguous results. The EVM report covers chain and receipt requirements in more detail.

A deployment's qualification should be scoped to a network, contract, asset and build. It should not transfer automatically to another chain, token implementation, contract upgrade, wallet class or compiled bundle. Testnet evidence should remain visibly separate from a production registry.

## 4. Archive and recovery format

The locator already has an optional archive digest, but a digest does not define how an extractor interprets a package. A candidate must fix both producer bytes and parser rules.

| Candidate | Useful property | Additional work |
| --- | --- | --- |
| Explicit manifest plus individual files | Close to the existing asset verifier; simple inventories | Needs an authenticated acquisition and offline packaging procedure |
| Restricted ZIP using stored entries | Portable container; no decompression expansion when only method 0 is allowed | Must specify header agreement, path policy, bounds, permitted metadata and extraction behavior |
| CAR plus pinned IPLD/UnixFS profile | Integrates with CID verification and IPFS archives | Requires exact codecs, DAG traversal/order/duplicate policy and conversion into executable files |

PKWARE APPNOTE 6.3.10 defines ZIP local and central directory records, method 0 (stored), UTF-8 signaling and multiple optional structures. Therefore “accept ZIP” is not a sufficiently narrow application profile. [R11] The IPFS Trustless Gateway specification similarly defines verifiable raw/CAR responses; consuming such data is a client verification responsibility, not a property acquired by downloading an ordinary gateway page. [R4]

**Recommended first candidate for evaluation:** a bounded, deterministic stored-entry ZIP for offline recovery, with a manifest inventory verified before any launch. Its compatibility study should reject unsupported compression/encryption/multivolume features, inconsistent headers, duplicate or ambiguous names and link/special-file semantics; enforce the existing manifest file-count/byte limits; and define a clean extraction destination and cross-platform filename policy. The exact accepted flag/extra-field set and chosen library/version still require a separate reviewed codec specification. This recommendation does not claim the parser exists.

### Concrete library comparison

The current distribution package declares no ZIP implementation. Two inspected upstream candidates narrow the next experiment:

| Candidate source snapshot | Useful capability | Fit question |
| --- | --- | --- |
| zip.js **2.24.0**, `841affffeaa2bd840f3cb26686142c7eb8ee7cbf`, BSD-3-Clause | Entry generator, explicit strict parsing options and reader abstractions | Its pinned declarations say a plain `ReadableStream` input is buffered completely; use a bounded seekable input for evaluation. Its ZIP digital-signature field is not verified by the library. G15 authentication remains separate. [R16] [R17] |
| fflate **0.8.3**, `dcb3714a6c25db3a2748641019c5277413d09714`, MIT | Incremental ZIP processing; stored-entry streams need no registered inflate implementation | The README says file sizes can be absent and notes per-chunk file-count limits. A caller still needs exact method, inventory, byte, name and cancellation rules. [R18] [R19] |

**Recommendation:** compare zip.js's explicit parser controls against fflate's smaller stored-entry path using the same bounded codec contract. Start with the pinned source snapshots above, then establish correspondence to the selected package tarball/integrity and build. Package metadata and declarations are intake evidence, not a full source audit, app benchmark or certification. Neither library was installed or run here. Do not translate upstream compatibility claims into physical-device support.

Archive the original recovery bundle for every accepted funded profile. Retain its manifest/signatures, locator, trusted-root evidence, ABI/registry, recipe and dependency inventory, verification tool and instructions. Proposed retention policy: keep independently stored copies through the lifetime of unresolved funded positions and any stated support period; choose and document that support period rather than inventing a permanent availability promise.

## 5. IPFS, origins and durable availability

IPFS subdomain gateways place distinct CID roots under distinct origins. That supports origin isolation but changes where browser storage is available. The Storage Standard keys storage by origin and treats persistence as a separate permission/state. Consequently a new CID-origin should enter the existing backup/fresh-key restore path; “empty local storage” must not be interpreted as “no existing trade.” [R3] [R9]

A normal remote gateway still serves executable content that the browser must trust. A trustless gateway provides verifiable content blocks, which an independently trusted client must check. Neither model authenticates its own initial verifier. [R3] [R4]

Pinning prevents pinned content from being removed by that node's garbage collection. It is not a guarantee that a provider stays reachable or that every historical artifact is held forever. [R10] **Recommendation:** maintain separately controlled archival copies and rehearse recovery with the current website and preferred gateway unavailable. Record which copy and verifier were used, which artifact bytes were authenticated and whether the original funded exit was still constructible. This extends existing source-bound recovery evidence rather than replacing it with an uptime claim.

## 6. Build provenance and dependency evidence

SLSA verification compares signed provenance and artifact identity against trusted builder and build-parameter expectations. Provenance that is merely generated or attached has not yet satisfied those expectations. [R5] GitHub attestations expose repository/workflow/source identity and can carry SBOM evidence; GitHub explicitly distinguishes provenance from a guarantee that the software is secure. [R6]

For this repository, a future release packet should bind: commit; complete recipe; lockfile and relevant transitive artifacts; compiler/runtime versions; emitted artifact digests; SBOM; exact workflow/builder identity; approved inputs; and a successful independent verifier result. Compare two independently produced sets of release bytes before claiming reproducibility: the Reproducible Builds definition requires byte-for-byte agreement for the specified inputs and environment. A successful build or test suite alone is a different result. [R12]

The current GitHub secure-use reference recommends workflow dependency lockfiles where supported and full commit pins otherwise, together with minimum token permissions. This is an assessment item for a future CI change, not permission to modify the active workflows during research. [R13] npm's signature/provenance checks are another supply-chain signal; their successful verification must not be relabeled as source, transitive native-code or cryptographic review. [R14]

Offline attestation verification requires the artifact, bundle, verifier and trusted roots. GitHub documents limits around later root revocation and repository-name reuse; preserve the stable repository identity as well as the name. This repository's observed numeric ID is `1429164496`. [R15]

## 7. Actionable research closure

| ID | Work | Classification | Done evidence |
| --- | --- | --- | --- |
| RT-01 | Select bootstrap/rotation design after comparing current G15 and a concrete TUF integration | Owner selection plus protocol engineering | Versioned proposal, precise authority changes, selected implementation identity, compatibility review |
| RT-02 | Freeze nonempty deployment schema using existing recorder outputs | Protocol engineering | Independently reproduced identities, exact required fields, stale/conflict behavior, old/new-client vectors |
| RT-03 | Select archive subset and parser/producer | Research then implementation | Source/license/version record, exact codec contract, bounded cross-platform corpus and deterministic outputs |
| RT-04 | Assemble trusted offline release/recovery packet | Qualification | Exact artifact and verification identities, independently authenticated root, successful recovery exercise |
| RT-05 | Establish reproducibility/provenance policy | Implementation and qualification | Independent byte comparisons and verified attestations with expected source/builder parameters |
| RT-06 | Name signing, retention and incident owners | External operational evidence | Real accountable owners and exercised procedures; no placeholder approvals |
| RT-07 | Reconcile public claims to artifact evidence | Qualification | Statement-by-statement support; unknown/unsupported states retained |

Research settles the reference architecture and the tests worth running. It does not supply the owner's signing identity, a live deployment, a parser implementation, independent professional review or completed physical recovery. The existing default remains funds-disabled.

## Sources and evidence quality

All URLs below were opened during this research. Living documentation was retrieved on 2026-11-03 America/Vancouver (2026-11-04 UTC). Primary normative sources are distinguished from first-party operational guidance. No source establishes that P2P Offramp is qualified.

| ID | Primary source | What it supports and limitation |
| --- | --- | --- |
| R1 | [TUF specification 1.0.37](https://theupdateframework.github.io/specification/latest/), observed last modified 2026-10-08, especially §§5.2–5.6 | Root continuity, threshold and metadata verification model; not a G15 compatibility result |
| R2 | [TUF security model](https://theupdateframework.io/docs/security/) | Update threat categories; not an app audit |
| R3 | [IPFS Subdomain Gateway specification](https://specs.ipfs.tech/http-gateways/subdomain-gateway/), 2025-04-03 | CID-derived origins; not initial executable trust |
| R4 | [IPFS Trustless Gateway specification](https://specs.ipfs.tech/http-gateways/trustless-gateway/), 2026-03-05 | Verifiable raw/CAR response model; requires a verifier |
| R5 | [SLSA v1.2: Verifying artifacts](https://slsa.dev/spec/v1.2/verifying-artifacts) | Provenance verification expectations; no claimed SLSA level for this repo |
| R6 | [GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations) | Hosted build provenance and its limits |
| R7 | [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785), Informational | Canonical JSON semantics; not an application signature domain |
| R8 | [Web Cryptography API Recommendation, 2017-01-26](https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/) | Browser cryptographic API and ECDSA encoding reference; not browser-matrix evidence |
| R9 | [Storage Standard snapshot 115691c5158395b89063dee09278703f10494171](https://storage.spec.whatwg.org/commit-snapshots/115691c5158395b89063dee09278703f10494171/) | Storage keys and persistence model; actual devices still need trials |
| R10 | [IPFS: Pin files](https://docs.ipfs.tech/how-to/pin-files/) | Pinning/garbage-collection behavior; not an availability SLA |
| R11 | [PKWARE APPNOTE 6.3.10](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT), 2022-11-01 | ZIP format options; a project-specific safe subset remains to be specified |
| R12 | [Reproducible Builds definition](https://reproducible-builds.org/docs/definition/) | Meaning and evidence of reproducibility |
| R13 | [GitHub Actions secure-use reference](https://docs.github.com/en/actions/reference/security/secure-use) | Workflow dependency/privilege controls; feature availability must be checked when implementing |
| R14 | [npm: Viewing package provenance](https://docs.npmjs.com/viewing-package-provenance/) | Registry signature/provenance checks; not package safety |
| R15 | [GitHub: Verifying attestations offline](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline) | Offline inputs, trust refresh and stable repository-identity considerations |
| R16 | [zip.js pinned package metadata](https://github.com/gildas-lormeau/zip.js/blob/841affffeaa2bd840f3cb26686142c7eb8ee7cbf/package.json) | Version 2.24.0 and BSD-3-Clause license declaration; not package/artifact equivalence |
| R17 | [zip.js pinned API declarations](https://github.com/gildas-lormeau/zip.js/blob/841affffeaa2bd840f3cb26686142c7eb8ee7cbf/index.d.ts) | Reader buffering, iteration and explicit parsing controls; selected relevant declarations read, no full implementation audit |
| R18 | [fflate pinned package metadata](https://github.com/101arrowz/fflate/blob/dcb3714a6c25db3a2748641019c5277413d09714/package.json) | Version 0.8.3 and MIT license declaration; not package/artifact equivalence |
| R19 | [fflate pinned README](https://github.com/101arrowz/fflate/blob/dcb3714a6c25db3a2748641019c5277413d09714/README.md) | Streaming stored entries, metadata and chunk-bound considerations; upstream behavior descriptions need measurement |

Confidence is high in the cited standards and observed source boundaries; medium in the proposed archive/rotation choices pending concrete library, device and operational evaluation. No benchmarks, test runs, key ceremonies or deployments were performed for this report.

[R1]: https://theupdateframework.github.io/specification/latest/
[R2]: https://theupdateframework.io/docs/security/
[R3]: https://specs.ipfs.tech/http-gateways/subdomain-gateway/
[R4]: https://specs.ipfs.tech/http-gateways/trustless-gateway/
[R5]: https://slsa.dev/spec/v1.2/verifying-artifacts
[R6]: https://docs.github.com/en/actions/concepts/security/artifact-attestations
[R7]: https://www.rfc-editor.org/rfc/rfc8785
[R8]: https://www.w3.org/TR/2017/REC-WebCryptoAPI-20170126/
[R9]: https://storage.spec.whatwg.org/commit-snapshots/115691c5158395b89063dee09278703f10494171/
[R10]: https://docs.ipfs.tech/how-to/pin-files/
[R11]: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
[R12]: https://reproducible-builds.org/docs/definition/
[R13]: https://docs.github.com/en/actions/reference/security/secure-use
[R14]: https://docs.npmjs.com/viewing-package-provenance/
[R15]: https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/verify-attestations-offline
[R16]: https://github.com/gildas-lormeau/zip.js/blob/841affffeaa2bd840f3cb26686142c7eb8ee7cbf/package.json
[R17]: https://github.com/gildas-lormeau/zip.js/blob/841affffeaa2bd840f3cb26686142c7eb8ee7cbf/index.d.ts
[R18]: https://github.com/101arrowz/fflate/blob/dcb3714a6c25db3a2748641019c5277413d09714/package.json
[R19]: https://github.com/101arrowz/fflate/blob/dcb3714a6c25db3a2748641019c5277413d09714/README.md
