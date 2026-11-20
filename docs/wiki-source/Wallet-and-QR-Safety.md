# Wallet and QR Safety

[Home](Home.md) · [User Guide](User-Guide.md) · [Developer Guide](Developer-Guide.md) · [Privacy and Recovery](Privacy-and-Recovery.md)

**Status: development and synthetic/test-only.** The current `main` branch has a discovery-only wallet boundary and isolated test-only EVM execution modules, but **no approved real-funds wallet send, QR-based transfer, or production escrow journey**. `ReleaseEnabled=0`; the default build has no approved live registry. A draft PR, source module, demonstration screenshot or successful test does not authorize payments.

## Before inspecting any wallet request

- Independently verify the **exact origin/domain, chain/network, token contract, spender/allowance, destination, amount, expiry and operation**. Examine the full wallet request and exact deployed contract/release identity, not merely a truncated address, familiar label, icon or screenshot.
- For a synthetic/test-only request, compare the complete fields to an independently obtained, trusted specification or signed release manifest. A local mock or read-only chain result cannot independently authenticate a merchant or guarantee fiat settlement.
- Treat a wallet's rejection, timeout, chain change, lost session, unknown hash or failure after a durable send marker as **ambiguous until independently reconciled**. Do not assume a failed UI response means a transaction was never broadcast. Never retry a possibly sent operation automatically.

## Implemented local public-QR workflow

The merged [QR panel](https://github.com/djshellshoxxx/p2p-offramp/blob/388526a474aea0e08f9c04178c2b7f9e1d4bee3f/apps/web/src/ui/QrPanel.tsx)
appears under **Recovery**, in **Public QR tools**. Choose exact public text,
a public text file, or a PNG/JPEG containing one public code. Camera permission
is requested only after **Start camera**; **Scan one camera frame** stops the
preview after capturing a frame. Physical phone, camera and printed-code
acceptance remains unqualified, and exact text and file input remain available.

The panel displays the complete decoded fields, public-data authentication
status, signature state and any origin hint for review. Chain-bound input
requires the network context from current registry-reviewed terms. An unresolved
invite signing-key profile cannot establish an authenticated trade session.
**Confirm this local review** enables the separate symbol display, exact public
text copy and download controls. Confirmation itself does not connect a wallet,
negotiate a trade, prepare a payment, navigate to an origin or restore a backup.

The implemented fingerprint workflow takes a selected encrypted-backup or
offline-reference file and publishes only its format, byte length and SHA-256.
The public code excludes the file contents and filename. After reviewing that
code, **Compare exact file bytes** compares a selected file locally. A matching
length and digest establishes byte correspondence; authentication and successful
recovery require their separate checks in the [recovery guide](Privacy-and-Recovery.md).

For the same device, **Copy reviewed public text** and **Download reviewed public
text** preserve the complete reviewed envelope. A camera image or fingerprint
alone cannot replace the original encrypted backup. Keep private keys,
passphrases, decrypted recovery data and private counterparty evidence out of
public codes. The app's local QR review grants no payment, escrow, fiat-finality
or trusted-destination authority.

## Safe testing and limitations

Use disposable test wallets and the clearly marked synthetic `npm run build:demo` environment. The main README and [operator guide](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/OPERATOR.md) describe the verified local commands and current test-only capabilities. Independently compare deployed bytecode with authorized signed-release metadata when performing an approved testnet exercise. Even a correctly decoded QR or valid chain transaction cannot prove counterparty identity, bank transfer finality, anonymity or device integrity.

For local-key and backup limitations see [Privacy and Recovery](Privacy-and-Recovery.md). For unmerged review and approval requirements see [Security and Release](Security-and-Release.md). The [Developer Guide](Developer-Guide.md) describes the isolated wallet, escrow and CI boundaries.
