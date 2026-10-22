# Secure QR interchange and import/export

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M1 / M2C.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Encode selected public shareable data locally and require explicit review before use. QR contents are hostile input; scanning is never navigation, wallet connection, signature or import authorization. Secrets, mnemonics, decrypted evidence and authentication tokens are excluded from generic sharing.

## 3. Architecture and data contracts

Envelope v1: `{protocol:"p2p-offramp-qr",v:1,type,requestId,createdAt,expiresAt,chain,originHint,payload,payloadSha256,signature?}`. Allowed types: public-address, trade-invite, payment-request, release-fingerprint and recovery-fingerprint. requestId is 16 random bytes hex; timestamps are UTC seconds integers, default invite validity 10 minutes and maximum 24 hours; hashes are SHA-256 canonical RFC 8785 payload bytes. chain is required for address/payment/trade. originHint is display-only, never trust. Signature, when present, uses the type-specific accepted identity profile (not automatically release signing keys); unsigned payloads remain explicitly unauthenticated.

## 4. Algorithms and lifecycle

Generate/scan locally using a pinned reviewed library; no remote QR image service. A single code is at most 2,048 UTF-8 envelope bytes with no compression, scripts or embedded image data. Oversized payloads use a downloadable file plus local hash fingerprint; animated multi-frame backup transport is deferred/unsupported until independently specified. Encrypted G03 backups use file transport, explicit sensitive-ciphertext confirmation and ordinary recovery checks; a public hash is not an off-device download capability. Scanner decodes at most one candidate per user confirmation, then parses strict schema with depth 8 and 64 KiB file-import ceiling for public envelopes. Reject unknown fields/version/type, invalid Unicode, oversized content, stale invites and chain mismatch. Show full recipient, amount/base units, chain, expiry, identity/signature state and permissions before accept.

## 5. Interfaces and integration

`decodeQr(bytes)` returns a validated candidate only; `reviewCandidate(candidate,context)` produces explicit confirmation UI; `commitImport` merges through authoritative domain rules and cannot overwrite live funded terms. Local request-ID deduplication prevents accidental repeated import but is not global anti-replay security. A trade invite must fetch/revalidate signed current terms through G05 before funding. Wallet-session QR uses its connector's protocol/parser and is explicitly sensitive; generic public QR sharing never copies session URIs. Every QR has copy/paste/file/manual fallback; camera starts on user gesture and stops tracks on accept/cancel/background.

## 6. Errors, abuse and residual threats

QR_TOO_LARGE, TYPE_UNSUPPORTED, HASH_MISMATCH, EXPIRED, CHAIN_MISMATCH and IMPORT_CONFLICT leave storage/transactions unchanged. URLs render as text; only separately approved allowlisted links can open. A matching hash detects accidental change but authenticates no sender. Camera denial and same-device scanning use file/paste fallback. Clipboard poisoning, QR replacement, phishing and screenshot persistence remain user-visible risks.

## 7. Verification and primary references

Roundtrip each type on physical iOS/Android/desktop with printed, low-light, inverted and partial codes. Fuzz parser Unicode/depth/length/unknown versions; test stale/replayed invite, chain mismatch, poisoned address, interrupted camera and conflict with funded local state. Assert no outbound image upload and no scan-triggered navigation/signing. G03 restore remains fresh-key and independent of QR support.

Primary references (exact implementation revisions must be pinned in the evidence record): [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785); [Media capture](https://www.w3.org/TR/mediacapture-streams/); [WCAG 2.2](https://www.w3.org/TR/WCAG22/).
