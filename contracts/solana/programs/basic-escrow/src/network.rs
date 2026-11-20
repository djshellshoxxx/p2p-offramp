//! Compile-time network profile. Solana exposes no genesis-hash sysvar, so the program binds the
//! G16 terms to a compiled genesis constant (spec-signed-trade-terms.md). The mint allowlist is also
//! compiled in: a first-caller initializer would be an operator (D5).
//!
//! `localnet` is synthetic. The separate opt-in `browser-localnet` fixture compiles the actual genesis
//! of its already running disposable validator and permits native SOL only. No public-network profile exists.

use anchor_lang::prelude::Pubkey;

#[cfg(not(any(feature = "localnet", feature = "browser-localnet")))]
compile_error!("select an explicit local test profile; no production network profile is defined");
#[cfg(all(feature = "localnet", feature = "browser-localnet"))]
compile_error!("local test profiles are mutually exclusive");

/// One allowlisted mint with the decimals the program requires at funding and payout.
pub struct AllowedMint {
    pub mint: Pubkey,
    pub decimals: u8,
}

#[cfg(feature = "localnet")]
mod profile {
    use super::{AllowedMint, Pubkey};

    /// Synthetic test genesis: ASCII `genesis-hash:p2p-offramp:localv1`. Never a real cluster hash.
    pub const GENESIS_HASH: [u8; 32] = *b"genesis-hash:p2p-offramp:localv1";

    /// Synthetic test mints, preloaded by test harnesses at these fixed addresses.
    pub const TEST_MINT_OPEN: Pubkey = Pubkey::new_from_array(*b"mint-6dp-open:p2p-offramp:local1");
    pub const TEST_MINT_FREEZABLE: Pubkey = Pubkey::new_from_array(*b"freezable-mint-6dp:p2p-offramp:1");

    pub const MINT_ALLOWLIST: &[AllowedMint] =
        &[AllowedMint { mint: TEST_MINT_OPEN, decimals: 6 }, AllowedMint { mint: TEST_MINT_FREEZABLE, decimals: 6 }];
}

#[cfg(feature = "browser-localnet")]
mod profile {
    use super::AllowedMint;
    // Generated solely by the explicitly enabled fixture build script. RPC answers are never rewritten.
    include!(concat!(env!("OUT_DIR"), "/browser_genesis.rs"));
    pub const MINT_ALLOWLIST: &[AllowedMint] = &[];
}

pub use profile::*;

const _: () = assert!(MINT_ALLOWLIST.len() <= crate::constants::MAX_MINT_ALLOWLIST);

/// Wrapped-SOL mints of the original SPL Token and Token-2022 programs; refused in v1 (D5).
pub const WRAPPED_SOL_MINTS: [Pubkey; 2] = [
    anchor_lang::pubkey!("So11111111111111111111111111111111111111112"),
    anchor_lang::pubkey!("9pan9bMn5HatX4EJdBwg9VgCa7Uz5HL8N1m5D3NdXejP"),
];

/// Returns the required decimals for an allowlisted mint, or `None` when the mint is not allowed.
pub fn allowed_decimals(mint: &Pubkey) -> Option<u8> {
    if WRAPPED_SOL_MINTS.contains(mint) {
        return None;
    }
    MINT_ALLOWLIST.iter().find(|entry| entry.mint == *mint).map(|entry| entry.decimals)
}
