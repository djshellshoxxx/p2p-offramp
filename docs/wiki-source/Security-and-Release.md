# Security and release verification

[Home](Home.md) · **[User Guide](User-Guide.md)** · **[Developer Guide](Developer-Guide.md)**

**Status: experimental/test-only. No real-funds trading, production deployment, or release is authorized.** The merged default branch at `cdde998cf1d0e54c6cfb6fe9cdde0fc22a80e10e` (one added `agents.md` since the prior source-pinned baseline `300287dcde818a9d10ae301265d00bc7c0877bbb`) keeps `ReleaseEnabled=0` and an empty default network allowlist. A successful demo, local EVM test, or draft PR does not enable trading. See the [operator guide](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/OPERATOR.md) and [development status](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/DEVELOPMENT_STATUS.md).

## User-facing limitations and safe operation

- The ordinary build has **no owner-approved registry/trust pin**. The synthetic demo is for offline review, not funds. Testnet build trust checks are expected to refuse missing or unpinned release material rather than accepting alternate keys silently.
- An encrypted local profile and fresh-key backup restore are **not proof of anonymity, secure erasure, wallet authorization, payment finality, or counterparty honesty**. Device compromise, browser extensions, fiat providers, network relays and public-chain metadata can disclose activity.
- An unsigned historical transaction-recovery package is read-only evidence, **not a wallet signature or send/retry authorization**. A transaction whose broadcast outcome is uncertain must remain treated as potentially sent until independently reconciled. Save and independently verify the complete encrypted backup; a QR, screenshot, hash or partial receipt is not a replacement.
- No-script and static review experiences must not be presented as signing or custody interfaces. See [Privacy and Recovery](Privacy-and-Recovery.md) and [Wallet and QR Safety](Wallet-and-QR-Safety.md).

## Source qualification is not release approval

