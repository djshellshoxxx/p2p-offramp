# Evidence quality, review and verification record

Research date: **2026-11-03, America/Vancouver**. Retrieval and review: **2026-11-04 UTC**.

## Scope and outcome

This collection contains nine topic reports, a complete mapping of the 27 unresolved canonical records, a sequenced decision queue and a coordination note for concurrent repository work. Seven agents researched distinct topics; the coordinating author wrote the release/recovery and operator reports. Two additional agents reviewed evidence across authors. **Nine specialist agents** participated in total. The coordinating author also inspected material primary sources and reconciled the reports.

The separate reviewers completed their assigned reading and selected primary-source checks. They identified **one medium-priority evidence-provenance correction and four low-priority precision corrections**. All five were applied before publication. No additional high- or medium-priority evidence error was identified within their checked scope. This is an internal research-team review, not an externally commissioned security audit, legal opinion or interoperability certification.

The inspected implementation baseline is main `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa` and open PR26 at `94554ecf9854e4604f9f56afe5bebedeee931994`. Concurrent proposals and reviews have their own source pins and observation times in [CONCURRENT-WORK.md](CONCURRENT-WORK.md). A later change to a branch cannot retrospectively change these source observations.

## Separate review coverage

| Review stream | Reports read | Selected evidence independently checked by that reviewer |
| --- | --- | --- |
| Core evidence | [01](01-evm-and-settlement.md), [02](02-peer-acceptance-and-relays.md), [03](03-payment-proofs-and-providers.md), [04](04-release-trust-and-recovery.md), [09](09-operator-and-jurisdiction-evidence.md); index, gap map and decision queue | Canonical unresolved IDs/states; EVM finalized-number preflight; original versus partition formal outcomes; NIP-59 attribution; G15 deployment rejection; TUF rotation; current GitHub workflow pinning guidance; Vouch proof modes and notary validity; selected Canadian regulator/statutory sources. |
| Optional and interoperability evidence | [05](05-wallet-mobile-qr-and-browser.md), [06](06-solana-custody-and-parity.md), [07](07-optional-privacy-and-identity.md), [08](08-arbitration-liquidity-and-physical.md) | Solana signed-message/transaction mutation and format versions; G16's 383-byte source arithmetic; Semaphore root/nullifier behavior; XMTP storage generation; stealth shared-secret encoding; IndexedDB deletion and actual storage layout; Media Capture call precondition; Chainlink coordinator/owner authority and service guidance; G02 limits; igloohome authentication and context-specific status enums. |

The optional reviewer separately checked the applied refinements in the final staged reports. The core reviewer also reconciled the concurrent owner proposals and review work. Review assignments deliberately crossed authorship; they did not become a second implementation or change existing approval records.

## Corrections made

| ID | Finding | Applied resolution | Report and supporting source trail |
| --- | --- | --- | --- |
| CORE-01 | The draft conflated original whole-target formal UNKNOWN results with later partition timeouts. | Preserved **three original whole-target UNKNOWN results** separately from T91's constructor proof under its declared model and **two partition timeout UNKNOWNs**. The three-attempt partition budget remains exhausted. Guard-only proofs and the native-credit counterexample retain their distinct scopes. | [01, formal scope](01-evm-and-settlement.md) and [decision queue](DECISION-QUEUE.md); pinned remainder, property manifest and partition qualification record. |
| CORE-02 | A stated notary-key validity interval omitted the nullable upper bound. | Always require `validFrom <= tlsTimestamp`; require `tlsTimestamp < validUntil` only when `validUntil` is non-null. A null upper bound does not establish application freshness. | [03](03-payment-proofs-and-providers.md), PP16/PP19. |
| OR-01 | Semaphore's default duration was attributed to constructors. | Corrected this to the relevant simple `createGroup` overloads. The configurable one-hour default conclusion is unchanged. | [07](07-optional-privacy-and-identity.md), pinned Semaphore implementation. |
| OR-02 | A database/object-store path was presented as a database name. | Distinguished database `p2p-offramp-vault`, object store `vaults` and key path `profileId`; added the implementation reference. | [07](07-optional-privacy-and-identity.md), R15. |
| OR-03 | Camera wording blurred the call precondition and the application's ongoing-track policy. | Recorded that a `getUserMedia` call from a document that is not fully active rejects with `InvalidStateError`; kept the proposed stop-track policy separate and pinned the dated Candidate Recommendation Draft. | [05](05-wallet-mobile-qr-and-browser.md), MOB-12. |

