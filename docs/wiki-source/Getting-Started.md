# Getting Started — synthetic test-only

[User Guide](User-Guide.md) · [Home](Home.md)

The earlier claim that the application was entirely unimplemented is obsolete. **Main contains a local encrypted profile, recovery and read-only synthetic review shell**, but **no production trading authority**. This is a development workflow, not real-money onboarding.

Use Node 24+ from the repository root:

- `npm ci --ignore-scripts`
- `npm run build:demo`

The generated synthetic demo files are under `apps/web/dist-demo`. They are for local/test use only. The default artifact (`npm run build`) has no approved trust registry and must not be described as an enabled off-ramp.

## First local session

1. Create a local profile after reading the no-reset consent, then unlock that profile.
2. In the synthetic demo, open an offer or local terms file and inspect the full addresses, asset, amount and deadlines. Saving a review keeps encrypted local review data; it does not submit a trade.
3. On **Recovery**, explicitly export the encrypted profile file and keep its passphrase separately. Export reports that authentication has not been checked.
4. With the original profile unlocked, select the complete exported file, enter its backup passphrase and choose **Verify this backup file**. The receipt displays exact file and envelope digests for that profile and revision.
5. Choose **Recheck verified revision** when you need to check whether that runtime's verification still matches the durable revision. A later mutation, lock, profile switch or reload can retire the verification.

A restore is a separate operation with new keys and a new locked profile. Open
and unlock that profile explicitly, inspect the recovered test data, then export
and verify its own new backup. The original profile's file and verification do
not become verification of the restored profile. The [recovery guide](Privacy-and-Recovery.md)
explains the exact scope and the limits of older backups.

**Recovery** also contains **Public QR tools** for local text, file, image and
explicit camera-frame inspection. Local confirmation keeps the decoded public
review separate from wallet, trade and restore actions. Physical-device camera
acceptance remains outstanding. See [Wallet and QR Safety](Wallet-and-QR-Safety.md)
for the implemented controls and fingerprint comparison.

The [operator guide](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/OPERATOR.md) documents the distinct demo/default/testnet build constraints. See [Privacy and Recovery](Privacy-and-Recovery.md), [Wallet and QR Safety](Wallet-and-QR-Safety.md), and [Security and Release](Security-and-Release.md) before interpreting a test result.
