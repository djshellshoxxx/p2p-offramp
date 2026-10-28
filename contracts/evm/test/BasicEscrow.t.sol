// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {EscrowBase} from "./Base.t.sol";
import {BasicEscrow} from "../src/BasicEscrow.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {
    RevertingReceiver, GasBurner, ReentrancyAttacker
} from "./mocks/Mocks.sol";

/// @dev Unit tests: one or more per roadmap "Basic escrow policy" row and per custom error.
contract BasicEscrowTest is EscrowBase {
    event Funded(
        bytes32 indexed tradeId,
        address indexed seller,
        address indexed buyer,
        address token,
        uint256 amount,
        uint64 deadline
    );
    event Released(bytes32 indexed tradeId, address indexed buyer, address token, uint256 amount);
    event Refunded(
        bytes32 indexed tradeId, address indexed seller, address indexed caller, address token, uint256 amount
    );
    event PayoutDeferred(bytes32 indexed tradeId, address indexed recipient, address token, uint256 amount);
    event Withdrawn(address indexed recipient, address indexed caller, address token, uint256 amount);

    // ---------------------------------------------------------------- constructor / allowlist

    function test_constructor_recordsFixedAllowlist() public view {
        address[] memory list = escrow.allowlistedTokens();
        assertEq(list.length, 6);
        assertEq(list[0], address(token));
        assertTrue(escrow.isAllowlisted(address(token)));
        assertFalse(escrow.isAllowlisted(address(unlisted)));
        assertFalse(escrow.isAllowlisted(address(0)));
    }

    function test_constructor_rejectsZeroToken() public {
        address[] memory list = new address[](1);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.InvalidAllowlistEntry.selector, address(0)));
        new BasicEscrow(list);
    }

    function test_constructor_rejectsCodelessToken() public {
        address[] memory list = new address[](1);
        list[0] = makeAddr("eoa");
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.InvalidAllowlistEntry.selector, list[0]));
        new BasicEscrow(list);
    }

    function test_constructor_rejectsDuplicateToken() public {
        address[] memory list = new address[](2);
        list[0] = address(token);
        list[1] = address(token);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.InvalidAllowlistEntry.selector, address(token)));
        new BasicEscrow(list);
    }

    function test_constructor_rejectsOversizedAllowlist() public {
        address[] memory list = new address[](33);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.AllowlistTooLarge.selector, 33));
        new BasicEscrow(list);
    }

    function test_constructor_emptyAllowlistIsNativeOnly() public {
        BasicEscrow nativeOnly = new BasicEscrow(new address[](0));
        assertEq(nativeOnly.allowlistedTokens().length, 0);
    }

    // ---------------------------------------------------------------- row 1: Unfunded -> Funded (seller)

    function test_fundNative_bindsTermsAndEmits() public {
        BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, buyer, AMOUNT, _deadline());
        bytes32 expected = escrow.tradeIdOf(terms);
        vm.expectEmit(address(escrow));
        emit Funded(expected, seller, buyer, address(0), AMOUNT, terms.escrowExpirySeconds);
        vm.prank(seller);
        bytes32 id = escrow.fundNative{value: AMOUNT}(terms);
        assertEq(id, expected);
        BasicEscrow.Escrow memory e = escrow.getTrade(id);
        assertEq(e.seller, seller);
        assertEq(e.buyer, buyer);
        assertEq(e.token, address(0));
        assertEq(e.amount, AMOUNT);
        assertEq(e.deadline, terms.escrowExpirySeconds);
        assertEq(uint8(e.state), uint8(BasicEscrow.State.Funded));
        assertEq(address(escrow).balance, AMOUNT);
        assertTrue(escrow.sellerNonceUsed(seller, terms.sellerNonce));
    }

    function test_fundToken_bindsTermsAndEmits() public {
        BasicEscrow.TradeTerms memory terms = _tokenTerms(seller, buyer, address(token), 25e6, _deadline());
        token.mint(seller, 25e6);
        vm.startPrank(seller);
        token.approve(address(escrow), 25e6);
        vm.expectEmit(address(escrow));
        emit Funded(escrow.tradeIdOf(terms), seller, buyer, address(token), 25e6, terms.escrowExpirySeconds);
        bytes32 id = escrow.fundToken(terms);
        vm.stopPrank();
        assertEq(token.balanceOf(address(escrow)), 25e6);
        assertEq(escrow.getTrade(id).token, address(token));
    }

    function test_fundToken_noReturnTokenAccepted() public {
        BasicEscrow.TradeTerms memory terms = _tokenTerms(seller, buyer, address(noReturn), 500, _deadline());
        noReturn.mint(seller, 500);
        vm.startPrank(seller);
        noReturn.approve(address(escrow), 500);
        bytes32 id = escrow.fundToken(terms);
        escrow.release(id);
        vm.stopPrank();
        assertEq(noReturn.balanceOf(buyer), 500);
    }

    function test_fund_rejectsCallerOtherThanTermsSeller() public {
        BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, buyer, AMOUNT, _deadline());
        vm.deal(stranger, AMOUNT);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.Unauthorized.selector, stranger));
        escrow.fundNative{value: AMOUNT}(terms);
    }

    function test_fundNative_rejectsWrongValue() public {
        BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, buyer, AMOUNT, _deadline());
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.IncorrectDeposit.selector, AMOUNT, AMOUNT - 1));
        escrow.fundNative{value: AMOUNT - 1}(terms);
    }

    function test_fundNative_rejectsTokenTerms() public {
        BasicEscrow.TradeTerms memory terms = _tokenTerms(seller, buyer, address(token), AMOUNT, _deadline());
        vm.prank(seller);
        vm.expectRevert(BasicEscrow.InvalidTerms.selector);
        escrow.fundNative{value: AMOUNT}(terms);
    }

    function test_fundNative_rejectsNonzeroAssetWithNativeKind() public {
        BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, buyer, AMOUNT, _deadline());
        terms.asset = address(token);
        vm.prank(seller);
        vm.expectRevert(BasicEscrow.InvalidTerms.selector);
        escrow.fundNative{value: AMOUNT}(terms);
    }

    function test_fundToken_rejectsNativeKind() public {
        BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, buyer, AMOUNT, _deadline());
        vm.prank(seller);
        vm.expectRevert(BasicEscrow.InvalidTerms.selector);
        escrow.fundToken(terms);
    }

    function test_fundToken_rejectsNonAllowlistedToken() public {
        BasicEscrow.TradeTerms memory terms = _tokenTerms(seller, buyer, address(unlisted), AMOUNT, _deadline());
        unlisted.mint(seller, AMOUNT);
        vm.startPrank(seller);
        unlisted.approve(address(escrow), AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.UnsupportedAsset.selector, address(unlisted)));
        escrow.fundToken(terms);
        vm.stopPrank();
    }

    function test_fundToken_rejectsZeroAddressToken() public {
        BasicEscrow.TradeTerms memory terms = _tokenTerms(seller, buyer, address(0), AMOUNT, _deadline());
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.UnsupportedAsset.selector, address(0)));
        escrow.fundToken(terms);
    }

    function test_fundToken_rejectsFeeOnTransfer() public {
        BasicEscrow.TradeTerms memory terms = _tokenTerms(seller, buyer, address(feeToken), 1000, _deadline());
        feeToken.mint(seller, 1000);
        vm.startPrank(seller);
        feeToken.approve(address(escrow), 1000);
        // 1% + 1 burnt: 1000 - 11 = 989 received.
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.IncorrectDeposit.selector, 1000, 989));
        escrow.fundToken(terms);
        vm.stopPrank();
        assertEq(uint8(escrow.getTrade(escrow.tradeIdOf(terms)).state), uint8(BasicEscrow.State.None));
        assertFalse(escrow.sellerNonceUsed(seller, terms.sellerNonce));
    }

    function test_fundToken_rejectsFalseReturningTransferFrom() public {
        falseToken.setFail(false, true);
        BasicEscrow.TradeTerms memory terms = _tokenTerms(seller, buyer, address(falseToken), 100, _deadline());
        falseToken.mint(seller, 100);
        vm.startPrank(seller);
        falseToken.approve(address(escrow), 100);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(falseToken)));
        escrow.fundToken(terms);
        vm.stopPrank();
    }

    function test_fundToken_rejectsMissingAllowance() public {
        BasicEscrow.TradeTerms memory terms = _tokenTerms(seller, buyer, address(token), 100, _deadline());
        token.mint(seller, 100);
        vm.prank(seller);
        vm.expectRevert();
        escrow.fundToken(terms);
    }

    function test_fundToken_isNotPayable() public {
        BasicEscrow.TradeTerms memory terms = _tokenTerms(seller, buyer, address(token), 100, _deadline());
        vm.prank(seller);
        (bool ok,) = address(escrow).call{value: 1}(abi.encodeCall(BasicEscrow.fundToken, (terms)));
        assertFalse(ok);
    }

    function test_fund_rejectsInvalidBuyers() public {
        address[3] memory bad = [address(0), seller, address(escrow)];
        for (uint256 i; i < bad.length; ++i) {
            BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, bad[i], AMOUNT, _deadline());
            vm.prank(seller);
            vm.expectRevert(abi.encodeWithSelector(BasicEscrow.InvalidBuyer.selector, bad[i]));
            escrow.fundNative{value: AMOUNT}(terms);
        }
    }

    function test_fund_rejectsZeroAmount() public {
        BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, buyer, 0, _deadline());
        vm.prank(seller);
        vm.expectRevert(BasicEscrow.ZeroAmount.selector);
        escrow.fundNative(terms);
    }

    function test_fund_rejectsZeroRevision() public {
        BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, buyer, AMOUNT, _deadline());
        terms.revision = 0;
        vm.prank(seller);
        vm.expectRevert(BasicEscrow.InvalidTerms.selector);
        escrow.fundNative{value: AMOUNT}(terms);
    }

    function test_fund_rejectsAtAcceptBefore() public {
        BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, buyer, AMOUNT, _deadline());
        terms.acceptBeforeSeconds = uint64(block.timestamp);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.AcceptanceExpired.selector, terms.acceptBeforeSeconds));
        escrow.fundNative{value: AMOUNT}(terms);
    }

    function test_fund_acceptsOneSecondBeforeAcceptBefore() public {
        BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, buyer, AMOUNT, _deadline());
        terms.acceptBeforeSeconds = uint64(block.timestamp + 1);
        vm.prank(seller);
        escrow.fundNative{value: AMOUNT}(terms);
    }

    function test_fund_deadlineBounds() public {
        uint256 earliest = block.timestamp + escrow.MIN_DURATION();
        uint256 latest = block.timestamp + escrow.MAX_DURATION();
        uint64[2] memory bad = [uint64(earliest - 1), uint64(latest + 1)];
        for (uint256 i; i < 2; ++i) {
            BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, buyer, AMOUNT, bad[i]);
            vm.prank(seller);
            vm.expectRevert(
                abi.encodeWithSelector(BasicEscrow.DeadlineOutOfRange.selector, bad[i], earliest, latest)
            );
            escrow.fundNative{value: AMOUNT}(terms);
        }
        uint64[2] memory good = [uint64(earliest), uint64(latest)];
        for (uint256 i; i < 2; ++i) {
            BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, buyer, AMOUNT, good[i]);
            vm.prank(seller);
            escrow.fundNative{value: AMOUNT}(terms);
        }
    }

    function test_fund_rejectsTradeIdReuseForever() public {
        (bytes32 id, BasicEscrow.TradeTerms memory terms) = _fundNative(AMOUNT);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.TradeIdUsed.selector, id));
        escrow.fundNative{value: AMOUNT}(terms);
        vm.prank(seller);
        escrow.release(id);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.TradeIdUsed.selector, id));
        escrow.fundNative{value: AMOUNT}(terms);
    }

    function test_fund_rejectsSellerNonceReuseAcrossOrders() public {
        (, BasicEscrow.TradeTerms memory terms) = _fundNative(AMOUNT);
        terms.orderId = keccak256("another order");
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.SellerNonceUsed.selector, seller, terms.sellerNonce));
        escrow.fundNative{value: AMOUNT}(terms);
    }

    function test_directNativeTransferRejected() public {
        vm.prank(seller);
        (bool ok,) = address(escrow).call{value: 1}("");
        assertFalse(ok);
    }

    function test_tradeId_isDeploymentAndChainBound() public {
        BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, buyer, AMOUNT, _deadline());
        BasicEscrow other = new BasicEscrow(new address[](0));
        assertTrue(escrow.tradeIdOf(terms) != other.tradeIdOf(terms));
        bytes32 before = escrow.tradeIdOf(terms);
        vm.chainId(1);
        assertTrue(escrow.tradeIdOf(terms) != before);
    }

    // ---------------------------------------------------------------- row 2: Release (seller, before deadline)

    function test_release_paysBuyerNative() public {
        (bytes32 id,) = _fundNative(AMOUNT);
        vm.expectEmit(address(escrow));
        emit Released(id, buyer, address(0), AMOUNT);
        vm.prank(seller);
        escrow.release(id);
        assertEq(buyer.balance, AMOUNT);
        assertEq(address(escrow).balance, 0);
        assertEq(uint8(escrow.getTrade(id).state), uint8(BasicEscrow.State.Released));
    }

    function test_release_paysBuyerToken() public {
        (bytes32 id,) = _fundToken(address(token), 7e6);
        vm.prank(seller);
        escrow.release(id);
        assertEq(token.balanceOf(buyer), 7e6);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_release_oneSecondBeforeDeadline() public {
        (bytes32 id, BasicEscrow.TradeTerms memory terms) = _fundNative(AMOUNT);
        vm.warp(terms.escrowExpirySeconds - 1);
        vm.prank(seller);
        escrow.release(id);
        assertEq(buyer.balance, AMOUNT);
    }

    function test_release_rejectsAtDeadline() public {
        (bytes32 id, BasicEscrow.TradeTerms memory terms) = _fundNative(AMOUNT);
        vm.warp(terms.escrowExpirySeconds);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.DeadlinePassed.selector, terms.escrowExpirySeconds));
        escrow.release(id);
    }

    function test_release_rejectsNonSeller() public {
        (bytes32 id,) = _fundNative(AMOUNT);
        address[2] memory callers = [buyer, stranger];
        for (uint256 i; i < 2; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(abi.encodeWithSelector(BasicEscrow.Unauthorized.selector, callers[i]));
            escrow.release(id);
        }
    }

    function test_release_rejectsUnknownTrade() public {
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.InvalidState.selector, bytes32(uint256(1)), BasicEscrow.State.None));
        escrow.release(bytes32(uint256(1)));
    }

    // ---------------------------------------------------------------- row 3: Refund (anyone, at/after deadline)

    function test_refund_rejectsOneSecondBeforeDeadline() public {
        (bytes32 id, BasicEscrow.TradeTerms memory terms) = _fundNative(AMOUNT);
        vm.warp(terms.escrowExpirySeconds - 1);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.DeadlineNotReached.selector, terms.escrowExpirySeconds));
        escrow.refund(id);
    }

    function test_refund_atDeadlineByStrangerPaysSellerOnly() public {
        (bytes32 id, BasicEscrow.TradeTerms memory terms) = _fundNative(AMOUNT);
        uint256 sellerBefore = seller.balance;
        vm.warp(terms.escrowExpirySeconds);
        vm.expectEmit(address(escrow));
        emit Refunded(id, seller, stranger, address(0), AMOUNT);
        vm.prank(stranger);
        escrow.refund(id);
        assertEq(seller.balance, sellerBefore + AMOUNT);
        assertEq(stranger.balance, 0);
        assertEq(buyer.balance, 0);
        assertEq(uint8(escrow.getTrade(id).state), uint8(BasicEscrow.State.Refunded));
    }

    function test_refund_afterDeadlineByBuyerPaysSellerToken() public {
        (bytes32 id, BasicEscrow.TradeTerms memory terms) = _fundToken(address(token), 3e6);
        vm.warp(terms.escrowExpirySeconds + 1);
        vm.prank(buyer);
        escrow.refund(id);
        assertEq(token.balanceOf(seller), 3e6);
        assertEq(token.balanceOf(buyer), 0);
    }

    function test_refund_rejectsUnknownTrade() public {
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.InvalidState.selector, bytes32(uint256(7)), BasicEscrow.State.None));
        escrow.refund(bytes32(uint256(7)));
    }

    // ---------------------------------------------------------------- row 4: terminal states reject repeats

    function test_terminal_releasedRejectsEverything() public {
        (bytes32 id, BasicEscrow.TradeTerms memory terms) = _fundNative(AMOUNT);
        vm.prank(seller);
        escrow.release(id);
        bytes memory err = abi.encodeWithSelector(BasicEscrow.InvalidState.selector, id, BasicEscrow.State.Released);
        vm.prank(seller);
        vm.expectRevert(err);
        escrow.release(id);
        vm.warp(terms.escrowExpirySeconds);
        vm.expectRevert(err);
        escrow.refund(id);
        assertEq(buyer.balance, AMOUNT);
    }

    function test_terminal_refundedRejectsEverything() public {
        (bytes32 id, BasicEscrow.TradeTerms memory terms) = _fundNative(AMOUNT);
        vm.warp(terms.escrowExpirySeconds);
        escrow.refund(id);
        bytes memory err = abi.encodeWithSelector(BasicEscrow.InvalidState.selector, id, BasicEscrow.State.Refunded);
        vm.expectRevert(err);
        escrow.refund(id);
        vm.prank(seller);
        vm.expectRevert(err);
        escrow.release(id);
    }

    // ---------------------------------------------------------------- deadline race (front-running)

    function test_race_beforeDeadline_releaseWinsRefundCannotRun() public {
        (bytes32 id, BasicEscrow.TradeTerms memory terms) = _fundNative(AMOUNT);
        vm.warp(terms.escrowExpirySeconds - 1);
        // A refund front-running the release in the same block is not yet valid.
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.DeadlineNotReached.selector, terms.escrowExpirySeconds));
        escrow.refund(id);
        vm.prank(seller);
        escrow.release(id);
        assertEq(buyer.balance, AMOUNT);
    }

    function test_race_atDeadline_refundFirstThenReleaseRejected() public {
        (bytes32 id, BasicEscrow.TradeTerms memory terms) = _fundNative(AMOUNT);
        vm.warp(terms.escrowExpirySeconds);
        vm.prank(stranger);
        escrow.refund(id);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.InvalidState.selector, id, BasicEscrow.State.Refunded));
        escrow.release(id);
        assertEq(buyer.balance, 0);
    }

    function test_race_atDeadline_releaseFirstRejectedThenRefundSucceeds() public {
        (bytes32 id, BasicEscrow.TradeTerms memory terms) = _fundNative(AMOUNT);
        vm.warp(terms.escrowExpirySeconds);
        vm.prank(seller);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.DeadlinePassed.selector, terms.escrowExpirySeconds));
        escrow.release(id);
        escrow.refund(id);
        assertEq(uint8(escrow.getTrade(id).state), uint8(BasicEscrow.State.Refunded));
    }

    function test_race_releaseIncludedBeforeDeadlineThenRefundRejected() public {
        (bytes32 id, BasicEscrow.TradeTerms memory terms) = _fundNative(AMOUNT);
        vm.warp(terms.escrowExpirySeconds - 1);
        vm.prank(seller);
        escrow.release(id);
        vm.warp(terms.escrowExpirySeconds);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.InvalidState.selector, id, BasicEscrow.State.Released));
        escrow.refund(id);
    }

    // ---------------------------------------------------------------- payout failure -> deferred credit

    function test_revertingBuyer_releaseDefersThenWithdrawAfterFix() public {
        RevertingReceiver rb = new RevertingReceiver();
        BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, address(rb), AMOUNT, _deadline());
        vm.prank(seller);
        bytes32 id = escrow.fundNative{value: AMOUNT}(terms);

        vm.expectEmit(address(escrow));
        emit PayoutDeferred(id, address(rb), address(0), AMOUNT);
        vm.prank(seller);
        escrow.release(id);
        assertEq(uint8(escrow.getTrade(id).state), uint8(BasicEscrow.State.Released));
        assertEq(escrow.pendingWithdrawals(address(rb), address(0)), AMOUNT);
        assertEq(address(escrow).balance, AMOUNT);

        // Still rejecting: withdraw reverts and the credit is preserved.
        vm.expectRevert(BasicEscrow.WithdrawalFailed.selector);
        escrow.withdraw(address(rb), address(0));
        assertEq(escrow.pendingWithdrawals(address(rb), address(0)), AMOUNT);

        // Fixed receiver: anyone triggers, only the recipient is paid.
        rb.setAccept(true);
        vm.expectEmit(address(escrow));
        emit Withdrawn(address(rb), stranger, address(0), AMOUNT);
        vm.prank(stranger);
        escrow.withdraw(address(rb), address(0));
        assertEq(address(rb).balance, AMOUNT);
        assertEq(stranger.balance, 0);
        assertEq(address(escrow).balance, 0);

        vm.expectRevert(BasicEscrow.NothingToWithdraw.selector);
        escrow.withdraw(address(rb), address(0));
    }

    function test_revertingBuyer_cannotBlockRefundToSeller() public {
        RevertingReceiver rb = new RevertingReceiver();
        BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, address(rb), AMOUNT, _deadline());
        vm.prank(seller);
        bytes32 id = escrow.fundNative{value: AMOUNT}(terms);
        vm.warp(terms.escrowExpirySeconds);
        uint256 before = seller.balance;
        escrow.refund(id);
        assertEq(seller.balance, before + AMOUNT);
    }

    function test_gasBurningBuyer_isBoundedAndDeferred() public {
        GasBurner gb = new GasBurner();
        BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, address(gb), AMOUNT, _deadline());
        vm.prank(seller);
        bytes32 id = escrow.fundNative{value: AMOUNT}(terms);
        uint256 gasBefore = gasleft();
        vm.prank(seller);
        escrow.release(id);
        assertLt(gasBefore - gasleft(), 200_000);
        assertEq(escrow.pendingWithdrawals(address(gb), address(0)), AMOUNT);
    }

    function test_revertingSeller_refundDeferred() public {
        RevertingReceiver rs = new RevertingReceiver();
        vm.deal(address(rs), AMOUNT);
        BasicEscrow.TradeTerms memory terms = _nativeTerms(address(rs), buyer, AMOUNT, _deadline());
        rs.setAccept(false);
        vm.prank(address(rs));
        bytes32 id = escrow.fundNative{value: AMOUNT}(terms);
        vm.warp(terms.escrowExpirySeconds);
        escrow.refund(id);
        assertEq(escrow.pendingWithdrawals(address(rs), address(0)), AMOUNT);
        rs.setAccept(true);
        escrow.withdraw(address(rs), address(0));
        assertEq(address(rs).balance, AMOUNT);
    }

    function test_blacklistedBuyer_tokenReleaseDeferred() public {
        (bytes32 id,) = _fundToken(address(blacklist), 900);
        blacklist.setBlacklisted(buyer, true);
        vm.prank(seller);
        escrow.release(id);
        assertEq(escrow.pendingWithdrawals(buyer, address(blacklist)), 900);
        vm.expectRevert();
        escrow.withdraw(buyer, address(blacklist));
        blacklist.setBlacklisted(buyer, false);
        escrow.withdraw(buyer, address(blacklist));
        assertEq(blacklist.balanceOf(buyer), 900);
        assertEq(blacklist.balanceOf(address(escrow)), 0);
    }

    function test_falseReturningTransfer_releaseDeferred() public {
        (bytes32 id,) = _fundToken(address(falseToken), 400);
        falseToken.setFail(true, false);
        vm.prank(seller);
        escrow.release(id);
        assertEq(falseToken.balanceOf(buyer), 0);
        assertEq(escrow.pendingWithdrawals(buyer, address(falseToken)), 400);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(falseToken)));
        escrow.withdraw(buyer, address(falseToken));
        falseToken.setFail(false, false);
        escrow.withdraw(buyer, address(falseToken));
        assertEq(falseToken.balanceOf(buyer), 400);
    }

    function test_insufficientGas_cannotForceDeferral() public {
        (bytes32 id, BasicEscrow.TradeTerms memory terms) = _fundNative(AMOUNT);
        vm.warp(terms.escrowExpirySeconds);
        // The refund is permissionless; a griefer supplying little gas must revert, not defer.
        (bool ok, bytes memory ret) = address(escrow).call{gas: 110_000}(abi.encodeCall(BasicEscrow.refund, (id)));
        assertFalse(ok);
        assertEq(bytes4(ret), BasicEscrow.InsufficientGas.selector);
        assertEq(uint8(escrow.getTrade(id).state), uint8(BasicEscrow.State.Funded));
        assertEq(escrow.pendingWithdrawals(seller, address(0)), 0);
    }

    function test_withdraw_nothingToWithdraw() public {
        vm.expectRevert(BasicEscrow.NothingToWithdraw.selector);
        escrow.withdraw(buyer, address(0));
    }

    // ---------------------------------------------------------------- reentrancy

    function test_reentrancy_buyerReentersRefundDuringReleasePush() public {
        ReentrancyAttacker attacker = new ReentrancyAttacker(escrow);
        BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, address(attacker), AMOUNT, _deadline());
        vm.prank(seller);
        bytes32 id = escrow.fundNative{value: AMOUNT}(terms);
        attacker.configure(ReentrancyAttacker.Mode.Refund, id, address(0), true);
        vm.prank(seller);
        escrow.release(id);
        // Push failed (re-entry blocked, failure propagated) -> credited once; nothing else moved.
        assertEq(address(attacker).balance, 0);
        assertEq(escrow.pendingWithdrawals(address(attacker), address(0)), AMOUNT);
        assertEq(address(escrow).balance, AMOUNT);
        assertEq(uint8(escrow.getTrade(id).state), uint8(BasicEscrow.State.Released));
    }

    function test_reentrancy_withdrawReentryBlocked() public {
        ReentrancyAttacker attacker = new ReentrancyAttacker(escrow);
        BasicEscrow.TradeTerms memory terms = _nativeTerms(seller, address(attacker), AMOUNT, _deadline());
        vm.prank(seller);
        bytes32 id = escrow.fundNative{value: AMOUNT}(terms);
        attacker.configure(ReentrancyAttacker.Mode.Refund, id, address(0), true);
        vm.prank(seller);
        escrow.release(id); // deferred
        // Second-phase attack: re-enter withdraw from the full-gas withdrawal, without propagating.
        attacker.configure(ReentrancyAttacker.Mode.Withdraw, id, address(0), false);
        escrow.withdraw(address(attacker), address(0));
        assertTrue(attacker.reentered());
        assertFalse(attacker.reentrySucceeded());
        assertEq(bytes4(attacker.lastError()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(address(attacker).balance, AMOUNT);
        assertEq(address(escrow).balance, 0);
    }

    function test_reentrancy_sellerReentersReleaseDuringRefundPush() public {
        ReentrancyAttacker attacker = new ReentrancyAttacker(escrow);
        BasicEscrow.TradeTerms memory terms = _nativeTerms(address(attacker), buyer, AMOUNT, _deadline());
        bytes32 id = attacker.fundNative{value: AMOUNT}(terms);
        attacker.configure(ReentrancyAttacker.Mode.Release, id, address(0), false);
        vm.warp(terms.escrowExpirySeconds);
        escrow.refund(id);
        // Either the push succeeded with the re-entry rejected, or it was deferred; never two payouts.
        uint256 paid = address(attacker).balance + escrow.pendingWithdrawals(address(attacker), address(0));
        assertEq(paid, AMOUNT);
        assertEq(buyer.balance, 0);
        assertFalse(attacker.reentrySucceeded());
    }

    function test_reentrancy_callbackTokenDuringFundingBlocked() public {
        ReentrancyAttacker attacker = new ReentrancyAttacker(escrow);
        (bytes32 victim,) = _fundNative(AMOUNT);
        callback.mint(address(attacker), 100);
        callback.setHook(address(attacker));
        attacker.configure(ReentrancyAttacker.Mode.Release, victim, address(0), true);
        BasicEscrow.TradeTerms memory terms = _tokenTerms(address(attacker), buyer, address(callback), 100, _deadline());
        vm.expectRevert();
        attacker.fundToken(terms);
        // Non-propagating variant: funding completes, re-entry recorded as blocked by the guard.
        attacker.configure(ReentrancyAttacker.Mode.Release, victim, address(0), false);
        attacker.fundToken(terms);
        assertEq(bytes4(attacker.lastError()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(uint8(escrow.getTrade(victim).state), uint8(BasicEscrow.State.Funded));
    }

    function test_reentrancy_callbackTokenDuringPayoutBlocked() public {
        ReentrancyAttacker attacker = new ReentrancyAttacker(escrow);
        (bytes32 id, BasicEscrow.TradeTerms memory terms) = _fundToken(address(callback), 100);
        callback.setHook(address(attacker));
        attacker.configure(ReentrancyAttacker.Mode.Refund, id, address(0), true);
        vm.warp(terms.escrowExpirySeconds);
        escrow.refund(id);
        // Hook re-entry failed -> transfer reported failure -> credited once to the seller.
        assertEq(callback.balanceOf(seller), 0);
        assertEq(escrow.pendingWithdrawals(seller, address(callback)), 100);
        assertEq(callback.balanceOf(address(escrow)), 100);
    }

    // ---------------------------------------------------------------- forced ETH / views

    function test_forcedEth_createsUnownedSurplusOnly() public {
        (bytes32 id,) = _fundNative(AMOUNT);
        vm.deal(address(escrow), address(escrow).balance + 5 ether);
        vm.prank(seller);
        escrow.release(id);
        assertEq(buyer.balance, AMOUNT);
        assertEq(address(escrow).balance, 5 ether);
        vm.expectRevert(BasicEscrow.NothingToWithdraw.selector);
        escrow.withdraw(stranger, address(0));
    }

    function test_getTrade_unknownIsZero() public view {
        BasicEscrow.Escrow memory e = escrow.getTrade(keccak256("nothing"));
        assertEq(e.seller, address(0));
        assertEq(e.amount, 0);
        assertEq(uint8(e.state), 0);
    }
}
