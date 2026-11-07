# P2P Offramp research review — 2026-11-03

This dossier reviews the remaining research against **main `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa`** and the substantial **unmerged PR #26 at `94554ecf9854e4604f9f56afe5bebedeee931994`**. It also considers the proposed execution guidance in **PR #27 at `2f839b12768700ac6c3b674f75a144c6ec19fa93`**. Dates in this folder use America/Vancouver; retrieval occurred on 2026-11-04 UTC.

The useful next work is to turn the remaining protocol choices into reviewed, implementation-ready profiles, then obtain artifact-specific interoperability and qualification evidence. Several foundations already have local implementations. A new generic wrapper, another reference model or a longer design document is not automatically progress.

Use the [decision queue](DECISION-QUEUE.md) for the next work, the [source index](SOURCES.md) and [structured bibliography](sources.json) for evidence, and the [quality review](QUALITY-REVIEW.md) for checked scope and corrections. The [concurrent-work note](CONCURRENT-WORK.md) coordinates this research with PRs #28–31 and the existing owner decision packets.

The batch used **seven topic-research agents and two separate evidence-review agents**, with the coordinating author covering release/recovery and operator evidence. The nine topic reports cite **161 distinct external source URLs** and **94 distinct commit-pinned project file URLs**. The source index explains deduplication, access limits and the difference between reading cited original content and auditing a complete implementation.

## Read first

| Priority | Question | Report |
| --- | --- | --- |
| P0 | What remains between local EVM escrow tests and a qualified two-party trade, including fiat semantics? | [01 — EVM and settlement](01-evm-and-settlement.md) |
| P0 | How should peers carry wallet acceptance, and how do capabilities bind to signed terms? | [02 — Peer acceptance and relays](02-peer-acceptance-and-relays.md) |
| P2 | Which payment-proof architecture is defensible, and what does it actually prove? | [03 — Payment proofs and providers](03-payment-proofs-and-providers.md) |
| P0 | How will roots rotate, deployments be authenticated, and old exits remain recoverable? | [04 — Release trust and recovery](04-release-trust-and-recovery.md) |
| P1 | Which wallet/mobile/QR and browser evidence is still needed? | [05 — Wallet, mobile, QR and browser qualification](05-wallet-mobile-qr-and-browser.md) |
| P2 | What exact native SOL/SPL custody profile must be selected before implementation? | [06 — Solana custody and parity](06-solana-custody-and-parity.md) |
| P1/P2 | What is missing for optional privacy, identity, deletion and transfer capabilities? | [07 — Optional privacy and identity](07-optional-privacy-and-identity.md) |
| P2 | What separate authority, provider and physical evidence do arbitration, liquidity and meetup/courier features require? | [08 — Arbitration, liquidity and physical coordination](08-arbitration-liquidity-and-physical.md) |
| Qualification | What operating facts must support the jurisdiction, rail and privacy review? | [09 — Operator and jurisdiction evidence](09-operator-and-jurisdiction-evidence.md) |

P0 is the core protocol/trust path. P1 supports core usability, recovery and qualification. P2 is deferred multichain or optional scope. Researching P2 now does not select it as a core dependency or authorize activation.

The [machine-readable gap map](research-gap-map.json) covers all **27** canonical records in the PR #26 remainder that are not `LOCAL_SCOPE_COMPLETE`: **25** with exact contract/tooling remainders and **2** external/tooling qualification records. The other **76** records retain their scoped local status. These are record categories, **not a product-completion percentage**, and each record may have different scope and weight. The source remainder is itself tied to earlier named checkpoints; it must not be read as fresh execution evidence for every later commit. [Source](https://github.com/djshellshoxxx/p2p-offramp/blob/94554ecf9854e4604f9f56afe5bebedeee931994/docs/execution/coverage/CURRENT-REMAINDER.json).

## Repository state and ownership

