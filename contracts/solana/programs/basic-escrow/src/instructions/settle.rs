//! Terminal decisions. Neither instruction moves funds: `payout_*` pays the stored recipient later, so
//! a recipient that cannot receive (frozen account, empty wallet below rent) cannot block the decision.

use crate::constants::ESCROW_SEED;
use crate::error::EscrowError;
use crate::instructions::fund::chain_now;
use crate::state::{EscrowState, EscrowV1, Refunded, Released};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Release<'info> {
    pub seller: Signer<'info>,
    #[account(
        mut,
        has_one = seller,
        seeds = [ESCROW_SEED, escrow.seller.as_ref(), escrow.seller_nonce.as_ref()],
        bump = escrow.escrow_bump,
    )]
    pub escrow: Account<'info, EscrowV1>,
}

/// Permissionless: any fee payer may submit a refund once the deadline has passed.
#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.seller.as_ref(), escrow.seller_nonce.as_ref()],
        bump = escrow.escrow_bump,
    )]
    pub escrow: Account<'info, EscrowV1>,
}

/// Only the stored seller, strictly before the deadline.
pub fn handle_release(ctx: Context<Release>) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    require!(escrow.state == EscrowState::Funded, EscrowError::InvalidState);
    require!(chain_now()? < escrow.deadline, EscrowError::DeadlinePassed);
    escrow.state = EscrowState::Released;
    emit!(Released { escrow: escrow.key(), terms_hash: escrow.terms_hash });
    Ok(())
}

/// Anyone, at or after the deadline.
pub fn handle_refund(ctx: Context<Refund>) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    require!(escrow.state == EscrowState::Funded, EscrowError::InvalidState);
    require!(chain_now()? >= escrow.deadline, EscrowError::DeadlineNotReached);
    escrow.state = EscrowState::Refunded;
    emit!(Refunded { escrow: escrow.key(), terms_hash: escrow.terms_hash });
    Ok(())
}
