# Pending owner and security decisions

This is a sanitized proposed decision packet, not acceptance or authorization.
All reviewer identities are absent; independent review remains pending. No ABI,
manifest verifier, deployment, supported version or release flag changes here.

## G16 acceptance versus deployed ABI

The canonical `contracts/evm/src/BasicEscrow.sol` deliberately treats counterparty
acceptance as off-chain consent; its ABI does not take or verify the two G16
acceptance signatures. G16 signature language must be reconciled against that
actual contract before any claim of on-chain acceptance verification. Preserve
existing ABI and funded exits. Choose explicitly whether the existing off-chain
consent model is the intended protocol, or whether a separately deployed future
immutable version must verify signatures. Do not silently substitute the isolated
experimental escrow implementation or add signature arguments to old calls.
Review needs exact threat/authority changes, independent vectors and updated
old/new-client tests. No production contract revision or signature policy is chosen.

## G14 capability commitments in G16

G14 negotiation reports module/protocolVersion/capability/schema sets; G16 commits
capability id/version/policyHash entries. The exact mapping and canonical policyHash
preimage are not selected by those different data shapes alone. Freeze the mapping,
unknown-required behavior, version negotiation and independently reproduced vectors
before declaring an optional module's negotiated set bound to signed terms.
Core-only exits and already-funded terms must remain available without extensions.

## G15 trust rotation, nonempty deployments and archives

Actual signer/key rotation, threshold/revocation policy, registry approval of
nonempty deployment sets, and archival recovery-artifact retention need selected
maintainer/security policy. Existing local manifest validation is not permission to
invent that policy. Require an independently trusted predecessor/recovery path;
never accept a replacement key merely because it came from the compromised host.
Select exact immutable deployment/runtime identities and approved assets. Archive
whole compatible artifacts and config/ABI metadata for old funded exits; record
owners and retention/recovery expectations. Empty local registries and fixture keys
do not approve production. No alternate manifest or acceptance evaluator is added.

## Solana program and token profile

Select the exact PDA seeds and derivations, account ownership and serialization
layout, instruction/account discriminators, IDL revision/hash, supported token
program/mint policies, token extensions and native finality/history semantics.
Cross-check independently against the actual program. Generic Solana encodings or
an illustrative specification cannot establish that interoperability. No unknown
program or token profile may be inferred as supported. Preserve existing EVM exits;
Solana remains unqualified until the complete selected profile and tests exist.

## QR payload, signature and codec

Choose exact QR envelope fields, source/type/version semantics, signature authority
and domain, payload codec and canonical bytes, segment/error correction and maximum
size, expiry/replay policy and failure UX before interoperable import/export.
Specify whether a QR is a public reference, ciphertext, signed terms or merely
transport text. Never imply payment, chain or release authority from a decoded QR.
No scanning SDK, arbitrary URL fetch, signing fallback or alternate unreviewed
encoding is selected by these proposed records.

## Rollback and review

Each proposal needs named accountable owner and independent security/release
review, actual before/after examples, test artifacts, compatible reader/writer sets
and artifact hashes before implementation/release acceptance. These packet records
assert none. Existing authenticated source profiles must be retained during fresh-key
recovery; no downgrade write, forced migration or changed refund destination is
permitted. Existing manifest/acceptance gates remain authoritative.

## Peer EOA acceptance carrier (production blocked)

The existing NIP-17 kind-14 `terms-accept` body is exactly `{revision}`: authenticated
communication only. The private `verifyEvmAgreementBundle` worker input contains
`privateAgreement`, `domain`, `terms` and two `{termsHash,role,walletAccount,signature}`
acceptances; that private verifier protocol is not an interoperable peer carrier.
Do not extend the existing wire shape or pass signatures through arbitrary chat
text to create economic authority. Select an exact version/discriminator, content
and tag schema, signature/domain profile (including EOA versus EIP-1271), sender,
role and messaging-identity-to-wallet binding, trade/revision binding, size/errors,
expiry, duplicate/conflict/replay handling and cross-client compatibility before
production remote acceptance. T43 is only a defined local proof composition using
trusted native two-wallet acceptance; it does not approve a production peer profile.
