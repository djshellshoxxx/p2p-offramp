# Privacy and Recovery

[Home](Home.md) · [User Guide](User-Guide.md) · [Developer Guide](Developer-Guide.md) · [Wallet and QR Safety](Wallet-and-QR-Safety.md)

**Implementation status: development/test-only, with funds disabled.** The current `main` branch has a bounded encrypted local profile/vault (create, unlock, lock, status, encrypted export and fresh-key restore). The synthetic demo also offers offline read-only EVM terms review and encrypted storage of up to eight original review files in an unlocked profile. These are implemented foundations, **not** an approved live payments or escrow service. `ReleaseEnabled=0`; the normal build has no approved live registry.

## What is private, and what is not

Profile content, saved reviews, local messaging material and backup bytes are designed for client-side handling with local user-controlled keys. Encryption protects selected information at rest; it does **not** prove anonymity, conceal public blockchain transfers, authenticate counterparties, prove fiat settlement or protect a compromised browser/device. Malicious extensions, OS access, payment services, relay operators, chain analysis and network metadata can still identify participants. An optional relay is untrusted, and simply not running a central server does not make network activity unlinkable.

Do not paste decrypted backup material, seed phrases, private keys or counterparty evidence into issue reports, support messages, public logs, QR images or unrestricted links. Browser storage may be evicted; deleting an entry does not guarantee physical erasure, nor does a cached display prove the underlying local data still exists.

## Encrypted local backup and restoration

1. In a **test profile**, explicitly export the encrypted backup bytes while you have access to the original account and retain them in a separately controlled location. An exported backup can be sensitive even when encrypted.
2. Preserve your recovery passphrase/material independently. Test restoring the backup into a **separate new locked profile with fresh keys** and verify that the expected saved reviews are present. A restore is **not** an overwrite or unlock of an existing profile.
3. When an original EVM terms file is saved to an unlocked profile, it is encrypted with that profile and subject to the eight-item limit. On reloading, the client revalidates every saved document against the current loaded registry and identifies entries that no longer validate. A saved file is not evidence of payment or a fresh authorized signature.
4. Retain the original backup until successful independent restore verification. Do not rely on a QR screenshot or partial receipt instead of the full backup. Document file provenance and recovery verification privately; do not publish sensitive test artifacts.

The recovery export tool and offline EVM recovery package described in [canonical EVM recovery instructions](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/recovery/CANONICAL-EVM.md) have distinct scope: they can prepare bounded *unsigned* historical escrow exits from authenticated release pins and fresh on-chain reads. They cannot sign, transmit, create a new trade, restore a vault or turn on real-funds features. Any wallet broadcast with uncertain outcome must remain uncertain until independently reconciled; do not automatically retry it as unsent.

## Common problems and safety limits

- **Missing profile after browser reset:** locally stored data is not guaranteed durable. Use a separately retained encrypted backup rather than assuming it can be reconstructed from a relay.
- **Saved review no longer verifies:** revalidation against the running build's registry may reject it; preserve provenance and investigate rather than treating an old display as approval.
- **Restore does not unlock the original profile:** this is expected. Recovery creates a separate fresh-key profile, not an in-place reset.
- **No trade-terms review in a normal build:** expected without an approved trust registry; use only explicitly labeled synthetic demo fixtures for review testing.
- **External wallet recovery:** verify chain, original contract/deployment, beneficiary, amount, nonce, calldata and fees through an independently trusted source; the offline tool prepares unsigned data and has no signing or send authority.

See the [operator guide](https://github.com/djshellshoxxx/p2p-offramp/blob/main/docs/OPERATOR.md), [main README](https://github.com/djshellshoxxx/p2p-offramp/blob/main/README.md), and [Security and Release](Security-and-Release.md) for exact current gates. Proposed work in open PRs is not merged, published, approved for live trading or covered by these main-branch capability claims.
