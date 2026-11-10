# Security and release verification

[Home](Home.md) · **[User Guide](User-Guide.md)** · **[Developer Guide](Developer-Guide.md)**

**Status: experimental/test-only. No real-funds trading, production deployment, or release is authorized.** The merged default branch at `300287dcde818a9d10ae301265d00bc7c0877bbb` keeps `ReleaseEnabled=0` and an empty default network allowlist. A successful demo, local EVM test, or draft PR does not enable trading. See the [operator guide](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/OPERATOR.md) and [development status](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/DEVELOPMENT_STATUS.md).

## User-facing limitations and safe operation

- The ordinary build has **no owner-approved registry/trust pin**. The synthetic demo is for offline review, not funds. Testnet build trust checks are expected to refuse missing or unpinned release material rather than accepting alternate keys silently.
- An encrypted local profile and fresh-key backup restore are **not proof of anonymity, secure erasure, wallet authorization, payment finality, or counterparty honesty**. Device compromise, browser extensions, fiat providers, network relays and public-chain metadata can disclose activity.
- An unsigned historical transaction-recovery package is read-only evidence, **not a wallet signature or send/retry authorization**. A transaction whose broadcast outcome is uncertain must remain treated as potentially sent until independently reconciled. Save and independently verify the complete encrypted backup; a QR, screenshot, hash or partial receipt is not a replacement.
- No-script and static review experiences must not be presented as signing or custody interfaces. See [Privacy and Recovery](Privacy-and-Recovery.md) and [Wallet and QR Safety](Wallet-and-QR-Safety.md).

## Source qualification is not release approval

On **unmerged** [integration PR #61](https://github.com/djshellshoxxx/p2p-offramp/pull/61), commit `c87c21b915c9e175113292bb1307754ed2424166` has **10 successful GitHub Actions checks** and a separate successful Snyk status ([exact-head checks](https://github.com/djshellshoxxx/p2p-offramp/commit/c87c21b915c9e175113292bb1307754ed2424166/checks)). This only qualifies the observed hosted checks at that exact commit.

**Unresolved security gate:** the distinct [PR #56](https://github.com/djshellshoxxx/p2p-offramp/pull/56) SonarCloud result reports **Security Rating C versus required A**. The precise issue records were not available to the ChatGPT direct GitHub lane. PR #61 has no visible exact-head Sonar result. Do not infer that this gate passed from other successful checks, invent individual findings, suppress Sonar rules, or claim approval of draft integration changes.

Other draft work includes [D9 fail-closed marker handling (#69)](https://github.com/djshellshoxxx/p2p-offramp/pull/69), [fresh-key broadcast-unknown restore tests (#70)](https://github.com/djshellshoxxx/p2p-offramp/pull/70), and a further historical terminal-label characterization [#71](https://github.com/djshellshoxxx/p2p-offramp/pull/71). These **do not complete** historical-record provenance migration or allow an unknown transaction to be resent.

## Developer verification and release gates

From the repository root on Node 24+, run the appropriate independent checks from [package.json](https://github.com/djshellshoxxx/p2p-offramp/blob/main/package.json) and the operator guide: `npm run typecheck`, `npm test`, `npm run check:boundaries`, `npm run check:specs`, `npm run test:build-policy`, `npm run test:browser`, `npm run test:local-evm` and native Foundry/escrow checks. Record the exact head SHA, job URLs, platform/toolchain, failures and skipped checks. CI cannot substitute for independent security/cryptographic review or real two-party acceptance.

Before any owner-authorized production promotion, separately obtain: D1 peer acceptance; D8 Tier C owner approval; complete D9 persisted-send-marker and recovered-record provenance safety; independent review of escrow/wallet/key paths; qualified buyer and seller acceptance, browser/device matrix and bounded recovery; supply-chain/dependency/license clearance; verified registry/signature trust pins; signed reproducible release manifest and deployed bytecode checks. Explicitly disclose fiat reversal/finality limits, dispute authority, custody boundaries and metadata leakage. Unapproved protocols and provider integrations remain disabled.

For security reports, **do not publish exploit details or private wallet material in issues or discussions**. Use an authorized private maintainer/security-reporting channel. This repository's inspected main tree does not contain a root `SECURITY.md` yet; propose a coordinated disclosure policy to the owner before creating one or enabling private reporting/settings. No repository policy or GitHub setting is changed by this wiki-source page.

## Maintainer documentation

See [Developer Guide](Developer-Guide.md), [Architecture and Development](Architecture-and-Development.md), [Codespaces Test Lab](Codespaces-Test-Lab.md), [roadmap](https://github.com/djshellshoxxx/p2p-offramp/blob/main/DEVELOPMENT_ROADMAP.md) and [task ledger](https://github.com/djshellshoxxx/p2p-offramp/blob/main/tasks/todo.md). This is **version-controlled wiki source** awaiting review/publication; it is not evidence that the live GitHub Wiki has been updated.
