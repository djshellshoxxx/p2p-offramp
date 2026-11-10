# Getting started
**Draft user guide. Trading is not available yet.** The repository has a static client shell and a synthetic demo build. Trading and funds are disabled in every build, and ReleaseEnabled is 0. See [Milestone Status](Milestone-Status.md).

Planned workflow (manual settlement):
1. Confirm the jurisdiction, payment method, token and chain are supported. Only EVM test-network paths are in progress; Solana/SPL is blocked.
2. Connect a compatible external wallet. Check origin and chain.
3. Read deadlines, fees and counterparty risks, including manual settlement risk.
4. Create or accept a trade, using QR or import where supported.
5. Fund escrow only after verifying the wallet's amount, asset and destination.
6. Pay the agreed fiat amount outside the app. The app cannot verify fiat payment.
7. The crypto seller confirms receipt and releases crypto to the bound buyer before the deadline. If the deadline passes, the crypto refunds to the seller.
8. Export an encrypted receipt if desired (planned).

Manual settlement risk: a seller can withhold release after receiving fiat. The app cannot guarantee that fiat is received or that payments are irreversible.

Never enter a seed phrase into the website, QR form or support chat. Fiat reversals and chargebacks may occur even after a screenshot or bank notification. No feature described here is guaranteed to exist until implementation and tests are complete.
