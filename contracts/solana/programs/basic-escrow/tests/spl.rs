//! SPL escrow lifecycle. Every scenario runs against the hash-pinned original SPL Token 3.5.0 build and
//! again against the p-token build that LiteSVM's mainnet feature set places at the SPL Token ID.

mod common;

use basic_escrow::error::EscrowError as E;
use basic_escrow::network::{TEST_MINT_FREEZABLE, TEST_MINT_OPEN};
use basic_escrow::EscrowState;
use common::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

const BUILDS: [TokenBuild; 2] = [TokenBuild::Original, TokenBuild::PToken];
const AMOUNT: u64 = 25_000_000;

struct Trade {
    seller: Keypair,
    buyer: Pubkey,
    mint: Pubkey,
    seller_token: Pubkey,
    escrow: Pubkey,
    vault: Pubkey,
    deadline: u64,
}

fn setup(h: &mut Harness) -> Pubkey {
    let freeze = Pubkey::new_unique();
    h.put_test_mints(Pubkey::new_unique(), freeze);
    freeze
}

fn seller_with_tokens(h: &mut Harness, mint: Pubkey, amount: u64) -> (Keypair, Pubkey) {
    let seller = h.funded_keypair(10 * SOL);
    let token = ata(&seller.pubkey(), &mint);
    h.put_token_account(token, mint, seller.pubkey(), amount, false);
    (seller, token)
}

fn funded(h: &mut Harness, mint: Pubkey, nonce: u8) -> Trade {
    let (seller, seller_token) = seller_with_tokens(h, mint, 3 * AMOUNT);
    let buyer = Pubkey::new_unique();
    let terms = args(buyer, nonce, AMOUNT, h.now());
    h.send(&[fund_spl_ix(&seller.pubkey(), &terms, &mint, &seller_token)], &[&seller]).expect("fund spl");
    let (escrow, _) = escrow_pda(&seller.pubkey(), &terms.seller_nonce);
    let (vault, _) = vault_pda(&escrow);
    Trade { seller, buyer, mint, seller_token, escrow, vault, deadline: terms.expiry }
}

fn buyer_ata(h: &mut Harness, trade: &Trade) -> Pubkey {
    let destination = ata(&trade.buyer, &trade.mint);
    h.put_token_account(destination, trade.mint, trade.buyer, 0, false);
    destination
}

#[test]
fn fund_moves_exact_amount_into_an_escrow_owned_vault() {
    for build in BUILDS {
        let mut h = Harness::new(build);
        setup(&mut h);
        let trade = funded(&mut h, TEST_MINT_OPEN, 1);
        assert_eq!(h.token_amount(&trade.vault), AMOUNT, "{build:?}");
        assert_eq!(h.token_amount(&trade.seller_token), 2 * AMOUNT);
        let state = h.escrow(&trade.escrow);
        assert_eq!(
            (state.state, state.asset_kind, state.mint, state.token_program),
            (EscrowState::Funded, 2, TEST_MINT_OPEN, TOKEN_ID)
        );
        let (_, vault_bump) = vault_pda(&trade.escrow);
        assert_eq!(state.vault_bump, vault_bump, "canonical vault bump stored");
    }
}

#[test]
fn release_and_payout_to_the_buyers_canonical_ata() {
    for build in BUILDS {
        let mut h = Harness::new(build);
        setup(&mut h);
        let trade = funded(&mut h, TEST_MINT_OPEN, 2);
        let destination = buyer_ata(&mut h, &trade);
        let payout = payout_spl_ix(&trade.escrow, &trade.vault, &trade.mint, &destination);
        h.send(&[release_ix(&trade.seller.pubkey(), &trade.escrow), payout.clone()], &[&trade.seller])
            .expect("release+payout");
        assert_eq!((h.token_amount(&destination), h.token_amount(&trade.vault)), (AMOUNT, 0), "{build:?}");
        assert_eq!(code(h.send(&[payout], &[])), escrow_error(E::AlreadyPaidOut));
        assert_eq!(h.token_amount(&destination), AMOUNT);
    }
}

#[test]
fn refund_at_deadline_pays_the_sellers_canonical_ata() {
    for build in BUILDS {
        let mut h = Harness::new(build);
        setup(&mut h);
        let trade = funded(&mut h, TEST_MINT_OPEN, 3);
        h.set_time(trade.deadline as i64 - 1);
        assert_eq!(code(h.send(&[refund_ix(&trade.escrow)], &[])), escrow_error(E::DeadlineNotReached));
        h.set_time(trade.deadline as i64);
        let payout = payout_spl_ix(&trade.escrow, &trade.vault, &trade.mint, &trade.seller_token);
        h.send(&[refund_ix(&trade.escrow), payout], &[]).expect("refund+payout by anyone");
        assert_eq!(h.token_amount(&trade.seller_token), 3 * AMOUNT, "{build:?}");
    }
}

