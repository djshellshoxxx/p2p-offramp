# Solana peer acceptance (D1 Option B, Solana-native)

Status: **verify-only adapter plus a local replay ledger, candidate for review (Tier C: signing and terms binding)**.
It is not wired into the exchange, the web app or any wallet prompt. A valid result carries `candidateOnly: true` and
`economicPreparationAllowed: false`. No physical or browser wallet has been tested, so wallet interoperability is
**UNVERIFIED**. Nothing here was independently reviewed or approved for release.

Sources: `src/offchain.ts` (message envelope and Ed25519 policy), `src/acceptance.ts` (statements, signing requests,
decoders, verifier) and `src/replay.ts` (replay and tombstone ledger). Vectors: `contracts/solana/vectors/`.

## 1. Decisions in force

- D1 (accepted, Option B): each party carries a terms signature plus a wallet-signed acceptance that binds role,
  account, both messaging keys and expiry. Bindings are keyed by `(termsHash, role)`. Cancel or reject tombstones the
  `termsHash`. A bare terms signature is never an acceptance. The seller can still fund without any acceptance.
- D5 (accepted, Option A): the basic escrow verifies no acceptance signature on chain. The seller's funding
  transaction is the seller's acceptance; the buyer funds nothing. Off-chain signatures over the G16 terms belong to
  the D1 carrier, which is this module.
- The EVM candidate (`packages/wallet/src/evm-peer-*.ts`) was read for semantics only. EIP-712 is not used: Solana
  wallets sign raw bytes with Ed25519.

## 2. What each party signs

Each party's wallet signs **two Solana off-chain messages, version 1** (sRFC #3, below). Neither is a transaction.

1. **Terms consent** (the "terms signature"). The signers in the preamble are the seller and the buyer, sorted, so
   both parties sign identical bytes, as G16 requires ("both parties sign the identical public terms digest"). The body
   names the registry ids, genesis, program, both wallets and `terms-sha256`, the SHA-256 of the exact G16 terms bytes
   (`encodeSolanaTerms`, prefix `p2p-offramp/solana/basic/v1\0`), which is also the trade id.
2. **Peer acceptance**. The only signer is the party's own wallet. The body binds role, wallet, the signer's own and
   the counterparty's Nostr keys, the registry ids, genesis, program, `terms-sha256` and `not-after`.

The verifier rebuilds both messages from the **locally bound trade** (`bindSolanaTrade`: registry ids, native
genesis and program, the seller and buyer from the terms) and the **locally authenticated session**, never from the
peer's message, and checks both signatures against the wallet stored for the role.

Why not sign the raw G16 bytes (the earlier §4 text)? Raw G16 is 383 binary bytes that start with ASCII `p`. A
wallet cannot display them, the Ledger Solana app signs only transactions or messages with the off-chain header (read
from its source), `solana:signOffchainMessage` cannot produce them, and their only protection against transaction
confusion is that they do not parse as one. The off-chain envelope starts with `0xff`, which the runtime explicitly
refuses as a transaction prefix, and its ASCII body shows the user what is being signed. Signing the SHA-256 binds the G16 bytes as tightly as signing them, because the trade id is already that
SHA-256. A signature over raw G16 bytes is refused (vector `raw-g16-terms-signature`).

## 3. Byte layouts

### 3.1 Off-chain message, version 1 (restricted profile)

| Offset | Bytes | Field | Rule |
| --- | --- | --- | --- |
| 0 | 16 | signing domain | `ff 73 6f 6c 61 6e 61 20 6f 66 66 63 68 61 69 6e` (`"\xffsolana offchain"`) |
| 16 | 1 | version | `01` only; anything else is `UNSUPPORTED_VERSION` |
| 17 | 1 | signer count n | 1 (acceptance) or 2 (terms consent); never 0 |
| 18 | 32·n | signers | raw Ed25519 keys, strictly ascending bytewise (sorted, unique) |
| 18 + 32·n | rest | body | non-empty; only `0x20..0x7e` and LF `0x0a`; version 1 has no length prefix |

