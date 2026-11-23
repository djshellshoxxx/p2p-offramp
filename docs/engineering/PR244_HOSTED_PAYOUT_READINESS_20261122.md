# PR #244 hosted payout-readiness qualification and PR #242 failure preservation — 2026-11-22 UTC

## Immutable source and target identities

- Repository: `djshellshoxxx/p2p-offramp`; checked main: `01f6f4feca051d68de24a04299cd3bb444bce40c`. Neither source changes nor merges to main occurred in this review.
- Parent **draft PR #242**, head `00efff307b10c5ed9a8bd604a21eb2bf5816e7ef`, base PR #241 `29491c2842e0aedcb00a674cbfffb9edc2424013`. Its [original Solana job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/44826827834/job/136601434309) **FAILED** on 2026-11-20 after local validator acceptance: the actual Chromium+encrypted Worker/IndexedDB journey timed out attempting to click a disabled `Review separate payout` button even though the escrow was reported `released` and `paidOut=false`. This failure remains FAILED in historical evidence.
- Child **draft PR #244**, head `2acdaa3714b2c263291251b18742068077cc54ea`, base exactly the PR #242 head. Its one-file diff changes only `scripts/test-solana-localnet-browser.mjs`: 26 added test/diagnostic lines, no production, contract, financial or workflow changes.

## What the exact patch tests

After the existing explicit finalized-release state assertion, the test invokes only the **existing explicit refresh** and waits no more than 150 seconds for the normal `Review separate payout` button eligibility. It does **not** force-enable the button, bypass wallet checks, change guard conditions, or send anything during the wait. Before the separate payout, the test demands:

1. At least one `release` journal record has state `finalized`.
2. Every release journal record is terminal (`finalized`, `failed`, `dropped`, or `cancelled`); no unresolved release intent is admitted.
3. The application physical-send count remains at two through readiness polling; only then does an explicit payout prepare/confirm proceed.
4. On timeout, diagnostics reveal only action/state, public displayed conditions and boolean/enum status, never wallet addresses, signatures, secrets, prepared payloads or keys.

These assertions were confirmed by inspecting the actual GitHub PR #244 unified diff, not reconstructed from a historical handoff.

## Executed GitHub-hosted evidence (not local simulation)

- [Exact-source Solana workflow run](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/45006572663), job `137159396404`, **SUCCESS** ending 2026-11-22 10:24:42 UTC. The run checked out PR #244, built SBPF, ran Clippy/LiteSVM and IDL checks, performed native validator acceptance, installed Chromium and executed actual browser+Worker+encrypted IDB tests.
- The actual browser log shows six successful paths: saved proposal without send; one reviewed seller funding; cancelled/changed-wallet no-send; finalized release followed by separately reviewed payout; unknown-marker restore with no resend; and real finalized-Clock refund plus separately reviewed payout.
- The browser waited for the actual unwarped finalized Clock from approximately 09:54:37 through 10:24:40 UTC; `actualGenesisRpc=true`, `fixtureErrors=[]` and `ReleaseEnabled=0` are present in the structured log. These are local validator/browser results, **not** public-network, bilateral trade or real-money acceptance.
- Direct GitHub check-runs readback: **12/12 SUCCESS on exactly PR #244 head**, including `program` and `browser`. The separate PR #242 exact original `program` check remains FAILED. No transfer of source-specific CI status is allowed.
- Independent-scoped coordinator **COMMENT** review `6015955813` was submitted on PR #244 at its exact head. This is explicitly **not** independent Tier C approval, CodeRabbit/Qodo named Tier B review or owner authorization.

## Other current-check readback

The documentation-only coordinator PR #245 at `917921d73f9f8bca747e620b1f4248fe6e09a8e7` passed **14/14** exact-head hosted checks on 2026-11-23 UTC, including CodeQL, Chromium, Firefox, WebKit, EVM, Nostr, specs and docs. That success belongs only to that documentation head; it is not a qualification of the financial PR stack.

## Disposition and next bounded engineering action

**PR #244 is a validated test-only diagnostic continuation, NOT a product fix or a qualified merge to main.** The original #242 failure established a time-of-check/readiness gap in its browser journey, but no proof of a production safety defect or systemic scheduling failure; the unchanged production source passed #244's additional readiness/journal/send assertions in this hosted run.

Keep PR #237–239's standalone named CodeRabbit-or-Qodo Tier B reviews, current-target merge-tree acceptance and source-specific checks; PR #241–242's Tier C current-source/target native/financial acceptance, independent review and **explicit PR-recorded owner authorization** remain mandatory. PR #244 is stacked under frozen #242 and must be requalified against its actual future target after parents integrate. Preserve old failures, source branches, reviewer ownership, both real refund waits and strict principal/fee/marker/signature/send assertions. No force push, source merge, deployment, release, live funds, credentials/trust changes or optional-default activation. `ReleaseEnabled=0`.

Next unblocked work: compare wallet cancellation/accessor regression tests from historical PR #26/#40 against current main before proposing an isolated test integration; preserve their existing owner PRs rather than recreating working implementation. The 257-branch inventory remains **A137/P59/U0/C5/E12/V25/F18/B1/D0**, meaning open-PR and partial cohorts are NOT completed by ancestry screening.
