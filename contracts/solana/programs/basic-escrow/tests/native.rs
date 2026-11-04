//! Native SOL escrow lifecycle on LiteSVM with a controlled Clock.

mod common;

use basic_escrow::error::EscrowError as E;
use basic_escrow::EscrowState;
use common::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

struct Trade {
    seller: Keypair,
    buyer: Pubkey,
    escrow: Pubkey,
    deadline: u64,
}

fn funded(h: &mut Harness, amount: u64) -> Trade {
    let seller = h.funded_keypair(10 * SOL);
    let buyer = Pubkey::new_unique();
    let terms = args(buyer, 7, amount, h.now());
    h.send(&[fund_native_ix(&seller.pubkey(), &terms)], &[&seller]).expect("fund");
    let (escrow, _) = escrow_pda(&seller.pubkey(), &terms.seller_nonce);
    Trade { seller, buyer, escrow, deadline: terms.expiry }
}

#[test]
fn fund_records_exact_terms_and_principal_above_rent() {
    let mut h = Harness::new(TokenBuild::Original);
    let before = h.now();
    let trade = funded(&mut h, SOL);
    let state = h.escrow(&trade.escrow);
    assert_eq!(state.state, EscrowState::Funded);
    assert_eq!((state.amount, state.deadline, state.asset_kind), (SOL, before + 2 * DAY, 0));
    assert_eq!((state.seller, state.buyer), (trade.seller.pubkey(), trade.buyer));
    assert_eq!(state.mint, Pubkey::default());
    assert!(!state.paid_out);
    let account = h.svm.get_account(&trade.escrow).unwrap();
    assert_eq!(account.lamports, h.rent(account.data.len()) + SOL);
    assert_eq!(account.owner, basic_escrow::ID);
}

#[test]
fn release_before_deadline_then_payout_pays_buyer_exactly_once() {
    let mut h = Harness::new(TokenBuild::Original);
    let trade = funded(&mut h, SOL);
    h.set_time(trade.deadline as i64 - 1);
    h.send(
        &[release_ix(&trade.seller.pubkey(), &trade.escrow), payout_native_ix(&trade.escrow, &trade.buyer)],
        &[&trade.seller],
    )
    .expect("release and payout together");
    assert_eq!(h.lamports(&trade.buyer), SOL);
    let state = h.escrow(&trade.escrow);
    assert_eq!((state.state, state.paid_out), (EscrowState::Released, true));
    let again = h.send(&[payout_native_ix(&trade.escrow, &trade.buyer)], &[]);
    assert_eq!(code(again), escrow_error(E::AlreadyPaidOut));
    assert_eq!(h.lamports(&trade.buyer), SOL, "no double payout");
    let rent = h.rent(h.svm.get_account(&trade.escrow).unwrap().data.len());
    assert_eq!(h.lamports(&trade.escrow), rent, "rent stays locked, principal gone");
}

#[test]
fn release_at_deadline_is_refused_and_refund_at_deadline_pays_seller() {
    let mut h = Harness::new(TokenBuild::Original);
    let trade = funded(&mut h, SOL);
    h.set_time(trade.deadline as i64);
    let late = h.send(&[release_ix(&trade.seller.pubkey(), &trade.escrow)], &[&trade.seller]);
    assert_eq!(code(late), escrow_error(E::DeadlinePassed));
    let seller_before = h.lamports(&trade.seller.pubkey());
    // The harness fee payer is an unrelated party: no seller or buyer signature is involved.
    h.send(&[refund_ix(&trade.escrow), payout_native_ix(&trade.escrow, &trade.seller.pubkey())], &[])
        .expect("permissionless refund and payout");
    assert_eq!(h.lamports(&trade.seller.pubkey()), seller_before + SOL);
    assert_eq!(h.escrow(&trade.escrow).state, EscrowState::Refunded);
}

#[test]
fn refund_one_second_before_deadline_is_refused() {
    let mut h = Harness::new(TokenBuild::Original);
    let trade = funded(&mut h, SOL);
    h.set_time(trade.deadline as i64 - 1);
    assert_eq!(code(h.send(&[refund_ix(&trade.escrow)], &[])), escrow_error(E::DeadlineNotReached));
    assert_eq!(h.escrow(&trade.escrow).state, EscrowState::Funded);
}

#[test]
fn only_the_stored_seller_can_release() {
    let mut h = Harness::new(TokenBuild::Original);
    let trade = funded(&mut h, SOL);
    let intruder = h.funded_keypair(SOL);
    let attempt = h.send(&[release_ix(&intruder.pubkey(), &trade.escrow)], &[&intruder]);
    assert_eq!(code(attempt), 2001, "Anchor ConstraintHasOne");
    let buyer_signer = Keypair::new();
    let attempt = h.send(&[release_ix(&buyer_signer.pubkey(), &trade.escrow)], &[&buyer_signer]);
    assert!(attempt.is_err());
    assert_eq!(h.escrow(&trade.escrow).state, EscrowState::Funded);
}

