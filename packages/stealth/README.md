# Offline stealth comparison

This package implements two **named, offline diagnostic math profiles**, not an approved ERC-5564 scheme1 interoperability profile. Every service and fixture page requires an explicit profile and `{ kind: 'offline-fixture', id }` context. There is no default, automatic detection, live Announcer, network/RPC client, funding builder, signature operation, balance proof, spending key input or derived private key export. Default application trading remains disabled.

The specified local contract is [stealth-local-contract.json](../../docs/execution/profiles/stealth-local-contract.json). Its published-reference and SDK-source profiles intentionally disagree:

| Local profile | Keccak input | Provenance |
| --- | --- | --- |
| `local-erc5564-reference-xy64-v1` | shared point `x32 || y32`,64 bytes | ERC reference notebook, published tag/address reproduced |
| `local-scopelift-ecdh33-comparison-v1` | compressed shared point,33 bytes | ScopeLift source and noble2.0 default compression compared locally; upstream SDK **not executed** |

Both interpret the Keccak digest as a big-endian scalar and refuse zero or values at/above curve order rather than reducing modulo order. Both refuse infinity, malformed/noncanonical compressed points and out-of-field coordinates. Their view tag is the first digest byte. Addresses use the last20 bytes of Keccak of the uncompressed stealth point without its04 prefix. The wire encoding disagreement remains a decision gap; a matching diagnostic never authorizes funds.

## Public boundary

`index.ts` exports only:

- `createOfflineStealth({ profileId, context, isCurrent })` returning a frozen service with `createViewingKey`, `recipientMetaAddress`, `generateAnnouncement`, `matchAnnouncement`, `comparePages`, `close`.
- `createEncryptedComparisonStore({ profileId, context, viewingPublicKeyHex, spendingPublicKeyHex, vault, session, isCurrent })` returning an opaque purpose-bound store and `close`.
- Strict pure `decodeAnnouncement`, `parseMetadataHex` and `ANNOUNCEMENT_TOPIC0`.

Public points are lowercase bare33-byte compressed SEC1 hex, addresses are lowercase `0x`20-byte hex, hashes are lowercase `0x`32-byte hex, and metadata is lowercase bare1–256-byte hex. The normal recipient URI is exactly `st:eth:0x` plus spending and viewing compressed PUBLIC points, in that order. Single-key and equal-key recipients are refused. Scalars in the fixture file are explicitly public deterministic examples and are accessible only to private math tests. Production entrypoints have no secret import or RNG override.

`createViewingKey()` creates fresh native CSPRNG viewing-only material in a private closure. A WeakMap authenticates its handle, profile, purpose and context; copying JSON or passing a handle from another service fails. A handle publishes its viewing public point only. The caller supplies a distinct spending PUBLIC point. `generateAnnouncement` uses a fresh native ephemeral scalar and returns public address, ephemeral point, metadata, profile/context and `diagnosticOnly: true, economicAuthority: false`. Sender and matcher never return digest, shared point, view scalar or spending scalar. Entropy rejection is capped at128 attempts. At most16 live view handles belong to a service.

Service admission precedes owner, parser, clock and entropy callbacks. Current-owner and close checks follow each callback boundary and await. Wall/monotonic rollback retires the service; the local30-second deadline also checks elapsed clocks before publication. The matcher filters on the view tag before full address derivation. Revocation synchronously wipes owned viewing/entropy/derived byte buffers, aborts work, and blocks publication. Noble's internal bigint/point temporaries and engine/runtime copies cannot be promised physical erasure; this is not a hardware key boundary or worker isolation claim.

## Claimed offline pages and actual encrypted storage

`comparePages(viewHandle, spendingPublicKeyHex, request, source, encryptedStore, signal?)` accepts an explicit trusted **local fixture** `source.readOfflinePage(query, signal)` port. It cannot fetch any network itself. Request fields are exactly `profileId, context, expectedAnnouncer, fromBlock, toBlock, anchorHash, expectedCursor`. Bigint block/index values are bounded uint256. A page repeats the request profile/context/range/anchor plus `token, nextToken, complete, logs`. The first token is null; nonfinal tokens are bounded ASCII strings. A log wrapper contains exactly `blockNumber, blockHash, transactionHash, logIndex, log`, where `log` contains the Announcer `address, topics, data` only. These locally supplied block hashes/cursors remain **claims**, not native canonicality or deposit evidence.

The decoder requires all four indexed topics, scheme1, exact canonical address padding and dynamic ABI offsets/lengths/padding. Metadata after the first view-tag byte is opaque. Caller/address/metadata cannot establish a transfer or balance.

Limits are2000 inclusive blocks/request,1000 logs/page,10 pages/request,10000 total candidate derivations/job and10000 tracked matched candidates. Existing cached candidates are authenticated and rederived under the current view handle before new pages. Exact duplicates compare once; inconsistent duplicates, conflicting locations/hashes, unordered or out-of-range logs, altered anchors/profile/context, token cycles, partial pages and malformed bytes abort without checkpointing. A cursor must equal the persisted cursor and advance contiguously. No reorg window or rewind policy is invented.

The actual G02 consumer stores version1 internal LOCAL cursor/candidate records as encrypted `preference` records in one atomic compare-and-swap. Candidate and completed cursor share a commit after **all** pages validate. Private scope binding includes both public points, explicit profile and offline context. Foreign or future unrelated records survive untouched; an unsupported own namespace or ID collision fails closed. The adapter authenticates a current persisted snapshot before reading and preserves actual G02 lease/revision checks through commit. Existing G02 record count, payload and8MiB snapshot limits remain in force, so storage can refuse before the package's upper candidate cap. No plaintext preference map or writable session token is exposed.

Cancel/30-second local timeout releases the logical caller promptly while retaining service and store physical admission until an ignored source/storage promise drains. This blocks overlapping physical work and stale late publication. An ambiguous storage reply can mean the encrypted CAS persisted; the result refuses success and never simulates rollback. It must be reconciled from the actual G02 state after reopening. Closing/locking loses these native viewing-only handles; durable view-provider recovery is a separate unimplemented profile.

After a completed comparison, the viewing service retains a deduplicated native
revocation subscription to that store's G02 lifetime. Vault lock or explicit
store closure therefore wipes viewing keys even while no job is active. A
service can bind at most16 store lifetimes; closure removes all subscriptions.
Job completion still releases admission, so this lifetime binding does not keep
a completed job or physical storage slot occupied.

## Evidence and remaining decisions

The unchanged public vector fixture has SHA256 `a56fd329e6dfcce3077d7c0e9f557e3b48b5fb53591b3123deaeec6111770276`. Source pins and unresolved decisions are in `DECISIONS.json`. Tests exercise both public math vectors, actual native CSPRNG paths, rejection/cleanup/reentry, strict ABI bytes, and actual G02 encrypted storage including stale CAS, partial pages, lock, cancellation and ambiguous replies.

Run `node --import ./scripts/test-support/register-tsx.mjs --test packages/stealth/test/*.test.mjs` from the repository root. These tests require the execution environment's normal Node child IPC capability. No deployment, service access or production keys are needed.

Activation still requires an explicit interoperable scheme1 encoding decision, named network/Announcer code identity, native canonicality/deposit and reorg policy, brokered transport, durable view-purpose recovery, new unfunded agreement binding, external wallet spending/gas recovery that keeps secrets outside the app, and independent specialist review. Those missing profiles do not block the implemented offline comparison slice.
