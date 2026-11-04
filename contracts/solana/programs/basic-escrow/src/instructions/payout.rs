//! Permissionless payout of exactly the recorded principal, once, to the party fixed by the terminal
//! state. There is no recipient argument: the destination must match stored state. Rent and donated
//! surplus stay in the accounts (no sweep in v1).

use crate::constants::{ASSET_KIND_NATIVE, ASSET_KIND_SPL, ESCROW_SEED, VAULT_SEED};
use crate::error::EscrowError;
use crate::state::{EscrowV1, PaidOut};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::get_associated_token_address_with_program_id;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

#[derive(Accounts)]
pub struct PayoutNative<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.seller.as_ref(), escrow.seller_nonce.as_ref()],
        bump = escrow.escrow_bump,
        constraint = escrow.asset_kind == ASSET_KIND_NATIVE @ EscrowError::AssetKindMismatch,
    )]
    pub escrow: Account<'info, EscrowV1>,
    /// CHECK: must equal the stored recipient; only lamports are credited to it.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct PayoutSpl<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, escrow.seller.as_ref(), escrow.seller_nonce.as_ref()],
        bump = escrow.escrow_bump,
        constraint = escrow.asset_kind == ASSET_KIND_SPL @ EscrowError::AssetKindMismatch,
    )]
    pub escrow: Account<'info, EscrowV1>,
    #[account(
        mut,
        seeds = [VAULT_SEED, escrow.key().as_ref()],
        bump = escrow.vault_bump,
        token::mint = mint,
        token::authority = escrow,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(address = escrow.mint @ EscrowError::AssetKindMismatch)]
    pub mint: Account<'info, Mint>,
    /// Must be the recipient's canonical associated token account; checked in the handler.
    #[account(mut, token::mint = mint)]
    pub destination: Account<'info, TokenAccount>,
    #[account(address = escrow.token_program @ EscrowError::AssetKindMismatch)]
    pub token_program: Program<'info, Token>,
}

/// Marks the payout taken and returns the stored recipient and principal.
fn take_payout(escrow: &mut EscrowV1) -> Result<(Pubkey, u64)> {
    let recipient = escrow.recipient().ok_or(error!(EscrowError::InvalidState))?;
    require!(!escrow.paid_out, EscrowError::AlreadyPaidOut);
    escrow.paid_out = true;
    Ok((recipient, escrow.amount))
}

pub fn handle_payout_native(ctx: Context<PayoutNative>) -> Result<()> {
    let (recipient, amount) = take_payout(&mut ctx.accounts.escrow)?;
    require!(ctx.accounts.recipient.key() == recipient, EscrowError::WrongRecipient);

    let escrow_info = ctx.accounts.escrow.to_account_info();
    let rent_reserve = Rent::get()?.minimum_balance(escrow_info.data_len());
    let remaining = escrow_info.lamports().checked_sub(amount).ok_or(error!(EscrowError::PrincipalMismatch))?;
    require!(remaining >= rent_reserve, EscrowError::PrincipalMismatch);
    escrow_info.sub_lamports(amount)?;
    ctx.accounts.recipient.add_lamports(amount)?;

    let escrow = &ctx.accounts.escrow;
    emit!(PaidOut { escrow: escrow.key(), terms_hash: escrow.terms_hash, recipient, amount });
    Ok(())
}

pub fn handle_payout_spl(ctx: Context<PayoutSpl>) -> Result<()> {
    let (recipient, amount) = take_payout(&mut ctx.accounts.escrow)?;
    let escrow = &ctx.accounts.escrow;
    let destination = &ctx.accounts.destination;
    // Address alone is insufficient: the original SPL Token program lets an owner reassign a
    // token account with SetAuthority, so the current owner field is checked as well.
    let canonical = get_associated_token_address_with_program_id(&recipient, &escrow.mint, &escrow.token_program);
    require!(destination.key() == canonical && destination.owner == recipient, EscrowError::WrongRecipient);
    require!(!destination.is_frozen(), EscrowError::DestinationFrozen);

    let seller = escrow.seller;
    let nonce = escrow.seller_nonce;
    let bump = [escrow.escrow_bump];
    let seeds: &[&[u8]] = &[ESCROW_SEED, seller.as_ref(), nonce.as_ref(), &bump];
    let signer: &[&[&[u8]]] = &[seeds];
    let transfer = TransferChecked {
        from: ctx.accounts.vault.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.destination.to_account_info(),
        authority: ctx.accounts.escrow.to_account_info(),
    };
    // Re-check the vault as D5 requires; only the escrow PDA could set either field and it never does.
    let vault = &ctx.accounts.vault;
    require!(vault.delegate.is_none() && vault.close_authority.is_none(), EscrowError::VaultMismatch);
    let decimals = ctx.accounts.mint.decimals;
    let program = ctx.accounts.token_program.key();
    token::transfer_checked(CpiContext::new_with_signer(program, transfer, signer), amount, decimals)?;

    let escrow = &ctx.accounts.escrow;
    emit!(PaidOut { escrow: escrow.key(), terms_hash: escrow.terms_hash, recipient, amount });
    Ok(())
}
