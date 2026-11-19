//! The opt-in browser fixture compiles the genesis of an already running local ledger.
//! Ordinary builds cannot pick up these environment values. No production network profile is supplied.
use std::{env, fs, path::PathBuf};

fn main() {
    for name in [
        "P2P_SOLANA_BROWSER_FIXTURE",
        "P2P_SOLANA_BROWSER_GENESIS_HEX",
        "P2P_SOLANA_BROWSER_PROGRAM_ID",
    ] {
        println!("cargo:rerun-if-env-changed={name}");
    }
    if env::var_os("CARGO_FEATURE_BROWSER_LOCALNET").is_none() {
        return;
    }
    assert!(env::var_os("CARGO_FEATURE_LOCALNET").is_none(), "choose one local profile");
    assert_eq!(env::var("P2P_SOLANA_BROWSER_FIXTURE").as_deref(), Ok("local-validator-only"));
    let genesis = env::var("P2P_SOLANA_BROWSER_GENESIS_HEX").expect("actual local genesis is required");
    assert!(genesis.len() == 64 && genesis.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)));
    let bytes: Vec<u8> = (0..32)
        .map(|i| u8::from_str_radix(&genesis[i * 2..i * 2 + 2], 16).expect("canonical genesis hex"))
        .collect();
    assert!(bytes.iter().any(|b| *b != 0));
    assert_ne!(bytes.as_slice(), b"genesis-hash:p2p-offramp:localv1");
    let program = env::var("P2P_SOLANA_BROWSER_PROGRAM_ID").expect("local program key is required");
    const BASE58: &str = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    assert!((32..=44).contains(&program.len()) && program.chars().all(|c| BASE58.contains(c)));
    assert_ne!(program, "11111111111111111111111111111111");
    let out = PathBuf::from(env::var_os("OUT_DIR").expect("Cargo OUT_DIR"));
    fs::write(out.join("browser_genesis.rs"), format!("pub const GENESIS_HASH: [u8; 32] = {bytes:?};\n"))
        .expect("write local genesis profile");
    fs::write(out.join("browser_program_id.rs"), format!("declare_id!(\"{program}\");\n"))
        .expect("write local program id");
}
