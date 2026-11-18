# packages/qr: D6 QR interchange codec

This package is the codec for the accepted D6 decision (Option B). See [`docs/adr/proposed/D6-qr-payload-profiles.md`](../../docs/adr/proposed/D6-qr-payload-profiles.md) and the [QR interchange spec](../../00_PLANNING_AND_THREAT_MODELING/feature_0.12_product_completion/module_0.12.4_qr_interchange/spec-qr-everywhere-secure-sharing-and-import-export.md).

A code is an RFC 8785 canonical JSON envelope, encoded as RFC 9285 base45, behind the prefix `P2POFFRAMP:1:`. Only trade invites can be signed. Secrets never travel in a code. A code without a verified signature is shown as unauthenticated.

The package has no dependencies and holds no capabilities of its own. The caller injects SHA-256, randomness, the clock and any invite verifier.

## What is implemented

| Module | Contents |
| --- | --- |
| `src/base45.ts` | RFC 9285 encoding and strict decoding. Decoding refuses characters outside the alphabet, a length of 1 mod 3, a three-character group above `0xFFFF` and a final pair above `0xFF`. The byte cap is checked from the text length before anything is allocated. Exhaustive tests show that valid text and bytes map one to one. |
| `src/utf8.ts` | Strict UTF-8 that does not use the host's `TextEncoder` or `TextDecoder`. It refuses overlong forms, encoded surrogates, values above U+10FFFF, truncated sequences and stray continuation bytes. |
| `src/jcs.ts` | RFC 8785 for the values the envelope uses: objects, arrays, strings, safe integers, booleans and null. Keys sort by UTF-16 code units and strings are escaped the way ECMAScript does it. It refuses floats, unsafe integers, `-0`, lone surrogates, accessors, symbols, non-plain objects and sparse arrays. The strict parser refuses duplicate keys and nesting deeper than 8. `parseCanonicalJsonBytes` requires the bytes to equal the canonical encoding exactly. |
| `src/envelope.ts` | Envelope v1 with exactly the fields `protocol`, `v`, `type`, `requestId` (16 random bytes as hex), `createdAt`, `expiresAt`, `chain`, `originHint` (display only), `payload` and `payloadSha256`, plus an optional `signature` on trade invites only. Each type's payload has a fixed set of keys (listed below). Unknown protocols, versions, types, fields and chains fail closed. Creation (`createQrEnvelope`) runs the same validator as import. The module also provides the invite signing digest and `attachInviteSignature`. |
| `src/text-codec.ts` | `encodeQrText` and `decodeQrText`. The prefix and the base45 alphabet both sit in the QR alphanumeric set. The 2,048-byte decoded cap is enforced before any UTF-8 or JSON work. `encodeQrText` takes a clock and refuses an envelope that is already expired, inside the 60 s margin, or future-dated. The result reports the 1,024-byte generation target. |
| `src/review.ts` | The frozen import review, display grouping, and the bounded local replay ledger. |
| `src/qr-matrix.ts` | An ISO/IEC 18004 symbol encoder. It supports alphanumeric and byte modes, versions 1 to 40, and error-correction levels L, M, Q and H (M by default, per D6). It covers Reed-Solomon over GF(256), the eight masks with penalty-based selection, and the BCH format and version information. `renderQrSvg` draws a static single-path SVG with a quiet zone of at least four modules; colors are checked and nothing is linked or scripted. |

Payload schemas (`chain` is required for the first three types and must be `null` for the fingerprints):

| Type | Payload keys | Notes |
| --- | --- | --- |
| `public-address` | `address` | EVM: lowercase `0x` plus 40 hex digits, not zero. Solana: a base58 key that decodes to 32 bytes, not zero. |
| `payment-request` | `recipient`, `asset`, `amount` | Crypto only. `asset` is `native` or a token address. `amount` is a whole number of base units written in decimal, at most uint256 on EVM and u64 on Solana. |
| `trade-invite` | `ad`, `termsHash` | A pointer only: the advertisement address `30078:<author>:p2p-offramp:v1:<orderId>` (the same format as `parseAdAddress` in `packages/exchange`) and the G16 terms hash. It never carries terms. |
| `release-fingerprint` | `channel`, `releaseId`, `sequence`, `manifestSha256` | The release still has to pass the normal G15 verification. |
| `recovery-fingerprint` | `format`, `byteLength`, `sha256` | `p2p-offramp-backup/v1` (up to 12 MiB) or `p2p-offramp/offline-recovery-references/v1` (up to 128 KiB). It is not a download link and never carries ciphertext. |

Chains use the form `evm:<chainId>` or `solana:<base58 genesis hash>`. The decode context has to list every chain the device knows (`chains`) and can name an `expectedChain`. A chain outside the list returns `CHAIN_UNSUPPORTED`; a chain other than the expected one returns `CHAIN_MISMATCH`.

### Decoding order

Every step fails closed and has no side effect. A refusal is `{ ok: false, code }` and carries none of the scanned content.

