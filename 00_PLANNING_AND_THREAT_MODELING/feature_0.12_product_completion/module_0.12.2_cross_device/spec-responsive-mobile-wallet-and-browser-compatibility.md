# Mobile, wallet and browser compatibility

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M1 / M2C.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Provide usable external-wallet journeys across supported devices without treating browser capability detection as device certification. Support begins at 320 CSS pixels and must preserve full amounts, chain identity, expiry and accessible full-address inspection.

## 3. Architecture and data contracts

CompatibilityRecord: `{browser,version,os,device,wallet,walletVersion,connector,chain,capabilities,testedAt,result,limitations}`. Required capabilities include secure-context WebCrypto, bounded workers, IndexedDB and encrypted file export/import; camera/share/clipboard are optional. Connector capabilities distinguish EIP-1193/EIP-6963 injected providers, mobile session/deep-link protocols and Solana wallet interfaces. A wallet supporting EVM does not imply Solana support. Initial browser targets: desktop Chrome/Firefox/Safari/Edge, Android Chrome/Firefox/Samsung Internet/Opera and iOS/iPadOS Safari plus alternate browser shells only when independently tested; engine/region behavior is recorded rather than assumed.

## 4. Algorithms and lifecycle

At startup probe required APIs without contacting third parties; show unsupported/read-only mode if absent. Discover wallet choices without auto-connecting; request permissions on user action. Before external handoff persist a nonsecret operation intent and encrypted journal checkpoint, then show expected chain/account/action and return instructions. On pageshow/visibility resume revalidate wallet session, account, network, deadline and chain state; never automatically resubmit. A returned deep link is untrusted input and cannot mark a transaction finalized. Background lock follows G01; low-memory eviction and private browsing are treated as possible storage loss. Cross-device continuity requires G03 encrypted export/import and fresh-key restore, not seed transport.

## 5. Interfaces and integration

Layout uses semantic HTML, visible keyboard focus, safe-area padding, wrapping rather than clipped irreversible details, content-based single/two-column changes and dialogs above virtual keyboard. Touch controls meet WCAG 2.2 24×24 minimum target criteria and aim for 44×44 for primary actions. Test portrait/landscape, 200/400% zoom, RTL, reduced motion/high contrast and keyboard-only. `getCompatibility()` returns tested/supported/unsupported/untested per wallet+chain; untested cannot appear as certified.

## 6. Errors, abuse and residual threats

WALLET_UNSUPPORTED, HANDOFF_CANCELLED, SESSION_EXPIRED, STORAGE_UNAVAILABLE and ACCOUNT_CHANGED stop signing and preserve pending reconciliation. Clipboard/camera denial falls back to manual/file actions. Deep-link scheme allowlists prevent arbitrary navigation; QR connection URIs are sensitive session material and not persistent public invites. Mobile hardware-wallet support is unavailable until physical-device tested.

## 7. Verification and primary references

Playwright engine coverage plus physical Android/iPhone/iPad wallet tests cover return from locked screen, app switch, session expiry, provider disconnect, denied camera/clipboard, failed file share and origin storage eviction. Screen-reader/zoom and slow-network cases are manual acceptance rows. Record exact versions at execution; current/prior-major coverage is a target requiring measured evidence, not a timeless compatibility claim.

Primary references (exact implementation revisions must be pinned in the evidence record): [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193); [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963); [WCAG 2.2](https://www.w3.org/TR/WCAG22/).
