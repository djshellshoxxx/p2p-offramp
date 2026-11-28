// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {BasicEscrow} from "../../src/BasicEscrow.sol";

contract NativeConstructor {
    function checkNativeAssetExcludedFromTokenAllowlist() external {
        BasicEscrow subject = new BasicEscrow(new address[](0));
        // @property EVM-NATIVE-ASSET-NOT-TOKEN
        assert(!subject.isAllowlisted(address(0)));
    }
}
