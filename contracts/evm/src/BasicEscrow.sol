// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BasicEscrow — immutable seller-release / timeout-refund custody (basic v1)
/// @notice Holds one seller deposit per G16 trade. The trade id is computed on-chain as the G16 EVM
///         `termsHash` (EIP-712 digest of `TradeTerms` under this deployment's domain), so a funded escrow
///         is provably the exact terms both parties accepted off-chain. Before the deadline only the bound
///         seller can release to the bound buyer. At or after the deadline anyone can execute a refund that
///         pays only the bound seller. Released and refunded are terminal; a trade id and a seller nonce can
///         never be funded twice.
/// @dev Roadmap decision 2: there is no owner, admin, operator, juror, oracle, pause, proxy, upgrade,
///      sweep or destination override. Every privileged-looking input (allowlist, gas constants) is fixed
///      at deployment. The contract has no `receive`/`fallback`; ETH can only enter through `fundNative`
///      (or by force, which creates unowned surplus with no withdrawal path).
///
///      Payout failure policy (see SECURITY-NOTES.md): settlement first attempts a push transfer. Native
///      pushes forward a fixed `NATIVE_PUSH_GAS` stipend and copy no return data. If the push fails
///      (recipient reverts, runs out of stipend, or an allowlisted token refuses the transfer, e.g. an
///      issuer blacklist), the trade still reaches its terminal state and the exact principal is credited
///      to `pendingWithdrawals[recipient][asset]`. Anyone may later call `withdraw(recipient, asset)`,
///      which pays only that recipient. A reverting buyer therefore cannot block the seller's release
///      decision, cannot trap funds, and cannot cause any payment to a different address.
contract BasicEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Lifecycle of one trade id. `None` is the only state from which funding is accepted.
    enum State {
        None,
        Funded,
        Released,
        Refunded
    }

    /// @notice Immutable terms bound at funding plus the current lifecycle state.
    /// @dev `token == address(0)` denotes the chain's native asset. Packed into three storage slots.
    struct Escrow {
        address seller;
        uint64 deadline;
        State state;
        address buyer;
        address token;
        uint256 amount;
    }

    /// @notice G16 public terms (basic manual v1). Field order and types mirror
    ///         `packages/wallet/src/evm-terms.ts` TRADE_TERMS_TYPE; the constant fields `v = 1` and
    ///         `mode = 0` are not passed and are hashed as constants.
    /// @dev `escrowExpirySeconds` becomes the escrow deadline. `assetKind` 0 = native (asset must be zero),
    ///      1 = ERC-20 (asset is the token).
    struct TradeTerms {
        bytes32 orderId;
        uint64 revision;
        string networkId;
        string deploymentId;
        address seller;
        address buyer;
        uint8 assetKind;
        address asset;
        uint256 amountBaseUnits;
        bytes32 privateAgreementHash;
        bytes32 capabilitiesHash;
        bytes32 sellerNonce;
        uint64 acceptBeforeSeconds;
        uint64 escrowExpirySeconds;
    }

    /// @notice EIP-712 type string, identical to the G16 TypeScript encoder.
    bytes32 public constant TRADE_TERMS_TYPEHASH = keccak256(
        "TradeTerms(uint8 v,bytes32 orderId,uint64 revision,string networkId,string deploymentId,address seller,"
        "address buyer,uint8 assetKind,address asset,uint256 amountBaseUnits,bytes32 privateAgreementHash,bytes32 capabilitiesHash,"
        "bytes32 sellerNonce,uint64 acceptBeforeSeconds,uint64 escrowExpirySeconds,uint8 mode)"
    );

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("P2POfframp");
    bytes32 private constant VERSION_HASH = keccak256("1");

    /// @notice Version label clients bind into terms and deployment registries.
    string public constant VERSION = "p2p-offramp.basic-escrow.evm.v1";

    /// @notice Minimum time between funding and deadline (spec DeadlinePolicyV1.minDurationSeconds).
    uint256 public constant MIN_DURATION = 1800;

    /// @notice Maximum time between funding and deadline (spec DeadlinePolicyV1.maxDurationSeconds).
    uint256 public constant MAX_DURATION = 604800;

    /// @notice Maximum number of allowlisted ERC-20 tokens fixed at deployment.
    uint256 public constant MAX_ALLOWLIST = 32;

    /// @notice Gas forwarded to a native recipient on the push attempt.
    uint256 public constant NATIVE_PUSH_GAS = 50_000;

    /// @notice Minimum gas that must remain when a settlement payout begins. It guarantees the native
    ///         stipend is fully available and that a failed push can still be recorded, so a third-party
    ///         caller cannot force a deferral by under-supplying gas.
    uint256 public constant MIN_PAYOUT_GAS = 120_000;

    mapping(bytes32 tradeId => Escrow) private _escrows;

    /// @notice Principal owed to an account whose push payout failed, per asset (`address(0)` = native).
    mapping(address account => mapping(address asset => uint256)) public pendingWithdrawals;

    /// @notice Whether a seller nonce has funded a trade (G16: nonces are single-use per seller).
    mapping(address seller => mapping(bytes32 nonce => bool)) public sellerNonceUsed;

    mapping(address token => bool) private _allowed;
    address[] private _allowlist;

    /// @notice A seller deposited and bound the trade's terms.
    event Funded(
        bytes32 indexed tradeId,
        address indexed seller,
        address indexed buyer,
        address token,
        uint256 amount,
        uint64 deadline
    );

    /// @notice The seller released the trade; principal is owed to the bound buyer.
    event Released(bytes32 indexed tradeId, address indexed buyer, address token, uint256 amount);

    /// @notice The trade was refunded at/after deadline; principal is owed to the bound seller.
    event Refunded(bytes32 indexed tradeId, address indexed seller, address indexed caller, address token, uint256 amount);

    /// @notice A terminal payout could not be pushed and was credited for later withdrawal.
    event PayoutDeferred(bytes32 indexed tradeId, address indexed recipient, address token, uint256 amount);

    /// @notice A deferred credit was paid to its recipient.
    event Withdrawn(address indexed recipient, address indexed caller, address token, uint256 amount);

    /// @notice Terms are malformed for this function (asset kind/asset mismatch, zero revision).
    error InvalidTerms();
    /// @notice The seller nonce was already used by a funded trade.
    error SellerNonceUsed(address seller, bytes32 nonce);
    /// @notice Funding attempted at or after `acceptBeforeSeconds`.
    error AcceptanceExpired(uint64 acceptBeforeSeconds);
    /// @notice `tradeId` was already used; ids are single-use forever.
    error TradeIdUsed(bytes32 tradeId);
    /// @notice Buyer was zero, the seller, or this contract.
    error InvalidBuyer(address buyer);
    /// @notice Principal was zero.
    error ZeroAmount();
    /// @notice Asset is not on the deployment allowlist.
    error UnsupportedAsset(address token);
    /// @notice Deadline outside [now + MIN_DURATION, now + MAX_DURATION].
    error DeadlineOutOfRange(uint64 deadline, uint256 earliest, uint256 latest);
    /// @notice Escrow balance delta did not equal the declared principal (fee-on-transfer or similar).
    error IncorrectDeposit(uint256 expected, uint256 received);
    /// @notice Trade is not in the state required by the action.
    error InvalidState(bytes32 tradeId, State state);
    /// @notice Caller is not the bound seller.
    error Unauthorized(address caller);
    /// @notice Release attempted at or after deadline.
    error DeadlinePassed(uint64 deadline);
    /// @notice Refund attempted before deadline.
    error DeadlineNotReached(uint64 deadline);
    /// @notice Not enough gas left to perform the payout attempt deterministically.
    error InsufficientGas(uint256 available, uint256 required);
    /// @notice No deferred credit exists for the account and asset.
    error NothingToWithdraw();
    /// @notice The native withdrawal transfer failed; the credit is preserved.
    error WithdrawalFailed();
    /// @notice Constructor allowlist entry was zero, had no code, or was duplicated.
    error InvalidAllowlistEntry(address token);
    /// @notice Constructor allowlist exceeded MAX_ALLOWLIST.
    error AllowlistTooLarge(uint256 length);

    /// @param tokens ERC-20 tokens accepted by `fundToken`. Fixed forever. Policy: only plain
    ///        exact-transfer tokens; rebasing, fee-on-transfer, ERC-777/ERC-1363-style callback and
    ///        gas-griefing tokens MUST NOT be listed (the balance-delta check rejects fees at funding
    ///        but cannot detect later rebases or callbacks).
    constructor(address[] memory tokens) {
        uint256 length = tokens.length;
        if (length > MAX_ALLOWLIST) revert AllowlistTooLarge(length);
        for (uint256 i; i < length; ++i) {
            address token = tokens[i];
            if (token == address(0) || token.code.length == 0 || _allowed[token]) {
                revert InvalidAllowlistEntry(token);
            }
            _allowed[token] = true;
            _allowlist.push(token);
        }
    }

    /// @notice Seller (`terms.seller == msg.sender`) deposits native principal for native-asset terms.
    /// @dev `msg.value` must equal `terms.amountBaseUnits`. The deadline is `terms.escrowExpirySeconds`.
    /// @return tradeId The G16 termsHash of `terms` under this deployment's EIP-712 domain.
    function fundNative(TradeTerms calldata terms) external payable nonReentrant returns (bytes32 tradeId) {
        if (terms.assetKind != 0 || terms.asset != address(0)) revert InvalidTerms();
        uint256 amount = terms.amountBaseUnits;
        if (msg.value != amount) revert IncorrectDeposit(amount, msg.value);
        tradeId = _bind(terms);
        emit Funded(tradeId, msg.sender, terms.buyer, address(0), amount, terms.escrowExpirySeconds);
    }

    /// @notice Seller deposits exactly `terms.amountBaseUnits` of the allowlisted ERC-20 `terms.asset`.
    /// @dev Requires prior ERC-20 approval. Reverts unless the escrow's balance rises by exactly the principal.
    /// @return tradeId The G16 termsHash of `terms` under this deployment's EIP-712 domain.
    function fundToken(TradeTerms calldata terms) external nonReentrant returns (bytes32 tradeId) {
        address token = terms.asset;
        if (terms.assetKind != 1) revert InvalidTerms();
        if (token == address(0) || !_allowed[token]) revert UnsupportedAsset(token);
        uint256 amount = terms.amountBaseUnits;
        tradeId = _bind(terms);

        IERC20 asset = IERC20(token);
        uint256 balanceBefore = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = asset.balanceOf(address(this));
        uint256 received = balanceAfter > balanceBefore ? balanceAfter - balanceBefore : 0;
        if (received != amount) revert IncorrectDeposit(amount, received);

        emit Funded(tradeId, msg.sender, terms.buyer, token, amount, terms.escrowExpirySeconds);
    }

    /// @notice Seller releases principal to the bound buyer. Only strictly before the deadline.
    function release(bytes32 tradeId) external nonReentrant {
        Escrow storage escrow = _escrows[tradeId];
        if (escrow.state != State.Funded) revert InvalidState(tradeId, escrow.state);
        if (msg.sender != escrow.seller) revert Unauthorized(msg.sender);
        if (block.timestamp >= escrow.deadline) revert DeadlinePassed(escrow.deadline);

        escrow.state = State.Released;
        (address buyer, address token, uint256 amount) = (escrow.buyer, escrow.token, escrow.amount);
        emit Released(tradeId, buyer, token, amount);
        _payout(tradeId, buyer, token, amount);
    }

    /// @notice Anyone executes the timeout refund at or after the deadline; pays only the bound seller.
    function refund(bytes32 tradeId) external nonReentrant {
        Escrow storage escrow = _escrows[tradeId];
        if (escrow.state != State.Funded) revert InvalidState(tradeId, escrow.state);
        if (block.timestamp < escrow.deadline) revert DeadlineNotReached(escrow.deadline);

        escrow.state = State.Refunded;
        (address seller, address token, uint256 amount) = (escrow.seller, escrow.token, escrow.amount);
        emit Refunded(tradeId, seller, msg.sender, token, amount);
        _payout(tradeId, seller, token, amount);
    }

    /// @notice Pays a deferred credit to `recipient`. Callable by anyone; the destination is never the
    ///         caller's choice. Forwards all gas. On failure the whole call reverts and the credit remains.
    function withdraw(address recipient, address token) external nonReentrant {
        uint256 amount = pendingWithdrawals[recipient][token];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[recipient][token] = 0;
        emit Withdrawn(recipient, msg.sender, token, amount);
        if (token == address(0)) {
            bool ok;
            assembly ("memory-safe") {
                ok := call(gas(), recipient, amount, 0, 0, 0, 0)
            }
            if (!ok) revert WithdrawalFailed();
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
    }

    /// @notice G16 EVM termsHash of `terms` for this deployment: keccak256(0x1901 || domainSeparator ||
    ///         hashStruct(TradeTerms)). Equals `evmTermsHash` in packages/wallet/src/evm-terms.ts.
    function tradeIdOf(TradeTerms calldata terms) public view returns (bytes32) {
        return keccak256(abi.encodePacked(hex"1901", domainSeparator(), _structHash(terms)));
    }

    /// @notice EIP-712 domain separator: name "P2POfframp", version "1", this chain, this contract.
    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    /// @notice Returns the bound terms and state of `tradeId` (all zero for an unused id).
    function getTrade(bytes32 tradeId) external view returns (Escrow memory) {
        return _escrows[tradeId];
    }

    /// @notice Whether `token` may be used with `fundToken`. Native (`address(0)`) is always accepted
    ///         by `fundNative` and is reported as false here.
    function isAllowlisted(address token) external view returns (bool) {
        return _allowed[token];
    }

    /// @notice The deployment's fixed ERC-20 allowlist, in constructor order.
    function allowlistedTokens() external view returns (address[] memory) {
        return _allowlist;
    }

    /// @dev Shared funding checks and effects. The caller performs the asset-specific deposit afterwards.
    function _bind(TradeTerms calldata terms) private returns (bytes32 tradeId) {
        if (terms.seller != msg.sender) revert Unauthorized(msg.sender);
        address buyer = terms.buyer;
        if (buyer == address(0) || buyer == msg.sender || buyer == address(this)) revert InvalidBuyer(buyer);
        if (terms.revision == 0) revert InvalidTerms();
        if (terms.amountBaseUnits == 0) revert ZeroAmount();
        if (block.timestamp >= terms.acceptBeforeSeconds) revert AcceptanceExpired(terms.acceptBeforeSeconds);
        uint64 deadline = terms.escrowExpirySeconds;
        uint256 earliest = block.timestamp + MIN_DURATION;
        uint256 latest = block.timestamp + MAX_DURATION;
        if (deadline < earliest || deadline > latest) revert DeadlineOutOfRange(deadline, earliest, latest);

        tradeId = tradeIdOf(terms);
        Escrow storage escrow = _escrows[tradeId];
        if (escrow.state != State.None) revert TradeIdUsed(tradeId);
        if (sellerNonceUsed[msg.sender][terms.sellerNonce]) revert SellerNonceUsed(msg.sender, terms.sellerNonce);

        sellerNonceUsed[msg.sender][terms.sellerNonce] = true;
        escrow.seller = msg.sender;
        escrow.deadline = deadline;
        escrow.state = State.Funded;
        escrow.buyer = buyer;
        escrow.token = terms.asset;
        escrow.amount = terms.amountBaseUnits;
    }

    /// @dev hashStruct(TradeTerms) with v = 1 and mode = 0, split in two words-blocks to bound stack use.
    function _structHash(TradeTerms calldata terms) private pure returns (bytes32) {
        bytes memory head = abi.encode(
            TRADE_TERMS_TYPEHASH,
            uint8(1),
            terms.orderId,
            terms.revision,
            keccak256(bytes(terms.networkId)),
            keccak256(bytes(terms.deploymentId)),
            terms.seller,
            terms.buyer
        );
        bytes memory tail = abi.encode(
            terms.assetKind,
            terms.asset,
            terms.amountBaseUnits,
            terms.privateAgreementHash,
            terms.capabilitiesHash,
            terms.sellerNonce,
            terms.acceptBeforeSeconds,
            terms.escrowExpirySeconds,
            uint8(0)
        );
        return keccak256(bytes.concat(head, tail));
    }

    /// @dev Push `amount` of `token` to `recipient`; on failure credit it for `withdraw`. State is
    ///      already terminal when this runs, and the reentrancy guard is held.
    function _payout(bytes32 tradeId, address recipient, address token, uint256 amount) private {
        uint256 available = gasleft();
        if (available < MIN_PAYOUT_GAS) revert InsufficientGas(available, MIN_PAYOUT_GAS);
        bool ok;
        if (token == address(0)) {
            uint256 stipend = NATIVE_PUSH_GAS;
            assembly ("memory-safe") {
                ok := call(stipend, recipient, amount, 0, 0, 0, 0)
            }
        } else {
            ok = IERC20(token).trySafeTransfer(recipient, amount);
        }
        if (!ok) {
            pendingWithdrawals[recipient][token] += amount;
            emit PayoutDeferred(tradeId, recipient, token, amount);
        }
    }
}