| Item | Verified at intake | Research handling |
| --- | --- | --- |
| Main | PR #24 merge at `e9b9db3…` | Used as publication base |
| [PR #26](https://github.com/djshellshoxxx/p2p-offramp/pull/26) | Open; head `94554ec…`; 617 changed files | Treated as active unmerged work; its existing implementations are not reassigned |
| [PR #27](https://github.com/djshellshoxxx/p2p-offramp/pull/27) | Open; head `2f839b1…`; one proposed next-run prompt | Considered as planning evidence, not an executed approval or runtime policy |
| PR #26 checks | Browser and SonarCloud failure; CodeRabbit skipped; core contract/schema/spec/inventory and CodeQL checks succeeded; Snyk status succeeded | Recorded as delivery/qualification context; no fix or rerun is claimed |
| Research changes | New files under `docs/research/` only | No source, CI, dependency, trust, funds, deployment or governance-decision changes |

The live [check-run endpoint](https://api.github.com/repos/djshellshoxxx/p2p-offramp/commits/94554ecf9854e4604f9f56afe5bebedeee931994/check-runs?per_page=100) and [status endpoint](https://api.github.com/repos/djshellshoxxx/p2p-offramp/commits/94554ecf9854e4604f9f56afe5bebedeee931994/status) were read. The exact bot findings summarized by PR #27 are leads for the active implementation owner, not independently reproduced defects from this research.

**Concurrent work:** PR #28 adds repairs, PR #29 carries proposed owner decision packets, PR #30 supplies complementary security research, and PR #31 records a separate correctness review. These appeared during this batch. Main and PR26 retained the source heads above at the later check. Their proposals, author-reported findings and test counts remain attributed to those workstreams; see [the pinned coordination record](CONCURRENT-WORK.md). Carry this dossier's evidence into the existing packets and review process.

## Research results that change the next decisions

| Result | Practical consequence | Evidence |
| --- | --- | --- |
| Canonical funding, wallet acceptance and messaging identity are separate facts. The existing chat acknowledgment has no wallet signature. | Finish the existing D1 carrier review with exact key-role binding, account policy and durable replay semantics; preserve the basic escrow ABI. | [01](01-evm-and-settlement.md), [02](02-peer-acceptance-and-relays.md), [concurrent decisions](CONCURRENT-WORK.md) |
| Current NIP-78 guidance treats kind30078 as private user application data, while the app uses it for public offers; NIP-42 authentication is ignored by the current parser. | Select the public-offer and recipient-inbox/authentication profile before claiming actual relay interoperability. | [02](02-peer-acceptance-and-relays.md) |
| G14 and G16 use different shapes/limits; G15 currently rejects nonempty deployments. | Qualify core with an explicitly empty capability set, and select deployment/trust/archive contracts independently. | [02](02-peer-acceptance-and-relays.md), [04](04-release-trust-and-recovery.md) |
| An escrow's terminal state can coexist with unpaid fixed-beneficiary credit. A bank may recover a deposited transfer even when the sender cannot cancel it. | Keep observed fiat receipt, bank recovery risk, native escrow state, actual crypto delivery and aggregate withdrawal credit distinct. | [01](01-evm-and-settlement.md) |
| The 2,048-byte QR ceiling cannot fit Q/H byte-mode capacity; iOS browser return has a documented manual-return constraint. | Resolve the competing D6 codec/error-correction candidates, then measure actual wallet/camera/assistive-technology behavior. | [05](05-wallet-mobile-qr-and-browser.md), [concurrent decisions](CONCURRENT-WORK.md) |
| Solana Wallet Standard allows modified returned signed bytes, and OCMS constructs a different format from raw G16 terms. | Verify the exact returned message and select the native custody, wallet and transaction-format profile before claiming parity. | [06](06-solana-custody-and-parity.md) |
| Current XMTP browser migration guidance removes the SDK database-encryption-key option; older source snapshots have different dependency graphs. | Resolve the selected generation's durable-storage and backend fit before adapter implementation. | [07](07-optional-privacy-and-identity.md) |
| Provider/package names conceal materially different maintenance, execution and trust boundaries. Membership and authenticated source bytes do not establish score, uniqueness or irreversible payment. | Admit each proof/identity/optional authority profile against its exact statement, artifact, trust policy and qualification evidence. | [03](03-payment-proofs-and-providers.md), [07](07-optional-privacy-and-identity.md), [08](08-arbitration-liquidity-and-physical.md) |

## Research method

1. Read current repository metadata, open PRs, branch heads, source trees, the latest remainder, governance packets and relevant source/test files. Use commit-specific links so later branch movement does not silently change the evidence.
2. Assign disjoint research questions to parallel specialists. Use standards, protocol maintainers, original source, original papers, audit authors, rail operators and regulators as the primary evidence. Search results are discovery aids; reports distinguish sources actually read from links not inspected.
3. Separate repository observations, source statements, researcher inferences, recommendations and unresolved assumptions. A provider's own audit list is not evidence that a specific app integration is covered.
4. For each decision, record alternatives, trust/authority differences, compatibility implications, concrete acceptance work and what would close the gap.
5. Review reports across authors, verify material sources, reconcile overlapping recommendations and check all new document links and structured records before publication.

This is a focused engineering evidence review, not a systematic literature review of every publication, a professional audit, a jurisdictional opinion or an interoperability certification. Source quantity is reported for traceability; relevance and claim support determine quality.

## Use the research without duplicating work

Start with the latest live PR state. Carry these findings into the existing owner/task process after checking whether a decision or implementation has already changed. The reports preserve the key distinctions:

- **Research conclusion:** the available sources support a recommendation or rule out an unsupported claim.
- **Protocol selection:** an accountable owner/reviewer chooses exact interoperable bytes and authority semantics.
- **Implementation evidence:** the selected behavior exists and has appropriate tests.
- **Qualification evidence:** the exact artifact works with the chosen provider, chain, browser, device, rail and operational process.
- **Activation:** a separate release decision uses those records.

Do not convert a report, proposed JSON record, passing fixture or named agent into a protocol approval. Conversely, missing production keys or a physical device does not block independent research or defined local engineering.

## Recommended sequence

1. **Reconcile PR #26 delivery with its owner.** Resolve verified browser/review/quality-gate issues in that workstream and preserve original evidence.
2. **Freeze the minimal core acceptance profile.** Define the peer carrier, messaging-to-wallet binding, signature role/domain semantics and G14-to-G16 mapping only where required. Preserve existing basic escrow economics and old exits.
3. **Freeze testnet trust and deployment evidence.** Reuse the existing Sepolia tools and G15 verification; fill the exact missing profiles and real public trust identity.
4. **Qualify a real two-client journey.** Bind source/artifact, chain, wallets, relay and recovery evidence to one selected profile, including interruption and uncertainty handling.
5. **Finish target-specific browser/mobile/QR/recovery evidence.** Use the proposed matrix and explicit exclusions.
6. **Admit optional profiles one at a time.** Use the deferred reports to decide whether a feature's value justifies its new custody, provider, device, operational and testing burden.

No finite research batch can manufacture a provider's missing artifact, a maintainer's key custody, an independent review, a bank's actual terms or physical-device behavior. Each report names those remaining inputs so subsequent work can proceed precisely.
