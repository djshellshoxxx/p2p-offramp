//! LiteSVM harness for the basic escrow. Loads the exact `cargo build-sbf --features localnet` output,
//! controls the Clock sysvar for exact-second boundaries, and selects the SPL Token build explicitly:
//! the original SPL Token 3.5.0 ELF (hash-pinned) or the p-token build mainnet now runs at the same ID.
#![allow(dead_code)]

use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use basic_escrow::network::{TEST_MINT_FREEZABLE, TEST_MINT_OPEN};
use basic_escrow::{EscrowV1, FundArgs, ESCROW_SEED, VAULT_SEED};
use litesvm::LiteSVM;
use solana_account::Account;
use solana_clock::Clock;
use solana_instruction::{error::InstructionError, AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_message::{Message, VersionedMessage};
use solana_program_pack::Pack;
use solana_signer::Signer;
use solana_transaction::versioned::VersionedTransaction;
use solana_transaction_error::TransactionError;
use spl_token_interface::state::{Account as TokenAccountState, AccountState, Mint as MintState};

pub use anchor_lang::prelude::Pubkey;

pub const PROGRAM_SO: &[u8] =
    include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/basic_escrow.so"));
pub const TOKEN_ID: Pubkey = anchor_spl::token::ID;
pub const TOKEN_2022_ID: Pubkey = anchor_spl::token_2022::ID;
pub const ATA_ID: Pubkey = anchor_lang::pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
pub const SYSTEM_ID: Pubkey = anchor_lang::system_program::ID;
/// SHA-256 of `spl_token-3.5.0.so` as bundled by litesvm 0.15.0 (original SPL Token build).
pub const ORIGINAL_SPL_ELF_SHA256: &str = "7b44674b9704fa7640fbebfac68389f338b500b8c2bc29175c27ed66838b5a3c";
/// Capabilities hash of a core trade (count-zero encoding), as in the G16 vectors.
pub const CORE_CAPABILITIES_HASH: [u8; 32] = hex32("6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d");

pub const START_TIME: i64 = 1_800_000_000;
pub const DAY: u64 = 86_400;
pub const SOL: u64 = 1_000_000_000;

pub const fn hex32(text: &str) -> [u8; 32] {
    let bytes = text.as_bytes();
    let mut out = [0u8; 32];
    let mut index = 0;
    while index < 32 {
        out[index] = (nibble(bytes[2 * index]) << 4) | nibble(bytes[2 * index + 1]);
        index += 1;
    }
    out
}

const fn nibble(c: u8) -> u8 {
    match c {
        b'0'..=b'9' => c - b'0',
        b'a'..=b'f' => c - b'a' + 10,
        _ => panic!("lowercase hex only"),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TokenBuild {
    /// Original SPL Token 3.5.0, loaded explicitly with the p-token replacement feature off.
    Original,
    /// LiteSVM mainnet feature set (sourced 2026-07-10): p-token at the SPL Token ID.
    PToken,
}

pub struct Harness {
    pub svm: LiteSVM,
    pub payer: Keypair,
}

impl Harness {
    pub fn new(build: TokenBuild) -> Self {
        let mut features = LiteSVM::mainnet_feature_set();
        if build == TokenBuild::Original {
            features.deactivate(&agave_feature_set::replace_spl_token_with_p_token::id());
        }
        let mut svm = LiteSVM::default()
            .with_feature_set(features)
            .with_builtins()
            .with_lamports(1_000_000 * SOL)
            .with_sysvars()
            .with_feature_accounts()
            .with_default_programs()
            .with_sigverify(true)
            .with_blockhash_check(true);
        if build == TokenBuild::Original {
            let token = svm.get_account(&TOKEN_ID).expect("token program loaded");
            assert_eq!(sha256_hex(&token.data), ORIGINAL_SPL_ELF_SHA256, "original SPL Token build pin");
        }
        svm.add_program(basic_escrow::ID, PROGRAM_SO).expect("load escrow program");
        let payer = Keypair::new();
        svm.airdrop(&payer.pubkey(), 100 * SOL).unwrap();
        let mut harness = Self { svm, payer };
        harness.set_time(START_TIME);
        harness
    }

    pub fn set_time(&mut self, unix_timestamp: i64) {
        let mut clock: Clock = self.svm.get_sysvar();
        clock.unix_timestamp = unix_timestamp;
        self.svm.set_sysvar(&clock);
    }

    pub fn now(&self) -> u64 {
        let clock: Clock = self.svm.get_sysvar();
        u64::try_from(clock.unix_timestamp).unwrap()
    }

    pub fn funded_keypair(&mut self, lamports: u64) -> Keypair {
        let keypair = Keypair::new();
        self.svm.airdrop(&keypair.pubkey(), lamports).unwrap();
        keypair
    }

    pub fn lamports(&self, address: &Pubkey) -> u64 {
        self.svm.get_account(address).map(|account| account.lamports).unwrap_or(0)
    }

    pub fn rent(&self, data_len: usize) -> u64 {
        self.svm.minimum_balance_for_rent_exemption(data_len)
    }

    /// Sends one transaction signed by the payer and `signers`. A fresh blockhash keeps identical
    /// retries distinct, so a repeated instruction is evaluated again instead of deduplicated.
    pub fn send(&mut self, instructions: &[Instruction], signers: &[&Keypair]) -> Result<(), TransactionError> {
        self.svm.expire_blockhash();
        let mut all: Vec<&Keypair> = vec![&self.payer];
        all.extend_from_slice(signers);
        let blockhash = self.svm.latest_blockhash();
        let message = Message::new_with_blockhash(instructions, Some(&self.payer.pubkey()), &blockhash);
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(message), &all).unwrap();
        self.svm.send_transaction(tx).map(|_| ()).map_err(|failure| failure.err)
    }

    // ----- token fixtures (accounts written directly; the token program then operates on them) -----

    pub fn put_mint(
        &mut self,
        address: Pubkey,
        decimals: u8,
        authority: Pubkey,
        freeze: Option<Pubkey>,
        owner: Pubkey,
    ) {
        let mint = MintState {
            mint_authority: Some(authority).into(),
            supply: 0,
            decimals,
            is_initialized: true,
            freeze_authority: freeze.into(),
        };
        let mut data = vec![0u8; MintState::LEN];
        MintState::pack(mint, &mut data).unwrap();
        self.put_account(address, data, owner);
    }

    pub fn put_token_account(&mut self, address: Pubkey, mint: Pubkey, owner: Pubkey, amount: u64, frozen: bool) {
        self.put_token_account_full(address, mint, owner, amount, frozen, None);
    }

    pub fn put_token_account_full(
        &mut self,
        address: Pubkey,
        mint: Pubkey,
        owner: Pubkey,
        amount: u64,
        frozen: bool,
        delegate: Option<Pubkey>,
    ) {
        let account = TokenAccountState {
            mint,
            owner,
            amount,
            delegate: delegate.into(),
            state: if frozen { AccountState::Frozen } else { AccountState::Initialized },
            is_native: None.into(),
            delegated_amount: if delegate.is_some() { amount } else { 0 },
            close_authority: None.into(),
        };
        let mut data = vec![0u8; TokenAccountState::LEN];
        TokenAccountState::pack(account, &mut data).unwrap();
        self.put_account(address, data, TOKEN_ID);
    }

    pub fn put_account(&mut self, address: Pubkey, data: Vec<u8>, owner: Pubkey) {
        let lamports = self.rent(data.len());
        let account = Account { lamports, data, owner, executable: false, rent_epoch: 0 };
        self.svm.set_account(address, account).unwrap();
    }

    pub fn token_amount(&self, address: &Pubkey) -> u64 {
        let account = self.svm.get_account(address).expect("token account exists");
        TokenAccountState::unpack(&account.data).unwrap().amount
    }

    pub fn set_frozen(&mut self, address: Pubkey, frozen: bool) {
        let mut account = self.svm.get_account(&address).unwrap();
        let mut state = TokenAccountState::unpack(&account.data).unwrap();
        state.state = if frozen { AccountState::Frozen } else { AccountState::Initialized };
        TokenAccountState::pack(state, &mut account.data).unwrap();
        self.svm.set_account(address, account).unwrap();
    }

    /// Writes both allowlisted test mints (the freezable one has `freeze` as freeze authority).
    pub fn put_test_mints(&mut self, mint_authority: Pubkey, freeze: Pubkey) {
        self.put_mint(TEST_MINT_OPEN, 6, mint_authority, None, TOKEN_ID);
        self.put_mint(TEST_MINT_FREEZABLE, 6, mint_authority, Some(freeze), TOKEN_ID);
    }

    pub fn escrow(&self, address: &Pubkey) -> EscrowV1 {
        let account = self.svm.get_account(address).expect("escrow exists");
        EscrowV1::try_deserialize(&mut account.data.as_slice()).unwrap()
    }
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    solana_sha256_hasher::hash(bytes).to_bytes().iter().map(|b| format!("{b:02x}")).collect()
}

pub fn escrow_pda(seller: &Pubkey, nonce: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[ESCROW_SEED, seller.as_ref(), nonce], &basic_escrow::ID)
}

pub fn vault_pda(escrow: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_SEED, escrow.as_ref()], &basic_escrow::ID)
}

