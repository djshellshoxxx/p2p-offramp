use anchor_lang::prelude::*;

/// Escrow lifecycle. `Released` and `Refunded` are terminal; principal moves only in `payout_*`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum EscrowState {
    Funded,
    Released,
    Refunded,
}

/// One funded trade. The account is created once per `(seller, seller_nonce)` and never closed in v1,
/// so neither the nonce nor the trade id (`terms_hash`) can be funded twice.
#[account]
#[derive(InitSpace, Debug)]
pub struct EscrowV1 {
    pub layout_version: u8,
    /// Canonical escrow PDA bump, re-verified by every instruction's seeds constraint.
    pub escrow_bump: u8,
    /// Canonical vault PDA bump for SPL escrows; zero and unused for native escrows.
    pub vault_bump: u8,
    pub state: EscrowState,
    pub paid_out: bool,
    pub asset_kind: u8,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    /// All-zero for native escrows.
    pub mint: Pubkey,
    /// All-zero for native escrows.
    pub token_program: Pubkey,
    /// Exact principal in base units, recorded separately from rent and any donated surplus.
    pub amount: u64,
    /// Unix seconds; release requires `now < deadline`, refund requires `now >= deadline`.
    pub deadline: u64,
    /// SHA-256 of the G16 terms bytes rebuilt on chain; the trade id.
    pub terms_hash: [u8; 32],
    pub seller_nonce: [u8; 32],
}

impl EscrowV1 {
    /// The party a terminal state pays: the buyer after release, the seller after refund.
    pub fn recipient(&self) -> Option<Pubkey> {
        match self.state {
            EscrowState::Released => Some(self.buyer),
            EscrowState::Refunded => Some(self.seller),
            EscrowState::Funded => None,
        }
    }
}

#[event]
pub struct Funded {
    pub escrow: Pubkey,
    pub terms_hash: [u8; 32],
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub asset_kind: u8,
    pub mint: Pubkey,
    pub amount: u64,
    pub deadline: u64,
}

#[event]
pub struct Released {
    pub escrow: Pubkey,
    pub terms_hash: [u8; 32],
}

#[event]
pub struct Refunded {
    pub escrow: Pubkey,
    pub terms_hash: [u8; 32],
}

#[event]
pub struct PaidOut {
    pub escrow: Pubkey,
    pub terms_hash: [u8; 32],
    pub recipient: Pubkey,
    pub amount: u64,
}