#[test]
fn payout_refuses_non_canonical_or_reassigned_destinations() {
    for build in BUILDS {
        let mut h = Harness::new(build);
        setup(&mut h);
        let trade = funded(&mut h, TEST_MINT_OPEN, 4);
        h.send(&[release_ix(&trade.seller.pubkey(), &trade.escrow)], &[&trade.seller]).unwrap();
        // A non-ATA token account owned by the buyer.
        let side = Pubkey::new_unique();
        h.put_token_account(side, trade.mint, trade.buyer, 0, false);
        let result = h.send(&[payout_spl_ix(&trade.escrow, &trade.vault, &trade.mint, &side)], &[]);
        assert_eq!(code(result), escrow_error(E::WrongRecipient), "{build:?} non-canonical");
        // The buyer's ATA address whose owner field was reassigned (SetAuthority) to someone else.
        let destination = ata(&trade.buyer, &trade.mint);
        h.put_token_account(destination, trade.mint, Pubkey::new_unique(), 0, false);
        let result = h.send(&[payout_spl_ix(&trade.escrow, &trade.vault, &trade.mint, &destination)], &[]);
        assert_eq!(code(result), escrow_error(E::WrongRecipient), "{build:?} reassigned owner");
        // The seller's ATA after a release.
        let result = h.send(&[payout_spl_ix(&trade.escrow, &trade.vault, &trade.mint, &trade.seller_token)], &[]);
        assert_eq!(code(result), escrow_error(E::WrongRecipient), "{build:?} wrong party");
        assert_eq!(h.token_amount(&trade.vault), AMOUNT);
        assert!(!h.escrow(&trade.escrow).paid_out);
    }
}

#[test]
fn frozen_destination_blocks_only_the_payout_and_a_retry_succeeds_after_thaw() {
    for build in BUILDS {
        let mut h = Harness::new(build);
        setup(&mut h);
        let trade = funded(&mut h, TEST_MINT_FREEZABLE, 5);
        let destination = buyer_ata(&mut h, &trade);
        h.set_frozen(destination, true);
        let payout = payout_spl_ix(&trade.escrow, &trade.vault, &trade.mint, &destination);
        let combined = h.send(&[release_ix(&trade.seller.pubkey(), &trade.escrow), payout.clone()], &[&trade.seller]);
        assert_eq!(code(combined), escrow_error(E::DestinationFrozen), "{build:?}");
        h.send(&[release_ix(&trade.seller.pubkey(), &trade.escrow)], &[&trade.seller]).expect("release alone");
        assert_eq!(code(h.send(std::slice::from_ref(&payout), &[])), escrow_error(E::DestinationFrozen));
        h.set_frozen(destination, false);
        h.send(&[payout], &[]).expect("retry after thaw");
        assert_eq!(h.token_amount(&destination), AMOUNT);
    }
}

#[test]
fn restricted_sources_and_unlisted_mints_are_refused() {
    for build in BUILDS {
        let mut h = Harness::new(build);
        setup(&mut h);
        let now = h.now();
        // Delegated source.
        let (seller, token) = seller_with_tokens(&mut h, TEST_MINT_OPEN, AMOUNT);
        h.put_token_account_full(token, TEST_MINT_OPEN, seller.pubkey(), AMOUNT, false, Some(Pubkey::new_unique()));
        let terms = args(Pubkey::new_unique(), 10, AMOUNT, now);
        let result = h.send(&[fund_spl_ix(&seller.pubkey(), &terms, &TEST_MINT_OPEN, &token)], &[&seller]);
        assert_eq!(code(result), escrow_error(E::SourceTokenAccountRestricted), "{build:?} delegated");
        // Frozen source.
        let (seller, token) = seller_with_tokens(&mut h, TEST_MINT_FREEZABLE, AMOUNT);
        h.set_frozen(token, true);
        let terms = args(Pubkey::new_unique(), 11, AMOUNT, now);
        let result = h.send(&[fund_spl_ix(&seller.pubkey(), &terms, &TEST_MINT_FREEZABLE, &token)], &[&seller]);
        assert_eq!(code(result), escrow_error(E::SourceTokenAccountRestricted), "{build:?} frozen");
        // A valid SPL Token mint that is not on the compiled allowlist.
        let unlisted = Pubkey::new_unique();
        h.put_mint(unlisted, 6, Pubkey::new_unique(), None, TOKEN_ID);
        let (seller, token) = seller_with_tokens(&mut h, unlisted, AMOUNT);
        let terms = args(Pubkey::new_unique(), 12, AMOUNT, now);
        let result = h.send(&[fund_spl_ix(&seller.pubkey(), &terms, &unlisted, &token)], &[&seller]);
        assert_eq!(code(result), escrow_error(E::MintNotAllowed), "{build:?} unlisted");
        // The wrapped-SOL mint.
        let wrapped = anchor_lang::pubkey!("So11111111111111111111111111111111111111112");
        h.put_mint(wrapped, 9, Pubkey::new_unique(), None, TOKEN_ID);
        let (seller, token) = seller_with_tokens(&mut h, wrapped, AMOUNT);
        let terms = args(Pubkey::new_unique(), 13, AMOUNT, now);
        let result = h.send(&[fund_spl_ix(&seller.pubkey(), &terms, &wrapped, &token)], &[&seller]);
        assert_eq!(code(result), escrow_error(E::MintNotAllowed), "{build:?} wrapped SOL");
    }
}