#[test]
fn terminal_states_are_exclusive() {
    let mut h = Harness::new(TokenBuild::Original);
    let trade = funded(&mut h, SOL);
    h.send(&[release_ix(&trade.seller.pubkey(), &trade.escrow)], &[&trade.seller]).unwrap();
    h.set_time(trade.deadline as i64 + 10);
    assert_eq!(code(h.send(&[refund_ix(&trade.escrow)], &[])), escrow_error(E::InvalidState));
    h.set_time(trade.deadline as i64 - 10);
    let again = h.send(&[release_ix(&trade.seller.pubkey(), &trade.escrow)], &[&trade.seller]);
    assert_eq!(code(again), escrow_error(E::InvalidState));
}

#[test]
fn payout_requires_terminal_state_and_stored_recipient() {
    let mut h = Harness::new(TokenBuild::Original);
    let trade = funded(&mut h, SOL);
    assert_eq!(code(h.send(&[payout_native_ix(&trade.escrow, &trade.buyer)], &[])), escrow_error(E::InvalidState));
    h.send(&[release_ix(&trade.seller.pubkey(), &trade.escrow)], &[&trade.seller]).unwrap();
    let thief = Pubkey::new_unique();
    assert_eq!(code(h.send(&[payout_native_ix(&trade.escrow, &thief)], &[])), escrow_error(E::WrongRecipient));
    let to_seller = h.send(&[payout_native_ix(&trade.escrow, &trade.seller.pubkey())], &[]);
    assert_eq!(code(to_seller), escrow_error(E::WrongRecipient), "a released trade never pays the seller");
    assert_eq!(h.lamports(&thief), 0);
    assert!(!h.escrow(&trade.escrow).paid_out);
}

#[test]
fn payout_below_rent_to_empty_wallet_fails_without_blocking_release_and_can_be_retried() {
    let mut h = Harness::new(TokenBuild::Original);
    let small = h.rent(0) / 2;
    let trade = funded(&mut h, small);
    let combined = h.send(
        &[release_ix(&trade.seller.pubkey(), &trade.escrow), payout_native_ix(&trade.escrow, &trade.buyer)],
        &[&trade.seller],
    );
    assert!(combined.is_err(), "an empty recipient below the rent minimum cannot receive");
    assert_eq!(h.escrow(&trade.escrow).state, EscrowState::Funded, "atomic: nothing changed");
    h.send(&[release_ix(&trade.seller.pubkey(), &trade.escrow)], &[&trade.seller]).expect("release alone");
    assert!(h.send(&[payout_native_ix(&trade.escrow, &trade.buyer)], &[]).is_err());
    h.svm.airdrop(&trade.buyer, h.rent(0)).unwrap();
    h.send(&[payout_native_ix(&trade.escrow, &trade.buyer)], &[]).expect("retry after the buyer is rent-exempt");
    assert_eq!(h.lamports(&trade.buyer), h.rent(0) + small);
}

#[test]
fn donated_lamports_never_change_principal() {
    let mut h = Harness::new(TokenBuild::Original);
    let trade = funded(&mut h, SOL);
    let donor = h.funded_keypair(5 * SOL);
    let donation = anchor_lang::solana_program::system_instruction::transfer(&donor.pubkey(), &trade.escrow, 3 * SOL);
    h.send(&[donation], &[&donor]).unwrap();
    h.send(
        &[release_ix(&trade.seller.pubkey(), &trade.escrow), payout_native_ix(&trade.escrow, &trade.buyer)],
        &[&trade.seller],
    )
    .unwrap();
    assert_eq!(h.lamports(&trade.buyer), SOL, "exactly the funded principal");
    let rent = h.rent(h.svm.get_account(&trade.escrow).unwrap().data.len());
    assert_eq!(h.lamports(&trade.escrow), rent + 3 * SOL, "surplus stays; no sweep");
}

#[test]
fn lamports_sent_to_the_escrow_address_before_init_do_not_block_funding() {
    let mut h = Harness::new(TokenBuild::Original);
    let seller = h.funded_keypair(10 * SOL);
    let buyer = Pubkey::new_unique();
    let terms = args(buyer, 9, SOL, h.now());
    let (escrow, _) = escrow_pda(&seller.pubkey(), &terms.seller_nonce);
    // Anyone can credit the predictable PDA address with a rent-exempt system account first.
    let donated = h.rent(0) + 12_345;
    h.svm.airdrop(&escrow, donated).unwrap();
    h.send(&[fund_native_ix(&seller.pubkey(), &terms)], &[&seller]).expect("prefunded address still initializes");
    let rent = h.rent(h.svm.get_account(&escrow).unwrap().data.len());
    assert_eq!(h.lamports(&escrow), rent.max(donated) + SOL);
    h.send(&[release_ix(&seller.pubkey(), &escrow), payout_native_ix(&escrow, &buyer)], &[&seller]).unwrap();
    assert_eq!(h.lamports(&buyer), SOL);
}

