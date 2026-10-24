# Local identity and cryptographic provenance checkpoint

G01 local messaging identity is test-enabled by explicit provider injection only. Default provider is
unsupported. No public signing/decrypting/spending interface, transport, wallet signing/submission or
release capability is enabled. ReleaseEnabled stays 0. Keys are independent CSPRNG-generated scalars,
not derived from vault/passphrase/wallet material. Encrypted private records stay inside G02.

Root pinned @noble/curves 2.4.0 and transitive @noble/hashes 2.4.0, installed with scripts disabled.
Exact source commits and lockfile integrities are recorded in security/crypto-inventory.json; both MIT
licenses have identical SHA256 4f221aee6e072336700c408c68ab3b96a3fc09f6aebe6f48f1bd99e5ef13faec and
the full text is retained in packages/identity/test/fixtures/noble-MIT-LICENSE.txt.
NIP-01 inspected source commit d47a2ec8aacb9d01ac00e6294ae77582f483ff68, observed source SHA256
d5c5ce2b5639eee440b5d342dbe81af42008838cb260ec04acaffaffd29dcaf7; no Nostr wire adapter is implemented.

The pinned official BIP340 CSV SHA256 is
34c9d1d9c3a88d524bc80778540dc43f8306ec249a7485293063c376db851c2d.
All 19 verification rows run unfiltered; all eight rows containing secret/public known answers are
checked against public-key derivation. Invalid zero/order/out-of-range scalar cases reject. These are
primitive diagnostics, not a release-provider approval or proof of all BIP340 edge conformance. Noble's
source comments describe stricter zero-s verification; the official CSV has no valid zero-s example.
Earlier concern was static inspection, not an observed vector failure; no tests/options were filtered.

G01 tests cover encrypted create/unlock/retire, exact opaque handles, scope/session/revision cancellation,
scalar wiping, commit-winning locked references, collision with nonidentity records, duplicate decoded
JSON rejection, unsupported default provider and idle/pagehide behavior. Peer reproduced and independently
verified the retirement-versus-late-unlock fix. Restored old-profile identities remain historical and fail
selection until an explicit consumer migration exists.

G06 inventory is a partial public metadata artifact: every review is pending. The full deterministic
verifyCryptoInventory gate, source/maintenance/side-channel review, two-clean-build comparison and broader
browser matrix remain unimplemented/unassessed. No accepted review or production badge is claimed.
The existing independent Python cryptography fixture was freshly verified on 2026-10-24. Production npm
audit reports zero advisories at this run, which is neither a complete security audit nor future assurance.
