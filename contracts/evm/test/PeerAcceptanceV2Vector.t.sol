// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

/// @dev Solidity ABI encoding and EVM ecrecover for the frozen D1 version 2 carrier vectors
/// (packages/wallet/test/fixtures/peer-acceptance-v2-carrier.json). Recomputes the EIP-712 domain separator, the
/// TradeTerms struct hash and termsHash, and both PeerAcceptance struct hashes and digests independently of the
/// JavaScript generator. No acceptance verification is added to BasicEscrow.
contract PeerAcceptanceV2VectorTest is Test {
    bytes32 internal constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant TERMS_TYPEHASH = keccak256(
        "TradeTerms(uint8 v,bytes32 orderId,uint64 revision,string networkId,string deploymentId,address seller,address buyer,uint8 assetKind,address asset,uint256 amountBaseUnits,bytes32 privateAgreementHash,bytes32 capabilitiesHash,bytes32 sellerNonce,uint64 acceptBeforeSeconds,uint64 escrowExpirySeconds,uint8 mode)"
    );
    bytes32 internal constant PEER_TYPEHASH = keccak256(
        "PeerAcceptance(uint8 v,bytes32 termsHash,uint8 role,address account,bytes32 ownMessagingKey,bytes32 counterpartyMessagingKey,uint64 notAfterSeconds)"
    );
    string internal json;

    function setUp() public {
        json = vm.readFile("../../packages/wallet/test/fixtures/peer-acceptance-v2-carrier.json");
    }

    function _hex32(string memory key) internal view returns (bytes32) {
        return vm.parseBytes32(string.concat("0x", vm.parseJsonString(json, key)));
    }

    function _uint(string memory key) internal view returns (uint256) {
        return vm.parseUint(vm.parseJsonString(json, key));
    }

    function _domain() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256("P2POfframp"),
                keccak256("1"),
                _uint(".domain.chainId"),
                vm.parseJsonAddress(json, ".domain.verifyingContract")
            )
        );
    }

    /// @dev Two static halves concatenated equal abi.encode of all seventeen words (avoids stack depth limits).
    function _termsStruct() internal view returns (bytes32) {
        bytes memory head = abi.encode(
            TERMS_TYPEHASH,
            uint8(1),
            _hex32(".terms.orderId"),
            uint64(_uint(".terms.revision")),
            keccak256(bytes(vm.parseJsonString(json, ".terms.networkId"))),
            keccak256(bytes(vm.parseJsonString(json, ".terms.deploymentId"))),
            vm.parseJsonAddress(json, ".terms.seller"),
            vm.parseJsonAddress(json, ".terms.buyer")
        );
        string memory kind = vm.parseJsonString(json, ".terms.assetKind");
        bytes memory tail = abi.encode(
            keccak256(bytes(kind)) == keccak256("native") ? uint8(0) : uint8(1),
            vm.parseJsonAddress(json, ".terms.asset"),
            _uint(".terms.amountBaseUnits"),
            _hex32(".terms.privateAgreementHash"),
            _hex32(".terms.capabilitiesHash"),
            _hex32(".terms.sellerNonce"),
            uint64(_uint(".terms.acceptBeforeSeconds")),
            uint64(_uint(".terms.escrowExpirySeconds")),
            uint8(0)
        );
        return keccak256(bytes.concat(head, tail));
    }

    function _bindingStruct(uint256 index) internal view returns (bytes32 structHash, address account) {
        string memory p = string.concat(".statements[", vm.toString(index), "].binding.");
        string memory role = vm.parseJsonString(json, string.concat(p, "role"));
        account = vm.parseJsonAddress(json, string.concat(p, "account"));
        structHash = keccak256(
            abi.encode(
                PEER_TYPEHASH,
                uint8(vm.parseJsonUint(json, string.concat(p, "v"))),
                _hex32(string.concat(p, "termsHash")),
                keccak256(bytes(role)) == keccak256("seller") ? uint8(0) : uint8(1),
                account,
                _hex32(string.concat(p, "ownMessagingKey")),
                _hex32(string.concat(p, "counterpartyMessagingKey")),
                uint64(vm.parseUint(vm.parseJsonString(json, string.concat(p, "notAfterSeconds"))))
            )
        );
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
        require(uint256(s) <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0);
        return ecrecover(digest, v, r, s);
    }

    function test_domainSeparatorAndTradeTermsDigest() public view {
        assertEq(_domain(), _hex32(".domainSeparator"));
        assertEq(_termsStruct(), _hex32(".tradeTermsStructHash"));
        assertEq(keccak256(abi.encodePacked(hex"1901", _domain(), _termsStruct())), _hex32(".termsHash"));
        assertEq(PEER_TYPEHASH, _hex32(".peerAcceptanceTypeHash"));
    }

    function test_bothStatementsStructHashDigestAndSignatures() public view {
        bytes32 termsHash = _hex32(".termsHash");
        for (uint256 i = 0; i < 2; i++) {
            string memory p = string.concat(".statements[", vm.toString(i), "].");
            (bytes32 structHash, address account) = _bindingStruct(i);
            assertEq(structHash, _hex32(string.concat(p, "structHash")));
            bytes32 digest = keccak256(abi.encodePacked(hex"1901", _domain(), structHash));
            assertEq(digest, _hex32(string.concat(p, "digest")));
            assertEq(_recover(termsHash, vm.parseJsonBytes(json, string.concat(p, "termsSignature"))), account);
            assertEq(_recover(digest, vm.parseJsonBytes(json, string.concat(p, "bindingSignature"))), account);
        }
    }

    function test_bindingIsBoundToDomainRoleAndKeys() public view {
        (bytes32 structHash, address account) = _bindingStruct(0);
        bytes memory signature = vm.parseJsonBytes(json, ".statements[0].bindingSignature");
        // Another chain id or escrow address: the same binding signature recovers someone else.
        bytes32 otherDomain = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("P2POfframp"), keccak256("1"), uint256(1), address(0x5555)));
        assertTrue(_recover(keccak256(abi.encodePacked(hex"1901", otherDomain, structHash)), signature) != account);
        // The buyer's struct hash differs (role and key direction), so the seller signature never covers it.
        (bytes32 buyerStruct,) = _bindingStruct(1);
        assertTrue(buyerStruct != structHash);
        assertTrue(_recover(keccak256(abi.encodePacked(hex"1901", _domain(), buyerStruct)), signature) != account);
    }
}
