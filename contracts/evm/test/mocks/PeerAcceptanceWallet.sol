// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice TEST-ONLY ERC-1271 contract wallet for the D1 peer-acceptance loopback check
/// (scripts/test-peer-acceptance-evm-local.mjs). A digest is valid while the policy is enabled and the owner EOA
/// signed it (65-byte r||s||v, ecrecover). The owner can revoke the policy, which a point-in-time recheck must observe.
/// Never deployed outside a local Anvil node; it holds no funds and has no escrow authority.
contract PeerAcceptanceWallet {
    bytes4 internal constant MAGIC = 0x1626ba7e;
    address public immutable owner;
    bool public enabled = true;

    constructor(address owner_) {
        owner = owner_;
    }

    function setEnabled(bool value) external {
        require(msg.sender == owner, "owner");
        enabled = value;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        if (!enabled || signature.length != 65) return 0xffffffff;
        bytes32 r = bytes32(signature[0:32]);
        bytes32 s = bytes32(signature[32:64]);
        uint8 v = uint8(signature[64]);
        address signer = ecrecover(hash, v, r, s);
        return signer != address(0) && signer == owner ? MAGIC : bytes4(0xffffffff);
    }
}
