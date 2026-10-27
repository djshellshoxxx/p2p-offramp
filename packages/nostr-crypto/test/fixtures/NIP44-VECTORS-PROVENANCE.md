# NIP-44 v2 official test vectors: provenance and license note

- File: `nip44.vectors.json` (37630 bytes), committed byte-for-byte as downloaded. Nothing was edited or regenerated.
- SHA-256: `269ed0f69e4c192512cc779e78c555090cebc7c785b609e338a62afc3ce25040`. This is the checksum that the
  NIP-44 text publishes for its vectors ([nostr-protocol/nips 44.md](https://github.com/nostr-protocol/nips/blob/master/44.md), "Tests and code").
- Source: `https://raw.githubusercontent.com/paulmillr/nip44/main/nip44.vectors.json`, fetched 2026-10-27. On that
  date `main` was commit `671a1f04bcfacaf125b0db68adc45bc9ce0e763b`, and the file at that commit has the same hash
  (pinned URL: https://github.com/paulmillr/nip44/blob/671a1f04bcfacaf125b0db68adc45bc9ce0e763b/nip44.vectors.json).
- License: the paulmillr/nip44 repository has no root LICENSE file at that commit. Its README marks the TypeScript/JS
  reference "Public domain", copied from nostr-protocol/nips. Its `javascript/package.json` declares MIT. The vectors are
  test data that the protocol specification references normatively. We use them only as test input and do not
  redistribute them in any product artifact. A named license review is still **pending** (G06).
- Scope: these are the original v2 vectors. They treat a plaintext of 65536 bytes as invalid
  (`invalid.encrypt_msg_lengths`). A later amendment to the NIP-44 text adds a 6-byte extended length prefix for
  plaintexts of 65536 bytes or more. This project does not implement that amendment: it supports only plaintexts of
  1..65535 bytes, and it rejects any payload whose first two padded bytes are zero.
- Use: `packages/nostr-crypto/test/nip44.test.mjs` checks this hash, then runs every valid and invalid vector.
