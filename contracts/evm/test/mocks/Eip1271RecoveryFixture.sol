// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Deliberately controllable local-test wallet; not a deployment candidate.
contract Eip1271RecoveryFixture {
    uint8 public mode;
    mapping(bytes32 digest => bytes32 signatureHash) private approvals;
    function setMode(uint8 next) external { mode = next; }
    function setApproval(bytes32 digest, bytes calldata signature, bool enabled) external {
        approvals[digest] = enabled ? keccak256(signature) : bytes32(0);
    }
    function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4) {
        if (mode == 1) return 0xffffffff;
        if (mode == 2) revert("synthetic wallet refuses");
        if (mode == 3) { while (true) { } }
        if (mode == 4) { assembly { mstore(0, shl(224, 0x1626ba7e)) return(0, 4) } }
        if (mode == 5) { assembly { mstore(0, shl(224, 0x1626ba7e)) return(0, 8192) } }
        return signature.length != 0 && approvals[digest] == keccak256(signature) ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}
