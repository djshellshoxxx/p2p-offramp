use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Revision and amount must be at least 1.")]
    ZeroValue,
    #[msg("Buyer must differ from the seller, the zero key, the escrow and the vault.")]
    InvalidBuyer,
    #[msg("Native escrows refuse an executable buyer account.")]
    ExecutableBuyer,
    #[msg("The chain clock is negative.")]
    NegativeClock,
    #[msg("Funding attempted at or after acceptBefore.")]
    AcceptanceExpired,
    #[msg("Deadline outside [now + 1800, now + 604800].")]
    DeadlineOutOfRange,
    #[msg("Mint is not on the compiled allowlist or its decimals differ.")]
    MintNotAllowed,
    #[msg("Source token account is delegated or frozen.")]
    SourceTokenAccountRestricted,
    #[msg("Vault does not hold exactly the funded amount or has a delegate/close authority.")]
    VaultMismatch,
    #[msg("Escrow does not hold the funded principal above its rent reserve.")]
    PrincipalMismatch,
    #[msg("Escrow asset kind does not match this instruction.")]
    AssetKindMismatch,
    #[msg("Escrow is not in the state this instruction requires.")]
    InvalidState,
    #[msg("Release attempted at or after the deadline.")]
    DeadlinePassed,
    #[msg("Refund attempted before the deadline.")]
    DeadlineNotReached,
    #[msg("Principal was already paid out.")]
    AlreadyPaidOut,
    #[msg("Payout destination is not the stored recipient's canonical account.")]
    WrongRecipient,
    #[msg("Payout destination token account is frozen.")]
    DestinationFrozen,
}