1. The text length cap (`QR_TOO_LARGE`).
2. The prefix. `P2POFFRAMP:<other>` returns `VERSION_UNSUPPORTED` before decoding. A `wc:` URI returns `WALLET_SESSION_REFUSED`. Bare secrets return `SECRET_REFUSED`. Any URI or URL returns `URL_REFUSED`. Anything else returns `FORMAT_UNSUPPORTED`.
3. Strict base45 (`INVALID_ENCODING`) and the 2,048-byte decoded cap (`QR_TOO_LARGE`).
4. Strict UTF-8 (`INVALID_UNICODE`). Then strict JSON with depth 8 and no duplicate keys (`INVALID_JSON`, or `INVALID_UNICODE` for a lone surrogate). Then the bytes must equal the canonical form (`NON_CANONICAL`).
5. The secret and URL scan over every key and string (`SECRET_REFUSED`, `URL_REFUSED`). `channel` and `releaseId` are also checked with separators removed, so a hyphenated WIF key, bech32 key data or a hex key split into labels is refused. A bare lowercase 40-hex git SHA-1 is allowed as a `releaseId`; a 64-hex one is refused, because it cannot be told apart from a raw 32-byte key. The manifest keeps the commit in `sourceCommit`, and the QR `releaseId` grammar (at most 40 characters) is narrower than the manifest's. `originHint` already has strict hostname syntax, so it skips the base58 and mnemonic heuristics (v3 `.onion` names and long hostnames work). Explicit secret forms, and hex keys split across labels, are still refused there. Elsewhere, mnemonics are caught in any case and with any common separator. `chain` and `originHint` skip the URL check because each has its own strict syntax, so `www.example.org` is a valid hint and `https://…` fails that syntax.
6. The schema: protocol, version, type, exact keys, fields, payload, where a signature may appear, and the invite lifetime.
7. The chain allowlist (`CHAIN_UNSUPPORTED` or `CHAIN_MISMATCH`).
8. `payloadSha256` (`HASH_MISMATCH`).
9. The clock: `NOT_YET_VALID` past 120 s of future skew, and `EXPIRED` once `now + 60 s` reaches `expiresAt`.
10. The signature, for trade invites only, through the injected verifier. With a verifier, an invite must carry a signature (`SIGNATURE_REQUIRED`) under the verifier's profile (`PROFILE_UNSUPPORTED`) with that profile's exact sizes. The verifier must then attest the key-to-author binding (`SIGNATURE_INVALID`); `UNAVAILABLE` if it throws.

### Signing (trade invite only)

`inviteSigningDigest(envelope, sha256)` returns:

```
SHA-256( UTF-8("p2p-offramp-qr/v1/trade-invite/signing-digest") || 0x00 || RFC8785(envelope without "signature") )
```

The domain string names the protocol, version and type, and the digest covers every wrapper field: `requestId`, both timestamps, `chain`, `originHint` and the payload. A signature on any other type returns `SIGNATURE_UNSUPPORTED`. A signature moved to another invite, or kept after the envelope is changed, fails the verifier with `SIGNATURE_INVALID`.

The invite signing-key profile is still an open owner decision. This package does not choose a key type or reuse a wallet or release-signing key, and it ships no default verifier. The `signature` object (`profile`, `publicKey`, `value`, all as lowercase hex) is opaque and only size-bounded. Without an `InviteVerifier`, a signed invite decodes with `authenticated: false`, `signature: 'unverified'` and the warning `no-invite-verifier`, so the import screen has to show it as unauthenticated.

When a verifier is supplied, `requireInviteSignature` defaults to true, so stripping or relabelling the signature is refused rather than downgraded to unauthenticated. Pass `false` for review-only decoding.

The verifier contract is:

- it declares `profile`, `publicKeyBytes` and `signatureBytes`;
- it receives the digest, the signature and the full `binding` (`ad`, parsed `author`, `orderId`, `termsHash`, `chain`, `requestId`, timestamps, `originHint`);
- it MUST verify the signature, then look up the key's author in its OWN key registry or profile rules. It returns `{ ok: true, publicKey, boundTo }`: the key it verified with and the author that registry names;
- it must never copy `binding.author` or `signature.publicKey` into the result;
- the codec refuses a bare `true`, a missing field, a `publicKey` other than the signature's, or a `boundTo` other than the advertisement author;
- a verifier that merely echoes its input would still pass, because the codec cannot see the registry. Until the key profile is decided, the binding is the verifier's responsibility; a test documents this limit.

The tests use an HMAC verifier that is test-only. It is not a proposal for the profile.

### Import review and replay

`decodeQrText` returns a frozen `QrImportReview` with `authority: 'none'`. It contains:

- the type, `requestId`, timestamps, `chain` and `originHint`;
- the full payload, and `display` fields for the UI to localize, with lookalike-prone strings grouped (`0x e4c2 e6a4 …`, `1 500 000 …`);
- `authenticated`, `signature` and `expiryAuthenticated`;
- `warnings`, which always include `unauthenticated` unless the code was verified, and always include `payload-hash-is-not-authentication`.

