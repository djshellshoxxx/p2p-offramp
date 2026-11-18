// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

/// @dev Independent Solidity ABI encoding and EVM ecrecover for the private D1
/// candidate. This fixture does not add acceptance verification to BasicEscrow.
contract PeerAcceptanceVectorTest is Test {
    bytes32 internal constant TYPEHASH = keccak256(
        "PeerAcceptance(uint8 v,bytes32 termsHash,uint8 role,address account,bytes32 ownMessagingKey,bytes32 counterpartyMessagingKey,uint64 notAfterSeconds)"
    );
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    string internal vectors;
    string internal scenario;

    struct Binding {
        uint8 v;
        bytes32 termsHash;
        uint8 role;
        address account;
        bytes32 ownMessagingKey;
        bytes32 counterpartyMessagingKey;
        uint64 notAfterSeconds;
    }

    function setUp() public {
        vectors = vm.readFile("../../packages/wallet/test/fixtures/peer-acceptance-v1.json");
        scenario = vm.readFile("../../packages/domain/test/fixtures/local-evm-scenario/scenario.json");
    }

    function _hex32(string memory key) internal view returns (bytes32) {
        return vm.parseBytes32(string.concat("0x", vm.parseJsonString(vectors, key)));
    }

    function _binding(uint256 index) internal view returns (Binding memory b) {
        string memory p = string.concat(".vectors[", vm.toString(index), "].binding.");
        b.v = uint8(vm.parseJsonUint(vectors, string.concat(p, "v")));
        string memory role = vm.parseJsonString(vectors, string.concat(p, "role"));
        assertTrue(keccak256(bytes(role)) == keccak256("seller") || keccak256(bytes(role)) == keccak256("buyer"));
        b.role = keccak256(bytes(role)) == keccak256("seller") ? 0 : 1;
        b.termsHash = _hex32(string.concat(p, "termsHash"));
        b.account = vm.parseJsonAddress(vectors, string.concat(p, "account"));
        b.ownMessagingKey = _hex32(string.concat(p, "ownMessagingKey"));
        b.counterpartyMessagingKey = _hex32(string.concat(p, "counterpartyMessagingKey"));
        b.notAfterSeconds = uint64(vm.parseUint(vm.parseJsonString(vectors, string.concat(p, "notAfterSeconds"))));
    }

    function _domain(uint256 chainId, address verifyingContract) internal pure returns (bytes32) {
        return
            keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("P2POfframp"), keccak256("1"), chainId, verifyingContract));
    }

    function _digest(Binding memory b, bytes32 domain) internal pure returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                TYPEHASH,
                b.v,
                b.termsHash,
                b.role,
                b.account,
                b.ownMessagingKey,
                b.counterpartyMessagingKey,
                b.notAfterSeconds
            )
        );
        return keccak256(abi.encodePacked(hex"1901", domain, structHash));
    }

    function _recover(bytes32 digest, bytes memory signature) internal pure returns (address) {
        require(signature.length == 65);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        require(v == 27 || v == 28);
        require(uint256(s) > 0 && uint256(s) <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0);
        return ecrecover(digest, v, r, s);
    }

    function _check(uint256 index, string memory role, string memory asset) internal view {
        string memory p = string.concat(".vectors[", vm.toString(index), "].");
        Binding memory b = _binding(index);
        assertEq(b.v, 1);
        assertEq(b.role, keccak256(bytes(role)) == keccak256("seller") ? 0 : 1);
        assertEq(b.account, vm.parseJsonAddress(scenario, string.concat(".sets.", asset, ".terms.", role)));
        assertEq(
            b.termsHash,
            vm.parseBytes32(
                string.concat(
                    "0x", vm.parseJsonString(scenario, string.concat(".sets.", asset, ".expectedEvmTermsHash"))
                )
            )
        );
        bytes32 domain = _domain(
            vm.parseUint(vm.parseJsonString(vectors, ".domain.chainId")),
            vm.parseJsonAddress(vectors, ".domain.verifyingContract")
        );
        bytes32 digest = _digest(b, domain);
        assertEq(digest, _hex32(string.concat(p, "digest")));
        bytes memory bindingSignature = vm.parseJsonBytes(vectors, string.concat(p, "bindingSignature"));
        bytes memory termsSignature = vm.parseJsonBytes(vectors, string.concat(p, "termsSignature"));
        assertEq(_recover(digest, bindingSignature), b.account);
        assertEq(_recover(b.termsHash, termsSignature), b.account);
        assertTrue(_recover(digest, termsSignature) != b.account, "terms signature cannot replace binding");
        assertTrue(_recover(b.termsHash, bindingSignature) != b.account, "binding cannot replace terms signature");
        b.role = b.role == 0 ? 1 : 0;
        assertTrue(_recover(_digest(b, domain), bindingSignature) != b.account, "role replay");
        b = _binding(index);
        (b.ownMessagingKey, b.counterpartyMessagingKey) = (b.counterpartyMessagingKey, b.ownMessagingKey);
        assertTrue(_recover(_digest(b, domain), bindingSignature) != b.account, "key direction replay");
        b = _binding(index);
        b.notAfterSeconds++;
        assertTrue(_recover(_digest(b, domain), bindingSignature) != b.account, "expiry replay");
        b = _binding(index);
        assertTrue(_recover(_digest(b, _domain(1, address(0x1234))), bindingSignature) != b.account, "domain replay");
    }

    function test_peerAcceptanceSellerNative() public view {
        _check(0, "seller", "native");
    }

    function test_peerAcceptanceSellerErc20() public view {
        _check(1, "seller", "erc20");
    }

    function test_peerAcceptanceBuyerNative() public view {
        _check(2, "buyer", "native");
    }

    function test_peerAcceptanceBuyerErc20() public view {
        _check(3, "buyer", "erc20");
    }
}
