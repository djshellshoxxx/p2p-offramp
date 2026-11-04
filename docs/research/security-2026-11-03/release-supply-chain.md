# Release trust, recovery distribution and supply-chain research

Research date: **2026-11-03, America/Vancouver**. Main: `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa`. Implementation candidate: PR #26, `94554ecf9854e4604f9f56afe5bebedeee931994`. Repository observations below refer to that candidate unless stated otherwise. This is additional defensive research and static inspection, not a new execution of the historical test/audit packets.

## Result and existing controls

The useful next work is to specify and qualify the production trust chain. Reimplementing the existing manifest parser, update controller, recovery builder or dependency evidence checker would duplicate working local scope. The five items below turn existing G15/G25 and dependency decisions into bounded review deliverables. **Priority describes when a decision is needed; it is not a vulnerability severity or evidence of an active compromise.**

| Verified static observation | Evidence and consequence |
| --- | --- |
| Manifest verification authenticates complete asset identities, sequence, expiry and a supplied key; the result explicitly retains `releaseEnabled:false` and `deploymentsVerified:false`. | [release-manifest.ts][manifest]. A valid asset signature is insufficient to authorize a deployment or funding. |
| The opt-in updater has an origin-local accepted floor, atomic compare/write, backup and wallet leases, bounded reads and a final explicit origin transition. | [update documentation][updates], [accepted store][store]. Cross-origin history and initial root authenticity remain separate problems. |
| The maintained Sepolia key pin is required before trust files can qualify. | [testnet-trust.mjs][testnet]. A key file beside its own signature does not replace an independently selected pin. |
| Distribution inventory deliberately records zero independent witnesses and false publication/release approval. | [distribution manifest][distribution]. Preserve these distinctions when introducing release automation. |
| All three checked-in workflows use `contents: read` and full action SHAs; npm installs, where present, disable scripts. | [vault workflow][ci], [EVM workflow][evmci], [spec workflow][specci]. Existing protections should remain in the eventual release design. |

The [previous whole-source audit][audit] and [current remainder][remainder] already identify bootstrap, rotation, deployment/archive profiles and independent qualification. The additions here are explicit decision boundaries, evidence fields and completion conditions.

## REL-01 — Define initial trust and update continuity separately

**Priority:** before a funds-enabled release. **Confidence:** high on the current boundary; proposed production policy remains unselected.

A fresh browser cannot establish publisher authenticity solely by executing a verifier and accepting a key supplied by the same unauthenticated distribution path. This is an architectural inference, consistent with the updater's explicit same-origin trust limitation. An already trusted client, a freshly installed client and an archived recovery executable therefore need separate bootstrap records; one successful update fixture must not stand in for all three.

Use the [TUF 1.0.36 specification][tuf] as a control reference: it assumes an initially trusted root, separates root and online metadata authority, authenticates sequential root changes under old and new thresholds, and checks version and expiry continuity. This does **not** make the current G15 format a TUF implementation or justify adding a second verifier.

**Decision packet to prepare:** identify the independent distribution/verification channel; permitted signer fingerprints and channels; who controls each signing role; compromise and revocation rules; predecessor semantics; and how a user authenticates a fresh-origin rollback baseline. Compare an externally verified immutable client/recovery artifact with a transition initiated by an already trusted client. Select a supported profile before implementation; do not silently treat first-visit HTTPS as equivalent assurance.

**Where:** `docs/governance/g15-release-policy.proposal.json` and its decision record first; then the existing `packages/security/src/release-manifest.ts`, `release-locator.ts`, `release-update.ts`, `release-update-store.ts`, and `apps/web/scripts/testnet-trust.mjs` where the approved profile actually requires changes.

**Completion evidence:** a reviewable trust-transition table covers fresh installation, retained state, missing state, revoked key, expired metadata, equal-sequence/equal-digest continuity, conflicting digests, and origin changes. Each supported transition names its authenticated inputs and expected refusal/acceptance. Existing local negative tests are reused; only newly selected semantics need new tests. Root replacement never follows solely from a replacement key offered by the affected origin. Historical funded exits remain governed by their original authenticated profile.

## REL-02 — Authenticate the recovery executable as well as its data

**Priority:** before funding any deployment. **Confidence:** high; archival distribution qualification is open, while local packaging already exists.

The [canonical recovery builder][recovery] embeds a qualified registry/ABI profile and produces file checksums. Its maintained entry refuses an unpinned key, and the unsigned distribution packet intentionally says that no executable is included. These are useful boundaries. Checksums delivered beside an executable establish internal consistency only after a separate trust path authenticates the expected checksum or artifact.

**Research conclusion:** define a recovery capsule for each approved immutable deployment. Its inventory should bind the executable, canonical ABI, original registry and deployment identity, build source and recipe, dependency/tool identities, public operating instructions, and independent verification evidence. Preserve the distinction between expiry of permission to initiate new activity and recovery of an already funded original escrow. The current historical-only recovery design already recognizes that distinction; the missing work is selecting and maintaining the actual distribution/retention profile.

