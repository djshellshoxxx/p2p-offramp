//! Attack probes and coverage from the independent adversarial review (AI review, not a professional
//! audit). Each probe asserts a refusal; coverage tests kill mutants the original suites let survive.

mod common;

use basic_escrow::error::EscrowError as E;
use basic_escrow::network::{GENESIS_HASH, TEST_MINT_FREEZABLE, TEST_MINT_OPEN};
use basic_escrow::terms::{terms_hash, TermsFields};
use basic_escrow::EscrowState;
use common::*;
use solana_keypair::Keypair;
use solana_signer::Signer;

const AMOUNT: u64 = 25_000_000;
const CLOCK_SYSVAR: Pubkey = anchor_lang::pubkey!("SysvarC1ock11111111111111111111111111111111");

fn spl_harness() -> Harness {
    let mut h = Harness::new(TokenBuild::Original);
    h.put_test_mints(Pubkey::new_unique(), Pubkey::new_unique());
    h
}

fn seller_with_tokens(h: &mut Harness, mint: Pubkey, amount: u64) -> (Keypair, Pubkey) {
    let seller = h.funded_keypair(10 * SOL);
    let token = ata(&seller.pubkey(), &mint);
    h.put_token_account(token, mint, seller.pubkey(), amount, false);
    (seller, token)
}

/// Review finding (LOW, fixed): reserved keys are demoted to read-only in every transaction, so a native
/// payout to a sysvar or builtin buyer could never succeed and a release would lock the principal. Funding
/// now requests the buyer writable, so the same runtime rule refuses such a buyer before any funds move.
#[test]
fn reserved_key_buyers_are_refused_at_funding() {
    let mut h = Harness::new(TokenBuild::Original);
    let seller = h.funded_keypair(10 * SOL);
    for (nonce, reserved) in [(90u8, CLOCK_SYSVAR), (89u8, SYSTEM_ID)] {
        let terms = args(reserved, nonce, SOL, h.now());
        let result = h.send(&[fund_native_ix(&seller.pubkey(), &terms)], &[&seller]);
        assert_eq!(code(result), 2000, "Anchor ConstraintMut: the reserved key {reserved} is read-only");
        let (escrow, _) = escrow_pda(&seller.pubkey(), &terms.seller_nonce);
        assert!(h.svm.get_account(&escrow).is_none(), "no escrow is created");
    }
    assert_eq!(h.lamports(&seller.pubkey()), 10 * SOL, "the seller paid nothing but fees");
}

/// Coverage gap: the original suites check the on-chain terms hash for a native trade only, so a
/// mutant that drops the mint, token program or SPL asset kind from the SPL hash survives.
#[test]
fn spl_on_chain_terms_hash_binds_mint_token_program_and_kind() {
    let mut h = spl_harness();
    let (seller, token) = seller_with_tokens(&mut h, TEST_MINT_OPEN, AMOUNT);
    let buyer = Pubkey::new_unique();
    let terms = args(buyer, 91, AMOUNT, h.now());
    h.send(&[fund_spl_ix(&seller.pubkey(), &terms, &TEST_MINT_OPEN, &token)], &[&seller]).unwrap();
    let (escrow, _) = escrow_pda(&seller.pubkey(), &terms.seller_nonce);
    let fields = |mint: &Pubkey, program: &Pubkey, kind: u8| {
        terms_hash(&TermsFields {
            genesis_hash: &GENESIS_HASH,
            program_id: &basic_escrow::ID,
            order_id: &terms.order_id,
            seller: &seller.pubkey(),
            buyer: &buyer,
            mint,
            token_program: program,
            private_agreement_hash: &terms.private_agreement_hash,
            capabilities_hash: &terms.capabilities_hash,
            seller_nonce: &terms.seller_nonce,
            revision: terms.revision,
            asset_kind: kind,
            amount: terms.amount,
            accept_before: terms.accept_before,
            expiry: terms.expiry,
        })
    };
    let stored = h.escrow(&escrow).terms_hash;
    assert_eq!(stored, fields(&TEST_MINT_OPEN, &TOKEN_ID, 2), "SPL terms hash binds mint, token program and kind 2");
    let zero = Pubkey::default();
    assert_ne!(stored, fields(&TEST_MINT_OPEN, &zero, 2));
    assert_ne!(stored, fields(&TEST_MINT_OPEN, &TOKEN_ID, 0));
}

/// A delegate of someone else's token account cannot fund an escrow (with itself as seller) from it.
#[test]
fn delegate_cannot_fund_from_a_victims_token_account() {
    let mut h = spl_harness();
    let victim = Pubkey::new_unique();
    let attacker = h.funded_keypair(10 * SOL);
    let victim_token = ata(&victim, &TEST_MINT_OPEN);
    h.put_token_account_full(victim_token, TEST_MINT_OPEN, victim, AMOUNT, false, Some(attacker.pubkey()));
    let terms = args(Pubkey::new_unique(), 92, AMOUNT, h.now());
    let result = h.send(&[fund_spl_ix(&attacker.pubkey(), &terms, &TEST_MINT_OPEN, &victim_token)], &[&attacker]);
    assert!(result.is_err());
    assert_eq!(h.token_amount(&victim_token), AMOUNT);
}

/// The source token account must hold the funded mint.
#[test]
fn source_of_another_mint_is_refused() {
    let mut h = spl_harness();
    let (seller, token) = seller_with_tokens(&mut h, TEST_MINT_FREEZABLE, AMOUNT);
    let terms = args(Pubkey::new_unique(), 93, AMOUNT, h.now());
    assert!(h.send(&[fund_spl_ix(&seller.pubkey(), &terms, &TEST_MINT_OPEN, &token)], &[&seller]).is_err());
    assert_eq!(h.token_amount(&token), AMOUNT);
}