pub fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    anchor_spl::associated_token::get_associated_token_address_with_program_id(owner, mint, &TOKEN_ID)
}

/// Terms that satisfy every funding rule at `now`: one day to accept, two days to the deadline.
pub fn args(buyer: Pubkey, nonce_tag: u8, amount: u64, now: u64) -> FundArgs {
    FundArgs {
        order_id: [0x11; 32],
        buyer,
        private_agreement_hash: [0x22; 32],
        capabilities_hash: CORE_CAPABILITIES_HASH,
        seller_nonce: [nonce_tag; 32],
        revision: 1,
        amount,
        accept_before: now + DAY,
        expiry: now + 2 * DAY,
    }
}

pub fn fund_native_ix(seller: &Pubkey, args: &FundArgs) -> Instruction {
    let (escrow, _) = escrow_pda(seller, &args.seller_nonce);
    let accounts =
        basic_escrow::accounts::FundNative { seller: *seller, escrow, buyer: args.buyer, system_program: SYSTEM_ID };
    Instruction {
        program_id: basic_escrow::ID,
        accounts: accounts.to_account_metas(None),
        data: basic_escrow::instruction::FundNative { args: args.clone() }.data(),
    }
}

pub fn fund_spl_ix(seller: &Pubkey, args: &FundArgs, mint: &Pubkey, seller_token: &Pubkey) -> Instruction {
    let (escrow, _) = escrow_pda(seller, &args.seller_nonce);
    let (vault, _) = vault_pda(&escrow);
    let accounts = basic_escrow::accounts::FundSpl {
        seller: *seller,
        escrow,
        mint: *mint,
        seller_token: *seller_token,
        vault,
        token_program: TOKEN_ID,
        system_program: SYSTEM_ID,
    };
    Instruction {
        program_id: basic_escrow::ID,
        accounts: accounts.to_account_metas(None),
        data: basic_escrow::instruction::FundSpl { args: args.clone() }.data(),
    }
}

