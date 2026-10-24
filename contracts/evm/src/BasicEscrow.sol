// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BasicEscrow — immutable seller-release / timeout-refund custody (basic v1)
/// @notice Holds one seller deposit per opaque `tradeId`. Before the deadline only the bound seller can
///         release to the bound buyer. At or after the deadline anyone can execute a refund that pays only
///         the bound seller. Released and refunded are terminal; a trade id can never be funded twice.
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

    /// @notice `tradeId` was zero.
    error ZeroTradeId();
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

    /// @notice Seller deposits `msg.value` of the native asset for `buyer`.
    /// @param tradeId Opaque nonzero id derived off-chain from signed terms; single use.
    /// @param buyer Recipient of a release. Immutable once funded.
    /// @param deadline Unix seconds; release requires `block.timestamp < deadline`, refund `>=`.
    function fundNative(bytes32 tradeId, address buyer, uint64 deadline) external payable nonReentrant {
        _bind(tradeId, buyer, address(0), msg.value, deadline);
        emit Funded(tradeId, msg.sender, buyer, address(0), msg.value, deadline);
    }

    /// @notice Seller deposits exactly `amount` of allowlisted `token` for `buyer`.
    /// @dev Requires prior ERC-20 approval. Reverts unless the escrow's balance rises by exactly `amount`.
    function fundToken(bytes32 tradeId, address buyer, address token, uint256 amount, uint64 deadline)
        external
        nonReentrant
    {
        if (token == address(0) || !_allowed[token]) revert UnsupportedAsset(token);
        _bind(tradeId, buyer, token, amount, deadline);

        IERC20 asset = IERC20(token);
        uint256 balanceBefore = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = asset.balanceOf(address(this));
        uint256 received = balanceAfter > balanceBefore ? balanceAfter - balanceBefore : 0;
        if (received != amount) revert IncorrectDeposit(amount, received);

        emit Funded(tradeId, msg.sender, buyer, token, amount, deadline);
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

    /// @dev Shared funding checks and effects. Caller supplies the asset-specific deposit.
    function _bind(bytes32 tradeId, address buyer, address token, uint256 amount, uint64 deadline) private {
        if (tradeId == bytes32(0)) revert ZeroTradeId();
        Escrow storage escrow = _escrows[tradeId];
        if (escrow.state != State.None) revert TradeIdUsed(tradeId);
        if (buyer == address(0) || buyer == msg.sender || buyer == address(this)) revert InvalidBuyer(buyer);
        if (amount == 0) revert ZeroAmount();
        uint256 earliest = block.timestamp + MIN_DURATION;
        uint256 latest = block.timestamp + MAX_DURATION;
        if (deadline < earliest || deadline > latest) revert DeadlineOutOfRange(deadline, earliest, latest);

        escrow.seller = msg.sender;
        escrow.deadline = deadline;
        escrow.state = State.Funded;
        escrow.buyer = buyer;
        escrow.token = token;
        escrow.amount = amount;
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
