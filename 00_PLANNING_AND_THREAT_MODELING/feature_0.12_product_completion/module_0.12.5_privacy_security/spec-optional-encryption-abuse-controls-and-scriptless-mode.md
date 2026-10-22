# Encryption, local abuse limits and scriptless portal

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M0 / M1 / optional extensions.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Separate mandatory protection of stored/private content from optional feature encryption and weak local abuse friction. Provide a scriptless read-only security portal without implying a static no-JavaScript page can execute wallet escrow safely.

## 3. Architecture and data contracts

G02 AES-256-GCM vault protection and G03 encrypted recovery are mandatory for private app records; fixed password wrap is PBKDF2-HMAC-SHA-256 with 600,000 iterations. NIP-44 with NIP-17/59 protects new private messages; NIP-04 fallback is disabled. “Optional encryption” means a user may decline storing a record or choose explicitly public discovery fields, not persist plaintext secret keys/bank data/chat as an easier mode. DataClass tags public/private/secret route records to content/storage policies. Public discovery metadata cannot be made confidential by shipping its decrypting key publicly.

## 4. Algorithms and lifecycle

Before parsing imports enforce byte/schema/depth bounds. Bound local UI concurrency to one import and one cryptographic job, offer creation attempts to five per minute per local profile and scanned candidates to ten per minute; these are tunable UX limits, not network Sybil defenses. A local math/CAPTCHA challenge may add optional friction but must have accessible nonvisual alternative and cannot gate fund recovery. No external CAPTCHA/machine fingerprinting service. Relay/on-chain defenses use separate validated quotas/protocol economics; browser local limits can be bypassed by malicious clients. On overload reject work before allocation, preserve funded-trade reads/exits and allow explicit cancellation.

## 5. Interfaces and integration

Scriptless package contains static HTML/CSS: contract/program addresses/source hashes, signed release verification instructions, public key fingerprints, risk warnings, printable recovery checklist and verified ABI/IDL download links. Serve dedicated policy `script-src 'none'; object-src 'none'; base-uri 'none'` plus restrictive default/connect/frame directives, with no trackers/external embeds. GitHub Pages cannot generally set arbitrary CSP headers; use verified host configuration or a correctly ordered meta policy and document directive limitations. It cannot provide interactive wallet signing, live RPC, vault decryption, camera scanning or WASM proof generation. An air-gapped/CLI signing workflow would need its own signed protocol/review and is not supplied by this portal.

## 6. Errors, abuse and residual threats

ENCRYPTION_REQUIRED rejects private persistence without unlocked vault; LOCAL_LIMIT_REACHED offers wait/cancel without deleting state; PORTAL_READ_ONLY explains external recovery instructions. Same-origin malicious script can read unlocked data; local challenges cannot stop bots or network abuse. Download hashes only help when obtained from trusted independent distribution. Private data never enters permanent static/IPFS releases.

## 7. Verification and primary references

Test private record writes while locked, accidental plaintext serializers, rate-limit bypass classification, resource floods, accessible challenge alternatives and recovery unaffected by cooldown. Load portal with JavaScript disabled and verify all public recovery instructions remain readable with no network requests beyond static assets. Test actual served CSP; do not assume a source meta tag proves deployment headers. Independent review remains pending.

Primary references (exact implementation revisions must be pinned in the evidence record): [CSP Level 3](https://www.w3.org/TR/CSP3/); [Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/); [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md).