#[test]
fn wrong_decimals_on_an_allowlisted_address_are_refused() {
    let mut h = Harness::new(TokenBuild::Original);
    h.put_mint(TEST_MINT_OPEN, 9, Pubkey::new_unique(), None, TOKEN_ID);
    let (seller, token) = seller_with_tokens(&mut h, TEST_MINT_OPEN, AMOUNT);
    let terms = args(Pubkey::new_unique(), 14, AMOUNT, h.now());
    let result = h.send(&[fund_spl_ix(&seller.pubkey(), &terms, &TEST_MINT_OPEN, &token)], &[&seller]);
    assert_eq!(code(result), escrow_error(E::MintNotAllowed));
}

#[test]
fn token_2022_program_or_mint_is_refused() {
    let mut h = Harness::new(TokenBuild::Original);
    setup(&mut h);
    let (seller, token) = seller_with_tokens(&mut h, TEST_MINT_OPEN, AMOUNT);
    let terms = args(Pubkey::new_unique(), 15, AMOUNT, h.now());
    let swapped_program = substitute(fund_spl_ix(&seller.pubkey(), &terms, &TEST_MINT_OPEN, &token), 5, TOKEN_2022_ID);
    assert!(h.send(&[swapped_program], &[&seller]).is_err(), "Token-2022 program id");
    // A Token-2022-owned mint at the allowlisted address.
    h.put_mint(TEST_MINT_OPEN, 6, Pubkey::new_unique(), None, TOKEN_2022_ID);
    let result = h.send(&[fund_spl_ix(&seller.pubkey(), &terms, &TEST_MINT_OPEN, &token)], &[&seller]);
    assert!(result.is_err(), "Token-2022-owned mint");
    let (escrow, _) = escrow_pda(&seller.pubkey(), &terms.seller_nonce);
    assert!(h.svm.get_account(&escrow).is_none(), "no escrow created");
}

#[test]
fn buyer_equal_to_the_vault_is_refused() {
    let mut h = Harness::new(TokenBuild::Original);
    setup(&mut h);
    let (seller, token) = seller_with_tokens(&mut h, TEST_MINT_OPEN, AMOUNT);
    let (escrow, _) = escrow_pda(&seller.pubkey(), &[16; 32]);
    let (vault, _) = vault_pda(&escrow);
    let terms = args(vault, 16, AMOUNT, h.now());
    let result = h.send(&[fund_spl_ix(&seller.pubkey(), &terms, &TEST_MINT_OPEN, &token)], &[&seller]);
    assert_eq!(code(result), escrow_error(E::InvalidBuyer));
    let terms = args(escrow, 16, AMOUNT, h.now());
    let result = h.send(&[fund_spl_ix(&seller.pubkey(), &terms, &TEST_MINT_OPEN, &token)], &[&seller]);
    assert_eq!(code(result), escrow_error(E::InvalidBuyer));
    for buyer in [Pubkey::default(), seller.pubkey()] {
        let terms = args(buyer, 16, AMOUNT, h.now());
        let result = h.send(&[fund_spl_ix(&seller.pubkey(), &terms, &TEST_MINT_OPEN, &token)], &[&seller]);
        assert_eq!(code(result), escrow_error(E::InvalidBuyer), "zero or seller buyer");
    }
}