#[test]
fn a_nonce_funds_once_with_same_or_changed_terms() {
    let mut h = Harness::new(TokenBuild::Original);
    let seller = h.funded_keypair(10 * SOL);
    let buyer = Pubkey::new_unique();
    let terms = args(buyer, 3, SOL, h.now());
    h.send(&[fund_native_ix(&seller.pubkey(), &terms)], &[&seller]).unwrap();
    assert!(h.send(&[fund_native_ix(&seller.pubkey(), &terms)], &[&seller]).is_err(), "same terms");
    let mut changed = terms.clone();
    changed.amount = 2 * SOL;
    changed.order_id = [0x99; 32];
    assert!(h.send(&[fund_native_ix(&seller.pubkey(), &changed)], &[&seller]).is_err(), "changed terms");
    let (escrow, _) = escrow_pda(&seller.pubkey(), &terms.seller_nonce);
    assert_eq!(h.escrow(&escrow).amount, SOL);
    // A settled trade cannot be refunded into a new funding either: the account is never closed.
    h.send(&[release_ix(&seller.pubkey(), &escrow), payout_native_ix(&escrow, &buyer)], &[&seller]).unwrap();
    assert!(h.send(&[fund_native_ix(&seller.pubkey(), &terms)], &[&seller]).is_err(), "after settlement");
}

#[test]
fn funding_window_boundaries() {
    let mut h = Harness::new(TokenBuild::Original);
    let seller = h.funded_keypair(50 * SOL);
    let buyer = Pubkey::new_unique();
    let now = h.now();
    let cases: [(u8, u64, u64, Option<E>); 6] = [
        (20, now + 1, now + 1800, None),
        (21, now + 1, now + 1799, Some(E::DeadlineOutOfRange)),
        (22, now + 1, now + 604_800, None),
        (23, now + 1, now + 604_801, Some(E::DeadlineOutOfRange)),
        (24, now, now + 3600, Some(E::AcceptanceExpired)),
        (25, now - 1, now + 3600, Some(E::AcceptanceExpired)),
    ];
    for (nonce, accept_before, expiry, expected) in cases {
        let mut terms = args(buyer, nonce, SOL, now);
        terms.accept_before = accept_before;
        terms.expiry = expiry;
        let result = h.send(&[fund_native_ix(&seller.pubkey(), &terms)], &[&seller]);
        match expected {
            None => result.unwrap_or_else(|error| panic!("nonce {nonce} should fund: {error:?}")),
            Some(error) => assert_eq!(code(result), escrow_error(error), "nonce {nonce}"),
        }
    }
}

#[test]
fn invalid_parties_and_zero_values_are_refused() {
    let mut h = Harness::new(TokenBuild::Original);
    let seller = h.funded_keypair(10 * SOL);
    let now = h.now();
    let (own_escrow, _) = escrow_pda(&seller.pubkey(), &[40; 32]);
    // The zero key is the System Program ID, a reserved key: the writable-buyer rule (Anchor
    // ConstraintMut, 2000) refuses it before the explicit check, which fund_spl still exercises.
    let refusals: [(Pubkey, u8, u64, u64, u32); 5] = [
        (seller.pubkey(), 41, SOL, 1, escrow_error(E::InvalidBuyer)),
        (Pubkey::default(), 42, SOL, 1, 2000),
        (own_escrow, 40, SOL, 1, escrow_error(E::InvalidBuyer)),
        (Pubkey::new_unique(), 43, 0, 1, escrow_error(E::ZeroValue)),
        (Pubkey::new_unique(), 44, SOL, 0, escrow_error(E::ZeroValue)),
    ];
    for (buyer, nonce, amount, revision, expected) in refusals {
        let mut terms = args(buyer, nonce, amount, now);
        terms.revision = revision;
        let result = h.send(&[fund_native_ix(&seller.pubkey(), &terms)], &[&seller]);
        assert_eq!(code(result), expected, "nonce {nonce}");
    }
}

#[test]
fn executable_buyer_is_refused_for_native_escrows() {
    let mut h = Harness::new(TokenBuild::Original);
    let seller = h.funded_keypair(10 * SOL);
    let terms = args(TOKEN_ID, 50, SOL, h.now());
    let result = h.send(&[fund_native_ix(&seller.pubkey(), &terms)], &[&seller]);
    assert_eq!(code(result), escrow_error(E::ExecutableBuyer));
}

