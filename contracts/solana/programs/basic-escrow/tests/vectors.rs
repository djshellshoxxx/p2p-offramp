//! Cross-implementation vectors. The program's terms encoder must reproduce the G16 Solana vectors
//! (independent Python reference + TypeScript encoder), and Rust `find_program_address`, associated
//! token addresses and Anchor discriminators must match the independent JavaScript fixture.

mod common;

use anchor_lang::Discriminator;
use basic_escrow::network::{TEST_MINT_FREEZABLE, TEST_MINT_OPEN};
use basic_escrow::terms::{terms_bytes, terms_hash, TermsFields, TERMS_LEN};
use common::*;
use serde_json::Value;
use std::str::FromStr;

const G16: &str = include_str!("../../../../../packages/domain/test/fixtures/g16-vectors.json");
const INDEPENDENT: &str = include_str!("../../../vectors/solana-independent.json");

fn key(value: &Value) -> Pubkey {
    Pubkey::from_str(value.as_str().expect("base58 string")).expect("canonical 32-byte key")
}

fn bytes32(value: &Value) -> [u8; 32] {
    let text = value.as_str().expect("hex string");
    assert_eq!(text.len(), 64);
    let mut out = [0u8; 32];
    for (index, chunk) in out.iter_mut().enumerate() {
        *chunk = u8::from_str_radix(&text[2 * index..2 * index + 2], 16).unwrap();
    }
    out
}

