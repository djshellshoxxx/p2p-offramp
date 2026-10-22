# Stealth scheme boundaries

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M3 optional.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Define an optional EVM stealth-recipient adapter without pretending EIP-5564, Solana addressing and Monero are interchangeable. M2 basic escrow continues to use a directly bound recipient. Stealth applies only to new trade terms that explicitly select a supported scheme and deployment.

## 3. Architecture and data contracts

Capability descriptor: `{adapterId:"eip5564-secp256k1-v1",schemeId:1,chainId,announcerAddress,announcerCodeHash,metaAddressEncoding,dependencyDigest,reviewId}`. Pin the concrete EIP revision and reviewed library commit in implementation evidence before enabling. Scheme 1 uses secp256k1 spending/viewing keys and the EIP's announcement format; this is separate from vault AES and messaging keys. The external wallet must support the eventual recipient's spending/recovery workflow; ordinary wallet connect does not imply stealth support. No Monero or Solana adapter is supplied by this descriptor.

## 4. Algorithms and lifecycle

Negotiate capability before signing immutable terms. Validate meta-address scheme, public-point encoding and chain context with the scheme library; reject infinity/invalid points. Sender generates fresh ephemeral scalar, derives recipient and view tag according to the pinned EIP, and verifies computed output against a second implementation fixture. Bind the derived address and announcement commitment into trade terms before funding. Publish announcement only under the reviewed protocol flow; monitor chain logs with a persisted finalized cursor, reorg rewind and bounded scans. A matching view tag is only a cheap filter; perform full derivation/address comparison. Funding and spending need chain-specific gas planning; do not promise private gas funding.

## 5. Interfaces and integration

`deriveRecipient(metaAddress,chainContext)` returns `{recipient,announcement,derivationReceipt}` with no spending secret. `scanAnnouncements(range,cursor,viewCapability)` returns candidate receipts in batches of at most 1,000 logs and yields/cancels between batches; RPC range failure reduces batch size. `recoverRecipient(receipt)` requires the documented spending capability and returns to an independently usable wallet path. Unknown adapters render read-only metadata and cannot fund.

## 6. Errors, abuse and residual threats

STEALTH_UNSUPPORTED, INVALID_META_ADDRESS, ANNOUNCER_MISMATCH, SCAN_INCOMPLETE and GAS_UNAVAILABLE stop new stealth funding. RPC outages never prove absence of funds. Announcements, reuse, gas sources, amounts and timing remain linkable. Viewing-key compromise reveals detection/linkability; spending-key compromise can lose funds. Recovery artifacts must not publish viewing or spending secrets.

## 7. Verification and primary references

Use pinned EIP vectors and cross-library sender/receiver fixtures. Test malformed points, wrong scheme/chain, view-tag collisions, reorgs, scan restart, duplicate announcements and recovery after frontend loss. Demonstrate spend with the intended external wallet and clear gas source before enabling any asset. Independent review must assess privacy claims; optional-module removal must leave basic trade/refund usable.

Primary references (exact implementation revisions must be pinned in the evidence record): [ERC-5564](https://eips.ethereum.org/EIPS/eip-5564); [SEC 1](https://www.secg.org/sec1-v2.pdf).