#[test]
fn buyer_account_must_match_the_terms_buyer() {
    let mut h = Harness::new(TokenBuild::Original);
    let seller = h.funded_keypair(10 * SOL);
    let terms = args(Pubkey::new_unique(), 51, SOL, h.now());
    let swapped = substitute(fund_native_ix(&seller.pubkey(), &terms), 2, Pubkey::new_unique());
    assert_eq!(code(h.send(&[swapped], &[&seller])), escrow_error(E::InvalidBuyer));
}

#[test]
fn substituted_system_program_or_escrow_is_refused() {
    let mut h = Harness::new(TokenBuild::Original);
    let seller = h.funded_keypair(10 * SOL);
    let terms = args(Pubkey::new_unique(), 52, SOL, h.now());
    let fake_system = substitute(fund_native_ix(&seller.pubkey(), &terms), 3, TOKEN_ID);
    assert!(h.send(&[fake_system], &[&seller]).is_err());
    let wrong_escrow = substitute(fund_native_ix(&seller.pubkey(), &terms), 1, Pubkey::new_unique());
    assert!(h.send(&[wrong_escrow], &[&seller]).is_err());
    let trade = funded(&mut h, SOL);
    let other = funded(&mut h, 2 * SOL);
    h.send(&[release_ix(&other.seller.pubkey(), &other.escrow)], &[&other.seller]).unwrap();
    // A released escrow of another seller cannot pay this trade's buyer, and vice versa.
    assert_eq!(code(h.send(&[payout_native_ix(&other.escrow, &trade.buyer)], &[])), escrow_error(E::WrongRecipient));
}

#[test]
fn negative_clock_is_refused_by_checked_conversion() {
    let mut h = Harness::new(TokenBuild::Original);
    let trade = funded(&mut h, SOL);
    h.set_time(-1);
    let result = h.send(&[release_ix(&trade.seller.pubkey(), &trade.escrow)], &[&trade.seller]);
    assert_eq!(code(result), escrow_error(E::NegativeClock));
    assert_eq!(code(h.send(&[refund_ix(&trade.escrow)], &[])), escrow_error(E::NegativeClock));
}

#[test]
fn spl_payout_is_refused_for_a_native_escrow() {
    let mut h = Harness::new(TokenBuild::Original);
    let trade = funded(&mut h, SOL);
    h.send(&[release_ix(&trade.seller.pubkey(), &trade.escrow)], &[&trade.seller]).unwrap();
    let (vault, _) = vault_pda(&trade.escrow);
    let mint = basic_escrow::network::TEST_MINT_OPEN;
    let result = h.send(&[payout_spl_ix(&trade.escrow, &vault, &mint, &ata(&trade.buyer, &mint))], &[]);
    assert!(result.is_err());
    assert!(!h.escrow(&trade.escrow).paid_out);
}

#[test]
fn conservation_over_many_trades() {
    let mut h = Harness::new(TokenBuild::Original);
    let mut paid = 0u64;
    let mut funded_total = 0u64;
    for index in 0..8u64 {
        let amount = (index + 1) * SOL / 4;
        let trade = funded(&mut h, amount);
        funded_total += amount;
        if index % 2 == 0 {
            h.send(
                &[release_ix(&trade.seller.pubkey(), &trade.escrow), payout_native_ix(&trade.escrow, &trade.buyer)],
                &[&trade.seller],
            )
            .unwrap();
            paid += h.lamports(&trade.buyer);
        } else {
            h.set_time(trade.deadline as i64);
            let before = h.lamports(&trade.seller.pubkey());
            h.send(&[refund_ix(&trade.escrow), payout_native_ix(&trade.escrow, &trade.seller.pubkey())], &[]).unwrap();
            paid += h.lamports(&trade.seller.pubkey()) - before;
            h.set_time(START_TIME);
        }
        for _ in 0..2 {
            let _ = h.send(&[payout_native_ix(&trade.escrow, &trade.buyer)], &[]);
            let _ = h.send(&[payout_native_ix(&trade.escrow, &trade.seller.pubkey())], &[]);
        }
    }
    assert_eq!(paid, funded_total, "payouts equal funded principal exactly");
}

#[test]
fn native_flows_also_pass_under_the_mainnet_feature_set() {
    let mut h = Harness::new(TokenBuild::PToken);
    let trade = funded(&mut h, SOL);
    h.send(
        &[release_ix(&trade.seller.pubkey(), &trade.escrow), payout_native_ix(&trade.escrow, &trade.buyer)],
        &[&trade.seller],
    )
    .unwrap();
    assert_eq!(h.lamports(&trade.buyer), SOL);
}
