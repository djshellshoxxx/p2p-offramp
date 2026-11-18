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