fn decimal(value: &Value) -> u64 {
    value.as_str().expect("decimal string").parse().unwrap()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[test]
fn terms_encoder_matches_g16_vectors() {
    let document: Value = serde_json::from_str(G16).unwrap();
    let vectors = document["solanaTerms"].as_array().unwrap();
    assert!(vectors.len() >= 2, "native and SPL vectors present");
    for vector in vectors {
        let input = &vector["input"];
        let native = input["assetKind"] == "native";
        let zero = Pubkey::default();
        let (mint, token_program) =
            if native { (zero, zero) } else { (key(&input["mint"]), key(&input["tokenProgram"])) };
        let genesis = key(&input["genesisHash"]).to_bytes();
        let fields = TermsFields {
            genesis_hash: &genesis,
            program_id: &key(&input["programId"]),
            order_id: &bytes32(&input["orderId"]),
            seller: &key(&input["seller"]),
            buyer: &key(&input["buyer"]),
            mint: &mint,
            token_program: &token_program,
            private_agreement_hash: &bytes32(&input["privateAgreementHash"]),
            capabilities_hash: &bytes32(&input["capabilitiesHash"]),
            seller_nonce: &bytes32(&input["sellerNonce"]),
            revision: decimal(&input["revision"]),
            asset_kind: if native { 0 } else { 2 },
            amount: decimal(&input["amountBaseUnits"]),
            accept_before: decimal(&input["acceptBeforeSeconds"]),
            expiry: decimal(&input["escrowExpirySeconds"]),
        };
        let bytes = terms_bytes(&fields);
        assert_eq!(bytes.len(), TERMS_LEN);
        assert_eq!(hex(&bytes), vector["bytesHex"].as_str().unwrap(), "terms bytes for {}", input["assetKind"]);
        assert_eq!(hex(&terms_hash(&fields)), vector["termsHash"].as_str().unwrap(), "terms hash");
    }
}

#[test]
fn constants_match_the_independent_fixture() {
    let fixture: Value = serde_json::from_str(INDEPENDENT).unwrap();
    let constants = &fixture["constants"];
    assert_eq!(key(&constants["programId"]), basic_escrow::ID);
    assert_eq!(key(&constants["tokenProgramId"]), TOKEN_ID);
    assert_eq!(key(&constants["ataProgramId"]), ATA_ID);
    assert_eq!(constants["escrowSeedPrefix"].as_str().unwrap().as_bytes(), basic_escrow::ESCROW_SEED);
    assert_eq!(constants["vaultSeedPrefix"].as_str().unwrap().as_bytes(), basic_escrow::VAULT_SEED);
    let mints: Vec<Pubkey> = constants["mints"].as_array().unwrap().iter().map(|m| key(&m["address"])).collect();
    assert_eq!(mints, vec![TEST_MINT_OPEN, TEST_MINT_FREEZABLE]);
}

#[test]
fn pdas_and_associated_token_addresses_match_the_independent_fixture() {
    let fixture: Value = serde_json::from_str(INDEPENDENT).unwrap();
    let cases = fixture["escrowCases"].as_array().unwrap();
    assert!(cases.len() >= 6);
    let mut below_255 = 0;
    for case in cases {
        let seller = key(&case["seller"]);
        assert_eq!(hex(seller.as_ref()), case["sellerHex"].as_str().unwrap());
        let nonce = bytes32(&case["nonceHex"]);
        let (escrow, escrow_bump) = escrow_pda(&seller, &nonce);
        assert_eq!(escrow, key(&case["escrow"]["address"]), "escrow case {}", case["index"]);
        assert_eq!(u64::from(escrow_bump), case["escrow"]["bump"].as_u64().unwrap());
        let (vault, vault_bump) = vault_pda(&escrow);
        assert_eq!(vault, key(&case["vault"]["address"]));
        assert_eq!(u64::from(vault_bump), case["vault"]["bump"].as_u64().unwrap());
        below_255 += usize::from(escrow_bump < 255) + usize::from(vault_bump < 255);
        let buyer = key(&case["buyer"]);
        for entry in case["buyerAtas"].as_array().unwrap() {
            assert_eq!(ata(&buyer, &key(&entry["mint"])), key(&entry["ata"]["address"]));
        }
    }
    assert!(below_255 > 0, "fixture exercises non-255 canonical bumps");
}

#[test]
fn anchor_discriminators_match_the_independent_fixture() {
    let fixture: Value = serde_json::from_str(INDEPENDENT).unwrap();
    let d = &fixture["discriminators"];
    let check = |group: &str, name: &str, actual: &[u8]| {
        assert_eq!(hex(actual), d[group][name].as_str().unwrap(), "{group}.{name}");
    };
    check("accounts", "EscrowV1", basic_escrow::EscrowV1::DISCRIMINATOR);
    check("instructions", "fund_native", basic_escrow::instruction::FundNative::DISCRIMINATOR);
    check("instructions", "fund_spl", basic_escrow::instruction::FundSpl::DISCRIMINATOR);
    check("instructions", "release", basic_escrow::instruction::Release::DISCRIMINATOR);
    check("instructions", "refund", basic_escrow::instruction::Refund::DISCRIMINATOR);
    check("instructions", "payout_native", basic_escrow::instruction::PayoutNative::DISCRIMINATOR);
    check("instructions", "payout_spl", basic_escrow::instruction::PayoutSpl::DISCRIMINATOR);
    check("events", "Funded", basic_escrow::Funded::DISCRIMINATOR);
    check("events", "Released", basic_escrow::Released::DISCRIMINATOR);
    check("events", "Refunded", basic_escrow::Refunded::DISCRIMINATOR);
    check("events", "PaidOut", basic_escrow::PaidOut::DISCRIMINATOR);
}

#[test]
fn on_chain_terms_hash_matches_the_host_encoder_for_a_funded_trade() {
    let mut h = Harness::new(TokenBuild::Original);
    let seller = h.funded_keypair(10 * SOL);
    use solana_signer::Signer;
    let buyer = Pubkey::new_unique();
    let terms = args(buyer, 77, SOL, h.now());
    h.send(&[fund_native_ix(&seller.pubkey(), &terms)], &[&seller]).unwrap();
    let (escrow, _) = escrow_pda(&seller.pubkey(), &terms.seller_nonce);
    let zero = Pubkey::default();
    let expected = terms_hash(&TermsFields {
        genesis_hash: &basic_escrow::network::GENESIS_HASH,
        program_id: &basic_escrow::ID,
        order_id: &terms.order_id,
        seller: &seller.pubkey(),
        buyer: &buyer,
        mint: &zero,
        token_program: &zero,
        private_agreement_hash: &terms.private_agreement_hash,
        capabilities_hash: &terms.capabilities_hash,
        seller_nonce: &terms.seller_nonce,
        revision: terms.revision,
        asset_kind: 0,
        amount: terms.amount,
        accept_before: terms.accept_before,
        expiry: terms.expiry,
    });
    assert_eq!(h.escrow(&escrow).terms_hash, expected, "sol_sha256 on chain equals host SHA-256");
}
