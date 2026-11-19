// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {BasicEscrow} from "../src/BasicEscrow.sol";
import {RevertingReceiver} from "../test/mocks/Mocks.sol";
import {Test} from "forge-std/Test.sol";

/// Actual distinct caller; it never substitutes an escrow implementation or destination.
contract FormalOutsider {
    function release(BasicEscrow subject, bytes32 id) external returns (bool) {
        try subject.release(id) { return true; } catch { return false; }
    }
    function refund(BasicEscrow subject, bytes32 id) external returns (bool) {
        try subject.refund(id) { return true; } catch { return false; }
    }
}

/// SMT checks call the actual canonical contract. Compiler abstractions/unsupported features remain reportable unknowns.
/// Scope: a fresh native trade, one transaction, uint128 principal, explicit distinct actor classes.
contract CanonicalSMT {
    function _terms(address buyer, uint256 amount) private view returns (BasicEscrow.TradeTerms memory t) {
        require(block.timestamp <= type(uint64).max - 604800);
        t = BasicEscrow.TradeTerms({orderId: bytes32(uint256(1)), revision: 1, networkId: "formal-local",
            deploymentId: "canonical-basic-v1", seller: address(this), buyer: buyer, assetKind: 0, asset: address(0),
            amountBaseUnits: amount, privateAgreementHash: bytes32(0), capabilitiesHash: bytes32(0),
            sellerNonce: bytes32(uint256(1)), acceptBeforeSeconds: uint64(block.timestamp + 60),
            escrowExpirySeconds: uint64(block.timestamp + 1800)});
    }
    function checkNativeAssetExcludedFromTokenAllowlist() external {
        BasicEscrow subject = new BasicEscrow(new address[](0));
        // @property EVM-NATIVE-ASSET-NOT-TOKEN
        assert(!subject.isAllowlisted(address(0)));
    }
    function checkUnauthorizedReleaseIsAtomic() external payable {
        require(msg.value > 0 && msg.value <= type(uint128).max);
        BasicEscrow subject = new BasicEscrow(new address[](0));
        FormalOutsider outsider = new FormalOutsider();
        require(address(outsider) != address(this) && address(outsider) != address(subject));
        address buyer = address(0xB0B);
        require(buyer != address(this) && buyer != address(subject));
        bytes32 id = subject.fundNative{value: msg.value}(_terms(buyer, msg.value));
        bool released = outsider.release(subject, id);
        BasicEscrow.Escrow memory observed = subject.getTrade(id);
        // @property EVM-UNAUTHORIZED-RELEASE-ATOMIC
        assert(!released && observed.state == BasicEscrow.State.Funded && observed.seller == address(this)
            && observed.buyer == buyer && observed.amount == msg.value);
    }
    function checkRefundBeforeDeadlineIsAtomic() external payable {
        require(msg.value > 0 && msg.value <= type(uint128).max);
        BasicEscrow subject = new BasicEscrow(new address[](0));
        FormalOutsider outsider = new FormalOutsider();
        address buyer = address(0xB0B);
        require(buyer != address(this) && buyer != address(subject));
        bytes32 id = subject.fundNative{value: msg.value}(_terms(buyer, msg.value));
        bool refunded = outsider.refund(subject, id);
        BasicEscrow.Escrow memory observed = subject.getTrade(id);
        // @property EVM-EARLY-REFUND-ATOMIC
        assert(!refunded && observed.state == BasicEscrow.State.Funded && observed.buyer == buyer
            && observed.amount == msg.value && observed.deadline > block.timestamp);
    }
}

