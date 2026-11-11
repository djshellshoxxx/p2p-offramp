//! Fixed protocol constants. Changing any value here changes the on-chain authority profile and
//! requires a new program, never an upgrade of a deployed one.

/// Escrow PDA seeds: `[ESCROW_SEED, seller, seller_nonce]` with the canonical bump.
pub const ESCROW_SEED: &[u8] = b"p2p-offramp-escrow-v1";
/// SPL vault token-account PDA seeds: `[VAULT_SEED, escrow]` with the canonical bump.
pub const VAULT_SEED: &[u8] = b"p2p-offramp-vault-v1";

/// G16 Solana terms prefix; the encoded message appends one zero byte after it.
pub const TERMS_PREFIX: &[u8] = b"p2p-offramp/solana/basic/v1";
/// G16 terms format version byte (`v u8 = 1`).
pub const TERMS_VERSION: u8 = 1;
/// G16 settlement mode byte; only the basic manual-settlement mode (0) exists.
pub const TERMS_MODE_BASIC: u8 = 0;

/// Funding requires `MIN_DURATION_SECONDS <= deadline - now <= MAX_DURATION_SECONDS` (DeadlinePolicyV1).
pub const MIN_DURATION_SECONDS: u64 = 1800;
pub const MAX_DURATION_SECONDS: u64 = 604_800;

/// `EscrowV1.layout_version` for every account written by this program.
pub const LAYOUT_VERSION: u8 = 1;
/// G16 asset kinds. Kind 1 is reserved by the terms format and refused here.
pub const ASSET_KIND_NATIVE: u8 = 0;
pub const ASSET_KIND_SPL: u8 = 2;

/// Upper bound of the compiled-in mint allowlist (matches the EVM contract's MAX_ALLOWLIST).
pub const MAX_MINT_ALLOWLIST: usize = 32;
