// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";

/// @notice Sends one pre-built call (target, calldata, value) as the trade seller on a test network (G25 trade proof).
///         The calldata is built outside Solidity by packages/wallet/src/evm-escrow.ts, so this script adds no encoding
///         of its own. It refuses any chain id other than Sepolia's (11155111) and reverts (so nothing is broadcast)
///         when the call would revert in simulation.
/// @dev The signer key is read from SEPOLIA_SELLER_PRIVATE_KEY inside the script, never from a process argument.
///      CALL_GAS (from eth_estimateGas in scripts/sepolia/send.mjs) becomes the transaction's gas: BasicEscrow's payout
///      needs gasleft() >= MIN_PAYOUT_GAS, which Forge's own estimate does not provide.
///      Only the seller ever sends transactions in the basic-v1 flow: fund, release and (after the deadline) refund.
contract SendCall is Script {
    uint256 internal constant SEPOLIA_CHAIN_ID = 11155111;
    error UnexpectedChain(uint256 expected, uint256 actual);
    error CallReverted(bytes reason);

    function run() external {
        if (block.chainid != SEPOLIA_CHAIN_ID) revert UnexpectedChain(SEPOLIA_CHAIN_ID, block.chainid);
        uint256 key = vm.envUint("SEPOLIA_SELLER_PRIVATE_KEY");
        address target = vm.envAddress("CALL_TO");
        bytes memory data = vm.envBytes("CALL_DATA");
        uint256 value = vm.envUint("CALL_VALUE");
        uint256 gasLimit = vm.envUint("CALL_GAS");
        vm.startBroadcast(key);
        (bool ok, bytes memory reason) = target.call{value: value, gas: gasLimit}(data);
        vm.stopBroadcast();
        if (!ok) revert CallReverted(reason);
    }
}
