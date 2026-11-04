//! Seller funding. The seller's signed funding transaction is the seller's on-chain acceptance; the
//! buyer funds nothing, so no Ed25519 acceptance check is made on chain (D5 recommendation, matching
//! the EVM contract). Every term is bound through the rebuilt G16 `terms_hash`.

use crate::constants::*;
use crate::error::EscrowError;
use crate::network::{allowed_decimals, GENESIS_HASH};
use crate::state::{EscrowState, EscrowV1, Funded};
use crate::terms::{terms_hash, TermsFields};
use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

/// Instruction fields that, with the seller key, asset accounts, program ID and compiled genesis,
/// rebuild the G16 terms message.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct FundArgs {
    pub order_id: [u8; 32],
    pub buyer: Pubkey,
    pub private_agreement_hash: [u8; 32],
    pub capabilities_hash: [u8; 32],
    pub seller_nonce: [u8; 32],
    pub revision: u64,
    pub amount: u64,
    pub accept_before: u64,
    pub expiry: u64,
}

#[derive(Accounts)]
#[instruction(args: FundArgs)]
pub struct FundNative<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        init,
        payer = seller,
        space = 8 + EscrowV1::INIT_SPACE,
        seeds = [ESCROW_SEED, seller.key().as_ref(), args.seller_nonce.as_ref()],
        bump,
    )]
    pub escrow: Account<'info, EscrowV1>,
    /// CHECK: only its address and executable flag are read; a native payout to an executable
    /// account would fail permanently, so such a buyer is refused at funding.
    #[account(address = args.buyer @ EscrowError::InvalidBuyer)]
    pub buyer: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: FundArgs)]
pub struct FundSpl<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        init,
        payer = seller,
        space = 8 + EscrowV1::INIT_SPACE,
        seeds = [ESCROW_SEED, seller.key().as_ref(), args.seller_nonce.as_ref()],
        bump,
    )]
    pub escrow: Account<'info, EscrowV1>,
    /// `Account<Mint>` requires ownership by the original SPL Token program.
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = seller,
    )]
    pub seller_token: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = seller,
        seeds = [VAULT_SEED, escrow.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = escrow,
    )]
    pub vault: Account<'info, TokenAccount>,
    /// Only the original SPL Token program; Token-2022 is refused in v1.
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Reads chain time from the Clock sysvar (never a passed account) with a checked i64 to u64 conversion.
pub fn chain_now() -> Result<u64> {
    let timestamp = Clock::get()?.unix_timestamp;
    u64::try_from(timestamp).map_err(|_| error!(EscrowError::NegativeClock))
}

/// Shared funding rules; returns the escrow deadline.
fn validate_funding(args: &FundArgs, seller: &Pubkey, escrow: &Pubkey, now: u64) -> Result<u64> {
    require!(args.revision >= 1 && args.amount >= 1, EscrowError::ZeroValue);
    require!(
        args.buyer != *seller && args.buyer != Pubkey::default() && args.buyer != *escrow,
        EscrowError::InvalidBuyer
    );
    require!(now < args.accept_before, EscrowError::AcceptanceExpired);
    let earliest = now.checked_add(MIN_DURATION_SECONDS).ok_or(error!(EscrowError::DeadlineOutOfRange))?;
    let latest = now.checked_add(MAX_DURATION_SECONDS).ok_or(error!(EscrowError::DeadlineOutOfRange))?;
    require!(args.expiry >= earliest && args.expiry <= latest, EscrowError::DeadlineOutOfRange);
    Ok(args.expiry)
}

fn rebuild_terms_hash(args: &FundArgs, seller: &Pubkey, mint: &Pubkey, token_program: &Pubkey, kind: u8) -> [u8; 32] {
    terms_hash(&TermsFields {
        genesis_hash: &GENESIS_HASH,
        program_id: &crate::ID,
        order_id: &args.order_id,
        seller,
        buyer: &args.buyer,
        mint,
        token_program,
        private_agreement_hash: &args.private_agreement_hash,
        capabilities_hash: &args.capabilities_hash,
        seller_nonce: &args.seller_nonce,
        revision: args.revision,
        asset_kind: kind,
        amount: args.amount,
        accept_before: args.accept_before,
        expiry: args.expiry,
    })
}

