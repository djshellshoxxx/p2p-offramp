# Getting Started — synthetic test-only

[User Guide](User-Guide.md) · [Home](Home.md)

The earlier claim that the application was entirely unimplemented is obsolete. **Main contains a local encrypted profile, recovery and read-only synthetic review shell**, but **no production trading authority**. This is a development workflow, not real-money onboarding.

Use Node 24+ from the repository root:

```sh
npm ci --ignore-scripts
npm run build:demo
```

The generated synthetic demo files are under `apps/web/dist-demo`. They are for local/test use only. The default artifact (`npm run build`) has no approved trust registry and must not be described as an enabled off-ramp.

In the app, create a local profile only after reading the no-reset consent, unlock it, view the synthetic demo offer/review panel, inspect **full** wallet addresses, asset, amount and deadlines, and explicitly export encrypted backup bytes for recovery. Use the saved-terms and fresh-key restore features only with test records and verify recovered data before relying on a backup. No sample or QR authorizes payment, escrow, or fiat finality.

The [operator guide](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/OPERATOR.md) documents the distinct demo/default/testnet build constraints. See [Privacy and Recovery](Privacy-and-Recovery.md), [Wallet and QR Safety](Wallet-and-QR-Safety.md), and [Security and Release](Security-and-Release.md) before interpreting a test result.
