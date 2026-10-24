# Content-addressed signed release manifest

## 1. Metadata and status

Owner: p2p-offramp maintainers; security reviewer approves security gates.

Version: 1.0 design baseline, 2026-10-22.

Delivery: M1 / M2C.

Status: substantive design baseline; implementation, interoperability evidence and independent review pending. This document does not certify a deployed or audited product. DEVELOPMENT_ROADMAP.md controls milestone order.

## 2. Objective and scope

Provide a verifiable mapping from reviewed source to static assets and deployments. A digest proves identity of bytes relative to a trusted expectation; it does not make the code safe. This is the common G15 signing profile for all distribution/runbook specifications.

## 3. Architecture and data contracts

Manifest v1: `{format:"p2p-offramp-release",version:1,channel,sequence,releaseId,sourceCommit,buildRecipeDigest,lockfileDigest,sbomDigest,createdAt,expiresAt,minStorageSchema,maxStorageSchema,assets,deployments,predecessorDigest}`. sequence is an integer 1..2^53-1; created/expires are UTC seconds integers; expiry is at most 30 days from creation. assets is sorted by normalized relative path and each item is `{path,bytes,sha256}`; no absolute paths, dot segments, symlinks, duplicate/case-colliding paths or query strings. Limits: 10,000 assets, 256 MiB total bundle, 1 MiB manifest. deployments bind chain identity, contract/program address, code digest and immutable/upgrade authority facts. Personal data, credentials, private RPC tokens and trade artifacts are prohibited.

## 4. Algorithms and lifecycle

Release signatures use ECDSA P-256 with SHA-256 through WebCrypto, 64-byte IEEE-P1363 big-endian r||s signatures encoded unpadded base64url (not ASN.1 DER). Public keys are JWK `{kty:"EC",crv:"P-256",x,y,key_ops:["verify"],ext:true}` with exactly 32-byte coordinates. No private key appears in client assets or build environment. RFC 8785 canonical UTF-8 manifest bytes, excluding the detached signature envelope, are prefixed with `p2p-offramp/release/v1\n` and signed. Reject unknown algorithms, malformed lengths, duplicate fields and noncanonical representations. The keyId is SHA-256 of canonical `{crv,kty,x,y}`; trust comes from an independently verified key fingerprint, not from a key delivered beside an untrusted signature. First hash final assets, then construct/sign manifest, then package manifest/signature beside assets. A distribution CID is external because embedding a directory's own CID would be circular. A signed ReleaseLocator binds manifest digest to CID/package digest in a second domain `p2p-offramp/release-locator/v1\n`; locator uses the same key/signature encoding. Its canonical signed payload is `{v:1,channel,sequence,manifestSha256,cid,archiveSha256,createdAt,expiresAt}`; channel/sequence/timestamps must exactly match the manifest, CID must parse as CIDv1, and archiveSha256 covers the optional downloadable archive (null when absent). A locator envelope `{keyId,alg:"ES256-P1363",signature}` is detached from that payload. The textual `\n` in signature domain descriptions denotes one byte 0x0a, not backslash plus n. Require signature r and s in the valid P-256 scalar range; do not use signature bytes as release identity, because ECDSA signature representations can be malleable. Release identity is the signed manifest digest. Verify manifest signature, asset path set, byte lengths and hashes before treating a downloaded package as authenticated. No unlisted executable asset is permitted.

## 5. Interfaces and integration

Detached envelope: `{v:1,keyId,alg:"ES256-P1363",manifestSha256,signature}`. `verifyRelease(bytes,envelope,trustedKeys,highestSequence)` returns verified metadata or a typed rejection; verification never imports a supplied public key as trusted. Historical releases retain immutable identifiers. Rotation requires a signed trust transition from an already trusted key plus out-of-band announcement; suspected key compromise requires independent re-bootstrap.

## 6. Errors, abuse and residual threats

SIGNATURE_INVALID, KEY_UNTRUSTED, MANIFEST_EXPIRED, RELEASE_ROLLBACK, ASSET_MISMATCH and MANIFEST_UNSUPPORTED fail closed for installation. Existing recovery documentation remains available. Locally stored maximum sequence helps only on that origin/profile; fresh origins, cleared storage and wrong device clocks weaken rollback/expiry checks. A hostile host can replace both verifier JavaScript and embedded public keys: browser self-checks alone do not authenticate the initial application.

## 7. Verification and primary references

Cross-verify fixed signature fixtures in browser WebCrypto and an independent signer/verifier, including DER rejection, wrong prefix, one-byte mutation, wrong key, reordered fields, duplicate paths and oversized manifest. Verify full archive asset inventory in clean environments. Publish independent fingerprint/bootstrap instructions and explicit fresh-origin limitations. Review/signing-key custody and implementation remain pending gates.

Primary references (exact implementation revisions must be pinned in the evidence record): [Web Cryptography API](https://www.w3.org/TR/WebCryptoAPI/); [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785); [RFC 7518 §3.4](https://www.rfc-editor.org/rfc/rfc7518#section-3.4).