#[allow(clippy::too_many_arguments)]
fn write_escrow(
    escrow: &mut EscrowV1,
    args: &FundArgs,
    seller: Pubkey,
    escrow_bump: u8,
    vault_bump: u8,
    asset_kind: u8,
    mint: Pubkey,
    token_program: Pubkey,
    deadline: u64,
    terms_hash: [u8; 32],
) {
    escrow.layout_version = LAYOUT_VERSION;
    escrow.escrow_bump = escrow_bump;
    escrow.vault_bump = vault_bump;
    escrow.state = EscrowState::Funded;
    escrow.paid_out = false;
    escrow.asset_kind = asset_kind;
    escrow.seller = seller;
    escrow.buyer = args.buyer;
    escrow.mint = mint;
    escrow.token_program = token_program;
    escrow.amount = args.amount;
    escrow.deadline = deadline;
    escrow.terms_hash = terms_hash;
    escrow.seller_nonce = args.seller_nonce;
}

pub fn handle_fund_native(ctx: Context<FundNative>, args: FundArgs) -> Result<()> {
    let seller = ctx.accounts.seller.key();
    let escrow_key = ctx.accounts.escrow.key();
    let deadline = validate_funding(&args, &seller, &escrow_key, chain_now()?)?;
    require!(!ctx.accounts.buyer.executable, EscrowError::ExecutableBuyer);

    // Rent and any lamports donated before `init` stay in the account; principal is recorded separately.
    let before = ctx.accounts.escrow.to_account_info().lamports();
    let transfer = Transfer { from: ctx.accounts.seller.to_account_info(), to: ctx.accounts.escrow.to_account_info() };
    system_program::transfer(CpiContext::new(ctx.accounts.system_program.key(), transfer), args.amount)?;
    let after = ctx.accounts.escrow.to_account_info().lamports();
    let rent_reserve = Rent::get()?.minimum_balance(8 + EscrowV1::INIT_SPACE);
    require!(after.checked_sub(before) == Some(args.amount) && before >= rent_reserve, EscrowError::PrincipalMismatch);

    let zero = Pubkey::default();
    let hash = rebuild_terms_hash(&args, &seller, &zero, &zero, ASSET_KIND_NATIVE);
    let bump = ctx.bumps.escrow;
    write_escrow(&mut ctx.accounts.escrow, &args, seller, bump, 0, ASSET_KIND_NATIVE, zero, zero, deadline, hash);
    emit!(Funded {
        escrow: escrow_key,
        terms_hash: hash,
        seller,
        buyer: args.buyer,
        asset_kind: ASSET_KIND_NATIVE,
        mint: zero,
        amount: args.amount,
        deadline,
    });
    Ok(())
}

pub fn handle_fund_spl(ctx: Context<FundSpl>, args: FundArgs) -> Result<()> {
    let seller = ctx.accounts.seller.key();
    let escrow_key = ctx.accounts.escrow.key();
    let vault_key = ctx.accounts.vault.key();
    let mint_key = ctx.accounts.mint.key();
    let token_program = ctx.accounts.token_program.key();
    let deadline = validate_funding(&args, &seller, &escrow_key, chain_now()?)?;
    require!(args.buyer != vault_key, EscrowError::InvalidBuyer);

    let decimals = ctx.accounts.mint.decimals;
    require!(allowed_decimals(&mint_key) == Some(decimals), EscrowError::MintNotAllowed);
    let source = &ctx.accounts.seller_token;
    require!(source.delegate.is_none() && !source.is_frozen(), EscrowError::SourceTokenAccountRestricted);

    let transfer = TransferChecked {
        from: ctx.accounts.seller_token.to_account_info(),
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.vault.to_account_info(),
        authority: ctx.accounts.seller.to_account_info(),
    };
    token::transfer_checked(CpiContext::new(token_program, transfer), args.amount, decimals)?;

    let vault = &mut ctx.accounts.vault;
    vault.reload()?;
    require!(
        vault.amount == args.amount
            && vault.owner == escrow_key
            && vault.delegate.is_none()
            && vault.close_authority.is_none(),
        EscrowError::VaultMismatch
    );

    let hash = rebuild_terms_hash(&args, &seller, &mint_key, &token_program, ASSET_KIND_SPL);
    let (escrow_bump, vault_bump) = (ctx.bumps.escrow, ctx.bumps.vault);
    write_escrow(
        &mut ctx.accounts.escrow,
        &args,
        seller,
        escrow_bump,
        vault_bump,
        ASSET_KIND_SPL,
        mint_key,
        token_program,
        deadline,
        hash,
    );
    emit!(Funded {
        escrow: escrow_key,
        terms_hash: hash,
        seller,
        buyer: args.buyer,
        asset_kind: ASSET_KIND_SPL,
        mint: mint_key,
        amount: args.amount,
        deadline,
    });
    Ok(())
}
