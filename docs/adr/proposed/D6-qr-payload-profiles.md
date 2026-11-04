# D6 - QR payload profiles (decision packet)

Status: PROPOSED. This packet is for the owner. It does not decide anything. No envelope, codec, signing rule or size limit in it is approved, and nothing here changes running behavior.

Paths marked "main" exist on `main` (e9b9db3). Paths marked "PR #26 only" exist only on the PR #26 branch (55715c9).

## The question

Which payload types may travel in a QR code, and what exact version, codec, size limit, signature and expiry rules apply, so that a scanned code is safe to import and never implies payment, chain or release authority?

Today there is no QR code in the product. No scanner or generator exists and no library is installed.

## Current source behavior

- The design baseline is a spec only (`00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion/module_0.12.4_qr_interchange/spec-qr-everywhere-secure-sharing-and-import-export.md`, main). It defines an envelope with `protocol`, `v`, `type`, `requestId` (16 random bytes), `createdAt`, `expiresAt`, `chain`, `originHint` (display only), `payload`, `payloadSha256` and an optional `signature`. Allowed types are public-address, trade-invite, payment-request, release-fingerprint and recovery-fingerprint. Hashes use RFC 8785 canonical bytes. One code holds at most 2,048 UTF-8 envelope bytes, with no compression. Default invite validity is 10 minutes and the maximum is 24 hours. Multi-frame codes are unsupported. The spec says the signature, when present, uses a type-specific identity profile, and unsigned payloads stay explicitly unauthenticated. It states that QR contents are hostile input and that scanning is never navigation, signing or import authorization.
- The owner packet leaves the exact fields, signature authority and domain, codec and canonical bytes, error correction, expiry and replay policy undecided (`docs/governance/PENDING-DECISIONS.md`, section "QR payload, signature and codec", PR #26 only). The records are `docs/governance/qr-profile.decision.json` and `docs/governance/qr-profile.proposal.json` (PR #26 only), both status proposed or draft with no reviewers.
- The nearest shipped sharing code is the generic app link, derived from the entry module URL, which allows only https or loopback and rejects userinfo, query, fragment and traversal (`apps/web/src/sharing/generic-app-link.ts`, PR #26 only). Its header says an address identifies a hosting location and does not authenticate the host or release.
- Recovery references are a private JSON export in pages of 64 items (`RECOVERY_REFERENCE_PAGE_SIZE`) with a 128 KiB export limit, labelled `unverified-offline-reference` (`packages/schemas/src/recovery-reference.ts`, main; `apps/web/src/ui/RecoveryReferencesPanel.tsx`, main). That is far over the QR limit. The recovery portal is a scriptless unsigned local package with no approved key (`docs/portal/README.md`, PR #26 only).
- Plaintext fiat payment details live only in the private agreement, shared inside the encrypted negotiation (`01_P2P_SHIELDED_OFFRAMP_ENGINE/feature_1.8_trade_coordination/module_1.8.1_trade_terms/spec-signed-trade-terms.md`, main). Messaging keys are Nostr keys carried in the exchange envelope (`packages/exchange/src/messages.ts`, main).
- Library behavior: no QR, base45 or bech32 library is present in this checkout, so none was run. The capacity figures below are the standard published QR (ISO/IEC 18004) version 40 limits and are unverified against any library. They must be re-measured with the chosen library.

## Which types need a QR

- Trade invite (offer reference): yes. It should point to an advertisement and its terms hash, not carry the terms.
- Public address and payment request (crypto only): yes, as in the spec.
- Messaging key: only the public Nostr key, as an invite field or its standard bech32 form. Never a private key.
- Recovery reference: a fingerprint only, as the spec says. The export itself is a file.
- Never in a QR: seed or mnemonic material, private keys, wallet-session URIs, decrypted evidence, authentication tokens, plaintext fiat details, or an encrypted backup (file transport only).

## Options

**Option A - the spec as written.** A JSON envelope (RFC 8785), raw UTF-8 in byte mode, 2,048-byte cap. Capacity at version 40 in byte mode is about 2,953 (error correction L), 2,331 (M), 1,663 (Q) and 1,273 (H) bytes, so 2,048 fits only at L or M, and a version 40 code is 177 modules wide, which is hard to scan from a screen. Security: reuses the reviewed envelope. Weakness: the largest codes and no alphanumeric-mode saving.

**Option B - the same envelope, base45 text with a version prefix.** A fixed prefix naming the protocol and a version, using uppercase alphanumeric characters only so the code does not fall back to byte mode and lose the efficiency, then RFC 9285 base45 of the canonical envelope bytes. `payloadSha256` is over the RFC 8785 payload. Base45 uses the 45-character QR alphanumeric set, which QR packs at 11 bits per two characters, so 2 bytes become 3 characters (about 97 percent efficient, an unmeasured figure). Version 40 alphanumeric capacity is about 4,296 (L), 3,391 (M), 2,420 (Q) and 1,852 (H) characters, so a 2,048-byte envelope (3,072 characters) fits L and M only. Base45 has no checksum of its own, but the QR code already carries Reed-Solomon error correction, and `payloadSha256` covers app-level change. Its character set includes space, percent and slash, so it must travel as plain text, not inside a URL. A prefix lets a reader refuse an unknown version before parsing.

**Option C - bech32 or URL-safe base64.** Bech32 has a built-in checksum and avoids lookalike characters, but it is lowercase unless the whole string is uppercased (both forms are allowed for QR use), it is about 91 percent efficient in alphanumeric mode, and the length limit in BIP-173 is 90 characters for addresses (unverified here for longer data). URL-safe base64 must use byte mode, so it is about 75 percent efficient and the worst on capacity. Neither adds security over Option B.

## Recommendation

Option B, with these rules for the owner to confirm:

- Hard cap of 2,048 envelope bytes per the spec, checked on the decoded bytes before JSON parsing (the 64 KiB file-import ceiling still applies to file imports), with a lower generation target (for example 1,024 bytes) so codes stay scannable. Use error correction M by default. The exact target is set only after the physical scan tests the spec already requires.
- A version in the prefix and in the envelope. Unknown version, type, field or chain fails closed with no side effect.
- Sign only where authority matters. A trade invite is signed over a digest of the canonical envelope with `signature` omitted, prefixed by a fixed domain string naming protocol, version and type, so it cannot be replayed as another type. The signing key is proposed for owner decision, because the spec only says "type-specific identity profile": a Nostr messaging key would have to be bound to the advertisement, and the signature scheme must be stated, not assumed. Address, payment request and fingerprint codes stay unsigned and are shown as unauthenticated. A wallet key is not used, and release signing keys are not reused.
- Expiry is mandatory on invites (10 minutes default, 24 hours maximum), checked with a safety margin, and request-id deduplication is local only, as the spec says. `expiresAt` is trusted only after the signature verifies; for unsigned codes, expiry is advisory.
- Show the full recipient, chain, amount and expiry before import, show lookalike-prone strings in full with grouping, and treat any URL as text. A matching hash detects accidental change and authenticates nobody.

## Test vector requirements

Do not invent hex values. Vectors must come from at least two independent implementations of the codec and canonical JSON, frozen with generator, versions and a hash.

- Positive: one code per allowed type; RFC 9285 base45 round trip using the RFC's own examples; the largest permitted envelope at the chosen error correction; a signed invite that verifies.
- Negative: unknown version, type or field; oversize; invalid Unicode; wrong chain; expired and replayed invite; hash mismatch; a signature copied across types; a code carrying a secret field, including wallet-session URIs and authentication tokens (spec-mandated rejections); a URL payload; and a partial or damaged scan. Physical tests on iOS, Android and desktop with printed, low-light and inverted codes.

## What this unblocks

Interoperable QR import and export for invites, addresses and fingerprints, and closing the QR item in `PENDING-DECISIONS.md`. It does not unblock any scanning SDK choice, release signing, backups by QR, or any funding authority.