On **unmerged** [integration PR #61](https://github.com/djshellshoxxx/p2p-offramp/pull/61), commit `c87c21b915c9e175113292bb1307754ed2424166` has **10 successful GitHub Actions checks** and a separate successful Snyk status ([exact-head checks](https://github.com/djshellshoxxx/p2p-offramp/commit/c87c21b915c9e175113292bb1307754ed2424166/checks)). This only qualifies the observed hosted checks at that exact commit.

**Unresolved security gate:** the distinct [PR #56](https://github.com/djshellshoxxx/p2p-offramp/pull/56) SonarCloud result reports **Security Rating C versus required A**. The precise issue records were not available to the ChatGPT direct GitHub lane. PR #61 has no visible exact-head Sonar result. Do not infer that this gate passed from other successful checks, invent individual findings, suppress Sonar rules, or claim approval of draft integration changes.

Other draft work includes [D9 fail-closed marker handling (#69)](https://github.com/djshellshoxxx/p2p-offramp/pull/69), [fresh-key broadcast-unknown restore tests (#70)](https://github.com/djshellshoxxx/p2p-offramp/pull/70), and a further historical terminal-label characterization [#71](https://github.com/djshellshoxxx/p2p-offramp/pull/71). These **do not complete** historical-record provenance migration or allow an unknown transaction to be resent.

## D9 encrypted-recovery state evidence (draft-only)

This matrix links the currently **unmerged, test-only** recovery characterization slices to their exact source heads. It is **not** a live-wallet acceptance result and does not create provenance or transaction-sending authority.

| Restored journal condition | Draft evidence | Supported claim / remaining limitation |
| --- | --- | --- |
| `broadcast-unknown` with no confirmed transaction hash | [PR #70](https://github.com/djshellshoxxx/p2p-offramp/pull/70) `78af7214a1aab97eb3eb7722793bb536e7d6ff39` | A restored marker and nonce remain unresolved; automatic re-marking is refused. Historical provenance and native reconciliation remain separate. |
| Historical `finalized` label with noncanonical/reorged native observation | [PR #71](https://github.com/djshellshoxxx/p2p-offramp/pull/71) `06305ebaccd99fa8e2ce7a9d5eccc05d9fbde28f` | Synthetic noncanonical evidence does not release an occupied nonce; the test double is not independently trusted chain evidence. |
| Historical `prepared` entry with an assigned EVM nonce | [PR #72](https://github.com/djshellshoxxx/p2p-offramp/pull/72) `92cc054ce9a2ee21936e20d103757e374f4af296` | A fresh-key restore retains the reservation and does not promote the prepared entry on unrelated synthetic finality. A recovered prepared label alone **does not prove it was never sent**. |
| Previously `pending` entry with known broadcast hash | [PR #73](https://github.com/djshellshoxxx/p2p-offramp/pull/73) `94778c3282a99110922aa260b5f4ea98dd34caf9` | **Exact-head hosted CI qualified (7/7 jobs):** the named test passed with 1,251 Node tests passing, 0 failing and 1 skipped ([source job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/42866197284/job/130005054763)); this is still fixture characterization, not native/provenance approval. |
| Contradictory hash reported after fresh-key restore of a `pending` entry | [Draft PR #74](https://github.com/djshellshoxxx/p2p-offramp/pull/74) `146d06d81474445434070aff557ad56379ad24a3` | **Exact-head hosted CI qualified (7/7 jobs; 1,251 Node tests passed, 0 failed, 1 skipped)** ([Vault job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/42876407716/job/130040768659)). A different hash is refused without rewriting the record; absent bundled native reader cannot fabricate finality. These checks do not establish authenticated chain provenance or authority to resend. |
| Restored pending EVM hash with the same account spelled in uppercase on a different trade | [Draft PR #75](https://github.com/djshellshoxxx/p2p-offramp/pull/75) `f393c365937cbadee4bb1a0a35f78c4c105cbcee` | **Exact-head hosted CI qualified (7/7 jobs; 1,252 Node tests passed, 0 failed, 1 skipped)** ([schemas-and-crypto job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/42886012040/job/130074406031)). Verified case-insensitive account lookup and cross-trade nonce hold after fresh-key encrypted recovery, without creating wallet authority. |

The preceding tests are fixture-based characterization, **not approval to resume or resend historical imported transactions**. Preserve `ReleaseEnabled=0` until D9 history/provenance migration, independent native/crypto review, D1/D8 and complete two-party acceptance are independently qualified and approved.

## Offline G24 evidence CLI (non-authorizing)

The merged local CLI `npm run acceptance:report -- candidate.json records.json` reads candidate and evidence JSON **only**; no imported reviewer identity or report can grant promotion, wallet access or release policy. It produces one JSON line: exit **0** would require a separately trusted review capability (not injectable through CLI), exit **1** means a well-formed but blocked/pending evidence report, and exit **2** means refused input. Candidate files are not executable policy.

Independent [draft PR #76](https://github.com/djshellshoxxx/p2p-offramp/pull/76) at `2ba1a4e18f4673f006b195e822b5f984effb48e8` is **test-only, unmerged**, but has **10/10 successful hosted checks** (including CodeQL). Its new [acceptance CLI job](https://github.com/djshellshoxxx/p2p-offramp/actions/runs/42896935406/job/130112391986) ran 12 acceptance-entry tests successfully, covering fixed JSON refusals for nonregular/symlink paths, duplicate keys, invalid UTF-8, oversize and excessive depth. These are input-boundary regressions, not release acceptance, privacy certification or a production fix.

### Library review authority is separate from imported files

The `evaluateGate` library accepts an optional trusted `verifyReview` callback supplied **by the embedding caller**, never by CLI input. Only the literal boolean `true` from that callback counts as an authenticated review decision; a truthy number, non-empty string, wrapper object or self-asserted reviewer field does not. Even a genuinely authenticated passing **scope-only** G24 assessment always returns `releaseEnabled: false` and `promotionAllowed: false`. This is not merchant/escrow/fiat settlement approval or a crypto signature.

An independent, **unmerged test-only** regression in [draft PR #77](https://github.com/djshellshoxxx/p2p-offramp/pull/77), commit `08a9cf1e9abc0fb703b14964062a3da2234fdbb6`, exercises ambiguous synchronous/asynchronous reviewer callback values versus an explicit synthetic boolean approval. **Exact-head CI is pending**; existing source behavior is not newly verified by this pending PR. The CLI deliberately provides no such trust hook. Developer authority boundaries are defined in `packages/security/src/acceptance-gates.ts` and its unit tests, not by imported candidate/reviewer names.

## Developer verification and release gates

From the repository root on Node 24+, run the appropriate independent checks from [package.json](https://github.com/djshellshoxxx/p2p-offramp/blob/main/package.json) and the operator guide: `npm run typecheck`, `npm test`, `npm run check:boundaries`, `npm run check:specs`, `npm run test:build-policy`, `npm run test:browser`, `npm run test:local-evm` and native Foundry/escrow checks. Record the exact head SHA, job URLs, platform/toolchain, failures and skipped checks. CI cannot substitute for independent security/cryptographic review or real two-party acceptance.

Before any owner-authorized production promotion, separately obtain: D1 peer acceptance; D8 Tier C owner approval; complete D9 persisted-send-marker and recovered-record provenance safety; independent review of escrow/wallet/key paths; qualified buyer and seller acceptance, browser/device matrix and bounded recovery; supply-chain/dependency/license clearance; verified registry/signature trust pins; signed reproducible release manifest and deployed bytecode checks. Explicitly disclose fiat reversal/finality limits, dispute authority, custody boundaries and metadata leakage. Unapproved protocols and provider integrations remain disabled.

For security reports, **do not publish exploit details or private wallet material in issues or discussions**. Use an authorized private maintainer/security-reporting channel. This repository's inspected main tree does not contain a root `SECURITY.md` yet; propose a coordinated disclosure policy to the owner before creating one or enabling private reporting/settings. No repository policy or GitHub setting is changed by this wiki-source page.

## Maintainer documentation

See [Developer Guide](Developer-Guide.md), [Architecture and Development](Architecture-and-Development.md), [Codespaces Test Lab](Codespaces-Test-Lab.md), [roadmap](https://github.com/djshellshoxxx/p2p-offramp/blob/main/DEVELOPMENT_ROADMAP.md) and [task ledger](https://github.com/djshellshoxxx/p2p-offramp/blob/main/tasks/todo.md). This is **version-controlled wiki source** awaiting review/publication; it is not evidence that the live GitHub Wiki has been updated.