#[test]
fn substituted_vault_mint_or_token_program_is_refused_at_payout() {
    let mut h = Harness::new(TokenBuild::Original);
    setup(&mut h);
    let trade = funded(&mut h, TEST_MINT_OPEN, 17);
    let other = funded(&mut h, TEST_MINT_OPEN, 18);
    h.send(&[release_ix(&trade.seller.pubkey(), &trade.escrow)], &[&trade.seller]).unwrap();
    let destination = buyer_ata(&mut h, &trade);
    let honest = payout_spl_ix(&trade.escrow, &trade.vault, &trade.mint, &destination);
    assert!(h.send(&[substitute(honest.clone(), 1, other.vault)], &[]).is_err(), "another escrow's vault");
    assert!(h.send(&[substitute(honest.clone(), 2, TEST_MINT_FREEZABLE)], &[]).is_err(), "other mint");
    assert!(h.send(&[substitute(honest.clone(), 4, TOKEN_2022_ID)], &[]).is_err(), "Token-2022 program");
    assert_eq!((h.token_amount(&trade.vault), h.token_amount(&other.vault)), (AMOUNT, AMOUNT));
    h.send(&[honest], &[]).expect("honest payout still works");
    assert_eq!(h.token_amount(&other.vault), AMOUNT, "the other escrow is untouched");
}

#[test]
fn donated_tokens_stay_in_the_vault_and_principal_is_paid_exactly() {
    let mut h = Harness::new(TokenBuild::Original);
    setup(&mut h);
    let trade = funded(&mut h, TEST_MINT_OPEN, 19);
    let donor = Keypair::new();
    let donor_token = Pubkey::new_unique();
    h.put_token_account(donor_token, trade.mint, donor.pubkey(), 7, false);
    let donate = anchor_spl::token::spl_token::instruction::transfer(
        &TOKEN_ID,
        &donor_token,
        &trade.vault,
        &donor.pubkey(),
        &[],
        7,
    )
    .unwrap();
    h.send(&[donate], &[&donor]).unwrap();
    let destination = buyer_ata(&mut h, &trade);
    let payout = payout_spl_ix(&trade.escrow, &trade.vault, &trade.mint, &destination);
    h.send(&[release_ix(&trade.seller.pubkey(), &trade.escrow), payout], &[&trade.seller]).unwrap();
    assert_eq!((h.token_amount(&destination), h.token_amount(&trade.vault)), (AMOUNT, 7));
}

#[test]
fn lamports_sent_to_escrow_and_vault_addresses_before_init_do_not_block_funding() {
    let mut h = Harness::new(TokenBuild::Original);
    setup(&mut h);
    let (seller, token) = seller_with_tokens(&mut h, TEST_MINT_OPEN, AMOUNT);
    let terms = args(Pubkey::new_unique(), 20, AMOUNT, h.now());
    let (escrow, _) = escrow_pda(&seller.pubkey(), &terms.seller_nonce);
    let (vault, _) = vault_pda(&escrow);
    let donated = h.rent(0) + 1_000;
    h.svm.airdrop(&escrow, donated).unwrap();
    h.svm.airdrop(&vault, donated).unwrap();
    h.send(&[fund_spl_ix(&seller.pubkey(), &terms, &TEST_MINT_OPEN, &token)], &[&seller]).expect("prefunded addresses");
    assert_eq!(h.token_amount(&vault), AMOUNT);
}

#[test]
fn payout_spl_and_native_mismatch_the_asset_kind() {
    let mut h = Harness::new(TokenBuild::Original);
    setup(&mut h);
    let trade = funded(&mut h, TEST_MINT_OPEN, 21);
    h.send(&[release_ix(&trade.seller.pubkey(), &trade.escrow)], &[&trade.seller]).unwrap();
    let result = h.send(&[payout_native_ix(&trade.escrow, &trade.buyer)], &[]);
    assert_eq!(code(result), escrow_error(E::AssetKindMismatch));
}

#[test]
fn spl_conservation_over_many_trades() {
    let mut h = Harness::new(TokenBuild::PToken);
    setup(&mut h);
    let mut paid = 0;
    for nonce in 30..36u8 {
        let trade = funded(&mut h, TEST_MINT_OPEN, nonce);
        let destination = buyer_ata(&mut h, &trade);
        let payout = payout_spl_ix(&trade.escrow, &trade.vault, &trade.mint, &destination);
        h.send(&[release_ix(&trade.seller.pubkey(), &trade.escrow), payout.clone()], &[&trade.seller]).unwrap();
        let _ = h.send(&[payout], &[]);
        paid += h.token_amount(&destination);
    }
    assert_eq!(paid, 6 * AMOUNT);
}