Additional coordinating-author checks clarified contradictory TLSNotary FAQ statements about TLS1.3 plans; added the historical `tlsn-js` package's explicit deprecation; pinned upstream QR/mobile and token-source references; preserved XMTP generation and dependency distinctions; and added the missing Markdown reference definitions in report06. Report04 records the TUF expiration-order nuance: a previously trusted expired root can participate in successor traversal, with the final root's expiration checked after rotation. Each report retains the source and the limit of its inference.

## Source quality and access limits

The [source index](SOURCES.md) and [machine-readable ledger](sources.json) preserve author-local IDs, claim support, retrieval dates and source-specific limitations. External URLs are deduplicated after removing fragments and trailing slashes. Project file citations are counted separately. Different pages from one publisher are useful evidence for different claims, but are not independent corroborating organizations.

There are **161 distinct external source URLs**: relevant original content was inspected for **160**, and **one** is explicitly limited to a search excerpt. The reports contain **169 external citation entries** because several sources support more than one topic. The project evidence includes **94 distinct commit-pinned file URLs**.

The search-only entry is the historical Zellic/Reclaim assessment landing page, whose direct retrieval returned HTTP403. It cannot establish the full audit findings, remediation or coverage of the proposed integration. For the two IACR proof papers in report08, original abstract pages were read, while full PDFs returned HTTP403. Those abstracts support a proof-family comparison; they do not support a claim that the papers or implementations were fully audited. Package source versions do not prove that a matching published package or deployed bytecode was inspected.

Standards and regulator publications are distinguished from drafts, vendor statements, implementation source and researcher recommendations. Mutable service documentation is retrieval-dated. Sources were inspected for the cited claims, not necessarily read from beginning to end. No reviewer independently rechecked every bibliography entry.

## Documentation verification

The publication checks compare the complete unresolved-ID set and source states with the pinned canonical remainder. The 103 source records retain their original categories: 76 `LOCAL_SCOPE_COMPLETE`, 25 `EXACT_CONTRACT_OR_TOOLING_REMAINDER` and two `EXTERNAL_OR_TOOLING_QUALIFICATION`. All 27 unresolved records have a report and a defined next action. These categories do not measure product completion.

The final document checks cover JSON parsing, required bibliography fields and unique IDs, source URLs present in their topic report, local Markdown links and reference definitions, and commit-pinned project paths against the corresponding GitHub source trees. All proposed paths are new documentation paths relative to the inspected main and PR26 trees. The publication contains no runtime, dependency, CI, deployment, trust-key or existing-governance edits.

Final checks passed for **18 new files** (16 Markdown and two JSON), **292 local links**, **265 reference definitions**, **590 evidence-reference occurrences**, and all **94 commit-pinned project paths** across the six cited source revisions. The unresolved-ID/state comparison matched **27 of 27** records exactly. Source-ledger validation also passed for all nine topic bibliographies.

These checks concern this documentation collection. Existing application, browser, contract and formal test receipts are attributed to their original commits and workstreams. No new application tests, formal attempts, live-chain transactions, wallets, relays, provider jobs, bank transfers or physical-device exercises were run for this research. Runtime claims continue to require the artifact-specific evidence described by each report.

## What remains outside a research conclusion

The [decision queue](DECISION-QUEUE.md) identifies the exact protocol bytes, account/authority policies and artifact profiles still requiring owner selection. The selected implementation then needs source review, appropriate tests and the real wallet, chain, relay, provider, device and recovery evidence relevant to its scope. The [concurrent-work note](CONCURRENT-WORK.md) routes that work into the existing PR28–31 repair, decision, research and review streams without treating proposed packets or another review's reported tests as this batch's results.

The research closes evidence-gathering and comparison tasks within its stated scope. It does not change release-enabled flags, declare an unresolved record complete or substitute a recommendation for an existing approval process.
