# Wallet and QR safety
**Status:** the Offers page can check a local trade-terms file offline against a loaded registry. The default build has no approved registry, so this works only in the labelled synthetic demo build. Trading is disabled.

Confirm exact domain, network, token, spender allowance, destination, expiry and displayed amount. A QR is a transport mechanism, not a proof of authenticity. Scanned content must be shown for approval before navigating or signing. Do not share mnemonic/private keys or decrypted payment evidence via QR. For same-device flows provide copy, encrypted file and wallet deep-link alternatives. Use disposable testnet wallets during development. Check any contract's deployed code against the signed release manifest.
