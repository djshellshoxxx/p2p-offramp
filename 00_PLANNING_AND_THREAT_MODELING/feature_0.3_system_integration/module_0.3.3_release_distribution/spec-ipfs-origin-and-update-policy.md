# G15 IPFS origins, trust and updates

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M1.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Distribute signed static releases without confusing content addressing with initial executable trust or assuming storage follows a CID. Updates are user-reviewed transitions; automatic hot-swapping during a trade is forbidden.

## 3. Architecture and data contracts

Use the common content-addressed manifest's ES256-P1363 profile and detached locator. Release discovery contains only untrusted candidate locators until signature/sequence validation. Prefer CID subdomain gateways for origin isolation; path gateways can share an origin with unrelated content and are unsupported for vault use unless a dedicated trusted origin is established. Each scheme/host/port origin has its own IndexedDB. CID changes, gateway changes and GitHub Pages deployment paths have distinct isolation effects; never infer vault absence means the user's keys or funds do not exist.

## 4. Algorithms and lifecycle

Bootstrap trust through a previously authenticated distribution key fingerprint and independently checked archive/verifier. A first visit to a hostile gateway cannot authenticate itself by running its own checker. Discovery fetches obey G05 route policy and have 1 MiB manifest/30-second request bounds. Verify signature, expiry, channel, deployment identities and monotonically increasing release sequence against local accepted state. Show current/candidate fingerprints, schema compatibility, recovery requirement and known changes. Ask the user to export/verify G03 backup before opening a new origin. Restore creates fresh G03 vault keys and reconciles authoritative chain state; no transaction replay. New release starts locked and with wallet disconnected. Updates while a wallet signature request is pending wait until that request is cancelled/resolved.

## 5. Interfaces and integration

`checkForUpdate()` returns none, candidate, untrusted, stale or unreachable; unavailable discovery leaves the installed client readable with explicit stale status. `acceptUpdate(candidate)` writes verified sequence to current-origin storage and opens a user-confirmed destination, never transfers plaintext secrets through URLs, postMessage or clipboard. Key rotation uses an old-key-signed transition plus independent publication; compromise requires manual trust re-bootstrap. No service worker is required; if introduced, its cache/version/eviction lifecycle needs separate review.

## 6. Errors, abuse and residual threats

ORIGIN_UNSUPPORTED, UPDATE_UNTRUSTED, SCHEMA_INCOMPATIBLE and BACKUP_REQUIRED block transition. Fresh origins/cleared storage cannot know a previously accepted maximum sequence; signed-but-old releases may appear valid until expiry and clocks are attacker/user influenced. A same-origin XSS or compromised verifier defeats in-app checks. Maintain independent recovery bundles rather than promising IPFS availability or rollback prevention on first use.

## 7. Verification and primary references

Test two CID origins and two gateways with real IndexedDB isolation, changed-origin backup restore, private browsing storage loss, stale manifest, lower sequence, forged rotation and modified JavaScript checker. Confirm no secrets in update URLs and no direct fallback in strict mode. Fetch/recompute CID and asset digests from both pin services. Pending: interoperable implementation, browser matrix and independent trust review.

Primary references (exact implementation revisions must be pinned in the evidence record): [IPFS origin isolation](https://docs.ipfs.tech/how-to/address-ipfs-on-web/); [Web origin](https://html.spec.whatwg.org/multipage/browsers.html#origin); [Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/).
