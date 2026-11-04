# Coordination with concurrent research, decisions and repairs

**Observed:** 2026-11-04 02:38 UTC. The research baseline remains main `e9b9db3bfe9fd8ceb54f1eeebf481d82fd7a93aa` and unmerged PR26 `94554ecf9854e4604f9f56afe5bebedeee931994`. Four additional PRs appeared during this batch. All were open at the metadata check below. These observations are time-scoped; recheck live heads before implementation.

## Active work and inspected evidence

| Workstream | Observed head | Handling in this dossier |
| --- | --- | --- |
| [PR28: browser and AbortSignal repairs](https://github.com/djshellshoxxx/p2p-offramp/pull/28) | [34b80eb908f69e1bd9fc69038d067157d618d6e8](https://github.com/djshellshoxxx/p2p-offramp/commit/34b80eb908f69e1bd9fc69038d067157d618d6e8) | Preserve its implementation ownership. PR metadata/body inspected; its reported fixes and tests were not rerun here. |
| [PR29: proposed owner decisions](https://github.com/djshellshoxxx/p2p-offramp/pull/29) | [2a7c362d1580d25c465ab204df5159d21256a9a2](https://github.com/djshellshoxxx/p2p-offramp/commit/2a7c362d1580d25c465ab204df5159d21256a9a2) | Continue these packets rather than creating competing decisions. D1/D4/D6/D7/D8 were read at `0ef25492964feb124d7691f5c37addb5d106f2cf`; the intervening diff adds D2/D3 and leaves those five unchanged. |
| [PR30: security research](https://github.com/djshellshoxxx/p2p-offramp/pull/30) | [3a523a11a87d85443c484b6a4d4284b96c5f0b41](https://github.com/djshellshoxxx/p2p-offramp/commit/3a523a11a87d85443c484b6a4d4284b96c5f0b41) | Complementary source analysis, not a second implementation owner. Its [index and scope](https://github.com/djshellshoxxx/p2p-offramp/blob/3a523a11a87d85443c484b6a4d4284b96c5f0b41/docs/research/security-2026-11-03/README.md) were inspected for this coordination note. |
| [PR31: security/correctness review](https://github.com/djshellshoxxx/p2p-offramp/pull/31) | [6e9c0c5ea8881013d06892103cf87ef1c547476a](https://github.com/djshellshoxxx/p2p-offramp/commit/6e9c0c5ea8881013d06892103cf87ef1c547476a) | Treat its [summary](https://github.com/djshellshoxxx/p2p-offramp/blob/6e9c0c5ea8881013d06892103cf87ef1c547476a/docs/reviews/2026-11-04-codebase-review/README.md) and [eight-finding register](https://github.com/djshellshoxxx/p2p-offramp/blob/6e9c0c5ea8881013d06892103cf87ef1c547476a/docs/reviews/2026-11-04-codebase-review/findings.json) as repair intake. Both were inspected; findings were not dynamically reproduced here. |

PR29 contained seven proposed packets at the inspected snapshot: **D1, D2, D3, D4, D6, D7 and D8**. **D5 was absent** at that snapshot. This is an inventory of proposals, not their approval status.

## Protocol decisions: agreement and alternatives

**D1 owns the acceptance-carrier decision.** [D1] proposes an additional wallet-signed `PeerAcceptance` binding covering both messaging keys, role, terms and expiry without changing `TradeTerms` or the escrow ABI. [Report02](02-peer-acceptance-and-relays.md) distinguishes a smaller delivery-only interpretation from that stronger wallet/channel association. D1 is a concrete candidate for the stronger requirement; this dossier supplies identity, replay, relay and compatibility evidence to its review. The choice remains proposed. A second signature needs exact bytes and independent vectors; it does not make canonical escrow funding require buyer acceptance on-chain.

**D4 agrees on the empty core path but proposes a different future encoding.** [D4] recommends core-only now, followed by a new versioned manifest digest for the first extension. Report02 instead offers a per-module commitment mapping as one candidate that could preserve the existing G16 list construction. These are alternatives, not interchangeable encodings. Continue D4's owner review, compare exact limits and policy coverage, and select one versioned construction before nonempty commitments. Preserve current core bytes and original funded exits.

**D6 requires an explicit codec and scope decision.** [D6] proposes Base45, M error correction and a 2,048-byte envelope ceiling, with a lower generation target such as 1,024 bytes. [Report05](05-wallet-mobile-qr-and-browser.md) proposes raw UTF-8, Q correction and a 1,024-byte complete-envelope ceiling. Their capacity statements are consistent under their respective encoding modes; they optimize different size/correction tradeoffs. Include the complete prefix/envelope and actual library behavior in the comparison, then obtain physical scan evidence. Neither is adopted.

D6 also excludes wallet-session URIs from QR entirely, whereas report05 considers a separate connector-owned pairing flow. Route that scope question to the D6 owner: does the prohibition cover general application interchange only, or connector pairing as well? The separate-flow candidate must not silently override the proposed ban.

## Release, package and repository-policy proposals

The latest PR29 commit adds [D2 testnet trust][D2] and [D3 maintained recovery][D3]. They overlap [report04](04-release-trust-and-recovery.md)'s bootstrap and recovery work. D3 reports a registry-only testnet manifest versus registry-plus-ABI recovery-builder mismatch and proposes one shared two-asset manifest plus stable deployment-ID binding. This is an owner-packet finding inspected in the diff, not independently reproduced by this coordination review. Resolve it in that packet before claiming the existing tools compose end to end.

D4/D6—and the new D2/D3—identify an earlier PR26-related checkpoint, `45630ba`, in their headers. Preserve that provenance and recheck source-dependent assertions against the implementation head selected for subsequent work.

[D7] proposes separating optional reference packages from the core merge. This dossier's optional research neither chooses their merge disposition nor makes them core dependencies. Its commit-specific evidence remains useful if those packages move to another branch. [D8] proposes merge-policy tiers and repository settings; it is not an adopted enforcement policy. Its service-capability and settings assertions need current verification before action and are not established as facts by this note.

## Repair intake precedes qualification

PR28 retains the browser/cancellation repair lane. Its observed body reports a cancellation change subsequently reverted after a funded-restart regression; that follow-up remains with its existing owner. Do not infer completion from an earlier repair commit or duplicate its fixes.

PR31's authors classify eight findings as confirmed by static control-flow/source comparison: one P1, five P2 and two P3. These include the release/payment-guidance coupling, transaction-denial recovery and missing deferred-credit presentation relevant to reports01 and05. They are **author-confirmed findings**, not newly reproduced results of this research. PR31 separately reports 585 existing tests passing across 50 files; its authors explicitly distinguish those tests from bug reproductions. This dossier ran no application tests.

Carry the findings into the active repair process, retain original evidence, and verify the resulting exact commit before a real two-client qualification. PR30's research supports the same sequencing. None of these open PRs, proposed packets or research recommendations supplies protocol approval, production activation, or completed external qualification.

[D1]: https://github.com/djshellshoxxx/p2p-offramp/blob/0ef25492964feb124d7691f5c37addb5d106f2cf/docs/adr/proposed/D1-peer-acceptance-carrier.md
[D4]: https://github.com/djshellshoxxx/p2p-offramp/blob/0ef25492964feb124d7691f5c37addb5d106f2cf/docs/adr/proposed/D4-capability-to-terms-commitments.md
[D6]: https://github.com/djshellshoxxx/p2p-offramp/blob/0ef25492964feb124d7691f5c37addb5d106f2cf/docs/adr/proposed/D6-qr-payload-profiles.md
[D7]: https://github.com/djshellshoxxx/p2p-offramp/blob/0ef25492964feb124d7691f5c37addb5d106f2cf/docs/adr/proposed/D7-optional-reference-packages.md
[D8]: https://github.com/djshellshoxxx/p2p-offramp/blob/0ef25492964feb124d7691f5c37addb5d106f2cf/docs/adr/proposed/D8-merge-policy-and-branch-protection.md
[D2]: https://github.com/djshellshoxxx/p2p-offramp/blob/2a7c362d1580d25c465ab204df5159d21256a9a2/docs/adr/proposed/D2-testnet-trust-root-and-sepolia-record.md
[D3]: https://github.com/djshellshoxxx/p2p-offramp/blob/2a7c362d1580d25c465ab204df5159d21256a9a2/docs/adr/proposed/D3-maintained-recovery-manifest.md