The whole message is at most **1232 bytes** (PACKET_DATA_SIZE, the Ledger app's limit), checked before anything else.
The profile is narrower than sRFC #3, which allows any UTF-8: printable ASCII plus LF is exactly what the Ledger
Solana app clear-signs. Because version 1 has no length field, an appended digit yields a different well-formed
statement (decoding vector `trailing-digit-is-another-statement`); its signature then fails.

### 3.2 Terms consent body

Lines are joined by one LF, with no trailing LF:

```text
p2p-offramp/solana/terms-consent/v1
Off-chain consent to the escrow terms below. Signing it moves no funds.
network: solana-localnet
deployment: escrow-v1
genesis: 7xchZ18C8Y2rfgfqR8sZ5XcjMp99jp67h5LuyqurEVHA
program: 7q2EChqznfQea58ZfUvBzRd97Bc28kwHaey1tYy7ADjq
seller: 3FDUtPRfYjhQKEMTR2V1AGTQHbuu7PPUSMmTwYXDDRhW
buyer: 9At3fBUmM62wpE41fdXK5RaA3o9T8BhHdbxEXP5m1dfQ
terms-sha256: 6b2a0decf88f937e1e50f24fa2817386dd23f9881c908e868d72cb0496bb3ffc
```

### 3.3 Peer acceptance body

```text
p2p-offramp/solana/peer-acceptance/v1
Off-chain acceptance binding this wallet to two chat keys. It moves no funds.
role: seller
wallet: 3FDUtPRfYjhQKEMTR2V1AGTQHbuu7PPUSMmTwYXDDRhW
own-messaging-key: 8cb8ff822ab4cfc8a7cd6904c49812e8f699125462daa8deb1e71fd2e3b69663
counterparty-messaging-key: ecce44d7b7473595ac6aaee9b6762d66c993016669583f3f7108b137967dd98c
network: solana-localnet
deployment: escrow-v1
genesis: 7xchZ18C8Y2rfgfqR8sZ5XcjMp99jp67h5LuyqurEVHA
program: 7q2EChqznfQea58ZfUvBzRd97Bc28kwHaey1tYy7ADjq
terms-sha256: 6b2a0decf88f937e1e50f24fa2817386dd23f9881c908e868d72cb0496bb3ffc
not-after: 1793783100
```

The examples are the synthetic `localnet` vector `native-seller` (TEST-ONLY keys). With the longest registry ids the
messages stay below 1232 bytes (test `longest registry ids still fit the hardware-wallet message bound`).

| Field | Statement key | Canonical form |
| --- | --- | --- |
| `role` | `role` | `seller` or `buyer` |
| `wallet`, `genesis`, `program`, `seller`, `buyer` | `wallet`, `genesisHash`, `programId`, `seller`, `buyer` | canonical base58 of 32 bytes (re-encodes identically) |
| `own-messaging-key`, `counterparty-messaging-key` | `ownMessagingKey`, `counterpartyMessagingKey` | 64 lowercase hex, a BIP-340 x-only secp256k1 key that lifts to a point; the two differ |
| `network`, `deployment` | `networkId`, `deploymentId` | registry id `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`, no `..` |
| `terms-sha256` | `termsHash` | 64 lowercase hex |
| `not-after` | `notAfterSeconds` | u64 decimal, no sign or leading zero, at least 1 |

`own` always means the signer of the statement, also on the receiving side. The acceptance `wallet` must equal its
preamble signer; the consent's `seller` and `buyer` must equal its two preamble signers.

### 3.4 Strict decoding

`decodeSolanaPeerAcceptance` and `decodeSolanaTermsConsent` take untrusted bytes. In order: type and size
(`LIMIT_EXCEEDED` above 1232), exact signing domain, version 1, signer count and order, profile bytes, the expected
signer count, the body domain line (`.../v2` is `UNSUPPORTED_VERSION`), the fixed sentence, the exact line count,
labels in fixed order with exactly one space after the colon, canonical values, and finally that re-encoding the
decoded statement reproduces the input byte for byte. Trailing, missing, reordered or duplicate lines, CR, NUL,
non-ASCII, uppercase hex, non-canonical base58 or decimals, unsorted or duplicate signers all fail closed.

## 4. Domain separation

| Confusion | Why it cannot verify |
| --- | --- |
| Solana transaction | Every signed message starts with `0xff`. Legacy messages start below `0x80`; versioned ones use `0x80 \| version`, and the runtime refuses version 127 (`0xff`) as "off-chain messages are not accepted". Vectors `legacy-transaction-message` and `v0-transaction-message` sign transaction messages that carry the statement text; both are refused. |
| EVM digest | EVM signatures are secp256k1 over 32-byte EIP-712 digests. A Solana wallet's Ed25519 signature over those 32 bytes is refused (`evm-peer-acceptance-digest`, `evm-trade-terms-digest`). |
| Raw G16 or the bare body | Only the full envelope is verified; `raw-g16-terms-signature` and `raw-body-without-preamble` are refused. |
| Other off-chain layouts | The Agave CLI and the `solana-offchain-message` crate sign a different version 0 layout; the sRFC #3 version 0 adds an application domain. Both are refused (`offchain-v0-agave-cli`, `offchain-v0-application-domain`). |
| Another application | Version 1 has no application-domain field, so the first body line is the application domain: `p2p-offramp/solana/...`. |
| Terms consent vs acceptance | Distinct first lines and signer counts (2 vs 1); a terms signature in the acceptance slot is refused. |
| Cluster, program, registry entry | `genesis`, `program`, `network` and `deployment` lines, also bound through `terms-sha256`. A statement naming another value is `WRONG_CHAIN`; a signature made for another value is `UNAUTHORIZED`. |
| Another trade | `terms-sha256` (`other-trade-terms-hash`). |
| Another chat identity | Both messaging keys, compared with the session (`wrong-own-messaging-key`, `swapped-messaging-keys`). |
| Later reuse | `not-after`, the terms `acceptBeforeSeconds`, the envelope expiry and the ledger. |

The body ends each line with LF rather than the task brief's suggested NUL terminator: a NUL would make the message
non-ASCII and push hardware wallets to blind signing. The text is not fixed-width: base58 keys take 32 to 44
characters and decimals have no padding, matching the canonical text forms used elsewhere in the repository. Fixed
labels, a fixed order, values that cannot contain LF and the byte-exact re-encoding check keep the encoding injective.

## 5. Ed25519 policy

`verifyEd25519StrictAll(publicKey, pairs)` accepts exactly what an RFC 8032 signer produces:

- the key decodes canonically (y < p, no negative zero), is not of small order and lies in the prime-order subgroup
  (checked once per key);
- per signature: S < L; R decodes canonically and is not of small order; the cofactorless equation
  `[S]B = R + [k]A` holds, which also puts R in the prime-order subgroup; and `@noble/curves` 2.4.0
  `ed25519.verify(..., { zip215: false })` (cofactored, strict encodings) agrees.

This set lies inside what RFC 8032 (strict decoding), dalek `verify_strict`, OpenSSL and ZIP-215 each accept, so a
signature accepted here is accepted by every common verifier and two clients cannot disagree about it. ZIP-215 is
**not** used: it accepts non-canonical encodings and cofactored-only signatures that an honest wallet never produces.
(Solana itself plans to move transaction verification to ZIP-215 under SIMD-0376; that is a consensus rule and does
not apply here.) Tests show the difference: a small-order forgery that ZIP-215 accepts is refused, and the vector
`mixed-order-wallet-key` (key aB + T with T of order 8) passes `@noble/curves` strict and ZIP-215 verification but is
refused here and by the Python oracle. `mixed-order-wallet-key-all-equations-hold` was ground until k = 0 mod 8, so it
also satisfies the cofactorless equation and OpenSSL's verifier; only the prime-order key rule refuses it.
`mixed-order-r` uses the seller's real key with R = rB + T: cofactored verification accepts it, the cofactorless
equation refuses it. Disabling either rule makes a vector test fail (checked by mutation on 2026-11-18).

## 6. Verification contract

`verifySolanaPeerAcceptance(trade, context, proof)` returns a `CoreResult`.

- `trade`: a branded `BoundSolanaTrade` from `bindSolanaTrade`; structural copies are refused.
- `context` (trusted, from the authenticated session): `role`, `ownMessagingKey` (the signer's),
  `counterpartyMessagingKey`, `nowSeconds`, `envelopeExpiresAtSeconds`.
- `proof` (untrusted): `statement`, `termsSignature` and `acceptanceSignature`, each exactly 64 bytes.

Check order: malformed or extra fields, accessors or bad sizes give `INVALID_INPUT` (statement version other than 1:
`UNSUPPORTED_VERSION`); foreign `network`, `deployment`, `genesis` or `program` give `WRONG_CHAIN`; another
`termsHash`, role, wallet or messaging key gives `UNAUTHORIZED`; `now >= min(notAfter, acceptBefore, envelope expiry)`
gives `EXPIRED`; then both signatures by the role's wallet, else `UNAUTHORIZED`. No cryptography runs for a statement
that does not match. Fields are read through own data descriptors, so getters and proxy `get` traps are never invoked.
Caller buffers are not modified; internal copies are zeroed (signatures are public data; no memory-erasure claim).
The result holds the statement, the SHA-256 of both signed messages and the effective deadline, never signatures.

Signing side (for the composition layer, not wired here): `solanaTermsConsentRequest(trade)` and
`solanaPeerAcceptanceRequest(trade, { role, ownMessagingKey, counterpartyMessagingKey, notAfterSeconds })` return
`{ statement, text, requiredSigners, message }`. With `solana:signOffchainMessage` 1.0.0 pass `messageVersion: 1`,
`message: text` and the `requiredSigners` keys; with `solana:signMessage` pass `message`. In both cases refuse the
result unless the returned signed bytes equal `message` exactly (the `signMessage` feature lets a wallet prefix or
modify the message). Never use `signTransaction` for these statements.

## 7. Replay and tombstone ledger

`new SolanaPeerReplayLedger(vault, session, clock)` keeps one encrypted vault record (`kind: 'preference'`,
schema 1, id = first 16 bytes of SHA-256 of `p2p-offramp/solana/peer-replay/v1`) through the injected vault port, with
compare-and-swap commits and the vault's empty-commit freshness check even for duplicates (the EVM candidate's rule).

- `admit(trade, context, proof)` verifies at the ledger's effective time, then records by `(termsHash, role)`. The
  same statement again is `duplicate` with no write (deduplication never compares signature bytes). A different
  statement for a recorded role, a second role whose keys are not reciprocal, or a different registry entry for the
  same terms is `CONFLICT`. A tombstoned `termsHash` is `CONFLICT`, also in a new session with new keys.
- `tombstone(trade)` is for a locally authenticated cancel or reject handler. It needs the bound trade (for the
  deadline) and removes any recorded acceptance for it.
- `status(trade)` is a read-only view for display; it grants nothing.

Bounds (review finding A-L3: the EVM candidate's 64-term, no-eviction ledger can fill permanently):

- at most **64** acceptance entries and a separate **64** tombstones, so acceptances can never take the space a
  cancellation needs; tombstoning a recorded trade moves it out of the acceptance space;
- an entry is evicted only when its terms' `acceptBeforeSeconds` has passed, when no acceptance for it can verify;
- an **eviction watermark** stores the latest evicted (or already-expired tombstoned) deadline. The effective time is
  `max(clock, watermark)` for eviction and verification alike, so a clock moved back cannot re-admit evicted terms;
- terms whose deadline is more than **604,800 s** (7 days) after the effective time are refused for admission and
  tombstone (`LIMIT_EXCEEDED`), so every slot frees within 7 days;
- the record stays at most 131,072 bytes (worst case tested: longest ids and numbers, both roles, all tombstones).

When a bound is reached the ledger refuses with `LIMIT_EXCEEDED`; there is no automatic retry, clear or delete. A
refused tombstone means the cancel could not be recorded: the caller must keep the negotiation refused. These bounds
are implementation choices for review, not protocol constants.

Failure modes, stated plainly: a clock far ahead evicts early and raises the watermark (fail closed: acceptances are
refused until real time passes it; the watermark never exceeds a deadline the ledger was given). Terms beyond the
horizon are never recorded; if they come back inside the horizon they are new terms needing fresh review. An older
backup cannot restore later tombstones. Browser storage races and crash behaviour of this service are not qualified.

## 8. Vectors from two independent implementations

- TypeScript: this package (`@noble/curves` 2.4.0, `@noble/hashes` 2.4.0, domain `encodeSolanaTerms`).
- Python: `contracts/solana/vectors/acceptance.py`, written from this document: its own base58, G16, envelope,
  statements, strict decoder, verifier and ledger model; Ed25519 signing and verification through `cryptography`
  50.0.0 (OpenSSL), plus its own RFC 8032 Edwards arithmetic for the strictness checks. It writes
  `peer-acceptance-v1.json` (4 positive, 4 variant, 47 negative, 33 decoding, 10 ledger scenarios).
- Third check, manual: the Agave 4.1.2 CLI (`solana sign-offchain-message`) reproduces the `offchain-v0-agave-cli`
  signature exactly (`acceptance.py --agave-cli <path to solana>`), and the CLI reports it valid in its own format.

`packages/chain-solana/test/acceptance-vectors.test.mjs` reproduces every message, text and signature byte for byte,
gets the same refusal code for every negative and decoding vector, and runs every ledger scenario on the real encrypted
vault. `scripts/tests/test_solana_peer_acceptance_vectors.py` reruns the Python generator in check mode, checks the
README hash and shows that a tampered fixture is refused. The libraries share no code, but both use well-known
designs; this is cross-implementation evidence, not an independent protocol or cryptographic review.

## 9. What this proves and what it does not

It proves, for the bytes verified, that the wallet holding the seller or buyer key of the bound terms consented to
those exact terms on that genesis, program and registry entry, bound itself to the two messaging keys, and did so
before the stated deadline. It does **not** prove fiat payment, physical identity, that the peer controls the
messaging key (the authenticated NIP-17 session must establish that), that the escrow is funded (chain state only,
at `finalized`), or anything about the funding transaction: the seller can fund without any acceptance, and the
program never sees these signatures. Accounts whose key is not a plain Ed25519 key (PDAs, multisig or smart wallets)
cannot produce these signatures and are refused.

## 10. Interoperability status

- **UNVERIFIED on physical and browser wallets.** No wallet was driven in this environment.
- The envelope is byte-compatible with `@solana/offchain-messages` 8.6.0 version 1 (read from source, not imported)
  and is what `solana:signOffchainMessage` 1.0.0 is specified to produce; the vectors were not checked against that
  package's code at run time.
- From source reading only, the Ledger Solana app parses version 1 with sorted signers and clear-signs ASCII plus LF
  up to 1232 bytes. Not tested on a device.
- Wallets that only implement `solana:signMessage` and modify the message (for example by adding their own off-chain
  header) produce signatures that do not verify. That fails closed.

## 11. Open points

- Lane A: carry `{ statement, termsSignature, acceptanceSignature }` in the version 2 exchange envelope (64-byte
  signatures, lowercase hex), build `context` from the authenticated session, wire the ledger to the authenticated
  receive, cancel and reject paths, and show the statement text before the wallet prompt.
- Owner: whether the separate terms consent is still wanted (D1 open item: the acceptance already covers
  `terms-sha256`); the horizon and capacity values; key rotation and restore policy.
- Independent review of the formats, the Ed25519 policy and the vectors before any integration.

## References

- sRFC #3, Solana off-chain message signing: https://github.com/solana-foundation/SRFCs/discussions/3 (cited by the
  two packages below; the discussion page itself could not be fetched from this environment).
- `@solana/offchain-messages` 8.6.0 (MIT), npm tarball SHA-256
  `5231183074bfe1b06635a7629cd5535c94a6d571e7f872de591717220a028959`: `src/codecs/signing-domain.ts`,
  `preamble-common.ts`, `preamble-v1.ts`, `message-v1.ts`; README "Verifying a signed offchain message".
- `@solana/wallet-standard-features` 1.5.0 (Apache-2.0), npm tarball SHA-256
  `5cb6be37dfd3b60521a90e93d4af064bf128f3b87a5b472dee050be0bf255b6a`: `src/signOffchainMessage.ts`,
  `src/signMessage.ts`.
- LedgerHQ/app-solana `develop` at `c855c1a0ea12e76406efbfd17203ecf419952e27`: `libsol/parser.c`
  (`parse_offchain_message_header`), `src/handle_sign_offchain_message.c`, `libsol/string_utils.c` (`is_data_ascii`).
- anza-xyz/solana-sdk at `129a6da799adde0c42cbe8b26412110346e79b01`: `offchain-message/src/lib.rs` (crate 4.0.0, the
  version 0 layout the Agave CLI signs), `message/src/versions/mod.rs` (version 127 refused),
  `signature/src/lib.rs` (SIMD-0376 note).
- solana-labs/solana `master` at `7700cb3128c1f19820de67b81aa45d18f73d2ac0`:
  `docs/src/proposals/off-chain-message-signing.md` (version 0 with application domain; runtime reservation, PR 29807).
- Agave 4.1.2 (`182084b8`), the pinned local toolchain, for the CLI cross-check.
- RFC 8032 (EdDSA), ZIP-215, BIP-340 (x-only keys), NIP-01.