/// Isolated native counterexample/refinement witness, selected only with FOUNDRY_TEST=formal.
/// The strict-model assertion deliberately fails; the runner must classify it as a MODEL_IMPLEMENTATION_GAP.
contract CanonicalNativeWitness is Test {
    uint256 private constant PRINCIPAL = 1 ether;
    uint256 private constant SURPLUS = 3 ether;
    struct Trace { bytes32 id; uint256 terminalPaid; uint256 terminalPending; uint256 terminalCustody; }
    function _trace() private returns (Trace memory trace) {
        vm.warp(1_700_000_000);
        BasicEscrow subject = new BasicEscrow(new address[](0));
        RevertingReceiver buyer = new RevertingReceiver();
        address seller = makeAddr("formal-seller");
        address outsider = makeAddr("formal-outsider");
        vm.deal(seller, PRINCIPAL);
        BasicEscrow.TradeTerms memory terms = BasicEscrow.TradeTerms({orderId: keccak256("formal-native-witness"),
            revision: 1, networkId: "formal-local", deploymentId: "canonical-basic-v1", seller: seller,
            buyer: address(buyer), assetKind: 0, asset: address(0), amountBaseUnits: PRINCIPAL,
            privateAgreementHash: bytes32(0), capabilitiesHash: bytes32(0), sellerNonce: keccak256("formal-nonce"),
            acceptBeforeSeconds: uint64(block.timestamp + 60), escrowExpirySeconds: uint64(block.timestamp + 1800)});
        vm.prank(seller); trace.id = subject.fundNative{value: PRINCIPAL}(terms);
        assertEq(uint256(subject.getTrade(trace.id).state), uint256(BasicEscrow.State.Funded));
        // Environment-only forced-balance injection; it is not principal or a deposit observation.
        vm.deal(address(subject), address(subject).balance + SURPLUS);
        vm.prank(seller); subject.release(trace.id);
        trace.terminalPaid = address(buyer).balance;
        trace.terminalPending = subject.pendingWithdrawals(address(buyer), address(0));
        trace.terminalCustody = address(subject).balance;
        assertEq(uint256(subject.getTrade(trace.id).state), uint256(BasicEscrow.State.Released));
        assertEq(trace.terminalPaid, 0); assertEq(trace.terminalPending, PRINCIPAL);
        assertEq(trace.terminalCustody, PRINCIPAL + SURPLUS);
        assertEq(subject.getTrade(trace.id).seller, seller); assertEq(subject.getTrade(trace.id).buyer, address(buyer));
        buyer.setAccept(true);
        vm.prank(outsider); subject.withdraw(address(buyer), address(0));
        assertEq(address(buyer).balance, PRINCIPAL); assertEq(subject.pendingWithdrawals(address(buyer), address(0)), 0);
        assertEq(address(subject).balance, SURPLUS); assertEq(outsider.balance, 0);
        vm.expectRevert(); vm.prank(seller); subject.release(trace.id);
        vm.warp(terms.escrowExpirySeconds); vm.expectRevert(); subject.refund(trace.id);
        vm.expectRevert(); subject.withdraw(address(buyer), address(0));
        emit log_named_bytes32("tradeId", trace.id);
        emit log_named_uint("principal", PRINCIPAL); emit log_named_uint("surplus", SURPLUS);
        emit log_named_uint("activeAfterTerminal", 0); emit log_named_uint("paidAfterTerminal", trace.terminalPaid);
        emit log_named_uint("pendingAfterTerminal", trace.terminalPending); emit log_named_uint("custodyAfterTerminal", trace.terminalCustody);
        emit log_named_uint("paidAfterWithdrawal", address(buyer).balance); emit log_named_uint("pendingAfterWithdrawal", 0);
        emit log_named_uint("custodyAfterWithdrawal", address(subject).balance);
        emit log_named_address("seller", seller); emit log_named_address("buyer", address(buyer)); emit log_named_address("withdrawCaller", outsider);
    }
    function test_nativeRefinementConservesPendingAndPaid() public { _trace(); }
    function test_counterexampleStrictTerminalAlreadyPaid() public {
        Trace memory trace = _trace();
        assertEq(trace.terminalPaid, PRINCIPAL, "STRICT_TERMINAL_ALREADY_PAID");
    }
}