The review never navigates, connects a wallet, signs, stores anything or makes a network request. A test makes those globals throw and checks that none of them is touched.

`createReplayLedger({ nowSeconds, maxEntries, retentionSeconds })` is the local request-ID dedupe. Its `admit(review)` refuses a request ID it has already seen (`REPLAYED`) and checks expiry again when the import is committed. Memory is bounded:

- A **verified** invite is protected. It is kept until its signed expiry (24 hours at most) plus skew, and is never evicted.
- An **unauthenticated** code's expiry is chosen by whoever made it, so it is kept for at most `retentionSeconds` (default and maximum 24 hours). When the ledger is full, the oldest unauthenticated entry is evicted. Far-future unsigned codes therefore cannot lock out a verified invite.
- Only a ledger full of live verified invites refuses (`REPLAY_LEDGER_FULL`).
- A verified invite replaces an unauthenticated entry with the same `requestId`, so an unsigned code copying a public invite's ID cannot pre-poison it. A verified entry is never replaced.

Deduplication of unauthenticated codes is best-effort under memory pressure. As the spec says, this stops accidental repeat imports on one device. It is not global anti-replay security.

## What is not implemented

- **No camera or scanner UI and no QR image decoding.** There is no `getUserMedia`, no image handling and no scan lifecycle here. The UI also has to pass the scanned or pasted text through unchanged, without trimming, because space is a base45 digit.
- **No physical scan tests, and no third-party reader has decoded these symbols yet.** D6 and the spec require tests on iOS, Android and desktop, with printed, low-light, inverted and partial codes. The 1,024-byte generation target and the level M default stay provisional until those tests are done. At level M, envelope size sets the symbol size: 350 bytes need version 15 (77×77 modules), 1,024 bytes need version 27 (125×125) and 2,048 bytes need version 39 (173×173). D6 notes that dense codes are hard to scan from a screen.
- **How the symbol encoder was checked.** It matches published known answers:
  - the Reed-Solomon examples from ISO/IEC 18004 Annex I and the well-known "HELLO WORLD" 1-Q walkthrough;
  - all 32 format-information words and the version-information words;
  - the capacity figures quoted in D6 and the 2026-11-03 research note.

  A separate Python reader in the oracle decodes all 21 frozen symbols, checks every Reed-Solomon block and recovers the original text. That reader was written in this change and is not an outside scanner. Penalty rule 3 uses the common "outside is light" reading, so another encoder may choose a different mask that is just as valid. A bit-for-bit comparison with an outside encoder was not done.
- **The invite signing-key profile is open.** There is no verifier, no key binding to the advertisement and no signer.
- **No `commitImport`.** Merging into domain state, `IMPORT_CONFLICT`, refusing to overwrite funded terms, and the G05 refetch and revalidation of signed current terms before funding all belong to the domain layer.
- **No 64 KiB file-import path.** File import of public envelopes, and a downloadable file with a hash fingerprint for oversized content, are not built. Multi-frame codes are unsupported.
- **No ERC-681 or `wc:` compatibility parser.** Both are refused. Wallet pairing belongs to its connector.
- **The secret and URL scan is a heuristic backstop.** The exact-key schemas, which allow no free-text field, are the real control. A raw 32-byte hex secret placed in a hash field cannot be told apart from a hash.

## Boundaries

- Sources under `src/` import nothing outside this package. They use no browser globals (`window`, `fetch`, `crypto`, storage, workers) and no Node built-ins. `node:crypto` appears in tests only, to supply the injected SHA-256 and the test-only HMAC.
- Nothing here is authority. A matching `payloadSha256` detects accidental change and authenticates nobody. `originHint` is shown to the user and never trusted.
- Decoding is stateless. The replay ledger is the only state, and the caller owns it.

## Checks

```sh
node --import ./scripts/test-support/register-tsx.mjs --test packages/qr/test/*.test.mjs
node --import ./scripts/test-support/register-tsx.mjs packages/qr/test/fixtures/generate-vectors.mjs --check   # fixture freshness
python3 -I scripts/vectors/check_qr_codec.py                                                                 # independent oracle
python3 -m unittest scripts/tests/test_qr_codec_oracle.py
```

`test/fixtures/vectors.json` is generated from synthetic labels. Its `meta` records the generator, the runtime and the codec parameters, plus an RFC 8785 content digest; `vectors.json.sha256` covers the whole file. `scripts/vectors/check_qr_codec.py` is a separate Python implementation, using only the standard library, of:

- base45, RFC 8785 and the D6 envelope checks; it agrees with every vector, including every refusal code;
- an ISO/IEC 18004 symbol reader for the `qrSymbol` vectors.

It is not independent everywhere:

- base45, RFC 8785, the hashes, the signing digest and the symbol reader are written from the standards;
- the secret/URL heuristics and the signature-requirement rules restate this package's policy, so they show consistency, not sufficiency;
- its replay check is a simple seen-set. It does not model this ledger's capacity, eviction or retention; only the TS tests cover those.