pub fn release_ix(seller: &Pubkey, escrow: &Pubkey) -> Instruction {
    let accounts = basic_escrow::accounts::Release { seller: *seller, escrow: *escrow };
    Instruction {
        program_id: basic_escrow::ID,
        accounts: accounts.to_account_metas(None),
        data: basic_escrow::instruction::Release {}.data(),
    }
}

pub fn refund_ix(escrow: &Pubkey) -> Instruction {
    let accounts = basic_escrow::accounts::Refund { escrow: *escrow };
    Instruction {
        program_id: basic_escrow::ID,
        accounts: accounts.to_account_metas(None),
        data: basic_escrow::instruction::Refund {}.data(),
    }
}

pub fn payout_native_ix(escrow: &Pubkey, recipient: &Pubkey) -> Instruction {
    let accounts = basic_escrow::accounts::PayoutNative { escrow: *escrow, recipient: *recipient };
    Instruction {
        program_id: basic_escrow::ID,
        accounts: accounts.to_account_metas(None),
        data: basic_escrow::instruction::PayoutNative {}.data(),
    }
}

pub fn payout_spl_ix(escrow: &Pubkey, vault: &Pubkey, mint: &Pubkey, destination: &Pubkey) -> Instruction {
    let accounts = basic_escrow::accounts::PayoutSpl {
        escrow: *escrow,
        vault: *vault,
        mint: *mint,
        destination: *destination,
        token_program: TOKEN_ID,
    };
    Instruction {
        program_id: basic_escrow::ID,
        accounts: accounts.to_account_metas(None),
        data: basic_escrow::instruction::PayoutSpl {}.data(),
    }
}

/// Replaces one account meta (by position) to model an account-substitution attack.
pub fn substitute(mut instruction: Instruction, index: usize, address: Pubkey) -> Instruction {
    let old = &instruction.accounts[index];
    instruction.accounts[index] =
        AccountMeta { pubkey: address, is_signer: old.is_signer, is_writable: old.is_writable };
    instruction
}

/// Extracts the custom/Anchor error code of the failing instruction.
pub fn code(result: Result<(), TransactionError>) -> u32 {
    match result {
        Err(TransactionError::InstructionError(_, InstructionError::Custom(code))) => code,
        other => panic!("expected a custom program error, got {other:?}"),
    }
}

/// Anchor custom error number (6000 + variant index).
pub fn escrow_error(error: basic_escrow::error::EscrowError) -> u32 {
    u32::from(error)
}
