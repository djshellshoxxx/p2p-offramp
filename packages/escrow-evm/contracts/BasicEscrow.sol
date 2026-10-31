// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Unqualified local-test implementation. No production deployment or asset approval is implied.
contract BasicEscrow is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;
    bytes32 public constant TRADE_TERMS_TYPEHASH = keccak256("TradeTerms(uint8 v,bytes32 orderId,uint64 revision,string networkId,string deploymentId,address seller,address buyer,uint8 assetKind,address asset,uint256 amountBaseUnits,bytes32 privateAgreementHash,bytes32 capabilitiesHash,bytes32 sellerNonce,uint64 acceptBeforeSeconds,uint64 escrowExpirySeconds,uint8 mode)");
    bytes32 public constant CORE_CAPABILITIES_HASH = sha256(hex"00");
    uint256 public constant MAX_SIGNATURE_BYTES = 4096;
    bytes32 public immutable networkIdHash;
    bytes32 public immutable deploymentIdHash;
    struct TradeTerms {
        uint8 v; bytes32 orderId; uint64 revision; string networkId; string deploymentId;
        address seller; address buyer; uint8 assetKind; address asset; uint256 amountBaseUnits;
        bytes32 privateAgreementHash; bytes32 capabilitiesHash; bytes32 sellerNonce;
        uint64 acceptBeforeSeconds; uint64 escrowExpirySeconds; uint8 mode;
    }
    enum State { Absent, Funded, Released, Refunded }
    struct Escrow { address seller; address buyer; address asset; uint256 amount; uint64 expiry; State state; }
    mapping(bytes32 => Escrow) public escrows;
    mapping(address => mapping(bytes32 => bool)) public usedSellerNonces;
    mapping(address => bytes32) public approvedTokenCodeHashes;
    mapping(address => uint256) public outstandingPrincipal;
    error InvalidState(); error Unauthorized(); error InvalidTerms(); error Expired(); error NotExpired();
    error UnsupportedAsset(); error IncorrectDeposit(); error DuplicateTrade(); error InvalidSignature(); error UnsafeToken();
    event Funded(bytes32 indexed id, address indexed seller, address indexed buyer, address token, uint256 amount, uint64 expiry, bytes32 termsHash);
    event Released(bytes32 indexed id);
    event Refunded(bytes32 indexed id);

    constructor(string memory networkId, string memory deploymentId, address[] memory tokens) EIP712("P2POfframp", "1") {
        if (!_validId(bytes(networkId)) || !_validId(bytes(deploymentId)) || tokens.length > 32) revert InvalidTerms();
        networkIdHash = keccak256(bytes(networkId)); deploymentIdHash = keccak256(bytes(deploymentId));
        for (uint256 i; i < tokens.length; ++i) {
            address token = tokens[i];
            if (token.code.length == 0 || approvedTokenCodeHashes[token] != bytes32(0)) revert UnsupportedAsset();
            approvedTokenCodeHashes[token] = token.codehash;
        }
    }
    function _validId(bytes memory id) private pure returns (bool) {
        if (id.length == 0 || id.length > 64) return false;
        for (uint256 i; i < id.length; ++i) {
            bytes1 c = id[i]; bool alnum = (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9");
            if (!alnum && (i == 0 || (c != "." && c != "_" && c != "-"))) return false;
            if (i > 0 && c == "." && id[i-1] == ".") return false;
        }
        return true;
    }
    function termsHash(TradeTerms calldata t) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(TRADE_TERMS_TYPEHASH, t.v, t.orderId, t.revision,
            keccak256(bytes(t.networkId)), keccak256(bytes(t.deploymentId)), t.seller, t.buyer, t.assetKind,
            t.asset, t.amountBaseUnits, t.privateAgreementHash, t.capabilitiesHash, t.sellerNonce,
            t.acceptBeforeSeconds, t.escrowExpirySeconds, t.mode)));
    }
    function _approved(address asset) private view {
        bytes32 expected = approvedTokenCodeHashes[asset];
        if (expected == bytes32(0) || asset.code.length == 0 || asset.codehash != expected) revert UnsupportedAsset();
    }
    function fund(TradeTerms calldata t, bytes calldata sellerAcceptance, bytes calldata buyerAcceptance) external payable nonReentrant {
        if (msg.sender != t.seller) revert Unauthorized();
        if (t.v != 1 || t.mode != 0 || t.revision == 0 || t.seller == address(0) || t.buyer == address(0) || t.seller == t.buyer || t.amountBaseUnits == 0 ||
            bytes(t.networkId).length > 64 || bytes(t.deploymentId).length > 64 ||
            keccak256(bytes(t.networkId)) != networkIdHash || keccak256(bytes(t.deploymentId)) != deploymentIdHash ||
            t.capabilitiesHash != CORE_CAPABILITIES_HASH) revert InvalidTerms();
        if (block.timestamp >= t.acceptBeforeSeconds) revert Expired();
        if (t.escrowExpirySeconds <= block.timestamp || t.escrowExpirySeconds - block.timestamp < 1800 || t.escrowExpirySeconds - block.timestamp > 604800) revert InvalidTerms();
        if (t.assetKind == 0) { if (t.asset != address(0)) revert UnsupportedAsset(); if (msg.value != t.amountBaseUnits) revert IncorrectDeposit(); }
        else if (t.assetKind == 1) { _approved(t.asset); if (msg.value != 0) revert IncorrectDeposit(); }
        else revert UnsupportedAsset();
        bytes32 id = termsHash(t);
        if (escrows[id].state != State.Absent || usedSellerNonces[t.seller][t.sellerNonce]) revert DuplicateTrade();
        if (sellerAcceptance.length == 0 || buyerAcceptance.length == 0 || sellerAcceptance.length > MAX_SIGNATURE_BYTES || buyerAcceptance.length > MAX_SIGNATURE_BYTES ||
            !SignatureChecker.isValidSignatureNow(t.seller, id, sellerAcceptance) || !SignatureChecker.isValidSignatureNow(t.buyer, id, buyerAcceptance)) revert InvalidSignature();
        usedSellerNonces[t.seller][t.sellerNonce] = true;
        escrows[id] = Escrow(t.seller, t.buyer, t.asset, t.amountBaseUnits, t.escrowExpirySeconds, State.Funded);
        outstandingPrincipal[t.asset] += t.amountBaseUnits;
        if (t.assetKind == 1) {
            IERC20 token = IERC20(t.asset); uint256 beforeBalance = token.balanceOf(address(this)); uint256 beforeSeller = token.balanceOf(t.seller);
            token.safeTransferFrom(t.seller, address(this), t.amountBaseUnits);
            uint256 afterBalance = token.balanceOf(address(this));
            uint256 afterSeller = token.balanceOf(t.seller);
            if (afterBalance < beforeBalance || afterBalance - beforeBalance != t.amountBaseUnits || beforeSeller < afterSeller || beforeSeller - afterSeller != t.amountBaseUnits) revert IncorrectDeposit();
        }
        emit Funded(id, t.seller, t.buyer, t.asset, t.amountBaseUnits, t.escrowExpirySeconds, id);
    }
    function release(bytes32 id) external nonReentrant {
        Escrow storage e = escrows[id];
        if (e.state != State.Funded) revert InvalidState();
        if (msg.sender != e.seller) revert Unauthorized();
        if (block.timestamp >= e.expiry) revert Expired();
        e.state = State.Released; _pay(e, e.buyer); emit Released(id);
    }
    function refund(bytes32 id) external nonReentrant {
        Escrow storage e = escrows[id];
        if (e.state != State.Funded) revert InvalidState();
        if (block.timestamp < e.expiry) revert NotExpired();
        e.state = State.Refunded; _pay(e, e.seller); emit Refunded(id);
    }
    function _pay(Escrow storage e, address recipient) private {
        outstandingPrincipal[e.asset] -= e.amount;
        if (e.asset == address(0)) { (bool success,) = recipient.call{value:e.amount}(""); if (!success) revert IncorrectDeposit(); }
        else {
            _approved(e.asset); IERC20 token = IERC20(e.asset);
            uint256 beforeEscrow = token.balanceOf(address(this)); uint256 beforeRecipient = token.balanceOf(recipient);
            token.safeTransfer(recipient, e.amount);
            uint256 afterEscrow = token.balanceOf(address(this)); uint256 afterRecipient = token.balanceOf(recipient);
            if (beforeEscrow < afterEscrow || beforeEscrow - afterEscrow != e.amount || afterRecipient < beforeRecipient || afterRecipient - beforeRecipient != e.amount) revert UnsafeToken();
        }
    }
}
