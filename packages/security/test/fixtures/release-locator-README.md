# Synthetic locator vector

`release-locator-openssl.json` retains only synthetic public data: an ephemeral
P-256 public JWK, public assets/manifest/archive bytes and detached signatures.
The corresponding private key was generated inside Node and was not exported.
Node `crypto.sign` (OpenSSL, versions recorded in the vector) signed the exact
canonical UTF-8 bytes with SHA-256 and IEEE-P1363 signatures. Wrong-domain and DER
controls use that same ephemeral key. Node WebCrypto and native Chromium document
and dedicated Worker verification consume this fixed corpus. Agreement is test
evidence, not independent professional cryptographic approval.

The CID strings were independently generated with Python stdlib
`base64.b32encode(bytes([1, codec, 0x12, 32]) + hashlib.sha256(b'p2p-offramp synthetic locator').digest())`,
lowercased with padding removed and multibase prefix `b`. Codec is `0x55` (raw) or
`0x70` (dag-pb). The verifier intentionally supports only canonical lowercase
base32 CIDv1 with those codecs and a 32-byte SHA-256 multihash; all other profiles
remain unsupported. It does not recompute an IPFS DAG or fetch CID content.

Archive verification checks only the supplied raw-byte SHA-256. The synthetic
archive is not an extractable package. No installer, archive parser, network,
production root or funds-enabled release is provided by this fixture.
