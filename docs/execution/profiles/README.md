# Provider/profile decision intake — 2026-11-02

This is a finite read-only primary-source intake, not selection or activation of a production provider. Trading stays disabled. No SDK/lockfile, issuer, notary, relay, wallet session, signing root, custody path or live account was added. Primary source snapshots and retrieved-text hashes are in [source-index.json](source-index.json); these hashes are not SDK/WASM artifact integrity pins. Existing local evidence is reusable engineering infrastructure, not qualification of these unimplemented providers.

| Packet | Remaining work covered | Local work that can proceed | Precise unresolved choice |
|---|---|---|---|
| [01 Proof](01-proof.md) | P-PROOF-PROFILE | Synthetic source/parser contracts, bounded Worker cancellation, tagged TLSNotary evaluation | Rail/source/parser/notary trust and exact proof/public-input/commitment profile |
| [02 Reputation](02-reputation.md) | P-REPUTATION-PROFILE | Pinned V4 identity/membership evaluation and explicit artifact intake | Issuer/admission/root/revocation/consumer policy; score circuit is separate |
| [03 Relay allocation](03-relay-allocation.md) | P-RELAY-INCREMENTAL-PROFILE | Preserve parse cap; evaluate bounded native companion using unchanged NIP-01 | No reviewed direct-browser incremental Nostr profile identified; native trust boundary would be new |
| [04 Optional messaging](04-optional-messaging.md) | P-WAKU-PROFILE; XMTP | Exact protobuf/local adapter and SDK egress/ownership evaluation | Waku topics/network/peers; XMTP generation/network/inbox association/consent/recovery |
| [05 Mobile](05-mobile.md) | P-MOBILE-PROFILE | Session/namespace/expiry/return validation with synthetic transport | Connector, wallet/version, URI allowlist, registered return origin and approved relay/session policy |
| [06 Tor](06-tor.md) | Advanced Tor/browser routing | Companion capability model and per-channel failure/capture plan | Actual enforcing component/browser/native transport and current evidence scope |
| [07 Asset privacy](07-asset-privacy.md) | Shielded; CoinJoin | Empty-provider refusal and exact manifest/transaction threat intake | Actual chain/asset/protocol/custody model; neither is generic EVM privacy |
| [08 Stealth](08-stealth.md) | EIP-5564 generation/scanner | TWO explicitly named offline mathematical comparison profiles | Published reference/SDK shared-secret encoding conflict; chain deployment, reorg and wallet recovery remain unselected |

Readiness here distinguishes (a) specified local engineering, (b) application/protocol choices not defined by the upstream SDK, and (c) later interoperability, independent crypto/security and physical-device/live operational qualification. The latter is not a reason to leave (a) undone, and a successful synthetic test cannot supply (b) or (c).

The machine-readable [decision index](decision-index.json) binds packet hashes. The [stealth local contract](stealth-local-contract.json) and [public comparison vectors](stealth-comparison-vectors.json) define only the two offline profiles.

Eight packets group Waku/XMTP together and shielded/CoinJoin together, covering all ten named subjects without parallel provider registries. No packet supplies imported reviewer approval. Source review is bounded, not exhaustive internet research. Root assigns implementation and independent review separately.
