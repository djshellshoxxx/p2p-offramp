# Blue-team deep pass — sensitive components — 2026-11-15

## Scope and disposition

Reviewed targeted source on `integration/p2p-consolidated-20261109`: wallet adapter and test-only EVM executor, EIP-712 terms, encrypted intent journal/lifecycle, exchange envelope parser, relay pool, NIP-01/NIP-44/NIP-59, encrypted vault service/crypto, crypto inventory, canonical escrow contract/security notes, operator guide and browser support profile.

**Disposition: keep real-funds and production release disabled.** The operator guide explicitly keeps `ReleaseEnabled=0` and `connectOrigins=[]`; sensitive execution modules are documented as test-only/not bundled. These are meaningful containment controls.

This is source inspection only. No tests, fuzzers, static analyzers, local EVM, browser automation or testnet transactions were run. No code was changed.

## New findings

### BT-09 — P1 release blocker: cryptographic primitive inventory has pending reviews

**Evidence**
- `security/crypto-inventory.json` marks native vault PBKDF2-HMAC-SHA256 and AES-256-GCM entries as `pending`, with no reviewer/evidence path.
- The same inventory marks Nostr messaging primitive/dependency entries (Noble curves, hashes and ciphers used for BIP340, ECDH, HKDF/HMAC and ChaCha20) as pending.
- `packages/nostr-crypto/src/provider.ts` describes the local Noble provider as test-only and says its G06 review is pending.
- `packages/storage/src/vault-crypto.ts` implements PBKDF2 at 600,000 iterations and AES-256-GCM with AAD binding and temporary-buffer wiping; these are good code-level controls but do not replace independent review.
- `security/browser-support.json` qualifies Chromium/Linux local automation only; Firefox, WebKit, mobile, physical devices and browser/OS side channels are unassessed.

**Impact**
The vault protects identity, chat and transaction-journal data; messaging cryptography protects peer communications and identity. A weakness in KDF integration, nonce lifecycle, ECDH, authenticated encryption, key handling or browser implementation could expose private data or undermine identity assurance. Pinned dependencies and known-answer tests are not independent cryptographic certification.

**Remediation**
1. Complete independent reviews for each production-intended primitive and its integration. Record reviewer, exact commit, evidence path and accepted limitations.
2. Verify dependency source/tag correspondence, lockfile integrity, exact package hashes and transitive dependency provenance.
3. Review vault nonce uniqueness across revisions, concurrent tabs, crash/retry, reseal/migration and restore. Preserve the per-handle encryption-attempt limit and fresh-key migration behavior.
4. Review passphrase normalization, KDF parameters, authentication failure behavior, memory lifetime and copies of secret material. Document that JavaScript zeroization cannot guarantee erasure of engine/runtime copies.
5. Qualify supported browsers/devices before calling the vault production-ready; unsupported environments must fail closed.

### BT-10 — P1 deployment blocker: escrow token allowlist safety depends on off-chain review

**Evidence**
- `contracts/evm/src/BasicEscrow.sol` fixes the token allowlist permanently in the constructor; it checks code presence, uniqueness and maximum length.
- Funding checks exact balance delta, which rejects fee-on-transfer behavior at funding time.
- `contracts/evm/SECURITY-NOTES.md` explicitly excludes rebasing/elastic-supply, hook-calling, upgradeable-with-unreviewed behavior, gas-griefing and escrow-freezing tokens. It states the contract cannot enforce these token behavior rules and requires a per-token review record for each network.
- The contract has no owner or allowlist setter, so an unsafe constructor selection cannot be corrected in place.

**Impact**
A token can change behavior after deployment, rebase after funding, invoke callbacks, blacklist the escrow or consume excessive gas. Exact balance-delta checks do not protect against all post-funding behavior. An unsafe allowlist is an irreversible deployment-level decision.

**Remediation**
1. Treat every token address as a separately approved deployment dependency, not as a generic ERC-20.
2. Require a signed per-network token review covering implementation/code hash, proxy/upgrade authority, transfer semantics, rebasing, hooks, blacklist/freeze, return behavior and gas bounds.
3. Reject upgradeable tokens unless upgrade authority and change monitoring are explicitly accepted.
4. Pin token code identity and revalidate it during deployment qualification and monitoring; alert on relevant implementation changes.
5. Keep the allowlist minimal. If token behavior cannot be demonstrated and monitored, do not include it.

### BT-11 — P1 protocol boundary: buyer acceptance is not enforced by the escrow contract

