# Local text chat and encrypted history

This package composes existing G20 NIP-17/44/59 authentication with the G02 vault.
It has no transport, wallet, app/Worker wiring or release-enabling capability.
Named cryptographic review and the remaining product gates are still required.

`encodeMessage` and `decodeMessage` support only the text profile of
`spec-application-message-envelope`: exact fields in this deterministic JSON order:

```text
format, version, binding, termsHash, messageId, sender, recipient, kind, createdAt, body
```

The format is `p2p-offramp-message`, version is `1`, kind is `text`, and body is a
nonempty string. `binding.tradeId` equals the lowercase 32-byte `termsHash`;
`messageId` is 16 random bytes represented as lowercase hex. Sender and recipient
are distinct lowercase BIP340 key encodings. `createdAt` is an untrusted safe
integer millisecond claim. Body is at most 16,384 UTF-8 bytes and the whole JSON is
at most 24,576 bytes. Exact schema checks, duplicate-key rejection and fatal UTF-8
decoding precede native message work. Markup is data, never HTML. Terms and
receipt-status body profiles, sequence/expiry wire fields and future versions
remain unsupported; this implementation does not invent their contracts.

`createDurableTradeChat` requires a trusted vault/session and configured native
messaging provider, trade binding, two participants and self identity. Its API is
`send(bytes, secret, signal?)`, `receive(wrap, secret, signal?)`, `list(secret,
signal?)`, and `close()`. It exposes no append method accepting an author claim.
The options are trusted composition capabilities; bytes, wraps and stored record
payloads are untrusted. The caller owns routing and explicit publication.

Every append first authenticates the actual NIP-17 message, then binds the inner
envelope author to the seal author and verifies recipient/trade/terms. Each G02
`chat` record contains an encrypted native gift-wrap proof and local receipt
sequence/time inside this v1 wrapper:

```text
format: p2p-offramp-chat-history
version: 1
conversationId: existing G20 conversation digest
receivedSequence: contiguous positive integer local receipt order
receivedAt: safe integer local receipt milliseconds
wrap: recipient-addressed native NIP-59 event (self-copy for outbound messages)
```

The wrapper is UTF-8 JSON encoded as base64url in the existing private-record
payload; G02 encrypts the complete snapshot with the existing KDF/AAD. No new
record kind, encryption format or session token is introduced. The decrypted text
is not separately persisted. `list` requires the original messaging key and
freshly decrypts/verifies every proof; serialized flags do not establish native
authentication. Results are explicitly local history with no economic authority.
Neither sender timestamps nor receipt metadata prove delivery, fiat receipt or
chain state.

Authenticated sender plus message ID is the durable dedup key. An identical
canonical envelope returns the first receipt without another write; changed
content conflicts. Distinct authors may independently use the same ID. Receipt
order is separate from sender time. Defaults are 64 messages per conversation,
configurable up to 256, and at most 2 MiB of matching record payloads. Capacity
refuses growth instead of evicting replay memory. No deletion/retention policy is
invented. Full history and duplicate reads remain available at capacity.

Reads authenticate the live persisted vault revision. Appends use its exact CAS
revision and a pre-write guard. Across tabs only a winning CAS adds a message;
stale sessions must unlock/reload. Lock/close/abort suppress late plaintext and
publication output, wipe owned byte copies and hold the physical operation slot
until noncooperative work drains. JavaScript strings and provider internals cannot
be physically wiped. Already committed records remain recoverable after late
cancellation; reconcile by listing after unlock before retrying with the same
message ID. An error never proves a storage write was rolled back. The package
itself never publishes or automatically retries.

Foreign version-1 chat formats and other conversations are preserved and skipped.
Malformed or unsupported chat records block rather than silently forgetting replay
state. Unknown records are never rewritten/deleted. Fresh-key G03 restore keeps
the native proofs and conversation binding unchanged; source profiles remain
untouched. Reading restored chat also requires the original messaging identity,
which must be recovered separately through its consumer flow. Restoring ciphertext
does not assert that a backup is current, rotate a key or revoke old copies.

Run the focused Node tests with `node --import ./scripts/test-support/register-tsx.mjs
--test packages/messaging/test/*.test.mjs`. The private native Chromium proof is
`node scripts/test-chat-history-browser.mjs`: real IndexedDB, two-tab CAS, document
reload, durable replay refusal and fresh-key restore, with no wallet calls or
application network access.
