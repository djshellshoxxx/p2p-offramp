// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {BasicEscrow} from "../src/BasicEscrow.sol";

/// @notice Test-network deployment of BasicEscrow (G25). Native-asset only: the ERC-20 allowlist is empty, so the
///         deployment is fixed forever to native trades. Never for mainnet: the script refuses any chain id other than
///         the one the operator names, and the wrapper (scripts/sepolia/deploy.mjs) only names Sepolia or local anvil.
/// @dev The deployer key is read from the environment inside the script, so it never appears in a process argument
///      list. `DEPLOY_EXPECTED_CHAIN_ID` must equal the connected node's chain id.
contract DeployBasicEscrow is Script {
    error UnexpectedChain(uint256 expected, uint256 actual);

    function run() external returns (BasicEscrow escrow) {
        uint256 expected = vm.envUint("DEPLOY_EXPECTED_CHAIN_ID");
        if (block.chainid != expected) revert UnexpectedChain(expected, block.chainid);
        uint256 key = vm.envUint("SEPOLIA_DEPLOYER_PRIVATE_KEY");
        address[] memory tokens = new address[](0);
        vm.startBroadcast(key);
        escrow = new BasicEscrow(tokens);
        vm.stopBroadcast();
    }
}
