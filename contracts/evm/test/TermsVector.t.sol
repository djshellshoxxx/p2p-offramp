// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {BasicEscrow} from "../src/BasicEscrow.sol";
import {MockERC20} from "./mocks/Mocks.sol";

/// @dev Cross-implementation check: the on-chain tradeId must equal `evmTermsHash` from
///      packages/wallet/src/evm-terms.ts for the synthetic local scenario fixture (read live from
///      packages/domain/test/fixtures/local-evm-scenario/scenario.json, so drift on either side fails).
///      The escrow and token are placed at the fixture's registry addresses on chain id 31337.
contract TermsVectorTest is Test {
    string internal constant FIXTURE = "../../packages/domain/test/fixtures/local-evm-scenario/scenario.json";
    string internal json;
    BasicEscrow internal escrow;

    function setUp() public {
        json = vm.readFile(FIXTURE);
        vm.chainId(vm.parseUint(vm.parseJsonString(json, ".domain.chainId")));
        address tokenAt = vm.parseJsonAddress(json, ".sets.erc20.terms.asset");
        deployCodeTo("Mocks.sol:MockERC20", abi.encode("Test USD", "TUSD"), tokenAt);
        address[] memory list = new address[](1);
        list[0] = tokenAt;
        address escrowAt = vm.parseJsonAddress(json, ".domain.verifyingContract");
        deployCodeTo("BasicEscrow.sol:BasicEscrow", abi.encode(list), escrowAt);
        escrow = BasicEscrow(escrowAt);
    }

    function _hex32(string memory key) internal view returns (bytes32) {
        return vm.parseBytes32(string.concat("0x", vm.parseJsonString(json, key)));
    }

    function _uint(string memory key) internal view returns (uint256) {
        return vm.parseUint(vm.parseJsonString(json, key));
    }

    function _terms(string memory set) internal view returns (BasicEscrow.TradeTerms memory t) {
        string memory p = string.concat(".sets.", set, ".terms.");
        string memory kind = vm.parseJsonString(json, string.concat(p, "assetKind"));
        t.orderId = _hex32(string.concat(p, "orderId"));
        t.revision = uint64(_uint(string.concat(p, "revision")));
        t.networkId = vm.parseJsonString(json, string.concat(p, "networkId"));
        t.deploymentId = vm.parseJsonString(json, string.concat(p, "deploymentId"));
        t.seller = vm.parseJsonAddress(json, string.concat(p, "seller"));
        t.buyer = vm.parseJsonAddress(json, string.concat(p, "buyer"));
        t.assetKind = keccak256(bytes(kind)) == keccak256("native") ? 0 : 1;
        t.asset = vm.parseJsonAddress(json, string.concat(p, "asset"));
        t.amountBaseUnits = _uint(string.concat(p, "amountBaseUnits"));
        t.privateAgreementHash = _hex32(string.concat(p, "privateAgreementHash"));
        t.capabilitiesHash = _hex32(string.concat(p, "capabilitiesHash"));
        t.sellerNonce = _hex32(string.concat(p, "sellerNonce"));
        t.acceptBeforeSeconds = uint64(_uint(string.concat(p, "acceptBeforeSeconds")));
        t.escrowExpirySeconds = uint64(_uint(string.concat(p, "escrowExpirySeconds")));
    }

    function test_tradeIdEqualsG16EvmTermsHash_native() public view {
        assertEq(escrow.tradeIdOf(_terms("native")), _hex32(".sets.native.expectedEvmTermsHash"));
    }

    function test_tradeIdEqualsG16EvmTermsHash_erc20() public view {
        assertEq(escrow.tradeIdOf(_terms("erc20")), _hex32(".sets.erc20.expectedEvmTermsHash"));
    }

    function test_tradeIdChangesWithAnyField() public view {
        BasicEscrow.TradeTerms memory t = _terms("native");
        bytes32 expected = _hex32(".sets.native.expectedEvmTermsHash");
        t.amountBaseUnits += 1;
        assertTrue(escrow.tradeIdOf(t) != expected);
        t = _terms("native");
        t.networkId = "local-evm2";
        assertTrue(escrow.tradeIdOf(t) != expected);
    }

    function test_fixtureNativeTradeFundsUnderRecordedIdAndReleases() public {
        BasicEscrow.TradeTerms memory t = _terms("native");
        vm.warp(_uint(".fundingWindow.okChainTimeSeconds"));
        vm.deal(t.seller, t.amountBaseUnits);
        vm.prank(t.seller);
        bytes32 id = escrow.fundNative{value: t.amountBaseUnits}(t);
        assertEq(id, _hex32(".sets.native.expectedEvmTermsHash"));
        vm.prank(t.seller);
        escrow.release(id);
        assertEq(t.buyer.balance, t.amountBaseUnits);
    }

    function test_fixtureErc20TradeFundsUnderRecordedIdAndRefunds() public {
        BasicEscrow.TradeTerms memory t = _terms("erc20");
        vm.warp(_uint(".fundingWindow.okChainTimeSeconds"));
        MockERC20(t.asset).mint(t.seller, t.amountBaseUnits);
        vm.startPrank(t.seller);
        MockERC20(t.asset).approve(address(escrow), t.amountBaseUnits);
        bytes32 id = escrow.fundToken(t);
        vm.stopPrank();
        assertEq(id, _hex32(".sets.erc20.expectedEvmTermsHash"));
        vm.warp(t.escrowExpirySeconds);
        escrow.refund(id);
        assertEq(MockERC20(t.asset).balanceOf(t.seller), t.amountBaseUnits);
    }

    function test_fixtureFundingWindowMatchesDomainRule() public {
        BasicEscrow.TradeTerms memory t = _terms("native");
        vm.deal(t.seller, 2 * t.amountBaseUnits);
        vm.warp(_uint(".fundingWindow.expiredChainTimeSeconds"));
        vm.prank(t.seller);
        vm.expectRevert(abi.encodeWithSelector(BasicEscrow.AcceptanceExpired.selector, t.acceptBeforeSeconds));
        escrow.fundNative{value: t.amountBaseUnits}(t);
        uint256 early = _uint(".fundingWindow.tooEarlyChainTimeSeconds");
        vm.warp(early);
        (uint256 earliest, uint256 latest) = (early + escrow.MIN_DURATION(), early + escrow.MAX_DURATION());
        vm.prank(t.seller);
        vm.expectRevert(
            abi.encodeWithSelector(BasicEscrow.DeadlineOutOfRange.selector, t.escrowExpirySeconds, earliest, latest)
        );
        escrow.fundNative{value: t.amountBaseUnits}(t);
    }
}
