# Localnet recovery of an unchanged unfunded agreement

This bounded continuation uses the accepted [D1 composition](D1-peer-acceptance.md)
and [D9 provenance rules](../consolidation/2026-11-16-d9-migration.md). It adds an
explicit recovery action to the opt-in localnet application. `ReleaseEnabled=0`,
the default application graph, escrow ABI, terms hash, and wire messages remain
unchanged. This document describes the implementation and its verification
boundaries; it is not a release qualification.

## What resumption means

A complete original seller offer and buyer acceptance can be restored from this
profile's encrypted history and verified again. Both parties must already have
been durably admitted under exactly the same terms, accounts, messaging keys,
roles, and acceptance deadlines. The restored trade retains its terms hash and
trade ID. The action does not ask either party to sign, publish a message, prepare
a transaction, or send one.

The existing D1 binding has no renewal nonce or signing epoch. Rechecking an
unchanged agreement therefore does **not** prove a fresh peer approval after
restart. A fresh-profile backup restore preserves the messaging identity while
changing the vault profile and encryption keys, as specified by
[G03 backup recovery](../../05_ADVANCED_PRIVACY_INFRASTRUCTURE/feature_5.7_local_data_isolation/module_5.7.2_indexeddb_vault/spec-encrypted-backup-recovery.md).
Actual messaging-key rotation still requires new terms and a new seller nonce.
Local history cannot reveal a cancellation or transaction occurring after an
older backup was created.

## Encrypted recovery evidence

`TermsExchange.checkpoint` exports only a fully admitted D1 session. The bounded
version 1 checkpoint contains the original session context and two authenticated
NIP-59 gift wraps: the local sender's self-wrap and the received counterparty
wrap. Wallet signatures stay inside ciphertext. The app stores that checkpoint
in a separate encrypted preference record, using the strict
`p2p-offramp/localnet-exchange-history/v1` wrapper. Existing private trade and D9
intent records keep their current formats.

The exchange snapshots and validates every checkpoint before asynchronous work.
Restoration authenticates both wraps, checks their original admission times,
sender/recipient, offer/accept roles, revision, terms bytes, advertisement scope,
and messaging identities. It requires the durable replay ledger to already
contain **both** role bindings. Fresh verification may only re-admit identical
bindings as duplicates; it cannot manufacture a missing role from stored terms.
Current tombstones and the retirement high-water mark remain authoritative.
Reordered history is canonicalized seller first; duplicate, conflicting, or
incomplete history is rejected.

The original envelope and advertisement can have expired after successful
bilateral admission. Current verification still enforces the signed
`min(acceptBeforeSeconds, notAfterSeconds)` deadline, current wallet policy,
registry, network, canonical block, and freshness checks. Funding additionally
requires the existing 120-second D1 margin and the native escrow funding window.
Seller-only history does not qualify for a checkpoint and remains subject to its
original advertisement-expiry tombstone.

## Explicit app boundary

Unlock and backup restore load saved terms for display and chain reconciliation.
They do not reconnect a wallet or create a review. Relay redelivery and wallet
reconnection do not authorize a restored trade to spend. The document can request
only `{type: 'trade.resume', tradeId}`; it cannot supply a checkpoint, signatures,
wallet request, account, or deadline.

The user connects the account named for their role and chooses **Recheck and
resume saved trade**. The Worker reconciles the journal, validates current chain
state, requires the escrow to be absent, and refuses any unresolved intent for
that trade. It then verifies the encrypted checkpoint against the saved terms
and current identity, rechecks funding acceptance, and marks this in-memory
session ready. A lock, profile change, wallet change during recovery, concurrent
vault conflict, or failed recheck prevents a late result from granting authority.

Each subsequent allowance or funding action still requires a fresh review and
its own wallet confirmation. Both preparation and the durable send-marker
boundary recheck the original acceptance and native state. Resumption never
changes a D9 marker, clears an imported nonce hold, or treats a null marker from
another profile as never-sent proof. Funded release/refund remains independent
of acceptance recovery, including when a checkpoint is missing or corrupted.

Older backups without complete ciphertext evidence and interrupted negotiations
stay held. The UI directs the user to reconnect the correct wallet/network,
refresh unresolved transaction recovery, or start a new negotiation from Local
offers when the original agreement cannot be resumed. No required backend or
relay availability is added to proof verification itself.

## Verification scope

| Boundary | Regression |
|---|---|
| Complete proof, both roles, expired envelope, duplicate/reordered delivery, invalid context, missing ledger role, tombstone, cancellation and concurrent session | `packages/exchange/test/peer-acceptance.test.mjs` checkpoint cases |
| Real encryption, real wallet signatures, same-profile reopen and fresh-profile restore, explicit command, wrong wallet/network, changed peer code, expired agreement, corrupted evidence, imported D9 hold, lock during recovery | `apps/web/test/localnet-resumption.test.mjs` using the real vault/backup/controller with in-memory transport and RPC |
| Actual document, Worker, IndexedDB and built artifact; unchanged restored trade is unfundable until explicit resume, then fresh review/cancel/confirm and native escrow exit | `scripts/test-localnet-browser.mjs` |

The controller suite does not establish browser, real-chain, or external-wallet
behavior. The browser script is part of the existing hosted localnet gate and
must pass for the exact publication head. A sandbox Chromium launch restriction
is not a passing browser result. Independent review and the repository's exact
head CI/security gates remain required before merge.
