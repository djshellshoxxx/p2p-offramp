# Pages beta staging handoff, November 12, 2026 Pacific

The integrated software commit is `9730000058c6aca0dd794128652c8cfad0a22285`, tree `0cdde823931cf36bd26a624e409df1a722ef9ebc`. PR #98 targets `integration/p2p-consolidated-20261109`. At intake, staging was `c87c21b915c9e175113292bb1307754ed2424166` and main was `cdde998cf1d0e54c6cfb6fe9cdde0fc22a80e10e`. The documentation checkpoint after the software commit records the tested code SHA.

[Staging PR and disposition](https://github.com/djshellshoxxx/p2p-offramp/pull/98) · [Software commit](https://github.com/djshellshoxxx/p2p-offramp/commit/9730000058c6aca0dd794128652c8cfad0a22285) · [Branch and PR intake](../consolidation/2026-11-12-beta-intake.json) · [Owner coordination](https://github.com/djshellshoxxx/p2p-offramp/issues/82)

## What moved into staging review

| Work | Source or integration commit | Verification |
|---|---|---|
| Registry concurrency, RPC URL and HTTP buffer regressions | #78–80 via #83 `8783636` | Original changed-file blobs matched. 24/24 focused cases passed on staging. |
| Wiki User and Developer Guides | #68 through `8e69fb4` | Qualified predecessor. 10 source pages, 63 internal file links, zero missing targets. Newer `c14cfd0` had queued jobs and a CodeQL startup failure at intake. Live Wiki publication was outside this run. |
| Exchange and chain comparison tests | #84 `edc8a69` | viem and nostr-tools are pinned development dependencies. The combined Nostr oracle initially failed because spreading a signed in-memory object copied library metadata. The fix compares the JSON transport representation and isolates the signature-verification cache. A previously skipped case now proves a signed event delivered twice reaches its subscription once. |
| CLI, wallet, receipt, encrypted messaging, diagnostics and withdrawal regression tests | #76, #77, #85, #86, #88, #89, #90, #94–96 | Source histories preserved. #89 added the original 25-line test after staging's existing tests. Independent runs covered 110 tests across the other files and 31 in the reconciled transport file. |
| Interrupted ERC-20 payout | `93ffc45`, finished at `d36413d` | The fixture verifies the signed offer in the local order book before acceptance, then drops the release response after the real loopback send. Reopening and an explicit second submit produce a conflict before wallet entry. Native evidence, the buyer's token balance and the escrow's zero liability establish a single payout. |
| Copied Pages artifact integrity | `d9807d5` and `0f95aea` | Verifies every payload and the inventory against separately retained evidence. Review found and fixed a POSIX filename normalization collision. Regressions cover missing, changed, extra or symlinked entries, plus a shared manifest inode. |
| Installed-provider source verification | #99 in `cc3e442` | Fails if a recorded file is missing. Existing evidence for 20 hashes files and 24 curves files was reproduced byte for byte. |
| Offline recovery CLI | #87 via #101 in `93d181e`; #102 regression and fix in `9730000` | Checks regular-file identity and size on a single open handle. Rejects repeated endpoint, trade, reference, item or sender options before reading a user reference or choosing a provider. The original duplicate endpoint test failed before the fix. The standard recovery command now runs it. |
| Browser profile guide | #105 in `f7a6acb` | Source-checked Home and Recovery workflows document profile creation, interrupted writes, unchecked export and authenticated restore. |
| Keyboard and cross-engine checks | #103 in `69286f8`; #104 in `87bb3f4` | Recovery moves focus to the loaded results summary or private preview guidance. The equivalent combined UI tree passed runtime and recovery fixtures on Chromium 156, Firefox 157 and Linux WebKit/WPE 27.2. Alternate recovery engines used a temporary launcher. |

The #84 task-ledger conflict contained two independent sections appended to a common prefix. Both were retained. The only other content conflict was #89's test suffix. PRs #61 and #81 were not promoted to main. #81 still includes protected D8 changes. #62 overlaps the reserved domain facade. The #69–75 / #91–93 D9 stack includes a production wallet change in #69 and remains in its owner's lane. #100 belongs to the locale owner in #41. The [latest handoff at intake](https://github.com/djshellshoxxx/p2p-offramp/blob/a1930a3596f76eff4c29a1ee2991d6acd7f35895/docs/handoffs/CHATGPT_ZERO_CODEX_LATEST.md) and [T41–47 assignments](https://github.com/djshellshoxxx/p2p-offramp/blob/970ac80f08c04e8d340ee57d901e48e26a667a18/tasks/plan.md) identify active writers. Projects board access was unavailable. Issues #55 and #82 and PR/branch activity were inspected.

## Component inventory at the software commit

| Component | Implemented | Integrated | Tested | Remaining and priority | Owner or dependency |
|---|---|---|---|---|---|
| Wallet | External EIP-1193 adapter, account/chain guards, explicit EVM execution, EIP-712 signatures | Packages and synthetic journey | Wallet fixtures and local Anvil | P1 external-wallet UI and independently verified peer acceptance | T41 wallet, T42 exchange, D8 composition |
| EVM escrow | Native and ERC-20 funding, release, refund and deferred withdrawal | Canonical Foundry path and separate fixture contract | Foundry, local EVM, viem oracle | P0 generic reader returns UNAVAILABLE for canonical getTrade | Registry/chain owner must select authenticated ABI layout, G3 |
| Trade lifecycle | Reviewed terms, signed local trade, preflight, settlement and journal | Two local harnesses; shipped Pages UI handles terms review | Six submissions and six reconciliations in the three-trade fixture; canonical exchange fixture also exercised separately | P1 D1 signed peer carrier, seller confirmation screen and integrated browser journey | T41/T42, G1/G5 |
| Nostr messaging | NIP-17/44 messages and bounded encrypted history | Exchange library and local relay journey | Two reopened sessions, fresh-key recovery, recipient/scope tests | P1 profile-to-profile conversation in emitted Pages UI | Exchange/UI owners |
| Relay discovery | Signed offers, revision/expiry handling, filters, deduplication, failover | Relay library and loopback order book | Signed duplicate delivered once, relay pool tests, local negotiation | P1 destination-authorized interactive discovery and cancellation in UI | Relay/G1 UI owner |
| Recovery | Encrypted vault, reopen/restore, reference export, read-only CLI, immutable-beneficiary exits | Static vault/backup UI and offline CLI | Real browser storage, CLI and native reconciliation | P0 legacy durable send-marker migration and independent provenance after restart | T43 D9, #69–75, #91–93, #97 |
| Static UI | Local profiles, local terms review, saved history, diagnostics and recovery UX | Vite default and explicitly synthetic demo builds; hash routing and relative assets | Chromium project path; Firefox/WebKit targeted runtime and recovery | P1 interactive two-wallet composition; physical devices and screen-reader speech unverified | G1/D8 UI owner; device qualification |
| Release tooling | Reproducible artifact output, copy verification, source and registry evidence checks | Build CLI and development checks | Default/demo build pairs, signed-config fixture, source manifest regression | P0 independent audits, exact-head Sonar rating A, signed testnet evidence and authorization | Release/security owners |

## Thirteen-step buyer and seller acceptance

| Step | Evidence and limit |
|---|---|
| 1. Create or restore a local profile | Implemented in the emitted browser. Encrypted storage, fresh-key restore and retained review data exercised. |
| 2. Connect external wallet | EIP-1193 sessions and chain/account changes tested with fixture providers. The shipped demo does not connect an external wallet. |
| 3. Discover or import | Local terms import works through Pages. Signed discovery, expiry and replay handling work at the package/loopback level. |
| 4. Validate immutable terms | Both role fixtures verify the same bound trade data. The browser displays locally reviewed terms. |
| 5. Accept matching terms | Synthetic roles sign the same EIP-712 terms. The current exchange acceptance carrier lacks the approved D1 wallet/peer proof. |
| 6. Select authenticated escrow | Fixture registry pins are checked on loopback. The generic reader still needs a qualified canonical ABI binding. |
| 7. Seller funds | Native and ERC-20 paths exercised on locally deployed contracts. |
| 8. Buyer verifies finalized state | Canonical preflight and receipt reconciliation exercised. The generic reader gap limits integration. |
| 9. Buyer pays fiat outside the app | Instructions and preflight tested. No fiat transfer or bank confirmation was performed. |
| 10. Seller confirms external receipt | The synthetic seller explicitly authorizes release. The dedicated browser confirmation journey remains open. |
| 11. Release to buyer | Local contract tests and token-balance assertions establish exact beneficiary payout, including a lost response. |
| 12. Inspect and recover | Local canonical flows cover timeout/refund, deferred withdrawal and bounded unsigned recovery plans. |
| 13. Retain encrypted history | Browser reviews/chat fixtures and journal reopen/restore tested. The lost-response fixture retains injected terms/validator maps in memory. Historical native provenance and cold two-peer browser recovery remain open. |

## Validation and next integration

The following commands refer to Node 24.22.1 and the lockfiles. Foundry v1.5.1 and solc 0.8.30 were used locally. The testnet commands below used loopback stand-ins only. Outcomes are distinct per command; nested test counts overlap.

| Command or suite | Evidence |
|---|---|
| `npm ci --ignore-scripts`; `npm ci --ignore-scripts --prefix packages/escrow-evm` | Root and nested lockfiles installed; no runtime dependency change from viem/nostr-tools. |
| `npm test` | 1,268 passed, zero failed or skipped. |
| `npm run typecheck`, `check:boundaries`, `test:build-policy`, `test:specs`, `check:specs`, `test:fuzz`, `test:diagnostics`, `test:acceptance:cli` | Four TS projects, 28 build-policy tests, 16 Python tests, 173 indexed specs, 26 fuzz checks, 16 diagnostic checks, 12 acceptance CLI tests. |
| `test:local-evm`, `test:escrow`, `test:evm:viem`, `test:exchange:evm` | Three trades with six signatures/submissions/reconciliations, seven package escrow cases, 9 adapter + 17 local oracle checks, 12 canonical exchange checks. |
| `test:recovery:evm` | 15 offline cases and six local-chain checks; recovery runtime made 141 reads and zero send/sign calls. |
| `test:evm`, `test:evm:local`, `test:payment:preflight`, `test:evm:reconcile`, `test:sepolia:kit`, `test:sepolia:trade` | 82 Foundry cases, 8 local trade checks, 6+7 preflight checks, 5 reconciliation checks, 25+11 kit checks, 24+13 trade checks. |
| `build`, `build:demo`, `test:web:browser`, `test:browser`, `test:private:browser`, `test:locator:browser`, `test:chat:browser`, `test:diagnostics:browser`, `test:recovery:browser`, `test:locale:browser` | Browser evidence covers emitted assets at /p2p-offramp/, module Workers, encrypted persistence and restore, and the offline limitations. Builds were compared byte for byte across two runs of each profile. |
| Hosted GitHub Actions | [Vault and browsers](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/43362879769), [EVM escrow](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/43362879800), [specification inventory](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/43362879792). Snyk status is separate from SonarCloud. |

All eight Chromium commands passed on their first sequential invocation at the software commit. Each of two default builds had 9 payload files plus its manifest; each demo build had 10 payload files plus its manifest. The separately retained manifest SHA-256 values were `849dfa8a4d4ed9b65695a06df5194050d51d24a59aee1319229224a106ec4f3b` (default) and `5dd9f1f3012257a338ef795ec8d5b0a979c01b78ba966da39bc2636393bd6dbb` (demo). All seven hosted jobs across the three linked workflows passed. Snyk reported success. There was no SonarCloud check for this code head and the direct PR-analysis endpoint returned HTTP 403. The historical rating C on #56 is not a rating for this candidate.

An earlier integrated SHA had simultaneous Chromium renderer crashes, two CLI timing failures and one synthetic terminal call returning BROADCAST_UNKNOWN. The same suites passed on fresh isolated runs without changing financial policy or retrying a possibly submitted transaction. Production and demo bundles retain ReleaseEnabled=0 and block outbound connections. The Pages-compatible build uses a meta CSP. Frame-ancestor protection needs an actual HTTP response header; the generated header-host recipe does not attest what a Pages host serves.

The highest-value remaining work is G3. From the verified staging code, inspect `packages/chain-evm/src/reader.ts`, `packages/wallet/src/evm-escrow.ts`, `packages/schemas/src/registry.ts` and `contracts/evm/src/BasicEscrow.sol`. The read-only viem test distinguishes the fixture contract's `escrows(bytes32)` from canonical `getTrade(bytes32)`. The owner must choose a signed deployment-record layout identifier or a mapping keyed by already-authenticated runtime bytecode. Continue on a dedicated Tier C branch after that decision. Exercise `npm run test:evm:viem`, `test:evm:local`, `test:local-evm` and `test:recovery:evm` against both layouts, including refusal of unknown identity. Coordinate registry and export changes with the active schema/facade owners. D1 peer proof, D9 historical provenance, an approved G1 localnet-only UI and an emitted two-wallet acceptance remain distinct prerequisites. External testnet evidence, Sonar and independent review are open. No real funds or deployment was performed.
