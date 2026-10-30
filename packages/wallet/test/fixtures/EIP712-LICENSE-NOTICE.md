# EIP-712 test-data attribution

The Ether Mail digest/signature fields in `eip712-keccak-vectors.json` are derived from the official Ethereum EIP-712 example, not an original cryptographic invention by this project.

- Source: <https://github.com/ethereum/EIPs/blob/7372d10a457b29eceb02cd052345af165de1fb60/assets/eip-712/Example.js>.
- Immutable source commit: `7372d10a457b29eceb02cd052345af165de1fb60`.
- Example.js SHA-256: `c6bdb395cdfd0cf8408328156960203d5b984f2fe0087ca74c74c99e266c0e3b`, rechecked against the permitted pinned-source read on 2026-10-26.
- EIP authors at that revision: **Remco Bloemen (@Recmo), Leonid Logvinov (@LogvinovLeon), Jacob Evans (@dekz)**.
- The EIP Copyright section waives copyright/related rights via the repository's CC0 text. The full unchanged text is retained at repository-root `licenses/eip712-CC0-1.0.txt`.
- Local modification: extract expected digest/signature values into a bounded JSON fixture and combine with published Keccak known answers. The upstream JavaScript implementation/dependency tree is not copied into the app. No existing fixture bytes were changed by this attribution update.

This attribution does not qualify the G16 provider or enable a live wallet/trade.
