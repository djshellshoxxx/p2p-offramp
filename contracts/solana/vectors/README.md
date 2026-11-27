# Solana independent vectors

Second, SDK-free implementation of Solana PDA derivation and Anchor discriminators.
Written without reference to the Rust program, so a Rust test can cross-check it.

- `derive.mjs` - generator (base58, createProgramAddress, findProgramAddress, ATA, discriminators)
- `solana-independent.json` - committed fixture (`p2p-offramp/solana-independent-vectors/v1`)
- `derive.test.mjs` - node:test suite

## Commands (Node 24, from repo root)

    node contracts/solana/vectors/derive.mjs --write   # regenerate fixture
    node contracts/solana/vectors/derive.mjs --check   # exit 1 if fixture is stale
    node --test contracts/solana/vectors/derive.test.mjs

## Notes

- On-curve test: ed25519 point decompression via `@noble/curves` (strict decoder).
- Canonical bump: highest bump (255 down) whose hash is off-curve.
- ATA and Token program IDs are known constants, not verified on disk
  (`idsSource: known-constant-unverified-on-disk`).
- Deterministic: no randomness, no network. Only `generator.node` varies with Node version.

## Peer-acceptance vectors (B1c)

Independent Python implementation of the Solana peer-acceptance formats in
[`packages/chain-solana/docs/acceptance.md`](../../../packages/chain-solana/docs/acceptance.md), written from that
document and not from the TypeScript source. It signs with OpenSSL Ed25519 through `cryptography` and checks every
expected outcome with its own strict decoder, verifier and replay-ledger model before it writes the fixture.

- `acceptance.py` - generator and independent implementation (`--write`, `--check [FIXTURE]`, `--agave-cli PATH`)
- `peer-acceptance-v1.json` - frozen fixture (`p2p-offramp/solana/peer-acceptance-vectors/v1`): 4 positive,
  4 variant, 51 negative, 33 decoding vectors and 10 ledger scenarios
- Generator: CPython 3.12 with `cryptography` 50.0.0 (hash-pinned in `scripts/tests/requirements-crypto.txt`)
- Fixture SHA-256: `8b776c4db27cce657111aa625450da6f7112474d180627f4eec3321d248d1742`

Every wallet and messaging key is derived from a public label: **TEST-ONLY synthetic data, never for funds.**
Genesis, program and mint are the synthetic `localnet` values; `otherv1`/`other` variants are synthetic too.

    /opt/tools/venv-oracle/bin/python -I contracts/solana/vectors/acceptance.py --check   # exit 1 if stale
    /opt/tools/venv-oracle/bin/python -I contracts/solana/vectors/acceptance.py --write   # regenerate, then update the hash
    /opt/tools/venv-oracle/bin/python -I contracts/solana/vectors/acceptance.py --agave-cli /opt/tools/solana-release/bin/solana

`packages/chain-solana/test/acceptance-vectors.test.mjs` (in `npm test`) reproduces the fixture byte for byte in
TypeScript; `scripts/tests/test_solana_peer_acceptance_vectors.py` (in `npm run test:specs`) reruns the check. The
optional `--agave-cli` step confirms that Agave 4.1.2's `solana sign-offchain-message` produces exactly the
`offchain-v0-agave-cli` negative signature (checked locally on 2026-11-18; not run in CI).
