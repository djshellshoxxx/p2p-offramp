// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {BasicEscrow} from "../src/BasicEscrow.sol";
import {MockERC20, RevertingReceiver} from "./mocks/Mocks.sol";

/// @dev Drives random sequences of fund/release/refund/withdraw/warp across EOAs and a receiver that
///      toggles between rejecting and accepting native payments. Records ghost state for invariants.
contract EscrowHandler is Test {
    BasicEscrow public immutable escrow;
    MockERC20 public immutable token;
    RevertingReceiver public immutable flaky;
    address[] public actors;
    bytes32[] public ids;

    uint256 public nonce;
    uint256 public ghostMinted; // total token supply ever minted to actors
    uint256 public ghostNativeTotal; // total native ever given to actors
    mapping(bytes32 => BasicEscrow.State) public ghostTerminal;
    uint256 public terminalTransitions;
    uint256 public stateRegressions;

    constructor(BasicEscrow escrow_, MockERC20 token_) {
        escrow = escrow_;
        token = token_;
        flaky = new RevertingReceiver();
        actors.push(makeAddr("a0"));
        actors.push(makeAddr("a1"));
        actors.push(makeAddr("a2"));
        actors.push(address(flaky));
        for (uint256 i; i < actors.length; ++i) {
            vm.deal(actors[i], 100 ether);
            ghostNativeTotal += 100 ether;
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function idCount() external view returns (uint256) {
        return ids.length;
    }

    function _terms(address s, address b, uint8 kind, uint256 amount, uint256 duration)
        internal
        returns (BasicEscrow.TradeTerms memory t)
    {
        ++nonce;
        t = BasicEscrow.TradeTerms({
            orderId: keccak256(abi.encode("inv-order", nonce)),
            revision: 1,
            networkId: "local-evm",
            deploymentId: "escrow-local-v1",
            seller: s,
            buyer: b,
            assetKind: kind,
            asset: kind == 0 ? address(0) : address(token),
            amountBaseUnits: amount,
            privateAgreementHash: bytes32(0),
            capabilitiesHash: bytes32(0),
            sellerNonce: keccak256(abi.encode("inv-nonce", nonce)),
            acceptBeforeSeconds: uint64(block.timestamp + 1),
            escrowExpirySeconds: uint64(block.timestamp + duration)
        });
    }

    function fundNative(uint256 sSeed, uint256 bSeed, uint256 amount, uint256 duration) external {
        address s = actors[sSeed % 3]; // EOAs only as native sellers (the flaky receiver can still be buyer)
        address b = actors[bSeed % actors.length];
        if (s == b) return;
        if (s.balance == 0) return;
        amount = bound(amount, 1, s.balance);
        duration = bound(duration, escrow.MIN_DURATION(), escrow.MAX_DURATION());
        BasicEscrow.TradeTerms memory t = _terms(s, b, 0, amount, duration);
        vm.prank(s);
        ids.push(escrow.fundNative{value: amount}(t));
    }

    function fundToken(uint256 sSeed, uint256 bSeed, uint256 amount, uint256 duration) external {
        address s = actors[sSeed % actors.length];
        address b = actors[bSeed % actors.length];
        if (s == b) return;
        amount = bound(amount, 1, 1e30);
        duration = bound(duration, escrow.MIN_DURATION(), escrow.MAX_DURATION());
        token.mint(s, amount);
        ghostMinted += amount;
        BasicEscrow.TradeTerms memory t = _terms(s, b, 1, amount, duration);
        vm.startPrank(s);
        token.approve(address(escrow), amount);
        ids.push(escrow.fundToken(t));
        vm.stopPrank();
    }

    function release(uint256 idSeed, uint256 callerSeed) external {
        if (ids.length == 0) return;
        bytes32 id = ids[idSeed % ids.length];
        BasicEscrow.Escrow memory e = escrow.getTrade(id);
        address caller = callerSeed % 4 == 0 ? actors[callerSeed % actors.length] : e.seller;
        vm.prank(caller);
        try escrow.release(id) {
            _terminal(id, BasicEscrow.State.Released);
        } catch {}
    }

    function refund(uint256 idSeed, uint256 callerSeed) external {
        if (ids.length == 0) return;
        bytes32 id = ids[idSeed % ids.length];
        vm.prank(actors[callerSeed % actors.length]);
        try escrow.refund(id) {
            _terminal(id, BasicEscrow.State.Refunded);
        } catch {}
    }

    function withdraw(uint256 actorSeed, bool native) external {
        address who = actors[actorSeed % actors.length];
        try escrow.withdraw(who, native ? address(0) : address(token)) {} catch {}
    }

    function warp(uint256 seconds_) external {
        vm.warp(block.timestamp + bound(seconds_, 1, 3 days));
    }

    function toggleFlaky(bool accept) external {
        flaky.setAccept(accept);
    }

    function _terminal(bytes32 id, BasicEscrow.State s) private {
        if (ghostTerminal[id] != BasicEscrow.State.None) ++stateRegressions; // second terminal transition
        ghostTerminal[id] = s;
        ++terminalTransitions;
    }
}

contract BasicEscrowInvariantTest is Test {
    BasicEscrow internal escrow;
    MockERC20 internal token;
    EscrowHandler internal handler;

    function setUp() public {
        vm.warp(1_700_000_000);
        token = new MockERC20("Test USD", "TUSD");
        address[] memory list = new address[](1);
        list[0] = address(token);
        escrow = new BasicEscrow(list);
        handler = new EscrowHandler(escrow, token);
        targetContract(address(handler));
    }

    function _liabilities(address asset) internal view returns (uint256 active, uint256 pending) {
        uint256 n = handler.idCount();
        for (uint256 i; i < n; ++i) {
            BasicEscrow.Escrow memory e = escrow.getTrade(handler.ids(i));
            if (e.state == BasicEscrow.State.Funded && e.token == asset) active += e.amount;
        }
        uint256 m = handler.actorCount();
        for (uint256 i; i < m; ++i) {
            pending += escrow.pendingWithdrawals(handler.actors(i), asset);
        }
    }

    /// Contract balance per asset equals active escrows plus deferred credits (no surplus, no shortfall).
    function invariant_conservationNative() public view {
        (uint256 active, uint256 pending) = _liabilities(address(0));
        assertEq(address(escrow).balance, active + pending);
    }

    function invariant_conservationToken() public view {
        (uint256 active, uint256 pending) = _liabilities(address(token));
        assertEq(token.balanceOf(address(escrow)), active + pending);
    }

    /// Closed system: value held by actors plus escrow never exceeds what entered, so no trade paid twice.
    function invariant_noDoublePayoutNative() public view {
        uint256 held = address(escrow).balance;
        uint256 m = handler.actorCount();
        for (uint256 i; i < m; ++i) {
            held += handler.actors(i).balance;
        }
        assertEq(held, handler.ghostNativeTotal());
    }

    function invariant_noDoublePayoutToken() public view {
        uint256 held = token.balanceOf(address(escrow));
        uint256 m = handler.actorCount();
        for (uint256 i; i < m; ++i) {
            held += token.balanceOf(handler.actors(i));
        }
        assertEq(held, handler.ghostMinted());
        assertEq(token.totalSupply(), handler.ghostMinted());
    }

    /// Each trade reaches at most one terminal state and stays there.
    function invariant_terminalStatesAreFinal() public view {
        assertEq(handler.stateRegressions(), 0);
        uint256 n = handler.idCount();
        for (uint256 i; i < n; ++i) {
            bytes32 id = handler.ids(i);
            BasicEscrow.State ghost = handler.ghostTerminal(id);
            if (ghost != BasicEscrow.State.None) assertEq(uint8(escrow.getTrade(id).state), uint8(ghost));
        }
    }
}
