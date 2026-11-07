# Source-pinned research gap map

This table is a navigation view of [research-gap-map.json](research-gap-map.json). It preserves the source remainder's classifications and routes each unresolved record to new research. Priorities describe suggested sequencing, not protocol approval or permission to activate a feature.

| Source record | Priority | Remaining question | Research |
| --- | --- | --- | --- |
| `P-G14-TERMS-PROFILE` | P0 | Resolve exact nonempty G14-to-G16 capability commitment profile | [Report 02](02-peer-acceptance-and-relays.md) |
| `P-G15-PROFILE` | P0 | Define missing deployment, rotation/trust-transition and archive extraction profiles | [Report 04](04-release-trust-and-recovery.md) |
| `P-SOLANA-PROFILE` | P2 | Complete exact native Solana/SPL custody/program/wallet compatibility profile | [Report 06](06-solana-custody-and-parity.md) |
| `P-SOLANA-ENGINEERING` | P2 | Native SOL/SPL program, Wallet Standard, adapter, journal and recovery parity | [Report 06](06-solana-custody-and-parity.md) |
| `P-LIQUIDITY-PROFILE` | P2 | Exact optional vault/quote signature and atomic escrow funding deployment profile | [Report 08](08-arbitration-liquidity-and-physical.md) |
| `P-LIQUIDITY-ENGINEERING` | P2 | Optional segregated custody contract/adapter and native integration | [Report 08](08-arbitration-liquidity-and-physical.md) |
| `P-PROOF-IMPLEMENTATION` | P2 | Actual evaluated proof generation/verifier/rail advisory integration | [Report 03](03-payment-proofs-and-providers.md) |
| `P-REPUTATION-ENGINEERING` | P2 | Opt-in reputation proof verification and eligibility integration | [Report 07](07-optional-privacy-and-identity.md) |
| `P-MOBILE-HANDOFF` | P1 | Actual app-switch checkpoint and fresh-authority wallet resume | [Report 05](05-wallet-mobile-qr-and-browser.md) |
| `P-QR-PROFILE` | P1 | Type-specific QR payload/signature/canonicalization/codec decision artifact | [Report 05](05-wallet-mobile-qr-and-browser.md) |
| `P-QR-ENGINEERING` | P1 | Bounded local QR generation/scan/review/import with manual/file fallbacks | [Report 05](05-wallet-mobile-qr-and-browser.md) |
| `Q-RELEASE` | P0 | Artifact-specific authenticated bootstrap, professional review and release/deployment witnesses | [Report 04](04-release-trust-and-recovery.md) |
| `Q-PHYSICAL-LOCALE` | P1 | Actual physical device, wallet, accessibility and translated safety-copy qualification | [Report 05](05-wallet-mobile-qr-and-browser.md) |
| `L-MEET-PROOF` | P2 | Distance proof implementation/profile | [Report 08](08-arbitration-liquidity-and-physical.md) |
| `L-MEET-PROOF-BINDING` | P2 | Local proof challenge/replay contract | [Report 08](08-arbitration-liquidity-and-physical.md) |
| `L-MEET-MAP-CACHE` | P2 | Persistent map bundles and renderer/fetch integration | [Report 08](08-arbitration-liquidity-and-physical.md) |
| `L-CIT-LOCKER-LIVE` | P2 | Concrete locker/device transport | [Report 08](08-arbitration-liquidity-and-physical.md) |
| `L-CIT-COLLATERAL-CONTRACT` | P2 | Separate native courier fee/staking custody implementation | [Report 08](08-arbitration-liquidity-and-physical.md) |
| `L-ARB-NATIVE` | P2 | Separate immutable opted-in local tribunal/escrow | [Report 08](08-arbitration-liquidity-and-physical.md) |
| `L-ARB-VRF-PROFILE` | P2 | Actual ChainlinkVRF2.5 provider qualification | [Report 08](08-arbitration-liquidity-and-physical.md) |
| `L-ARB-ZK-PROFILE` | P2 | Selective-chat proof and anonymous eligibility provider | [Report 03](03-payment-proofs-and-providers.md) |
| `L-PRIV-CAPABILITY-BRIDGE` | P0 | Nonempty G14 manifest-to-G16 policy commitment | [Report 02](02-peer-acceptance-and-relays.md) |
| `L-PRIV-STEALTH-SPEND` | P2 | Stealth spending wallet and funding binding integration | [Report 07](07-optional-privacy-and-identity.md) |
| `L-PRIV-OPTIONAL-PROVIDER` | P2 | Selected XMTP/Tor/shielded/CoinJoin provider profiles | [Report 07](07-optional-privacy-and-identity.md) |
| `L-PRIV-PROFILE-REMOVAL` | P1 | Whole-profile deletion workflow | [Report 07](07-optional-privacy-and-identity.md) |
| `L-PRIV-SWEEP-EXECUTION` | P2 | Sequential consented native transfer journal integration | [Report 07](07-optional-privacy-and-identity.md) |
| `P-MESSAGE-BODY-PROFILE` | P0 | Versioned non-text application-envelope body profiles | [Report 02](02-peer-acceptance-and-relays.md) |

The reports also cover qualification attached to locally complete records: EVM/fiat semantics and remaining formal UNKNOWN results in report 01; operator/rail/jurisdiction evidence in report 09. No original canonical state is promoted by this table.