**Where:** `scripts/recovery/build-evm.mjs`, `scripts/recovery/evm-recovery.mjs`, `docs/recovery/CANONICAL-EVM.md`, `scripts/distribution/manifest.mjs`, and the G15 decision packet. Extend their existing contracts after review rather than introducing another recovery authority.

**Completion evidence:** independently authenticated capsule bytes remain obtainable when the current web origin is unavailable; a clean supported environment can inspect the original escrow and prepare only its original permitted exits; expired current release metadata cannot authorize new funding; mismatched ABI, chain/deployment identity or modified capsule bytes do not qualify. Record real browser/OS/wallet compatibility separately from a portable Node build. The retention owner, archival locations and review cadence must be named. This research did not perform a recovery exercise or contact a deployment.

## REL-03 — Bind build evidence to the exact artifact and trusted workflow

**Priority:** before publishing an enabled artifact. **Confidence:** high on existing inventory limits; proposed release workflow requires review.

The present distribution schema records two local equal-byte passes, `independentWitnesses:0`, and `independentReproducibility:false`. Preserve that honest distinction: a second build on the same machine is not an independent builder. The reviewed workflows are validation workflows; none defines an artifact-attestation publication job.

[GitHub's attestation guidance][attest] supports checking artifact provenance against a repository and a specific signing workflow. The proposed verifier policy must bind the expected artifact digest, repository, source revision, workflow identity and build recipe. A signature from some workflow in the account is too broad for this release contract. Attestation authenticates a provenance claim; it does not replace semantic review, independent rebuilds or the G15 deployment policy.

**Where:** retain the existing three test workflows; design a separate reviewed release job when publication is selected, and feed its evidence into `scripts/distribution/manifest.mjs`, `stage.mjs` and `packages/security/src/acceptance-gates.ts`. No workflow is added by this report.

**Completion evidence:** a clean builder and an independent witness bind the same intended source/tool/input set to the same release bytes, with any documented nondeterminism resolved explicitly; verification refuses an unrelated workflow, wrong source revision or different artifact digest. Record actual Node/npm/browser/compiler versions and digests: `node-version: '24'`, `chrome-version: stable` and `ubuntu-latest` are moving test environments, not immutable release recipes.

[GitHub's secure-use guidance][actions] supports preserving least privilege and immutable action references. Any future signing job should receive only its required permissions after reviewed-source selection; contribution tests must not acquire release credentials. Review workflow sources and cache/artifact trust boundaries before connecting the jobs. Consider `persist-credentials:false` where checkout credentials are unnecessary. This is a hardening proposal, not a finding that the current read-only token publishes releases.

## REL-04 — Make dependency evidence complete, scoped and fresh

**Priority:** release gate for shipped/build dependencies; adoption gate for optional evaluation closures. **Confidence:** high on repository coverage; full dependency advisory status remains unmeasured beyond the targeted Vite disposition below.

The candidate tree contains **seven independent npm lock roots**:

| Lock root | Required disposition |
| --- | --- |
| Repository root | Shipped client plus build/test closure; classify runtime, build and developer reachability. |
| `packages/escrow-evm` | Isolated local EVM tooling; keep outside the client graph. |
| `scripts/reputation/evaluation-remediated` | Isolated evaluation with its own overrides and qualification limits. |
| `security/intake/mobile-wallet` | Candidate intake, not blanket app adoption. |
| `security/intake/relay-transport` | Candidate intake with its own dependency closure. |
| `security/intake/waku` | Optional intake; assess only when selected. |
| `security/intake/xmtp` | Passive intake; do not execute it merely to complete an audit table. |

The existing [registry-signature checker][registrycheck] deliberately verifies two retained `@noble/hashes`/`@noble/curves` observations from October 26. It is not a full-tree current audit, and it says so. There is no explicit `npm audit` severity/exit gate in the three reviewed workflow files. Script-disabled installation and external scanner checks remain useful but do not establish that every independent lock root has a fresh, attributable audit result.

[npm documents][npmaudit] that its audit asks the registry about known vulnerabilities; [registry-signature verification][npmsig] checks installed package signatures. These are distinct evidence types. Neither establishes application reachability, absence of unknown defects, or approval of a provider.

**Where:** `security/DEPENDENCY_EVIDENCE.md`, `security/crypto-inventory.json`, existing intake `pins.json` files, and the release-evidence collection. Keep optional graphs isolated. An artifact should carry source/lock digests, audit time and tool version, complete exit status, signature coverage counts, licenses/notices, advisory disposition and an accountable review date. Passive/unexecuted graphs need an explicit status rather than a manufactured zero-vulnerability result.

**Completion evidence:** every closure actually used to build, test or ship the release has a current native package-manager result bound to its lock digest; reachable material advisories have a reviewed fix or explicit disposition; unavailable registry access remains unmeasured; a graph or lock change invalidates the earlier receipt. Do not use automatic forced updates as a substitute for compatibility review. This pass did not install dependencies or run a registry audit.

**Targeted current advisory disposition:** the candidate root manifest and [lockfile][rootlock] pin Vite `8.3.5`. The following first-party advisories were checked against that exact version; their affected ranges do not include it. This narrow result is not a full dependency audit or assurance about all transitive packages.

| First-party advisory | Relevant affected range / fixed version | Candidate disposition |
| --- | --- | --- |
| [GHSA-rq7h-c2jc-7f22][vite1] | 8.3 branch through 8.3.2; fixed 8.3.3 | 8.3.5 is outside the listed range. |
| [GHSA-vfpm-58rq-9qcg][vite2] | 8.3.0–8.3.2; fixed 8.3.3 | 8.3.5 is outside the listed range. |
| [GHSA-9jrq-w75r-8gcw][vite3] | 8.3 branch through 8.3.2; fixed 8.3.3 | 8.3.5 is outside the listed range. |
| [GHSA-8g5g-mxqh-grgj][vite4] | 6.4.4; fixed 6.4.5 | Different major/minor line. |

Retain the Vite version when recording this disposition and re-evaluate on lock changes. No development server was started, probed or used to reproduce any advisory.

## REL-05 — Qualify the delivered browser policy and gateway

**Priority:** before hosted use involving funds or recovery secrets. **Confidence:** high; actual production hosting remains unselected.

The code already distinguishes generated policy from deployed framing protection in [content-policy.ts][cspcode] and emits a `_headers` recipe in [the build plugin][plugin]. [CSP Level 3][csp] does not support `frame-ancestors` in a meta policy; the actual HTTP response matters. Publishing the recipe file does not prove that the selected host applies it.

The [IPFS subdomain specification][ipfs] associates content roots with distinct browser origins. That supports the existing CID-subdomain design, but origin separation does not independently authenticate the first client or make gateway availability/provenance irrelevant. Review the actual gateway domain and public-suffix configuration if it becomes part of the selected profile. The current updater's strict-mode navigation restriction must remain explicit until the private-navigation profile is qualified.

**Where:** `packages/security/src/content-policy.ts`, `apps/web/scripts/static-build-plugin.mjs`, `scripts/portal/policy.mjs`, the selected host configuration, and the existing release/locator/update browser qualification fixtures.

**Completion evidence:** observe the exact approved bytes and response policy at the selected deployment origin, including entry page, Worker and recovery assets; verify expected MIME/framing/referrer/cache behavior and permitted destinations in supported browsers. Distinguish a content-addressed URL, a checked digest and an authenticated release. Bind the report to origin, time, source and artifact digest. No production host was probed in this research.

## Sources and follow-through

Primary references were consulted on the research date. The repository links are immutable candidate links. Proposal fields above are recommendations derived from those sources and the existing architecture, not claims that a new control has shipped. Assign one release/security owner to REL-01/02, a build owner to REL-03/04 and the deployment owner to REL-05; implementation owners should reconcile any later PR #26 changes before using these notes.

[manifest]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/security/src/release-manifest.ts
[updates]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/security/README-UPDATES.md
[store]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/security/src/release-update-store.ts
[testnet]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/scripts/testnet-trust.mjs
[distribution]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/scripts/distribution/manifest.mjs
[ci]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/.github/workflows/vault-foundation.yml
[evmci]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/.github/workflows/evm-escrow.yml
[specci]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/.github/workflows/specifications.yml
[audit]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/audit-2026-11-02/README.md
[remainder]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.md
[recovery]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/scripts/recovery/build-evm.mjs
[registrycheck]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/scripts/check-npm-registry-signatures.mjs
[tuf]: https://theupdateframework.github.io/specification/v1.0.36/
[attest]: https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/increase-security-rating
[actions]: https://docs.github.com/en/actions/reference/security/secure-use
[npmaudit]: https://docs.npmjs.com/cli/v11/commands/npm-audit/
[npmsig]: https://docs.npmjs.com/verifying-registry-signatures/
[cspcode]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/packages/security/src/content-policy.ts
[plugin]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/apps/web/scripts/static-build-plugin.mjs
[csp]: https://www.w3.org/TR/2026/WD-CSP3-20261027/#directive-frame-ancestors
[ipfs]: https://specs.ipfs.tech/http-gateways/subdomain-gateway/
[rootlock]: https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/package-lock.json
[vite1]: https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22
[vite2]: https://github.com/vitejs/vite/security/advisories/GHSA-vfpm-58rq-9qcg
[vite3]: https://github.com/vitejs/vite/security/advisories/GHSA-9jrq-w75r-8gcw
[vite4]: https://github.com/vitejs/vite/security/advisories/GHSA-8g5g-mxqh-grgj
