# Wallet and QR Safety

[Home](Home.md) · [User Guide](User-Guide.md) · [Developer Guide](Developer-Guide.md) · [Privacy and Recovery](Privacy-and-Recovery.md)

**Status: development and synthetic/test-only.** The current `main` branch has a discovery-only wallet boundary and isolated test-only EVM execution modules, but **no approved real-funds wallet send, QR-based transfer, or production escrow journey**. `ReleaseEnabled=0`; the default build has no approved live registry. A draft PR, source module, demonstration screenshot or successful test does not authorize payments.

## Before inspecting any wallet request

- Independently verify the **exact origin/domain, chain/network, token contract, spender/allowance, destination, amount, expiry and operation**. Examine the full wallet request and exact deployed contract/release identity, not merely a truncated address, familiar label, icon or screenshot.
- For a synthetic/test-only request, compare the complete fields to an independently obtained, trusted specification or signed release manifest. A local mock or read-only chain result cannot independently authenticate a merchant or guarantee fiat settlement.
- Treat a wallet's rejection, timeout, chain change, lost session, unknown hash or failure after a durable send marker as **ambiguous until independently reconciled**. Do not assume a failed UI response means a transaction was never broadcast. Never retry a possibly sent operation automatically.

## QR and same-device workflows

A QR code transports bytes; **it is not a signature, authentic receipt, proof of payment, or proof of a trusted destination**. QR-based transaction and funding features are not claimed as a released workflow on `main`. Any future QR/deep-link implementation must show the decoded payload and its actual destination to the user for explicit approval **before** opening a wallet or navigating. It must validate length, schema, chain, addresses and origin, and reject unexpected fields and unsupported schemes rather than executing scanned content.

For future same-device interoperability, prefer **explicit copy, encrypted-file transfer, or clearly reviewed wallet deep links** over silently acting on scanned content. These are design/safety requirements, **not a statement that all alternatives are implemented**. Never encode a mnemonic, private key, decrypted recovery material, private counterparty evidence or unrestricted link into a QR image. Save and verify a complete encrypted digital backup separately; a QR screenshot or abbreviated reference does not replace the original file.

## Safe testing and limitations

Use disposable test wallets and the clearly marked synthetic `npm run build:demo` environment. The main README and [operator guide](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/OPERATOR.md) describe the verified local commands and current test-only capabilities. Independently compare deployed bytecode with authorized signed-release metadata when performing an approved testnet exercise. Even a correctly decoded QR or valid chain transaction cannot prove counterparty identity, bank transfer finality, anonymity or device integrity.

For local-key and backup limitations see [Privacy and Recovery](Privacy-and-Recovery.md). For unmerged review and approval requirements see [Security and Release](Security-and-Release.md). The [Developer Guide](Developer-Guide.md) describes the isolated wallet, escrow and CI boundaries.
