// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {BasicEscrow} from "../../src/BasicEscrow.sol";

/// @dev Plain mintable exact-transfer token.
contract MockERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Burns 1% (rounded up, at least 1 unit) of every transfer: received != sent.
contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee", "FEE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) return super._update(from, to, value);
        uint256 fee = value / 100 + 1;
        if (fee > value) fee = value;
        super._update(from, address(0), fee);
        super._update(from, to, value - fee);
    }
}

/// @dev Issuer-style blacklist: transfers to a blacklisted address revert.
contract BlacklistToken is ERC20 {
    mapping(address => bool) public blacklisted;

    constructor() ERC20("Black", "BLK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlacklisted(address account, bool value) external {
        blacklisted[account] = value;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blacklisted[to] && !blacklisted[from], "blacklisted");
        super._update(from, to, value);
    }
}

/// @dev USDT-style token whose transfer/transferFrom return no data.
contract NoReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }

    function transfer(address to, uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
    }

    function transferFrom(address from, address to, uint256 amount) external {
        require(balanceOf[from] >= amount && allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// @dev Returns false (without reverting or moving funds) when the corresponding flag is set.
contract FalseReturnToken is ERC20 {
    bool public failTransfer;
    bool public failTransferFrom;

    constructor() ERC20("False", "FLS") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFail(bool transfer_, bool transferFrom_) external {
        failTransfer = transfer_;
        failTransferFrom = transferFrom_;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        if (failTransfer) return false;
        return super.transfer(to, value);
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        if (failTransferFrom) return false;
        return super.transferFrom(from, to, value);
    }
}

interface ITransferHook {
    function onTokenTransfer() external;
}

/// @dev ERC-777-like token that calls a hook on the recipient/sender after every transfer. Used only to
///      prove the reentrancy guard; such tokens are excluded from production allowlists by policy.
contract CallbackToken is ERC20 {
    address public hook;

    constructor() ERC20("Callback", "CBK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setHook(address hook_) external {
        hook = hook_;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (hook != address(0) && from != address(0)) ITransferHook(hook).onTokenTransfer();
    }
}

/// @dev Buyer/seller contract that rejects native payments until `accept` is enabled.
contract RevertingReceiver {
    bool public accept;

    function setAccept(bool value) external {
        accept = value;
    }

    function fundNative(BasicEscrow escrow, BasicEscrow.TradeTerms calldata terms) external payable returns (bytes32) {
        return escrow.fundNative{value: msg.value}(terms);
    }

    receive() external payable {
        require(accept, "rejecting");
    }
}

/// @dev Receiver that burns all forwarded gas.
contract GasBurner {
    receive() external payable {
        while (true) {}
    }
}

/// @dev Attacker that re-enters the escrow from its receive hook or a token callback.
contract ReentrancyAttacker is ITransferHook {
    enum Mode {
        None,
        Release,
        Refund,
        Withdraw
    }

    BasicEscrow public immutable escrow;
    Mode public mode;
    bytes32 public target;
    address public withdrawToken;
    bool public propagate;
    bool public reentered;
    bool public reentrySucceeded;
    bytes public lastError;

    constructor(BasicEscrow escrow_) {
        escrow = escrow_;
    }

    function configure(Mode mode_, bytes32 target_, address withdrawToken_, bool propagate_) external {
        mode = mode_;
        propagate = propagate_;
        reentered = false;
        target = target_;
        withdrawToken = withdrawToken_;
    }

    function fundNative(BasicEscrow.TradeTerms calldata terms) external payable returns (bytes32) {
        return escrow.fundNative{value: msg.value}(terms);
    }

    function fundToken(BasicEscrow.TradeTerms calldata terms) external returns (bytes32) {
        CallbackToken(terms.asset).approve(address(escrow), terms.amountBaseUnits);
        return escrow.fundToken(terms);
    }

    function release(bytes32 tradeId) external {
        escrow.release(tradeId);
    }

    function onTokenTransfer() external {
        _attack();
    }

    receive() external payable {
        _attack();
    }

    function _attack() private {
        if (mode == Mode.None || reentered) return;
        reentered = true;
        bool ok;
        bytes memory err;
        if (mode == Mode.Release) {
            (ok, err) = address(escrow).call(abi.encodeCall(BasicEscrow.release, (target)));
        } else if (mode == Mode.Refund) {
            (ok, err) = address(escrow).call(abi.encodeCall(BasicEscrow.refund, (target)));
        } else {
            (ok, err) = address(escrow).call(abi.encodeCall(BasicEscrow.withdraw, (address(this), withdrawToken)));
        }
        reentrySucceeded = ok;
        lastError = err;
        // Optionally propagate the failure so the outer payout observes a failed push or withdraw.
        if (propagate) require(ok, "reentry blocked");
    }
}
