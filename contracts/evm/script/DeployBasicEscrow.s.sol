// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {BasicEscrow} from "../src/BasicEscrow.sol";

/// @notice Test-network deployment of BasicEscrow (G25). Native-asset only: the ERC-20 allowlist is empty, so the
///         deployment is fixed forever to native trades. Never for mainnet: the script refuses any chain id other than
///         Sepolia's (11155111). The genesis check is the wrapper's (scripts/sepolia/deploy.mjs); local proofs use an
///         anvil started with Sepolia's chain id.
/// @dev The deployer key is read from the environment inside the script, so it never appears in a process argument
///      list.
contract DeployBasicEscrow is Script {
    uint256 internal constant SEPOLIA_CHAIN_ID = 11155111;
    error UnexpectedChain(uint256 expected, uint256 actual);

    function run() external returns (BasicEscrow escrow) {
        if (block.chainid != SEPOLIA_CHAIN_ID) revert UnexpectedChain(SEPOLIA_CHAIN_ID, block.chainid);
        uint256 key = vm.envUint("SEPOLIA_DEPLOYER_PRIVATE_KEY");
        address[] memory tokens = new address[](0);
        vm.startBroadcast(key);
        escrow = new BasicEscrow(tokens);
        vm.stopBroadcast();
    }
}
