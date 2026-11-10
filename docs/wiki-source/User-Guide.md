# User Guide

[Home](Home.md) · [Developer Guide](Developer-Guide.md)

**Status: development/test-only.** The app is experimental and does not accept or authorize real-funds trading. `ReleaseEnabled=0`. Treat anything in an open draft PR as unmerged work; do not interpret demos as live exchange services.

## Overview and capabilities

On **main**, the static client provides a local encrypted profile/vault with lock, unlock, encrypted export and recovery into a fresh-key profile. A synthetic demo build contains offline sample offers and read-only EVM trade-terms review. An unlocked profile can save a bounded set of original review documents locally and revalidate them on load. Existing tests cover aspects of backup recovery, browser storage and review; those tests are **not production or security certification**.

**Not ready:** real-money trading, trusted live registry/bootstrap, fiat settlement guarantees, supported live custody, production deployment and a fully accepted buyer/seller beta journey. Optional relay, escrow, proof and recovery work appears across unmerged PRs and planning documents; a draft PR is not an enabled feature.

## Installation and access (developers/testers only)

Use Node **24+** and the pinned lockfile. From the repository root:

```sh
npm ci --ignore-scripts
npm run build:demo
```

The synthetic demonstration output is `apps/web/dist-demo`. The default production-style static build is `npm run build` (output `apps/web/dist`), but it has no approved trust root and **does not enable real trading**. Hosting the generated files does not change those safety gates. No official production endpoint or real-funds onboarding is asserted here. Details: [Getting Started](Getting-Started.md) and [operator guide](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/OPERATOR.md).

## Common safe workflows

1. **Local vault:** create a profile with the app's explicit no-reset consent, unlock it, and lock it when finished. Preserve your own recovery materials.
2. **Offline review:** use the **synthetic demo only** to inspect full addresses, chain, token/native asset, amounts, expiry and settlement warnings. A displayed review is not cryptographic approval or proof of fiat payment.
3. **Saved terms:** while unlocked, save up to eight original terms documents in the encrypted local profile, then revalidate them on load. A restored profile uses fresh-key recovery; treat backups as sensitive.
4. **Recovery:** explicitly export encrypted backup bytes and verify a separate restored profile using test data first. A QR display, screenshot or partial receipt is not a replacement for a complete independently preserved encrypted backup.
5. **Wallet and QR:** inspect the actual destination and chain in the wallet interface. Never enter a seed phrase into a webpage or QR form. No real wallet transfer is approved in the current app.

## Troubleshooting

- **Trade-terms review unavailable in default build:** expected; no approved registry is embedded. Only the explicitly labeled synthetic demo provides demonstration samples.
- **Testnet build refuses `KEY_UNPINNED` or `TESTNET_TRUST_MISSING`:** expected without an owner-approved release key and corresponding trust files; do not bypass the trust gate.
- **Backup does not unlock an existing profile:** recovery creates a separate fresh-key profile. Follow the on-screen restore workflow and preserve the original backup until independently verified.
- **Browser data disappeared:** local browser storage is not guaranteed persistent; maintain encrypted backups, and do not assume deletion is secure erasure.
- **Network/relay feature absent:** several remote workflows are pending qualification and do not become available merely because test modules or design specs exist.

## Frequently asked questions

**Can I send real funds?** No. Trading authority is disabled; testing uses synthetic fixtures/local EVM as described in repository evidence.

**Does the app guarantee payment finality?** No. Manual fiat settlement and counterparty behavior cannot be proven by an app screenshot; fiat reversals may occur.

**Does encryption make me anonymous?** No. Browser compromise, extensions, device access, payment providers, relays, chain analytics and network metadata can reveal information.

**Are draft PR capabilities released?** No. Review, CI, explicit approvals and release gates remain separate.

## Privacy, security and safe use

Keys and sensitive vault content are intended to remain local; clients and optional relays are not equivalent to a trusted anonymous network. Keep encrypted backups and recovery passphrases separately. A compromised endpoint or copied browser profile defeats many protections. On-chain transactions expose public metadata, and deletion may not securely erase data. See [Privacy and Recovery](Privacy-and-Recovery.md), [Wallet and QR Safety](Wallet-and-QR-Safety.md) and [Security and Release](Security-and-Release.md).

For precise implementation/qualification status, use [README](https://github.com/djshellshoxxx/p2p-offramp/blob/main/README.md), [development status](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/DEVELOPMENT_STATUS.md) and the [latest task ledger](https://github.com/djshellshoxxx/p2p-offramp/blob/main/tasks/todo.md).
