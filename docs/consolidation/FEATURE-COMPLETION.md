# Source-based feature completion

Product checkpoint: main `91ee6991d4527bba0e76b048a76e65ed7693c5a1`, tree
`c494301afcf9577175d68f64dda924d6b8fe3c39`. Updated November 18, 2026
(America/Los_Angeles). Later development PRs have separate verification gates.

## How completion is estimated

There is no defensible common percentage denominator across protocol design,
implementation, browser wiring, physical-wallet acceptance and release review.
Numerical product percentages would imply precision the evidence does not support.
The estimates below therefore state implementation maturity and the remaining
acceptance conditions. A source-complete local fixture is not a release-complete
feature. Optional D7 work is excluded from mandatory MVP completion.

| Feature | Merged implementation and evidence | Missing work / dependency | Security concern and acceptance criterion | Estimate / priority |
| --- | --- | --- | --- | --- |
| Encrypted profile and backup | IndexedDB/CAS, Worker vault, create/unlock/lock, ciphertext export, fresh-key restore; real browser and affected package tests | Full supported browser/device matrix; independent crypto review | Restore must create an independent key/profile; locked/stale sessions must lose authority; corrupt/CAS-raced backups fail closed | Substantial implementation; qualification incomplete / P0 |
| Native EVM two-party journey | Explicit localnet seller/buyer composition, bilateral D1, wallet review, funding, manual payment guidance, release, timeout refund, journal/history, original funded exits | Physical wallets/public testnet and production trust intentionally separate; unfunded restart work below | Exact terms/account/chain/deployment, fresh per-action review, durable marker before send, original recipients preserved | Localnet journey implemented and hosted-browser qualified / P0 |
| ERC-20 two-party journey | Profile asset selection, allowlisted asset binding, balances, finite allowance review, zero reset/exact principal, funding/release/refund, lock and durable marker evidence in #170 | #173 extends wallet-change, fresh-profile and unknown-approval recovery browser acceptance; hosted GREEN required after correction | No unlimited allowance, no inferred approval receipt or invented transaction hash; unknown approval does not authorize funding; unrelated funded exits remain possible | Main happy-path/timeout implementation; expanded negative recovery acceptance pending / P0 |
| D1 bilateral agreement | Two account signatures per party (four for a bilateral agreement), exact reciprocal messaging keys, chain/deployment/terms binding, encrypted durable replay/tombstone state | Same-terms resumption from encrypted authenticated history is in active development | Revalidation must retain expiry/tombstone/current-chain rules; duplicate/reordered/stale-peer input cannot create new authority | Merged fresh-session protocol; restart composition incomplete / P0 |
| Unfunded negotiation resumption | Restored trade metadata currently does not itself reconstruct a live negotiation session | Implemented in #175: encrypted checkpoint hydration, explicit resume command/UI and current policy rechecks; 128 affected tests and independent review pass. Actual Worker/browser hosted qualification remains | Existing D1 format can reverify original consent; it has no fresh challenge nonce and cannot prove a new peer wallet signature after restart. Renewed local wallet/transaction review remains mandatory | Implemented candidate; exact-head browser/CI pending / P0 |
| Nostr discovery and encrypted messaging | Signed discovery, NIP-17/NIP-44 envelopes, bounded replay/history, reconnect/ordering rules and independent-library package vectors; loopback relay journeys | Real relay implementation/auth interoperability and interrupted offline resumption acceptance | Uncertain publish is not delivery; replay/order must not bypass bilateral acceptance; no mandatory app backend | Library/local integration substantial; real relay matrix incomplete / P1 |
| D9 send/recovery lifecycle | Prepared/sending/unknown/observed states, write-before-send marker, nonce holds and original-deployment reconciliation; historical regression bodies preserved | Physical wallet/RPC variants; historical records without trustworthy send provenance stay held | Never convert unknown send into safe retry; marker error yields conservative unknown state | Implemented; broader acceptance incomplete / P0 |
| Native Solana/SPL program and client | Finalized reader, client lifecycle, journal/recovery, Rust/LiteSVM and actual validator funding/payout/refund/freeze retry; #167 merged | Browser Wallet Standard and exchange/action composition, independent encrypted/browser restore acceptance on native validator | Program/PDA/mint/ATA/nonce/clock/recipient exactness; no auto send on restore; native fixture uses injected CAS journal, separate tests cover encrypted vault | Native client/program qualified locally/hosted; browser feature incomplete / P0 |
| Solana browser | Verify-only consent and package-level primitives exist | Compose external wallet, transaction review, Worker protocol, native actions, two independent parties, fresh-profile funded exits; actual Chromium + validator run | Must preserve external custody, original program identity and durable broadcast markers; EVM-only localnet profile cannot be relabelled Solana | Missing required application composition / P0 |
| Payment and settlement guidance | Manual bank instructions and explicit seller fiat confirmation; chain-observation helpers | End-to-end clarity and accessibility review across assets/devices | Fiat receipt text is unverified evidence; no proof adapter may silently decide manual-settlement rights | Core manual semantics implemented; acceptance incomplete / P1 |
| QR and mobile handoff | Bounded canonical envelope, base45 codec, symbol/SVG encoder and package regressions on main | #171/#172 fixes await mandatory review; camera/image decoder and authenticated app handoff UI absent | Grouping sizes and descriptor traps fail closed; handoff must bind exact authenticated session, never request funds solely from untrusted QR | Primitives implemented; app scanning/display journey unfinished / P1 |
| Localization, accessibility and UX | English catalog, locale checks, document language/direction, explicit wallet/transaction states and keyboard-focused recovery controls | Supported translations; mobile/zoom/RTL/screen-reader/keyboard journey evidence; clearer held/reconnect guidance | Never present unverified payment or held/unknown transaction as confirmed; controls must retain explicit consent | Partial / P1 |
| Developer lab and docs integrity | Existing pinned fixture infrastructure; #174 repairs strict docs, lab evidence and claims boundaries | Tier B automated review, exact-head CI, pinned-container qualification; #155/#156 separate | Developer claim rows are not release approval; path/size/descriptor limits remain strict | Repaired candidate with focused GREEN; integration gated / P2 |
| Release trust and static bundle | Offline signed registry/release verification, graph/asset/hash checks, production/default trading disabled | Approved trust roots, exact qualified deployments, physical-wallet/public-testnet and independent security evidence, owner release authorization | Keep `ReleaseEnabled=0`; no production trust setting or live funds in this run | Source controls implemented; release intentionally gated / P0 |
| Optional advanced capabilities | Historical/inert proof, arbitration, reputation, courier, liquidity and privacy packages retained; isolated source intake accepted November 18, superseding D7's earlier parking option | One package per PR, import-boundary checks, independent source/integration qualification and applicable D8 review; default-build wiring needs its own gate | Do not create hidden custody authority or make optional proofs prerequisites for basic manual trades | Accepted for isolated intake; qualification pending; excluded from mandatory MVP estimate |

## Two-party acceptance scope

The qualified native and token browser fixtures use separate seller/buyer browser
contexts, profiles and external-wallet test adapters. They exercise offer creation
and discovery, bilateral agreement, exact wallet review, funding, manual payment
instructions/confirmation, release, refund and encrypted local history. The native
browser run includes fresh-profile unknown-send recovery. #173 adds token-specific
fresh-key restore, unrelated funded exits and wallet-event invalidation checks.
These are disposable loopback-chain tests, not physical wallets or public-net
interoperability.

One newly specified availability behavior is explicit: if a wrong-chain event
prevents cancellation from passing canonical validation, the durable preparation
remains held. The funded exit returns only after correct-chain reconciliation at
the configured block lease. A test must not clear that intent merely to make a
reconnect look immediate.

The full remaining task list, dependency, proposed regression and acceptance
criterion are in [REMAINING-WORK.md](REMAINING-WORK.md). Raw outcome scope and source
pins are in [TEST-RESULTS.md](TEST-RESULTS.md).
