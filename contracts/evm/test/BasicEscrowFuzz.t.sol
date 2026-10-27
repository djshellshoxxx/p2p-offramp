// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {EscrowBase} from "./Base.t.sol";
import {BasicEscrow} from "../src/BasicEscrow.sol";

/// @dev Property/fuzz tests over amounts, deadlines, settlement times and actors.
contract BasicEscrowFuzzTest is EscrowBase {
    function testFuzz_nativeReleasePaysExactPrincipal(uint256 amount) public {
        amount = bound(amount, 1, 1_000 ether);
        (bytes32 id,) = _fundNative(amount);
        vm.prank(seller);
        escrow.release(id);
        assertEq(buyer.balance, amount);
        assertEq(address(escrow).balance, 0);
    }

    function testFuzz_tokenRefundPaysExactPrincipal(uint256 amount) public {
        amount = bound(amount, 1, type(uint128).max);
        (bytes32 id, BasicEscrow.TradeTerms memory terms) = _fundToken(address(token), amount);
        vm.warp(terms.escrowExpirySeconds);
        escrow.refund(id);
        assertEq(token.balanceOf(seller), amount);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function testFuzz_tokenMaxAmount(uint256 amount) public {
        amount = bound(amount, type(uint256).max / 2, type(uint256).max);
        (bytes32 id,) = _fundToken(address(token), amount);
        vm.prank(seller);
        escrow.release(id);
        assertEq(token.balanceOf(buyer), amount);
    }

    function testFuzz_feeOnTransferAlwaysRejected(uint256 amount) public {
        amount = bound(amount, 1, type(uint128).max);
        BasicEscrow.TradeTerms memory terms = _tokenTerms(seller, buyer, address(feeToken), amount, _deadline());
        feeToken.mint(seller, amount);
        vm.startPrank(seller);
        feeToken.approve(address(escrow), amount);
        vm.expectPartialRevert(BasicEscrow.IncorrectDeposit.selector);
        escrow.fundToken(terms);
        vm.stopPrank();
    }

    function testFuzz_deadlineWindow(uint64 offset) public {
        uint256 deadline = block.timestamp + uint256(offset);
        BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, buyer, AMOUNT, uint64(deadline));
        bool valid = offset >= escrow.MIN_DURATION() && offset <= escrow.MAX_DURATION();
        if (!valid) vm.expectPartialRevert(BasicEscrow.DeadlineOutOfRange.selector);
        vm.prank(seller);
        escrow.fundNative{value: AMOUNT}(terms);
        if (valid) assertEq(escrow.getTrade(escrow.tradeIdOf(terms)).deadline, deadline);
    }

    /// Release and refund guards are disjoint and exhaustive over chain time.
    function testFuzz_settlementTimeGuards(uint256 delta, bool tryRelease) public {
        (bytes32 id, BasicEscrow.TradeTerms memory terms) = _fundNative(AMOUNT);
        uint256 t = bound(delta, block.timestamp, uint256(terms.escrowExpirySeconds) + 30 days);
        vm.warp(t);
        bool beforeDeadline = t < terms.escrowExpirySeconds;
        if (tryRelease) {
            if (!beforeDeadline) vm.expectPartialRevert(BasicEscrow.DeadlinePassed.selector);
            vm.prank(seller);
            escrow.release(id);
            if (beforeDeadline) assertEq(buyer.balance, AMOUNT);
        } else {
            if (beforeDeadline) vm.expectPartialRevert(BasicEscrow.DeadlineNotReached.selector);
            uint256 before = seller.balance;
            escrow.refund(id);
            if (!beforeDeadline) assertEq(seller.balance, before + AMOUNT);
        }
    }

    function testFuzz_onlySellerReleases(address caller) public {
        (bytes32 id,) = _fundNative(AMOUNT);
        vm.assume(caller != seller);
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.Unauthorized.selector, caller));
        escrow.release(id);
    }

    function testFuzz_anyRefundCallerPaysOnlySeller(address caller) public {
        vm.assume(caller != seller && caller != buyer && caller != address(escrow));
        (bytes32 id, BasicEscrow.TradeTerms memory terms) = _fundToken(address(token), 5e6);
        vm.warp(terms.escrowExpirySeconds);
        vm.prank(caller);
        escrow.refund(id);
        assertEq(token.balanceOf(seller), 5e6);
        assertEq(token.balanceOf(caller), 0);
        assertEq(token.balanceOf(buyer), 0);
    }

    function testFuzz_fundingRequiresTermsSeller(address caller) public {
        vm.assume(caller != seller);
        BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, buyer, AMOUNT, _deadline());
        vm.deal(caller, AMOUNT);
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.Unauthorized.selector, caller));
        escrow.fundNative{value: AMOUNT}(terms);
    }

    function testFuzz_tradeIdBindsEveryEconomicField(bytes32 orderId, address otherBuyer, uint256 amount) public {
        BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, buyer, AMOUNT, _deadline());
        bytes32 base = escrow.tradeIdOf(terms);
        BasicEscrow.TradeTerms memory changed = _copy(terms);
        changed.orderId = orderId;
        if (orderId != terms.orderId) assertTrue(escrow.tradeIdOf(changed) != base);
        changed = _copy(terms);
        changed.buyer = otherBuyer;
        if (otherBuyer != buyer) assertTrue(escrow.tradeIdOf(changed) != base);
        changed = _copy(terms);
        changed.amountBaseUnits = amount;
        if (amount != AMOUNT) assertTrue(escrow.tradeIdOf(changed) != base);
    }

    function _copy(BasicEscrow.TradeTerms memory t) private pure returns (BasicEscrow.TradeTerms memory c) {
        c = BasicEscrow.TradeTerms(
            t.orderId,
            t.revision,
            t.networkId,
            t.deploymentId,
            t.seller,
            t.buyer,
            t.assetKind,
            t.asset,
            t.amountBaseUnits,
            t.privateAgreementHash,
            t.capabilitiesHash,
            t.sellerNonce,
            t.acceptBeforeSeconds,
            t.escrowExpirySeconds
        );
    }
}
