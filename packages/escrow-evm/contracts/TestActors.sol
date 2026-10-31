// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @dev Deliberately unsafe actors for local adversarial tests only; never deployment candidates.
contract TestToken {
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint8 public mode; address public callbackTarget; bytes public callbackData; bool public callbackSucceeded;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; totalSupply += amount; }
    function setMode(uint8 next) external { mode = next; }
    function setCallback(address target, bytes calldata data) external { callbackTarget = target; callbackData = data; }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; return true; }
    function transfer(address to, uint256 amount) external returns (bool) { return _transfer(msg.sender, to, amount); }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance"); allowance[from][msg.sender] -= amount;
        return _transfer(from, to, amount);
    }
    function _transfer(address from, address to, uint256 amount) private returns (bool) {
        if (mode == 1) return false;
        require(mode != 4, "revert token"); require(balanceOf[from] >= amount, "balance");
        if (mode == 6) { balanceOf[to] += 1; totalSupply += 1; }
        balanceOf[from] -= mode == 7 ? amount + 1 : amount; balanceOf[to] += mode == 3 ? amount - 1 : amount;
        if (mode == 5) (callbackSucceeded,) = callbackTarget.call(callbackData);
        if (mode == 2) assembly ("memory-safe") { return(0,0) }
        return true;
    }
}
contract TestWallet {
    address public immutable signer; bool public revoked; bool public rejectPayment;
    address public callbackTarget; bytes public callbackData; bool public callbackSucceeded;
    constructor(address owner) { signer = owner; }
    function configure(bool revoke, bool reject, address target, bytes calldata data) external {
        require(msg.sender == signer); revoked = revoke; rejectPayment = reject; callbackTarget = target; callbackData = data;
    }
    function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4) {
        return !revoked && SignatureChecker.isValidSignatureNow(signer,digest,signature) ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
    function execute(address target, bytes calldata data) external payable returns (bytes memory) {
        require(msg.sender == signer); (bool ok, bytes memory result) = target.call{value:msg.value}(data);
        if (!ok) assembly ("memory-safe") { revert(add(result,32),mload(result)) }
        return result;
    }
    receive() external payable {
        require(!rejectPayment, "receiver rejected");
        if (callbackTarget != address(0)) (callbackSucceeded,) = callbackTarget.call(callbackData);
    }
}
contract ForceEther { constructor() payable {} function force(address payable target) external { selfdestruct(target); } }
