//! P2P Off-ramp basic escrow for Solana (D5 Option A).
//!
//! Economic rules match `contracts/evm/src/BasicEscrow.sol`: the seller funds; buyer, seller, asset,
//! exact base-unit amount and deadline are fixed at funding; only the seller, strictly before the
//! deadline, can release to the bound buyer; at or after the deadline anyone can refund to the seller.
//! Release and refund are terminal and only change state; a separate permissionless payout moves the
//! exact principal once (the native counterpart of EVM `pendingWithdrawals`). There is no owner,
//! operator, arbitrator, pause, sweep, close or deadline extension. The deployed program must be made
//! immutable (`--final`) before any registry entry; nothing here grants upgrade authority.

pub mod constants;
pub mod error;
pub mod instructions;
pub mod network;
pub mod state;
pub mod terms;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

#[cfg(feature = "localnet")]
declare_id!("7q2EChqznfQea58ZfUvBzRd97Bc28kwHaey1tYy7ADjq");

#[program]
pub mod basic_escrow {
    use super::*;

    pub fn fund_native(ctx: Context<FundNative>, args: FundArgs) -> Result<()> {
        instructions::fund::handle_fund_native(ctx, args)
    }

    pub fn fund_spl(ctx: Context<FundSpl>, args: FundArgs) -> Result<()> {
        instructions::fund::handle_fund_spl(ctx, args)
    }

    pub fn release(ctx: Context<Release>) -> Result<()> {
        instructions::settle::handle_release(ctx)
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        instructions::settle::handle_refund(ctx)
    }

    pub fn payout_native(ctx: Context<PayoutNative>) -> Result<()> {
        instructions::payout::handle_payout_native(ctx)
    }

    pub fn payout_spl(ctx: Context<PayoutSpl>) -> Result<()> {
        instructions::payout::handle_payout_spl(ctx)
    }
}