/// A non-canonical-bump PDA of the same seeds cannot stand in for the escrow at funding.
#[test]
fn non_canonical_escrow_bump_is_refused_at_funding() {
    let mut h = Harness::new(TokenBuild::Original);
    let seller = h.funded_keypair(10 * SOL);
    let terms = args(Pubkey::new_unique(), 94, SOL, h.now());
    let (_, canonical) = escrow_pda(&seller.pubkey(), &terms.seller_nonce);
    let alternative = (0..canonical).rev().find_map(|bump| {
        Pubkey::create_program_address(
            &[basic_escrow::ESCROW_SEED, seller.pubkey().as_ref(), terms.seller_nonce.as_ref(), &[bump]],
            &basic_escrow::ID,
        )
        .ok()
    });
    let alternative = alternative.expect("some lower bump is off-curve");
    let ix = substitute(fund_native_ix(&seller.pubkey(), &terms), 1, alternative);
    assert_eq!(code(h.send(&[ix], &[&seller])), 2006, "Anchor ConstraintSeeds");
}

/// Another program-owned account type (the SPL vault) cannot be passed as the escrow.
#[test]
fn a_token_account_cannot_pose_as_the_escrow() {
    let mut h = spl_harness();
    let (seller, token) = seller_with_tokens(&mut h, TEST_MINT_OPEN, AMOUNT);
    let terms = args(Pubkey::new_unique(), 95, AMOUNT, h.now());
    h.send(&[fund_spl_ix(&seller.pubkey(), &terms, &TEST_MINT_OPEN, &token)], &[&seller]).unwrap();
    let (escrow, _) = escrow_pda(&seller.pubkey(), &terms.seller_nonce);
    let (vault, _) = vault_pda(&escrow);
    assert!(h.send(&[release_ix(&seller.pubkey(), &vault)], &[&seller]).is_err());
    assert!(h.send(&[refund_ix(&vault)], &[]).is_err());
    assert_eq!(h.escrow(&escrow).state, EscrowState::Funded);
}

/// Refunded SPL escrows never pay the buyer, the vault itself or an unrelated ATA; released escrows
/// pay after the deadline as well (payout has no time lock).
#[test]
fn spl_payout_destination_follows_the_terminal_state_only() {
    let mut h = spl_harness();
    let (seller, token) = seller_with_tokens(&mut h, TEST_MINT_OPEN, AMOUNT);
    let buyer = Pubkey::new_unique();
    let terms = args(buyer, 96, AMOUNT, h.now());
    h.send(&[fund_spl_ix(&seller.pubkey(), &terms, &TEST_MINT_OPEN, &token)], &[&seller]).unwrap();
    let (escrow, _) = escrow_pda(&seller.pubkey(), &terms.seller_nonce);
    let (vault, _) = vault_pda(&escrow);
    let buyer_token = ata(&buyer, &TEST_MINT_OPEN);
    h.put_token_account(buyer_token, TEST_MINT_OPEN, buyer, 0, false);
    let early = h.send(&[payout_spl_ix(&escrow, &vault, &TEST_MINT_OPEN, &token)], &[]);
    assert_eq!(code(early), escrow_error(E::InvalidState), "no payout before a terminal state");
    h.set_time(terms.expiry as i64);
    h.send(&[refund_ix(&escrow)], &[]).unwrap();
    let to_buyer = h.send(&[payout_spl_ix(&escrow, &vault, &TEST_MINT_OPEN, &buyer_token)], &[]);
    assert_eq!(code(to_buyer), escrow_error(E::WrongRecipient));
    let to_vault = h.send(&[payout_spl_ix(&escrow, &vault, &TEST_MINT_OPEN, &vault)], &[]);
    assert_eq!(code(to_vault), 2040, "Anchor ConstraintDuplicateMutableAccount");
    h.send(&[payout_spl_ix(&escrow, &vault, &TEST_MINT_OPEN, &token)], &[]).unwrap();
    assert_eq!((h.token_amount(&token), h.token_amount(&buyer_token), h.token_amount(&vault)), (AMOUNT, 0, 0));
}

/// A refunded native escrow never pays the buyer; a released one still pays long after the deadline.
#[test]
fn native_payout_destination_follows_the_terminal_state_only() {
    let mut h = Harness::new(TokenBuild::Original);
    let seller = h.funded_keypair(10 * SOL);
    let buyer = Pubkey::new_unique();
    let refunded = args(buyer, 97, SOL, h.now());
    let released = args(buyer, 98, SOL, h.now());
    h.send(&[fund_native_ix(&seller.pubkey(), &refunded), fund_native_ix(&seller.pubkey(), &released)], &[&seller])
        .unwrap();
    let (refund_escrow, _) = escrow_pda(&seller.pubkey(), &refunded.seller_nonce);
    let (release_escrow, _) = escrow_pda(&seller.pubkey(), &released.seller_nonce);
    h.send(&[release_ix(&seller.pubkey(), &release_escrow)], &[&seller]).unwrap();
    h.set_time(refunded.expiry as i64 + 30 * DAY as i64);
    h.send(&[refund_ix(&refund_escrow)], &[]).unwrap();
    assert_eq!(code(h.send(&[payout_native_ix(&refund_escrow, &buyer)], &[])), escrow_error(E::WrongRecipient));
    h.send(&[payout_native_ix(&release_escrow, &buyer)], &[]).expect("released payout has no time lock");
    assert_eq!(h.lamports(&buyer), SOL);
}