**Evidence**
- `contracts/evm/SECURITY-NOTES.md` says there is no on-chain signature verification and buyer acceptance is checked by the seller client.
- `packages/exchange/src/messages.ts` defines `terms-accept` as a revision-only body; parsing validates shape, not cryptographic wallet authorization.
- `docs/integration/mvp-gap-closure.md` records G2/D1 as blocked on a versioned `PeerAcceptance` schema, two-implementation vectors and independent review.
- `packages/wallet/src/evm-adapter.ts` signs EIP-712 public terms for the connected account, but the separate D1 protocol is needed to prove counterparty acceptance of those exact terms.

**Impact**
The contract enforces seller funding/release authority and fixed beneficiaries, but does not independently prove buyer acceptance. A revision-only encrypted chat message is not cryptographic authorization. The seller client must not infer buyer consent from message delivery, relay ACK, sender field or revision number.

**Remediation**
1. Complete D1 as a versioned signed acceptance bound to the exact terms digest, chain ID, deployment, trade ID, buyer wallet, messaging identity, role, nonce and expiry.
2. Verify acceptance against the buyer wallet and authenticated messaging identity binding; reject mismatches and replay.
3. Require the verified acceptance object in seller funding preflight, not a parsed `terms-accept` envelope.
4. Add cross-trade/chain, role-confusion, altered-terms, stale-revision, replay, expiry and mismatched-messaging-key vectors.
5. State clearly that even after client verification the current contract does not enforce buyer acceptance on-chain.

### BT-12 — P1 operational blocker: no per-token monitoring/response control is evidenced

**Evidence**
- Contract security notes identify issuer blacklisting and token behavior changes as residual risks and require per-token review.
- The operator guide says no production deployment is approved.
- The allowlist is immutable, so a token behavior change cannot be remediated by changing the escrow allowlist.

**Impact**
A previously acceptable token may later blacklist the escrow/recipient or otherwise make transfer impossible. Push-then-credit preserves the beneficiary and permits later withdrawal, but cannot guarantee the issuer will permit withdrawal or that asset value remains stable.

**Remediation**
Assign monitoring ownership per token/network; monitor proxy implementation and issuer notices; define stop-new-funding and user-notification procedures; surface deferred credits as unresolved liabilities, not successful transfers.

### BT-13 — P2 vault qualification gap: browser/device assumptions remain unassessed

**Evidence**
`security/browser-support.json` reports Chromium/Linux local automation only and explicitly lists Firefox, WebKit, mobile browsers, physical devices and browser/OS side channels as unassessed.

**Impact**
WebCrypto, IndexedDB, workers, background-tab and lifecycle behavior can vary across engines/devices. Chromium automation does not establish behavior during lock, restore, storage eviction, tab duplication, versionchange, sleep/resume or interrupted reseal on other platforms.

**Remediation**
Declare a supported browser/device matrix; add repeatable cross-engine and mobile qualification for multi-tab locking, worker termination, IndexedDB versionchange, quota/eviction, sleep/resume and interrupted reseal; document compromised-endpoint limitations; fail closed where required invariants cannot be demonstrated.

## Sensitive controls inspected and retained

- **Wallet:** typed-data signing only; account and chain rechecked before prompt; caller-owned terms snapshotted; returned EOA signature verified locally; no downgrade to `personal_sign`/`eth_sign`. This adapter is test-only/not bundled. D1 remains a separate gap.
- **Transaction execution/journal:** canonical request validation, account/chain checks, durable send-start marker before the one send, conservative broadcast-unknown state, revision checks and chain-evidence reconciliation. Do not bypass the journal or canonical validator in future UI composition.
- **Relay/messaging:** untrusted relay input, signature/filter checks, bounded sockets/subscriptions/publications, broker-bound relay URL, no automatic publish retry; NIP-59 verifies layers and author/recipient binding; NIP-44 authenticates before decrypting. None of this proves wallet acceptance or transaction authority.
- **Escrow:** seller-only release before deadline, permissionless refund to stored seller after deadline, reentrancy guard, checks-effects-interactions, bounded native push, deferred fixed-beneficiary credits, no admin/proxy/sweep. Token allowlist and off-chain buyer-acceptance assumptions remain material.

## Required next gates

1. Independent cryptographic review/provenance for vault and Nostr primitives.
2. Complete D1 peer acceptance and require verified buyer acceptance before seller funding.
3. Complete canonical EVM reader/ABI layout and independently test the exact deployment.
4. Approve token addresses individually with immutable deployment evidence and monitoring ownership.
5. Qualify browser/device matrix for vault and sensitive flows.
6. Independent contract audit and exact-head hosted CI/security qualification.
7. Keep release disabled, default origins empty and test-only execution modules out of the default artifact until gates are accepted.

## Limits

This is a targeted source-informed defensive review, not a formal cryptographic or smart-contract audit, penetration test or production qualification. I inspected selected sensitive files and repository evidence; I did not execute tests or exercise a live deployment. This does not prove safety of external wallets, browsers, RPC providers, relays, token issuers or deployment keys.
