# Remaining engineering and qualification work

Checkpoint main `80375193f16082c582a1faf2c6ba598f9eca532a`; product source is unchanged from tested `91ee699…`.
This is a concrete acceptance backlog, not a declaration that the requested MVP
or independent release qualification is complete. `ReleaseEnabled=0`.

## Immediate integration and development

| Priority | Task / owner lane | Dependencies and exact remaining acceptance |
| --- | --- | --- |
| P0 | Finish [#173 ERC-20 browser recovery](https://github.com/djshellshoxxx/p2p-offramp/pull/173) | The corrected head passed the lease/wallet/restore assertions but failed at the later restored-release review; resolve staged native reconciliation versus a production defect, then require complete actual Chromium GREEN. Prove wallet account/chain/disconnect invalidate reviews; wrong account cannot release; wrong chain cannot connect; prepared block lease remains held before expiry; fresh-key restore never auto-connects/signs/sends; unknown approval never invents hash/authority; unrelated restored 1,100-unit release and 700-unit refund retain original recipients; expected 11 sends equal 11 durable markers |
| P0 | [#175 unfunded same-terms resumption](https://github.com/djshellshoxxx/p2p-offramp/pull/175) | Implementation and 128 affected tests/typechecks/artifact review are complete in the PR; actual hosted browser and exact-head gates remain. Persist bounded encrypted authenticated exchange history; restore exact trade and reciprocal identities; explicitly resume and reverify current chain/terms/clock/replay state; reject tombstoned/corrupt/stale/partial histories; require fresh local wallet and transaction review. Both independent controller and emitted Worker/browser regressions, including duplicate/reordered input and lock/fresh-profile restore, must pass. Existing D1 has no renewal nonce; do not claim fresh peer-signature epoch |
| P0 | Solana browser composition | Use existing native program/client/recovery; add Wallet Standard connection/events, exact transaction review, Worker action bridge, exchange binding and native/SPL journey. Real two-party Chromium plus native validator must cover send markers, receipt/reconciliation, fresh-profile funded exits, wrong program/PDA/mint/ATA/account/chain, disconnect/lock and unknown broadcast. Native package success is insufficient |
| P1 | [#171/#172 QR repairs](https://github.com/djshellshoxxx/p2p-offramp/pull/171) | Required seven checks already pass. Obtain the specific D8 Tier B CodeRabbit/Qodo review and answer findings; then re-fetch exact heads, compare merge trees and integrate. Do not replace the review with an inferred approval |
| P2 | [#174 tooling repair](https://github.com/djshellshoxxx/p2p-offramp/pull/174) | Independent review, all required jobs plus new docs-tooling job, and Tier B automated review. Keep strict owned-document hashes current when documentation changes. Original #154 may close only after complete incorporation. Pinned-container run remains separate |
| P2 | #155/#156 inert intake/governance | Depend on repaired #154. Adapt exact owned evidence/sourceCommit bindings to current main; test inert records without enabling optional code or treating historical decisions as current approvals. #156 tool-path test alone is already selectively imported in #174 |

## Other MVP acceptance

| Area | Required result |
| --- | --- |
| Nostr interoperability | At least one independent real relay implementation and current AUTH behavior; separate client identities/storage; reconnect/offline/duplicate/reorder/expired/unknown-publish cases; no mandatory centralized runtime service |
| QR/mobile | Actual camera/image decoding and SVG display application flow, bounded payload validation, authenticated-session/deep-link binding, mobile wallet switching and fresh-profile recovery; malformed input must not open authority |
| Accessibility / guidance | Keyboard-only full buyer/seller journey, focus after errors/lock/restore, screen-reader labels, responsive/mobile/zoom checks and exact pending/held/unknown transaction wording; fiat evidence stays explicitly unverified |
| Localization | Reviewed translations and runtime catalog completeness; actual locale/RTL/browser acceptance. English-only implementation is not translation completion |
| Original-deployment exits | Supported external wallets and RPC endpoints; restore funded native/ERC-20/SOL/SPL trades against original deployment identity, without discovery/registry rotation revoking lawful exits |
| Combined regression | After every product merge, verify predicted/actual tree and rerun affected integration checks; retain exact-head hosted evidence. No borrowed source-head passes |

## Historical candidates retained for selective extraction

#26/#28/#35/#37–48/#56/#81 retain unique signed-update, EIP-1271 fixtures,
personalization, native journey/retention, recovery portal/distribution and evidence
assets. The [historical review](HISTORICAL-BRANCH-REVIEW.md) records exact absent and
different paths. Extract one compatible feature at a time against current D1/D9,
with regression tests and current policy; do not merge the old cumulative tree.
#142 may supply safe read-only helpers, but its line-membership heuristic must not
decide content equivalence or branch retirement.

Optional D7 proof, arbitration, reputation, courier, liquidity and advanced privacy
work remains deferred. The authoritative custodial ledger architecture is rejected
for this noncustodial product and retained only as historical source.

## External and release gates

The root npm advisory scan is now clear after the upstream withdrawal; retain
fresh scans and supply-chain evidence for release. Independent professional
security review, exact deployment/runtime/IDL/compiler records, approved trust
roots, physical-wallet/device coverage, public-testnet recovery, SonarCloud rating
where required and explicit owner release approval remain unestablished. This task
does not authorize production trust changes, deployment, live funds or release.

[Issue #130](https://github.com/djshellshoxxx/p2p-offramp/issues/130) still has old
representative runs `43096680664`, `43096508461` and `43096596488` queued with no
conclusion and unchanged November 11 timestamps. New current-stack workflows do
execute, so this is not evidence of a repository-wide outage. Historical #66/#67
content and #68 ancestry are incorporated through later independently qualified
work. No obsolete run was canceled, dispatched or reclassified as passed; scheduler
root cause remains unconfirmed.

The recommended next product task is to finish the active same-terms resumption
path and its actual Worker/browser acceptance, then implement Solana browser
composition. Continue independent queued/review-gated lanes without bypassing their
requirements.
