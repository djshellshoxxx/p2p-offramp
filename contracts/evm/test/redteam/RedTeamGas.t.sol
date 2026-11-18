// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {EscrowBase} from "../Base.t.sol";
import {BasicEscrow} from "../../src/BasicEscrow.sol";
import {MockERC20} from "../mocks/Mocks.sol";

/// @dev Seller contract whose receive() needs ~44k gas (two fresh SSTOREs): inside the 50k push stipend.
contract GasHungrySeller {
    uint256 private a;
    uint256 private b;

    function fund(BasicEscrow escrow, BasicEscrow.TradeTerms calldata terms) external payable returns (bytes32) {
        return escrow.fundNative{value: msg.value}(terms);
    }

    receive() external payable {
        a = gasleft();
        b = block.number + 1;
    }
}

/// Red team pass 1 (Team D): property tests of the "a third-party caller cannot force a deferral by under-supplying
/// gas" claim (SECURITY-NOTES.md, MIN_PAYOUT_GAS) over the whole gas range, for native and ERC-20 payouts.
/// Negative result expected (no finding): any gas either settles with a direct payout or reverts atomically.
/// Repro: cd contracts/evm && forge test --match-path 'test/redteam/*' -vv
contract RedTeamGasTest is EscrowBase {
    function _check(bytes32 id, address recipient, address asset, uint256 before, bool ok) private view {
        uint256 credit = escrow.pendingWithdrawals(recipient, asset);
        uint256 balance = asset == address(0) ? recipient.balance : MockERC20(asset).balanceOf(recipient);
        if (ok) {
            assertEq(uint8(escrow.getTrade(id).state), uint8(BasicEscrow.State.Refunded));
            assertEq(credit, 0, "third-party gas choice forced a deferral");
            assertEq(balance, before + AMOUNT);
        } else {
            assertEq(uint8(escrow.getTrade(id).state), uint8(BasicEscrow.State.Funded));
            assertEq(credit, 0);
            assertEq(balance, before);
        }
    }

    function testFuzz_thirdPartyGasCannotForceNativeDeferral(uint256 gasLimit) public {
        gasLimit = bound(gasLimit, 25_000, 1_500_000);
        GasHungrySeller hungry = new GasHungrySeller();
        vm.deal(address(hungry), 0);
        BasicEscrow.TradeTerms memory terms = _nativeTerms(address(hungry), buyer, AMOUNT, _deadline());
        vm.deal(address(this), AMOUNT);
        bytes32 id = hungry.fund{value: AMOUNT}(escrow, terms);
        vm.warp(terms.escrowExpirySeconds);
        uint256 before = address(hungry).balance;
        vm.prank(stranger);
        (bool ok,) = address(escrow).call{gas: gasLimit}(abi.encodeCall(BasicEscrow.refund, (id)));
        _check(id, address(hungry), address(0), before, ok);
    }

    function testFuzz_thirdPartyGasCannotForceTokenDeferral(uint256 gasLimit) public {
        gasLimit = bound(gasLimit, 25_000, 1_500_000);
        (bytes32 id, BasicEscrow.TradeTerms memory terms) = _fundToken(address(token), AMOUNT);
        vm.warp(terms.escrowExpirySeconds);
        uint256 before = token.balanceOf(seller);
        vm.prank(stranger);
        (bool ok,) = address(escrow).call{gas: gasLimit}(abi.encodeCall(BasicEscrow.refund, (id)));
        _check(id, seller, address(token), before, ok);
    }

    /// Informational: identical terms are independently fundable on two deployments (seller nonce and trade id are
    /// per deployment). Clients must key trades by (chainId, escrow, tradeId), never by sellerNonce/orderId alone.
    function test_sameTermsFundOnTwoDeploymentsWithDistinctIds() public {
        address[] memory none = new address[](0);
        BasicEscrow other = new BasicEscrow(none);
        BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, buyer, AMOUNT, _deadline());
        vm.startPrank(seller);
        bytes32 a = escrow.fundNative{value: AMOUNT}(terms);
        bytes32 b = other.fundNative{value: AMOUNT}(terms);
        vm.stopPrank();
        assertTrue(a != b);
        assertTrue(escrow.sellerNonceUsed(seller, terms.sellerNonce) && other.sellerNonceUsed(seller, terms.sellerNonce));
    }
}
