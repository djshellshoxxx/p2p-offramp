// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {BasicEscrow} from "../../src/BasicEscrow.sol";

contract FormalOutsider {
    function release(BasicEscrow subject, bytes32 id) external returns (bool) {
        try subject.release(id) { return true; } catch { return false; }
    }
    function refund(BasicEscrow subject, bytes32 id) external returns (bool) {
        try subject.refund(id) { return true; } catch { return false; }
    }
}

contract UnauthorizedRelease {
    function _terms(address buyer, uint256 amount) private view returns (BasicEscrow.TradeTerms memory t) {
        require(block.timestamp <= type(uint64).max - 604800);
        t = BasicEscrow.TradeTerms({orderId: bytes32(uint256(1)), revision: 1, networkId: "formal-local",
            deploymentId: "canonical-basic-v1", seller: address(this), buyer: buyer, assetKind: 0, asset: address(0),
            amountBaseUnits: amount, privateAgreementHash: bytes32(0), capabilitiesHash: bytes32(0),
            sellerNonce: bytes32(uint256(1)), acceptBeforeSeconds: uint64(block.timestamp + 60),
            escrowExpirySeconds: uint64(block.timestamp + 1800)});
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
}
