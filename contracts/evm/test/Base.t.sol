// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {BasicEscrow} from "../src/BasicEscrow.sol";
import {
    MockERC20,
    FeeOnTransferToken,
    BlacklistToken,
    NoReturnToken,
    FalseReturnToken,
    CallbackToken
} from "./mocks/Mocks.sol";

/// @dev Shared fixture: one escrow with a fixed allowlist of test tokens and helpers that build G16 terms.
abstract contract EscrowBase is Test {
    BasicEscrow internal escrow;
    MockERC20 internal token;
    NoReturnToken internal noReturn;
    FalseReturnToken internal falseToken;
    BlacklistToken internal blacklist;
    CallbackToken internal callback;
    FeeOnTransferToken internal feeToken; // deliberately allowlisted to prove the balance-delta check
    MockERC20 internal unlisted;

    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant AMOUNT = 1 ether;
    uint256 internal constant START = 1_700_000_000;
    uint256 internal nonceCounter;

    function setUp() public virtual {
        vm.warp(START);
        token = new MockERC20("Test USD", "TUSD");
        noReturn = new NoReturnToken();
        falseToken = new FalseReturnToken();
        blacklist = new BlacklistToken();
        callback = new CallbackToken();
        feeToken = new FeeOnTransferToken();
        unlisted = new MockERC20("Unlisted", "UNL");
        address[] memory list = new address[](6);
        list[0] = address(token);
        list[1] = address(noReturn);
        list[2] = address(falseToken);
        list[3] = address(blacklist);
        list[4] = address(callback);
        list[5] = address(feeToken);
        escrow = new BasicEscrow(list);
        vm.deal(seller, 1_000 ether);
    }

    function _deadline() internal view returns (uint64) {
        return uint64(block.timestamp + 1 days);
    }

    function _nativeTerms(address seller_, address buyer_, uint256 amount, uint64 deadline)
        internal
        returns (BasicEscrow.TradeTerms memory terms)
    {
        terms = _baseTerms(seller_, buyer_, amount, deadline);
    }

    function _tokenTerms(address seller_, address buyer_, address asset, uint256 amount, uint64 deadline)
        internal
        returns (BasicEscrow.TradeTerms memory terms)
    {
        terms = _baseTerms(seller_, buyer_, amount, deadline);
        terms.assetKind = 1;
        terms.asset = asset;
    }

    function _baseTerms(address seller_, address buyer_, uint256 amount, uint64 deadline)
        private
        returns (BasicEscrow.TradeTerms memory terms)
    {
        ++nonceCounter;
        terms = BasicEscrow.TradeTerms({
            orderId: keccak256(abi.encode("order", nonceCounter)),
            revision: 1,
            networkId: "local-evm",
            deploymentId: "escrow-local-v1",
            seller: seller_,
            buyer: buyer_,
            assetKind: 0,
            asset: address(0),
            amountBaseUnits: amount,
            privateAgreementHash: keccak256("agreement"),
            capabilitiesHash: keccak256("caps"),
            sellerNonce: keccak256(abi.encode("nonce", nonceCounter)),
            acceptBeforeSeconds: uint64(block.timestamp + 1 hours),
            escrowExpirySeconds: deadline
        });
    }

    function _fundNative(uint256 amount) internal returns (bytes32 id, BasicEscrow.TradeTerms memory terms) {
        terms = _nativeTerms(seller, buyer, amount, _deadline());
        vm.prank(seller);
        id = escrow.fundNative{value: amount}(terms);
    }

    function _fundToken(address asset, uint256 amount) internal returns (bytes32 id, BasicEscrow.TradeTerms memory terms) {
        terms = _tokenTerms(seller, buyer, asset, amount, _deadline());
        MockERC20(asset).mint(seller, amount);
        vm.startPrank(seller);
        MockERC20(asset).approve(address(escrow), amount);
        id = escrow.fundToken(terms);
        vm.stopPrank();
    }
}
