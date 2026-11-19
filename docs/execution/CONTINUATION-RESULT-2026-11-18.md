# Consolidation and ERC-20 continuation — November 18, 2026

## Outcome and source

This continuation merged the qualified formal harness into main, reconciled the
three active product branches with that main, consolidated four documentation
histories into a dedicated review, and implemented the missing ERC-20 localnet
application workflow. The final combined package suite passed **1,943 tests with
zero failures or skips**. The new token workflow and independent recovery
regression also passed against real local Anvil escrow deployments.

The published implementation checkpoint is
[`5caca61b065c8bd6d0a03385876519cbf5d9b065`](https://github.com/djshellshoxxx/p2p-offramp/commit/5caca61b065c8bd6d0a03385876519cbf5d9b065),
tree `fcb55944b3580c9727d2a9a194b2369c102f322a`. It is byte-identical to local
`c3c03397097c1d064014511935ae86ed10eb4ef0`. The full package suite ran at local
`0db582b29f74f5f706e5750c1ee3238401ad74fe`; subsequent differences before publication
were confined to the component report and three evidence logs. Product, tests,
dependencies and workflow inputs were unchanged. This final report and its
verification files add documentation only.

**The project is not release-qualified.** Actual Chromium execution and the
combined real Solana-validator gate remain outstanding. Physical wallets, public
testnets, native Solana browser actions and interrupted unfunded D1 negotiation
resumption are separate unfinished work. `ReleaseEnabled=0` remains in force.

## Consolidation performed

| Work | Result | Source identity |
| --- | --- | --- |
| [PR #137](https://github.com/djshellshoxxx/p2p-offramp/pull/137), formal/refinement harness | Merged into main after independent review, 22 formal regressions, four TypeScript projects, 32 specification tests and ten successful source-head hosted checks | Merge `6c38e641e24abcfdcf645f864bd64c9645836d75`; resulting tree `44bc5282c9bd59b49b128ed2028e940588fba053` matched the tested native Git merge |
| [PR #166](https://github.com/djshellshoxxx/p2p-offramp/pull/166), EVM hardening | Updated with current main; mergeable, draft, fresh hosted qualification required | `9bc9aa83d740891a01522b7398f5fd3e4049b3e8`; 1,765 package tests, 22 formal cases, 50 build-policy cases and both builds passed within the documented source scopes |
| [PR #167](https://github.com/djshellshoxxx/p2p-offramp/pull/167), Solana recovery | Updated to the refreshed EVM base; original Solana source heads remain ancestors | `c277a9383f1712d70e94807a376dc8fc3f5c43e1`; 1,902 package tests, four TypeScript projects, boundaries and 22 formal cases passed; actual validator qualification remains pending |
| [PR #168](https://github.com/djshellshoxxx/p2p-offramp/pull/168), native browser composition | Updated to the refreshed Solana base; strengthened full-transaction durable-marker assertions in both native and browser harnesses | `a0be1b656b977d0356768817d99d8aeb42c7bcba`; ten mutation/provenance regressions, twelve native checks, four exact marked sends and source-specific typecheck/formal evidence |
| [PR #169](https://github.com/djshellshoxxx/p2p-offramp/pull/169), documentation consolidation | Combines #136/#139/#164/#165 while retaining all four exact heads as ancestors; original PRs await actual integration before retirement | `db3198379a0c9e12b3f1415ce09256cce18a01d7`; fifteen Markdown files, 128 valid relative links across twenty files, 173 specifications with zero broken/unindexed links |
| ERC-20 feature branch | New reviewed implementation and qualification gates, stacked on #168 | `feature/erc20-browser-continuation-20261118`; implementation checkpoint linked above |

At this checkpoint, #166–#169 remain drafts with fresh hosted jobs queued. A
mergeable flag or successful local run is not substituted for those jobs. The
formal harness retains its explicit `PROOF_UNKNOWN` classifications and model
gap; its source merge is not a new whole-contract proof. Documentation records
preserve historical source scopes rather than relabeling old results current.

## ERC-20 behavior delivered

The localnet client can publish and discover allowlisted exact-transfer token
offers, negotiate exact private terms through the existing D1 exchange, and
obtain bilateral external-wallet consent. The encrypted Worker derives the
approval token, escrow spender and amount from those reviewed terms. The
document cannot supply an arbitrary spender, approval amount or raw transaction.

An existing nonzero allowance that differs from the principal requires its own
zero-reset review, followed by a separate exact-principal approval. Funding is a
third, explicit review. Canonical allowance and balance observations are checked
again at reservation and immediately before the durable send marker. Latest
state can veto finalized guidance; it does not independently grant authority.
The new observer uses canonical block hashes, bounded responses, header rechecks,
chain/genesis verification and cancellation guards.

The seller's bank-receipt confirmation precedes a separate release review and
external-wallet approval. Refund eligibility uses chain time. A funded trade's
release/refund remains available after fresh-key restoration without renewed
ephemeral D1 acceptance or an allowance-query dependency. A token approval whose
broadcast response was lost remains held after restoration; observing allowance
does not establish its transaction identity or authorize resubmission.

This implementation remains in the explicit chain-31337 localnet build. Ordinary
default/demo artifacts retain their build-policy boundaries. Signing authority
stays in the external wallet, and the existing encrypted local vault owns private
terms, chat and durable history.

## Independent findings repaired

### Complete durable send evidence

The existing test harnesses checked only calldata when claiming that an encrypted
send marker preceded a wallet transaction. Seven of ten new mutation/provenance
cases failed against that predicate. The replacement independently matches all
six physical request fields—account, destination, calldata, value, nonce and
chain—plus current-profile origin, marker version/timestamp, account/nonce metadata
and the absent pre-send transaction hash. All ten tests now pass. This was a
test-evidence weakness, not a reproduced production substitution vulnerability.

See [the browser/harness review](LOCALNET-BROWSER-CONTINUATION-2026-11-18.md).

### Funded exit hidden by an unrelated token outage

Independent real-Anvil review found that an unavailable allowance read for an
earlier unfunded record could abort refresh after unlock, leaving a later funded
trade undisplayed. The deterministic regression chooses the funded trade using
actual encrypted record order rather than modifying storage or relying on luck.

The repair keeps failed token guidance local to the unfunded trade: approval and
funding remain disabled there while other canonical escrow observations continue.
Wrong-chain, cancellation, profile lock and vault-conflict conditions remain
fatal. The regression now proves both the visible funded exit and an actual
transfer of the exact principal to the bound buyer, plus wrong-chain and lock
behavior. The original source fails the same test.

See [the independent ERC-20 review and RED/GREEN logs](INDEPENDENT-ERC20-REVIEW-2026-11-18.md)
and [the component implementation report](ERC20-LOCALNET-2026-11-18.md).

## Final combined verification

| Gate | Observed result |
| --- | --- |
| `npm test` | **1,943 passed; 0 failed, cancelled, skipped or todo** |
| `npm run typecheck` | All four TypeScript projects passed |
| `npm run test:specs` | **32 passed** |
| `npm run check:specs` | 173 specifications; zero broken links or unindexed specs |
| `npm run check:boundaries` | Passed; 197 production sources and 112 core-entry modules |
| `npm run test:build-policy` | **50 passed; zero failures/skips** |
| Default and demo builds | Both passed their policy scans |
| Existing native localnet controller | **12 checks; 12 typed signing requests; 4 sends and 4 exact durable markers** |
| New ERC-20 native driver | **7 checks; 12 typed signing requests; 8 sends and 8 exact durable markers** |
| Independent ERC-20 native regression | **4 checks; 8 typed signing requests; 3 sends and 3 exact durable markers** |
| Final actual token-bearing localnet artifact | **11 assets**, policy scan passed, `ReleaseEnabled=0`; no fixture-wallet operations during construction; browser execution not claimed |
| Browser helper/journey syntax | Passed |
| Three component-report link checks | Ten relative links; zero missing targets |
| Whitespace/conflict check | `git diff --check` passed |

The two ERC-20 native commands are required by `npm run test:localnet:erc20`.
The EVM workflow also runs `test:localnet:erc20:browser` after installing Chromium,
in addition to the existing native and built-browser journeys. The new browser
gate checks token selection, bilateral terms, canceled reset, separate approval
and funding, bank-confirmed release, timeout refund, seven complete IndexedDB
markers, private-view clearing and network restrictions.

The [verification receipt](evidence/continuation-20261118/qualification.json)
links the final local logs and their hashes. These are engineering execution
records, not signed release attestations or physical-wallet evidence.

## Remaining qualification and next sequence

1. Inspect hosted results on the exact #166 head, then integrate the qualified
   stack in order: #166, #167, #168, and the ERC-20 continuation. Retarget each
   child to current main after its predecessor lands and verify the resulting
   source. Preserve original Solana and partially extracted #159 work until
   exact replacement/containment evidence supports its disposition.
2. Complete actual Chromium native/ERC-20 journeys and the real Solana-validator
   gate. This host's Chromium process aborts at a denied Unix-socket operation
   before any browser page; neither a browser pass nor a permission workaround
   was used. The prior Solana-validator limitation remains unresolved here.
3. Qualify #169, then check all four original documentation heads again before
   retiring superseded PRs. The independent audit lane #138 remains separate.
4. Continue native Solana browser/exchange action composition, unfunded D1
   negotiation resumption, physical-wallet/public-testnet compatibility, QR/device
   workflows and reviewed release/bootstrap work.
5. Retain the separately recorded Picomatch dependency finding, unverified Sonar
   security qualification, independent release reviews and owner release decision
   as open work. This change does not claim to remediate that dependency finding.

No release qualification is inferred from test counts or source consolidation.
The implementation keeps external-wallet custody, a static client and
`ReleaseEnabled=0`.
