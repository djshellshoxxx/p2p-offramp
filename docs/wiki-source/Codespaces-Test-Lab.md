# Codespaces and local test lab

[Home](Home.md) · **[User Guide](User-Guide.md)** · **[Developer Guide](Developer-Guide.md)** · [Security and Release](Security-and-Release.md)

**Status (merged `main@300287dcde818a9d10ae301265d00bc7c0877bbb`): executable local development/test tooling exists, but a pinned, reproducible Codespaces lab is still future-only.** There is no `.devcontainer/devcontainer.json` in the inspected main tree. Opening a Codespace does not presently prove the planned toolchain, image digest, port isolation or test results. The separate [Codespaces and GitHub Pages design spec](../../00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion/module_0.12.6_codespaces/spec-codespaces-test-lab-and-github-pages-release.md) is a design baseline, not completed acceptance evidence.

## Existing developer commands

A local checkout or manually configured Codespace can use the commands below after installing **Node 24+**, npm from the lockfile, **Python 3.11+** for specification checks, and a local Chromium for browser tests. EVM contract testing additionally requires the Foundry toolchain. See the [operator guide](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/OPERATOR.md) for prerequisites and expected failure gates.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run check:boundaries
npm run check:specs
npm run test:build-policy
npm run test:browser
npm run test:web:browser
npm run test:evm
```

These script names are present in merged main `package.json`. **This wiki change has not executed the commands**; they are instructions, not new pass evidence. Browser scripts require an installed Chromium discovered by the operator guide's documented path configuration. `npm run test:evm` requires Foundry. A passing synthetic/local test does not authorize peer trading or mainnet activity.

## What a future pinned Codespaces recipe must add

The approved design calls for image and toolchain digests; an explicit devcontainer; deterministic install and fixture hashes; disposable local-only wallets and mock relays; private-by-default port forwarding; a clean teardown; and reproducible Node, browser, EVM/Anvil and, where feasible, Solana test evidence. Those capabilities have **not** been accepted as a complete Codespaces recipe on the inspected main head. Do not insert live keys, production signing material, real financial identities, or sensitive transaction records into shared Codespaces or public forwarded ports.

## Limits and release gates

The web build emits development evidence, not a signed production release. The default build has no approved trading registry, `ReleaseEnabled=0`, and an offline network policy. The existing testnet build intentionally refuses an unpinned release key; changing trust files does not establish owner approval. GitHub Actions and simulated browser checks do not establish real device/mobile compatibility, independent security review, network privacy or live hosting headers.

GitHub Pages publication and real-funds operation remain separately approval-gated. Codespaces is neither an anonymity boundary nor a trustworthy vault for production identities. For current limitations, consult [Privacy and Recovery](Privacy-and-Recovery.md), [Wallet and QR Safety](Wallet-and-QR-Safety.md), and [Security and Release](Security-and-Release.md). The **live GitHub Wiki has not been published** by this version-controlled docs update.
