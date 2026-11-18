//! On-chain rebuild of the G16 Solana terms message. Layout (spec-signed-trade-terms.md):
//! ASCII prefix, zero byte, genesis hash, program ID, order ID, seller, buyer, mint (zero for native),
//! token program (zero for native), privateAgreementHash, capabilitiesHash, sellerNonce, v u8 = 1,
//! revision u64 LE, assetKind u8, principal u64 LE, acceptBefore u64 LE, expiry u64 LE, mode u8 = 0.
//! `termsHash` is SHA-256 of these exact bytes and is the trade id stored in the escrow.

use crate::constants::{TERMS_MODE_BASIC, TERMS_PREFIX, TERMS_VERSION};
use anchor_lang::prelude::Pubkey;

/// Encoded length: 28-byte prefix with terminator, ten 32-byte fields and 35 bytes of scalars.
pub const TERMS_LEN: usize = TERMS_PREFIX.len() + 1 + 10 * 32 + 1 + 8 + 1 + 8 + 8 + 8 + 1;

/// Every field the terms commit to. Keys and hashes are raw 32-byte values.
pub struct TermsFields<'a> {
    pub genesis_hash: &'a [u8; 32],
    pub program_id: &'a Pubkey,
    pub order_id: &'a [u8; 32],
    pub seller: &'a Pubkey,
    pub buyer: &'a Pubkey,
    pub mint: &'a Pubkey,
    pub token_program: &'a Pubkey,
    pub private_agreement_hash: &'a [u8; 32],
    pub capabilities_hash: &'a [u8; 32],
    pub seller_nonce: &'a [u8; 32],
    pub revision: u64,
    pub asset_kind: u8,
    pub amount: u64,
    pub accept_before: u64,
    pub expiry: u64,
}

/// Writes the canonical G16 bytes. Pure and allocation-free, so host tests can compare vectors.
pub fn terms_bytes(fields: &TermsFields) -> [u8; TERMS_LEN] {
    let mut out = [0u8; TERMS_LEN];
    let mut offset = 0;
    let mut put = |bytes: &[u8]| {
        out[offset..offset + bytes.len()].copy_from_slice(bytes);
        offset += bytes.len();
    };
    put(TERMS_PREFIX);
    put(&[0]);
    put(fields.genesis_hash);
    put(fields.program_id.as_ref());
    put(fields.order_id);
    put(fields.seller.as_ref());
    put(fields.buyer.as_ref());
    put(fields.mint.as_ref());
    put(fields.token_program.as_ref());
    put(fields.private_agreement_hash);
    put(fields.capabilities_hash);
    put(fields.seller_nonce);
    put(&[TERMS_VERSION]);
    put(&fields.revision.to_le_bytes());
    put(&[fields.asset_kind]);
    put(&fields.amount.to_le_bytes());
    put(&fields.accept_before.to_le_bytes());
    put(&fields.expiry.to_le_bytes());
    put(&[TERMS_MODE_BASIC]);
    debug_assert_eq!(offset, TERMS_LEN);
    out
}

/// SHA-256 of the canonical bytes (the `sol_sha256` syscall on chain).
pub fn terms_hash(fields: &TermsFields) -> [u8; 32] {
    solana_sha256_hasher::hashv(&[&terms_bytes(fields)]).to_bytes()
}
